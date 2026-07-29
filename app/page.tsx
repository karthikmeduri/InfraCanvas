"use client";

import {
  DragEvent,
  PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type ProviderId = "aws" | "azure" | "gcp" | "oci";
type FieldDefinition = {
  key: string;
  label: string;
  type?: "text" | "number";
  options?: string[];
  placeholder?: string;
};
type ServiceDefinition = {
  id: string;
  name: string;
  short: string;
  category: string;
  description: string;
  accent: string;
  fields: FieldDefinition[];
};
type ProviderDefinition = {
  id: ProviderId;
  name: string;
  shortName: string;
  logo: string;
  tagline: string;
  accent: string;
  services: ServiceDefinition[];
};
type DiagramNode = {
  id: string;
  serviceId: string;
  x: number;
  y: number;
  values: Record<string, string>;
};
type DiagramEdge = { id: string; from: string; to: string };

const field = (
  key: string,
  label: string,
  options?: string[],
  placeholder?: string,
): FieldDefinition => ({ key, label, options, placeholder });

const service = (
  id: string,
  name: string,
  short: string,
  category: string,
  description: string,
  accent: string,
  fields: FieldDefinition[],
): ServiceDefinition => ({
  id,
  name,
  short,
  category,
  description,
  accent,
  fields,
});

const commonFields = [
  field("region", "Region", [
    "us-east-1",
    "us-west-2",
    "eu-west-1",
    "ap-southeast-1",
  ]),
  field("environment", "Environment", ["production", "staging", "development"]),
];

const providers: ProviderDefinition[] = [
  {
    id: "aws",
    name: "Amazon Web Services",
    shortName: "AWS",
    logo: "aws",
    tagline: "Build on the world’s broadest cloud platform.",
    accent: "#ffae4c",
    services: [
      service("vpc", "Virtual Private Cloud", "VPC", "Networking", "Isolated network boundary", "#8b5cf6", [
        field("cidr", "IPv4 CIDR", undefined, "10.0.0.0/16"),
        ...commonFields,
      ]),
      service("subnet", "Public Subnet", "SUB", "Networking", "Public application subnet", "#8b5cf6", [
        field("cidr", "Subnet CIDR", undefined, "10.0.1.0/24"),
        field("az", "Availability zone", ["us-east-1a", "us-east-1b", "us-east-1c"]),
      ]),
      service("alb", "Application Load Balancer", "ALB", "Networking", "Layer 7 traffic distribution", "#8b5cf6", [
        field("scheme", "Scheme", ["internet-facing", "internal"]),
        field("port", "Listener port", undefined, "443"),
        field("protocol", "Protocol", ["HTTPS", "HTTP"]),
      ]),
      service("cloudfront", "CloudFront", "CF", "Networking", "Global content delivery network", "#8b5cf6", [
        field("price_class", "Price class", ["PriceClass_100", "PriceClass_200", "PriceClass_All"]),
      ]),
      service("ec2", "EC2 Instance", "EC2", "Compute", "Resizable virtual machine", "#f97316", [
        field("instance_type", "Machine type", ["t3.micro", "t3.small", "t3.medium", "m6i.large", "c7g.large"]),
        field("ami", "AMI ID", undefined, "ami-0c7217cdde317cfec"),
        field("count", "Instance count", undefined, "2"),
        ...commonFields,
      ]),
      service("lambda", "Lambda Function", "λ", "Compute", "Event-driven serverless compute", "#f97316", [
        field("runtime", "Runtime", ["nodejs22.x", "python3.13", "java21", "provided.al2023"]),
        field("memory", "Memory (MB)", ["128", "256", "512", "1024"]),
        field("timeout", "Timeout (seconds)", undefined, "30"),
      ]),
      service("ecs", "ECS Cluster", "ECS", "Containers", "Managed container orchestration", "#3b82f6", [
        field("launch_type", "Launch type", ["FARGATE", "EC2"]),
        field("cpu", "Task CPU", ["256", "512", "1024"]),
        field("memory", "Task memory", ["512", "1024", "2048"]),
      ]),
      service("eks", "EKS Cluster", "EKS", "Containers", "Managed Kubernetes control plane", "#3b82f6", [
        field("version", "Kubernetes version", ["1.33", "1.32", "1.31"]),
        field("node_type", "Node machine type", ["t3.medium", "m6i.large", "c7g.large"]),
      ]),
      service("rds", "RDS Database", "RDS", "Database", "Managed relational database", "#22c55e", [
        field("engine", "Engine", ["postgres", "mysql", "mariadb"]),
        field("instance_class", "Instance class", ["db.t4g.micro", "db.t4g.small", "db.m6g.large"]),
        field("storage", "Storage (GB)", undefined, "20"),
        field("multi_az", "High availability", ["false", "true"]),
      ]),
      service("dynamodb", "DynamoDB", "DDB", "Database", "Serverless NoSQL database", "#22c55e", [
        field("billing_mode", "Billing mode", ["PAY_PER_REQUEST", "PROVISIONED"]),
        field("hash_key", "Partition key", undefined, "id"),
      ]),
      service("s3", "S3 Bucket", "S3", "Storage", "Durable object storage", "#ec4899", [
        field("versioning", "Versioning", ["Enabled", "Suspended"]),
        field("encryption", "Encryption", ["AES256", "aws:kms"]),
      ]),
      service("security_group", "Security Group", "SG", "Security", "Stateful network firewall", "#ef4444", [
        field("ingress_port", "Inbound port", undefined, "443"),
        field("source_cidr", "Source CIDR", undefined, "0.0.0.0/0"),
      ]),
      service("waf", "Web Application Firewall", "WAF", "Security", "Managed web request filtering", "#ef4444", [
        field("mode", "Default action", ["allow", "block"]),
      ]),
    ],
  },
  {
    id: "azure",
    name: "Microsoft Azure",
    shortName: "Azure",
    logo: "az",
    tagline: "Compose secure, enterprise-ready Azure infrastructure.",
    accent: "#42a5f5",
    services: [
      service("vnet", "Virtual Network", "VNET", "Networking", "Private Azure network", "#8b5cf6", [
        field("address_space", "Address space", undefined, "10.0.0.0/16"),
        field("location", "Location", ["East US", "West US 2", "West Europe", "Southeast Asia"]),
      ]),
      service("subnet", "Subnet", "SUB", "Networking", "Virtual network segment", "#8b5cf6", [
        field("prefix", "Address prefix", undefined, "10.0.1.0/24"),
      ]),
      service("app_gateway", "Application Gateway", "AGW", "Networking", "Layer 7 load balancer", "#8b5cf6", [
        field("sku", "SKU", ["Standard_v2", "WAF_v2"]),
        field("capacity", "Capacity", undefined, "2"),
      ]),
      service("vm", "Virtual Machine", "VM", "Compute", "Managed virtual machine", "#f97316", [
        field("size", "Machine size", ["Standard_B2s", "Standard_D2s_v5", "Standard_D4s_v5"]),
        field("image", "Image", ["Ubuntu 24.04 LTS", "Windows Server 2025", "RHEL 9"]),
        field("count", "Instance count", undefined, "2"),
      ]),
      service("functions", "Azure Functions", "FN", "Compute", "Serverless event processing", "#f97316", [
        field("runtime", "Runtime", ["node", "python", "dotnet-isolated", "java"]),
        field("plan", "Hosting plan", ["Consumption", "Flex Consumption", "Premium"]),
      ]),
      service("aks", "AKS Cluster", "AKS", "Containers", "Managed Kubernetes", "#3b82f6", [
        field("version", "Kubernetes version", ["1.33", "1.32", "1.31"]),
        field("vm_size", "Node size", ["Standard_D2s_v5", "Standard_D4s_v5"]),
      ]),
      service("sql", "Azure SQL", "SQL", "Database", "Managed SQL database", "#22c55e", [
        field("tier", "Service tier", ["GeneralPurpose", "BusinessCritical", "Hyperscale"]),
        field("size", "Compute size", ["GP_S_Gen5_1", "GP_Gen5_2", "BC_Gen5_2"]),
      ]),
      service("cosmos", "Cosmos DB", "COS", "Database", "Globally distributed NoSQL", "#22c55e", [
        field("api", "API", ["NoSQL", "MongoDB", "Cassandra", "Gremlin"]),
        field("consistency", "Consistency", ["Session", "Strong", "Eventual"]),
      ]),
      service("blob", "Blob Storage", "BLB", "Storage", "Scalable object storage", "#ec4899", [
        field("tier", "Access tier", ["Hot", "Cool", "Cold"]),
        field("replication", "Replication", ["LRS", "ZRS", "GRS"]),
      ]),
      service("nsg", "Network Security Group", "NSG", "Security", "Subnet and NIC firewall rules", "#ef4444", [
        field("port", "Inbound port", undefined, "443"),
        field("source", "Source prefix", undefined, "*"),
      ]),
    ],
  },
  {
    id: "gcp",
    name: "Google Cloud",
    shortName: "GCP",
    logo: "gcp",
    tagline: "Design data, AI, and application infrastructure on GCP.",
    accent: "#6ea8fe",
    services: [
      service("vpc", "VPC Network", "VPC", "Networking", "Global software-defined network", "#8b5cf6", [
        field("routing_mode", "Routing mode", ["GLOBAL", "REGIONAL"]),
        field("region", "Region", ["us-central1", "us-east1", "europe-west1", "asia-southeast1"]),
      ]),
      service("subnet", "Subnetwork", "SUB", "Networking", "Regional VPC segment", "#8b5cf6", [
        field("cidr", "IP range", undefined, "10.0.1.0/24"),
        field("region", "Region", ["us-central1", "us-east1", "europe-west1"]),
      ]),
      service("load_balancer", "Cloud Load Balancing", "LB", "Networking", "Global application delivery", "#8b5cf6", [
        field("scheme", "Scheme", ["EXTERNAL_MANAGED", "INTERNAL_MANAGED"]),
        field("protocol", "Protocol", ["HTTPS", "HTTP", "TCP"]),
      ]),
      service("compute", "Compute Engine", "GCE", "Compute", "Customizable virtual machines", "#f97316", [
        field("machine_type", "Machine type", ["e2-micro", "e2-standard-2", "n2-standard-4", "c3-standard-4"]),
        field("image", "Boot image", ["ubuntu-os-cloud/ubuntu-2404-lts-amd64", "debian-cloud/debian-12"]),
        field("count", "Instance count", undefined, "2"),
      ]),
      service("cloud_run", "Cloud Run", "RUN", "Compute", "Serverless containers", "#f97316", [
        field("cpu", "CPU", ["1", "2", "4"]),
        field("memory", "Memory", ["512Mi", "1Gi", "2Gi"]),
        field("min_instances", "Minimum instances", undefined, "0"),
      ]),
      service("gke", "GKE Cluster", "GKE", "Containers", "Managed Kubernetes", "#3b82f6", [
        field("mode", "Cluster mode", ["Autopilot", "Standard"]),
        field("machine_type", "Node machine type", ["e2-standard-2", "e2-standard-4", "n2-standard-4"]),
      ]),
      service("cloud_sql", "Cloud SQL", "SQL", "Database", "Managed relational database", "#22c55e", [
        field("engine", "Database engine", ["POSTGRES_16", "MYSQL_8_0", "SQLSERVER_2022_STANDARD"]),
        field("tier", "Machine tier", ["db-f1-micro", "db-g1-small", "db-custom-2-7680"]),
      ]),
      service("firestore", "Firestore", "FS", "Database", "Serverless document database", "#22c55e", [
        field("mode", "Database mode", ["NATIVE", "DATASTORE_MODE"]),
        field("location", "Location", ["nam5", "eur3", "us-central1"]),
      ]),
      service("storage", "Cloud Storage", "GCS", "Storage", "Global object storage", "#ec4899", [
        field("class", "Storage class", ["STANDARD", "NEARLINE", "COLDLINE", "ARCHIVE"]),
        field("location", "Location", ["US", "EU", "us-central1"]),
      ]),
      service("firewall", "Firewall Rule", "FW", "Security", "VPC traffic filtering", "#ef4444", [
        field("port", "Allowed port", undefined, "443"),
        field("source", "Source range", undefined, "0.0.0.0/0"),
      ]),
    ],
  },
  {
    id: "oci",
    name: "Oracle Cloud Infrastructure",
    shortName: "OCI",
    logo: "oci",
    tagline: "Model high-performance Oracle Cloud foundations.",
    accent: "#f45e42",
    services: [
      service("vcn", "Virtual Cloud Network", "VCN", "Networking", "Private OCI network", "#8b5cf6", [
        field("cidr", "IPv4 CIDR", undefined, "10.0.0.0/16"),
        field("region", "Region", ["us-ashburn-1", "us-phoenix-1", "uk-london-1", "ap-singapore-1"]),
      ]),
      service("subnet", "Public Subnet", "SUB", "Networking", "VCN network segment", "#8b5cf6", [
        field("cidr", "Subnet CIDR", undefined, "10.0.1.0/24"),
      ]),
      service("load_balancer", "Load Balancer", "LB", "Networking", "Flexible application load balancer", "#8b5cf6", [
        field("shape", "Shape", ["flexible", "100Mbps", "400Mbps"]),
        field("bandwidth", "Maximum bandwidth", undefined, "100"),
      ]),
      service("instance", "Compute Instance", "CMP", "Compute", "Flexible virtual machine", "#f97316", [
        field("shape", "Shape", ["VM.Standard.E4.Flex", "VM.Standard.A1.Flex", "VM.Standard3.Flex"]),
        field("ocpus", "OCPUs", undefined, "2"),
        field("memory", "Memory (GB)", undefined, "16"),
      ]),
      service("functions", "OCI Functions", "FN", "Compute", "Serverless functions platform", "#f97316", [
        field("memory", "Memory (MB)", ["128", "256", "512", "1024"]),
        field("timeout", "Timeout (seconds)", undefined, "30"),
      ]),
      service("oke", "OKE Cluster", "OKE", "Containers", "Managed Kubernetes", "#3b82f6", [
        field("version", "Kubernetes version", ["v1.33.1", "v1.32.1", "v1.31.1"]),
        field("node_shape", "Node shape", ["VM.Standard.E4.Flex", "VM.Standard.A1.Flex"]),
      ]),
      service("autonomous_db", "Autonomous Database", "ADB", "Database", "Self-managing Oracle Database", "#22c55e", [
        field("workload", "Workload", ["OLTP", "DW", "AJD"]),
        field("ocpus", "ECPUs", undefined, "4"),
        field("storage", "Storage (TB)", undefined, "1"),
      ]),
      service("mysql", "MySQL HeatWave", "SQL", "Database", "Managed MySQL with analytics", "#22c55e", [
        field("shape", "Shape", ["MySQL.VM.Standard.E3.1.8GB", "MySQL.VM.Standard.E4.2.32GB"]),
      ]),
      service("object_storage", "Object Storage", "OBJ", "Storage", "Regional durable object storage", "#ec4899", [
        field("tier", "Default tier", ["Standard", "Archive"]),
        field("versioning", "Versioning", ["Enabled", "Disabled"]),
      ]),
      service("security_list", "Security List", "SEC", "Security", "Subnet-level traffic rules", "#ef4444", [
        field("port", "Ingress port", undefined, "443"),
        field("source", "Source CIDR", undefined, "0.0.0.0/0"),
      ]),
    ],
  },
];

const defaultValues = (definition: ServiceDefinition, sequence: number) => {
  const values: Record<string, string> = {
    name: `${definition.id.replaceAll("_", "-")}-${sequence}`,
  };
  definition.fields.forEach((item) => {
    values[item.key] =
      item.options?.[0] ??
      item.placeholder ??
      (item.type === "number" ? "1" : "");
  });
  return values;
};

const sampleServiceIds: Record<ProviderId, string[]> = {
  aws: ["vpc", "subnet", "alb", "ec2", "rds"],
  azure: ["vnet", "subnet", "app_gateway", "vm", "sql"],
  gcp: ["vpc", "subnet", "load_balancer", "compute", "cloud_sql"],
  oci: ["vcn", "subnet", "load_balancer", "instance", "autonomous_db"],
};

const safeName = (value: string) =>
  (value || "resource")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "") || "resource";

