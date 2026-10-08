# InfraCanvas feature cadence

This file records the automated two-day feature cadence. A feature is marked complete only after
its branch is pushed, tests pass, and a pull request is opened. Large product areas may ship as an
explicitly scoped end-to-end slice with remaining work recorded.

| # | Feature | Status | Branch / PR | Scope and evidence |
| ---: | --- | --- | --- | --- |
| 1 | Architecture Pull Requests / Change Intelligence | Complete | [`codex/feature-change-intelligence` · PR #6](https://github.com/karthikmeduri/InfraCanvas/pull/6) | 46 generator/security tests + 4 rendered tests; typecheck, lint, build, and CLI smoke test passed. One root snapshot per repository in this slice. |
| 2 | Four-way Reconciliation Center | Complete | [`codex/feature-reconciliation-center` · PR #7](https://github.com/karthikmeduri/InfraCanvas/pull/7) | Read-only canvas ↔ IaC ↔ state ↔ imported TFwhy evidence; all five CI jobs pass. Direct live connection remains Feature 3. |
| 3 | Secure cloud connection | Complete | [`codex/feature-secure-cloud-connection` · PR #8](https://github.com/karthikmeduri/InfraCanvas/pull/8) | AWS OIDC trust-packet slice with no token broker or credential storage; all five CI jobs pass. Other providers remain follow-up work. |
| 4 | Cost and security overlays | Complete | [`codex/feature-cost-security-overlays` · PR #9](https://github.com/karthikmeduri/InfraCanvas/pull/9) | Deterministic local planning ranges and bounded configuration checks; all five CI jobs pass. Not billing quotes or live vulnerability scans. |
| 5 | Shareable diagrams and template gallery | Complete | [`codex/feature-shareable-template-gallery` · PR #10](https://github.com/karthikmeduri/InfraCanvas/pull/10) | Sanitized URL-fragment sharing and four-cloud production gallery; all five CI jobs pass. Links are not encrypted or access-controlled. |
| 6 | Team workspaces and review collaboration | In progress | `codex/feature-team-review-collaboration` | Local-first Review Room slice: redacted versions, anchored threads, decisions, portable packet, and audit summary. Hosted auth/realtime remain future work. |
| 7 | Reusable architecture components | Next | — | Typed, versioned organization components |
| 8 | Kubernetes and Crossplane support | Planned | — | Workloads, compositions, and ownership graph |
| 9 | Zero Trust AI Architect | Planned | — | One-way, catalog-constrained prompting without retrieval access |

## Cadence rules

- One feature or honest production-quality vertical slice per run.
- New feature branch from the latest `main`; never merge automatically.
- Typecheck, lint, tests, production build, relevant IaC validation, and security checks are required.
- No long-lived cloud credentials, hidden deployment, weakened branch protection, or silent scope claims.

## Run log

### 2026-09-26 · Change Intelligence

- Added deterministic, redacted repository snapshots and the builder's **PR JSON** action.
- Added architecture resource, configuration, connection, risk, and layout diffing.
- Added before/after SVGs, machine-readable JSON, Markdown review output, and PR comment updates.
- Hardened fork handling by executing only the trusted base commit and parsing contributor snapshots
  as bounded untrusted data.
- Pull request: [#6](https://github.com/karthikmeduri/InfraCanvas/pull/6)
- Next: four-way Reconciliation Center.

### 2026-10-08 · Review Room

- Added a browser-local architecture Review Room with named workflow roles, resource-anchored
  comments and replies, resolve/reopen, structural checkpoints, decisions, and bounded activity.
- Added portable JSON and Markdown exports that exclude diagram values, generated code, state,
  inventory, prompts, and credentials.
- Hardened import with a 512 KB cap, bounded collections, role/decision/author validation,
  credential detection, and safe handling of anchors absent from the current canvas.
- Verification: typecheck, lint, production build, 53 unit/generator/security tests, 4 rendered
  tests, `tofu fmt`, desktop visual QA, and 375 × 812 responsive QA passed. IaC generation was not
  changed; provider-backed `tofu validate` will run in GitHub CI because OpenTofu is unavailable on
  this host.
- Known dependency baseline: `npm audit --omit=dev --audit-level=high` reports 1 moderate, 4 high,
  and 1 critical pre-existing advisories. Dependencies are unchanged; the suggested Next.js fix is
  outside the exact pin and requires a dedicated vinext compatibility update.
- Pull request: pending.
- Next: reusable versioned architecture components.
