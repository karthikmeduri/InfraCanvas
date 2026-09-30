# InfraCanvas feature cadence

The cadence delivers one reviewable feature branch every two days. A feature is recorded as
complete only when its branch is pushed, automated checks are run, and a pull request is open.
Pull requests are never merged automatically. Large areas may ship as an explicitly scoped,
production-quality vertical slice with the remaining boundary documented.

| # | Feature | Status | Branch / PR | Evidence and limitations |
| --- | --- | --- | --- | --- |
| 1 | Architecture Pull Requests / Change Intelligence | Complete · awaiting review | `codex/feature-change-intelligence` · [PR #6](https://github.com/karthikmeduri/InfraCanvas/pull/6) | Typecheck, lint, tests, build, security review, and four-provider OpenTofu validation passed in GitHub Actions. One root architecture snapshot per repository. |
| 2 | Four-way Reconciliation Center | Complete · awaiting review | `codex/feature-reconciliation-center` · [PR #7](https://github.com/karthikmeduri/InfraCanvas/pull/7) | Read-only comparison across canvas, generated IaC, imported state, and imported TFwhy live evidence. All GitHub CI checks passed. |
| 3 | Secure cloud connection using short-lived identity | In progress | `codex/feature-secure-cloud-connection` | AWS OIDC onboarding slice: exact identity trust, session-only metadata, and validated read-only Terraform setup packet. No live broker or cloud call. |
| 4 | Cost and security overlays | Next | — | Canvas and PR-level impact views. |
| 5 | Shareable diagrams and production template gallery | Planned | — | — |
| 6 | Team workspaces and review collaboration | Planned | — | — |
| 7 | Reusable versioned architecture components | Planned | — | — |
| 8 | Kubernetes and Crossplane support | Planned | — | — |
| 9 | Zero Trust AI Architect | Planned | — | One-way, catalog-constrained creation only; no retrieval or inference over tenant data. |

## Run log

### 2026-09-26 · Change Intelligence

- Added deterministic, redacted repository snapshots and architecture pull-request reviews.
- Pull request: [#6](https://github.com/karthikmeduri/InfraCanvas/pull/6)

### 2026-09-28 · Reconciliation Center

- Added a read-only four-way comparison across canvas, generated IaC, imported state, and TFwhy.
- Treated missing evidence as pending rather than healthy and excluded credential-shaped values.
- Pull request: [#7](https://github.com/karthikmeduri/InfraCanvas/pull/7)

### 2026-09-30 · Secure Cloud Connect

- Added an AWS OIDC onboarding workspace that never accepts access keys or secret material.
- Generates an exact issuer/subject/audience trust, region-bounded inventory policy, connection
  manifest, and reviewable Terraform setup packet.
- Refuses wildcard trust, unsafe issuers, credential-shaped input, and account/issuer confusion.
- The packet passes OpenTofu formatting and provider-backed validation; 45 unit/security tests,
  four rendered-output tests, typecheck, lint, and the production build pass locally.
- Honest boundary: this slice prepares trust only. A separately deployed, audited OIDC broker is
  still required for token exchange and live inventory. Azure, Google Cloud, and OCI federation
  packets are not included in this slice.
- Pull request: pending.
- Next: cost and security overlays.
