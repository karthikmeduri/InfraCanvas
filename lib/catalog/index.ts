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
    { serviceId: "vnet", x: 60, y: 300 },
    { serviceId: "subnet", x: 300, y: 180 },
    { serviceId: "nsg", x: 300, y: 420 },
    { serviceId: "app_gateway", x: 540, y: 180 },
    { serviceId: "vm", x: 780, y: 180 },
    { serviceId: "postgres", x: 780, y: 420 },
    { serviceId: "storage_account", x: 540, y: 560 },
  ],
  gcp: [
    { serviceId: "vpc", x: 60, y: 300 },
    { serviceId: "subnet", x: 300, y: 180 },
    { serviceId: "firewall", x: 300, y: 420 },
    { serviceId: "load_balancer", x: 540, y: 180 },
    { serviceId: "compute", x: 780, y: 180 },
    { serviceId: "cloud_sql", x: 780, y: 420 },
    { serviceId: "storage", x: 540, y: 560 },
  ],
  oci: [
    { serviceId: "vcn", x: 60, y: 300 },
    { serviceId: "subnet", x: 300, y: 180 },
    { serviceId: "security_list", x: 300, y: 420 },
    { serviceId: "load_balancer", x: 540, y: 180 },
    { serviceId: "instance", x: 780, y: 180 },
    { serviceId: "autonomous_db", x: 780, y: 420 },
    { serviceId: "object_storage", x: 540, y: 560 },
  ],
};

/** Edges wired into each sample, expressed as indexes into its layout above. */
const BASIC_SAMPLE_EDGES: [number, number][] = [
  [0, 1], [0, 2], [1, 3], [2, 3], [1, 4], [2, 4], [3, 4], [1, 5], [2, 5],
  [4, 5], [4, 6],
];

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
  azure: BASIC_SAMPLE_EDGES,
  gcp: BASIC_SAMPLE_EDGES,
  oci: BASIC_SAMPLE_EDGES,
};

export { aws, azure, gcp, oci };
