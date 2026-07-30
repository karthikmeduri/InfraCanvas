import {
  attr,
  block,
  bool,
  comment,
  expr,
  listOf,
  obj,
  raw,
  render,
  str,
} from "../hcl";
import type {
  DiagramEdge,
  DiagramNode,
  EmitContext,
  GeneratedFile,
  OutputSpec,
  ProviderDefinition,
  RefAttribute,
  RefTarget,
  ServiceRole,
  VariableSpec,
} from "../types";
import type { HclEntry } from "../hcl";
import { buildGraph } from "./graph";

const resolveAttribute = (target: RefTarget, attribute: RefAttribute): string =>
  typeof attribute === "function"
    ? attribute(target)
    : `${target.tfType}.${target.name}.${attribute}`;

/** Variables every template gets, regardless of which services are on the canvas. */
function baseVariables(provider: ProviderDefinition, projectName: string): VariableSpec[] {
  const shared: VariableSpec[] = [
    {
      name: "project_name",
      type: "string",
      description: "Project identifier applied to every resource tag or label.",
      default: str(projectName || "infracanvas"),
    },
    {
      name: "environment",
      type: "string",
      description: "Deployment environment name.",
      default: str("production"),
      validation: {
        condition: 'contains(["production", "staging", "development"], var.environment)',
        errorMessage: "environment must be production, staging, or development.",
      },
    },
  ];

  switch (provider.id) {
    case "aws":
      return [
        {
          name: "region",
          type: "string",
          description: "AWS region for every resource in this template.",
          default: str(provider.defaultRegion),
        },
        ...shared,
      ];
    case "azure":
      return [
        {
          name: "subscription_id",
          type: "string",
          description: "Azure subscription id the resources are created in.",
        },
        {
          name: "location",
          type: "string",
          description: "Azure region for every resource in this template.",
          default: str(provider.defaultRegion),
        },
        {
          name: "resource_group_name",
          type: "string",
          description: "Resource group that owns the generated resources.",
          default: str("rg-infracanvas"),
        },
        ...shared,
      ];
    case "gcp":
      return [
        {
          name: "project_id",
          type: "string",
          description: "Google Cloud project id the resources are created in.",
        },
        {
          name: "region",
          type: "string",
          description: "Google Cloud region for regional resources.",
          default: str(provider.defaultRegion),
        },
        ...shared,
      ];
    case "oci":
      return [
        {
          name: "tenancy_ocid",
          type: "string",
          description: "OCID of the tenancy that owns the compartment.",
        },
        {
          name: "compartment_id",
          type: "string",
          description: "OCID of the compartment the resources are created in.",
        },
        {
          name: "region",
          type: "string",
          description: "OCI region for every resource in this template.",
          default: str(provider.defaultRegion),
        },
        ...shared,
      ];
  }
}

function providerBlocks(provider: ProviderDefinition): HclEntry[] {
  switch (provider.id) {
    case "aws":
      return [
        block("provider", ["aws"], [
          attr("region", raw("var.region")),
          block("default_tags", [], [attr("tags", raw("local.tags"))]),
        ]),
      ];
    case "azure":
      return [
        block("provider", ["azurerm"], [
          block("features", [], [
            block("resource_group", [], [
              attr("prevent_deletion_if_contains_resources", bool(true)),
            ]),
          ]),
          attr("subscription_id", raw("var.subscription_id")),
        ]),
        block("resource", ["azurerm_resource_group", "main"], [
          attr("name", raw("var.resource_group_name")),
          attr("location", raw("var.location")),
          attr("tags", raw("local.tags")),
        ]),
      ];
    case "gcp":
      return [
        block("provider", ["google"], [
          attr("project", raw("var.project_id")),
          attr("region", raw("var.region")),
        ]),
      ];
    case "oci":
      return [
        block("provider", ["oci"], [attr("region", raw("var.region"))]),
      ];
  }
}

function localsBlock(provider: ProviderDefinition): HclEntry {
  const isGcp = provider.id === "gcp";
  return block("locals", [], [
    attr(
      "tags",
      obj(
        isGcp
          ? {
              project: raw("var.project_name"),
              environment: raw("var.environment"),
              managed_by: str("terraform"),
              generated_by: str("infracanvas"),
            }
          : {
              Project: raw("var.project_name"),
              Environment: raw("var.environment"),
              ManagedBy: str("Terraform"),
              GeneratedBy: str("InfraCanvas"),
            },
      ),
    ),
  ]);
}

function variableEntry(spec: VariableSpec): HclEntry {
  const body: HclEntry[] = [
    attr("description", str(spec.description)),
    attr("type", raw(spec.type)),
  ];
  if (spec.default !== undefined) body.push(attr("default", spec.default));
  if (spec.sensitive) body.push(attr("sensitive", bool(true)));
  if (spec.validation) {
    body.push(
      block("validation", [], [
        attr("condition", raw(spec.validation.condition)),
        attr("error_message", str(spec.validation.errorMessage)),
      ]),
    );
  }
  return block("variable", [spec.name], body);
}

