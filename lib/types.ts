import type { HclEntry, HclValue } from "./hcl";

export type ProviderId = "aws" | "azure" | "gcp" | "oci";

/**
 * Roles describe what a service *is* on the graph, so the generator can resolve
 * "the subnet this instance is connected to" without hard-coding service ids.
 */
export type ServiceRole =
  | "network"
  | "subnet"
  | "gateway"
  | "loadbalancer"
  | "targetgroup"
  | "cdn"
  | "dns"
  | "firewall"
  | "webfirewall"
  | "compute"
  | "container"
  | "serverless"
  | "registry"
  | "database"
  | "cache"
  | "storage"
  | "queue"
  | "topic"
  | "secrets"
  | "identity"
  | "monitoring"
  | "analytics";

export type FieldType = "text" | "number" | "select" | "combo" | "toggle";

export type FieldDefinition = {
  key: string;
  label: string;
  type?: FieldType;
  options?: string[];
  placeholder?: string;
  hint?: string;
  /** Only show this field when another field has one of these values. */
  showWhen?: { key: string; equals: string[] };
};

/** A Terraform input variable the generated template needs. */
export type VariableSpec = {
  name: string;
  type: string;
  description: string;
  default?: HclValue;
  sensitive?: boolean;
  validation?: { condition: string; errorMessage: string };
};

export type OutputSpec = {
  name: string;
  value: HclValue;
  description: string;
  sensitive?: boolean;
};

/** A resolved neighbour on the diagram graph. */
export type RefTarget = {
  /** Terraform-safe local name of the matched resource. */
  name: string;
  /** Terraform resource type of the matched resource. */
  tfType: string;
  /** The matched service definition id. */
  serviceId: string;
  /** Configured values of the matched resource. */
  values: Record<string, string>;
};

/**
 * Either a plain attribute name (`"id"`) or a builder that composes the full
 * expression, for cases where the referenced address differs from the matched
 * resource's primary type (an ALB's target group, for example).
 */
export type RefAttribute = string | ((target: RefTarget) => string);

export type EmitContext = {
  provider: ProviderId;
  /** Terraform-safe local name for this resource. */
  name: string;
  /** The user-facing name typed into the inspector. */
  display: string;
  /** Configured field values. */
  v: Record<string, string>;
  /** `local.tags` / `local.labels` reference for the active provider. */
  tags: HclValue;
  /**
   * Resolve a reference to the nearest connected resource matching `roles`,
   * searching the diagram breadth-first from this node. Falls back to a
   * declared input variable so the template always validates.
   */
  ref: (
    roles: ServiceRole | ServiceRole[],
    attribute: RefAttribute,
    fallback: VariableSpec,
  ) => HclValue;
  /** Same as `ref`, but collects every reachable match into a list. */
  refList: (
    roles: ServiceRole | ServiceRole[],
    attribute: RefAttribute,
    fallback: VariableSpec,
  ) => HclValue;
  /** True when at least one directly connected node matches `roles`. */
  has: (roles: ServiceRole | ServiceRole[]) => boolean;
  /** Declare an input variable and get back a `var.<name>` reference. */
  variable: (spec: VariableSpec) => HclValue;
  /** Register an output for outputs.tf. */
  output: (spec: OutputSpec) => void;
  /** Register a data source (deduplicated across the whole template). */
  data: (key: string, entry: HclEntry) => void;
  /** True when this node has at least one edge. */
  connected: boolean;
};

export type ServiceDefinition = {
  id: string;
  name: string;
  /** Two to four character glyph fallback, used when no icon is available. */
  short: string;
  category: string;
  role: ServiceRole;
  description: string;
  accent: string;
  /** Official provider artwork served locally with the application. */
  icon?: string;
  /** Deployable services emit verified IaC; diagram services are visual-only. */
  iacSupport?: "deployable" | "diagram";
  /** Original vendor category used for browsing and filtering. */
  productFamily?: string;
  /** Primary Terraform resource type — used for cross-resource references. */
  tfType: string;
  /** Docs deep link shown in the inspector. */
  docs?: string;
  fields: FieldDefinition[];
  emit: (ctx: EmitContext) => HclEntry[];
};

export type ProviderDefinition = {
  id: ProviderId;
  name: string;
  shortName: string;
  tagline: string;
  accent: string;
  /** Terraform registry provider source. */
  source: string;
  versionConstraint: string;
  defaultRegion: string;
  services: ServiceDefinition[];
};

export type DiagramNode = {
  id: string;
  serviceId: string;
  x: number;
  y: number;
  values: Record<string, string>;
};

export type DiagramEdge = { id: string; from: string; to: string };

export type DiagramState = {
  providerId: ProviderId;
  projectName: string;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
};

export type GeneratedFile = {
  path: string;
  language:
    | "hcl"
    | "typescript"
    | "javascript"
    | "json"
    | "yaml"
    | "powershell"
    | "shell"
    | "markdown"
    | "text";
  contents: string;
};

export type Severity = "error" | "warning" | "info";

export type ValidationIssue = {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  nodeId?: string;
};
