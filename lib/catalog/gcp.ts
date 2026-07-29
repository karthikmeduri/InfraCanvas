import {
  attr,
  block,
  bool,
  dnsName,
  flag,
  list,
  listOf,
  num,
  obj,
  raw,
  resource,
  str,
} from "../hcl";
import type { ProviderDefinition, VariableSpec } from "../types";
import { defineService, number, select, text, toggle } from "./helpers";

const NETWORK_VAR: VariableSpec = {
  name: "network_id",
  type: "string",
  description: "Existing VPC network id used when no network is connected in the diagram.",
};

const SUBNET_VAR: VariableSpec = {
  name: "subnetwork_id",
  type: "string",
  description: "Existing subnetwork id used when no subnetwork is connected in the diagram.",
};

export const gcp: ProviderDefinition = {
  id: "gcp",
  name: "Google Cloud",
  shortName: "GCP",
  tagline: "Design data, AI, and application platforms with the google provider.",
  accent: "#4285f4",
  source: "hashicorp/google",
  versionConstraint: "~> 6.0",
  defaultRegion: "us-central1",
  services: [
    /* ------------------------------------------------------------ Networking */
    defineService({
      id: "vpc",
      name: "VPC Network",
      short: "VPC",
      category: "Networking",
      role: "network",
      tfType: "google_compute_network",
      description: "Global software-defined network",
      docs: "https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/compute_network",
      fields: [select("routing_mode", "Routing mode", ["GLOBAL", "REGIONAL"])],
      emit: (c) => {
        c.output({
          name: `${c.name}_id`,
          value: raw(`google_compute_network.${c.name}.id`),
          description: `Id of the ${c.display} network`,
        });
        return [
          resource("google_compute_network", c.name, [
            attr("name", str(dnsName(c.display, "network", 62))),
            attr("auto_create_subnetworks", bool(false)),
            attr("routing_mode", str(c.v.routing_mode || "GLOBAL")),
            attr("delete_default_routes_on_create", bool(false)),
          ]),
        ];
      },
    }),
    defineService({
      id: "subnet",
      name: "Subnetwork",
      short: "SUB",
      category: "Networking",
      role: "subnet",
      tfType: "google_compute_subnetwork",
      description: "Regional VPC segment",
      fields: [
        text("cidr", "IP range", "10.0.1.0/24"),
        toggle("private_google_access", "Private Google access", true),
        toggle("flow_logs", "VPC flow logs", true),
      ],
      emit: (c) => [
        resource("google_compute_subnetwork", c.name, [
          attr("name", str(dnsName(c.display, "subnetwork", 62))),
          attr("ip_cidr_range", str(c.v.cidr || "10.0.1.0/24")),
          attr("region", raw("var.region")),
          attr("network", c.ref("network", "id", NETWORK_VAR)),
          attr("private_ip_google_access", flag(c.v.private_google_access, true)),
          ...(c.v.flow_logs === "false"
            ? []
            : [
                block("log_config", [], [
                  attr("aggregation_interval", str("INTERVAL_10_MIN")),
                  attr("flow_sampling", num(0.5, 0.5)),
                  attr("metadata", str("INCLUDE_ALL_METADATA")),
                ]),
              ]),
        ]),
      ],
    }),
    defineService({
      id: "cloud_nat",
      name: "Cloud NAT",
      short: "NAT",
      category: "Networking",
      role: "gateway",
      tfType: "google_compute_router_nat",
      description: "Outbound internet access for private instances",
      fields: [],
      emit: (c) => [
        resource("google_compute_router", c.name, [
          attr("name", str(dnsName(`${c.display}-router`, "router", 62))),
          attr("region", raw("var.region")),
          attr("network", c.ref("network", "id", NETWORK_VAR)),
        ]),
        resource("google_compute_router_nat", c.name, [
          attr("name", str(dnsName(c.display, "nat", 62))),
          attr("router", raw(`google_compute_router.${c.name}.name`)),
          attr("region", raw("var.region")),
          attr("nat_ip_allocate_option", str("AUTO_ONLY")),
          attr("source_subnetwork_ip_ranges_to_nat", str("ALL_SUBNETWORKS_ALL_IP_RANGES")),
          block("log_config", [], [
            attr("enable", bool(true)),
            attr("filter", str("ERRORS_ONLY")),
          ]),
        ]),
      ],
    }),
    defineService({
      id: "load_balancer",
      name: "Global HTTP(S) Load Balancer",
      short: "LB",
      category: "Networking",
      role: "loadbalancer",
      tfType: "google_compute_global_forwarding_rule",
      description: "Global application delivery with health checks",
      fields: [
        number("port", "Frontend port", "443"),
        select("protocol", "Backend protocol", ["HTTPS", "HTTP"]),
        toggle("cdn", "Enable Cloud CDN", true),
        text("health_check_path", "Health check path", "/health"),
      ],
      emit: (c) => {
        c.output({
          name: `${c.name}_ip`,
          value: raw(`google_compute_global_address.${c.name}.address`),
          description: `Anycast address for ${c.display}`,
        });
        return [
          resource("google_compute_global_address", c.name, [
            attr("name", str(dnsName(`${c.display}-ip`, "lb-ip", 62))),
          ]),
          resource("google_compute_health_check", c.name, [
            attr("name", str(dnsName(`${c.display}-hc`, "lb-health", 62))),
            attr("check_interval_sec", num(10, 10)),
            attr("timeout_sec", num(5, 5)),
            block("http_health_check", [], [
              attr("port", num(80, 80)),
              attr("request_path", str(c.v.health_check_path || "/health")),
            ]),
          ]),
          resource("google_compute_backend_service", c.name, [
            attr("name", str(dnsName(`${c.display}-backend`, "lb-backend", 62))),
            attr("protocol", str(c.v.protocol === "HTTP" ? "HTTP" : "HTTPS")),
            attr("load_balancing_scheme", str("EXTERNAL_MANAGED")),
            attr("timeout_sec", num(30, 30)),
            attr("enable_cdn", flag(c.v.cdn, true)),
            attr("health_checks", raw(`[google_compute_health_check.${c.name}.id]`)),
            block("log_config", [], [
              attr("enable", bool(true)),
              attr("sample_rate", num(1, 1)),
            ]),
          ]),
          resource("google_compute_url_map", c.name, [
            attr("name", str(dnsName(`${c.display}-urlmap`, "lb-urlmap", 62))),
            attr("default_service", raw(`google_compute_backend_service.${c.name}.id`)),
          ]),
          resource("google_compute_target_http_proxy", c.name, [
            attr("name", str(dnsName(`${c.display}-proxy`, "lb-proxy", 62))),
            attr("url_map", raw(`google_compute_url_map.${c.name}.id`)),
          ]),
          resource("google_compute_global_forwarding_rule", c.name, [
            attr("name", str(dnsName(c.display, "lb", 62))),
            attr("target", raw(`google_compute_target_http_proxy.${c.name}.id`)),
            attr("port_range", str(String(Number.parseInt(c.v.port || "80", 10) || 80))),
            attr("ip_address", raw(`google_compute_global_address.${c.name}.address`)),
            attr("load_balancing_scheme", str("EXTERNAL_MANAGED")),
          ]),
        ];
      },
    }),
    defineService({
      id: "dns_record",
      name: "Cloud DNS Record",
      short: "DNS",
      category: "Networking",
      role: "dns",
      tfType: "google_dns_record_set",
      description: "Managed zone DNS record",
      fields: [text("record_name", "Record name", "app.example.com."), select("type", "Record type", ["A", "CNAME"])],
      emit: (c) => {
        const zone = c.variable({
          name: "dns_managed_zone",
          type: "string",
          description: "Cloud DNS managed zone name that owns the generated records.",
        });
        const target = c.ref(
          "loadbalancer",
          (t) => `google_compute_global_address.${t.name}.address`,
          {
            name: "dns_record_target",
            type: "string",
            description: "Target address for the generated DNS record.",
          },
        );
        return [
          resource("google_dns_record_set", c.name, [
            attr("name", str(c.v.record_name || "app.example.com.")),
            attr("managed_zone", zone),
            attr("type", str(c.v.type === "CNAME" ? "CNAME" : "A")),
            attr("ttl", num(300, 300)),
            attr("rrdatas", listOf([target])),
          ]),
        ];
      },
    }),

    /* --------------------------------------------------------------- Compute */
    defineService({
      id: "compute",
      name: "Compute Engine Instance",
      short: "GCE",
      category: "Compute",
      role: "compute",
      tfType: "google_compute_instance",
      description: "Customizable virtual machine",
      docs: "https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/compute_instance",
      fields: [
        select("machine_type", "Machine type", [
          "e2-micro",
          "e2-small",
          "e2-standard-2",
          "e2-standard-4",
          "n2-standard-4",
          "c3-standard-4",
          "n2d-standard-8",
        ]),
        select("image", "Boot image", [
          "ubuntu-os-cloud/ubuntu-2404-lts-amd64",
          "debian-cloud/debian-12",
          "rocky-linux-cloud/rocky-linux-9",
        ]),
        number("count", "Instance count", "2"),
        number("disk_size", "Boot disk (GB)", "30"),
        select("disk_type", "Disk type", ["pd-balanced", "pd-ssd", "pd-standard"]),
      ],
      emit: (c) => {
        const instanceCount = Math.max(1, Number.parseInt(c.v.count || "1", 10) || 1);
        const multiple = instanceCount > 1;
        const suffix = multiple ? "-${count.index + 1}" : "";
        c.output({
          name: `${c.name}_internal_ips`,
          value: raw(
            multiple
              ? `google_compute_instance.${c.name}[*].network_interface[0].network_ip`
              : `[google_compute_instance.${c.name}.network_interface[0].network_ip]`,
          ),
          description: `Internal addresses for ${c.display}`,
        });
        return [
          resource("google_compute_instance", c.name, [
            ...(multiple ? [attr("count", num(instanceCount, 1))] : []),
            attr("name", raw(`"${dnsName(c.display, "instance", 55)}${suffix}"`)),
            attr("machine_type", str(c.v.machine_type || "e2-standard-2")),
            attr("zone", raw('"${var.region}-a"')),
            attr("tags", list(str("infracanvas"), str(dnsName(c.display, "instance", 40)))),
            block("boot_disk", [], [
              block("initialize_params", [], [
                attr("image", str(c.v.image || "ubuntu-os-cloud/ubuntu-2404-lts-amd64")),
                attr("size", num(c.v.disk_size, 30)),
                attr("type", str(c.v.disk_type || "pd-balanced")),
              ]),
            ]),
            block("network_interface", [], [
              attr("subnetwork", c.ref("subnet", "id", SUBNET_VAR)),
            ]),
            block("shielded_instance_config", [], [
              attr("enable_secure_boot", bool(true)),
              attr("enable_vtpm", bool(true)),
              attr("enable_integrity_monitoring", bool(true)),
            ]),
            block("service_account", [], [
              attr(
                "email",
                c.ref("identity", "email", {
                  name: "compute_service_account_email",
                  type: "string",
                  description: "Service account attached to compute instances.",
                  default: raw("null"),
                }),
              ),
              attr("scopes", list(str("cloud-platform"))),
            ]),
            attr("metadata", obj({ "enable-oslogin": str("TRUE") })),
            attr("labels", c.tags),
          ]),
        ];
      },
    }),
    defineService({
      id: "cloud_run",
      name: "Cloud Run Service",
      short: "RUN",
      category: "Compute",
      role: "serverless",
      tfType: "google_cloud_run_v2_service",
      description: "Fully managed serverless containers",
      fields: [
        text("image", "Container image", "us-docker.pkg.dev/cloudrun/container/hello"),
        select("cpu", "CPU", ["1", "2", "4", "8"]),
        select("memory", "Memory", ["512Mi", "1Gi", "2Gi", "4Gi"]),
        number("min_instances", "Minimum instances", "0"),
        number("max_instances", "Maximum instances", "10"),
        select("ingress", "Ingress", [
          "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER",
          "INGRESS_TRAFFIC_ALL",
          "INGRESS_TRAFFIC_INTERNAL_ONLY",
        ]),
      ],
      emit: (c) => {
        c.output({
          name: `${c.name}_uri`,
          value: raw(`google_cloud_run_v2_service.${c.name}.uri`),
          description: `Service URL for ${c.display}`,
        });
        return [
          resource("google_cloud_run_v2_service", c.name, [
            attr("name", str(dnsName(c.display, "service", 49))),
            attr("location", raw("var.region")),
            attr("ingress", str(c.v.ingress || "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER")),
            attr("deletion_protection", bool(true)),
            block("template", [], [
              block("scaling", [], [
                attr("min_instance_count", num(c.v.min_instances, 0)),
                attr("max_instance_count", num(c.v.max_instances, 10)),
              ]),
              block("containers", [], [
                attr("image", str(c.v.image || "us-docker.pkg.dev/cloudrun/container/hello")),
                block("resources", [], [
                  attr(
                    "limits",
                    obj({
                      cpu: str(c.v.cpu || "1"),
                      memory: str(c.v.memory || "512Mi"),
                    }),
                  ),
                ]),
              ]),
            ]),
            attr("labels", c.tags),
          ]),
        ];
      },
    }),
    defineService({
      id: "cloud_function",
      name: "Cloud Function (2nd gen)",
      short: "FN",
      category: "Compute",
      role: "serverless",
      tfType: "google_cloudfunctions2_function",
      description: "Event-driven serverless functions",
      fields: [
        select("runtime", "Runtime", ["nodejs22", "python312", "go122", "java21"]),
        text("entry_point", "Entry point", "handler"),
        select("memory", "Memory", ["256M", "512M", "1Gi"]),
        number("timeout", "Timeout (seconds)", "60"),
      ],
      emit: (c) => {
        const bucket = c.ref(
          "storage",
          (t) => `google_storage_bucket.${t.name}.name`,
          {
            name: "function_source_bucket",
            type: "string",
            description: "Bucket holding the packaged function source archive.",
          },
        );
        const object = c.variable({
          name: "function_source_object",
          type: "string",
          description: "Object name of the packaged function source archive.",
          default: str("source.zip"),
        });
        return [
          resource("google_cloudfunctions2_function", c.name, [
            attr("name", str(dnsName(c.display, "function", 62))),
            attr("location", raw("var.region")),
            block("build_config", [], [
              attr("runtime", str(c.v.runtime || "nodejs22")),
              attr("entry_point", str(c.v.entry_point || "handler")),
              block("source", [], [
                block("storage_source", [], [
                  attr("bucket", bucket),
                  attr("object", object),
                ]),
              ]),
            ]),
            block("service_config", [], [
              attr("available_memory", str(c.v.memory || "256M")),
              attr("timeout_seconds", num(c.v.timeout, 60)),
              attr("ingress_settings", str("ALLOW_INTERNAL_AND_GCLB")),
              attr("all_traffic_on_latest_revision", bool(true)),
            ]),
            attr("labels", c.tags),
          ]),
        ];
      },
    }),

    /* ------------------------------------------------------------ Containers */
    defineService({
      id: "gke",
      name: "GKE Cluster",
      short: "GKE",
      category: "Containers",
      role: "container",
      tfType: "google_container_cluster",
      description: "Managed Kubernetes with Autopilot or Standard",
      fields: [
        select("mode", "Cluster mode", ["Autopilot", "Standard"]),
        select("machine_type", "Node machine type", ["e2-standard-2", "e2-standard-4", "n2-standard-4"]),
        number("node_count", "Nodes per zone", "2"),
        select("release_channel", "Release channel", ["REGULAR", "RAPID", "STABLE"]),
      ],
      emit: (c) => {
        const autopilot = (c.v.mode || "Autopilot") === "Autopilot";
        c.output({
          name: `${c.name}_endpoint`,
          value: raw(`google_container_cluster.${c.name}.endpoint`),
          description: `Kubernetes API endpoint for ${c.display}`,
          sensitive: true,
        });
        return [
          resource("google_container_cluster", c.name, [
            attr("name", str(dnsName(c.display, "cluster", 40))),
            attr("location", raw("var.region")),
            attr("network", c.ref("network", "id", NETWORK_VAR)),
            attr("subnetwork", c.ref("subnet", "id", SUBNET_VAR)),
            attr("deletion_protection", bool(true)),
            ...(autopilot
              ? [attr("enable_autopilot", bool(true))]
              : [
                  attr("remove_default_node_pool", bool(true)),
                  attr("initial_node_count", num(1, 1)),
                ]),
            block("private_cluster_config", [], [
              attr("enable_private_nodes", bool(true)),
              attr("enable_private_endpoint", bool(false)),
              ...(autopilot ? [] : [attr("master_ipv4_cidr_block", str("172.16.0.0/28"))]),
            ]),
            block("ip_allocation_policy", [], []),
            block("release_channel", [], [
              attr("channel", str(c.v.release_channel || "REGULAR")),
            ]),
            block("workload_identity_config", [], [
              attr("workload_pool", raw('"${var.project_id}.svc.id.goog"')),
            ]),
            attr("resource_labels", c.tags),
          ]),
          ...(autopilot
            ? []
            : [
                resource("google_container_node_pool", c.name, [
                  attr("name", str(dnsName(`${c.display}-nodes`, "node-pool", 40))),
                  attr("cluster", raw(`google_container_cluster.${c.name}.id`)),
                  attr("node_count", num(c.v.node_count, 2)),
                  block("node_config", [], [
                    attr("machine_type", str(c.v.machine_type || "e2-standard-2")),
                    attr("disk_size_gb", num(50, 50)),
                    attr("oauth_scopes", list(str("https://www.googleapis.com/auth/cloud-platform"))),
                    block("shielded_instance_config", [], [
                      attr("enable_secure_boot", bool(true)),
                      attr("enable_integrity_monitoring", bool(true)),
                    ]),
                    attr("labels", c.tags),
                  ]),
                  block("management", [], [
                    attr("auto_repair", bool(true)),
                    attr("auto_upgrade", bool(true)),
                  ]),
                ]),
              ]),
        ];
      },
    }),
    defineService({
      id: "artifact_registry",
      name: "Artifact Registry",
      short: "AR",
      category: "Containers",
      role: "registry",
      tfType: "google_artifact_registry_repository",
      description: "Container and package registry",
      fields: [select("format", "Format", ["DOCKER", "MAVEN", "NPM", "PYTHON"])],
      emit: (c) => [
        resource("google_artifact_registry_repository", c.name, [
          attr("repository_id", str(dnsName(c.display, "repository", 62))),
          attr("location", raw("var.region")),
          attr("format", str(c.v.format || "DOCKER")),
          attr("description", str(`${c.display} — generated by InfraCanvas`)),
          attr("labels", c.tags),
        ]),
      ],
    }),

    /* -------------------------------------------------------------- Database */
    defineService({
      id: "cloud_sql",
      name: "Cloud SQL Instance",
      short: "SQL",
      category: "Database",
      role: "database",
      tfType: "google_sql_database_instance",
      description: "Managed PostgreSQL, MySQL, or SQL Server",
      fields: [
        select("engine", "Database engine", ["POSTGRES_16", "POSTGRES_15", "MYSQL_8_0", "SQLSERVER_2022_STANDARD"]),
        select("tier", "Machine tier", ["db-f1-micro", "db-g1-small", "db-custom-2-7680", "db-custom-4-15360"]),
        select("availability", "Availability", ["REGIONAL", "ZONAL"]),
        number("disk_size", "Disk size (GB)", "20"),
      ],
      emit: (c) => {
        c.output({
          name: `${c.name}_connection_name`,
          value: raw(`google_sql_database_instance.${c.name}.connection_name`),
          description: `Connection name for ${c.display}`,
        });
        return [
          resource("google_sql_database_instance", c.name, [
            attr("name", str(dnsName(c.display, "sql", 62))),
            attr("database_version", str(c.v.engine || "POSTGRES_16")),
            attr("region", raw("var.region")),
            attr("deletion_protection", bool(true)),
            block("settings", [], [
              attr("tier", str(c.v.tier || "db-custom-2-7680")),
              attr("availability_type", str(c.v.availability || "REGIONAL")),
              attr("disk_size", num(c.v.disk_size, 20)),
              attr("disk_autoresize", bool(true)),
              attr("disk_type", str("PD_SSD")),
              block("ip_configuration", [], [
                attr("ipv4_enabled", bool(false)),
                attr("private_network", c.ref("network", "id", NETWORK_VAR)),
                attr("ssl_mode", str("ENCRYPTED_ONLY")),
              ]),
              block("backup_configuration", [], [
                attr("enabled", bool(true)),
                attr("point_in_time_recovery_enabled", bool(true)),
                attr("start_time", str("03:00")),
              ]),
              block("insights_config", [], [attr("query_insights_enabled", bool(true))]),
              attr("user_labels", c.tags),
            ]),
          ]),
        ];
      },
    }),
    defineService({
      id: "firestore",
      name: "Firestore Database",
      short: "FS",
      category: "Database",
      role: "database",
      tfType: "google_firestore_database",
      description: "Serverless document database",
      fields: [
        select("mode", "Database mode", ["NATIVE", "DATASTORE_MODE"]),
        select("location", "Location", ["nam5", "eur3", "us-central1"]),
      ],
      emit: (c) => [
        resource("google_firestore_database", c.name, [
          attr("project", raw("var.project_id")),
          attr("name", str(dnsName(c.display, "default", 62))),
          attr("location_id", str(c.v.location || "nam5")),
          attr("type", str(`FIRESTORE_${c.v.mode || "NATIVE"}`)),
          attr("concurrency_mode", str("OPTIMISTIC")),
          attr("point_in_time_recovery_enablement", str("POINT_IN_TIME_RECOVERY_ENABLED")),
          attr("delete_protection_state", str("DELETE_PROTECTION_ENABLED")),
        ]),
      ],
    }),
    defineService({
      id: "memorystore",
      name: "Memorystore (Redis)",
      short: "CACHE",
      category: "Database",
      role: "cache",
      tfType: "google_redis_instance",
      description: "Managed in-memory cache",
      fields: [
        select("tier", "Service tier", ["STANDARD_HA", "BASIC"]),
        number("memory_size_gb", "Memory (GB)", "1"),
        select("version", "Redis version", ["REDIS_7_2", "REDIS_7_0"]),
      ],
      emit: (c) => [
        resource("google_redis_instance", c.name, [
          attr("name", str(dnsName(c.display, "cache", 40))),
          attr("tier", str(c.v.tier || "STANDARD_HA")),
          attr("memory_size_gb", num(c.v.memory_size_gb, 1)),
          attr("region", raw("var.region")),
          attr("redis_version", str(c.v.version || "REDIS_7_2")),
          attr("authorized_network", c.ref("network", "id", NETWORK_VAR)),
          attr("connect_mode", str("PRIVATE_SERVICE_ACCESS")),
          attr("auth_enabled", bool(true)),
          attr("transit_encryption_mode", str("SERVER_AUTHENTICATION")),
          attr("labels", c.tags),
        ]),
      ],
    }),
    defineService({
      id: "bigquery",
      name: "BigQuery Dataset",
      short: "BQ",
      category: "Database",
      role: "analytics",
      tfType: "google_bigquery_dataset",
      description: "Serverless analytics warehouse",
      fields: [
        select("location", "Location", ["US", "EU", "us-central1"]),
        number("table_expiration_days", "Default table expiry (days)", "0"),
      ],
      emit: (c) => {
        const expiryDays = Number.parseInt(c.v.table_expiration_days || "0", 10) || 0;
        return [
          resource("google_bigquery_dataset", c.name, [
            attr("dataset_id", str(c.name)),
            attr("friendly_name", str(c.display)),
            attr("location", str(c.v.location || "US")),
            ...(expiryDays > 0
              ? [attr("default_table_expiration_ms", num(expiryDays * 86400000, 0))]
              : []),
            attr("delete_contents_on_destroy", bool(false)),
            attr("labels", c.tags),
          ]),
        ];
      },
    }),

    /* --------------------------------------------------------------- Storage */
    defineService({
      id: "storage",
      name: "Cloud Storage Bucket",
      short: "GCS",
      category: "Storage",
      role: "storage",
      tfType: "google_storage_bucket",
      description: "Global object storage",
      docs: "https://registry.terraform.io/providers/hashicorp/google/latest/docs/resources/storage_bucket",
      fields: [
        select("class", "Storage class", ["STANDARD", "NEARLINE", "COLDLINE", "ARCHIVE"]),
        select("location", "Location", ["US", "EU", "ASIA", "us-central1"]),
        toggle("versioning", "Object versioning", true),
        number("lifecycle_days", "Delete after (days, 0 = never)", "0"),
      ],
      emit: (c) => {
        const lifecycleDays = Number.parseInt(c.v.lifecycle_days || "0", 10) || 0;
        c.output({
          name: `${c.name}_url`,
          value: raw(`google_storage_bucket.${c.name}.url`),
          description: `Bucket URL for ${c.display}`,
        });
        return [
          resource("google_storage_bucket", c.name, [
            attr("name", raw(`"\${var.project_id}-${dnsName(c.display, "bucket", 40)}"`)),
            attr("location", str(c.v.location || "US")),
            attr("storage_class", str(c.v.class || "STANDARD")),
            attr("uniform_bucket_level_access", bool(true)),
            attr("public_access_prevention", str("enforced")),
            attr("force_destroy", bool(false)),
            block("versioning", [], [attr("enabled", flag(c.v.versioning, true))]),
            ...(lifecycleDays > 0
              ? [
                  block("lifecycle_rule", [], [
                    block("action", [], [attr("type", str("Delete"))]),
                    block("condition", [], [attr("age", num(lifecycleDays, 365))]),
                  ]),
                ]
              : []),
            attr("labels", c.tags),
          ]),
        ];
      },
    }),

    /* -------------------------------------------------------------- Security */
    defineService({
      id: "firewall",
      name: "Firewall Rule",
      short: "FW",
      category: "Security",
      role: "firewall",
      tfType: "google_compute_firewall",
      description: "VPC ingress and egress filtering",
      fields: [
        number("port", "Allowed port", "443"),
        select("protocol", "Protocol", ["tcp", "udp", "icmp"]),
        text("source", "Source range", "10.0.0.0/8", "Avoid 0.0.0.0/0 unless this fronts the public internet."),
        text("target_tag", "Target tag", "infracanvas"),
      ],
      emit: (c) => [
        resource("google_compute_firewall", c.name, [
          attr("name", str(dnsName(c.display, "firewall", 62))),
          attr("network", c.ref("network", "id", NETWORK_VAR)),
          attr("direction", str("INGRESS")),
          attr("priority", num(1000, 1000)),
          attr("source_ranges", list(str(c.v.source || "10.0.0.0/8"))),
          attr("target_tags", list(str(c.v.target_tag || "infracanvas"))),
          block("allow", [], [
            attr("protocol", str(c.v.protocol || "tcp")),
            ...(c.v.protocol === "icmp"
              ? []
              : [attr("ports", list(str(String(Number.parseInt(c.v.port || "443", 10) || 443))))]),
          ]),
          block("log_config", [], [attr("metadata", str("INCLUDE_ALL_METADATA"))]),
        ]),
      ],
    }),
    defineService({
      id: "secret_manager",
      name: "Secret Manager Secret",
      short: "SEC",
      category: "Security",
      role: "secrets",
      tfType: "google_secret_manager_secret",
      description: "Versioned application secret",
      fields: [select("replication", "Replication", ["automatic", "user-managed"])],
      emit: (c) => [
        resource("google_secret_manager_secret", c.name, [
          attr("secret_id", str(dnsName(c.display, "secret", 62).replace(/-/g, "_"))),
          block("replication", [], [
            ...(c.v.replication === "user-managed"
              ? [
                  block("user_managed", [], [
                    block("replicas", [], [attr("location", raw("var.region"))]),
                  ]),
                ]
              : [block("auto", [], [])]),
          ]),
          attr("labels", c.tags),
        ]),
        // The value stays out of the repository; supply it from CI.
        resource("google_secret_manager_secret_version", c.name, [
          attr("secret", raw(`google_secret_manager_secret.${c.name}.id`)),
          attr(
            "secret_data",
            c.variable({
              name: `${c.name}_value`,
              type: "string",
              description: `Value for the ${c.display} secret. Inject from CI, never commit it.`,
              sensitive: true,
            }),
          ),
        ]),
      ],
    }),
    defineService({
      id: "service_account",
      name: "Service Account",
      short: "SA",
      category: "Security",
      role: "identity",
      tfType: "google_service_account",
      description: "Workload identity for services",
      fields: [
        select("role", "Project role", [
          "roles/logging.logWriter",
          "roles/monitoring.metricWriter",
          "roles/storage.objectViewer",
          "roles/cloudsql.client",
        ]),
      ],
      emit: (c) => [
        resource("google_service_account", c.name, [
          attr("account_id", str(dnsName(c.display, "service-account", 30))),
          attr("display_name", str(c.display)),
          attr("description", str(`${c.display} — generated by InfraCanvas`)),
        ]),
        resource("google_project_iam_member", c.name, [
          attr("project", raw("var.project_id")),
          attr("role", str(c.v.role || "roles/logging.logWriter")),
          attr("member", raw(`"serviceAccount:\${google_service_account.${c.name}.email}"`)),
        ]),
      ],
    }),

    /* ----------------------------------------------------------- Integration */
    defineService({
      id: "pubsub",
      name: "Pub/Sub Topic",
      short: "PS",
      category: "Integration",
      role: "queue",
      tfType: "google_pubsub_topic",
      description: "Global publish/subscribe messaging",
      fields: [
        number("retention_days", "Message retention (days)", "7"),
        number("ack_deadline", "Ack deadline (seconds)", "20"),
      ],
      emit: (c) => {
        const retentionDays = Number.parseInt(c.v.retention_days || "7", 10) || 7;
        return [
          resource("google_pubsub_topic", c.name, [
            attr("name", str(dnsName(c.display, "topic", 62))),
            attr("message_retention_duration", str(`${retentionDays * 86400}s`)),
            attr("labels", c.tags),
          ]),
          resource("google_pubsub_topic", `${c.name}_dead_letter`, [
            attr("name", str(dnsName(`${c.display}-dead-letter`, "dead-letter", 62))),
            attr("labels", c.tags),
          ]),
          resource("google_pubsub_subscription", c.name, [
            attr("name", str(dnsName(`${c.display}-sub`, "subscription", 62))),
            attr("topic", raw(`google_pubsub_topic.${c.name}.id`)),
            attr("ack_deadline_seconds", num(c.v.ack_deadline, 20)),
            block("dead_letter_policy", [], [
              attr("dead_letter_topic", raw(`google_pubsub_topic.${c.name}_dead_letter.id`)),
              attr("max_delivery_attempts", num(5, 5)),
            ]),
            block("retry_policy", [], [
              attr("minimum_backoff", str("10s")),
              attr("maximum_backoff", str("600s")),
            ]),
            attr("labels", c.tags),
          ]),
        ];
      },
    }),

    /* --------------------------------------------------------- Observability */
    defineService({
      id: "monitoring_alert",
      name: "Monitoring Alert Policy",
      short: "MON",
      category: "Observability",
      role: "monitoring",
      tfType: "google_monitoring_alert_policy",
      description: "Threshold alerting on Cloud Monitoring metrics",
      fields: [
        text("metric_filter", "Metric filter", 'metric.type="compute.googleapis.com/instance/cpu/utilization"'),
        number("threshold", "Threshold", "0.8"),
        select("duration", "Duration", ["60s", "300s", "600s"]),
      ],
      emit: (c) => [
        resource("google_monitoring_alert_policy", c.name, [
          attr("display_name", str(c.display)),
          attr("combiner", str("OR")),
          block("conditions", [], [
            attr("display_name", str(`${c.display} threshold`)),
            block("condition_threshold", [], [
              attr(
                "filter",
                str(
                  c.v.metric_filter ||
                    'metric.type="compute.googleapis.com/instance/cpu/utilization"',
                ),
              ),
              attr("comparison", str("COMPARISON_GT")),
              attr("threshold_value", num(c.v.threshold, 0.8)),
              attr("duration", str(c.v.duration || "300s")),
              block("aggregations", [], [
                attr("alignment_period", str("60s")),
                attr("per_series_aligner", str("ALIGN_MEAN")),
              ]),
            ]),
          ]),
          attr("user_labels", c.tags),
        ]),
      ],
    }),
  ],
};
