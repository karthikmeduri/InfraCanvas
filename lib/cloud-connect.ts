import type { GeneratedFile } from "./types";

export const AWS_CONNECTION_SESSION_MINUTES = [15, 30, 60] as const;

export type AwsConnectionSessionMinutes = (typeof AWS_CONNECTION_SESSION_MINUTES)[number];

export type AwsConnectionDraft = {
  requestId: string;
  connectionName: string;
  accountId: string;
  roleName: string;
  oidcProviderArn: string;
  issuerUrl: string;
  subject: string;
  audience: string;
  sessionMinutes: AwsConnectionSessionMinutes;
  regions: string[];
};

export type ConnectionValidationIssue = {
  field: keyof AwsConnectionDraft | "draft";
  message: string;
};

export type SecureConnectionManifest = {
  apiVersion: "infracanvas.io/v1alpha1";
  kind: "SecureCloudConnection";
  metadata: { id: string; name: string };
  spec: {
    provider: "aws";
    authentication: {
      mode: "oidc-web-identity";
      issuer: string;
      subject: string;
      audience: string;
      roleArn: string;
      sessionDurationSeconds: number;
    };
    scope: { accountId: string; regions: string[]; access: "inventory-read-only" };
    storage: "session-only";
  };
  status: { phase: "prepared"; liveExchangeAvailable: false };
};

export type SecureConnectionBundle = {
  manifest: SecureConnectionManifest;
  files: GeneratedFile[];
  permissionCount: number;
};

const CREDENTIAL_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bASIA[0-9A-Z]{16}\b/,
  /\b(?:password|passwd|secret(?:_access)?_key|client_secret|refresh_token)\s*[:=]/i,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/i,
];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACCOUNT_PATTERN = /^\d{12}$/;
const ROLE_PATTERN = /^[A-Za-z0-9+=,.@_-]{1,64}$/;
const REGION_PATTERN = /^[a-z]{2,5}(?:-[a-z0-9]+)+-\d$/;

const REGIONAL_READ_ACTIONS = [
  "autoscaling:Describe*",
  "cloudwatch:Describe*",
  "cloudwatch:Get*",
  "cloudwatch:List*",
  "dynamodb:Describe*",
  "dynamodb:List*",
  "ec2:Describe*",
  "eks:Describe*",
  "eks:List*",
  "elasticache:Describe*",
  "elasticache:List*",
  "elasticloadbalancing:Describe*",
  "lambda:GetAccountSettings",
  "lambda:GetFunctionConfiguration",
  "lambda:GetFunctionEventInvokeConfig",
  "lambda:GetPolicy",
  "lambda:List*",
  "logs:Describe*",
  "logs:Get*",
  "logs:List*",
  "rds:Describe*",
  "rds:ListTagsForResource",
  "sns:Get*",
  "sns:List*",
  "sqs:GetQueueAttributes",
  "sqs:GetQueueUrl",
  "sqs:ListQueues",
  "sqs:ListQueueTags",
] as const;

const GLOBAL_READ_ACTIONS = [
  "cloudfront:Get*",
  "cloudfront:List*",
  "iam:Get*",
  "iam:List*",
  "route53:Get*",
  "route53:List*",
  "s3:GetAccountPublicAccessBlock",
  "s3:GetBucket*",
  "s3:ListAllMyBuckets",
  "s3:ListBucket",
  "tag:GetResources",
  "tag:GetTagKeys",
  "tag:GetTagValues",
] as const;

export const AWS_INVENTORY_PERMISSION_COUNT =
  REGIONAL_READ_ACTIONS.length + GLOBAL_READ_ACTIONS.length;

const containsCredential = (value: string) => CREDENTIAL_PATTERNS.some((pattern) => pattern.test(value));

function normalizedIssuer(value: string): URL | null {
  try {
    const issuer = new URL(value);
    if (issuer.protocol !== "https:" || issuer.username || issuer.password || issuer.search || issuer.hash) {
      return null;
    }
    const host = issuer.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "::1" ||
      host.endsWith(".local") ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) {
      return null;
    }
    return issuer;
  } catch {
    return null;
  }
}

