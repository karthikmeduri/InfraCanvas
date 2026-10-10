# InfraCanvas feature cadence

This file records the automated two-day feature cadence. A feature is marked complete only after
its branch is pushed, tests pass, and a pull request is opened. Large product areas may ship as an
explicitly scoped end-to-end slice with remaining work recorded.

| # | Feature | Status | Branch / PR | Scope and evidence |
| ---: | --- | --- | --- | --- |
| 1 | Architecture Pull Requests / Change Intelligence | Complete | [`codex/feature-change-intelligence` · PR #6](https://github.com/karthikmeduri/InfraCanvas/pull/6) | 46 generator/security tests + 4 rendered tests; typecheck, lint, build, and CLI smoke test passed. One root snapshot per repository in this slice. |
| 2 | Four-way Reconciliation Center | Complete | [`codex/feature-reconciliation-center` · PR #7](https://github.com/karthikmeduri/InfraCanvas/pull/7) | Five CI jobs passed. Open PR currently conflicts with newer `main` and needs a maintainer rebase before merge. |
| 3 | Secure cloud connection | Complete | [`codex/feature-secure-cloud-connection` · PR #8](https://github.com/karthikmeduri/InfraCanvas/pull/8) | AWS OIDC onboarding slice; five CI jobs passed. Open PR currently needs a maintainer rebase before merge. |
| 4 | Cost and security overlays | Complete | [`codex/feature-cost-security-overlays` · PR #9](https://github.com/karthikmeduri/InfraCanvas/pull/9) | Cost/security insight slice; five CI jobs passed. Open PR currently needs a maintainer rebase before merge. |
| 5 | Shareable diagrams and template gallery | Complete | [`codex/feature-shareable-template-gallery` · PR #10](https://github.com/karthikmeduri/InfraCanvas/pull/10) | Secure share/template slice; five CI jobs passed. Open PR currently needs a maintainer rebase before merge. |
| 6 | Team workspaces and review collaboration | Complete | [`codex/feature-team-review-collaboration` · PR #11](https://github.com/karthikmeduri/InfraCanvas/pull/11) | Local-first Review Room slice; five CI jobs passed and PR is mergeable. |
| 7 | Reusable architecture components | Complete | [`codex/feature-versioned-architecture-components` · PR #12](https://github.com/karthikmeduri/InfraCanvas/pull/12) | Local Component Registry slice: immutable versions, typed inputs, bounded package exchange, and fresh-ID instantiation. Full build, 52 generator/security tests, 4 rendered tests, typecheck, lint, OpenTofu formatting, and responsive browser QA passed. |
| 8 | Kubernetes and Crossplane support | Next | — | Workloads, compositions, and ownership graph |
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

### 2026-10-10 · Versioned architecture components

- Added a local Component Registry that captures selected canvas subgraphs with relative layout
  and internal topology.
- Added immutable semantic versions, catalog-derived typed input contracts, validated overrides,
  and fresh identifiers for every inserted instance.
- Added bounded import/export with provider/service/field allowlists, credential-shaped data
  removal, graph validation, and deterministic integrity checks.
- Documented that browser-local storage and integrity digests are not substitutes for hosted
  access control, publisher identity, cryptographic signing, provenance, or organization policy.
- Pull request: [#12](https://github.com/karthikmeduri/InfraCanvas/pull/12)
- Verification: production build, 52 generator/security tests, 4 rendered tests, typecheck,
  lint, OpenTofu formatting, and responsive browser QA passed. GitHub provider validation is
  tracked on the pull request.
- Known repository baseline: `npm audit --omit=dev --audit-level=high` reports one moderate,
  four high, and one critical production dependency advisory; the available complete Next.js fix
  is outside the pinned range, so this feature does not force an unrelated framework upgrade.
- Next: Kubernetes and Crossplane support.
