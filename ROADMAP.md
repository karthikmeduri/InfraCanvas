# InfraCanvas roadmap

InfraCanvas is **The Bidirectional IaC Workspace**: one editable graph connecting an
infrastructure prompt, visual architecture, generated code, imported state, and drift.
This roadmap is public so users can distinguish shipped capability from product direction.

## Status language

- **Available** — implemented and covered by the repository test suite.
- **In progress** — actively being designed or built; the interface must not advertise it as shipped.
- **Planned** — accepted direction without a promised delivery date.

## Available now

- [x] Visual architecture authoring for AWS, Azure, Google Cloud, and Oracle Cloud
- [x] AI-assisted prompt-to-architecture drafts with catalog validation and local fallback
- [x] Per-resource configuration and graph-aware connection validation
- [x] Complete multi-file Terraform generation with OpenTofu formatting checks
- [x] Pulumi TypeScript project generation from the same architecture
- [x] StateLens imports for Terraform state, Terraform plan JSON, and Pulumi stack exports
- [x] TFwhy drift reports mapped to affected canvas resources
- [x] SVG, PNG, JSON, Terraform, and Pulumi project exports
- [x] Secure production-scale example architectures for every supported provider

## Next: close the reconciliation loop

- [ ] Compare canvas configuration, generated IaC, imported state, and drift in one review
- [ ] Let users choose the desired source of truth for each detected difference
- [ ] Generate a reviewable correction without silently changing the canvas or cloud
- [ ] Add nested VPC, VNet, and VCN boundary groups
- [ ] Add cost estimates with region, size, and usage assumptions shown explicitly
- [ ] Generate reusable module boundaries instead of only flat resource sets
- [ ] Add architecture version diffs that explain nodes, connections, and configuration changes

## Later: controlled delivery and collaboration

- [ ] Git provider integration that exports to a branch and opens a pull request
- [ ] CI templates for formatting, validation, policy checks, and preview artifacts
- [ ] Review-gated deployment using short-lived cloud credentials
- [ ] Plan-before-apply, explicit approval, audit history, and cancellation controls
- [ ] Team workspaces, comments, saved versions, and architecture approval roles
- [ ] Policy packs for public exposure, encryption, backups, identity, and resilience
- [ ] Shareable read-only architecture links with secrets excluded

## Deployment safety requirements

A hosted deploy capability will not be considered complete until it has all of the following:

1. Short-lived identity federation rather than stored long-lived access keys.
2. A visible Terraform/OpenTofu plan or Pulumi preview before every change.
3. Explicit human approval for the exact reviewed plan.
4. State locking, idempotency, cancellation, and an immutable audit record.
5. Clear separation between generation, validation, approval, and execution permissions.
6. No cloud credentials, state secrets, or sensitive outputs exposed to the browser or logs.

## How to influence priorities

Open a feature request and describe the user problem, cloud provider, IaC target, expected
workflow, security constraints, and a small example. Contributions should preserve the core
promise: every direction through the infrastructure lifecycle returns to one understandable,
editable graph.