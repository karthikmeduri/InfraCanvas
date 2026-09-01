# Contributing to InfraCanvas

Thanks for taking the time. InfraCanvas is **The Bidirectional IaC Workspace**, so valuable
contributions can improve any part of the loop: prompt, diagram, provider configuration,
Terraform or Pulumi generation, state import, drift reconciliation, validation, or documentation.

## Ways to contribute

- Add or improve a verified cloud-service emitter and its configuration controls.
- Improve AI architecture normalization without allowing unknown or diagram-only services into IaC.
- Expand StateLens resource matching while continuing to exclude sensitive state attributes.
- Improve TFwhy matching, drift explanation, or future reconciliation review.
- Add accessibility, keyboard, responsive, export, test, documentation, or example improvements.
- Reproduce a focused issue and propose the smallest safe fix.

For a larger feature, open a feature request first and connect it to a milestone in
[ROADMAP.md](ROADMAP.md). Describe the user problem and security boundary before the
implementation. This keeps the product honest about what is available versus planned.

## Setup

```bash
npm install
npm run dev
```

Before opening a pull request:

```bash
npm run typecheck   # tsc --noEmit — must be clean
npm run lint        # eslint — must be clean, no new warnings
npm test            # build + generator suite + SSR smoke test
```

If you have [OpenTofu](https://opentofu.org/) or Terraform on your `PATH`, the test suite
automatically runs `fmt -check` against generated output for all four providers. Please
install one — it is the check that catches broken emitters.

## Adding a service

Open the catalog for the provider (`lib/catalog/aws.ts`, `azure.ts`, `gcp.ts`, `oci.ts`)
and add one `defineService` block. Everything else — sidebar grouping, icon, search,
graph resolution, outputs — follows from the fields you set.

```ts
defineService({
  id: "sqs",                     // stable id, used in saved projects
  name: "SQS Queue",             // sidebar and inspector title
  short: "SQS",                  // fallback glyph text
  category: "Integration",       // sidebar section, see CATEGORY_ORDER
  role: "queue",                 // how the graph resolver classifies it
  tfType: "aws_sqs_queue",       // primary type other resources reference
  description: "Durable message queue",
  docs: "https://registry.terraform.io/.../sqs_queue",
  fields: [
    toggle("fifo", "FIFO queue", false),
    number("visibility_timeout", "Visibility timeout (s)", "30"),
  ],
  emit: (c) => [ /* HCL entries */ ],
});
```

### Choosing a `role`

`role` is how the graph resolver answers "what is this instance connected to?". Pick the
closest match from `ServiceRole` in `lib/types.ts`:

| Role | Used for | Resolved by |
| --- | --- | --- |
| `network` | VPC, VNet, VCN | subnets, firewalls, clusters |
| `subnet` | subnets, subnetworks | compute, databases, load balancers |
| `firewall` | security groups, NSGs, firewall rules | compute, databases |
| `loadbalancer` | ALB, App Gateway, GCLB | compute and container services, for target attachment |
| `storage`, `database`, `cache`, `queue`, `secrets`, `identity`, … | everything else | services that reference them |

The icon is chosen from the role too, so a new service gets artwork for free.

### Writing an `emit` function

Build HCL with the helpers in `lib/hcl.ts` — never string concatenation. The emitter
enforces one argument per line and reproduces `terraform fmt` alignment, which is what
keeps the output parseable.

```ts
emit: (c) => [
  resource("aws_sqs_queue", c.name, [
    attr("name", str(dnsName(c.display, "queue", 70))),
    attr("visibility_timeout_seconds", num(c.v.visibility_timeout, 30)),
    attr("sqs_managed_sse_enabled", bool(true)),
    block("redrive_policy", [], [ /* ... */ ]),
    attr("tags", c.tags),
  ]),
]
```

The `c` context gives you:

| Member | Purpose |
| --- | --- |
| `c.name` | Terraform-safe local name, already deduplicated |
| `c.display` | The name the user typed |
| `c.v` | Configured field values |
| `c.tags` | `local.tags` reference |
| `c.ref(roles, attr, fallback)` | Nearest connected resource of `roles`, else a declared variable |
| `c.refList(roles, attr, fallback)` | Every connected match as a list |
| `c.has(roles)` | Whether a connected match exists — use it to emit optional blocks |
| `c.variable(spec)` | Declare an input variable, get `var.<name>` back |
| `c.output(spec)` | Register an output |
| `c.data(key, entry)` | Register a data source, deduplicated across the module |

**Never return a literal `null`, and never inline a credential.** If a reference cannot be
resolved from the diagram, pass a `VariableSpec` fallback so the module still validates and
the UI can tell the user which edge is missing.

## Security expectations

Generated Terraform is the product. Every emitter should default to the secure option:

- encryption at rest and in transit enabled
- public access blocked unless the resource is explicitly internet-facing
- deletion protection and backups on stateful resources
- credentials as `sensitive = true` variables with validation, never string literals

The test suite asserts that no catalog file inlines a password.

## Style

- Match the surrounding code: same naming, same comment density.
- Comments explain *why*, not *what*.
- No new runtime dependencies. The app ships React and nothing else at runtime, and the
  ZIP writer, SVG exporter, and syntax highlighter are all in-repo for that reason.
- Keep the UI keyboard accessible and label every control.
