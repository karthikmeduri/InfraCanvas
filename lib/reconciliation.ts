import { safeName } from "./hcl";
import { canvasTerraformResources, normalizeTerraformAddress, type TfwhyReport } from "./drift";
import type { StateLensPreview, StateLensResource } from "./state-lens";
import type { DiagramNode, GeneratedFile, ProviderDefinition } from "./types";

export type ReconciliationStatus = "aligned" | "attention" | "drift" | "untracked" | "pending";
export type ReconciliationPresence = "present" | "missing" | "changed" | "unknown" | "not-applicable";

export type ReconciliationDifference = {
  field: string;
  canvasValue: string;
  stateValue: string;
};

export type ReconciliationRow = {
  key: string;
  address: string;
  type: string;
  name: string;
  nodeId?: string;
  serviceId?: string;
  status: ReconciliationStatus;
  canvas: ReconciliationPresence;
  iac: ReconciliationPresence;
  state: ReconciliationPresence;
  live: ReconciliationPresence;
  differences: ReconciliationDifference[];
  driftCount: number;
  highestSeverity?: string;
  explanation: string;
  recommendation: string;
};

export type ReconciliationResult = {
  rows: ReconciliationRow[];
  readiness: {
    canvas: boolean;
    iac: boolean;
    state: boolean;
    live: boolean;
    providerMismatch: boolean;
  };
  summary: {
    aligned: number;
    attention: number;
    drift: number;
    untracked: number;
    pending: number;
  };
};

type IacResource = { address: string; type: string; name: string };
type StateCandidate = { resource: StateLensResource; address: string; mappedValues: Record<string, string> };

const SECRET_FIELD = /(password|passwd|secret|token|private[_-]?key|access[_-]?key|client[_-]?secret|connection[_-]?string|credentials?)/i;
const SEVERITY_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];

