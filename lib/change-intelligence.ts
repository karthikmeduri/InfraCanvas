import type { DiagramEdge, DiagramNode, DiagramState, ProviderId } from "./types";

export const ARCHITECTURE_SNAPSHOT_VERSION = 1 as const;
export const ARCHITECTURE_SNAPSHOT_FILENAME = "infracanvas.architecture.json";
export const ARCHITECTURE_REVIEW_MARKER = "<!-- infracanvas-change-intelligence -->";

const PROVIDERS = new Set<ProviderId>(["aws", "azure", "gcp", "oci"]);
const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const SENSITIVE_KEY = /(?:password|passwd|client.?secret|private.?key|access.?key|credential|auth.?token|api.?token|bearer)/i;
const SENSITIVE_VALUE = /(?:AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:token|password|secret)\s*[:=]\s*\S+)/i;
const MAX_NODES = 2_000;
const MAX_EDGES = 4_000;
const MAX_VALUE_FIELDS = 64;
const REDACTED = "[REDACTED]";

export type ArchitectureSnapshot = DiagramState & {
  schemaVersion: typeof ARCHITECTURE_SNAPSHOT_VERSION;
};

export type ArchitectureValueChange = {
  key: string;
  before?: string;
  after?: string;
};

export type ArchitectureNodeChange = {
  id: string;
  serviceId: string;
  beforeServiceId?: string;
  afterServiceId?: string;
  values: ArchitectureValueChange[];
};

export type ArchitectureEdgeChange = { from: string; to: string };

export type ArchitectureChangeReport = {
  providerId: ProviderId;
  projectName: string;
  risk: "none" | "low" | "medium" | "high" | "critical";
  summary: {
    added: number;
    removed: number;
    modified: number;
    moved: number;
    connectionsAdded: number;
    connectionsRemoved: number;
  };
  added: ArchitectureNodeChange[];
  removed: ArchitectureNodeChange[];
  modified: ArchitectureNodeChange[];
  moved: string[];
  connectionsAdded: ArchitectureEdgeChange[];
  connectionsRemoved: ArchitectureEdgeChange[];
  warnings: string[];
};

const assertRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
};

const assertString = (value: unknown, label: string, maxLength: number) => {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
    throw new Error(`${label} must be a non-empty string up to ${maxLength} characters.`);
  }
  return value;
};

const safeText = (value: string, maxLength = 500) => {
  const normalized = value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
};

const sanitizeValue = (key: string, value: string) =>
  SENSITIVE_KEY.test(key) || SENSITIVE_VALUE.test(value) ? REDACTED : safeText(value);

const sanitizeValues = (value: unknown, label: string) => {
  const record = assertRecord(value, label);
  const entries = Object.entries(record);
  if (entries.length > MAX_VALUE_FIELDS) throw new Error(`${label} has more than ${MAX_VALUE_FIELDS} fields.`);
  return Object.fromEntries(
    entries
      .map(([key, fieldValue]) => {
        if (!SAFE_ID.test(key)) throw new Error(`${label} contains an invalid field name.`);
        if (typeof fieldValue !== "string") throw new Error(`${label}.${key} must be a string.`);
        return [key, sanitizeValue(key, fieldValue)] as const;
      })
      .sort(([left], [right]) => left.localeCompare(right)),
  );
};

const normalizeNode = (value: unknown, index: number): DiagramNode => {
  const node = assertRecord(value, `nodes[${index}]`);
  const id = assertString(node.id, `nodes[${index}].id`, 128);
  const serviceId = assertString(node.serviceId, `nodes[${index}].serviceId`, 128);
  if (!SAFE_ID.test(id) || !SAFE_ID.test(serviceId)) throw new Error(`nodes[${index}] has an invalid identifier.`);
  const x = Number(node.x);
  const y = Number(node.y);
  if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 10_000_000 || Math.abs(y) > 10_000_000) {
    throw new Error(`nodes[${index}] has invalid coordinates.`);
  }
  return {
    id,
    serviceId,
    x: Math.round(x),
    y: Math.round(y),
    values: sanitizeValues(node.values ?? {}, `nodes[${index}].values`),
  };
};

const normalizeEdge = (value: unknown, index: number): DiagramEdge => {
  const edge = assertRecord(value, `edges[${index}]`);
  const id = assertString(edge.id, `edges[${index}].id`, 128);
  const from = assertString(edge.from, `edges[${index}].from`, 128);
  const to = assertString(edge.to, `edges[${index}].to`, 128);
  if (![id, from, to].every((entry) => SAFE_ID.test(entry))) throw new Error(`edges[${index}] has an invalid identifier.`);
  return { id, from, to };
};

export function createArchitectureSnapshot(state: DiagramState): ArchitectureSnapshot {
  return parseArchitectureSnapshot({ schemaVersion: ARCHITECTURE_SNAPSHOT_VERSION, ...state });
}

export function emptyArchitectureSnapshot(
  providerId: ProviderId,
  projectName = "InfraCanvas architecture",
): ArchitectureSnapshot {
  return createArchitectureSnapshot({ providerId, projectName, nodes: [], edges: [] });
}

