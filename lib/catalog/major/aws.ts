import {
  attr,
  block,
  bool,
  dnsName,
  flag,
  heredoc,
  list,
  num,
  raw,
  resource,
  str,
} from "../../hcl";
import type { ServiceDefinition, VariableSpec } from "../../types";
import { combo, defineService, number, select, text, toggle } from "../helpers";

const IAM_ROLE_ARN: VariableSpec = {
  name: "workload_role_arn",
  type: "string",
  description: "Existing IAM role ARN used by managed workload services when no IAM role is connected.",
};

const TRAIL_BUCKET: VariableSpec = {
  name: "cloudtrail_bucket_name",
  type: "string",
  description: "Existing S3 bucket name used by CloudTrail when no S3 bucket is connected.",
};

const ATHENA_OUTPUT: VariableSpec = {
  name: "athena_output_location",
  type: "string",
  description: "S3 URI for Athena query results when no S3 bucket is connected.",
};

const REDSHIFT_PASSWORD: VariableSpec = {
  name: "redshift_master_password",
  type: "string",
  description: "Master password for generated Amazon Redshift clusters.",
  sensitive: true,
};

const defaultStateMachine = `{
  "Comment": "InfraCanvas generated workflow",
  "StartAt": "Success",
  "States": {
    "Success": { "Type": "Succeed" }
  }
}`;