export function parseGeneratedIaCResources(files: Pick<GeneratedFile, "path" | "contents">[]): IacResource[] {
  const resources = new Map<string, IacResource>();
  for (const file of files) {
    if (!file.path.endsWith(".tf")) continue;
    const expression = /resource\s+"([a-zA-Z0-9_]+)"\s+"([a-zA-Z0-9_]+)"\s*\{/g;
    for (const match of file.contents.matchAll(expression)) {
      const type = match[1];
      const name = match[2];
      const address = `${type}.${name}`;
      resources.set(address, { address, type, name });
    }
  }
  return [...resources.values()].sort((a, b) => a.address.localeCompare(b.address));
}

const stateAddress = (provider: ProviderDefinition, resource: StateLensResource) => {
  if (!resource.address.startsWith("urn:pulumi:")) return normalizeTerraformAddress(resource.address);
  const service = provider.services.find((item) => item.id === resource.serviceId);
  return service ? `${service.tfType}.${safeName(resource.name || service.id)}` : resource.address;
};

const displayName = (address: string) => address.split(".").at(-1)?.replaceAll("_", " ") || address;

const comparableDifferences = (
  provider: ProviderDefinition,
  node: DiagramNode,
  stateValues: Record<string, string>,
): ReconciliationDifference[] => {
  const service = provider.services.find((item) => item.id === node.serviceId);
  if (!service) return [];
  return service.fields.flatMap((field) => {
    if (field.key === "name" || SECRET_FIELD.test(field.key)) return [];
    const canvasValue = node.values[field.key];
    const importedValue = stateValues[field.key];
    if (canvasValue === undefined || importedValue === undefined) return [];
    if (String(canvasValue).trim() === String(importedValue).trim()) return [];
    return [{ field: field.label, canvasValue: String(canvasValue), stateValue: String(importedValue) }];
  });
};

const highestSeverity = (levels: string[]) =>
  SEVERITY_ORDER.find((level) => levels.includes(level));

const summarize = (rows: ReconciliationRow[]) => ({
  aligned: rows.filter((row) => row.status === "aligned").length,
  attention: rows.filter((row) => row.status === "attention").length,
  drift: rows.filter((row) => row.status === "drift").length,
  untracked: rows.filter((row) => row.status === "untracked").length,
  pending: rows.filter((row) => row.status === "pending").length,
});

export function reconcileArchitecture(
  provider: ProviderDefinition,
  nodes: DiagramNode[],
  generatedFiles: Pick<GeneratedFile, "path" | "contents">[],
  statePreview: StateLensPreview | null,
  liveReport: TfwhyReport | null,
): ReconciliationResult {
  const iacResources = parseGeneratedIaCResources(generatedFiles);
  const iacByAddress = new Map(iacResources.map((resource) => [resource.address, resource]));
  const canvasResources = canvasTerraformResources(provider, nodes);
  const canvasById = new Map(nodes.map((node) => [node.id, node]));
  const providerMismatch = Boolean(statePreview && statePreview.providerId !== provider.id);

  const stateCandidates: StateCandidate[] = providerMismatch || !statePreview
    ? []
    : statePreview.matched.map((resource, index) => ({
        resource,
        address: stateAddress(provider, resource),
        mappedValues: statePreview.nodes[index]?.values ?? {},
      }));
  const unusedState = new Set(stateCandidates.map((candidate) => candidate.address));
  const unusedIaC = new Set(iacResources.map((resource) => resource.address));
  const findings = liveReport?.findings ?? [];
  const unusedFindings = new Set(findings.map((_, index) => index));

  const takeState = (address: string, type: string) => {
    const exact = stateCandidates.find((candidate) =>
      unusedState.has(candidate.address) && candidate.address === address,
    );
    if (exact) {
      unusedState.delete(exact.address);
      return exact;
    }
    const sameType = stateCandidates.filter((candidate) =>
      unusedState.has(candidate.address) &&
      provider.services.find((service) => service.id === candidate.resource.serviceId)?.tfType === type,
    );
    if (sameType.length === 1) {
      unusedState.delete(sameType[0].address);
      return sameType[0];
    }
    return undefined;
  };

  const takeFindings = (address: string, type: string) => {
    const exact = findings
      .map((finding, index) => ({ finding, index }))
      .filter(({ finding, index }) => unusedFindings.has(index) && normalizeTerraformAddress(finding.address) === address);
    const selected = exact.length > 0
      ? exact
      : findings
          .map((finding, index) => ({ finding, index }))
          .filter(({ finding, index }) => unusedFindings.has(index) && finding.type === type);
    if (exact.length === 0 && selected.length !== 1) return [];
    selected.forEach(({ index }) => unusedFindings.delete(index));
    return selected.map(({ finding }) => finding);
  };

  const rows: ReconciliationRow[] = canvasResources.map((canvasResource) => {
    const node = canvasById.get(canvasResource.id)!;
    const service = provider.services.find((item) => item.id === node.serviceId)!;
    const iac = iacByAddress.get(canvasResource.address);
    if (iac) unusedIaC.delete(iac.address);
    const state = takeState(canvasResource.address, canvasResource.type);
    const rowFindings = takeFindings(canvasResource.address, canvasResource.type);
    const differences = state ? comparableDifferences(provider, node, state.mappedValues) : [];
    const highest = highestSeverity(rowFindings.map((finding) => finding.severity));
    const status: ReconciliationStatus = rowFindings.length > 0
      ? "drift"
      : differences.length > 0 || (statePreview && !providerMismatch && !state)
        ? "attention"
        : statePreview && liveReport
          ? "aligned"
          : "pending";
    const explanation = rowFindings.length > 0
      ? `${rowFindings.length} TFwhy ${rowFindings.length === 1 ? "finding" : "findings"} affect the live resource.`
      : differences.length > 0
        ? `${differences.length} configured ${differences.length === 1 ? "value differs" : "values differ"} from imported state.`
        : statePreview && !providerMismatch && !state
          ? "The resource is designed and generated but was not found in the imported state."
          : statePreview && liveReport
            ? "The four available snapshots agree for this resource."
            : "Import state and a TFwhy scan to complete this comparison.";
    return {
      key: `canvas:${node.id}`,
      address: canvasResource.address,
      type: canvasResource.type,
      name: node.values.name || service.name,
      nodeId: node.id,
      serviceId: service.id,
      status,
      canvas: "present",
      iac: iac ? "present" : "missing",
      state: providerMismatch || !statePreview ? "unknown" : state ? (differences.length ? "changed" : "present") : "missing",
      live: !liveReport ? "unknown" : rowFindings.length ? "changed" : "present",
      differences,
      driftCount: rowFindings.length,
      highestSeverity: highest,
      explanation,
      recommendation: rowFindings.length > 0
        ? "Review the TFwhy evidence and choose whether IaC or the live change is intended before applying anything."
        : differences.length > 0
          ? "Review field differences and select the intended source of truth; InfraCanvas will not overwrite either side."
          : statePreview && !providerMismatch && !state
            ? "Run a plan to confirm whether this resource should be created or removed from the design."
            : "No corrective action is proposed.",
    };
  });

  nodes.filter((node) => {
    const service = provider.services.find((item) => item.id === node.serviceId);
    return service?.iacSupport === "diagram";
  }).forEach((node) => {
    const service = provider.services.find((item) => item.id === node.serviceId)!;
    rows.push({
      key: `diagram:${node.id}`,
      address: `diagram.${safeName(node.values.name || service.id)}`,
      type: "diagram-only",
      name: node.values.name || service.name,
      nodeId: node.id,
      serviceId: service.id,
      status: "pending",
      canvas: "present",
      iac: "not-applicable",
      state: "not-applicable",
      live: "not-applicable",
      differences: [],
      driftCount: 0,
      explanation: "This resource is intentionally visual-only and is not emitted as IaC.",
      recommendation: "Keep it as documentation or replace it with a deployable catalog service.",
    });
  });

  for (const address of unusedIaC) {
    const resource = iacByAddress.get(address)!;
    const state = takeState(address, resource.type);
    const rowFindings = takeFindings(address, resource.type);
    rows.push({
      key: `iac:${address}`,
      address,
      type: resource.type,
      name: displayName(address),
      status: rowFindings.length
        ? "drift"
        : !statePreview || providerMismatch
          ? "pending"
          : state
            ? "pending"
            : "attention",
      canvas: "missing",
      iac: "present",
      state: !statePreview || providerMismatch ? "unknown" : state ? "present" : "missing",
      live: !liveReport ? "unknown" : rowFindings.length ? "changed" : "present",
      differences: [],
      driftCount: rowFindings.length,
      highestSeverity: highestSeverity(rowFindings.map((finding) => finding.severity)),
      explanation: "The generator created this supporting resource, but it is not a primary canvas node.",
      recommendation: "Review the generated block before deployment; supporting resources remain controlled by IaC.",
    });
  }

  for (const candidate of stateCandidates.filter((item) => unusedState.has(item.address))) {
    const service = provider.services.find((item) => item.id === candidate.resource.serviceId);
    const type = service?.tfType ?? candidate.resource.type;
    const rowFindings = takeFindings(candidate.address, type);
    rows.push({
      key: `state:${candidate.address}`,
      address: candidate.address,
      type,
      name: candidate.resource.name,
      serviceId: candidate.resource.serviceId ?? undefined,
      status: rowFindings.length ? "drift" : "untracked",
      canvas: "missing",
      iac: iacByAddress.has(candidate.address) ? "present" : "missing",
      state: "present",
      live: !liveReport ? "unknown" : rowFindings.length ? "changed" : "present",
      differences: [],
      driftCount: rowFindings.length,
      highestSeverity: highestSeverity(rowFindings.map((finding) => finding.severity)),
      explanation: "Imported state contains this resource, but the current canvas does not.",
      recommendation: "Import it into the design or confirm that it should be removed through a reviewed IaC plan.",
    });
  }

  for (const index of unusedFindings) {
    const finding = findings[index];
    rows.push({
      key: `live:${index}:${finding.address}`,
      address: normalizeTerraformAddress(finding.address),
      type: finding.type,
      name: displayName(finding.address),
      status: "untracked",
      canvas: "missing",
      iac: iacByAddress.has(normalizeTerraformAddress(finding.address)) ? "present" : "missing",
      state: statePreview ? "missing" : "unknown",
      live: "changed",
      differences: [],
      driftCount: 1,
      highestSeverity: finding.severity,
      explanation: "TFwhy reported a live change that could not be matched to the canvas or imported state.",
      recommendation: "Inspect the Terraform address and decide whether this is unmanaged infrastructure or a renamed resource.",
    });
  }

  const ordered = rows.sort((a, b) => {
    const priority: Record<ReconciliationStatus, number> = { drift: 0, attention: 1, untracked: 2, pending: 3, aligned: 4 };
    return priority[a.status] - priority[b.status] || a.address.localeCompare(b.address);
  });

  return {
    rows: ordered,
    readiness: {
      canvas: nodes.length > 0,
      iac: iacResources.length > 0,
      state: Boolean(statePreview),
      live: Boolean(liveReport),
      providerMismatch,
    },
    summary: summarize(ordered),
  };
}