export function parseArchitectureSnapshot(input: unknown): ArchitectureSnapshot {
  const document = assertRecord(input, "Architecture snapshot");
  if (document.schemaVersion !== ARCHITECTURE_SNAPSHOT_VERSION) {
    throw new Error(`Unsupported architecture snapshot version. Expected ${ARCHITECTURE_SNAPSHOT_VERSION}.`);
  }
  if (!PROVIDERS.has(document.providerId as ProviderId)) throw new Error("Architecture snapshot has an unsupported provider.");
  const projectName = safeText(assertString(document.projectName, "projectName", 120), 120);
  if (!Array.isArray(document.nodes) || document.nodes.length > MAX_NODES) {
    throw new Error(`Architecture snapshot must contain at most ${MAX_NODES} nodes.`);
  }
  if (!Array.isArray(document.edges) || document.edges.length > MAX_EDGES) {
    throw new Error(`Architecture snapshot must contain at most ${MAX_EDGES} edges.`);
  }
  const nodes = document.nodes.map(normalizeNode).sort((left, right) => left.id.localeCompare(right.id));
  const nodeIds = new Set<string>();
  for (const node of nodes) {
    if (nodeIds.has(node.id)) throw new Error(`Architecture snapshot contains duplicate node id ${node.id}.`);
    nodeIds.add(node.id);
  }
  const edges = document.edges.map(normalizeEdge).sort((left, right) => {
    const endpointOrder = `${left.from}\u0000${left.to}`.localeCompare(`${right.from}\u0000${right.to}`);
    return endpointOrder || left.id.localeCompare(right.id);
  });
  const edgeIds = new Set<string>();
  for (const edge of edges) {
    if (edgeIds.has(edge.id)) throw new Error(`Architecture snapshot contains duplicate edge id ${edge.id}.`);
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) throw new Error(`Connection ${edge.id} references a missing node.`);
    edgeIds.add(edge.id);
  }
  return {
    schemaVersion: ARCHITECTURE_SNAPSHOT_VERSION,
    providerId: document.providerId as ProviderId,
    projectName,
    nodes,
    edges,
  };
}

const edgeKey = (edge: Pick<DiagramEdge, "from" | "to">) => `${edge.from}\u0000${edge.to}`;