export const awsMajorServices: ServiceDefinition[] = [
  defineService({
    id: "beanstalk",
    name: "AWS Elastic Beanstalk",
    short: "EB",
    category: "Compute",
    role: "compute",
    tfType: "aws_elastic_beanstalk_environment",
    description: "Managed application platform with rolling deployments",
    docs: "https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/elastic_beanstalk_environment",
    fields: [
      combo("solution_stack", "Solution stack", [
        "64bit Amazon Linux 2023 v6.6.1 running Node.js 22",
        "64bit Amazon Linux 2023 v4.7.1 running Python 3.13",
        "64bit Amazon Linux 2023 v5.7.1 running Docker",
        "64bit Amazon Linux 2023 v4.7.1 running Corretto 21",
      ]),
      select("tier", "Environment tier", ["WebServer", "Worker"]),
      text("description", "Application description", "Managed by InfraCanvas"),
      toggle("wait_for_ready", "Wait for environment readiness", true),
    ],
    emit: (c) => {
      const appName = `${c.name}_application`;
      c.output({
        name: `${c.name}_endpoint`,
        value: raw(`aws_elastic_beanstalk_environment.${c.name}.endpoint_url`),
        description: `Endpoint for ${c.display}`,
      });
      return [
        resource("aws_elastic_beanstalk_application", appName, [
          attr("name", str(dnsName(c.display, "application", 100))),
          attr("description", str(c.v.description || "Managed by InfraCanvas")),
          attr("tags", c.tags),
        ]),
        resource("aws_elastic_beanstalk_environment", c.name, [
          attr("name", str(dnsName(c.display, "environment", 40))),
          attr("application", raw(`aws_elastic_beanstalk_application.${appName}.name`)),
          attr("solution_stack_name", str(c.v.solution_stack)),
          attr("tier", str(c.v.tier || "WebServer")),
          attr("wait_for_ready_timeout", str(c.v.wait_for_ready === "false" ? "0m" : "20m")),
          attr("tags", c.tags),
        ]),
      ];
    },
  }),
  defineService({
    id: "eventbridge",
    name: "Amazon EventBridge",
    short: "EVB",
    category: "Integration",
    role: "topic",
    tfType: "aws_cloudwatch_event_bus",
    description: "Serverless event bus for application integration",
    docs: "https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_event_bus",
    fields: [text("description", "Purpose", "Application event bus")],
    emit: (c) => {
      c.output({ name: `${c.name}_arn`, value: raw(`aws_cloudwatch_event_bus.${c.name}.arn`), description: `ARN of ${c.display}` });
      return [resource("aws_cloudwatch_event_bus", c.name, [attr("name", str(dnsName(c.display, "events", 256))), attr("tags", c.tags)])];
    },
  }),
  defineService({
    id: "step_functions",
    name: "AWS Step Functions",
    short: "SFN",
    category: "Integration",
    role: "serverless",
    tfType: "aws_sfn_state_machine",
    description: "Durable serverless workflow orchestration",
    docs: "https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sfn_state_machine",
    fields: [
      select("type", "Workflow type", ["STANDARD", "EXPRESS"]),
      text("definition", "Amazon States Language definition", defaultStateMachine, "JSON workflow definition."),
    ],
    emit: (c) => {
      const roleArn = c.ref("identity", "arn", IAM_ROLE_ARN);
      c.output({ name: `${c.name}_arn`, value: raw(`aws_sfn_state_machine.${c.name}.arn`), description: `ARN of ${c.display}` });
      return [resource("aws_sfn_state_machine", c.name, [
        attr("name", str(dnsName(c.display, "workflow", 80))),
        attr("role_arn", roleArn),
        attr("type", str(c.v.type || "STANDARD")),
        attr("definition", heredoc("ASL", c.v.definition || defaultStateMachine)),
        attr("tags", c.tags),
      ])];
    },
  }),
  defineService({
    id: "cognito",
    name: "Amazon Cognito",
    short: "COG",
    category: "Security",
    role: "identity",
    tfType: "aws_cognito_user_pool",
    description: "Managed customer identity and access",
    docs: "https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cognito_user_pool",
    fields: [
      select("mfa", "MFA configuration", ["OPTIONAL", "ON", "OFF"]),
      select("username_attribute", "Sign-in attribute", ["email", "phone_number"]),
      number("password_length", "Minimum password length", "12"),
      toggle("deletion_protection", "Deletion protection", true),
    ],
    emit: (c) => [resource("aws_cognito_user_pool", c.name, [
      attr("name", str(dnsName(c.display, "users", 128))),
      attr("mfa_configuration", str(c.v.mfa || "OPTIONAL")),
      attr("username_attributes", list(str(c.v.username_attribute || "email"))),
      attr("auto_verified_attributes", list(str(c.v.username_attribute || "email"))),
      attr("deletion_protection", str(c.v.deletion_protection === "false" ? "INACTIVE" : "ACTIVE")),
      block("password_policy", [], [
        attr("minimum_length", num(c.v.password_length, 12)),
        attr("require_lowercase", bool(true)),
        attr("require_numbers", bool(true)),
        attr("require_symbols", bool(true)),
        attr("require_uppercase", bool(true)),
      ]),
      attr("tags", c.tags),
    ])],
  }),
  defineService({
    id: "opensearch",
    name: "Amazon OpenSearch Service",
    short: "OS",
    category: "Database",
    role: "database",
    tfType: "aws_opensearch_domain",
    description: "Managed search, logs, and vector analytics",
    docs: "https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/opensearch_domain",
    fields: [
      combo("engine_version", "Engine version", ["OpenSearch_2.19", "OpenSearch_2.17", "OpenSearch_2.15"]),
      combo("instance_type", "Data node type", ["m7g.large.search", "r7g.large.search", "t3.small.search"]),
      number("instance_count", "Data nodes", "2"),
      number("volume_size", "EBS volume (GiB)", "100"),
    ],
    emit: (c) => {
      c.output({ name: `${c.name}_endpoint`, value: raw(`aws_opensearch_domain.${c.name}.endpoint`), description: `Endpoint for ${c.display}` });
      return [resource("aws_opensearch_domain", c.name, [
        attr("domain_name", str(dnsName(c.display, "search", 28))),
        attr("engine_version", str(c.v.engine_version || "OpenSearch_2.19")),
        block("cluster_config", [], [
          attr("instance_type", str(c.v.instance_type || "m7g.large.search")),
          attr("instance_count", num(c.v.instance_count, 2)),
          attr("zone_awareness_enabled", bool(false)),
        ]),
        block("ebs_options", [], [attr("ebs_enabled", bool(true)), attr("volume_size", num(c.v.volume_size, 100)), attr("volume_type", str("gp3"))]),
        block("encrypt_at_rest", [], [attr("enabled", bool(true))]),
        block("node_to_node_encryption", [], [attr("enabled", bool(true))]),
        block("domain_endpoint_options", [], [attr("enforce_https", bool(true)), attr("tls_security_policy", str("Policy-Min-TLS-1-2-2019-07"))]),
        attr("tags", c.tags),
      ])];
    },
  }),
  defineService({
    id: "redshift",
    name: "Amazon Redshift",
    short: "RS",
    category: "Analytics",
    role: "analytics",
    tfType: "aws_redshift_cluster",
    description: "Managed cloud data warehouse",
    docs: "https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/redshift_cluster",
    fields: [
      select("cluster_type", "Cluster type", ["multi-node", "single-node"]),
      combo("node_type", "Node type", ["ra3.xlplus", "ra3.4xlarge", "dc2.large"]),
      number("node_count", "Node count", "2"),
      text("database_name", "Database name", "analytics"),
      text("master_username", "Master username", "adminuser"),
    ],
    emit: (c) => {
      const multiNode = c.v.cluster_type === "multi-node";
      c.output({ name: `${c.name}_endpoint`, value: raw(`aws_redshift_cluster.${c.name}.endpoint`), description: `Endpoint for ${c.display}` });
      return [resource("aws_redshift_cluster", c.name, [
        attr("cluster_identifier", str(dnsName(c.display, "warehouse", 63))),
        attr("database_name", str(c.v.database_name || "analytics")),
        attr("master_username", str(c.v.master_username || "adminuser")),
        attr("master_password", c.variable(REDSHIFT_PASSWORD)),
        attr("node_type", str(c.v.node_type || "ra3.xlplus")),
        attr("cluster_type", str(c.v.cluster_type || "multi-node")),
        ...(multiNode ? [attr("number_of_nodes", num(c.v.node_count, 2))] : []),
        attr("encrypted", bool(true)),
        attr("publicly_accessible", bool(false)),
        attr("skip_final_snapshot", bool(true)),
        attr("tags", c.tags),
      ])];
    },
  }),
  defineService({
    id: "kinesis",
    name: "Amazon Kinesis Data Streams",
    short: "KIN",
    category: "Integration",
    role: "queue",
    tfType: "aws_kinesis_stream",
    description: "Real-time event and telemetry streaming",
    docs: "https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/kinesis_stream",
    fields: [
      select("capacity_mode", "Capacity mode", ["ON_DEMAND", "PROVISIONED"]),
      number("shard_count", "Shard count", "2"),
      number("retention_hours", "Retention hours", "24"),
    ],
    emit: (c) => [resource("aws_kinesis_stream", c.name, [
      attr("name", str(dnsName(c.display, "stream", 128))),
      ...(c.v.capacity_mode === "PROVISIONED" ? [attr("shard_count", num(c.v.shard_count, 2))] : []),
      ...(c.v.capacity_mode !== "PROVISIONED" ? [block("stream_mode_details", [], [attr("stream_mode", str("ON_DEMAND"))])] : []),
      attr("retention_period", num(c.v.retention_hours, 24)),
      attr("encryption_type", str("KMS")),
      attr("kms_key_id", str("alias/aws/kinesis")),
      attr("tags", c.tags),
    ])],
  }),
  defineService({
    id: "sagemaker",
    name: "Amazon SageMaker",
    short: "SM",
    category: "Artificial Intelligence",
    role: "compute",
    tfType: "aws_sagemaker_notebook_instance",
    description: "Managed machine-learning development environment",
    docs: "https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sagemaker_notebook_instance",
    fields: [
      combo("instance_type", "Notebook instance type", ["ml.t3.medium", "ml.m5.large", "ml.g5.xlarge"]),
      number("volume_size", "Volume size (GiB)", "20"),
      toggle("direct_internet_access", "Direct internet access", false),
      toggle("root_access", "Root access", false),
    ],
    emit: (c) => [resource("aws_sagemaker_notebook_instance", c.name, [
      attr("name", str(dnsName(c.display, "notebook", 63))),
      attr("role_arn", c.ref("identity", "arn", IAM_ROLE_ARN)),
      attr("instance_type", str(c.v.instance_type || "ml.t3.medium")),
      attr("volume_size", num(c.v.volume_size, 20)),
      attr("direct_internet_access", str(c.v.direct_internet_access === "true" ? "Enabled" : "Disabled")),
      attr("root_access", str(c.v.root_access === "true" ? "Enabled" : "Disabled")),
      attr("tags", c.tags),
    ])],
  }),
  defineService({
    id: "bedrock",
    name: "Amazon Bedrock",
    short: "BR",
    category: "Artificial Intelligence",
    role: "serverless",
    tfType: "aws_bedrockagent_agent",
    description: "Managed generative-AI agent runtime",
    docs: "https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/bedrockagent_agent",
    fields: [
      combo("foundation_model", "Foundation model", ["amazon.nova-pro-v1:0", "amazon.nova-lite-v1:0", "anthropic.claude-3-5-sonnet-20241022-v2:0"]),
      text("instruction", "Agent instruction", "You are a secure cloud operations assistant."),
      number("idle_ttl", "Idle session TTL (seconds)", "600"),
      toggle("prepare_agent", "Prepare agent after changes", true),
    ],
    emit: (c) => [resource("aws_bedrockagent_agent", c.name, [
      attr("agent_name", str(dnsName(c.display, "agent", 100))),
      attr("agent_resource_role_arn", c.ref("identity", "arn", IAM_ROLE_ARN)),
      attr("foundation_model", str(c.v.foundation_model || "amazon.nova-pro-v1:0")),
      attr("instruction", str(c.v.instruction || "You are a secure cloud operations assistant.")),
      attr("idle_session_ttl_in_seconds", num(c.v.idle_ttl, 600)),
      attr("prepare_agent", flag(c.v.prepare_agent, true)),
      attr("tags", c.tags),
    ])],
  }),
  defineService({
    id: "cloudtrail",
    name: "AWS CloudTrail",
    short: "CT",
    category: "Observability",
    role: "monitoring",
    tfType: "aws_cloudtrail",
    description: "Account activity and API audit trail",
    docs: "https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudtrail",
    fields: [toggle("multi_region", "Multi-region trail", true), toggle("log_validation", "Log file validation", true)],
    emit: (c) => [resource("aws_cloudtrail", c.name, [
      attr("name", str(dnsName(c.display, "audit", 128))),
      attr("s3_bucket_name", c.ref("storage", "bucket", TRAIL_BUCKET)),
      attr("is_multi_region_trail", flag(c.v.multi_region, true)),
      attr("include_global_service_events", bool(true)),
      attr("enable_log_file_validation", flag(c.v.log_validation, true)),
      attr("tags", c.tags),
    ])],
  }),
  defineService({
    id: "backup_vault",
    name: "AWS Backup",
    short: "BKP",
    category: "Storage",
    role: "storage",
    tfType: "aws_backup_vault",
    description: "Centralized encrypted backup vault",
    docs: "https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/backup_vault",
    fields: [text("kms_key_arn", "KMS key ARN", "", "Leave blank to use the AWS Backup service key.")],
    emit: (c) => [resource("aws_backup_vault", c.name, [
      attr("name", str(dnsName(c.display, "backup", 50))),
      ...(c.v.kms_key_arn ? [attr("kms_key_arn", str(c.v.kms_key_arn))] : []),
      attr("tags", c.tags),
    ])],
  }),
  defineService({
    id: "athena",
    name: "Amazon Athena",
    short: "ATH",
    category: "Analytics",
    role: "analytics",
    tfType: "aws_athena_workgroup",
    description: "Serverless SQL analytics for data in S3",
    docs: "https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/athena_workgroup",
    fields: [
      select("state", "Workgroup state", ["ENABLED", "DISABLED"]),
      toggle("enforce_configuration", "Enforce workgroup configuration", true),
      number("bytes_scanned_cutoff", "Bytes scanned cutoff", "10737418240"),
    ],
    emit: (c) => [resource("aws_athena_workgroup", c.name, [
      attr("name", str(dnsName(c.display, "analytics", 128))),
      attr("state", str(c.v.state || "ENABLED")),
      block("configuration", [], [
        attr("enforce_workgroup_configuration", flag(c.v.enforce_configuration, true)),
        attr("bytes_scanned_cutoff_per_query", num(c.v.bytes_scanned_cutoff, 10737418240)),
        block("result_configuration", [], [
          attr("output_location", c.ref("storage", (target) => `format("s3://%s/athena/", ${target.tfType}.${target.name}.bucket)`, ATHENA_OUTPUT)),
          block("encryption_configuration", [], [attr("encryption_option", str("SSE_S3"))]),
        ]),
      ]),
      attr("tags", c.tags),
    ])],
  }),
];