const quote = (value: string) => JSON.stringify(value || "");
const boolValue = (value: string, fallback = false) =>
  value === "true" ? "true" : value === "false" ? "false" : String(fallback);
const numberValue = (value: string, fallback: string) =>
  /^\d+(\.\d+)?$/.test(value || "") ? value : fallback;

function terraformForNode(
  provider: ProviderId,
  node: DiagramNode,
  serviceDefinition: ServiceDefinition,
) {
  const name = safeName(node.values.name);
  const v = node.values;
  const tags =
    provider === "aws"
      ? `\n  tags = {\n    Name        = ${quote(v.name)}\n    Environment = ${quote(v.environment || "production")}\n    ManagedBy   = "Terraform"\n  }`
      : "";

  if (provider === "aws") {
    switch (node.serviceId) {
      case "vpc":
        return `resource "aws_vpc" "${name}" {\n  cidr_block           = ${quote(v.cidr)}\n  enable_dns_support   = true\n  enable_dns_hostnames = true${tags}\n}`;
      case "subnet":
        return `resource "aws_subnet" "${name}" {\n  vpc_id                  = local.vpc_id\n  cidr_block              = ${quote(v.cidr)}\n  availability_zone       = ${quote(v.az)}\n  map_public_ip_on_launch = true${tags}\n}`;
      case "ec2":
        return `resource "aws_instance" "${name}" {\n  count                       = ${numberValue(v.count, "1")}\n  ami                         = ${quote(v.ami)}\n  instance_type               = ${quote(v.instance_type)}\n  subnet_id                   = local.subnet_id\n  vpc_security_group_ids      = local.security_group_ids\n  associate_public_ip_address = false\n\n  root_block_device {\n    encrypted   = true\n    volume_type = "gp3"\n  }\n\n  metadata_options {\n    http_tokens = "required"\n  }${tags}\n}`;
      case "alb":
        return `resource "aws_lb" "${name}" {\n  name               = ${quote(v.name)}\n  internal           = ${v.scheme === "internal"}\n  load_balancer_type = "application"\n  security_groups    = local.security_group_ids\n  subnets            = local.subnet_ids\n  drop_invalid_header_fields = true${tags}\n}\n\nresource "aws_lb_target_group" "${name}" {\n  name     = "${safeName(v.name).replaceAll("_", "-").slice(0, 24)}-tg"\n  port     = ${numberValue(v.port, "443")}\n  protocol = ${quote(v.protocol === "HTTPS" ? "HTTPS" : "HTTP")}\n  vpc_id   = local.vpc_id\n\n  health_check {\n    path    = "/health"\n    matcher = "200-399"\n  }\n}`;
      case "rds":
        return `resource "aws_db_subnet_group" "${name}" {\n  name       = "${safeName(v.name).replaceAll("_", "-")}-subnets"\n  subnet_ids = local.subnet_ids\n${tags}\n}\n\nresource "aws_db_instance" "${name}" {\n  identifier              = ${quote(v.name)}\n  engine                  = ${quote(v.engine)}\n  instance_class          = ${quote(v.instance_class)}\n  allocated_storage       = ${numberValue(v.storage, "20")}\n  storage_encrypted       = true\n  multi_az                = ${boolValue(v.multi_az)}\n  db_subnet_group_name    = aws_db_subnet_group.${name}.name\n  vpc_security_group_ids  = local.security_group_ids\n  username                = var.database_username\n  password                = var.database_password\n  skip_final_snapshot     = false\n  final_snapshot_identifier = "${safeName(v.name).replaceAll("_", "-")}-final"\n${tags}\n}`;
      case "s3":
        return `resource "aws_s3_bucket" "${name}" {\n  bucket_prefix = "${safeName(v.name).replaceAll("_", "-")}-"\n${tags}\n}\n\nresource "aws_s3_bucket_versioning" "${name}" {\n  bucket = aws_s3_bucket.${name}.id\n  versioning_configuration {\n    status = ${quote(v.versioning)}\n  }\n}\n\nresource "aws_s3_bucket_server_side_encryption_configuration" "${name}" {\n  bucket = aws_s3_bucket.${name}.id\n  rule {\n    apply_server_side_encryption_by_default {\n      sse_algorithm = ${quote(v.encryption)}\n    }\n  }\n}\n\nresource "aws_s3_bucket_public_access_block" "${name}" {\n  bucket                  = aws_s3_bucket.${name}.id\n  block_public_acls       = true\n  block_public_policy     = true\n  ignore_public_acls      = true\n  restrict_public_buckets = true\n}`;
      case "lambda":
        return `resource "aws_lambda_function" "${name}" {\n  function_name = ${quote(v.name)}\n  role          = aws_iam_role.${name}.arn\n  runtime       = ${quote(v.runtime)}\n  handler       = "index.handler"\n  filename      = "function.zip"\n  memory_size   = ${numberValue(v.memory, "256")}\n  timeout       = ${numberValue(v.timeout, "30")}${tags}\n}\n\nresource "aws_iam_role" "${name}" {\n  name = "${safeName(v.name)}-execution-role"\n  assume_role_policy = jsonencode({\n    Version = "2012-10-17"\n    Statement = [{\n      Action = "sts:AssumeRole"\n      Effect = "Allow"\n      Principal = { Service = "lambda.amazonaws.com" }\n    }]\n  })\n}`;
      case "dynamodb":
        return `resource "aws_dynamodb_table" "${name}" {\n  name         = ${quote(v.name)}\n  billing_mode = ${quote(v.billing_mode)}\n  hash_key     = ${quote(v.hash_key)}\n\n  attribute {\n    name = ${quote(v.hash_key)}\n    type = "S"\n  }\n\n  point_in_time_recovery { enabled = true }${tags}\n}`;
      case "security_group":
        return `resource "aws_security_group" "${name}" {\n  name        = ${quote(v.name)}\n  description = "Managed by InfraCanvas"\n  vpc_id      = local.vpc_id\n\n  ingress {\n    from_port   = ${numberValue(v.ingress_port, "443")}\n    to_port     = ${numberValue(v.ingress_port, "443")}\n    protocol    = "tcp"\n    cidr_blocks = [${quote(v.source_cidr)}]\n  }\n\n  egress {\n    from_port   = 0\n    to_port     = 0\n    protocol    = "-1"\n    cidr_blocks = ["0.0.0.0/0"]\n  }${tags}\n}`;
      case "cloudfront":
        return `resource "aws_cloudfront_distribution" "${name}" {\n  enabled     = true\n  price_class = ${quote(v.price_class)}\n  comment     = ${quote(v.name)}\n\n  origin {\n    domain_name = local.origin_domain_name\n    origin_id   = "primary-origin"\n  }\n\n  default_cache_behavior {\n    target_origin_id       = "primary-origin"\n    viewer_protocol_policy = "redirect-to-https"\n    allowed_methods        = ["GET", "HEAD", "OPTIONS"]\n    cached_methods         = ["GET", "HEAD"]\n    forwarded_values {\n      query_string = false\n      cookies { forward = "none" }\n    }\n  }\n\n  restrictions {\n    geo_restriction { restriction_type = "none" }\n  }\n\n  viewer_certificate { cloudfront_default_certificate = true }${tags}\n}`;
      case "ecs":
        return `resource "aws_ecs_cluster" "${name}" {\n  name = ${quote(v.name)}\n  setting {\n    name  = "containerInsights"\n    value = "enabled"\n  }${tags}\n}\n\nresource "aws_ecs_task_definition" "${name}" {\n  family                   = ${quote(v.name)}\n  requires_compatibilities = [${quote(v.launch_type)}]\n  network_mode             = "awsvpc"\n  cpu                      = ${quote(v.cpu)}\n  memory                   = ${quote(v.memory)}\n  execution_role_arn       = aws_iam_role.${name}.arn\n  container_definitions = jsonencode([{\n    name = "app", image = "public.ecr.aws/nginx/nginx:stable", essential = true\n    portMappings = [{ containerPort = 80, hostPort = 80, protocol = "tcp" }]\n  }])\n}\n\nresource "aws_iam_role" "${name}" {\n  name = "${safeName(v.name)}-task-execution"\n  assume_role_policy = jsonencode({\n    Version = "2012-10-17"\n    Statement = [{ Action = "sts:AssumeRole", Effect = "Allow", Principal = { Service = "ecs-tasks.amazonaws.com" } }]\n  })\n}`;
      case "eks":
        return `resource "aws_eks_cluster" "${name}" {\n  name     = ${quote(v.name)}\n  role_arn = aws_iam_role.${name}.arn\n  version  = ${quote(v.version)}\n  vpc_config {\n    subnet_ids              = local.subnet_ids\n    endpoint_private_access = true\n    endpoint_public_access  = false\n  }${tags}\n}\n\nresource "aws_iam_role" "${name}" {\n  name = "${safeName(v.name)}-cluster-role"\n  assume_role_policy = jsonencode({\n    Version = "2012-10-17"\n    Statement = [{ Action = "sts:AssumeRole", Effect = "Allow", Principal = { Service = "eks.amazonaws.com" } }]\n  })\n}\n\nresource "aws_eks_node_group" "${name}" {\n  cluster_name    = aws_eks_cluster.${name}.name\n  node_group_name = "${safeName(v.name)}-nodes"\n  node_role_arn   = aws_iam_role.${name}_nodes.arn\n  subnet_ids      = local.subnet_ids\n  instance_types  = [${quote(v.node_type)}]\n  scaling_config { desired_size = 2; min_size = 1; max_size = 4 }\n}\n\nresource "aws_iam_role" "${name}_nodes" {\n  name = "${safeName(v.name)}-node-role"\n  assume_role_policy = jsonencode({\n    Version = "2012-10-17"\n    Statement = [{ Action = "sts:AssumeRole", Effect = "Allow", Principal = { Service = "ec2.amazonaws.com" } }]\n  })\n}`;
      case "waf":
        return `resource "aws_wafv2_web_acl" "${name}" {\n  name  = ${quote(v.name)}\n  scope = "REGIONAL"\n  default_action { ${v.mode === "block" ? "block" : "allow"} {} }\n  visibility_config {\n    cloudwatch_metrics_enabled = true\n    metric_name                = ${quote(safeName(v.name))}\n    sampled_requests_enabled   = true\n  }\n  rule {\n    name     = "AWSManagedRulesCommonRuleSet"\n    priority = 1\n    override_action { none {} }\n    statement {\n      managed_rule_group_statement { name = "AWSManagedRulesCommonRuleSet"; vendor_name = "AWS" }\n    }\n    visibility_config {\n      cloudwatch_metrics_enabled = true\n      metric_name                = "${safeName(v.name)}-common"\n      sampled_requests_enabled   = true\n    }\n  }${tags}\n}`;
      default:
        return `# ${serviceDefinition.name}\n# TODO: Add the provider-specific resource after reviewing ${quote(v.name)}.`;
    }
  }

  if (provider === "azure") {
    switch (node.serviceId) {
      case "vnet":
        return `resource "azurerm_virtual_network" "${name}" {\n  name                = ${quote(v.name)}\n  address_space       = [${quote(v.address_space)}]\n  location            = ${quote(v.location)}\n  resource_group_name = azurerm_resource_group.main.name\n  tags                = local.tags\n}`;
      case "subnet":
        return `resource "azurerm_subnet" "${name}" {\n  name                 = ${quote(v.name)}\n  resource_group_name  = azurerm_resource_group.main.name\n  virtual_network_name = local.virtual_network_name\n  address_prefixes     = [${quote(v.prefix)}]\n}`;
      case "vm":
        return `resource "azurerm_linux_virtual_machine" "${name}" {\n  name                = ${quote(v.name)}\n  resource_group_name = azurerm_resource_group.main.name\n  location            = azurerm_resource_group.main.location\n  size                = ${quote(v.size)}\n  admin_username      = var.admin_username\n  network_interface_ids = local.network_interface_ids\n\n  admin_ssh_key {\n    username   = var.admin_username\n    public_key = var.ssh_public_key\n  }\n\n  os_disk {\n    caching              = "ReadWrite"\n    storage_account_type = "Premium_LRS"\n  }\n\n  source_image_reference {\n    publisher = "Canonical"\n    offer     = "ubuntu-24_04-lts"\n    sku       = "server"\n    version   = "latest"\n  }\n  tags = local.tags\n}`;
      case "sql":
        return `resource "azurerm_mssql_server" "${name}" {\n  name                         = ${quote(safeName(v.name).replaceAll("_", "-"))}\n  resource_group_name          = azurerm_resource_group.main.name\n  location                     = azurerm_resource_group.main.location\n  version                      = "12.0"\n  administrator_login          = var.database_username\n  administrator_login_password = var.database_password\n  minimum_tls_version          = "1.2"\n  tags                         = local.tags\n}\n\nresource "azurerm_mssql_database" "${name}" {\n  name      = "${safeName(v.name).replaceAll("_", "-")}-db"\n  server_id = azurerm_mssql_server.${name}.id\n  sku_name  = ${quote(v.size)}\n  tags      = local.tags\n}`;
      case "blob":
        return `resource "azurerm_storage_account" "${name}" {\n  name                     = replace(${quote(safeName(v.name))}, "_", "")\n  resource_group_name      = azurerm_resource_group.main.name\n  location                 = azurerm_resource_group.main.location\n  account_tier             = "Standard"\n  account_replication_type = ${quote(v.replication)}\n  access_tier              = ${quote(v.tier)}\n  min_tls_version          = "TLS1_2"\n  tags                     = local.tags\n}`;
      case "app_gateway":
        return `resource "azurerm_application_gateway" "${name}" {\n  name                = ${quote(v.name)}\n  resource_group_name = azurerm_resource_group.main.name\n  location            = azurerm_resource_group.main.location\n  sku {\n    name     = ${quote(v.sku)}\n    tier     = ${quote(v.sku)}\n    capacity = ${numberValue(v.capacity, "2")}\n  }\n  gateway_ip_configuration {\n    name      = "gateway-ip"\n    subnet_id = local.gateway_subnet_id\n  }\n  frontend_port { name = "https"; port = 443 }\n  frontend_ip_configuration {\n    name                 = "frontend"\n    public_ip_address_id = local.public_ip_id\n  }\n  backend_address_pool { name = "backend" }\n  backend_http_settings {\n    name = "https"; port = 443; protocol = "Https"; cookie_based_affinity = "Disabled"\n  }\n  http_listener {\n    name = "https"; frontend_ip_configuration_name = "frontend"; frontend_port_name = "https"; protocol = "Https"\n  }\n  request_routing_rule {\n    name = "primary"; rule_type = "Basic"; priority = 100\n    http_listener_name = "https"; backend_address_pool_name = "backend"; backend_http_settings_name = "https"\n  }\n  tags = local.tags\n}`;
      case "functions":
        return `resource "azurerm_service_plan" "${name}" {\n  name                = "${safeName(v.name).replaceAll("_", "-")}-plan"\n  resource_group_name = azurerm_resource_group.main.name\n  location            = azurerm_resource_group.main.location\n  os_type             = "Linux"\n  sku_name            = ${v.plan === "Premium" ? '"EP1"' : '"Y1"'}\n  tags                = local.tags\n}\n\nresource "azurerm_linux_function_app" "${name}" {\n  name                       = ${quote(v.name)}\n  resource_group_name        = azurerm_resource_group.main.name\n  location                   = azurerm_resource_group.main.location\n  service_plan_id            = azurerm_service_plan.${name}.id\n  storage_account_name       = local.storage_account_name\n  storage_account_access_key = local.storage_account_access_key\n  https_only                 = true\n  site_config {\n    application_stack { ${v.runtime === "python" ? 'python_version = "3.12"' : v.runtime === "java" ? 'java_version = "21"' : v.runtime === "dotnet-isolated" ? 'dotnet_version = "8.0"' : 'node_version = "22"'} }\n  }\n  tags = local.tags\n}`;
      case "aks":
        return `resource "azurerm_kubernetes_cluster" "${name}" {\n  name                = ${quote(v.name)}\n  location            = azurerm_resource_group.main.location\n  resource_group_name = azurerm_resource_group.main.name\n  dns_prefix          = ${quote(safeName(v.name).replaceAll("_", "-"))}\n  kubernetes_version  = ${quote(v.version)}\n  private_cluster_enabled = true\n  default_node_pool {\n    name       = "system"\n    node_count = 2\n    vm_size    = ${quote(v.vm_size)}\n    vnet_subnet_id = local.subnet_id\n  }\n  identity { type = "SystemAssigned" }\n  network_profile { network_plugin = "azure"; network_policy = "azure" }\n  tags = local.tags\n}`;
      case "cosmos":
        return `resource "azurerm_cosmosdb_account" "${name}" {\n  name                = ${quote(safeName(v.name).replaceAll("_", "-"))}\n  location            = azurerm_resource_group.main.location\n  resource_group_name = azurerm_resource_group.main.name\n  offer_type          = "Standard"\n  kind                = ${v.api === "MongoDB" ? '"MongoDB"' : '"GlobalDocumentDB"'}\n  consistency_policy { consistency_level = ${quote(v.consistency)} }\n  geo_location { location = azurerm_resource_group.main.location; failover_priority = 0 }\n  public_network_access_enabled = false\n  tags = local.tags\n}`;
      case "nsg":
        return `resource "azurerm_network_security_group" "${name}" {\n  name                = ${quote(v.name)}\n  location            = azurerm_resource_group.main.location\n  resource_group_name = azurerm_resource_group.main.name\n  security_rule {\n    name = "allow-${numberValue(v.port, "443")}"; priority = 100; direction = "Inbound"; access = "Allow"; protocol = "Tcp"\n    source_port_range = "*"; destination_port_range = ${quote(v.port)}\n    source_address_prefix = ${quote(v.source)}; destination_address_prefix = "*"\n  }\n  tags = local.tags\n}`;
      default:
        return `# ${serviceDefinition.name}\n# TODO: Complete the azurerm resource for ${quote(v.name)}.`;
    }
  }

  if (provider === "gcp") {
    switch (node.serviceId) {
      case "vpc":
        return `resource "google_compute_network" "${name}" {\n  name                    = ${quote(v.name)}\n  auto_create_subnetworks = false\n  routing_mode            = ${quote(v.routing_mode)}\n}`;
      case "subnet":
        return `resource "google_compute_subnetwork" "${name}" {\n  name          = ${quote(v.name)}\n  ip_cidr_range = ${quote(v.cidr)}\n  region        = ${quote(v.region)}\n  network       = local.network_id\n  private_ip_google_access = true\n}`;
      case "compute":
        return `resource "google_compute_instance" "${name}" {\n  name         = ${quote(v.name)}\n  machine_type = ${quote(v.machine_type)}\n  zone         = "\${var.region}-a"\n  tags         = ["infracanvas", "web"]\n\n  boot_disk {\n    initialize_params { image = ${quote(v.image)} }\n  }\n\n  network_interface {\n    subnetwork = local.subnetwork_id\n  }\n\n  metadata = { enable-oslogin = "TRUE" }\n  labels   = local.labels\n}`;
      case "cloud_sql":
        return `resource "google_sql_database_instance" "${name}" {\n  name             = ${quote(v.name)}\n  database_version = ${quote(v.engine)}\n  region           = var.region\n  deletion_protection = true\n\n  settings {\n    tier              = ${quote(v.tier)}\n    availability_type = "REGIONAL"\n    disk_autoresize   = true\n    ip_configuration { ipv4_enabled = false; private_network = local.network_id }\n    backup_configuration { enabled = true; point_in_time_recovery_enabled = true }\n  }\n}`;
      case "storage":
        return `resource "google_storage_bucket" "${name}" {\n  name                        = "\${var.project_id}-${safeName(v.name).replaceAll("_", "-")}"\n  location                    = ${quote(v.location)}\n  storage_class               = ${quote(v.class)}\n  uniform_bucket_level_access = true\n  public_access_prevention    = "enforced"\n  versioning { enabled = true }\n  labels = local.labels\n}`;
      case "load_balancer":
        return `resource "google_compute_global_address" "${name}" {\n  name = "${safeName(v.name).replaceAll("_", "-")}-ip"\n}\n\nresource "google_compute_global_forwarding_rule" "${name}" {\n  name       = ${quote(v.name)}\n  target     = local.https_proxy_id\n  port_range = "443"\n  ip_address = google_compute_global_address.${name}.address\n}`;
      case "cloud_run":
        return `resource "google_cloud_run_v2_service" "${name}" {\n  name     = ${quote(v.name)}\n  location = var.region\n  ingress  = "INGRESS_TRAFFIC_ALL"\n  template {\n    scaling { min_instance_count = ${numberValue(v.min_instances, "0")}; max_instance_count = 10 }\n    containers {\n      image = "us-docker.pkg.dev/cloudrun/container/hello"\n      resources { limits = { cpu = ${quote(v.cpu)}, memory = ${quote(v.memory)} } }\n    }\n  }\n  labels = local.labels\n}`;
      case "gke":
        return `resource "google_container_cluster" "${name}" {\n  name     = ${quote(v.name)}\n  location = var.region\n  deletion_protection = true\n  ${v.mode === "Autopilot" ? "enable_autopilot = true" : "remove_default_node_pool = true\n  initial_node_count       = 1"}\n  network    = local.network_id\n  subnetwork = local.subnetwork_id\n  private_cluster_config { enable_private_nodes = true; enable_private_endpoint = false; master_ipv4_cidr_block = "172.16.0.0/28" }\n  release_channel { channel = "REGULAR" }\n  resource_labels = local.labels\n}${v.mode === "Standard" ? `\n\nresource "google_container_node_pool" "${name}" {\n  name = "${safeName(v.name).replaceAll("_", "-")}-nodes"; cluster = google_container_cluster.${name}.id\n  node_count = 2\n  node_config { machine_type = ${quote(v.machine_type)}; oauth_scopes = ["https://www.googleapis.com/auth/cloud-platform"] }\n}` : ""}`;
      case "firestore":
        return `resource "google_firestore_database" "${name}" {\n  project                     = var.project_id\n  name                        = ${quote(v.name)}\n  location_id                 = ${quote(v.location)}\n  type                        = "FIRESTORE_${v.mode}"\n  concurrency_mode            = "OPTIMISTIC"\n  app_engine_integration_mode = "DISABLED"\n  deletion_policy             = "ABANDON"\n}`;
      case "firewall":
        return `resource "google_compute_firewall" "${name}" {\n  name    = ${quote(v.name)}\n  network = local.network_id\n  source_ranges = [${quote(v.source)}]\n  allow { protocol = "tcp"; ports = [${quote(v.port)}] }\n  target_tags = ["web"]\n}`;
      default:
        return `# ${serviceDefinition.name}\n# TODO: Complete the google resource for ${quote(v.name)}.`;
    }
  }

  switch (node.serviceId) {
    case "vcn":
      return `resource "oci_core_vcn" "${name}" {\n  compartment_id = var.compartment_id\n  display_name   = ${quote(v.name)}\n  cidr_blocks    = [${quote(v.cidr)}]\n  dns_label      = "${safeName(v.name).replaceAll("_", "").slice(0, 12)}"\n}`;
    case "subnet":
      return `resource "oci_core_subnet" "${name}" {\n  compartment_id = var.compartment_id\n  vcn_id         = local.vcn_id\n  display_name   = ${quote(v.name)}\n  cidr_block     = ${quote(v.cidr)}\n  route_table_id = local.route_table_id\n}`;
    case "instance":
      return `resource "oci_core_instance" "${name}" {\n  availability_domain = data.oci_identity_availability_domains.ads.availability_domains[0].name\n  compartment_id      = var.compartment_id\n  display_name        = ${quote(v.name)}\n  shape               = ${quote(v.shape)}\n\n  shape_config {\n    ocpus         = ${numberValue(v.ocpus, "2")}\n    memory_in_gbs = ${numberValue(v.memory, "16")}\n  }\n\n  create_vnic_details {\n    subnet_id        = local.subnet_id\n    assign_public_ip = false\n  }\n\n  source_details {\n    source_type = "image"\n    source_id   = var.image_id\n  }\n  freeform_tags = local.tags\n}`;
    case "autonomous_db":
      return `resource "oci_database_autonomous_database" "${name}" {\n  compartment_id           = var.compartment_id\n  display_name             = ${quote(v.name)}\n  db_name                  = "${safeName(v.name).replaceAll("_", "").slice(0, 12).toUpperCase()}"\n  admin_password           = var.database_password\n  db_workload              = ${quote(v.workload)}\n  compute_count            = ${numberValue(v.ocpus, "4")}\n  compute_model            = "ECPU"\n  data_storage_size_in_tbs = ${numberValue(v.storage, "1")}\n  is_auto_scaling_enabled  = true\n  is_mtls_connection_required = true\n  freeform_tags = local.tags\n}`;
    case "object_storage":
      return `resource "oci_objectstorage_bucket" "${name}" {\n  compartment_id = var.compartment_id\n  namespace      = data.oci_objectstorage_namespace.main.namespace\n  name           = ${quote(v.name)}\n  storage_tier   = ${quote(v.tier)}\n  versioning     = ${quote(v.versioning)}\n  access_type    = "NoPublicAccess"\n  freeform_tags  = local.tags\n}`;
    case "load_balancer":
      return `resource "oci_load_balancer_load_balancer" "${name}" {\n  compartment_id = var.compartment_id\n  display_name   = ${quote(v.name)}\n  shape          = ${quote(v.shape)}\n  subnet_ids     = local.subnet_ids\n  is_private     = false\n\n  shape_details {\n    minimum_bandwidth_in_mbps = 10\n    maximum_bandwidth_in_mbps = ${numberValue(v.bandwidth, "100")}\n  }\n  freeform_tags = local.tags\n}`;
    case "functions":
      return `resource "oci_functions_application" "${name}" {\n  compartment_id = var.compartment_id\n  display_name   = ${quote(v.name)}\n  subnet_ids     = local.subnet_ids\n  config = { "memory" = ${quote(v.memory)}, "timeout" = ${quote(v.timeout)} }\n  freeform_tags = local.tags\n}\n\nresource "oci_functions_function" "${name}" {\n  application_id = oci_functions_application.${name}.id\n  display_name   = ${quote(v.name)}\n  image          = var.function_image\n  memory_in_mbs  = ${numberValue(v.memory, "256")}\n  timeout_in_seconds = ${numberValue(v.timeout, "30")}\n  freeform_tags = local.tags\n}`;
    case "oke":
      return `resource "oci_containerengine_cluster" "${name}" {\n  compartment_id     = var.compartment_id\n  kubernetes_version = ${quote(v.version)}\n  name               = ${quote(v.name)}\n  vcn_id             = local.vcn_id\n  endpoint_config { is_public_ip_enabled = false; subnet_id = local.subnet_id }\n  options { service_lb_subnet_ids = local.subnet_ids }\n  freeform_tags = local.tags\n}\n\nresource "oci_containerengine_node_pool" "${name}" {\n  cluster_id         = oci_containerengine_cluster.${name}.id\n  compartment_id     = var.compartment_id\n  kubernetes_version = ${quote(v.version)}\n  name               = "${safeName(v.name)}-nodes"\n  node_shape          = ${quote(v.node_shape)}\n  node_config_details { size = 2; placement_configs { availability_domain = data.oci_identity_availability_domains.ads.availability_domains[0].name; subnet_id = local.subnet_id } }\n  node_source_details { source_type = "IMAGE"; image_id = var.image_id }\n}`;
    case "mysql":
      return `resource "oci_mysql_mysql_db_system" "${name}" {\n  availability_domain = data.oci_identity_availability_domains.ads.availability_domains[0].name\n  compartment_id      = var.compartment_id\n  display_name        = ${quote(v.name)}\n  shape_name          = ${quote(v.shape)}\n  subnet_id           = local.subnet_id\n  admin_username      = var.database_username\n  admin_password      = var.database_password\n  data_storage_size_in_gb = 50\n  is_highly_available = true\n  freeform_tags = local.tags\n}`;
    case "security_list":
      return `resource "oci_core_security_list" "${name}" {\n  compartment_id = var.compartment_id\n  vcn_id         = local.vcn_id\n  display_name   = ${quote(v.name)}\n  ingress_security_rules {\n    protocol = "6"\n    source   = ${quote(v.source)}\n    tcp_options { min = ${numberValue(v.port, "443")}; max = ${numberValue(v.port, "443")} }\n  }\n  egress_security_rules { protocol = "all"; destination = "0.0.0.0/0" }\n  freeform_tags = local.tags\n}`;
    default:
      return `# ${serviceDefinition.name}\n# TODO: Complete the OCI resource for ${quote(v.name)}.`;
  }
}

