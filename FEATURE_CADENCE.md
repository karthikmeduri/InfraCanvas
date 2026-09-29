# InfraCanvas feature cadence

The cadence delivers one reviewable feature branch every two days. A feature is recorded as
complete only when its branch is pushed, automated checks are run, and a pull request is open.
Pull requests are never merged automatically.

| # | Feature | Status | Branch / PR | Evidence and limitations |
| --- | --- | --- | --- | --- |
| 1 | Architecture Pull Requests / Change Intelligence | Complete · awaiting review | `codex/feature-change-intelligence` · [PR #6](https://github.com/karthikmeduri/InfraCanvas/pull/6) | Typecheck, lint, tests, build, security review, and four-provider OpenTofu validation passed in GitHub Actions. One root architecture snapshot per repository. |
| 2 | Four-way Reconciliation Center | In progress | `codex/feature-reconciliation-center` | Compares canvas, generated Terraform, imported StateLens state, and an imported TFwhy live snapshot. It is read-only and does not apply corrections. Direct cloud observation waits for Feature 3. |
| 3 | Secure cloud connection using short-lived identity | Next | — | No long-lived credentials will be stored. |
| 4 | Cost and security overlays | Planned | — | — |
| 5 | Shareable diagrams and production template gallery | Planned | — | — |
| 6 | Team workspaces and review collaboration | Planned | — | — |
| 7 | Reusable versioned architecture components | Planned | — | — |
| 8 | Kubernetes and Crossplane support | Planned | — | — |
| 9 | Zero Trust AI Architect | Planned | — | One-way, catalog-constrained creation only; no retrieval or inference over tenant data. |

## Current feature notes

The Reconciliation Center treats each input as a snapshot with explicit provenance:

- **Canvas** — the desired architecture currently open in the browser.
- **IaC** — resource blocks in the Terraform generated from that canvas.
- **State** — the local Terraform or Pulumi export imported through StateLens.
- **Live** — the local TFwhy scan imported by the user.

Missing evidence is shown as **Not loaded**, never as healthy. The workspace recommends a safe next
step but deliberately does not mutate the canvas, state, IaC, or infrastructure.
