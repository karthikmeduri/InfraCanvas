# Security

## Reporting a vulnerability

Please report security issues privately through
[GitHub Security Advisories](../../security/advisories/new) rather than opening a public
issue. We aim to acknowledge within a few days.

## How InfraCanvas handles your data

- **Nothing leaves your browser.** The builder is entirely client-side. There is no
  backend API, no account system, and no analytics or telemetry.
- **Projects are stored in `localStorage`** under `infracanvas.project.v2`, on your machine
  only. Clearing site data removes them.
- **The app never asks for cloud credentials** and has no code path that sends a request to
  a cloud provider. Secure Cloud Connect accepts only non-secret trust metadata and generates a
  reviewable setup packet; you run Terraform yourself.
- **Secure connection drafts are session-only.** The Connect workspace does not write identity
  metadata to `localStorage`, IndexedDB, logs, or an InfraCanvas backend. Leaving the workspace
  discards the draft.

## Secure Cloud Connect boundary

The AWS onboarding slice prepares an OIDC web-identity role and least-privilege inventory policy.
It refuses access keys, private keys, secret-shaped input, wildcard subjects, wildcard audiences,
private/local issuer URLs, and OIDC provider ARNs from another AWS account. Session duration is
capped at one hour and region scope is explicit.

The generated inventory policy excludes APIs that return secret values or stored object contents,
including `secretsmanager:GetSecretValue`, `ssm:GetParameter`, and `s3:GetObject`. The current
browser-only application does not operate an identity broker, exchange tokens, validate the role
against AWS, or present the setup as connected. Those capabilities require a separately deployed,
audited server-side broker that can issue tenant-bound OIDC identities without long-lived cloud
credentials.

## How generated Terraform handles secrets

Credentials are never written into the generated configuration as literals. Anything
sensitive is emitted as a Terraform input variable marked `sensitive = true`, usually with
a length validation rule:

```hcl
variable "database_password" {
  description = "Master password. Supply from a secrets manager, never in source control."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.database_password) >= 16
    error_message = "Use a database password of at least 16 characters."
  }
}
```

Supply these from your CI secret store, a secrets manager, or `TF_VAR_` environment
variables. The downloaded module bundles a `.gitignore` that excludes `*.tfvars` and
`*.tfstate`, because Terraform state files contain resource attributes and can hold
secrets in plaintext.

## Review the plan

The generated module is a strong starting point with secure defaults — encryption on,
public access blocked, IMDSv2 required, deletion protection enabled — but it is not a
substitute for review. Cloud accounts, network boundaries, certificates, and organisation
policies differ.

Always run:

```bash
terraform init
terraform validate
terraform plan
```

and read the plan before `terraform apply`.

## Scope

Reports we are interested in:

- Generated Terraform that is insecure by default (open ingress, unencrypted storage,
  public exposure that the diagram did not ask for)
- Any path that writes a secret into generated output or to disk
- Cross-site scripting via project names, resource names, or restored `localStorage` data
- Supply-chain concerns in the dependency tree

Out of scope: the security of infrastructure you deploy after editing the generated
template, and issues that require a compromised local machine.
