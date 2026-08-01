import type { ProviderDefinition, ProviderId, ServiceDefinition } from "../types";
import { aws } from "./aws";
import { azure } from "./azure";
import { gcp } from "./gcp";
import { oci } from "./oci";

export const providers: ProviderDefinition[] = [aws, azure, gcp, oci];

export const providerById = (id: ProviderId): ProviderDefinition =>
  providers.find((provider) => provider.id === id) ?? aws;

export const serviceById = (
  provider: ProviderDefinition,
  serviceId: string,
): ServiceDefinition | undefined =>
  provider.services.find((service) => service.id === serviceId);

/** Category display order in the library sidebar. */
export const CATEGORY_ORDER = [
  "Networking",
  "Compute",
  "Containers",
  "Database",
  "Storage",
  "Security",
  "Integration",
  "Observability",
];

export type SampleArchitectureNode = {
  serviceId: string;
  x: number;
  y: number;
  values?: Record<string, string>;
};

/** Starter architectures loaded when a provider is chosen. */
export const SAMPLE_ARCHITECTURES: Record<ProviderId, SampleArchitectureNode[]> = {
  aws: [
    { serviceId: "route53", x: 48, y: 96, values: { name: "public-dns", record_name: "app.example.com" } },
    { serviceId: "cloudfront", x: 288, y: 96, values: { name: "global-edge", price_class: "PriceClass_100" } },
    { serviceId: "waf", x: 528, y: 96, values: { name: "edge-waf", scope: "REGIONAL", rate_limit: "1000" } },
    { serviceId: "vpc", x: 528, y: 690, values: { name: "production-vpc", cidr: "10.20.0.0/16" } },
    { serviceId: "internet_gateway", x: 768, y: 300, values: { name: "public-internet" } },
    { serviceId: "subnet", x: 1008, y: 168, values: { name: "public-a", cidr: "10.20.0.0/24", availability_zone: "a", visibility: "public" } },
    { serviceId: "subnet", x: 1008, y: 408, values: { name: "public-b", cidr: "10.20.1.0/24", availability_zone: "b", visibility: "public" } },
    { serviceId: "nat_gateway", x: 1248, y: 168, values: { name: "nat-a", connectivity_type: "public" } },
    { serviceId: "nat_gateway", x: 1248, y: 408, values: { name: "nat-b", connectivity_type: "public" } },
    { serviceId: "security_group", x: 1008, y: 648, values: { name: "alb-security", ingress_port: "443", protocol: "tcp", source_cidr: "0.0.0.0/0" } },
    { serviceId: "alb", x: 1272, y: 648, values: { name: "public-application-lb", scheme: "internet-facing", protocol: "HTTPS", port: "443" } },
    { serviceId: "target_group", x: 1512, y: 648, values: { name: "web-targets", target_type: "instance", protocol: "HTTP", port: "8080", health_check_path: "/health" } },
    { serviceId: "subnet", x: 1512, y: 168, values: { name: "application-a", cidr: "10.20.10.0/24", availability_zone: "a", visibility: "private" } },
    { serviceId: "subnet", x: 1512, y: 408, values: { name: "application-b", cidr: "10.20.11.0/24", availability_zone: "b", visibility: "private" } },
    { serviceId: "security_group", x: 1752, y: 648, values: { name: "application-security", ingress_port: "8080", protocol: "tcp", source_cidr: "10.20.0.0/16" } },
    { serviceId: "ec2", x: 1776, y: 168, values: { name: "web-fleet", instance_type: "m7i-flex.large", count: "2", root_volume_size: "40" } },
    { serviceId: "asg", x: 1776, y: 408, values: { name: "web-autoscaling", instance_type: "m7i-flex.large", min_size: "2", max_size: "6" } },
    { serviceId: "ecr", x: 2016, y: 168, values: { name: "application-images", mutability: "IMMUTABLE", scan_on_push: "true" } },
    { serviceId: "eks", x: 2016, y: 408, values: { name: "private-eks", version: "1.36", node_type: "m7i-flex.large", desired_nodes: "2", max_nodes: "6", public_endpoint: "false" } },
    { serviceId: "ecs", x: 2256, y: 168, values: { name: "async-workers", launch_type: "FARGATE", desired_count: "2" } },
    { serviceId: "lambda", x: 2256, y: 408, values: { name: "event-processor", runtime: "nodejs22.x", memory: "512" } },
    { serviceId: "api_gateway", x: 2016, y: 648, values: { name: "service-api", protocol: "HTTP", stage: "prod" } },
    { serviceId: "subnet", x: 1512, y: 936, values: { name: "data-a", cidr: "10.20.20.0/24", availability_zone: "a", visibility: "private" } },
    { serviceId: "subnet", x: 1512, y: 1176, values: { name: "data-b", cidr: "10.20.21.0/24", availability_zone: "b", visibility: "private" } },
    { serviceId: "security_group", x: 1752, y: 1056, values: { name: "data-security", ingress_port: "5432", protocol: "tcp", source_cidr: "10.20.10.0/23" } },
    { serviceId: "rds", x: 2016, y: 936, values: { name: "orders-postgres", engine: "postgres", engine_version: "16.4", instance_class: "db.m7g.large", storage: "100", multi_az: "true", backup_retention: "14" } },
    { serviceId: "elasticache", x: 2016, y: 1176, values: { name: "session-cache", engine: "redis", node_type: "cache.r7g.large", replicas: "2" } },
    { serviceId: "dynamodb", x: 2256, y: 936, values: { name: "idempotency-table", billing_mode: "PAY_PER_REQUEST", hash_key: "request_id", stream: "true" } },
    { serviceId: "s3", x: 2256, y: 1176, values: { name: "private-artifacts", versioning: "Enabled", encryption: "aws:kms", public_access: "blocked" } },
    { serviceId: "efs", x: 2496, y: 1176, values: { name: "shared-content", performance_mode: "generalPurpose", throughput_mode: "elastic" } },
    { serviceId: "kms", x: 2496, y: 696, values: { name: "platform-key", rotation_days: "365", deletion_window: "30" } },
    { serviceId: "secrets_manager", x: 2736, y: 696, values: { name: "application-secrets", recovery_days: "30" } },
    { serviceId: "iam_role", x: 2496, y: 456, values: { name: "application-role", principal: "ec2.amazonaws.com", managed_policy: "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy" } },
    { serviceId: "sqs", x: 2496, y: 936, values: { name: "work-queue", fifo: "false", visibility_timeout: "60" } },
    { serviceId: "sns", x: 2736, y: 936, values: { name: "operations-topic", fifo: "false" } },
    { serviceId: "cloudwatch_alarm", x: 2736, y: 1176, values: { name: "platform-health", metric: "CPUUtilization", threshold: "75", evaluation_periods: "2" } },
  ],
  azure: [
    { serviceId: "front_door", x: 48, y: 96, values: { name: "global-edge", sku: "Premium_AzureFrontDoor" } },
    { serviceId: "public_ip", x: 48, y: 336, values: { name: "gateway-public-ip", sku: "Standard" } },
    { serviceId: "vnet", x: 288, y: 696, values: { name: "production-vnet", address_space: "10.30.0.0/16" } },
    { serviceId: "subnet", x: 528, y: 168, values: { name: "edge-subnet", prefix: "10.30.0.0/24", service_endpoints: "Microsoft.KeyVault" } },
    { serviceId: "nsg", x: 528, y: 408, values: { name: "edge-nsg", port: "443", source: "Internet" } },
    { serviceId: "app_gateway", x: 768, y: 168, values: { name: "waf-application-gateway", sku: "WAF_v2", capacity: "2", backend_port: "443" } },
    { serviceId: "subnet", x: 1008, y: 168, values: { name: "application-subnet", prefix: "10.30.10.0/24", service_endpoints: "Microsoft.Storage" } },
    { serviceId: "nsg", x: 1008, y: 408, values: { name: "application-nsg", port: "443", source: "10.30.0.0/24" } },
    { serviceId: "app_service", x: 1272, y: 96, values: { name: "customer-api", sku: "P1v3", runtime: "node", always_on: "true" } },
    { serviceId: "vm", x: 1272, y: 336, values: { name: "operations-workers", size: "Standard_D2s_v5", count: "2", os_disk_size: "128" } },
    { serviceId: "acr", x: 1272, y: 576, values: { name: "production-registry", sku: "Premium" } },
    { serviceId: "aks", x: 1512, y: 96, values: { name: "private-aks", version: "1.33", vm_size: "Standard_D4s_v5", node_count: "3", private_cluster: "true" } },
    { serviceId: "functions", x: 1512, y: 336, values: { name: "event-processor", runtime: "node", plan: "Premium" } },
    { serviceId: "subnet", x: 1752, y: 168, values: { name: "data-subnet", prefix: "10.30.20.0/24", service_endpoints: "Microsoft.Sql" } },
    { serviceId: "nsg", x: 1752, y: 408, values: { name: "data-nsg", port: "5432", source: "10.30.10.0/24" } },
    { serviceId: "postgres", x: 2016, y: 96, values: { name: "orders-postgres", sku: "GP_Standard_D2s_v3", version: "16", storage_mb: "131072", high_availability: "true" } },
    { serviceId: "sql", x: 2016, y: 336, values: { name: "reporting-sql", sku: "GP_Gen5_2", max_size_gb: "128", zone_redundant: "true" } },
    { serviceId: "cosmos", x: 2256, y: 96, values: { name: "session-cosmos", api: "NoSQL", consistency: "Session", free_tier: "false" } },
    { serviceId: "redis", x: 2256, y: 336, values: { name: "application-cache", sku: "Premium", capacity: "2" } },
    { serviceId: "storage_account", x: 2016, y: 576, values: { name: "private-artifacts", tier: "Hot", replication: "ZRS", versioning: "true" } },
    { serviceId: "key_vault", x: 2256, y: 576, values: { name: "platform-vault", sku: "premium", retention_days: "90" } },
    { serviceId: "servicebus", x: 2496, y: 96, values: { name: "application-events", sku: "Premium", max_delivery_count: "10" } },
    { serviceId: "log_analytics", x: 2736, y: 336, values: { name: "central-observability", sku: "PerGB2018", retention_days: "90" } },
  ],
  gcp: [
    { serviceId: "dns_record", x: 48, y: 96, values: { name: "public-dns", record_name: "app.example.com.", type: "A" } },
    { serviceId: "vpc", x: 288, y: 696, values: { name: "production-vpc", routing_mode: "GLOBAL" } },
    { serviceId: "subnet", x: 528, y: 168, values: { name: "edge-subnet", cidr: "10.40.0.0/24", private_google_access: "true", flow_logs: "true" } },
    { serviceId: "firewall", x: 528, y: 408, values: { name: "https-ingress", port: "443", protocol: "tcp", source: "0.0.0.0/0", target_tag: "load-balancer" } },
    { serviceId: "load_balancer", x: 768, y: 168, values: { name: "global-https-lb", port: "443", protocol: "HTTPS", cdn: "true", health_check_path: "/health" } },
    { serviceId: "cloud_nat", x: 768, y: 408, values: { name: "private-egress" } },
    { serviceId: "subnet", x: 1008, y: 168, values: { name: "application-subnet", cidr: "10.40.10.0/24", private_google_access: "true", flow_logs: "true" } },
    { serviceId: "firewall", x: 1008, y: 408, values: { name: "application-ingress", port: "443", protocol: "tcp", source: "10.40.0.0/24", target_tag: "application" } },
    { serviceId: "artifact_registry", x: 1248, y: 576, values: { name: "application-images", format: "DOCKER" } },
    { serviceId: "compute", x: 1272, y: 96, values: { name: "web-fleet", machine_type: "n2-standard-4", count: "2", disk_size: "100", disk_type: "pd-ssd" } },
    { serviceId: "gke", x: 1512, y: 96, values: { name: "private-gke", mode: "Standard", machine_type: "e2-standard-4", node_count: "3", release_channel: "REGULAR" } },
    { serviceId: "cloud_run", x: 1272, y: 336, values: { name: "customer-api", cpu: "2", memory: "1Gi", min_instances: "2", max_instances: "20", ingress: "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER" } },
    { serviceId: "cloud_function", x: 1512, y: 336, values: { name: "event-processor", runtime: "nodejs22", memory: "512M", timeout: "120" } },
    { serviceId: "subnet", x: 1752, y: 168, values: { name: "data-subnet", cidr: "10.40.20.0/24", private_google_access: "true", flow_logs: "true" } },
    { serviceId: "firewall", x: 1752, y: 408, values: { name: "data-ingress", port: "5432", protocol: "tcp", source: "10.40.10.0/24", target_tag: "data" } },
    { serviceId: "cloud_sql", x: 2016, y: 96, values: { name: "orders-postgres", engine: "POSTGRES_16", tier: "db-custom-2-7680", availability: "REGIONAL", disk_size: "100" } },
    { serviceId: "firestore", x: 2016, y: 336, values: { name: "session-documents", mode: "NATIVE", location: "nam5" } },
    { serviceId: "memorystore", x: 2256, y: 96, values: { name: "application-cache", tier: "STANDARD_HA", memory_size_gb: "4", version: "REDIS_7_2" } },
    { serviceId: "bigquery", x: 2256, y: 336, values: { name: "analytics-warehouse", location: "US", table_expiration_days: "90" } },
    { serviceId: "storage", x: 2016, y: 576, values: { name: "private-artifacts", class: "STANDARD", location: "US", versioning: "true", lifecycle_days: "90" } },
    { serviceId: "secret_manager", x: 2256, y: 576, values: { name: "application-secrets", replication: "automatic" } },
    { serviceId: "service_account", x: 2496, y: 576, values: { name: "workload-identity", role: "roles/cloudsql.client" } },
    { serviceId: "pubsub", x: 2496, y: 96, values: { name: "application-events", retention_days: "14", ack_deadline: "60" } },
    { serviceId: "monitoring_alert", x: 2736, y: 336, values: { name: "platform-health", threshold: "0.75", duration: "300s" } },
  ],
  oci: [
    { serviceId: "internet_gateway", x: 48, y: 96, values: { name: "public-internet" } },
    { serviceId: "vcn", x: 288, y: 696, values: { name: "production-vcn", cidr: "10.50.0.0/16" } },
    { serviceId: "subnet", x: 528, y: 168, values: { name: "public-edge-subnet", cidr: "10.50.0.0/24", private: "false" } },
    { serviceId: "security_list", x: 528, y: 408, values: { name: "edge-security-list", port: "443", source: "0.0.0.0/0" } },
    { serviceId: "nsg", x: 768, y: 408, values: { name: "load-balancer-nsg", port: "443", source: "0.0.0.0/0" } },
    { serviceId: "load_balancer", x: 768, y: 168, values: { name: "public-flexible-lb", shape: "flexible", min_bandwidth: "10", max_bandwidth: "100", port: "443", private: "false" } },
    { serviceId: "nat_gateway", x: 1008, y: 576, values: { name: "private-egress" } },
    { serviceId: "subnet", x: 1008, y: 168, values: { name: "private-application-subnet", cidr: "10.50.10.0/24", private: "true" } },
    { serviceId: "nsg", x: 1008, y: 408, values: { name: "application-nsg", port: "443", source: "10.50.0.0/24" } },
    { serviceId: "container_registry", x: 1272, y: 576, values: { name: "application-images", immutable: "true" } },
    { serviceId: "instance", x: 1272, y: 96, values: { name: "web-fleet", shape: "VM.Standard.E5.Flex", ocpus: "2", memory: "16", count: "2", assign_public_ip: "false" } },
    { serviceId: "oke", x: 1512, y: 96, values: { name: "private-oke", version: "v1.33.1", node_shape: "VM.Standard.E5.Flex", node_count: "3", public_endpoint: "false" } },
    { serviceId: "functions", x: 1512, y: 336, values: { name: "event-processor", memory: "512", timeout: "120" } },
    { serviceId: "subnet", x: 1752, y: 168, values: { name: "private-data-subnet", cidr: "10.50.20.0/24", private: "true" } },
    { serviceId: "nsg", x: 1752, y: 408, values: { name: "data-nsg", port: "3306", source: "10.50.10.0/24" } },
    { serviceId: "autonomous_db", x: 2016, y: 96, values: { name: "orders-autonomous-db", workload: "OLTP", ecpus: "4", storage: "1", auto_scaling: "true" } },
    { serviceId: "mysql", x: 2016, y: 336, values: { name: "application-mysql", shape: "MySQL.VM.Standard.E4.2.32GB", storage: "100", high_availability: "true" } },
    { serviceId: "object_storage", x: 2256, y: 96, values: { name: "private-artifacts", tier: "Standard", versioning: "Enabled" } },
    { serviceId: "file_storage", x: 2256, y: 336, values: { name: "shared-content" } },
    { serviceId: "vault", x: 2256, y: 576, values: { name: "platform-vault", vault_type: "VIRTUAL_PRIVATE", key_shape: "256" } },
    { serviceId: "streaming", x: 2496, y: 96, values: { name: "application-events", partitions: "3", retention_hours: "168" } },
    { serviceId: "monitoring_alarm", x: 2736, y: 336, values: { name: "platform-health", severity: "CRITICAL" } },
  ],
};

