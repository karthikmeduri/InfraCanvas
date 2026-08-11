import type { DiagramNode, ProviderDefinition } from "./types";
import { safeName } from "./hcl";

export const DRIFT_SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] as const;

export type DriftSeverity = (typeof DRIFT_SEVERITIES)[number];

export type TfwhyFinding = {
  severity: DriftSeverity;
  address: string;
  type: string;
  action: string;
  title: string;
  detail?: string;
  replacePaths?: string[];
  stateful: boolean;
};

export type TfwhyReport = {
  counts: Record<string, number>;
  errored: boolean;
  warnings: string[];
  findings: TfwhyFinding[];
};

export type DriftMatch = {
  finding: TfwhyFinding;
  nodeId?: string;
  expectedAddress?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requiredString = (value: unknown, field: string, index: number) => {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Finding ${index + 1} has an invalid ${field}.`);
  }
  return value.trim();
};

/** Parse the stable JSON emitted by `tfwhy drift --json`. */
export function parseTfwhyReport(source: string): TfwhyReport {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error("This is not valid JSON. Import the file produced by tfwhy drift --json.");
  }
  if (!isRecord(value) || !Array.isArray(value.findings)) {
    throw new Error("This is not a TFwhy report: the findings array is missing.");
  }
  if (value.findings.length > 5000) {
    throw new Error("This report contains more than 5,000 findings. Split it before importing.");
  }

  const findings = value.findings.map((entry, index): TfwhyFinding => {
    if (!isRecord(entry)) throw new Error(`Finding ${index + 1} is not an object.`);
    const severity = requiredString(entry.severity, "severity", index).toUpperCase();
    if (!DRIFT_SEVERITIES.includes(severity as DriftSeverity)) {
      throw new Error(`Finding ${index + 1} has unsupported severity ${severity}.`);
    }
    const replacePaths = Array.isArray(entry.replace_paths)
      ? entry.replace_paths.filter((item): item is string => typeof item === "string")
      : undefined;
    return {
      severity: severity as DriftSeverity,
      address: requiredString(entry.address, "address", index),
      type: requiredString(entry.type, "type", index),
      action: requiredString(entry.action, "action", index),
      title: requiredString(entry.title, "title", index),
      detail: typeof entry.detail === "string" ? entry.detail : undefined,
      replacePaths,
      stateful: entry.stateful === true,
    };
  });

  const counts: Record<string, number> = {};
  if (isRecord(value.counts)) {
    Object.entries(value.counts).forEach(([key, count]) => {
      if (typeof count === "number" && Number.isFinite(count) && count >= 0) counts[key] = count;
    });
  }

  return {
    counts,
    errored: value.errored === true,
    warnings: Array.isArray(value.warnings)
      ? value.warnings.filter((item): item is string => typeof item === "string")
      : [],
    findings,
  };
}

/** Remove module prefixes and instance keys so addresses match canvas resources. */
export function normalizeTerraformAddress(address: string) {
  return address
    .trim()
    .replace(/^(?:module\.[^.]+\.)+/, "")
    .replace(/\[(?:\d+|"[^"]+")\]$/g, "");
}

export function canvasTerraformResources(provider: ProviderDefinition, nodes: DiagramNode[]) {
  return nodes.flatMap((node) => {
    const service = provider.services.find((item) => item.id === node.serviceId);
    if (!service) return [];
    return [{
      id: node.id,
      type: service.tfType,
      address: `${service.tfType}.${safeName(node.values.name || service.id)}`,
    }];
  });
}

export function matchDriftFindings(
  report: TfwhyReport,
  resources: Array<{ id: string; type: string; address: string }>,
): DriftMatch[] {
  const normalized = resources.map((resource) => ({
    ...resource,
    normalizedAddress: normalizeTerraformAddress(resource.address),
  }));
  return report.findings.map((finding) => {
    const findingAddress = normalizeTerraformAddress(finding.address);
    const exact = normalized.find((resource) => resource.normalizedAddress === findingAddress);
    if (exact) return { finding, nodeId: exact.id, expectedAddress: exact.address };

    // A type-only match is safe only when there is exactly one such resource.
    // This helps reports created before a user renames a single canvas node.
    const sameType = normalized.filter((resource) => resource.type === finding.type);
    if (sameType.length === 1) {
      return { finding, nodeId: sameType[0].id, expectedAddress: sameType[0].address };
    }
    return { finding };
  });
}

export function highestDriftSeverity(findings: TfwhyFinding[]): DriftSeverity | undefined {
  return DRIFT_SEVERITIES.find((severity) => findings.some((finding) => finding.severity === severity));
}