function generateTerraform(
  provider: ProviderDefinition,
  nodes: DiagramNode[],
  edges: DiagramEdge[],
) {
  const providerHeaders: Record<ProviderId, string> = {
    aws: `terraform {\n  required_version = ">= 1.8.0"\n  required_providers {\n    aws = {\n      source  = "hashicorp/aws"\n      version = "~> 6.0"\n    }\n  }\n}\n\nprovider "aws" {\n  region = var.region\n\n  default_tags {\n    tags = local.common_tags\n  }\n}`,
    azure: `terraform {\n  required_version = ">= 1.8.0"\n  required_providers {\n    azurerm = {\n      source  = "hashicorp/azurerm"\n      version = "~> 4.0"\n    }\n  }\n}\n\nprovider "azurerm" {\n  features {}\n  subscription_id = var.subscription_id\n}\n\nresource "azurerm_resource_group" "main" {\n  name     = var.resource_group_name\n  location = var.location\n  tags     = local.tags\n}`,
    gcp: `terraform {\n  required_version = ">= 1.8.0"\n  required_providers {\n    google = {\n      source  = "hashicorp/google"\n      version = "~> 7.0"\n    }\n  }\n}\n\nprovider "google" {\n  project = var.project_id\n  region  = var.region\n}`,
    oci: `terraform {\n  required_version = ">= 1.8.0"\n  required_providers {\n    oci = {\n      source  = "oracle/oci"\n      version = "~> 7.0"\n    }\n  }\n}\n\nprovider "oci" {\n  region = var.region\n}\n\ndata "oci_identity_availability_domains" "ads" {\n  compartment_id = var.tenancy_ocid\n}\n\ndata "oci_objectstorage_namespace" "main" {\n  compartment_id = var.compartment_id\n}`,
  };

  const variables: Record<ProviderId, string> = {
    aws: `variable "region" {\n  description = "AWS region for all resources"\n  type        = string\n  default     = "us-east-1"\n}\n\nvariable "database_username" {\n  type      = string\n  default   = "appadmin"\n  sensitive = true\n}\n\nvariable "database_password" {\n  type      = string\n  sensitive = true\n  validation {\n    condition     = length(var.database_password) >= 16\n    error_message = "Use a database password with at least 16 characters."\n  }\n}`,
    azure: `variable "subscription_id" { type = string }\nvariable "resource_group_name" { type = string; default = "rg-infracanvas-production" }\nvariable "location" { type = string; default = "East US" }\nvariable "admin_username" { type = string; default = "azureadmin" }\nvariable "ssh_public_key" { type = string; sensitive = true }\nvariable "database_username" { type = string; default = "sqladmin"; sensitive = true }\nvariable "database_password" { type = string; sensitive = true }`,
    gcp: `variable "project_id" { type = string }\nvariable "region" { type = string; default = "us-central1" }`,
    oci: `variable "tenancy_ocid" { type = string }\nvariable "compartment_id" { type = string }\nvariable "region" { type = string; default = "us-ashburn-1" }\nvariable "image_id" { type = string }\nvariable "database_password" { type = string; sensitive = true }`,
  };

  const locals: Record<ProviderId, string> = {
    aws: `locals {\n  common_tags = {\n    Project     = "InfraCanvas"\n    Environment = "production"\n    ManagedBy   = "Terraform"\n  }\n\n  # Replace placeholder values after reviewing diagram connections.\n  vpc_id                  = try(aws_vpc.${safeName(nodes.find((n) => n.serviceId === "vpc")?.values.name || "main")}.id, null)\n  subnet_id               = null\n  subnet_ids              = []\n  security_group_ids      = []\n  db_subnet_group_name    = null\n  origin_domain_name      = "example.internal"\n}`,
    azure: `locals {\n  tags = {\n    Project = "InfraCanvas"\n    Environment = "production"\n    ManagedBy = "Terraform"\n  }\n  virtual_network_name  = "replace-after-review"\n  network_interface_ids = []\n  gateway_subnet_id     = null\n  public_ip_id          = null\n}`,
    gcp: `locals {\n  labels = { project = "infracanvas", environment = "production", managed_by = "terraform" }\n  network_id      = null\n  subnetwork_id   = null\n  https_proxy_id  = null\n}`,
    oci: `locals {\n  tags = { Project = "InfraCanvas", Environment = "production", ManagedBy = "Terraform" }\n  vcn_id         = null\n  subnet_id      = null\n  subnet_ids     = []\n  route_table_id = null\n}`,
  };

  const resources = nodes
    .map((node) => {
      const definition = provider.services.find((item) => item.id === node.serviceId);
      return definition ? terraformForNode(provider.id, node, definition) : "";
    })
    .filter(Boolean)
    .join("\n\n");

  const relationshipComments =
    edges.length > 0
      ? edges
          .map((edge) => {
            const from = nodes.find((node) => node.id === edge.from);
            const to = nodes.find((node) => node.id === edge.to);
            return `# ${from?.values.name || edge.from} -> ${to?.values.name || edge.to}`;
          })
          .join("\n")
      : "# No diagram connections defined.";

  return `# =============================================================================
# InfraCanvas generated Terraform
# Provider: ${provider.name}
# Generated from ${nodes.length} resources and ${edges.length} connections
#
# Review TODO placeholders, supply sensitive variables through a secure
# secrets manager, then run: terraform fmt && terraform validate && terraform plan
# =============================================================================

${providerHeaders[provider.id]}

# --- variables.tf ------------------------------------------------------------

${variables[provider.id]}

# --- locals.tf ---------------------------------------------------------------

${locals[provider.id]}

# --- diagram relationships ---------------------------------------------------

${relationshipComments}

# --- main.tf -----------------------------------------------------------------

${resources || "# Drag resources onto the canvas to generate infrastructure."}

# --- outputs.tf --------------------------------------------------------------

output "architecture_summary" {
  description = "Resources represented by the InfraCanvas diagram"
  value = {
    provider    = ${quote(provider.shortName)}
    resources   = ${nodes.length}
    connections = ${edges.length}
  }
}
`;
}

