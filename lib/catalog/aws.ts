import {
  attr,
  block,
  bool,
  dnsName,
  expr,
  flag,
  list,
  listOf,
  num,
  raw,
  resource,
  str,
} from "../hcl";
import type { ProviderDefinition, VariableSpec } from "../types";
import { defineService, number, select, text, toggle } from "./helpers";

const REGIONS = [
  "us-east-1",
  "us-east-2",
  "us-west-2",
  "eu-west-1",
  "eu-central-1",
  "ap-south-1",
  "ap-southeast-1",
  "ap-northeast-1",
  "sa-east-1",
];

const VPC_VAR: VariableSpec = {
  name: "vpc_id",
  type: "string",
  description: "Existing VPC id used when the diagram has no VPC connected to a resource.",
};

const SUBNET_VAR: VariableSpec = {
  name: "subnet_id",
  type: "string",
  description: "Existing subnet id used when a compute resource is not connected to a subnet.",
};

const SUBNETS_VAR: VariableSpec = {
  name: "subnet_ids",
  type: "list(string)",
  description: "Subnet ids used when the diagram does not connect subnets to a resource.",
  default: listOf([]),
};

const SG_VAR: VariableSpec = {
  name: "security_group_ids",
  type: "list(string)",
  description: "Security group ids applied when no security group is connected in the diagram.",
  default: listOf([]),
};