export function validateAwsConnectionDraft(draft: AwsConnectionDraft): ConnectionValidationIssue[] {
  const issues: ConnectionValidationIssue[] = [];
  const entries = Object.entries(draft).filter(([, value]) => typeof value === "string") as Array<
    [keyof AwsConnectionDraft, string]
  >;

  entries.forEach(([field, value]) => {
    if (containsCredential(value)) {
      issues.push({ field, message: "Credentials and secret material are not accepted here." });
    }
  });

  if (!UUID_PATTERN.test(draft.requestId)) {
    issues.push({ field: "requestId", message: "Create a fresh session request before continuing." });
  }
  if (!draft.connectionName.trim() || draft.connectionName.trim().length > 80) {
    issues.push({ field: "connectionName", message: "Use a connection name between 1 and 80 characters." });
  }
  if (!ACCOUNT_PATTERN.test(draft.accountId)) {
    issues.push({ field: "accountId", message: "Enter the 12-digit AWS account ID." });
  }
  if (!ROLE_PATTERN.test(draft.roleName)) {
    issues.push({ field: "roleName", message: "Use a valid IAM role name up to 64 characters." });
  }
  const issuer = normalizedIssuer(draft.issuerUrl);
  if (!issuer) {
    issues.push({ field: "issuerUrl", message: "Use a public HTTPS issuer URL without credentials, query, or fragment." });
  } else {
    const issuerResource = `${issuer.host}${issuer.pathname}`.replace(/\/$/, "");
    const expectedProviderArn = `arn:aws:iam::${draft.accountId}:oidc-provider/${issuerResource}`;
    if (draft.oidcProviderArn !== expectedProviderArn) {
      issues.push({ field: "oidcProviderArn", message: "Use the exact OIDC provider ARN from this AWS account and issuer." });
    }
  }

  if (!draft.subject.trim() || draft.subject.length > 255 || /[*?\s]/.test(draft.subject)) {
    issues.push({ field: "subject", message: "Use one exact OIDC subject. Wildcards are refused." });
  }
  if (!draft.audience.trim() || draft.audience.length > 255 || /[*?\s]/.test(draft.audience)) {
    issues.push({ field: "audience", message: "Use one exact OIDC audience. Wildcards are refused." });
  }
  if (!(AWS_CONNECTION_SESSION_MINUTES as readonly number[]).includes(draft.sessionMinutes)) {
    issues.push({ field: "sessionMinutes", message: "Session duration must be 15, 30, or 60 minutes." });
  }

  const uniqueRegions = new Set(draft.regions);
  if (draft.regions.length === 0 || draft.regions.length > 12 || uniqueRegions.size !== draft.regions.length) {
    issues.push({ field: "regions", message: "Choose between 1 and 12 unique AWS regions." });
  } else if (draft.regions.some((region) => !REGION_PATTERN.test(region))) {
    issues.push({ field: "regions", message: "One or more AWS region identifiers are invalid." });
  }

  return issues;
}

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

function hclString(value: string) {
  return JSON.stringify(value);
}

