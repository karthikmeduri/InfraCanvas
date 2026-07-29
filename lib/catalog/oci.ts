import {
  alphaNumName,
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

const VCN_VAR: VariableSpec = {
  name: "vcn_id",
  type: "string",
  description: "Existing VCN OCID used when no VCN is connected in the diagram.",
};

const SUBNET_VAR: VariableSpec = {
  name: "subnet_id",
  type: "string",
  description: "Existing subnet OCID used when no subnet is connected in the diagram.",
};

const SUBNETS_VAR: VariableSpec = {
  name: "subnet_ids",
  type: "list(string)",
  description: "Subnet OCIDs used when the diagram does not connect subnets to a resource.",
  default: listOf([]),
};

const COMPARTMENT = raw("var.compartment_id");

/** Availability domains are needed by most compute-shaped resources. */
const availabilityDomains = block("data", ["oci_identity_availability_domains", "ads"], [
  attr("compartment_id", raw("var.tenancy_ocid")),
]);

const AD_ZERO = raw("data.oci_identity_availability_domains.ads.availability_domains[0].name");

export const oci: ProviderDefinition = {
  id: "oci",
  name: "Oracle Cloud Infrastructure",
  shortName: "OCI",
  tagline: "Model high-performance Oracle Cloud foundations with the oci provider.",
  accent: "#c74634",
  source: "oracle/oci",
  versionConstraint: "~> 6.0",
  defaultRegion: "us-ashburn-1",
  services: [
    /* ------------------------------------------------------------ Networking */
    defineService({
      id: "vcn",
      name: "Virtual Cloud Network",
      short: "VCN",
      category: "Networking",
      role: "network",
      tfType: "oci_core_vcn",
      description: "Private OCI network boundary",
      docs: "https://registry.terraform.io/providers/oracle/oci/latest/docs/resources/core_vcn",
      fields: [text("cidr", "IPv4 CIDR", "10.0.0.0/16")],
      emit: (c) => {
        c.output({
          name: `${c.name}_id`,
          value: raw(`oci_core_vcn.${c.name}.id`),
          description: `OCID of the ${c.display} VCN`,
        });
        return [
          resource("oci_core_vcn", c.name, [
            attr("compartment_id", COMPARTMENT),
            attr("display_name", str(c.display)),
            attr("cidr_blocks", list(str(c.v.cidr || "10.0.0.0/16"))),
            attr("dns_label", str(alphaNumName(c.display, "vcn", 15))),
            attr("freeform_tags", c.tags),
          ]),
        ];
      },
    }),
    defineService({
      id: "subnet",
      name: "Subnet",
      short: "SUB",
      category: "Networking",
      role: "subnet",
      tfType: "oci_core_subnet",
      description: "VCN network segment",
      fields: [
        text("cidr", "Subnet CIDR", "10.0.1.0/24"),
        toggle("private", "Private subnet", true),
      ],
      emit: (c) => [
        resource("oci_core_subnet", c.name, [
          attr("compartment_id", COMPARTMENT),
          attr("vcn_id", c.ref("network", "id", VCN_VAR)),
          attr("display_name", str(c.display)),
          attr("cidr_block", str(c.v.cidr || "10.0.1.0/24")),
          attr("dns_label", str(alphaNumName(c.display, "sub", 15))),
          attr("prohibit_public_ip_on_vnic", flag(c.v.private, true)),
          attr(
            "security_list_ids",
            c.refList("firewall", "id", {
              name: "security_list_ids",
              type: "list(string)",
              description: "Security list OCIDs applied to the subnet.",
              default: listOf([]),
            }),
          ),
          attr("freeform_tags", c.tags),
        ]),
      ],
    }),
    defineService({
      id: "internet_gateway",
      name: "Internet Gateway",
      short: "IGW",
      category: "Networking",
      role: "gateway",
      tfType: "oci_core_internet_gateway",
      description: "Public internet egress for a VCN",
      fields: [],
      emit: (c) => [
        resource("oci_core_internet_gateway", c.name, [
          attr("compartment_id", COMPARTMENT),
          attr("vcn_id", c.ref("network", "id", VCN_VAR)),
          attr("display_name", str(c.display)),
          attr("enabled", bool(true)),
          attr("freeform_tags", c.tags),
        ]),
        resource("oci_core_route_table", c.name, [
          attr("compartment_id", COMPARTMENT),
          attr("vcn_id", c.ref("network", "id", VCN_VAR)),
          attr("display_name", str(`${c.display} route table`)),
          block("route_rules", [], [
            attr("destination", str("0.0.0.0/0")),
            attr("destination_type", str("CIDR_BLOCK")),
            attr("network_entity_id", raw(`oci_core_internet_gateway.${c.name}.id`)),
          ]),
          attr("freeform_tags", c.tags),
        ]),
      ],
    }),
    defineService({
      id: "nat_gateway",
      name: "NAT Gateway",
      short: "NAT",
      category: "Networking",
      role: "gateway",
      tfType: "oci_core_nat_gateway",
      description: "Outbound-only access for private subnets",
      fields: [],
      emit: (c) => [
        resource("oci_core_nat_gateway", c.name, [
          attr("compartment_id", COMPARTMENT),
          attr("vcn_id", c.ref("network", "id", VCN_VAR)),
          attr("display_name", str(c.display)),
          attr("freeform_tags", c.tags),
        ]),
      ],
    }),
    defineService({
      id: "load_balancer",
      name: "Load Balancer",
      short: "LB",
      category: "Networking",
      role: "loadbalancer",
      tfType: "oci_load_balancer_load_balancer",
      description: "Flexible layer 7 load balancer",
      fields: [
        select("shape", "Shape", ["flexible", "10Mbps", "100Mbps", "400Mbps"]),
        number("min_bandwidth", "Minimum bandwidth (Mbps)", "10"),
        number("max_bandwidth", "Maximum bandwidth (Mbps)", "100"),
        number("port", "Listener port", "443"),
        toggle("private", "Private load balancer", false),
      ],
      emit: (c) => {
        const flexible = (c.v.shape || "flexible") === "flexible";
        c.output({
          name: `${c.name}_ip`,
          value: raw(`oci_load_balancer_load_balancer.${c.name}.ip_address_details[0].ip_address`),
          description: `Address for ${c.display}`,
        });
        return [
          resource("oci_load_balancer_load_balancer", c.name, [
            attr("compartment_id", COMPARTMENT),
            attr("display_name", str(c.display)),
            attr("shape", str(c.v.shape || "flexible")),
            attr("subnet_ids", c.refList("subnet", "id", SUBNETS_VAR)),
            attr("is_private", flag(c.v.private, false)),
            ...(flexible
              ? [
                  block("shape_details", [], [
                    attr("minimum_bandwidth_in_mbps", num(c.v.min_bandwidth, 10)),
                    attr("maximum_bandwidth_in_mbps", num(c.v.max_bandwidth, 100)),
                  ]),
                ]
              : []),
            attr("freeform_tags", c.tags),
          ]),
          resource("oci_load_balancer_backend_set", c.name, [
            attr("name", str(alphaNumName(c.display, "backendset", 32))),
            attr("load_balancer_id", raw(`oci_load_balancer_load_balancer.${c.name}.id`)),
            attr("policy", str("ROUND_ROBIN")),
            block("health_checker", [], [
              attr("protocol", str("HTTP")),
              attr("url_path", str("/health")),
              attr("port", num(80, 80)),
              attr("interval_ms", num(10000, 10000)),
            ]),
          ]),
          resource("oci_load_balancer_listener", c.name, [
            attr("load_balancer_id", raw(`oci_load_balancer_load_balancer.${c.name}.id`)),
            attr("name", str(alphaNumName(c.display, "listener", 32))),
            attr("default_backend_set_name", raw(`oci_load_balancer_backend_set.${c.name}.name`)),
            attr("port", num(c.v.port, 443)),
            attr("protocol", str("HTTP")),
          ]),
        ];
      },
    }),

    /* --------------------------------------------------------------- Compute */
    defineService({
      id: "instance",
      name: "Compute Instance",
      short: "CMP",
      category: "Compute",
      role: "compute",
      tfType: "oci_core_instance",
      description: "Flexible virtual machine",
      docs: "https://registry.terraform.io/providers/oracle/oci/latest/docs/resources/core_instance",
      fields: [
        select("shape", "Shape", [
          "VM.Standard.E5.Flex",
          "VM.Standard.E4.Flex",
          "VM.Standard.A1.Flex",
          "VM.Standard3.Flex",
        ]),
        number("ocpus", "OCPUs", "2"),
        number("memory", "Memory (GB)", "16"),
        number("count", "Instance count", "2"),
        toggle("assign_public_ip", "Assign public IP", false),
      ],
      emit: (c) => {
        c.data("oci_availability_domains", availabilityDomains);
        const image = c.variable({
          name: "instance_image_id",
          type: "string",
          description: "OCID of the platform image used for compute instances.",
        });
        const sshKey = c.variable({
          name: "ssh_public_key",
          type: "string",
          description: "SSH public key authorised on compute instances.",
        });
        const instanceCount = Math.max(1, Number.parseInt(c.v.count || "1", 10) || 1);
        const multiple = instanceCount > 1;
        const suffix = multiple ? "-${count.index + 1}" : "";
        return [
          resource("oci_core_instance", c.name, [
            ...(multiple ? [attr("count", num(instanceCount, 1))] : []),
            attr("availability_domain", AD_ZERO),
            attr("compartment_id", COMPARTMENT),
            attr("display_name", raw(`"${c.display}${suffix}"`)),
            attr("shape", str(c.v.shape || "VM.Standard.E5.Flex")),
            block("shape_config", [], [
              attr("ocpus", num(c.v.ocpus, 2)),
              attr("memory_in_gbs", num(c.v.memory, 16)),
            ]),
            block("create_vnic_details", [], [
              attr("subnet_id", c.ref("subnet", "id", SUBNET_VAR)),
              attr("assign_public_ip", flag(c.v.assign_public_ip, false)),
              attr(
                "nsg_ids",
                c.refList("firewall", "id", {
                  name: "network_security_group_ids",
                  type: "list(string)",
                  description: "Network security group OCIDs attached to instance VNICs.",
                  default: listOf([]),
                }),
              ),
            ]),
            block("source_details", [], [
              attr("source_type", str("image")),
              attr("source_id", image),
              attr("boot_volume_size_in_gbs", num(50, 50)),
            ]),
            attr("metadata", obj({ ssh_authorized_keys: sshKey })),
            block("agent_config", [], [
              attr("is_management_disabled", bool(false)),
              attr("is_monitoring_disabled", bool(false)),
            ]),
            attr("freeform_tags", c.tags),
          ]),
        ];
      },
    }),
    defineService({
      id: "functions",
      name: "OCI Functions",
      short: "FN",
      category: "Compute",
      role: "serverless",
      tfType: "oci_functions_application",
      description: "Serverless functions platform",
      fields: [
        select("memory", "Memory (MB)", ["128", "256", "512", "1024"]),
        number("timeout", "Timeout (seconds)", "30"),
      ],
      emit: (c) => {
        const image = c.variable({
          name: "function_image",
          type: "string",
          description: "Container image published to OCIR for the function.",
        });
        return [
          resource("oci_functions_application", c.name, [
            attr("compartment_id", COMPARTMENT),
            attr("display_name", str(c.display)),
            attr("subnet_ids", c.refList("subnet", "id", SUBNETS_VAR)),
            attr("freeform_tags", c.tags),
          ]),
          resource("oci_functions_function", c.name, [
            attr("application_id", raw(`oci_functions_application.${c.name}.id`)),
            attr("display_name", str(c.display)),
            attr("image", image),
            attr("memory_in_mbs", num(c.v.memory, 256)),
            attr("timeout_in_seconds", num(c.v.timeout, 30)),
            attr("freeform_tags", c.tags),
          ]),
        ];
      },
    }),

    /* ------------------------------------------------------------ Containers */
    defineService({
      id: "oke",
      name: "OKE Cluster",
      short: "OKE",
      category: "Containers",
      role: "container",
      tfType: "oci_containerengine_cluster",
      description: "Managed Kubernetes on OCI",
      fields: [
        select("version", "Kubernetes version", ["v1.33.1", "v1.32.1", "v1.31.1"]),
        select("node_shape", "Node shape", ["VM.Standard.E5.Flex", "VM.Standard.A1.Flex"]),
        number("node_count", "Node count", "3"),
        toggle("public_endpoint", "Public API endpoint", false),
      ],
      emit: (c) => {
        c.data("oci_availability_domains", availabilityDomains);
        const image = c.variable({
          name: "instance_image_id",
          type: "string",
          description: "OCID of the platform image used for compute instances.",
        });
        c.output({
          name: `${c.name}_id`,
          value: raw(`oci_containerengine_cluster.${c.name}.id`),
          description: `OCID of ${c.display}`,
        });
        return [
          resource("oci_containerengine_cluster", c.name, [
            attr("compartment_id", COMPARTMENT),
            attr("kubernetes_version", str(c.v.version || "v1.33.1")),
            attr("name", str(c.display)),
            attr("vcn_id", c.ref("network", "id", VCN_VAR)),
            attr("type", str("ENHANCED_CLUSTER")),
            block("endpoint_config", [], [
              attr("is_public_ip_enabled", flag(c.v.public_endpoint, false)),
              attr("subnet_id", c.ref("subnet", "id", SUBNET_VAR)),
            ]),
            block("options", [], [
              attr("service_lb_subnet_ids", c.refList("subnet", "id", SUBNETS_VAR)),
              block("kubernetes_network_config", [], [
                attr("pods_cidr", str("10.244.0.0/16")),
                attr("services_cidr", str("10.96.0.0/16")),
              ]),
              block("add_ons", [], [
                attr("is_kubernetes_dashboard_enabled", bool(false)),
                attr("is_tiller_enabled", bool(false)),
              ]),
            ]),
            attr("freeform_tags", c.tags),
          ]),
          resource("oci_containerengine_node_pool", c.name, [
            attr("cluster_id", raw(`oci_containerengine_cluster.${c.name}.id`)),
            attr("compartment_id", COMPARTMENT),
            attr("kubernetes_version", str(c.v.version || "v1.33.1")),
            attr("name", str(`${c.display} nodes`)),
            attr("node_shape", str(c.v.node_shape || "VM.Standard.E5.Flex")),
            block("node_shape_config", [], [
              attr("ocpus", num(2, 2)),
              attr("memory_in_gbs", num(16, 16)),
            ]),
            block("node_config_details", [], [
              attr("size", num(c.v.node_count, 3)),
              block("placement_configs", [], [
                attr("availability_domain", AD_ZERO),
                attr("subnet_id", c.ref("subnet", "id", SUBNET_VAR)),
              ]),
            ]),
            block("node_source_details", [], [
              attr("source_type", str("IMAGE")),
              attr("image_id", image),
            ]),
            attr("freeform_tags", c.tags),
          ]),
        ];
      },
    }),
    defineService({
      id: "container_registry",
      name: "Container Registry",
      short: "OCIR",
      category: "Containers",
      role: "registry",
      tfType: "oci_artifacts_container_repository",
      description: "Private container image repository",
      fields: [toggle("immutable", "Immutable tags", true)],
      emit: (c) => [
        resource("oci_artifacts_container_repository", c.name, [
          attr("compartment_id", COMPARTMENT),
          attr("display_name", str(dnsName(c.display, "repository", 62))),
          attr("is_public", bool(false)),
          attr("is_immutable", flag(c.v.immutable, true)),
        ]),
      ],
    }),

    /* -------------------------------------------------------------- Database */
    defineService({
      id: "autonomous_db",
      name: "Autonomous Database",
      short: "ADB",
      category: "Database",
      role: "database",
      tfType: "oci_database_autonomous_database",
      description: "Self-managing Oracle Database",
      fields: [
        select("workload", "Workload type", ["OLTP", "DW", "AJD", "APEX"]),
        number("ecpus", "ECPU count", "4"),
        number("storage", "Storage (TB)", "1"),
        toggle("auto_scaling", "Auto scaling", true),
      ],
      emit: (c) => {
        const password = c.variable({
          name: "database_password",
          type: "string",
          description: "Administrator password. Supply from a secrets manager, never in source control.",
          sensitive: true,
          validation: {
            condition:
              "length(var.database_password) >= 12 && length(var.database_password) <= 30",
            errorMessage: "Autonomous Database passwords must be 12-30 characters.",
          },
        });
        c.output({
          name: `${c.name}_connection_strings`,
          value: raw(`oci_database_autonomous_database.${c.name}.connection_strings`),
          description: `Connection strings for ${c.display}`,
          sensitive: true,
        });
        return [
          resource("oci_database_autonomous_database", c.name, [
            attr("compartment_id", COMPARTMENT),
            attr("display_name", str(c.display)),
            attr("db_name", str(alphaNumName(c.display, "adb", 14).toUpperCase())),
            attr("admin_password", password),
            attr("db_workload", str(c.v.workload || "OLTP")),
            attr("compute_model", str("ECPU")),
            attr("compute_count", num(c.v.ecpus, 4)),
            attr("data_storage_size_in_tbs", num(c.v.storage, 1)),
            attr("is_auto_scaling_enabled", flag(c.v.auto_scaling, true)),
            attr("is_mtls_connection_required", bool(true)),
            attr("subnet_id", c.ref("subnet", "id", SUBNET_VAR)),
            attr("freeform_tags", c.tags),
          ]),
        ];
      },
    }),
    defineService({
      id: "mysql",
      name: "MySQL HeatWave",
      short: "SQL",
      category: "Database",
      role: "database",
      tfType: "oci_mysql_mysql_db_system",
      description: "Managed MySQL with analytics acceleration",
      fields: [
        select("shape", "Shape", [
          "MySQL.VM.Standard.E4.1.8GB",
          "MySQL.VM.Standard.E4.2.32GB",
          "MySQL.VM.Standard.E4.4.64GB",
        ]),
        number("storage", "Storage (GB)", "50"),
        toggle("high_availability", "High availability", true),
      ],
      emit: (c) => {
        c.data("oci_availability_domains", availabilityDomains);
        const username = c.variable({
          name: "database_username",
          type: "string",
          description: "Administrator username for managed databases.",
          default: str("mysqladmin"),
          sensitive: true,
        });
        const password = c.variable({
          name: "database_password",
          type: "string",
          description: "Administrator password. Supply from a secrets manager, never in source control.",
          sensitive: true,
        });
        return [
          resource("oci_mysql_mysql_db_system", c.name, [
            attr("availability_domain", AD_ZERO),
            attr("compartment_id", COMPARTMENT),
            attr("display_name", str(c.display)),
            attr("shape_name", str(c.v.shape || "MySQL.VM.Standard.E4.2.32GB")),
            attr("subnet_id", c.ref("subnet", "id", SUBNET_VAR)),
            attr("admin_username", username),
            attr("admin_password", password),
            attr("data_storage_size_in_gb", num(c.v.storage, 50)),
            attr("is_highly_available", flag(c.v.high_availability, true)),
            block("backup_policy", [], [
              attr("is_enabled", bool(true)),
              attr("retention_in_days", num(7, 7)),
            ]),
            attr("freeform_tags", c.tags),
          ]),
        ];
      },
    }),

    /* --------------------------------------------------------------- Storage */
    defineService({
      id: "object_storage",
      name: "Object Storage Bucket",
      short: "OBJ",
      category: "Storage",
      role: "storage",
      tfType: "oci_objectstorage_bucket",
      description: "Regional durable object storage",
      fields: [
        select("tier", "Storage tier", ["Standard", "Archive"]),
        select("versioning", "Versioning", ["Enabled", "Disabled"]),
      ],
      emit: (c) => {
        c.data(
          "oci_objectstorage_namespace",
          block("data", ["oci_objectstorage_namespace", "main"], [
            attr("compartment_id", COMPARTMENT),
          ]),
        );
        c.output({
          name: `${c.name}_name`,
          value: raw(`oci_objectstorage_bucket.${c.name}.name`),
          description: `Bucket name for ${c.display}`,
        });
        return [
          resource("oci_objectstorage_bucket", c.name, [
            attr("compartment_id", COMPARTMENT),
            attr("namespace", raw("data.oci_objectstorage_namespace.main.namespace")),
            attr("name", str(dnsName(c.display, "bucket", 62))),
            attr("storage_tier", str(c.v.tier || "Standard")),
            attr("versioning", str(c.v.versioning || "Enabled")),
            attr("access_type", str("NoPublicAccess")),
            attr("object_events_enabled", bool(true)),
            attr("freeform_tags", c.tags),
          ]),
        ];
      },
    }),
    defineService({
      id: "file_storage",
      name: "File Storage",
      short: "FSS",
      category: "Storage",
      role: "storage",
      tfType: "oci_file_storage_file_system",
      description: "Managed NFS shared file system",
      fields: [],
      emit: (c) => {
        c.data("oci_availability_domains", availabilityDomains);
        return [
          resource("oci_file_storage_file_system", c.name, [
            attr("availability_domain", AD_ZERO),
            attr("compartment_id", COMPARTMENT),
            attr("display_name", str(c.display)),
            attr("freeform_tags", c.tags),
          ]),
          resource("oci_file_storage_mount_target", c.name, [
            attr("availability_domain", AD_ZERO),
            attr("compartment_id", COMPARTMENT),
            attr("subnet_id", c.ref("subnet", "id", SUBNET_VAR)),
            attr("display_name", str(`${c.display} mount target`)),
            attr("freeform_tags", c.tags),
          ]),
        ];
      },
    }),

    /* -------------------------------------------------------------- Security */
    defineService({
      id: "security_list",
      name: "Security List",
      short: "SEC",
      category: "Security",
      role: "firewall",
      tfType: "oci_core_security_list",
      description: "Subnet-level stateful traffic rules",
      fields: [
        number("port", "Ingress port", "443"),
        text("source", "Source CIDR", "10.0.0.0/16", "Avoid 0.0.0.0/0 unless this fronts the public internet."),
      ],
      emit: (c) => {
        const port = Number.parseInt(c.v.port || "443", 10) || 443;
        return [
          resource("oci_core_security_list", c.name, [
            attr("compartment_id", COMPARTMENT),
            attr("vcn_id", c.ref("network", "id", VCN_VAR)),
            attr("display_name", str(c.display)),
            block("ingress_security_rules", [], [
              attr("protocol", str("6")),
              attr("source", str(c.v.source || "10.0.0.0/16")),
              attr("stateless", bool(false)),
              block("tcp_options", [], [
                attr("min", num(port, 443)),
                attr("max", num(port, 443)),
              ]),
            ]),
            block("egress_security_rules", [], [
              attr("protocol", str("all")),
              attr("destination", str("0.0.0.0/0")),
              attr("stateless", bool(false)),
            ]),
            attr("freeform_tags", c.tags),
          ]),
        ];
      },
    }),
    defineService({
      id: "nsg",
      name: "Network Security Group",
      short: "NSG",
      category: "Security",
      role: "firewall",
      tfType: "oci_core_network_security_group",
      description: "VNIC-level firewall rules",
      fields: [
        number("port", "Ingress port", "443"),
        text("source", "Source CIDR", "10.0.0.0/16"),
      ],
      emit: (c) => {
        const port = Number.parseInt(c.v.port || "443", 10) || 443;
        return [
          resource("oci_core_network_security_group", c.name, [
            attr("compartment_id", COMPARTMENT),
            attr("vcn_id", c.ref("network", "id", VCN_VAR)),
            attr("display_name", str(c.display)),
            attr("freeform_tags", c.tags),
          ]),
          resource("oci_core_network_security_group_security_rule", c.name, [
            attr("network_security_group_id", raw(`oci_core_network_security_group.${c.name}.id`)),
            attr("direction", str("INGRESS")),
            attr("protocol", str("6")),
            attr("source", str(c.v.source || "10.0.0.0/16")),
            attr("source_type", str("CIDR_BLOCK")),
            block("tcp_options", [], [
              block("destination_port_range", [], [
                attr("min", num(port, 443)),
                attr("max", num(port, 443)),
              ]),
            ]),
          ]),
        ];
      },
    }),
    defineService({
      id: "vault",
      name: "Vault & Key",
      short: "KMS",
      category: "Security",
      role: "secrets",
      tfType: "oci_kms_vault",
      description: "Managed keys and secrets",
      fields: [
        select("vault_type", "Vault type", ["DEFAULT", "VIRTUAL_PRIVATE"]),
        select("key_shape", "Key length (bits)", ["256", "128"]),
      ],
      emit: (c) => [
        resource("oci_kms_vault", c.name, [
          attr("compartment_id", COMPARTMENT),
          attr("display_name", str(c.display)),
          attr("vault_type", str(c.v.vault_type || "DEFAULT")),
          attr("freeform_tags", c.tags),
        ]),
        resource("oci_kms_key", c.name, [
          attr("compartment_id", COMPARTMENT),
          attr("display_name", str(`${c.display} key`)),
          attr("management_endpoint", raw(`oci_kms_vault.${c.name}.management_endpoint`)),
          block("key_shape", [], [
            attr("algorithm", str("AES")),
            attr("length", num(Number(c.v.key_shape || 256) / 8, 32)),
          ]),
          attr("protection_mode", str("HSM")),
          attr("freeform_tags", c.tags),
        ]),
      ],
    }),

    /* ----------------------------------------------------------- Integration */
    defineService({
      id: "streaming",
      name: "Streaming",
      short: "STR",
      category: "Integration",
      role: "queue",
      tfType: "oci_streaming_stream",
      description: "Kafka-compatible event streaming",
      fields: [
        number("partitions", "Partitions", "1"),
        number("retention_hours", "Retention (hours)", "24"),
      ],
      emit: (c) => [
        resource("oci_streaming_stream", c.name, [
          attr("compartment_id", COMPARTMENT),
          attr("name", str(dnsName(c.display, "stream", 62))),
          attr("partitions", num(c.v.partitions, 1)),
          attr("retention_in_hours", num(c.v.retention_hours, 24)),
          attr("freeform_tags", c.tags),
        ]),
      ],
    }),

    /* --------------------------------------------------------- Observability */
    defineService({
      id: "monitoring_alarm",
      name: "Monitoring Alarm",
      short: "MON",
      category: "Observability",
      role: "monitoring",
      tfType: "oci_monitoring_alarm",
      description: "Metric threshold alerting",
      fields: [
        text("query", "Metric query", "CpuUtilization[1m].mean() > 80"),
        select("severity", "Severity", ["CRITICAL", "WARNING", "INFO"]),
      ],
      emit: (c) => {
        const topic = c.variable({
          name: "notification_topic_id",
          type: "string",
          description: "OCID of the notification topic alarms publish to.",
        });
        return [
          resource("oci_monitoring_alarm", c.name, [
            attr("compartment_id", COMPARTMENT),
            attr("display_name", str(c.display)),
            attr("destinations", listOf([topic])),
            attr("is_enabled", bool(true)),
            attr("metric_compartment_id", COMPARTMENT),
            attr("namespace", str("oci_computeagent")),
            attr("query", str(c.v.query || "CpuUtilization[1m].mean() > 80")),
            attr("severity", str(c.v.severity || "CRITICAL")),
            attr("pending_duration", str("PT5M")),
            attr("freeform_tags", c.tags),
          ]),
        ];
      },
    }),
  ],
};
