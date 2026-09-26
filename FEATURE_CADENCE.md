# InfraCanvas feature cadence

This file records the automated two-day feature cadence. A feature is marked complete only after
its branch is pushed, tests pass, and a pull request is opened. Large product areas may ship as an
explicitly scoped end-to-end slice with remaining work recorded.

| # | Feature | Status | Branch / PR | Scope and evidence |
| ---: | --- | --- | --- | --- |
| 1 | Architecture Pull Requests / Change Intelligence | In progress | `codex/feature-change-intelligence` | Repository snapshot export, validated diff engine, before/after SVGs, GitHub PR report, security tests |
| 2 | Four-way Reconciliation Center | Next | — | Canvas ↔ IaC ↔ state ↔ live cloud review |
| 3 | Secure cloud connection | Planned | — | Short-lived identity and least privilege |
| 4 | Cost and security overlays | Planned | — | Canvas and PR-level impact views |
| 5 | Shareable diagrams and template gallery | Planned | — | Private/public sharing and production templates |
| 6 | Team workspaces and review collaboration | Planned | — | Saved versions, comments, approvals, roles |
| 7 | Reusable architecture components | Planned | — | Typed, versioned organization components |
| 8 | Kubernetes and Crossplane support | Planned | — | Workloads, compositions, and ownership graph |
| 9 | Zero Trust AI Architect | Planned | — | One-way, catalog-constrained prompting without retrieval access |

## Cadence rules

- One feature or honest production-quality vertical slice per run.
- New feature branch from the latest `main`; never merge automatically.
- Typecheck, lint, tests, production build, relevant IaC validation, and security checks are required.
- No long-lived cloud credentials, hidden deployment, weakened branch protection, or silent scope claims.
