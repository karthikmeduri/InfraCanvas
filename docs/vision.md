# Product vision

## InfraCanvas — The Bidirectional IaC Workspace

Infrastructure teams should not need separate, disconnected tools to sketch an architecture,
generate code, understand an inherited stack, and investigate drift. InfraCanvas keeps those
representations connected to one editable cloud architecture graph.

## The promise

> Prompt it. Draw it. Configure it. Generate it. Import it. Reconcile it.

The canvas is not decoration. A connection represents infrastructure intent, resource controls
represent provider configuration, generated references preserve relationships, imported state
reconstructs existing relationships, and drift findings lead back to the resource that changed.

## Who it serves

- Platform and DevOps engineers designing repeatable cloud foundations
- Application teams that need deployable IaC without losing architectural context
- Architects reviewing security, connectivity, ownership, and change impact
- Learners who need to understand how cloud services become Terraform or Pulumi
- Teams inheriting infrastructure where state exists but documentation does not

## The closed loop

| Direction | Available workflow |
| --- | --- |
| Prompt → diagram | AI Architect proposes catalog-backed resources and guided configuration |
| Diagram → IaC | Connections become Terraform references and complete Pulumi projects |
| State → diagram | StateLens reconstructs editable AWS, Azure, GCP, or OCI resources |
| Drift → canvas | TFwhy findings are matched to affected nodes with severity and navigation |
| Canvas → correction | Planned reconciliation will let users review and resolve each difference |

## Product principles

1. **One graph, many representations.** Prompt, diagram, IaC, state, and drift describe the same system.
2. **Verified beats impressive.** Unsupported services remain honest diagram components until their emitters validate.
3. **Review before change.** AI may draft and tools may propose, but infrastructure changes require explicit review.
4. **Secure by default.** Generated resources favor encryption, private access, backups, and typed sensitive inputs.
5. **Cloud-native, not cloud-shaped.** Controls and references model real provider concepts instead of generic boxes.
6. **Portable and inspectable.** Users can export complete files and understand what InfraCanvas generated.
7. **No false completeness.** Available, in-progress, and planned capabilities are labelled consistently.

## Category position

InfraCanvas is not only a diagramming application, a Terraform visualizer, or an AI code
prompt. It is the workspace connecting those activities. Our recognizable category phrase is
**Bidirectional IaC Workspace**, and the product should use that phrase consistently in its app,
repository, documentation, releases, and demonstrations.

## Success

InfraCanvas succeeds when a user can enter at any point in the infrastructure lifecycle and
leave with a clearer, reviewable, editable representation—without losing relationships or
mistaking a visual approximation for deployable code.