export const SAMPLE_EDGES: Record<ProviderId, [number, number][]> = {
  aws: [
    [0, 1], [1, 10], [2, 10],
    [3, 4], [3, 5], [3, 6], [3, 9], [3, 12], [3, 13], [3, 14], [3, 22], [3, 23], [3, 24],
    [4, 5], [4, 6],
    [5, 7], [6, 8], [7, 12], [7, 22], [8, 13], [8, 23],
    [5, 10], [6, 10], [9, 10], [10, 11], [3, 11],
    [11, 15], [11, 16],
    [12, 15], [13, 15], [12, 16], [13, 16], [14, 15], [14, 16],
    [12, 18], [13, 18], [14, 18], [17, 18],
    [12, 19], [13, 19], [14, 19], [17, 19],
    [20, 21], [20, 27], [20, 31], [20, 33],
    [22, 25], [23, 25], [24, 25],
    [22, 26], [23, 26], [24, 26],
    [27, 28], [29, 18], [29, 19], [14, 29],
    [30, 28], [30, 31], [31, 25], [32, 15], [32, 18],
    [33, 34], [34, 35],
  ],
  azure: [
    [0, 5], [1, 5], [2, 3], [2, 6], [2, 13], [3, 5], [4, 5],
    [5, 8], [5, 9], [5, 11], [6, 8], [6, 9], [6, 11], [6, 12],
    [7, 8], [7, 9], [7, 11], [7, 12], [10, 8], [10, 11],
    [8, 15], [8, 18], [8, 19], [8, 20], [8, 21], [9, 15],
    [11, 15], [11, 16], [11, 17], [11, 18], [11, 20],
    [12, 19], [12, 20], [13, 15], [13, 16], [13, 17], [13, 18],
    [14, 15], [14, 16], [14, 17], [14, 18], [21, 12],
    [15, 22], [16, 22], [17, 22], [18, 22], [21, 22],
  ],
  gcp: [
    [0, 4], [1, 2], [1, 6], [1, 13], [2, 4], [2, 5], [3, 4],
    [4, 9], [4, 10], [4, 11], [5, 6], [6, 9], [6, 10], [6, 11], [6, 12],
    [7, 9], [7, 10], [7, 11], [7, 12], [8, 10], [8, 11],
    [9, 15], [9, 17], [9, 19], [9, 20], [10, 15], [10, 16], [10, 17],
    [10, 18], [10, 20], [11, 15], [11, 16], [11, 20], [12, 19], [12, 20],
    [13, 15], [13, 17], [14, 15], [14, 17], [21, 9], [21, 10], [21, 11],
    [22, 11], [22, 12], [15, 23], [17, 23], [18, 23], [22, 23],
  ],
  oci: [
    [0, 2], [1, 2], [1, 7], [1, 13], [2, 5], [3, 5], [4, 5],
    [5, 10], [5, 11], [6, 7], [7, 10], [7, 11], [7, 12],
    [8, 10], [8, 11], [8, 12], [9, 11], [10, 15], [10, 16], [10, 17],
    [10, 18], [10, 19], [11, 15], [11, 16], [11, 17], [11, 19],
    [12, 17], [12, 19], [13, 15], [13, 16], [14, 15], [14, 16],
    [20, 12], [15, 21], [16, 21], [20, 21],
  ],
};

export { aws, azure, gcp, oci };
