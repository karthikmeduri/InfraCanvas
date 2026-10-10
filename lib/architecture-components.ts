import type {
  DiagramEdge,
  DiagramNode,
  FieldDefinition,
  ProviderDefinition,
  ProviderId,
} from "./types";

export const COMPONENT_PACKAGE_KIND = "infracanvas-component-package";
export const COMPONENT_LIBRARY_STORAGE_KEY = "infracanvas.component-library.v1";
export const MAX_COMPONENT_PACKAGE_BYTES = 1024 * 1024;

export type ComponentParameterType = "string" | "number" | "boolean" | "enum";

export type ComponentParameter = {
  id: string;
  label: string;
  type: ComponentParameterType;
  nodeRef: string;
  fieldKey: string;
  defaultValue: string;
  options?: string[];
};

export type ComponentNode = {
  ref: string;
  serviceId: string;
  x: number;
  y: number;
  values: Record<string, string>;
};

export type ComponentEdge = { ref: string; from: string; to: string };

export type ArchitectureComponentVersion = {
  version: string;
  createdAt: string;
  changelog: string;
  digest: string;
  nodes: ComponentNode[];
  edges: ComponentEdge[];
  parameters: ComponentParameter[];
};

export type ArchitectureComponentPackage = {
  kind: typeof COMPONENT_PACKAGE_KIND;
  schemaVersion: 1;
  id: string;
  name: string;
  description: string;
  providerId: ProviderId;
  versions: ArchitectureComponentVersion[];
};

export type ComponentParameterCandidate = {
  target: string;
  label: string;
  type: ComponentParameterType;
  nodeLabel: string;
  defaultValue: string;
  options?: string[];
};

export type ComponentLibrary = ArchitectureComponentPackage[];

const PROVIDERS = new Set<ProviderId>(["aws", "azure", "gcp", "oci"]);
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const SENSITIVE_KEY = /(?:password|passwd|private[_-]?key|access[_-]?key|secret|token|api[_-]?key|client[_-]?secret)/i;
const SECRET_VALUE = /(?:AKIA|ASIA)[A-Z0-9]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:password|passwd|secret|token|api[_-]?key|client[_-]?secret)\s*[:=]\s*[^\s,;]{6,}/i;
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

