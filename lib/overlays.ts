import { serviceById } from "./catalog";
import type {
  DiagramEdge,
  DiagramNode,
  ProviderDefinition,
  ServiceDefinition,
  ServiceRole,
} from "./types";

export type OverlaySeverity = "critical" | "high" | "medium" | "low" | "info";

export type SecurityFinding = {
  id: string;
  nodeId: string;
  serviceId: string;
  resourceName: string;
  severity: OverlaySeverity;
  title: string;
  detail: string;
  recommendation: string;
};

export type ResourceInsight = {
  nodeId: string;
  serviceId: string;
  serviceName: string;
  resourceName: string;
  role: ServiceRole;
  cost: { low: number; high: number; confidence: "modeled" | "baseline" };
  drivers: string[];
  findings: SecurityFinding[];
};

export type ArchitectureOverlay = {
  currency: "USD";
  period: "month";
  resources: ResourceInsight[];
  cost: { low: number; high: number; covered: number; unpriced: number };
  security: {
    score: number;
    counts: Record<OverlaySeverity, number>;
    findings: SecurityFinding[];
  };
  assumptions: string[];
  generatedAt?: never;
};

const CREDENTIAL_KEY = /(password|passwd|secret|token|credential|private.?key|access.?key|client.?secret)/i;
const TRUE = new Set(["true", "enabled", "on", "yes", "blocked", "immutable", "private"]);
const FALSE = new Set(["false", "disabled", "off", "no", "unblocked", "mutable", "public"]);

/** Broad planning bands, not provider prices. They intentionally avoid false precision. */
const ROLE_BANDS: Partial<Record<ServiceRole, [number, number]>> = {
  network: [0, 15], subnet: [0, 5], gateway: [25, 120], loadbalancer: [18, 180],
  targetgroup: [0, 8], cdn: [5, 180], dns: [1, 30], firewall: [12, 260],
  webfirewall: [15, 300], compute: [18, 650], container: [35, 900], serverless: [0, 180],
  registry: [1, 60], database: [20, 1200], cache: [18, 700], storage: [1, 300],
  queue: [0, 80], topic: [0, 80], secrets: [1, 60], identity: [0, 15],
  monitoring: [2, 250], analytics: [5, 800],
};

const PROVIDER_FACTOR: Record<ProviderDefinition["id"], number> = {
  aws: 1,
  azure: 1.03,
  gcp: 0.98,
  oci: 0.9,
};

