# InfraCanvas feature cadence

One production-quality feature is implemented per scheduled run. Pull requests remain review-gated
and are never merged or deployed by the cadence automation.

| # | Feature | Status | Branch / pull request | Evidence and limitations |
| --- | --- | --- | --- | --- |
| 1 | Architecture Pull Requests / Change Intelligence | Review ready | `codex/feature-change-intelligence` · [PR #6](https://github.com/karthikmeduri/InfraCanvas/pull/6) | CI green. Review and merge remain human-controlled. |
| 2 | Four-way Reconciliation Center | Review ready | `codex/feature-reconciliation-center` · [PR #7](https://github.com/karthikmeduri/InfraCanvas/pull/7) | CI green. Shipped as an honest local comparison slice. |
| 3 | Secure cloud connection | Review ready | `codex/feature-secure-cloud-connection` · [PR #8](https://github.com/karthikmeduri/InfraCanvas/pull/8) | CI green. AWS short-lived OIDC onboarding; no long-lived credentials. |
| 4 | Cost and security overlays | Implemented in this branch | `codex/feature-cost-security-overlays` · PR pending | 46 generator/security tests + 4 rendered tests pass. Broad planning bands, not live prices; static checks, not certification. |
| 5 | Shareable diagrams + production template gallery | Next | — | Must exclude secrets and preserve safe defaults. |
| 6 | Team workspaces and review collaboration | Planned | — | — |
| 7 | Reusable versioned architecture components | Planned | — | — |
| 8 | Kubernetes and Crossplane support | Planned | — | — |
| 9 | Zero Trust AI Architect | Planned | — | Strictly one-way, catalog-constrained, retrieval-denying security boundary required. |

## Feature 4 validation

- `npm run typecheck`
- `npm run lint`
- `npm test` — 46 generator/security tests and 4 rendered HTML tests
- `npm run emit:terraform` plus OpenTofu validation for AWS, Azure, GCP, and OCI
- `npm audit --omit=dev --audit-level=high` (known baseline findings documented in the PR)

## Feature 4 security boundary

Insights operates on the in-memory canvas only. It strips credential-shaped properties, makes no
cloud or billing API calls, stores no analysis result, and never changes the diagram. The score and
findings are deterministic planning aids rather than live scans, provider quotes, or compliance
certification.