function LogoMark({ provider, compact = false }: { provider: ProviderDefinition; compact?: boolean }) {
  return (
    <span
      className={`provider-mark provider-mark-${provider.id}${compact ? " compact" : ""}`}
      style={{ "--provider-accent": provider.accent } as React.CSSProperties}
      aria-hidden="true"
    >
      {provider.logo}
    </span>
  );
}

export default function Home() {
  const [providerId, setProviderId] = useState<ProviderId>("aws");
  const [providerPickerOpen, setProviderPickerOpen] = useState(true);
  const [nodes, setNodes] = useState<DiagramNode[]>([]);
  const [edges, setEdges] = useState<DiagramEdge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [zoom, setZoom] = useState(1);
  const [connectMode, setConnectMode] = useState(false);
  const [connectionStart, setConnectionStart] = useState<string | null>(null);
  const [connectionSide, setConnectionSide] = useState<"input" | "output">("output");
  const [connectionPointer, setConnectionPointer] = useState<{ x: number; y: number } | null>(null);
  const [handMode, setHandMode] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [mobileLibraryOpen, setMobileLibraryOpen] = useState(false);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [projectName, setProjectName] = useState("Production web platform");
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const panRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);

  const provider = providers.find((item) => item.id === providerId) ?? providers[0];
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedService = selectedNode
    ? provider.services.find((serviceItem) => serviceItem.id === selectedNode.serviceId) ?? null
    : null;
  const terraform = useMemo(
    () => generateTerraform(provider, nodes, edges),
    [provider, nodes, edges],
  );
  const activeWorkflowStep = providerPickerOpen ? 0 : codeOpen ? 2 : 1;

  const groupedServices = useMemo(() => {
    const filtered = provider.services.filter((item) =>
      `${item.name} ${item.category} ${item.description}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    );
    return filtered.reduce<Record<string, ServiceDefinition[]>>((acc, item) => {
      (acc[item.category] ??= []).push(item);
      return acc;
    }, {});
  }, [provider, search]);

  useEffect(() => {
    const stored = window.localStorage.getItem("infracanvas-project");
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as {
        providerId?: ProviderId;
        nodes?: DiagramNode[];
        edges?: DiagramEdge[];
        projectName?: string;
      };
      if (parsed.providerId && providers.some((p) => p.id === parsed.providerId)) {
        setProviderId(parsed.providerId);
        setNodes(parsed.nodes ?? []);
        setEdges(parsed.edges ?? []);
        setProjectName(parsed.projectName ?? "Production web platform");
        setProviderPickerOpen(false);
      }
    } catch {
      window.localStorage.removeItem("infracanvas-project");
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const loadSample = (nextProvider: ProviderDefinition) => {
    const ids = sampleServiceIds[nextProvider.id];
    const positions = [
      { x: 90, y: 155 },
      { x: 340, y: 155 },
      { x: 590, y: 155 },
      { x: 590, y: 355 },
      { x: 340, y: 355 },
    ];
    const sampleNodes = ids.map((serviceId, index) => {
      const definition = nextProvider.services.find((item) => item.id === serviceId)!;
      return {
        id: `${serviceId}-${Date.now()}-${index}`,
        serviceId,
        ...positions[index],
        values: defaultValues(definition, index + 1),
      };
    });
    const sampleEdges = sampleNodes.slice(0, -1).map((node, index) => ({
      id: `edge-${node.id}-${sampleNodes[index + 1].id}`,
      from: node.id,
      to: sampleNodes[index + 1].id,
    }));
    setNodes(sampleNodes);
    setEdges(sampleEdges);
    setSelectedNodeId(sampleNodes[2]?.id ?? sampleNodes[0]?.id ?? null);
  };

  const chooseProvider = (nextId: ProviderId) => {
    const nextProvider = providers.find((item) => item.id === nextId)!;
    setProviderId(nextId);
    loadSample(nextProvider);
    setProviderPickerOpen(false);
    setCodeOpen(false);
    setSearch("");
    setToast(`${nextProvider.shortName} resource library loaded`);
  };

  const addNode = (serviceId: string, x = 360, y = 220) => {
    const definition = provider.services.find((item) => item.id === serviceId);
    if (!definition) return;
    const nextNode: DiagramNode = {
      id: `${serviceId}-${Date.now()}`,
      serviceId,
      x,
      y,
      values: defaultValues(definition, nodes.length + 1),
    };
    setNodes((current) => [...current, nextNode]);
    setSelectedNodeId(nextNode.id);
    setMobileLibraryOpen(false);
    setToast(`${definition.name} added`);
  };

  const onCanvasDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const serviceId = event.dataTransfer.getData("application/infracanvas-service");
    if (!serviceId || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    addNode(
      serviceId,
      Math.max(16, (event.clientX - rect.left) / zoom - 88),
      Math.max(16, (event.clientY - rect.top) / zoom - 40),
    );
  };

  const onNodePointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
    node: DiagramNode,
  ) => {
    if (connectMode || handMode) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      id: node.id,
      startX: event.clientX,
      startY: event.clientY,
      originX: node.x,
      originY: node.y,
    };
    setSelectedNodeId(node.id);
  };

  const onNodePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = dragRef.current;
    if (!active || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const x = Math.max(10, active.originX + (event.clientX - active.startX) / zoom);
    const y = Math.max(10, active.originY + (event.clientY - active.startY) / zoom);
    setNodes((current) =>
      current.map((node) => (node.id === active.id ? { ...node, x, y } : node)),
    );
  };

  const finishNodeDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
  };

  const handleNodeClick = (nodeId: string) => {
    if (handMode) return;
    if (!connectMode) {
      setSelectedNodeId(nodeId);
      return;
    }
    if (!connectionStart) {
      setConnectionStart(nodeId);
      setConnectionSide("output");
      const source = nodes.find((node) => node.id === nodeId);
      if (source) setConnectionPointer({ x: source.x + 176, y: source.y + 43 });
      setToast("Choose a destination resource");
      return;
    }
    if (connectionStart === nodeId) {
      setConnectionStart(null);
      setConnectionPointer(null);
      return;
    }
    const exists = edges.some(
      (edge) =>
        (edge.from === connectionStart && edge.to === nodeId) ||
        (edge.from === nodeId && edge.to === connectionStart),
    );
    if (!exists) {
      setEdges((current) => [
        ...current,
        {
          id: `edge-${connectionStart}-${nodeId}-${Date.now()}`,
          from: connectionStart,
          to: nodeId,
        },
      ]);
      setToast("Resources connected");
    }
    setConnectionStart(null);
    setConnectionPointer(null);
    setConnectMode(false);
  };

  const startConnectionFromPort = (nodeId: string, side: "input" | "output") => {
    if (connectionStart && connectionStart !== nodeId) {
      handleNodeClick(nodeId);
      return;
    }

    const source = nodes.find((node) => node.id === nodeId);
    if (!source) return;
    setHandMode(false);
    setConnectMode(true);
    setConnectionStart(nodeId);
    setConnectionSide(side);
    setConnectionPointer({
      x: side === "input" ? source.x : source.x + 176,
      y: source.y + 43,
    });
    setToast("Connection started — choose another resource");
  };

  const handleConnectionPort = (
    event: ReactPointerEvent<HTMLSpanElement>,
    nodeId: string,
    side: "input" | "output",
  ) => {
    event.preventDefault();
    event.stopPropagation();
    startConnectionFromPort(nodeId, side);
  };

  const onCanvasPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!handMode) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    panRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: event.currentTarget.scrollLeft,
      scrollTop: event.currentTarget.scrollTop,
    };
    setIsPanning(true);
  };

  const onCanvasPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const canvas = event.currentTarget;
    const activePan = panRef.current;
    if (activePan && activePan.pointerId === event.pointerId) {
      canvas.scrollLeft = activePan.scrollLeft - (event.clientX - activePan.startX);
      canvas.scrollTop = activePan.scrollTop - (event.clientY - activePan.startY);
      return;
    }

    if (connectionStart) {
      const rect = canvas.getBoundingClientRect();
      setConnectionPointer({
        x: (event.clientX - rect.left + canvas.scrollLeft) / zoom,
        y: (event.clientY - rect.top + canvas.scrollTop) / zoom,
      });
    }
  };

  const finishCanvasPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    panRef.current = null;
    setIsPanning(false);
  };

  const updateSelectedNode = (key: string, value: string) => {
    if (!selectedNodeId) return;
    setNodes((current) =>
      current.map((node) =>
        node.id === selectedNodeId
          ? { ...node, values: { ...node.values, [key]: value } }
          : node,
      ),
    );
  };

  const deleteSelected = () => {
    if (!selectedNodeId) return;
    setNodes((current) => current.filter((node) => node.id !== selectedNodeId));
    setEdges((current) =>
      current.filter(
        (edge) => edge.from !== selectedNodeId && edge.to !== selectedNodeId,
      ),
    );
    setSelectedNodeId(null);
    setToast("Resource removed");
  };

  const saveProject = () => {
    window.localStorage.setItem(
      "infracanvas-project",
      JSON.stringify({ providerId, nodes, edges, projectName }),
    );
    setToast("Project saved in this browser");
  };

  const copyTerraform = async () => {
    await navigator.clipboard.writeText(terraform);
    setToast("Terraform copied to clipboard");
  };

  const downloadTerraform = () => {
    const blob = new Blob([terraform], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeName(projectName).replaceAll("_", "-") || "infrastructure"}.tf`;
    link.click();
    URL.revokeObjectURL(url);
    setToast("Terraform file downloaded");
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup" aria-label="InfraCanvas home">
          <span className="brand-symbol" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="brand-name">InfraCanvas</span>
          <span className="beta-pill">BETA</span>
        </div>

        <div className="project-title-wrap">
          <span className="breadcrumb">Projects /</span>
          <input
            aria-label="Project name"
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
          />
          <span className="saved-state">Local draft</span>
        </div>

        <div className="top-actions">
          <button className="icon-button mobile-only" onClick={() => setMobileLibraryOpen(true)} aria-label="Open resource library">
            +
          </button>
          <button className="ghost-button" onClick={saveProject}>
            Save project
          </button>
          <button className="generate-button" onClick={() => setCodeOpen((current) => !current)}>
            <span className="code-glyph" aria-hidden="true">{codeOpen ? "←" : "</>"}</span>
            {codeOpen ? "Back to design" : "Generate Terraform"}
            {!codeOpen && <span className="key-hint">⌘↵</span>}
          </button>
          <button className="avatar-button" aria-label="Open account menu">
            AD
          </button>
        </div>
      </header>

      <div className="workflow-bar">
        <ol className="workflow-steps" aria-label="Builder workflow">
          {["Provider", "Design & Configure", "Generate"].map((label, index) => (
            <li
              key={label}
              className={
                index === activeWorkflowStep
                  ? "active"
                  : index < activeWorkflowStep
                    ? "complete"
                    : ""
              }
            >
              <span>{index < activeWorkflowStep ? "✓" : index + 1}</span>
              {label}
            </li>
          ))}
        </ol>
        <div className="validation-status">
          <span className="status-dot" />
          {codeOpen ? "Terraform generated" : "Diagram ready"}
          <span>{nodes.length} resources</span>
          <span>{edges.length} connections</span>
        </div>
      </div>

      {!codeOpen && (
      <section className="workspace">
        <aside className={`library-panel ${mobileLibraryOpen ? "mobile-open" : ""}`}>
          <div className="panel-heading provider-heading">
            <button
              className="provider-switcher"
              onClick={() => setProviderPickerOpen(true)}
              aria-label="Change cloud provider"
            >
              <LogoMark provider={provider} compact />
              <span>
                <small>Cloud provider</small>
                <strong>{provider.shortName}</strong>
              </span>
              <b aria-hidden="true">⌄</b>
            </button>
            <button className="mobile-close" onClick={() => setMobileLibraryOpen(false)} aria-label="Close resource library">×</button>
          </div>

          <label className="search-box">
            <span aria-hidden="true" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={`Search ${provider.shortName} services`}
              aria-label={`Search ${provider.shortName} services`}
            />
            <kbd>/</kbd>
          </label>

          <div className="service-library">
            {Object.entries(groupedServices).map(([category, items]) => {
              const collapsed = collapsedCategories.has(category);
              return (
                <section className="service-category" key={category}>
                  <button
                    className="category-title"
                    onClick={() =>
                      setCollapsedCategories((current) => {
                        const next = new Set(current);
                        if (next.has(category)) next.delete(category);
                        else next.add(category);
                        return next;
                      })
                    }
                    aria-expanded={!collapsed}
                  >
                    <span>{category}</span>
                    <b>{items.length}</b>
                    <i aria-hidden="true">{collapsed ? "›" : "⌄"}</i>
                  </button>
                  {!collapsed && (
                    <div className="service-list">
                      {items.map((item) => (
                        <button
                          className="service-item"
                          draggable
                          key={item.id}
                          onDragStart={(event) => {
                            event.dataTransfer.setData(
                              "application/infracanvas-service",
                              item.id,
                            );
                            event.dataTransfer.effectAllowed = "copy";
                          }}
                          onDoubleClick={() => addNode(item.id)}
                          title={`Drag ${item.name} to the canvas or double-click to add`}
                        >
                          <span
                            className="service-icon"
                            style={{ "--service-accent": item.accent } as React.CSSProperties}
                          >
                            {item.short}
                          </span>
                          <span>
                            <strong>{item.name}</strong>
                            <small>{item.description}</small>
                          </span>
                          <b className="drag-grip" aria-hidden="true">⠿</b>
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
            {Object.keys(groupedServices).length === 0 && (
              <div className="empty-search">
                <strong>No services found</strong>
                <span>Try another resource name or category.</span>
              </div>
            )}
          </div>

          <div className="library-tip">
            <span className="tip-icon">i</span>
            <p><strong>Drag to create</strong><br />Double-click also adds a resource to the canvas.</p>
          </div>
        </aside>

        <div className="canvas-stage">
          <div className="canvas-toolbar" role="toolbar" aria-label="Diagram tools">
            <button
              className={`hand-tool-button ${handMode ? "selected" : ""}`}
              onClick={() => {
                setHandMode((current) => !current);
                setConnectMode(false);
                setConnectionStart(null);
                setConnectionPointer(null);
              }}
              aria-pressed={handMode}
              title="Pan around the canvas"
            >
              <span className="hand-icon" aria-hidden="true"><i /><i /><i /></span>
              <span className="tool-copy"><strong>Hand</strong><small>Pan canvas</small></span>
            </button>
            <button
              className={`connection-tool-button ${connectMode ? "selected" : ""}`}
              onClick={() => {
                setConnectMode((current) => !current);
                setConnectionStart(null);
                setConnectionPointer(null);
                setHandMode(false);
              }}
              aria-pressed={connectMode}
              title="Connect resources"
            >
              <span className="connector-icon" aria-hidden="true"><i /><i /></span>
              <span className="tool-copy"><strong>Connect</strong><small>Link resources</small></span>
            </button>
            <span className="toolbar-divider" />
            <button onClick={() => setZoom((value) => Math.max(0.6, value - 0.1))} aria-label="Zoom out">−</button>
            <button className="zoom-readout" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
            <button onClick={() => setZoom((value) => Math.min(1.4, value + 0.1))} aria-label="Zoom in">+</button>
            <button onClick={() => setZoom(0.9)}>Fit</button>
            <span className="toolbar-divider" />
            <button
              onClick={() => {
                setNodes([]);
                setEdges([]);
                setSelectedNodeId(null);
                setToast("Canvas cleared");
              }}
              disabled={nodes.length === 0}
            >
              Clear
            </button>
          </div>

          <div
            className={`diagram-canvas ${connectMode ? "is-connecting" : ""} ${handMode ? "is-hand-tool" : ""} ${isPanning ? "is-panning" : ""}`}
            ref={canvasRef}
            onPointerDown={onCanvasPointerDown}
            onPointerMove={onCanvasPointerMove}
            onPointerUp={finishCanvasPan}
            onPointerCancel={finishCanvasPan}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
            }}
            onDrop={onCanvasDrop}
            onClick={(event) => {
              if (event.target === event.currentTarget && !handMode) setSelectedNodeId(null);
            }}
            style={{
              "--canvas-zoom": zoom,
              "--grid-size": `${24 * zoom}px`,
            } as React.CSSProperties}
          >
            <div className="canvas-content" style={{ transform: `scale(${zoom})` }}>
              <svg className="edge-layer" width="1600" height="1000" aria-hidden="true">
                <defs>
                  <marker
                    id="edge-arrow"
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" />
                  </marker>
                </defs>
                {edges.map((edge) => {
                  const from = nodes.find((node) => node.id === edge.from);
                  const to = nodes.find((node) => node.id === edge.to);
                  if (!from || !to) return null;
                  const x1 = from.x + 176;
                  const y1 = from.y + 43;
                  const x2 = to.x;
                  const y2 = to.y + 43;
                  const curve = Math.max(70, Math.abs(x2 - x1) * 0.45);
                  return (
                    <path
                      key={edge.id}
                      d={`M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`}
                      markerEnd="url(#edge-arrow)"
                    />
                  );
                })}
                {connectionStart && connectionPointer && (() => {
                  const source = nodes.find((node) => node.id === connectionStart);
                  if (!source) return null;
                  const x1 = connectionSide === "input" ? source.x : source.x + 176;
                  const y1 = source.y + 43;
                  const x2 = connectionPointer.x;
                  const y2 = connectionPointer.y;
                  const direction = connectionSide === "input" ? -1 : 1;
                  const curve = Math.max(70, Math.abs(x2 - x1) * 0.4);
                  return (
                    <path
                      className="pending-edge"
                      d={`M ${x1} ${y1} C ${x1 + curve * direction} ${y1}, ${x2 - curve * direction} ${y2}, ${x2} ${y2}`}
                      markerEnd="url(#edge-arrow)"
                    />
                  );
                })()}
              </svg>

              {nodes.map((node) => {
                const definition = provider.services.find((item) => item.id === node.serviceId);
                if (!definition) return null;
                const selected = selectedNodeId === node.id;
                const connecting = connectionStart === node.id;
                return (
                  <div
                    key={node.id}
                    className={`diagram-node ${selected ? "selected" : ""} ${connecting ? "connection-start" : ""}`}
                    style={{
                      left: node.x,
                      top: node.y,
                      "--service-accent": definition.accent,
                    } as React.CSSProperties}
                    onPointerDown={(event) => onNodePointerDown(event, node)}
                    onPointerMove={onNodePointerMove}
                    onPointerUp={finishNodeDrag}
                    onPointerCancel={finishNodeDrag}
                    onClick={() => handleNodeClick(node.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        handleNodeClick(node.id);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={`${node.values.name}, ${definition.name}`}
                  >
                    <span
                      className="node-port input-port"
                      role="button"
                      tabIndex={0}
                      aria-label={`Start or finish a connection on the left side of ${node.values.name}`}
                      title="Connect from this side"
                      onPointerDown={(event) => handleConnectionPort(event, node.id, "input")}
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          event.stopPropagation();
                          startConnectionFromPort(node.id, "input");
                        }
                      }}
                    >
                      <i aria-hidden="true">+</i>
                    </span>
                    <span className="node-service-icon">{definition.short}</span>
                    <span className="node-copy">
                      <strong>{node.values.name}</strong>
                      <small>{definition.name}</small>
                    </span>
                    <span className="node-status" title="Configuration ready" />
                    <span
                      className="node-port output-port"
                      role="button"
                      tabIndex={0}
                      aria-label={`Start or finish a connection on the right side of ${node.values.name}`}
                      title="Connect from this side"
                      onPointerDown={(event) => handleConnectionPort(event, node.id, "output")}
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          event.stopPropagation();
                          startConnectionFromPort(node.id, "output");
                        }
                      }}
                    >
                      <i aria-hidden="true">+</i>
                    </span>
                  </div>
                );
              })}

              {nodes.length === 0 && (
                <div className="empty-canvas">
                  <span className="empty-canvas-graphic">
                    <i />
                    <i />
                    <i />
                  </span>
                  <strong>Start composing your architecture</strong>
                  <p>Drag cloud services from the library and connect them to define the flow.</p>
                  <button onClick={() => loadSample(provider)}>Load example architecture</button>
                </div>
              )}
            </div>

            <div className="canvas-badge">
              <span>{provider.shortName}</span>
              <strong>{projectName}</strong>
            </div>
            {connectMode && (
              <div className="connect-guidance">
                <span />
                {connectionStart ? "Select a destination resource" : "Select the first resource"}
                <button onClick={() => {
                  setConnectMode(false);
                  setConnectionStart(null);
                  setConnectionPointer(null);
                }}>Cancel</button>
              </div>
            )}
          </div>

          <footer className="canvas-footer">
            <span>Region: {provider.id === "azure" ? "East US" : provider.id === "gcp" ? "us-central1" : provider.id === "oci" ? "us-ashburn-1" : "us-east-1"}</span>
            <span>Grid: 24px</span>
            <span className="keyboard-note">Hold shift for multi-select · Delete removes a resource</span>
            <button className="mobile-inspector-button" onClick={() => setMobileInspectorOpen(true)}>Configure selected</button>
          </footer>
        </div>

        <aside className={`inspector-panel ${mobileInspectorOpen ? "mobile-open" : ""}`}>
          <div className="panel-heading inspector-heading">
            <div>
              <span className="eyebrow">Configuration</span>
              <h2>{selectedService ? selectedService.name : "Resource settings"}</h2>
            </div>
            <button className="mobile-close" onClick={() => setMobileInspectorOpen(false)} aria-label="Close resource inspector">×</button>
          </div>

          {selectedNode && selectedService ? (
            <>
              <div className="selected-resource-card">
                <span
                  className="selected-resource-icon"
                  style={{ "--service-accent": selectedService.accent } as React.CSSProperties}
                >
                  {selectedService.short}
                </span>
                <span>
                  <strong>{selectedNode.values.name}</strong>
                  <small>{provider.shortName} · {selectedService.category}</small>
                </span>
                <span className="configured-pill">Configured</span>
              </div>

              <div className="form-section">
                <div className="form-section-title">
                  <span>General</span>
                  <i />
                </div>
                <label className="field">
                  <span>Resource name</span>
                  <input
                    value={selectedNode.values.name}
                    onChange={(event) => updateSelectedNode("name", event.target.value)}
                  />
                  <small>Terraform: {safeName(selectedNode.values.name)}</small>
                </label>
              </div>

              <div className="form-section">
                <div className="form-section-title">
                  <span>Resource properties</span>
                  <i />
                </div>
                {selectedService.fields.map((item) => (
                  <label className="field" key={item.key}>
                    <span>{item.label}</span>
                    {item.options ? (
                      <select
                        value={selectedNode.values[item.key] ?? item.options[0]}
                        onChange={(event) => updateSelectedNode(item.key, event.target.value)}
                      >
                        {item.options.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={item.type ?? "text"}
                        value={selectedNode.values[item.key] ?? ""}
                        placeholder={item.placeholder}
                        onChange={(event) => updateSelectedNode(item.key, event.target.value)}
                      />
                    )}
                  </label>
                ))}
              </div>

              <div className="form-section">
                <div className="form-section-title">
                  <span>Terraform preview</span>
                  <i />
                </div>
                <pre className="mini-code">
                  <code>{terraformForNode(provider.id, selectedNode, selectedService).slice(0, 430)}</code>
                </pre>
                <button className="view-code-link" onClick={() => setCodeOpen(true)}>
                  View full generated code <span>→</span>
                </button>
              </div>

              <div className="inspector-actions">
                <button className="danger-button" onClick={deleteSelected}>Remove resource</button>
                <button className="primary-small" onClick={() => setCodeOpen(true)}>Generate</button>
              </div>
            </>
          ) : (
            <div className="empty-inspector">
              <span className="selection-graphic"><i /><i /></span>
              <strong>Select a resource</strong>
              <p>Choose any node on the canvas to configure its infrastructure values.</p>
            </div>
          )}
        </aside>
      </section>
      )}

      {providerPickerOpen && (
        <div className="modal-backdrop provider-modal-backdrop" role="presentation">
          <section className="provider-modal" role="dialog" aria-modal="true" aria-labelledby="provider-title">
            <div className="modal-brand">
              <span className="brand-symbol"><i /><i /><i /></span>
              InfraCanvas
            </div>
            <span className="step-chip">STEP 1 OF 3</span>
            <h1 id="provider-title">Where are you building?</h1>
            <p>Choose a cloud provider. We’ll load its native services, properties, and Terraform provider automatically.</p>
            <div className="provider-grid">
              {providers.map((item) => (
                <button
                  key={item.id}
                  className={`provider-card ${item.id === providerId ? "current" : ""}`}
                  onClick={() => chooseProvider(item.id)}
                  style={{ "--provider-accent": item.accent } as React.CSSProperties}
                >
                  <LogoMark provider={item} />
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.tagline}</small>
                  </span>
                  <i aria-hidden="true">→</i>
                </button>
              ))}
            </div>
            <div className="provider-modal-footer">
              <span><i /> Official provider resources</span>
              <span><i /> Editable Terraform templates</span>
              <span><i /> Local-first project saves</span>
            </div>
          </section>
        </div>
      )}

      {codeOpen && (
        <section className="terraform-page" aria-labelledby="code-title">
          <section className="code-modal">
            <header className="code-modal-header">
              <div>
                <button className="back-design-button" onClick={() => setCodeOpen(false)} aria-label="Return to the architecture canvas">
                  <span aria-hidden="true">←</span>
                </button>
                <span className="code-modal-icon">&lt;/&gt;</span>
                <span>
                  <small>Step 3 · Generated infrastructure</small>
                  <h2 id="code-title">Terraform template</h2>
                </span>
              </div>
              <div className="code-modal-actions">
                <button className="ghost-button" onClick={copyTerraform}>Copy code</button>
                <button className="download-button" onClick={downloadTerraform}>Download .tf</button>
              </div>
            </header>
            <div className="code-summary">
              <span><LogoMark provider={provider} compact /> {provider.name}</span>
              <span>{nodes.length} resources</span>
              <span>{edges.length} dependencies</span>
              <span className="code-ready"><i /> Ready for review</span>
            </div>
            <div className="code-workspace">
              <nav className="file-tree" aria-label="Terraform files">
                <strong>INFRASTRUCTURE</strong>
                <button className="active"><span>tf</span> main.tf</button>
                <button><span>tf</span> variables.tf</button>
                <button><span>tf</span> outputs.tf</button>
                <button><span>tf</span> versions.tf</button>
                <div className="code-callout">
                  <strong>Before deployment</strong>
                  <p>Replace TODO placeholders and pass secrets through your CI/CD vault.</p>
                </div>
              </nav>
              <div className="code-editor">
                <div className="editor-tab"><span>tf</span> main.tf <i>×</i></div>
                <pre>
                  <code>{terraform.split("\n").map((line, index) => (
                    <span className="code-line" key={`${index}-${line}`}>
                      <b>{index + 1}</b>
                      <em>{line || " "}</em>
                    </span>
                  ))}</code>
                </pre>
              </div>
            </div>
            <footer className="code-modal-footer">
              <p><span>i</span> This is a secure starting template. Always run <code>terraform validate</code> and review <code>terraform plan</code> before applying.</p>
              <button onClick={downloadTerraform}>Download Terraform</button>
            </footer>
          </section>
        </section>
      )}

      <div className={`toast ${toast ? "show" : ""}`} aria-live="polite">
        <span>✓</span>{toast}
      </div>
    </main>
  );
}