const numberValue = (values: Record<string, string>, keys: string[], fallback = 1) => {
  for (const key of keys) {
    const value = Number(values[key]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return fallback;
};

const truthy = (value: string | undefined) => value ? TRUE.has(value.trim().toLowerCase()) : false;
const falsey = (value: string | undefined) => value ? FALSE.has(value.trim().toLowerCase()) : false;
const text = (value: string | undefined) => (value ?? "").trim().toLowerCase();
const safeName = (node: DiagramNode, service: ServiceDefinition) => {
  const configured = Object.entries(node.values).find(([key]) => key === "name")?.[1];
  return configured && !CREDENTIAL_KEY.test(configured) ? configured.slice(0, 80) : service.name;
};

function costFor(provider: ProviderDefinition, service: ServiceDefinition, node: DiagramNode) {
  const base = ROLE_BANDS[service.role];
  if (!base || service.iacSupport === "diagram") return null;
  const quantity = Math.min(20, numberValue(node.values, ["count", "node_count", "desired_nodes", "desired_count", "capacity"], 1));
  const sizeSignal = Object.entries(node.values)
    .filter(([key]) => /(size|memory|storage|ocpu|ecpu|capacity|tier|sku|shape)/i.test(key))
    .map(([, value]) => value)
    .join(" ");
  const sizeFactor = /(premium|large|xlarge|standard_[de][48]|[48]-|io[12]|regional|multi|ha)/i.test(sizeSignal) ? 1.45 : 1;
  const scale = Math.max(1, Math.min(6, quantity * 0.72 + 0.28));
  const factor = PROVIDER_FACTOR[provider.id] * sizeFactor * scale;
  return {
    low: Math.round(base[0] * factor),
    high: Math.round(base[1] * factor),
    confidence: Object.keys(node.values).length > 1 ? "modeled" as const : "baseline" as const,
    drivers: [
      `${service.role} planning band`,
      quantity > 1 ? `configured scale: ${quantity}` : "single-resource baseline",
      sizeFactor > 1 ? "higher-capacity configuration detected" : "standard-capacity assumption",
    ],
  };
}

function securityFor(service: ServiceDefinition, node: DiagramNode): SecurityFinding[] {
  const values = Object.fromEntries(Object.entries(node.values).filter(([key]) => !CREDENTIAL_KEY.test(key)));
  const resourceName = safeName(node, service);
  const findings: SecurityFinding[] = [];
  const add = (severity: OverlaySeverity, code: string, title: string, detail: string, recommendation: string) => {
    findings.push({ id: `${node.id}-${code}`, nodeId: node.id, serviceId: service.id, resourceName, severity, title, detail, recommendation });
  };

  const source = text(values.source_cidr || values.source || values.source_range || values.source_prefix);
  const port = Number(values.port || values.ingress_port || values.backend_port || 0);
  if (["firewall", "webfirewall"].includes(service.role) && ["*", "0.0.0.0/0", "::/0", "internet"].includes(source)) {
    const admin = port === 22 || port === 3389;
    add(admin ? "critical" : "high", "public-ingress", admin ? "Administrative port is internet-wide" : "Ingress is open to the internet", `${resourceName} accepts ${port || "configured"} traffic from ${source}.`, "Restrict the source to an approved CIDR or trusted service boundary.");
  }
  if (service.role === "loadbalancer" && text(values.protocol) === "http") {
    add("high", "plain-http", "Load balancer uses plaintext HTTP", `${resourceName} is configured with an HTTP listener.`, "Terminate TLS with HTTPS and a managed certificate.");
  }
  if (service.role === "storage") {
    if (falsey(values.public_access) || ["public", "allow", "enabled"].includes(text(values.public_access))) {
      add("critical", "public-storage", "Storage may allow public access", `${resourceName} is not configured to block public access.`, "Block public access and grant access through least-privilege identities or signed URLs.");
    }
    if (falsey(values.versioning)) add("medium", "versioning-off", "Object versioning is disabled", `${resourceName} has versioning disabled.`, "Enable versioning where recovery and auditability are required.");
  }
  const encryption = text(values.encryption || values.encryption_type || values.disk_encryption);
  if (encryption && ["none", "disabled", "false", "unencrypted"].includes(encryption)) {
    add("high", "encryption-off", "Encryption is disabled", `${resourceName} explicitly disables encryption.`, "Enable provider-managed or customer-managed encryption at rest.");
  }
  if (["database", "loadbalancer"].includes(service.role) && falsey(values.deletion_protection)) {
    add("medium", "deletion-protection", "Deletion protection is off", `${resourceName} can be deleted without an additional protection control.`, "Enable deletion protection for production resources.");
  }
  if (service.role === "database") {
    const backupDays = Number(values.backup_retention || values.retention_days || 0);
    if (backupDays > 0 && backupDays < 7) add("high", "backup-window", "Backup retention is under seven days", `${resourceName} retains backups for ${backupDays} day(s).`, "Set retention to an organization-approved recovery window.");
    if (falsey(values.multi_az) || falsey(values.high_availability) || falsey(values.zone_redundant)) add("medium", "single-zone", "High availability is disabled", `${resourceName} is configured without multi-zone resilience.`, "Enable zone-redundant or multi-availability-zone operation for production data.");
  }
  if (service.role === "container" && (falsey(values.private_cluster) || truthy(values.public_endpoint))) {
    add("high", "public-control-plane", "Cluster control plane is public", `${resourceName} exposes its API endpoint publicly.`, "Prefer a private control plane or tightly restrict authorized networks.");
  }
  if (service.role === "registry") {
    if (falsey(values.scan_on_push)) add("medium", "scan-off", "Image scanning is disabled", `${resourceName} will not scan newly pushed images.`, "Enable continuous or push-time vulnerability scanning.");
    if (text(values.mutability) === "mutable" || falsey(values.immutable)) add("low", "mutable-tags", "Image tags are mutable", `${resourceName} allows an existing tag to point to different content.`, "Use immutable tags and deploy by digest.");
  }
  if (service.role === "compute" && falsey(values.monitoring)) {
    add("low", "monitoring-off", "Detailed monitoring is disabled", `${resourceName} has reduced telemetry coverage.`, "Enable detailed monitoring for production workloads.");
  }
  return findings;
}

export function analyzeArchitecture(
  provider: ProviderDefinition,
  nodes: DiagramNode[],
  edges: DiagramEdge[] = [],
): ArchitectureOverlay {
  // Reserved for relationship-aware rules; reading the collection documents that
  // the public contract accepts the complete graph without mutating it.
  void edges;
  const resources: ResourceInsight[] = [];
  let unpriced = 0;
  for (const node of nodes) {
    const service = serviceById(provider, node.serviceId);
    if (!service) continue;
    const cost = costFor(provider, service, node);
    if (!cost) unpriced += 1;
    const findings = securityFor(service, node);
    resources.push({
      nodeId: node.id,
      serviceId: service.id,
      serviceName: service.name,
      resourceName: safeName(node, service),
      role: service.role,
      cost: cost ? { low: cost.low, high: cost.high, confidence: cost.confidence } : { low: 0, high: 0, confidence: "baseline" },
      drivers: cost?.drivers ?? [service.iacSupport === "diagram" ? "diagram-only service; no planning band" : "no planning band available"],
      findings,
    });
  }
  const findings = resources.flatMap((resource) => resource.findings);
  const counts: Record<OverlaySeverity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  findings.forEach((finding) => { counts[finding.severity] += 1; });
  const penalty = counts.critical * 24 + counts.high * 14 + counts.medium * 7 + counts.low * 3;
  return {
    currency: "USD",
    period: "month",
    resources,
    cost: {
      low: resources.reduce((sum, item) => sum + item.cost.low, 0),
      high: resources.reduce((sum, item) => sum + item.cost.high, 0),
      covered: resources.length - unpriced,
      unpriced,
    },
    security: { score: Math.max(0, 100 - penalty), counts, findings },
    assumptions: [
      "Planning ranges are broad InfraCanvas heuristics in USD per month, not quotes or live provider prices.",
      "Ranges exclude negotiated discounts, taxes, support plans, data egress, request volume, and region-specific pricing.",
      "Security findings are deterministic configuration checks, not vulnerability scans or compliance certification.",
      "Analysis stays in this browser session and never reads cloud credentials, billing accounts, or live infrastructure.",
    ],
  };
}