const valueChanges = (before: Record<string, string>, after: Record<string, string>) =>
  [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .sort()
    .flatMap((key) => before[key] === after[key] ? [] : [{ key, before: before[key], after: after[key] }]);

const serviceLooksSensitive = (serviceId: string) =>
  /(?:database|db|rds|sql|dynamo|firestore|cosmos|postgres|mysql|oracle)/i.test(serviceId);

export function compareArchitectureSnapshots(
  before: ArchitectureSnapshot,
  after: ArchitectureSnapshot,
): ArchitectureChangeReport {
  if (before.providerId !== after.providerId && before.nodes.length > 0 && after.nodes.length > 0) {
    throw new Error("Change Intelligence cannot compare snapshots from different cloud providers.");
  }
  const providerId = after.nodes.length > 0 ? after.providerId : before.providerId;
  const beforeNodes = new Map(before.nodes.map((node) => [node.id, node]));
  const afterNodes = new Map(after.nodes.map((node) => [node.id, node]));
  const added: ArchitectureNodeChange[] = [];
  const removed: ArchitectureNodeChange[] = [];
  const modified: ArchitectureNodeChange[] = [];
  const moved: string[] = [];

  for (const node of after.nodes) {
    const previous = beforeNodes.get(node.id);
    if (!previous) {
      added.push({ id: node.id, serviceId: node.serviceId, afterServiceId: node.serviceId, values: [] });
      continue;
    }
    const values = valueChanges(previous.values, node.values);
    if (previous.serviceId !== node.serviceId || values.length > 0) {
      modified.push({
        id: node.id,
        serviceId: node.serviceId,
        beforeServiceId: previous.serviceId,
        afterServiceId: node.serviceId,
        values,
      });
    }
    if (previous.x !== node.x || previous.y !== node.y) moved.push(node.id);
  }
  for (const node of before.nodes) {
    if (!afterNodes.has(node.id)) removed.push({ id: node.id, serviceId: node.serviceId, beforeServiceId: node.serviceId, values: [] });
  }

  const beforeEdges = new Map(before.edges.map((edge) => [edgeKey(edge), edge]));
  const afterEdges = new Map(after.edges.map((edge) => [edgeKey(edge), edge]));
  const connectionsAdded = after.edges
    .filter((edge) => !beforeEdges.has(edgeKey(edge)))
    .map(({ from, to }) => ({ from, to }));
  const connectionsRemoved = before.edges
    .filter((edge) => !afterEdges.has(edgeKey(edge)))
    .map(({ from, to }) => ({ from, to }));

  const warnings: string[] = [];
  const publicExposure = modified.some((node) =>
    node.values.some((change) => change.after?.includes("0.0.0.0/0") && !change.before?.includes("0.0.0.0/0")),
  ) || after.nodes.some((node) =>
    !beforeNodes.has(node.id) && Object.values(node.values).some((value) => value.includes("0.0.0.0/0")),
  );
  if (publicExposure) warnings.push("A resource now allows traffic from 0.0.0.0/0. Review the exposure before merging.");
  if (removed.some((node) => serviceLooksSensitive(node.serviceId))) {
    warnings.push("A data service was removed. Confirm backups, retention, and replacement behavior in the IaC plan.");
  }
  if (modified.some((node) => node.beforeServiceId !== node.afterServiceId)) {
    warnings.push("A node changed service type and may be replaced during deployment.");
  }

  let risk: ArchitectureChangeReport["risk"] = "none";
  if (moved.length > 0) risk = "low";
  if (added.length + modified.length + connectionsAdded.length + connectionsRemoved.length > 0) risk = "medium";
  if (removed.length > 0 || modified.some((node) => node.beforeServiceId !== node.afterServiceId)) risk = "high";
  if (publicExposure || removed.some((node) => serviceLooksSensitive(node.serviceId))) risk = "critical";

  return {
    providerId,
    projectName: after.nodes.length > 0 ? after.projectName : before.projectName,
    risk,
    summary: {
      added: added.length,
      removed: removed.length,
      modified: modified.length,
      moved: moved.length,
      connectionsAdded: connectionsAdded.length,
      connectionsRemoved: connectionsRemoved.length,
    },
    added,
    removed,
    modified,
    moved: moved.sort(),
    connectionsAdded,
    connectionsRemoved,
    warnings,
  };
}

const escapeMarkdown = (value: string) => value
  .replace(/@/g, "@\u200B")
  .replace(/[\\`*_{}[\]()#+|<>]/g, (character) => `\\${character}`);
const escapeCode = (value: string) => value.replace(/@/g, "@\u200B").replace(/`/g, "ˋ");
const displayValue = (value: string | undefined) => value === undefined ? "—" : `\`${escapeCode(value)}\``;

export function architectureChangeMarkdown(report: ArchitectureChangeReport): string {
  const lines = [
    ARCHITECTURE_REVIEW_MARKER,
    "## InfraCanvas Change Intelligence",
    "",
    `**${escapeMarkdown(report.projectName)}** · ${report.providerId.toUpperCase()} · **${report.risk.toUpperCase()} risk**`,
    "",
    "| Resources added | Resources removed | Modified | Layout-only | Connections + / − |",
    "| ---: | ---: | ---: | ---: | ---: |",
    `| ${report.summary.added} | ${report.summary.removed} | ${report.summary.modified} | ${report.summary.moved} | ${report.summary.connectionsAdded} / ${report.summary.connectionsRemoved} |`,
    "",
  ];
  if (report.warnings.length > 0) {
    lines.push("### Review warnings", "", ...report.warnings.map((warning) => `- ${escapeMarkdown(warning)}`), "");
  }
  if (report.added.length > 0) {
    lines.push("### Added resources", "", ...report.added.map((node) => `- \`${escapeCode(node.id)}\` — ${escapeMarkdown(node.serviceId)}`), "");
  }
  if (report.removed.length > 0) {
    lines.push("### Removed resources", "", ...report.removed.map((node) => `- \`${escapeCode(node.id)}\` — ${escapeMarkdown(node.serviceId)}`), "");
  }
  if (report.modified.length > 0) {
    lines.push("### Configuration changes", "");
    for (const node of report.modified) {
      lines.push(`- **${escapeMarkdown(node.id)}** · ${escapeMarkdown(node.beforeServiceId ?? node.serviceId)} → ${escapeMarkdown(node.afterServiceId ?? node.serviceId)}`);
      for (const change of node.values) {
        lines.push(`  - ${escapeMarkdown(change.key)}: ${displayValue(change.before)} → ${displayValue(change.after)}`);
      }
    }
    lines.push("");
  }
  if (report.connectionsAdded.length + report.connectionsRemoved.length > 0) {
    lines.push("### Connection changes", "");
    lines.push(...report.connectionsAdded.map((edge) => `- Added: \`${escapeCode(edge.from)} → ${escapeCode(edge.to)}\``));
    lines.push(...report.connectionsRemoved.map((edge) => `- Removed: \`${escapeCode(edge.from)} → ${escapeCode(edge.to)}\``));
    lines.push("");
  }
  if (report.moved.length > 0) {
    lines.push(`<details><summary>${report.moved.length} layout-only change${report.moved.length === 1 ? "" : "s"}</summary>`, "", ...report.moved.map((id) => `- \`${escapeCode(id)}\``), "", "</details>", "");
  }
  if (report.risk === "none") lines.push("No architecture changes were detected.", "");
  lines.push("_Generated from repository snapshots. Review the Terraform/OpenTofu plan or Pulumi preview before deployment._");
  return `${lines.join("\n")}\n`;
}