export const aws: ProviderDefinition = {
  id: "aws",
  name: "Amazon Web Services",
  shortName: "AWS",
  tagline: "Compose VPCs, compute, data, and edge services with the AWS provider.",
  accent: "#ff9900",
  source: "hashicorp/aws",
  versionConstraint: "~> 6.0",
  defaultRegion: "us-east-1",
  services: [
    /* ------------------------------------------------------------ Networking */
    defineService({
      id: "vpc",
      name: "Virtual Private Cloud",
      short: "VPC",
      category: "Networking",
      role: "network",
      tfType: "aws_vpc",
      description: "Isolated network boundary",
      docs: "https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/vpc",
      fields: [
        text("cidr", "IPv4 CIDR", "10.0.0.0/16"),
        toggle("dns_hostnames", "Enable DNS hostnames", true),
        select("tenancy", "Instance tenancy", ["default", "dedicated"]),
      ],
      emit: (c) => {
        c.output({
          name: `${c.name}_id`,
          value: raw(`aws_vpc.${c.name}.id`),
          description: `Id of the ${c.display} VPC`,
        });
        return [
          resource("aws_vpc", c.name, [
            attr("cidr_block", str(c.v.cidr || "10.0.0.0/16")),
            attr("instance_tenancy", str(c.v.tenancy || "default")),
            attr("enable_dns_support", bool(true)),
            attr("enable_dns_hostnames", flag(c.v.dns_hostnames, true)),
            attr("tags", raw(`merge(local.tags, { Name = "${c.display}" })`)),
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
      tfType: "aws_subnet",
      description: "Routable network segment inside a VPC",
      docs: "https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/subnet",
      fields: [
        text("cidr", "Subnet CIDR", "10.0.1.0/24"),
        select("availability_zone", "Availability zone suffix", ["a", "b", "c"]),
        select("visibility", "Visibility", ["private", "public"]),
      ],
      emit: (c) => [
        resource("aws_subnet", c.name, [
          attr("vpc_id", c.ref("network", "id", VPC_VAR)),
          attr("cidr_block", str(c.v.cidr || "10.0.1.0/24")),
          attr("availability_zone", raw(`"\${var.region}${c.v.availability_zone || "a"}"`)),
          attr("map_public_ip_on_launch", bool(c.v.visibility === "public")),
          attr("tags", raw(`merge(local.tags, { Name = "${c.display}", Tier = "${c.v.visibility || "private"}" })`)),
        ]),
      ],
    }),
    defineService({
      id: "internet_gateway",
      name: "Internet Gateway",
      short: "IGW",
      category: "Networking",
      role: "gateway",
      tfType: "aws_internet_gateway",
      description: "Public internet egress for a VPC",
      fields: [],
      emit: (c) => [
        resource("aws_internet_gateway", c.name, [
          attr("vpc_id", c.ref("network", "id", VPC_VAR)),
          attr("tags", raw(`merge(local.tags, { Name = "${c.display}" })`)),
        ]),
        resource("aws_route_table", `${c.name}_public`, [
          attr("vpc_id", c.ref("network", "id", VPC_VAR)),
          block("route", [], [
            attr("cidr_block", str("0.0.0.0/0")),
            attr("gateway_id", raw(`aws_internet_gateway.${c.name}.id`)),
          ]),
          attr("tags", raw(`merge(local.tags, { Name = "${c.display}-public" })`)),
        ]),
      ],
    }),
    defineService({
      id: "nat_gateway",
      name: "NAT Gateway",
      short: "NAT",
      category: "Networking",
      role: "gateway",
      tfType: "aws_nat_gateway",
      description: "Outbound-only internet access for private subnets",
      fields: [select("connectivity_type", "Connectivity", ["public", "private"])],
      emit: (c) => {
        const entries = [];
        if (c.v.connectivity_type !== "private") {
          entries.push(
            resource("aws_eip", `${c.name}`, [
              attr("domain", str("vpc")),
              attr("tags", raw(`merge(local.tags, { Name = "${c.display}" })`)),
            ]),
          );
        }
        entries.push(
          resource("aws_nat_gateway", c.name, [
            attr("connectivity_type", str(c.v.connectivity_type || "public")),
            ...(c.v.connectivity_type === "private"
              ? []
              : [attr("allocation_id", raw(`aws_eip.${c.name}.id`))]),
            attr("subnet_id", c.ref("subnet", "id", SUBNET_VAR)),
            attr("tags", raw(`merge(local.tags, { Name = "${c.display}" })`)),
          ]),
        );
        return entries;
      },
    }),
    defineService({
      id: "alb",
      name: "Application Load Balancer",
      short: "ALB",
      category: "Networking",
      role: "loadbalancer",
      tfType: "aws_lb",
      description: "Layer 7 HTTP/HTTPS traffic distribution",
      docs: "https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lb",
      fields: [
        select("scheme", "Scheme", ["internet-facing", "internal"]),
        select("protocol", "Listener protocol", ["HTTPS", "HTTP"]),
        number("port", "Listener port", "443"),
        text("health_check_path", "Health check path", "/health"),
        toggle("deletion_protection", "Deletion protection", false),
      ],
      emit: (c) => {
        const certificate = c.variable({
          name: "acm_certificate_arn",
          type: "string",
          description: "ACM certificate ARN for HTTPS listeners.",
          default: str(""),
        });
        c.output({
          name: `${c.name}_dns_name`,
          value: raw(`aws_lb.${c.name}.dns_name`),
          description: `Public DNS name of ${c.display}`,
        });
        const isHttps = (c.v.protocol || "HTTPS") === "HTTPS";
        return [
          resource("aws_lb", c.name, [
            attr("name", str(dnsName(c.display, "app-lb", 32))),
            attr("internal", bool(c.v.scheme === "internal")),
            attr("load_balancer_type", str("application")),
            attr("security_groups", c.refList("firewall", "id", SG_VAR)),
            attr("subnets", c.refList("subnet", "id", SUBNETS_VAR)),
            attr("drop_invalid_header_fields", bool(true)),
            attr("enable_deletion_protection", flag(c.v.deletion_protection, false)),
            attr("tags", c.tags),
          ]),
          resource("aws_lb_target_group", c.name, [
            attr("name", str(dnsName(`${c.display}-tg`, "app-tg", 32))),
            attr("port", num(c.v.port, 443)),
            attr("protocol", str(isHttps ? "HTTPS" : "HTTP")),
            attr("target_type", str("instance")),
            attr("vpc_id", c.ref("network", "id", VPC_VAR)),
            block("health_check", [], [
              attr("path", str(c.v.health_check_path || "/health")),
              attr("matcher", str("200-399")),
              attr("healthy_threshold", num(2, 2)),
              attr("unhealthy_threshold", num(3, 3)),
            ]),
            attr("tags", c.tags),
          ]),
          resource("aws_lb_listener", c.name, [
            attr("load_balancer_arn", raw(`aws_lb.${c.name}.arn`)),
            attr("port", num(c.v.port, 443)),
            attr("protocol", str(isHttps ? "HTTPS" : "HTTP")),
            ...(isHttps
              ? [
                  attr("ssl_policy", str("ELBSecurityPolicy-TLS13-1-2-2021-06")),
                  attr("certificate_arn", certificate),
                ]
              : []),
            block("default_action", [], [
              attr("type", str("forward")),
              attr("target_group_arn", raw(`aws_lb_target_group.${c.name}.arn`)),
            ]),
            attr("tags", c.tags),
          ]),
        ];
      },
    }),
    defineService({
      id: "cloudfront",
      name: "CloudFront Distribution",
      short: "CF",
      category: "Networking",
      role: "cdn",
      tfType: "aws_cloudfront_distribution",
      description: "Global content delivery and edge caching",
      fields: [
        select("price_class", "Price class", ["PriceClass_100", "PriceClass_200", "PriceClass_All"]),
        select("min_ttl", "Minimum TTL (seconds)", ["0", "60", "3600"]),
      ],
      emit: (c) => {
        const originDomain = c.ref(
          ["loadbalancer", "storage"],
          (targetRef) =>
            targetRef.tfType === "aws_s3_bucket"
              ? `aws_s3_bucket.${targetRef.name}.bucket_regional_domain_name`
              : `aws_lb.${targetRef.name}.dns_name`,
          {
            name: "cdn_origin_domain_name",
            type: "string",
            description: "Origin domain name used by the CloudFront distribution.",
          },
        );
        c.output({
          name: `${c.name}_domain_name`,
          value: raw(`aws_cloudfront_distribution.${c.name}.domain_name`),
          description: `Edge domain for ${c.display}`,
        });
        return [
          resource("aws_cloudfront_distribution", c.name, [
            attr("enabled", bool(true)),
            attr("is_ipv6_enabled", bool(true)),
            attr("comment", str(c.display)),
            attr("price_class", str(c.v.price_class || "PriceClass_100")),
            block("origin", [], [
              attr("domain_name", originDomain),
              attr("origin_id", str("primary")),
              block("custom_origin_config", [], [
                attr("http_port", num(80, 80)),
                attr("https_port", num(443, 443)),
                attr("origin_protocol_policy", str("https-only")),
                attr("origin_ssl_protocols", list(str("TLSv1.2"))),
              ]),
            ]),
            block("default_cache_behavior", [], [
              attr("target_origin_id", str("primary")),
              attr("viewer_protocol_policy", str("redirect-to-https")),
              attr("allowed_methods", list(str("GET"), str("HEAD"), str("OPTIONS"))),
              attr("cached_methods", list(str("GET"), str("HEAD"))),
              attr("compress", bool(true)),
              attr("min_ttl", num(c.v.min_ttl, 0)),
              attr("default_ttl", num(3600, 3600)),
              attr("max_ttl", num(86400, 86400)),
              block("forwarded_values", [], [
                attr("query_string", bool(false)),
                block("cookies", [], [attr("forward", str("none"))]),
              ]),
            ]),
            block("restrictions", [], [
              block("geo_restriction", [], [attr("restriction_type", str("none"))]),
            ]),
            block("viewer_certificate", [], [
              attr("cloudfront_default_certificate", bool(true)),
              attr("minimum_protocol_version", str("TLSv1.2_2021")),
            ]),
            attr("tags", c.tags),
          ]),
        ];
      },
    }),
    defineService({
      id: "route53",
      name: "Route 53 Record",
      short: "R53",
      category: "Networking",
      role: "dns",
      tfType: "aws_route53_record",
      description: "Hosted zone DNS record",
      fields: [text("record_name", "Record name", "app.example.com"), select("type", "Record type", ["A", "CNAME"])],
      emit: (c) => {
        const zone = c.variable({
          name: "route53_zone_id",
          type: "string",
          description: "Hosted zone id that owns the generated DNS records.",
        });
        const alias = c.ref(
          ["loadbalancer", "cdn"],
          (targetRef) =>
            targetRef.tfType === "aws_cloudfront_distribution"
              ? `aws_cloudfront_distribution.${targetRef.name}.domain_name`
              : `aws_lb.${targetRef.name}.dns_name`,
          {
            name: "dns_record_target",
            type: "string",
            description: "Target hostname for the generated DNS record.",
          },
        );
        return [
          resource("aws_route53_record", c.name, [
            attr("zone_id", zone),
            attr("name", str(c.v.record_name || "app.example.com")),
            attr("type", str(c.v.type === "CNAME" ? "CNAME" : "A")),
            attr("ttl", num(300, 300)),
            attr("records", listOf([alias])),
          ]),
        ];
      },
    }),
    defineService({
      id: "api_gateway",
      name: "API Gateway (HTTP)",
      short: "API",
      category: "Networking",
      role: "gateway",
      tfType: "aws_apigatewayv2_api",
      description: "Managed HTTP API front door",
      fields: [select("stage", "Stage name", ["prod", "staging", "dev"]), toggle("cors", "Enable CORS", true)],
      emit: (c) => {
        const integration = c.ref(
          "serverless",
          (targetRef) => `aws_lambda_function.${targetRef.name}.invoke_arn`,
          {
            name: "api_integration_uri",
            type: "string",
            description: "Backend integration URI for the HTTP API.",
          },
        );
        c.output({
          name: `${c.name}_endpoint`,
          value: raw(`aws_apigatewayv2_api.${c.name}.api_endpoint`),
          description: `Invoke URL for ${c.display}`,
        });
        return [
          resource("aws_apigatewayv2_api", c.name, [
            attr("name", str(c.display)),
            attr("protocol_type", str("HTTP")),
            ...(c.v.cors === "false"
              ? []
              : [
                  block("cors_configuration", [], [
                    attr("allow_origins", list(str("*"))),
                    attr("allow_methods", list(str("GET"), str("POST"), str("OPTIONS"))),
                    attr("allow_headers", list(str("content-type"), str("authorization"))),
                  ]),
                ]),
            attr("tags", c.tags),
          ]),
          resource("aws_apigatewayv2_integration", c.name, [
            attr("api_id", raw(`aws_apigatewayv2_api.${c.name}.id`)),
            attr("integration_type", str("AWS_PROXY")),
            attr("integration_uri", integration),
            attr("payload_format_version", str("2.0")),
          ]),
          resource("aws_apigatewayv2_route", c.name, [
            attr("api_id", raw(`aws_apigatewayv2_api.${c.name}.id`)),
            attr("route_key", str("ANY /{proxy+}")),
            attr("target", raw(`"integrations/\${aws_apigatewayv2_integration.${c.name}.id}"`)),
          ]),
          resource("aws_apigatewayv2_stage", c.name, [
            attr("api_id", raw(`aws_apigatewayv2_api.${c.name}.id`)),
            attr("name", str(c.v.stage || "prod")),
            attr("auto_deploy", bool(true)),
            attr("tags", c.tags),
          ]),
        ];
      },
    }),

    /* --------------------------------------------------------------- Compute */
    defineService({
      id: "ec2",
      name: "EC2 Instance",
      short: "EC2",
      category: "Compute",
      role: "compute",
      tfType: "aws_instance",
      description: "Resizable virtual machine",
      docs: "https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/instance",
      fields: [
        select("instance_type", "Machine type", [
          "t3.micro",
          "t3.small",
          "t3.medium",
          "t3.large",
          "m6i.large",
          "m6i.xlarge",
          "c7g.large",
          "r6i.large",
          "g5.xlarge",
        ]),
        select("os", "Operating system", ["Amazon Linux 2023", "Ubuntu 24.04 LTS"]),
        number("count", "Instance count", "2"),
        number("root_volume_size", "Root volume (GB)", "20"),
        select("volume_type", "Volume type", ["gp3", "gp2", "io2"]),
        toggle("monitoring", "Detailed monitoring", true),
      ],
      emit: (c) => {
        const isUbuntu = c.v.os === "Ubuntu 24.04 LTS";
        const amiData = isUbuntu ? "ubuntu" : "amazon_linux";
        c.data(
          `ami_${amiData}`,
          block("data", ["aws_ami", amiData], [
            attr("most_recent", bool(true)),
            attr("owners", list(str(isUbuntu ? "099720109477" : "amazon"))),
            block("filter", [], [
              attr("name", str("name")),
              attr(
                "values",
                list(
                  str(
                    isUbuntu
                      ? "ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"
                      : "al2023-ami-2023.*-x86_64",
                  ),
                ),
              ),
            ]),
          ]),
        );

        const instanceCount = Math.max(1, Number.parseInt(c.v.count || "1", 10) || 1);
        const multiple = instanceCount > 1;
        const subnets = c.refList("subnet", "id", SUBNETS_VAR);

        c.output({
          name: `${c.name}_private_ips`,
          value: raw(multiple ? `aws_instance.${c.name}[*].private_ip` : `[aws_instance.${c.name}.private_ip]`),
          description: `Private addresses for ${c.display}`,
        });

        const entries = [
          resource("aws_instance", c.name, [
            ...(multiple ? [attr("count", num(instanceCount, 1))] : []),
            attr("ami", raw(`data.aws_ami.${amiData}.id`)),
            attr("instance_type", str(c.v.instance_type || "t3.micro")),
            attr(
              "subnet_id",
              multiple
                ? raw(`element(${expr(subnets)}, count.index)`)
                : c.ref("subnet", "id", SUBNET_VAR),
            ),
            attr("vpc_security_group_ids", c.refList("firewall", "id", SG_VAR)),
            attr("associate_public_ip_address", bool(false)),
            attr("monitoring", flag(c.v.monitoring, true)),
            attr("ebs_optimized", bool(true)),
            block("root_block_device", [], [
              attr("volume_size", num(c.v.root_volume_size, 20)),
              attr("volume_type", str(c.v.volume_type || "gp3")),
              attr("encrypted", bool(true)),
              attr("delete_on_termination", bool(true)),
            ]),
            block("metadata_options", [], [
              attr("http_endpoint", str("enabled")),
              attr("http_tokens", str("required")),
              attr("http_put_response_hop_limit", num(1, 1)),
            ]),
            attr(
              "tags",
              raw(
                multiple
                  ? `merge(local.tags, { Name = "${c.display}-\${count.index + 1}" })`
                  : `merge(local.tags, { Name = "${c.display}" })`,
              ),
            ),
          ]),
        ];

        // Register the instance with a load balancer when the diagram connects one.
        if (c.has("loadbalancer")) {
          entries.push(
            resource("aws_lb_target_group_attachment", c.name, [
              ...(multiple ? [attr("count", num(instanceCount, 1))] : []),
              attr(
                "target_group_arn",
                c.ref(
                  "loadbalancer",
                  (targetRef) => `aws_lb_target_group.${targetRef.name}.arn`,
                  {
                    name: "target_group_arn",
                    type: "string",
                    description: "Target group the instances register with.",
                  },
                ),
              ),
              attr(
                "target_id",
                raw(multiple ? `aws_instance.${c.name}[count.index].id` : `aws_instance.${c.name}.id`),
              ),
              attr("port", num(80, 80)),
            ]),
          );
        }

        return entries;
      },
    }),
    defineService({
      id: "asg",
      name: "Auto Scaling Group",
      short: "ASG",
      category: "Compute",
      role: "compute",
      tfType: "aws_autoscaling_group",
      description: "Self-healing, horizontally scaled fleet",
      fields: [
        select("instance_type", "Machine type", ["t3.small", "t3.medium", "m6i.large", "c7g.large"]),
        number("min_size", "Minimum instances", "2"),
        number("max_size", "Maximum instances", "6"),
        number("target_cpu", "Target CPU %", "60"),
      ],
      emit: (c) => {
        c.data(
          "ami_amazon_linux",
          block("data", ["aws_ami", "amazon_linux"], [
            attr("most_recent", bool(true)),
            attr("owners", list(str("amazon"))),
            block("filter", [], [
              attr("name", str("name")),
              attr("values", list(str("al2023-ami-2023.*-x86_64"))),
            ]),
          ]),
        );
        return [
          resource("aws_launch_template", c.name, [
            attr("name_prefix", str(`${dnsName(c.display, "app", 40)}-`)),
            attr("image_id", raw("data.aws_ami.amazon_linux.id")),
            attr("instance_type", str(c.v.instance_type || "t3.small")),
            attr("vpc_security_group_ids", c.refList("firewall", "id", SG_VAR)),
            block("metadata_options", [], [
              attr("http_tokens", str("required")),
              attr("http_endpoint", str("enabled")),
            ]),
            block("monitoring", [], [attr("enabled", bool(true))]),
            block("tag_specifications", [], [
              attr("resource_type", str("instance")),
              attr("tags", raw(`merge(local.tags, { Name = "${c.display}" })`)),
            ]),
          ]),
          resource("aws_autoscaling_group", c.name, [
            attr("name", str(dnsName(c.display, "app-asg", 48))),
            attr("min_size", num(c.v.min_size, 2)),
            attr("max_size", num(c.v.max_size, 6)),
            attr("desired_capacity", num(c.v.min_size, 2)),
            attr("vpc_zone_identifier", c.refList("subnet", "id", SUBNETS_VAR)),
            attr("health_check_type", str("ELB")),
            attr("health_check_grace_period", num(300, 300)),
            ...(c.has("loadbalancer")
              ? [
                  attr(
                    "target_group_arns",
                    listOf([
                      c.ref(
                        "loadbalancer",
                        (targetRef) => `aws_lb_target_group.${targetRef.name}.arn`,
                        {
                          name: "target_group_arn",
                          type: "string",
                          description: "Target group the fleet registers with.",
                        },
                      ),
                    ]),
                  ),
                ]
              : []),
            block("launch_template", [], [
              attr("id", raw(`aws_launch_template.${c.name}.id`)),
              attr("version", str("$Latest")),
            ]),
            block("tag", [], [
              attr("key", str("Name")),
              attr("value", str(c.display)),
              attr("propagate_at_launch", bool(true)),
            ]),
          ]),
          resource("aws_autoscaling_policy", c.name, [
            attr("name", str(dnsName(`${c.display}-cpu`, "cpu-policy", 48))),
            attr("autoscaling_group_name", raw(`aws_autoscaling_group.${c.name}.name`)),
            attr("policy_type", str("TargetTrackingScaling")),
            block("target_tracking_configuration", [], [
              block("predefined_metric_specification", [], [
                attr("predefined_metric_type", str("ASGAverageCPUUtilization")),
              ]),
              attr("target_value", num(c.v.target_cpu, 60)),
            ]),
          ]),
        ];
      },
    }),
    defineService({
      id: "lambda",
      name: "Lambda Function",
      short: "λ",
      category: "Compute",
      role: "serverless",
      tfType: "aws_lambda_function",
      description: "Event-driven serverless compute",
      docs: "https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/lambda_function",
      fields: [
        select("runtime", "Runtime", [
          "nodejs22.x",
          "python3.13",
          "python3.12",
          "java21",
          "dotnet8",
          "provided.al2023",
        ]),
        select("memory", "Memory (MB)", ["128", "256", "512", "1024", "2048", "3008"]),
        number("timeout", "Timeout (seconds)", "30"),
        text("handler", "Handler", "index.handler"),
        select("architecture", "Architecture", ["arm64", "x86_64"]),
      ],
      emit: (c) => {
        const artifact = c.variable({
          name: "lambda_artifact_path",
          type: "string",
          description: "Path to the packaged Lambda deployment artifact.",
          default: str("build/function.zip"),
        });
        c.output({
          name: `${c.name}_arn`,
          value: raw(`aws_lambda_function.${c.name}.arn`),
          description: `ARN of ${c.display}`,
        });
        return [
          resource("aws_iam_role", `${c.name}_exec`, [
            attr("name", str(dnsName(`${c.display}-exec`, "lambda-exec", 60))),
            attr(
              "assume_role_policy",
              raw(
                [
                  "jsonencode({",
                  '    Version = "2012-10-17"',
                  "    Statement = [{",
                  '      Action    = "sts:AssumeRole"',
                  '      Effect    = "Allow"',
                  '      Principal = { Service = "lambda.amazonaws.com" }',
                  "    }]",
                  "  })",
                ].join("\n"),
              ),
            ),
            attr("tags", c.tags),
          ]),
          resource("aws_iam_role_policy_attachment", `${c.name}_basic`, [
            attr("role", raw(`aws_iam_role.${c.name}_exec.name`)),
            attr(
              "policy_arn",
              str("arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"),
            ),
          ]),
          resource("aws_cloudwatch_log_group", `${c.name}`, [
            attr("name", str(`/aws/lambda/${dnsName(c.display, "function", 60)}`)),
            attr("retention_in_days", num(30, 30)),
            attr("tags", c.tags),
          ]),
          resource("aws_lambda_function", c.name, [
            attr("function_name", str(dnsName(c.display, "function", 64))),
            attr("role", raw(`aws_iam_role.${c.name}_exec.arn`)),
            attr("runtime", str(c.v.runtime || "nodejs22.x")),
            attr("handler", str(c.v.handler || "index.handler")),
            attr("filename", artifact),
            attr("source_code_hash", raw(`filebase64sha256(${expr(artifact)})`)),
            attr("memory_size", num(c.v.memory, 256)),
            attr("timeout", num(c.v.timeout, 30)),
            attr("architectures", list(str(c.v.architecture || "arm64"))),
            block("tracing_config", [], [attr("mode", str("Active"))]),
            attr("depends_on", raw(`[aws_cloudwatch_log_group.${c.name}]`)),
            attr("tags", c.tags),
          ]),
        ];
      },
    }),

    /* ------------------------------------------------------------ Containers */
    defineService({
      id: "ecs",
      name: "ECS Fargate Service",
      short: "ECS",
      category: "Containers",
      role: "container",
      tfType: "aws_ecs_cluster",
      description: "Serverless container orchestration",
      fields: [
        text("image", "Container image", "public.ecr.aws/nginx/nginx:stable"),
        select("cpu", "Task CPU", ["256", "512", "1024", "2048"]),
        select("memory", "Task memory", ["512", "1024", "2048", "4096"]),
        number("desired_count", "Desired tasks", "2"),
        number("container_port", "Container port", "80"),
      ],
      emit: (c) => [
        resource("aws_ecs_cluster", c.name, [
          attr("name", str(dnsName(c.display, "cluster", 60))),
          block("setting", [], [
            attr("name", str("containerInsights")),
            attr("value", str("enabled")),
          ]),
          attr("tags", c.tags),
        ]),
        resource("aws_iam_role", `${c.name}_execution`, [
          attr("name", str(dnsName(`${c.display}-exec`, "ecs-exec", 60))),
          attr(
            "assume_role_policy",
            raw(
              [
                "jsonencode({",
                '    Version = "2012-10-17"',
                "    Statement = [{",
                '      Action    = "sts:AssumeRole"',
                '      Effect    = "Allow"',
                '      Principal = { Service = "ecs-tasks.amazonaws.com" }',
                "    }]",
                "  })",
              ].join("\n"),
            ),
          ),
          attr("tags", c.tags),
        ]),
        resource("aws_iam_role_policy_attachment", `${c.name}_execution`, [
          attr("role", raw(`aws_iam_role.${c.name}_execution.name`)),
          attr(
            "policy_arn",
            str("arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"),
          ),
        ]),
        resource("aws_ecs_task_definition", c.name, [
          attr("family", str(dnsName(c.display, "task", 60))),
          attr("requires_compatibilities", list(str("FARGATE"))),
          attr("network_mode", str("awsvpc")),
          attr("cpu", str(c.v.cpu || "512")),
          attr("memory", str(c.v.memory || "1024")),
          attr("execution_role_arn", raw(`aws_iam_role.${c.name}_execution.arn`)),
          attr(
            "container_definitions",
            raw(
              [
                "jsonencode([{",
                `    name      = "app"`,
                `    image     = ${JSON.stringify(c.v.image || "public.ecr.aws/nginx/nginx:stable")}`,
                "    essential = true",
                `    portMappings = [{`,
                `      containerPort = ${Number.parseInt(c.v.container_port || "80", 10) || 80}`,
                `      protocol      = "tcp"`,
                "    }]",
                "  }])",
              ].join("\n"),
            ),
          ),
          attr("tags", c.tags),
        ]),
        resource("aws_ecs_service", c.name, [
          attr("name", str(dnsName(c.display, "service", 60))),
          attr("cluster", raw(`aws_ecs_cluster.${c.name}.id`)),
          attr("task_definition", raw(`aws_ecs_task_definition.${c.name}.arn`)),
          attr("desired_count", num(c.v.desired_count, 2)),
          attr("launch_type", str("FARGATE")),
          block("network_configuration", [], [
            attr("subnets", c.refList("subnet", "id", SUBNETS_VAR)),
            attr("security_groups", c.refList("firewall", "id", SG_VAR)),
            attr("assign_public_ip", bool(false)),
          ]),
          ...(c.has("loadbalancer")
            ? [
                block("load_balancer", [], [
                  attr(
                    "target_group_arn",
                    c.ref(
                      "loadbalancer",
                      (targetRef) => `aws_lb_target_group.${targetRef.name}.arn`,
                      {
                        name: "target_group_arn",
                        type: "string",
                        description: "Target group the service registers with.",
                      },
                    ),
                  ),
                  attr("container_name", str("app")),
                  attr("container_port", num(c.v.container_port, 80)),
                ]),
              ]
            : []),
          attr("tags", c.tags),
        ]),
      ],
    }),
    defineService({
      id: "eks",
      name: "EKS Cluster",
      short: "EKS",
      category: "Containers",
      role: "container",
      tfType: "aws_eks_cluster",
      description: "Managed Kubernetes control plane",
      fields: [
        select("version", "Kubernetes version", ["1.33", "1.32", "1.31"]),
        select("node_type", "Node machine type", ["t3.medium", "t3.large", "m6i.large", "c7g.large"]),
        number("desired_nodes", "Desired nodes", "2"),
        number("max_nodes", "Maximum nodes", "4"),
        toggle("public_endpoint", "Public API endpoint", false),
      ],
      emit: (c) => {
        const assumeRole = (service: string) =>
          raw(
            [
              "jsonencode({",
              '    Version = "2012-10-17"',
              "    Statement = [{",
              '      Action    = "sts:AssumeRole"',
              '      Effect    = "Allow"',
              `      Principal = { Service = "${service}" }`,
              "    }]",
              "  })",
            ].join("\n"),
          );
        c.output({
          name: `${c.name}_endpoint`,
          value: raw(`aws_eks_cluster.${c.name}.endpoint`),
          description: `Kubernetes API endpoint for ${c.display}`,
        });
        return [
          resource("aws_iam_role", `${c.name}_cluster`, [
            attr("name", str(dnsName(`${c.display}-cluster`, "eks-cluster", 60))),
            attr("assume_role_policy", assumeRole("eks.amazonaws.com")),
            attr("tags", c.tags),
          ]),
          resource("aws_iam_role_policy_attachment", `${c.name}_cluster`, [
            attr("role", raw(`aws_iam_role.${c.name}_cluster.name`)),
            attr("policy_arn", str("arn:aws:iam::aws:policy/AmazonEKSClusterPolicy")),
          ]),
          resource("aws_iam_role", `${c.name}_node`, [
            attr("name", str(dnsName(`${c.display}-node`, "eks-node", 60))),
            attr("assume_role_policy", assumeRole("ec2.amazonaws.com")),
            attr("tags", c.tags),
          ]),
          resource("aws_iam_role_policy_attachment", `${c.name}_node`, [
            attr("for_each", raw(
              [
                "toset([",
                '    "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy",',
                '    "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy",',
                '    "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly",',
                "  ])",
              ].join("\n"),
            )),
            attr("role", raw(`aws_iam_role.${c.name}_node.name`)),
            attr("policy_arn", raw("each.value")),
          ]),
          resource("aws_eks_cluster", c.name, [
            attr("name", str(dnsName(c.display, "eks-cluster", 60))),
            attr("role_arn", raw(`aws_iam_role.${c.name}_cluster.arn`)),
            attr("version", str(c.v.version || "1.33")),
            block("vpc_config", [], [
              attr("subnet_ids", c.refList("subnet", "id", SUBNETS_VAR)),
              attr("endpoint_private_access", bool(true)),
              attr("endpoint_public_access", flag(c.v.public_endpoint, false)),
            ]),
            attr("depends_on", raw(`[aws_iam_role_policy_attachment.${c.name}_cluster]`)),
            attr("tags", c.tags),
          ]),
          resource("aws_eks_node_group", c.name, [
            attr("cluster_name", raw(`aws_eks_cluster.${c.name}.name`)),
            attr("node_group_name", str(dnsName(`${c.display}-nodes`, "nodes", 60))),
            attr("node_role_arn", raw(`aws_iam_role.${c.name}_node.arn`)),
            attr("subnet_ids", c.refList("subnet", "id", SUBNETS_VAR)),
            attr("instance_types", list(str(c.v.node_type || "t3.medium"))),
            block("scaling_config", [], [
              attr("desired_size", num(c.v.desired_nodes, 2)),
              attr("min_size", num(1, 1)),
              attr("max_size", num(c.v.max_nodes, 4)),
            ]),
            block("update_config", [], [attr("max_unavailable", num(1, 1))]),
            attr("depends_on", raw(`[aws_iam_role_policy_attachment.${c.name}_node]`)),
            attr("tags", c.tags),
          ]),
        ];
      },
    }),
    defineService({
      id: "ecr",
      name: "ECR Repository",
      short: "ECR",
      category: "Containers",
      role: "registry",
      tfType: "aws_ecr_repository",
      description: "Private container image registry",
      fields: [
        select("mutability", "Tag mutability", ["IMMUTABLE", "MUTABLE"]),
        toggle("scan_on_push", "Scan on push", true),
      ],
      emit: (c) => [
        resource("aws_ecr_repository", c.name, [
          attr("name", str(dnsName(c.display, "repository", 60))),
          attr("image_tag_mutability", str(c.v.mutability || "IMMUTABLE")),
          block("image_scanning_configuration", [], [
            attr("scan_on_push", flag(c.v.scan_on_push, true)),
          ]),
          block("encryption_configuration", [], [attr("encryption_type", str("AES256"))]),
          attr("tags", c.tags),
        ]),
      ],
    }),

    /* -------------------------------------------------------------- Database */
    defineService({
      id: "rds",
      name: "RDS Database",
      short: "RDS",
      category: "Database",
      role: "database",
      tfType: "aws_db_instance",
      description: "Managed relational database",
      docs: "https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/db_instance",
      fields: [
        select("engine", "Engine", ["postgres", "mysql", "mariadb"]),
        select("engine_version", "Engine version", ["16.4", "15.8", "8.0.39"]),
        select("instance_class", "Instance class", [
          "db.t4g.micro",
          "db.t4g.small",
          "db.t4g.medium",
          "db.m6g.large",
          "db.r6g.large",
        ]),
        number("storage", "Allocated storage (GB)", "20"),
        toggle("multi_az", "Multi-AZ high availability", false),
        number("backup_retention", "Backup retention (days)", "7"),
      ],
      emit: (c) => {
        const username = c.variable({
          name: "database_username",
          type: "string",
          description: "Master username for managed databases.",
          default: str("appadmin"),
          sensitive: true,
        });
        const password = c.variable({
          name: "database_password",
          type: "string",
          description: "Master password. Supply from a secrets manager, never in source control.",
          sensitive: true,
          validation: {
            condition: "length(var.database_password) >= 16",
            errorMessage: "Use a database password of at least 16 characters.",
          },
        });
        c.output({
          name: `${c.name}_endpoint`,
          value: raw(`aws_db_instance.${c.name}.endpoint`),
          description: `Connection endpoint for ${c.display}`,
          sensitive: true,
        });
        return [
          resource("aws_db_subnet_group", c.name, [
            attr("name", str(dnsName(`${c.display}-subnets`, "db-subnets", 60))),
            attr("subnet_ids", c.refList("subnet", "id", SUBNETS_VAR)),
            attr("tags", c.tags),
          ]),
          resource("aws_db_instance", c.name, [
            attr("identifier", str(dnsName(c.display, "database", 60))),
            attr("engine", str(c.v.engine || "postgres")),
            attr("engine_version", str(c.v.engine_version || "16.4")),
            attr("instance_class", str(c.v.instance_class || "db.t4g.micro")),
            attr("allocated_storage", num(c.v.storage, 20)),
            attr("storage_type", str("gp3")),
            attr("storage_encrypted", bool(true)),
            attr("multi_az", flag(c.v.multi_az, false)),
            attr("db_subnet_group_name", raw(`aws_db_subnet_group.${c.name}.name`)),
            attr("vpc_security_group_ids", c.refList("firewall", "id", SG_VAR)),
            attr("username", username),
            attr("password", password),
            attr("backup_retention_period", num(c.v.backup_retention, 7)),
            attr("deletion_protection", bool(true)),
            attr("auto_minor_version_upgrade", bool(true)),
            attr("performance_insights_enabled", bool(true)),
            attr("skip_final_snapshot", bool(false)),
            attr("final_snapshot_identifier", str(dnsName(`${c.display}-final`, "db-final", 60))),
            attr("tags", c.tags),
          ]),
        ];
      },
    }),
    defineService({
      id: "dynamodb",
      name: "DynamoDB Table",
      short: "DDB",
      category: "Database",
      role: "database",
      tfType: "aws_dynamodb_table",
      description: "Serverless key-value and document store",
      fields: [
        select("billing_mode", "Billing mode", ["PAY_PER_REQUEST", "PROVISIONED"]),
        text("hash_key", "Partition key", "id"),
        text("range_key", "Sort key (optional)", ""),
        toggle("stream", "Enable streams", false),
      ],
      emit: (c) => {
        const hashKey = c.v.hash_key || "id";
        const rangeKey = (c.v.range_key || "").trim();
        return [
          resource("aws_dynamodb_table", c.name, [
            attr("name", str(dnsName(c.display, "table", 60))),
            attr("billing_mode", str(c.v.billing_mode || "PAY_PER_REQUEST")),
            attr("hash_key", str(hashKey)),
            ...(rangeKey ? [attr("range_key", str(rangeKey))] : []),
            ...(c.v.billing_mode === "PROVISIONED"
              ? [attr("read_capacity", num(5, 5)), attr("write_capacity", num(5, 5))]
              : []),
            block("attribute", [], [attr("name", str(hashKey)), attr("type", str("S"))]),
            ...(rangeKey
              ? [block("attribute", [], [attr("name", str(rangeKey)), attr("type", str("S"))])]
              : []),
            ...(c.v.stream === "true"
              ? [
                  attr("stream_enabled", bool(true)),
                  attr("stream_view_type", str("NEW_AND_OLD_IMAGES")),
                ]
              : []),
            block("point_in_time_recovery", [], [attr("enabled", bool(true))]),
            block("server_side_encryption", [], [attr("enabled", bool(true))]),
            attr("tags", c.tags),
          ]),
        ];
      },
    }),
    defineService({
      id: "elasticache",
      name: "ElastiCache (Redis)",
      short: "CACHE",
      category: "Database",
      role: "cache",
      tfType: "aws_elasticache_replication_group",
      description: "In-memory cache and session store",
      fields: [
        select("node_type", "Node type", ["cache.t4g.micro", "cache.t4g.small", "cache.r7g.large"]),
        number("replicas", "Replica count", "1"),
        select("engine_version", "Engine version", ["7.1", "7.0"]),
      ],
      emit: (c) => [
        resource("aws_elasticache_subnet_group", c.name, [
          attr("name", str(dnsName(`${c.display}-subnets`, "cache-subnets", 60))),
          attr("subnet_ids", c.refList("subnet", "id", SUBNETS_VAR)),
          attr("tags", c.tags),
        ]),
        resource("aws_elasticache_replication_group", c.name, [
          attr("replication_group_id", str(dnsName(c.display, "cache", 40))),
          attr("description", str(`${c.display} managed by InfraCanvas`)),
          attr("engine", str("redis")),
          attr("engine_version", str(c.v.engine_version || "7.1")),
          attr("node_type", str(c.v.node_type || "cache.t4g.micro")),
          attr("num_cache_clusters", num(Number(c.v.replicas ?? 1) + 1, 2)),
          attr("automatic_failover_enabled", bool(true)),
          attr("at_rest_encryption_enabled", bool(true)),
          attr("transit_encryption_enabled", bool(true)),
          attr("subnet_group_name", raw(`aws_elasticache_subnet_group.${c.name}.name`)),
          attr("security_group_ids", c.refList("firewall", "id", SG_VAR)),
          attr("tags", c.tags),
        ]),
      ],
    }),

    /* --------------------------------------------------------------- Storage */
    defineService({
      id: "s3",
      name: "S3 Bucket",
      short: "S3",
      category: "Storage",
      role: "storage",
      tfType: "aws_s3_bucket",
      description: "Durable object storage",
      docs: "https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/s3_bucket",
      fields: [
        select("versioning", "Versioning", ["Enabled", "Suspended"]),
        select("encryption", "Encryption", ["AES256", "aws:kms"]),
        toggle("force_destroy", "Allow force destroy", false),
      ],
      emit: (c) => {
        const usesKms = c.v.encryption === "aws:kms";
        const kmsKey = usesKms
          ? c.ref("secrets", "arn", {
              name: "s3_kms_key_arn",
              type: "string",
              description: "KMS key ARN used for bucket encryption.",
            })
          : null;
        c.output({
          name: `${c.name}_bucket`,
          value: raw(`aws_s3_bucket.${c.name}.bucket`),
          description: `Bucket name for ${c.display}`,
        });
        return [
          resource("aws_s3_bucket", c.name, [
            attr("bucket_prefix", str(`${dnsName(c.display, "bucket", 37)}-`)),
            attr("force_destroy", flag(c.v.force_destroy, false)),
            attr("tags", c.tags),
          ]),
          resource("aws_s3_bucket_versioning", c.name, [
            attr("bucket", raw(`aws_s3_bucket.${c.name}.id`)),
            block("versioning_configuration", [], [
              attr("status", str(c.v.versioning || "Enabled")),
            ]),
          ]),
          resource("aws_s3_bucket_server_side_encryption_configuration", c.name, [
            attr("bucket", raw(`aws_s3_bucket.${c.name}.id`)),
            block("rule", [], [
              block("apply_server_side_encryption_by_default", [], [
                attr("sse_algorithm", str(c.v.encryption || "AES256")),
                ...(kmsKey ? [attr("kms_master_key_id", kmsKey)] : []),
              ]),
              attr("bucket_key_enabled", bool(true)),
            ]),
          ]),
          resource("aws_s3_bucket_public_access_block", c.name, [
            attr("bucket", raw(`aws_s3_bucket.${c.name}.id`)),
            attr("block_public_acls", bool(true)),
            attr("block_public_policy", bool(true)),
            attr("ignore_public_acls", bool(true)),
            attr("restrict_public_buckets", bool(true)),
          ]),
        ];
      },
    }),
    defineService({
      id: "efs",
      name: "EFS File System",
      short: "EFS",
      category: "Storage",
      role: "storage",
      tfType: "aws_efs_file_system",
      description: "Elastic shared NFS storage",
      fields: [
        select("performance_mode", "Performance mode", ["generalPurpose", "maxIO"]),
        select("throughput_mode", "Throughput mode", ["elastic", "bursting", "provisioned"]),
      ],
      emit: (c) => [
        resource("aws_efs_file_system", c.name, [
          attr("creation_token", str(dnsName(c.display, "efs", 60))),
          attr("encrypted", bool(true)),
          attr("performance_mode", str(c.v.performance_mode || "generalPurpose")),
          attr("throughput_mode", str(c.v.throughput_mode || "elastic")),
          block("lifecycle_policy", [], [attr("transition_to_ia", str("AFTER_30_DAYS"))]),
          attr("tags", c.tags),
        ]),
        resource("aws_efs_mount_target", c.name, [
          attr("file_system_id", raw(`aws_efs_file_system.${c.name}.id`)),
          attr("subnet_id", c.ref("subnet", "id", SUBNET_VAR)),
          attr("security_groups", c.refList("firewall", "id", SG_VAR)),
        ]),
      ],
    }),

    /* -------------------------------------------------------------- Security */
    defineService({
      id: "security_group",
      name: "Security Group",
      short: "SG",
      category: "Security",
      role: "firewall",
      tfType: "aws_security_group",
      description: "Stateful instance-level firewall",
      docs: "https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/security_group",
      fields: [
        number("ingress_port", "Inbound port", "443"),
        select("protocol", "Protocol", ["tcp", "udp"]),
        text("source_cidr", "Source CIDR", "10.0.0.0/16", "Avoid 0.0.0.0/0 for anything but public load balancers."),
      ],
      emit: (c) => [
        resource("aws_security_group", c.name, [
          attr("name", str(dnsName(c.display, "security-group", 60))),
          attr("description", str(`${c.display} — generated by InfraCanvas`)),
          attr("vpc_id", c.ref("network", "id", VPC_VAR)),
          attr("tags", raw(`merge(local.tags, { Name = "${c.display}" })`)),
          block("lifecycle", [], [attr("create_before_destroy", bool(true))]),
        ]),
        resource("aws_vpc_security_group_ingress_rule", c.name, [
          attr("security_group_id", raw(`aws_security_group.${c.name}.id`)),
          attr("cidr_ipv4", str(c.v.source_cidr || "10.0.0.0/16")),
          attr("from_port", num(c.v.ingress_port, 443)),
          attr("to_port", num(c.v.ingress_port, 443)),
          attr("ip_protocol", str(c.v.protocol || "tcp")),
          attr("tags", c.tags),
        ]),
        resource("aws_vpc_security_group_egress_rule", c.name, [
          attr("security_group_id", raw(`aws_security_group.${c.name}.id`)),
          attr("cidr_ipv4", str("0.0.0.0/0")),
          attr("ip_protocol", str("-1")),
          attr("tags", c.tags),
        ]),
      ],
    }),
    defineService({
      id: "waf",
      name: "Web Application Firewall",
      short: "WAF",
      category: "Security",
      role: "firewall",
      tfType: "aws_wafv2_web_acl",
      description: "Managed request filtering rules",
      fields: [
        select("default_action", "Default action", ["allow", "block"]),
        select("scope", "Scope", ["REGIONAL", "CLOUDFRONT"]),
        number("rate_limit", "Rate limit (requests / 5 min)", "2000"),
      ],
      emit: (c) => {
        const metricName = dnsName(c.display, "web-acl", 60).replace(/-/g, "");
        return [
          resource("aws_wafv2_web_acl", c.name, [
            attr("name", str(dnsName(c.display, "web-acl", 60))),
            attr("scope", str(c.v.scope || "REGIONAL")),
            block("default_action", [], [
              block(c.v.default_action === "block" ? "block" : "allow", [], []),
            ]),
            block("rule", [], [
              attr("name", str("AWSManagedRulesCommonRuleSet")),
              attr("priority", num(1, 1)),
              block("override_action", [], [block("none", [], [])]),
              block("statement", [], [
                block("managed_rule_group_statement", [], [
                  attr("name", str("AWSManagedRulesCommonRuleSet")),
                  attr("vendor_name", str("AWS")),
                ]),
              ]),
              block("visibility_config", [], [
                attr("cloudwatch_metrics_enabled", bool(true)),
                attr("metric_name", str(`${metricName}common`)),
                attr("sampled_requests_enabled", bool(true)),
              ]),
            ]),
            block("rule", [], [
              attr("name", str("RateLimit")),
              attr("priority", num(2, 2)),
              block("action", [], [block("block", [], [])]),
              block("statement", [], [
                block("rate_based_statement", [], [
                  attr("limit", num(c.v.rate_limit, 2000)),
                  attr("aggregate_key_type", str("IP")),
                ]),
              ]),
              block("visibility_config", [], [
                attr("cloudwatch_metrics_enabled", bool(true)),
                attr("metric_name", str(`${metricName}rate`)),
                attr("sampled_requests_enabled", bool(true)),
              ]),
            ]),
            block("visibility_config", [], [
              attr("cloudwatch_metrics_enabled", bool(true)),
              attr("metric_name", str(metricName)),
              attr("sampled_requests_enabled", bool(true)),
            ]),
            attr("tags", c.tags),
          ]),
        ];
      },
    }),
    defineService({
      id: "kms",
      name: "KMS Key",
      short: "KMS",
      category: "Security",
      role: "secrets",
      tfType: "aws_kms_key",
      description: "Customer managed encryption key",
      fields: [
        number("rotation_days", "Rotation period (days)", "365"),
        number("deletion_window", "Deletion window (days)", "30"),
      ],
      emit: (c) => [
        resource("aws_kms_key", c.name, [
          attr("description", str(`${c.display} — generated by InfraCanvas`)),
          attr("enable_key_rotation", bool(true)),
          attr("rotation_period_in_days", num(c.v.rotation_days, 365)),
          attr("deletion_window_in_days", num(c.v.deletion_window, 30)),
          attr("tags", c.tags),
        ]),
        resource("aws_kms_alias", c.name, [
          attr("name", str(`alias/${dnsName(c.display, "key", 40)}`)),
          attr("target_key_id", raw(`aws_kms_key.${c.name}.key_id`)),
        ]),
      ],
    }),
    defineService({
      id: "secrets_manager",
      name: "Secrets Manager Secret",
      short: "SEC",
      category: "Security",
      role: "secrets",
      tfType: "aws_secretsmanager_secret",
      description: "Rotating application secret store",
      fields: [number("recovery_days", "Recovery window (days)", "14")],
      emit: (c) => [
        resource("aws_secretsmanager_secret", c.name, [
          attr("name", str(dnsName(c.display, "secret", 60))),
          attr("description", str(`${c.display} — generated by InfraCanvas`)),
          attr("recovery_window_in_days", num(c.v.recovery_days, 14)),
          attr(
            "kms_key_id",
            c.ref("secrets", "arn", {
              name: "secrets_kms_key_arn",
              type: "string",
              description: "KMS key ARN used to encrypt secrets. Defaults to the AWS managed key.",
              default: raw("null"),
            }),
          ),
          attr("tags", c.tags),
        ]),
        // The value itself is intentionally left out of source control.
        resource("aws_secretsmanager_secret_version", c.name, [
          attr("secret_id", raw(`aws_secretsmanager_secret.${c.name}.id`)),
          attr(
            "secret_string",
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
      id: "iam_role",
      name: "IAM Role",
      short: "IAM",
      category: "Security",
      role: "identity",
      tfType: "aws_iam_role",
      description: "Assumable permission boundary",
      fields: [
        select("principal", "Trusted service", [
          "ec2.amazonaws.com",
          "ecs-tasks.amazonaws.com",
          "lambda.amazonaws.com",
          "eks.amazonaws.com",
        ]),
        select("managed_policy", "Managed policy", [
          "arn:aws:iam::aws:policy/ReadOnlyAccess",
          "arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess",
          "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy",
        ]),
      ],
      emit: (c) => [
        resource("aws_iam_role", c.name, [
          attr("name", str(dnsName(c.display, "role", 60))),
          attr(
            "assume_role_policy",
            raw(
              [
                "jsonencode({",
                '    Version = "2012-10-17"',
                "    Statement = [{",
                '      Action    = "sts:AssumeRole"',
                '      Effect    = "Allow"',
                `      Principal = { Service = "${c.v.principal || "ec2.amazonaws.com"}" }`,
                "    }]",
                "  })",
              ].join("\n"),
            ),
          ),
          attr("tags", c.tags),
        ]),
        resource("aws_iam_role_policy_attachment", c.name, [
          attr("role", raw(`aws_iam_role.${c.name}.name`)),
          attr("policy_arn", str(c.v.managed_policy || "arn:aws:iam::aws:policy/ReadOnlyAccess")),
        ]),
      ],
    }),

    /* ----------------------------------------------------------- Integration */
    defineService({
      id: "sqs",
      name: "SQS Queue",
      short: "SQS",
      category: "Integration",
      role: "queue",
      tfType: "aws_sqs_queue",
      description: "Durable message queue",
      fields: [
        toggle("fifo", "FIFO queue", false),
        number("visibility_timeout", "Visibility timeout (s)", "30"),
        number("retention", "Retention (seconds)", "345600"),
      ],
      emit: (c) => {
        const fifo = c.v.fifo === "true";
        const baseName = dnsName(c.display, "queue", 70);
        return [
          resource("aws_sqs_queue", `${c.name}_dlq`, [
            attr("name", str(fifo ? `${baseName}-dlq.fifo` : `${baseName}-dlq`)),
            ...(fifo ? [attr("fifo_queue", bool(true))] : []),
            attr("sqs_managed_sse_enabled", bool(true)),
            attr("tags", c.tags),
          ]),
          resource("aws_sqs_queue", c.name, [
            attr("name", str(fifo ? `${baseName}.fifo` : baseName)),
            ...(fifo
              ? [attr("fifo_queue", bool(true)), attr("content_based_deduplication", bool(true))]
              : []),
            attr("visibility_timeout_seconds", num(c.v.visibility_timeout, 30)),
            attr("message_retention_seconds", num(c.v.retention, 345600)),
            attr("sqs_managed_sse_enabled", bool(true)),
            attr(
              "redrive_policy",
              raw(
                [
                  "jsonencode({",
                  `    deadLetterTargetArn = aws_sqs_queue.${c.name}_dlq.arn`,
                  "    maxReceiveCount     = 5",
                  "  })",
                ].join("\n"),
              ),
            ),
            attr("tags", c.tags),
          ]),
        ];
      },
    }),
    defineService({
      id: "sns",
      name: "SNS Topic",
      short: "SNS",
      category: "Integration",
      role: "queue",
      tfType: "aws_sns_topic",
      description: "Pub/sub fan-out messaging",
      fields: [toggle("fifo", "FIFO topic", false)],
      emit: (c) => {
        const fifo = c.v.fifo === "true";
        return [
          resource("aws_sns_topic", c.name, [
            attr("name", str(fifo ? `${dnsName(c.display, "topic", 70)}.fifo` : dnsName(c.display, "topic", 70))),
            ...(fifo
              ? [attr("fifo_topic", bool(true)), attr("content_based_deduplication", bool(true))]
              : []),
            attr("tags", c.tags),
          ]),
        ];
      },
    }),

    /* --------------------------------------------------------- Observability */
    defineService({
      id: "cloudwatch_alarm",
      name: "CloudWatch Alarm",
      short: "CW",
      category: "Observability",
      role: "monitoring",
      tfType: "aws_cloudwatch_metric_alarm",
      description: "Metric threshold alerting",
      fields: [
        select("metric", "Metric", ["CPUUtilization", "TargetResponseTime", "DatabaseConnections"]),
        number("threshold", "Threshold", "80"),
        select("comparison", "Comparison", [
          "GreaterThanThreshold",
          "GreaterThanOrEqualToThreshold",
          "LessThanThreshold",
        ]),
        number("evaluation_periods", "Evaluation periods", "2"),
      ],
      emit: (c) => [
        resource("aws_cloudwatch_metric_alarm", c.name, [
          attr("alarm_name", str(dnsName(c.display, "alarm", 60))),
          attr("comparison_operator", str(c.v.comparison || "GreaterThanThreshold")),
          attr("evaluation_periods", num(c.v.evaluation_periods, 2)),
          attr("metric_name", str(c.v.metric || "CPUUtilization")),
          attr("namespace", str("AWS/EC2")),
          attr("period", num(300, 300)),
          attr("statistic", str("Average")),
          attr("threshold", num(c.v.threshold, 80)),
          attr("treat_missing_data", str("notBreaching")),
          attr(
            "alarm_actions",
            c.refList("queue", "arn", {
              name: "alarm_notification_arns",
              type: "list(string)",
              description: "SNS topic ARNs notified when an alarm fires.",
              default: listOf([]),
            }),
          ),
          attr("tags", c.tags),
        ]),
      ],
    }),
  ],
};

export const awsRegions = REGIONS;