export function generateAwsConnectionBundle(draft: AwsConnectionDraft): SecureConnectionBundle {
  const issues = validateAwsConnectionDraft(draft);
  if (issues.length > 0) {
    throw new Error(issues.map((issue) => issue.message).join(" "));
  }

  const issuer = normalizedIssuer(draft.issuerUrl);
  if (!issuer) throw new Error("Issuer validation failed.");
  const issuerConditionPrefix = `${issuer.host}${issuer.pathname}`.replace(/\/$/, "");
  const roleArn = `arn:aws:iam::${draft.accountId}:role/${draft.roleName}`;
  const manifest: SecureConnectionManifest = {
    apiVersion: "infracanvas.io/v1alpha1",
    kind: "SecureCloudConnection",
    metadata: { id: draft.requestId, name: draft.connectionName.trim() },
    spec: {
      provider: "aws",
      authentication: {
        mode: "oidc-web-identity",
        issuer: issuer.toString().replace(/\/$/, ""),
        subject: draft.subject,
        audience: draft.audience,
        roleArn,
        sessionDurationSeconds: draft.sessionMinutes * 60,
      },
      scope: {
        accountId: draft.accountId,
        regions: [...draft.regions],
        access: "inventory-read-only",
      },
      storage: "session-only",
    },
    status: { phase: "prepared", liveExchangeAvailable: false },
  };

  const trustPolicy = {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { Federated: draft.oidcProviderArn },
        Action: "sts:AssumeRoleWithWebIdentity",
        Condition: {
          StringEquals: {
            [`${issuerConditionPrefix}:aud`]: draft.audience,
            [`${issuerConditionPrefix}:sub`]: draft.subject,
          },
        },
      },
    ],
  };

  const inventoryPolicy = {
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "RegionalInventoryReadOnly",
        Effect: "Allow",
        Action: REGIONAL_READ_ACTIONS,
        Resource: "*",
        Condition: { StringEquals: { "aws:RequestedRegion": draft.regions } },
      },
      {
        Sid: "GlobalInventoryReadOnly",
        Effect: "Allow",
        Action: GLOBAL_READ_ACTIONS,
        Resource: "*",
      },
    ],
  };

  const variablesTf = `variable "bootstrap_region" {
  description = "Region used only for AWS provider bootstrap calls."
  type        = string
  default     = ${hclString(draft.regions[0])}
}
`;
  const mainTf = `terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = var.bootstrap_region
}

resource "aws_iam_policy" "infracanvas_inventory" {
  name        = ${hclString(`${draft.roleName}-inventory`)}
  description = "Read-only infrastructure inventory for InfraCanvas; no secret or object-value access."
  policy      = file("\${path.module}/inventory-policy.json")
}

resource "aws_iam_role" "infracanvas" {
  name = ${hclString(draft.roleName)}
  # AWS IAM roles have a 3,600-second minimum for MaxSessionDuration. The
  # trusted broker must request the shorter duration recorded in the manifest.
  max_session_duration = 3600
  assume_role_policy   = file("\${path.module}/trust-policy.json")
}

resource "aws_iam_role_policy_attachment" "inventory" {
  role       = aws_iam_role.infracanvas.name
  policy_arn = aws_iam_policy.infracanvas_inventory.arn
}
`;
  const outputsTf = `output "role_arn" {
  description = "Role a trusted OIDC subject may assume for a short read-only inventory session."
  value       = aws_iam_role.infracanvas.arn
}

output "connection_request_id" {
  description = "Non-secret correlation ID generated for this browser session."
  value       = ${hclString(draft.requestId)}
}
`;
  const readme = `# InfraCanvas secure AWS connection setup

This packet prepares a short-lived, read-only OIDC trust. It contains **no AWS access key, secret
key, session token, private key, or Terraform state**.

## Security boundary

- Only the exact OIDC subject \`${draft.subject}\` and audience \`${draft.audience}\` are trusted.
- Wildcard subjects and audiences are refused by InfraCanvas.
- The connection manifest tells the trusted broker to request ${draft.sessionMinutes}-minute
  sessions. AWS requires the role's maximum-session setting to be at least 60 minutes, so the
  broker must always send the requested shorter \`DurationSeconds\` value.
- Regional inventory calls are limited to ${draft.regions.join(", ")}.
- The policy intentionally omits secret-value and object-value APIs such as
  \`secretsmanager:GetSecretValue\`, \`ssm:GetParameter\`, and \`s3:GetObject\`.
- The browser-only InfraCanvas build does not exchange tokens or call AWS. A separately deployed,
  trusted OIDC broker must issue the matching short-lived identity token.

## Review and apply

1. Confirm the OIDC provider ARN, issuer, subject, audience, regions, and every permission.
2. Run \`terraform init\` and \`terraform validate\`.
3. Run \`terraform plan\` and have a cloud administrator review it.
4. Apply only after the trust boundary and least-privilege policy are approved.
5. Configure your trusted broker to request role \`${roleArn}\` for no more than ${draft.sessionMinutes} minutes.

Deleting the generated IAM role and policy revokes this trust. InfraCanvas does not retain this
packet after the current browser workspace is closed.
`;

  return {
    manifest,
    permissionCount: AWS_INVENTORY_PERMISSION_COUNT,
    files: [
      { path: "README.md", language: "markdown", contents: readme },
      { path: "connection-manifest.json", language: "json", contents: json(manifest) },
      { path: "trust-policy.json", language: "json", contents: json(trustPolicy) },
      { path: "inventory-policy.json", language: "json", contents: json(inventoryPolicy) },
      { path: "versions.tf", language: "hcl", contents: mainTf },
      { path: "variables.tf", language: "hcl", contents: variablesTf },
      { path: "outputs.tf", language: "hcl", contents: outputsTf },
      { path: ".gitignore", language: "text", contents: ".terraform/\n*.tfstate\n*.tfstate.*\n.terraform.lock.hcl\n" },
    ],
  };
}
