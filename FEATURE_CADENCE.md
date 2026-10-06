# InfraCanvas feature cadence

The cadence ships one reviewed feature branch every two days. Pull requests stay unmerged until
their checks and product review are complete.

| # | Feature | Status | Branch / pull request | Evidence and boundary |
| --- | --- | --- | --- | --- |
| 1 | Architecture Pull Requests / Change Intelligence | Pull request open | [`codex/feature-change-intelligence`](https://github.com/karthikmeduri/InfraCanvas/pull/6) | CI green; review and merge remain manual. |
| 2 | Four-way Reconciliation Center | Pull request open | [`codex/feature-reconciliation-center`](https://github.com/karthikmeduri/InfraCanvas/pull/7) | CI green; review and merge remain manual. |
| 3 | Secure cloud connection | Pull request open | [`codex/feature-secure-cloud-connect`](https://github.com/karthikmeduri/InfraCanvas/pull/8) | CI green; short-lived identity slice only; no credentials stored. |
| 4 | Cost and security overlays | Pull request open | [`codex/feature-cost-security-insights`](https://github.com/karthikmeduri/InfraCanvas/pull/9) | CI green; estimates and policy hints are advisory. |
| 5 | Shareable diagrams + production template gallery | Pull request open | [`codex/feature-shareable-template-gallery`](https://github.com/karthikmeduri/InfraCanvas/pull/10) | Four provider templates; URL-fragment sharing with catalog allowlisting, credential-key stripping, import confirmation, limits, docs, and automated security tests. No server persistence, link access control, expiry, or revocation. |
| 6 | Team workspaces and review collaboration | Next | — | Pending after feature 5 review. |
| 7 | Reusable versioned architecture components | Planned | — | Not started. |
| 8 | Kubernetes and Crossplane support | Planned | — | Not started. |
| 9 | Zero Trust AI Architect | Planned | — | One-way, catalog-constrained intent-to-draft boundary required. |

## Feature 5 validation

- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run emit:terraform`
- OpenTofu `init -backend=false` and `validate` for AWS, Azure, GCP, and OCI
- `npm audit --omit=dev --audit-level=high`

Local verification passed: typecheck; clean lint; production build; 49 automated tests;
OpenTofu validation for AWS, Azure, GCP, and OCI; and desktop plus 375px browser QA. The
repository's existing production dependency audit baseline remains 1 moderate, 4 high, and 1
critical advisory, primarily in the current exact Next.js pin and its transitive dependencies.
PR CI status is recorded after GitHub completes the workflow.
