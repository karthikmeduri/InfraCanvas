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
  a cloud provider. It generates text; you run Terraform yourself.

## Cost and security overlay boundary

The Insights workspace analyzes the in-memory canvas only. Before analysis it removes properties
whose names look like passwords, tokens, credentials, access keys, private keys, or client
secrets. The analysis is deterministic, does not call cloud or billing APIs, is not written to
storage, and introduces no telemetry. Automated tests assert that credential-shaped values cannot
appear in the overlay output and that the input diagram is not mutated.

Findings cover a bounded set of configuration patterns. A clean result does not prove that the
deployed infrastructure is secure, vulnerability-free, or compliant. Cost bands are planning
heuristics rather than live prices or billing forecasts.

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