export type GenerationResult = {
  files: GeneratedFile[];
  /** Resources that fell back to an input variable because an edge was missing. */
  unresolved: { nodeId: string; label: string; variable: string }[];
  resourceCount: number;
};

export function generate(
  provider: ProviderDefinition,
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  projectName: string,
): GenerationResult {
  const graph = buildGraph(provider, nodes, edges);

  const variables = new Map<string, VariableSpec>();
  baseVariables(provider, projectName).forEach((spec) => variables.set(spec.name, spec));

  const outputs: OutputSpec[] = [];
  const dataSources = new Map<string, HclEntry>();
  const unresolved: GenerationResult["unresolved"] = [];

  const declareVariable = (spec: VariableSpec) => {
    if (!variables.has(spec.name)) variables.set(spec.name, spec);
    return raw(`var.${spec.name}`);
  };

  const resourceEntries: HclEntry[] = [];
  let resourceCount = 0;

  graph.ordered.forEach((item) => {
    const rolesOf = (roles: ServiceRole | ServiceRole[]) =>
      Array.isArray(roles) ? roles : [roles];

    const reachableMatches = (roles: ServiceRole | ServiceRole[]) =>
      graph
        .findByRole(item.node.id, rolesOf(roles))
        .filter((match) => Number.isFinite(match.distance));

    const noteFallback = (spec: VariableSpec) => {
      unresolved.push({
        nodeId: item.node.id,
        label: item.node.values.name || item.service.name,
        variable: spec.name,
      });
    };

    const context: EmitContext = {
      provider: provider.id,
      name: item.name,
      display: item.node.values.name || item.service.name,
      v: item.node.values,
      tags: raw("local.tags"),
      connected: (graph.neighbours.get(item.node.id) ?? []).length > 0,
      has: (roles) =>
        graph.findByRole(item.node.id, rolesOf(roles)).some((match) => match.distance === 1),
      variable: declareVariable,
      output: (spec) => outputs.push(spec),
      data: (key, entry) => {
        if (!dataSources.has(key)) dataSources.set(key, entry);
      },
      ref: (roles, attribute, fallback) => {
        const all = graph.findByRole(item.node.id, rolesOf(roles));
        const reachable = all.filter((match) => Number.isFinite(match.distance));
        // Prefer a connected resource; otherwise accept a lone unconnected one
        // of the right role, which is almost always what the author meant.
        const chosen = reachable[0] ?? (all.length === 1 ? all[0] : undefined);
        if (chosen) return raw(resolveAttribute(chosen.item.target, attribute));
        noteFallback(fallback);
        return declareVariable(fallback);
      },
      refList: (roles, attribute, fallback) => {
        const reachable = reachableMatches(roles);
        if (reachable.length > 0) {
          // A diagram can contain many resources of the same role. Only use
          // the closest connected tier so an ALB wired to public subnets does
          // not also absorb private/data subnets through the VPC graph.
          const nearestDistance = reachable[0].distance;
          const nearest = reachable.filter((match) => match.distance === nearestDistance);
          return listOf(
            nearest.map((match) => raw(resolveAttribute(match.item.target, attribute))),
          );
        }
        noteFallback(fallback);
        return declareVariable(fallback);
      },
    };

    const emitted = item.service.emit(context);
    if (emitted.length === 0) return;

    resourceCount += emitted.filter((entry) => entry.kind === "block" && entry.type === "resource")
      .length;
    resourceEntries.push(
      comment(`${item.service.name} — ${context.display}`),
      ...emitted,
      { kind: "blank" },
    );
  });

  const versionsFile = render([
    comment("Generated by InfraCanvas. Pin these versions in source control."),
    block("terraform", [], [
      attr("required_version", str(">= 1.9.0")),
      block("required_providers", [], [
        attr(
          provider.id === "azure" ? "azurerm" : provider.id === "gcp" ? "google" : provider.id,
          obj({
            source: str(provider.source),
            version: str(provider.versionConstraint),
          }),
        ),
      ]),
      comment("Configure remote state before running this in a team."),
      comment('backend "s3" {}'),
    ]),
  ]);

  const providersFile = render([
    comment("Provider configuration and shared foundations."),
    ...providerBlocks(provider),
  ]);

  const variablesFile = render(
    [...variables.values()]
      .sort((a, b) => {
        // Required variables (no default) first — they are what a user must supply.
        const aRequired = a.default === undefined ? 0 : 1;
        const bRequired = b.default === undefined ? 0 : 1;
        if (aRequired !== bRequired) return aRequired - bRequired;
        return a.name.localeCompare(b.name);
      })
      .flatMap((spec) => [variableEntry(spec), { kind: "blank" } as HclEntry]),
  );

  const localsFile = render([
    comment("Shared tags applied to every generated resource."),
    localsBlock(provider),
  ]);

  const mainEntries: HclEntry[] = [
    comment("Resources generated from the InfraCanvas diagram."),
    comment(`${nodes.length} nodes · ${edges.length} connections`),
    { kind: "blank" },
  ];
  if (dataSources.size > 0) {
    mainEntries.push(comment("Data sources"));
    dataSources.forEach((entry) => {
      mainEntries.push(entry, { kind: "blank" });
    });
  }
  mainEntries.push(...resourceEntries);

  const mainFile = render(
    resourceEntries.length > 0
      ? mainEntries
      : [comment("Drop resources onto the InfraCanvas grid to generate infrastructure.")],
  );

  const outputsFile = render(
    outputs.length > 0
      ? outputs.flatMap((spec) => [
          block("output", [spec.name], [
            attr("description", str(spec.description)),
            attr("value", spec.value),
            ...(spec.sensitive ? [attr("sensitive", bool(true))] : []),
          ]),
          { kind: "blank" } as HclEntry,
        ])
      : [comment("No outputs yet — add resources that expose endpoints or identifiers.")],
  );

  const tfvarsExample = [
    "# Copy to terraform.tfvars and fill in real values.",
    "# Never commit terraform.tfvars — it is git-ignored by the bundled .gitignore.",
    "",
    ...[...variables.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((spec) => {
        const placeholder = spec.sensitive
          ? '"set-me-from-a-secrets-manager"'
          : spec.default !== undefined
            ? expr(spec.default)
            : spec.type.startsWith("list")
              ? "[]"
              : '""';
        const prefix = spec.sensitive || spec.default === undefined ? "" : "# ";
        return `# ${spec.description}\n${prefix}${spec.name} = ${placeholder}`;
      }),
    "",
  ].join("\n");

  return {
    files: [
      { path: "main.tf", language: "hcl", contents: mainFile },
      { path: "variables.tf", language: "hcl", contents: variablesFile },
      { path: "outputs.tf", language: "hcl", contents: outputsFile },
      { path: "locals.tf", language: "hcl", contents: localsFile },
      { path: "providers.tf", language: "hcl", contents: providersFile },
      { path: "versions.tf", language: "hcl", contents: versionsFile },
      { path: "terraform.tfvars.example", language: "text", contents: tfvarsExample },
      {
        path: "README.md",
        language: "markdown",
        contents: bundleReadme(provider, nodes, edges, graph, projectName),
      },
      { path: ".gitignore", language: "text", contents: TERRAFORM_GITIGNORE },
    ],
    unresolved,
    resourceCount,
  };
}

const TERRAFORM_GITIGNORE = `# Terraform state contains resource attributes and can hold secrets.
*.tfstate
*.tfstate.*
.terraform/
.terraform.lock.hcl

# Variable files with real values
*.tfvars
!*.tfvars.example

# Crash logs and plans
crash.log
*.tfplan
`;

function bundleReadme(
  provider: ProviderDefinition,
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  graph: ReturnType<typeof buildGraph>,
  projectName: string,
): string {
  const rows = graph.ordered
    .map(
      (item) =>
        `| \`${item.address}\` | ${item.service.name} | ${item.service.category} |`,
    )
    .join("\n");

  const mermaidNodes = graph.ordered
    .map((item) => `  ${sanitizeMermaidId(item.node.id)}["${item.node.values.name || item.service.name}"]`)
    .join("\n");
  const mermaidEdges = edges
    .filter((edge) => graph.byId.has(edge.from) && graph.byId.has(edge.to))
    .map((edge) => `  ${sanitizeMermaidId(edge.from)} --> ${sanitizeMermaidId(edge.to)}`)
    .join("\n");

  return `# ${projectName || "Generated infrastructure"}

Generated by [InfraCanvas](https://github.com/) for **${provider.name}** — ${nodes.length} resources, ${edges.length} connections.

## Architecture

\`\`\`mermaid
flowchart LR
${mermaidNodes || "  empty[No resources]"}
${mermaidEdges}
\`\`\`

## Resources

| Address | Service | Category |
| --- | --- | --- |
${rows || "| _none_ | | |"}

## Usage

\`\`\`bash
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform fmt -check
terraform validate
terraform plan
\`\`\`

Review the plan before \`terraform apply\`. Sensitive variables are marked
\`sensitive = true\` and should be supplied through your CI secret store or a
secrets manager rather than a committed \`.tfvars\` file.
`;
}

const sanitizeMermaidId = (value: string) => `n${value.replace(/[^A-Za-z0-9]/g, "")}`;

/** Convenience for consumers that just want one concatenated document. */
export function toSingleDocument(files: GeneratedFile[]): string {
  return files
    .filter((file) => file.language === "hcl")
    .map((file) => `# ===== ${file.path} ${"=".repeat(Math.max(0, 66 - file.path.length))}\n\n${file.contents}`)
    .join("\n");
}