const object = (value: unknown, field: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${field} must be an object.`);
  return value as Record<string, unknown>;
};

const text = (value: unknown, field: string, max: number, allowEmpty = false) => {
  if (typeof value !== "string") throw new Error(`${field} must be text.`);
  const cleaned = value.replace(CONTROL, "").trim();
  if (!allowEmpty && !cleaned) throw new Error(`${field} cannot be empty.`);
  if (cleaned.length > max) throw new Error(`${field} exceeds ${max} characters.`);
  if (SECRET_VALUE.test(cleaned)) throw new Error(`${field} appears to contain a credential or secret.`);
  return cleaned;
};

const isoDate = (value: unknown, field: string) => {
  const candidate = text(value, field, 40);
  if (!Number.isFinite(Date.parse(candidate))) throw new Error(`${field} must be an ISO date.`);
  return candidate;
};

const boundedArray = (value: unknown, field: string, max: number) => {
  if (!Array.isArray(value)) throw new Error(`${field} must be a list.`);
  if (value.length > max) throw new Error(`${field} exceeds the ${max}-item safety limit.`);
  return value;
};

const finiteCoordinate = (value: unknown, field: string) => {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 20_000) {
    throw new Error(`${field} must be a safe coordinate.`);
  }
  return Math.round(value);
};

const fnv1a = (value: string) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `ic-component-${(hash >>> 0).toString(16).padStart(8, "0")}`;
};

const typeForField = (field: FieldDefinition): ComponentParameterType => {
  if (field.type === "number") return "number";
  if (field.type === "toggle") return "boolean";
  if (field.type === "select" || field.type === "combo") return "enum";
  return "string";
};

const safeValue = (key: string, value: unknown, max = 500): string | undefined => {
  if (SENSITIVE_KEY.test(key) || typeof value !== "string") return undefined;
  const cleaned = value.replace(CONTROL, "").trim();
  if (cleaned.length > max || SECRET_VALUE.test(cleaned)) return undefined;
  return cleaned;
};

const compareSemver = (left: string, right: string) => {
  const a = SEMVER.exec(left);
  const b = SEMVER.exec(right);
  if (!a || !b) throw new Error("Versions must use semantic versioning, for example 1.2.0.");
  for (let index = 1; index <= 3; index += 1) {
    const difference = Number(a[index]) - Number(b[index]);
    if (difference !== 0) return difference;
  }
  if (a[4] && !b[4]) return -1;
  if (!a[4] && b[4]) return 1;
  const leftPrerelease = (a[4] ?? "").split(".");
  const rightPrerelease = (b[4] ?? "").split(".");
  for (let index = 0; index < Math.max(leftPrerelease.length, rightPrerelease.length); index += 1) {
    if (leftPrerelease[index] === undefined) return -1;
    if (rightPrerelease[index] === undefined) return 1;
    const leftNumeric = /^\d+$/.test(leftPrerelease[index]);
    const rightNumeric = /^\d+$/.test(rightPrerelease[index]);
    if (leftNumeric && rightNumeric) {
      const difference = Number(leftPrerelease[index]) - Number(rightPrerelease[index]);
      if (difference !== 0) return difference;
    } else if (leftNumeric !== rightNumeric) {
      return leftNumeric ? -1 : 1;
    } else {
      const difference = leftPrerelease[index].localeCompare(rightPrerelease[index]);
      if (difference !== 0) return difference;
    }
  }
  return 0;
};

export const nextPatchVersion = (version?: string) => {
  if (!version || !SEMVER.test(version)) return "1.0.0";
  const [major, minor, patch] = version.split(".").map((part) => Number.parseInt(part, 10));
  return `${major}.${minor}.${patch + 1}`;
};

export const componentParameterCandidates = (
  provider: ProviderDefinition,
  nodes: DiagramNode[],
): ComponentParameterCandidate[] => nodes.flatMap((node, index) => {
  const service = provider.services.find((item) => item.id === node.serviceId);
  if (!service) return [];
  const nodeLabel = safeValue("name", node.values.name) || `${service.name} ${index + 1}`;
  const nameCandidate: ComponentParameterCandidate[] = node.values.name ? [{
    target: `${node.id}:name`,
    label: "Resource name",
    type: "string",
    nodeLabel,
    defaultValue: safeValue("name", node.values.name) ?? `${service.id}-${index + 1}`,
  }] : [];
  return [...nameCandidate, ...service.fields.flatMap((field) => {
    if (SENSITIVE_KEY.test(field.key)) return [];
    const value = safeValue(field.key, node.values[field.key] ?? "");
    if (value === undefined) return [];
    return [{
      target: `${node.id}:${field.key}`,
      label: field.label,
      type: typeForField(field),
      nodeLabel,
      defaultValue: value,
      ...(field.options ? { options: field.options.slice(0, 100) } : {}),
    }];
  })];
});

export const createComponentVersion = ({
  provider,
  selectedNodes,
  diagramEdges,
  version,
  changelog,
  parameterTargets,
  createdAt,
}: {
  provider: ProviderDefinition;
  selectedNodes: DiagramNode[];
  diagramEdges: DiagramEdge[];
  version: string;
  changelog: string;
  parameterTargets: ReadonlySet<string>;
  createdAt: string;
}): ArchitectureComponentVersion => {
  if (!SEMVER.test(version)) throw new Error("Version must use semantic versioning, for example 1.0.0.");
  if (selectedNodes.length === 0) throw new Error("Select at least one canvas resource.");
  if (selectedNodes.length > 80) throw new Error("A component version can contain at most 80 resources.");

  const minX = Math.min(...selectedNodes.map((node) => node.x));
  const minY = Math.min(...selectedNodes.map((node) => node.y));
  const selectedIds = new Set(selectedNodes.map((node) => node.id));
  const refById = new Map(selectedNodes.map((node, index) => [node.id, `node-${index + 1}`]));

  const nodes: ComponentNode[] = selectedNodes.map((node, index) => {
    const service = provider.services.find((item) => item.id === node.serviceId);
    if (!service) throw new Error(`Selected resource ${node.serviceId} is not in the ${provider.shortName} catalog.`);
    const knownFields = new Set(["name", ...service.fields.map((field) => field.key)]);
    const values = Object.fromEntries(Object.entries(node.values).flatMap(([key, value]) => {
      const safe = knownFields.has(key) ? safeValue(key, value) : undefined;
      return safe === undefined ? [] : [[key, safe]];
    }));
    return { ref: `node-${index + 1}`, serviceId: node.serviceId, x: Math.round(node.x - minX), y: Math.round(node.y - minY), values };
  });

  const edges = diagramEdges
    .filter((edge) => selectedIds.has(edge.from) && selectedIds.has(edge.to))
    .slice(0, 160)
    .map((edge, index) => ({ ref: `edge-${index + 1}`, from: refById.get(edge.from)!, to: refById.get(edge.to)! }));

  const candidates = componentParameterCandidates(provider, selectedNodes);
  const parameters = candidates.flatMap((candidate, index): ComponentParameter[] => {
    if (!parameterTargets.has(candidate.target)) return [];
    const [nodeId, fieldKey] = candidate.target.split(":");
    const nodeRef = refById.get(nodeId);
    if (!nodeRef) return [];
    const idBase = `${nodes.find((node) => node.ref === nodeRef)?.serviceId ?? "resource"}-${fieldKey}`
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
    return [{
      id: `${idBase || "input"}-${index + 1}`,
      label: `${candidate.nodeLabel} · ${candidate.label}`,
      type: candidate.type,
      nodeRef,
      fieldKey,
      defaultValue: candidate.defaultValue,
      ...(candidate.options ? { options: candidate.options } : {}),
    }];
  });

  const normalizedCreatedAt = isoDate(createdAt, "Created at");
  const normalizedChangelog = text(changelog, "Changelog", 500, true);
  const payload = { version, createdAt: normalizedCreatedAt, changelog: normalizedChangelog, nodes, edges, parameters };
  return {
    version,
    createdAt: normalizedCreatedAt,
    changelog: normalizedChangelog,
    digest: fnv1a(JSON.stringify(payload)),
    nodes,
    edges,
    parameters,
  };
};

export const upsertComponentPackage = (
  library: ComponentLibrary,
  metadata: { id: string; name: string; description: string; providerId: ProviderId },
  version: ArchitectureComponentVersion,
): ComponentLibrary => {
  if (library.length >= 50 && !library.some((item) => item.id === metadata.id)) {
    throw new Error("The local component library is limited to 50 components.");
  }
  const existing = library.find((item) => item.id === metadata.id);
  if (!existing) {
    return [...library, {
      kind: COMPONENT_PACKAGE_KIND,
      schemaVersion: 1,
      id: text(metadata.id, "Component id", 80),
      name: text(metadata.name, "Component name", 80),
      description: text(metadata.description, "Description", 300, true),
      providerId: metadata.providerId,
      versions: [version],
    }];
  }
  if (existing.providerId !== metadata.providerId) throw new Error("A component cannot change cloud provider between versions.");
  if (existing.versions.some((item) => item.version === version.version)) throw new Error(`Version ${version.version} already exists and is immutable.`);
  const latest = [...existing.versions].sort((a, b) => compareSemver(b.version, a.version))[0];
  if (latest && compareSemver(version.version, latest.version) <= 0) {
    throw new Error(`New version must be greater than ${latest.version}.`);
  }
  return library.map((item) => item.id === existing.id ? {
    ...item,
    name: text(metadata.name, "Component name", 80),
    description: text(metadata.description, "Description", 300, true),
    versions: [...item.versions, version],
  } : item);
};

export const instantiateComponentVersion = (
  component: ArchitectureComponentPackage,
  version: ArchitectureComponentVersion,
  overrides: Record<string, string>,
  origin: { x: number; y: number },
  idPrefix: string,
): { nodes: DiagramNode[]; edges: DiagramEdge[] } => {
  const nodeIdByRef = new Map(version.nodes.map((node, index) => [node.ref, `${idPrefix}-node-${index + 1}`]));
  const parameterByTarget = new Map(version.parameters.map((parameter) => [`${parameter.nodeRef}:${parameter.fieldKey}`, parameter]));
  const nodes = version.nodes.map((node) => {
    const values = { ...node.values };
    for (const [target, parameter] of parameterByTarget) {
      if (!target.startsWith(`${node.ref}:`)) continue;
      const candidate = overrides[parameter.id] ?? parameter.defaultValue;
      const safe = safeValue(parameter.fieldKey, candidate);
      if (safe === undefined) throw new Error(`${parameter.label} contains an unsafe value.`);
      if (parameter.type === "number" && !Number.isFinite(Number(safe))) throw new Error(`${parameter.label} must be a number.`);
      if (parameter.type === "boolean" && !["true", "false"].includes(safe)) throw new Error(`${parameter.label} must be true or false.`);
      if (parameter.type === "enum" && parameter.options && !parameter.options.includes(safe)) throw new Error(`${parameter.label} must use an allowed option.`);
      values[parameter.fieldKey] = safe;
    }
    return { id: nodeIdByRef.get(node.ref)!, serviceId: node.serviceId, x: origin.x + node.x, y: origin.y + node.y, values };
  });
  const edges = version.edges.map((edge, index) => ({
    id: `${idPrefix}-edge-${index + 1}`,
    from: nodeIdByRef.get(edge.from)!,
    to: nodeIdByRef.get(edge.to)!,
  }));
  return { nodes, edges };
};

const parseVersion = (value: unknown, provider: ProviderDefinition, index: number): ArchitectureComponentVersion => {
  const input = object(value, `Version ${index + 1}`);
  const version = text(input.version, `Version ${index + 1} number`, 40);
  if (!SEMVER.test(version)) throw new Error(`Version ${version} is not valid semantic versioning.`);
  const nodeRefs = new Set<string>();
  const nodes = boundedArray(input.nodes, `Version ${version} resources`, 80).map((item, nodeIndex): ComponentNode => {
    const node = object(item, `Version ${version} resource ${nodeIndex + 1}`);
    const ref = text(node.ref, `Resource ${nodeIndex + 1} ref`, 80);
    if (nodeRefs.has(ref)) throw new Error(`Version ${version} contains duplicate resource refs.`);
    nodeRefs.add(ref);
    const serviceId = text(node.serviceId, `Resource ${nodeIndex + 1} service`, 120);
    const service = provider.services.find((candidate) => candidate.id === serviceId);
    if (!service) throw new Error(`${serviceId} is not an allowed ${provider.shortName} service.`);
    const knownFields = new Set(["name", ...service.fields.map((field) => field.key)]);
    const rawValues = object(node.values, `Resource ${nodeIndex + 1} values`);
    const values = Object.fromEntries(Object.entries(rawValues).flatMap(([key, raw]) => {
      const safe = knownFields.has(key) ? safeValue(key, raw) : undefined;
      return safe === undefined ? [] : [[key, safe]];
    }));
    return { ref, serviceId, x: finiteCoordinate(node.x, "Resource x"), y: finiteCoordinate(node.y, "Resource y"), values };
  });
  if (nodes.length === 0) throw new Error(`Version ${version} must contain at least one resource.`);

  const edgeKeys = new Set<string>();
  const edges = boundedArray(input.edges, `Version ${version} connections`, 160).map((item, edgeIndex): ComponentEdge => {
    const edge = object(item, `Version ${version} connection ${edgeIndex + 1}`);
    const from = text(edge.from, "Connection source", 80);
    const to = text(edge.to, "Connection target", 80);
    if (!nodeRefs.has(from) || !nodeRefs.has(to) || from === to) throw new Error(`Version ${version} contains an invalid connection.`);
    const key = `${from}->${to}`;
    if (edgeKeys.has(key)) throw new Error(`Version ${version} contains a duplicate connection.`);
    edgeKeys.add(key);
    return { ref: text(edge.ref, "Connection ref", 80), from, to };
  });

  const parameterIds = new Set<string>();
  const parameters = boundedArray(input.parameters, `Version ${version} parameters`, 64).map((item, parameterIndex): ComponentParameter => {
    const parameter = object(item, `Version ${version} parameter ${parameterIndex + 1}`);
    const id = text(parameter.id, "Parameter id", 80);
    if (parameterIds.has(id)) throw new Error(`Version ${version} contains duplicate parameter ids.`);
    parameterIds.add(id);
    const nodeRef = text(parameter.nodeRef, "Parameter resource ref", 80);
    const node = nodes.find((candidate) => candidate.ref === nodeRef);
    if (!node) throw new Error(`Version ${version} contains a parameter for an unknown resource.`);
    const service = provider.services.find((candidate) => candidate.id === node.serviceId)!;
    const fieldKey = text(parameter.fieldKey, "Parameter field", 120);
    const field = service.fields.find((candidate) => candidate.key === fieldKey);
    if ((!field && fieldKey !== "name") || SENSITIVE_KEY.test(fieldKey)) throw new Error(`Version ${version} contains an unsafe parameter field.`);
    const expectedType = field ? typeForField(field) : "string";
    if (parameter.type !== expectedType) throw new Error(`Version ${version} parameter type does not match the catalog.`);
    const defaultValue = safeValue(fieldKey, parameter.defaultValue);
    if (defaultValue === undefined) throw new Error(`Version ${version} contains an unsafe parameter default.`);
    const options = field?.options?.slice(0, 100);
    if (expectedType === "enum" && options && !options.includes(defaultValue)) throw new Error(`Version ${version} contains an invalid enum default.`);
    return { id, label: text(parameter.label, "Parameter label", 140), type: expectedType, nodeRef, fieldKey, defaultValue, ...(options ? { options } : {}) };
  });

  const createdAt = isoDate(input.createdAt, "Version date");
  const changelog = text(input.changelog, "Changelog", 500, true);
  const normalized = { version, createdAt, changelog, nodes, edges, parameters };
  const digest = fnv1a(JSON.stringify(normalized));
  if (input.digest !== digest) throw new Error(`Version ${version} failed its integrity check.`);
  return { version, createdAt, changelog, digest, nodes, edges, parameters };
};

export const parseComponentPackage = (
  raw: string,
  providerFor: (id: ProviderId) => ProviderDefinition,
): ArchitectureComponentPackage => {
  if (new TextEncoder().encode(raw).byteLength > MAX_COMPONENT_PACKAGE_BYTES) throw new Error("Component package exceeds the 1 MB safety limit.");
  if (SECRET_VALUE.test(raw)) throw new Error("Component package appears to contain a credential or secret.");
  let input: Record<string, unknown>;
  try { input = object(JSON.parse(raw), "Component package"); } catch (error) {
    if (error instanceof SyntaxError) throw new Error("Component package is not valid JSON.");
    throw error;
  }
  if (input.kind !== COMPONENT_PACKAGE_KIND || input.schemaVersion !== 1) throw new Error("This is not a supported InfraCanvas component package.");
  if (!PROVIDERS.has(input.providerId as ProviderId)) throw new Error("Component package has an unsupported provider.");
  const providerId = input.providerId as ProviderId;
  const provider = providerFor(providerId);
  const versions = boundedArray(input.versions, "Component versions", 50).map((version, index) => parseVersion(version, provider, index));
  if (versions.length === 0) throw new Error("Component package must contain at least one version.");
  const seen = new Set<string>();
  versions.forEach((version) => {
    if (seen.has(version.version)) throw new Error("Component package contains duplicate versions.");
    seen.add(version.version);
  });
  return {
    kind: COMPONENT_PACKAGE_KIND,
    schemaVersion: 1,
    id: text(input.id, "Component id", 80),
    name: text(input.name, "Component name", 80),
    description: text(input.description, "Description", 300, true),
    providerId,
    versions: versions.sort((a, b) => compareSemver(a.version, b.version)),
  };
};

export const mergeImportedComponent = (library: ComponentLibrary, imported: ArchitectureComponentPackage) => {
  const existing = library.find((item) => item.id === imported.id);
  if (!existing) {
    if (library.length >= 50) throw new Error("The local component library is limited to 50 components.");
    return [...library, imported];
  }
  if (existing.providerId !== imported.providerId) throw new Error("Imported component id conflicts with another cloud provider.");
  const byVersion = new Map(existing.versions.map((version) => [version.version, version]));
  for (const version of imported.versions) {
    const current = byVersion.get(version.version);
    if (current && current.digest !== version.digest) throw new Error(`Version ${version.version} conflicts with an immutable local version.`);
    byVersion.set(version.version, version);
  }
  return library.map((item) => item.id === imported.id ? {
    ...imported,
    versions: [...byVersion.values()].sort((a, b) => compareSemver(a.version, b.version)),
  } : item);
};

export const parseComponentLibrary = (raw: string, providerFor: (id: ProviderId) => ProviderDefinition): ComponentLibrary => {
  const input = boundedArray(JSON.parse(raw), "Component library", 50);
  return input.map((item) => parseComponentPackage(JSON.stringify(item), providerFor));
};

export const latestComponentVersion = (component: ArchitectureComponentPackage) =>
  [...component.versions].sort((a, b) => compareSemver(b.version, a.version))[0];

export const componentPackageJson = (component: ArchitectureComponentPackage) => `${JSON.stringify(component, null, 2)}\n`;
