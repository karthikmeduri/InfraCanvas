import { defaultValues } from "./catalog/helpers";
import { serviceById } from "./catalog";
import type { ProviderDefinition, ProviderId } from "./types";

export type ArchitecturePlanNode = {
  serviceId: string;
  name: string;
  values: Record<string, string>;
  reason: string;
};

export type ArchitecturePlanEdge = {
  from: number;
  to: number;
  reason: string;
};

export type ArchitecturePlan = {
  title: string;
  summary: string;
  assumptions: string[];
  nodes: ArchitecturePlanNode[];
  edges: ArchitecturePlanEdge[];
  source: "ai" | "local";
};

type RawPlanNode = {
  serviceId?: unknown;
  name?: unknown;
  reason?: unknown;
  configuration?: unknown;
  values?: unknown;
};

const asText = (value: unknown, fallback = "") =>
  typeof value === "string" ? value.trim() : fallback;

/**
 * Treat model output as untrusted input. Only catalog-backed, deployable service
 * ids and known inspector fields survive normalization.
 */
export function normalizeArchitecturePlan(
  provider: ProviderDefinition,
  input: unknown,
  source: ArchitecturePlan["source"] = "ai",
): ArchitecturePlan {
  const record = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const rawNodes = Array.isArray(record.nodes) ? record.nodes.slice(0, 30) : [];
  const indexMap = new Map<number, number>();
  const nodes: ArchitecturePlanNode[] = [];

  rawNodes.forEach((entry, oldIndex) => {
    const rawNode = entry && typeof entry === "object" ? entry as RawPlanNode : {};
    const serviceId = asText(rawNode.serviceId);
    const service = serviceById(provider, serviceId);
    if (!service || service.iacSupport === "diagram") return;

    const allowed = new Set(["name", ...service.fields.map((field) => field.key)]);
    const values: Record<string, string> = {};
    if (Array.isArray(rawNode.configuration)) {
      rawNode.configuration.forEach((item) => {
        if (!item || typeof item !== "object") return;
        const pair = item as Record<string, unknown>;
        const key = asText(pair.key);
        const value = asText(pair.value);
        if (allowed.has(key) && value.length <= 500) values[key] = value;
      });
    } else if (rawNode.values && typeof rawNode.values === "object") {
      Object.entries(rawNode.values as Record<string, unknown>).forEach(([key, value]) => {
        if (allowed.has(key) && typeof value === "string" && value.length <= 500) {
          values[key] = value;
        }
      });
    }

    const nextIndex = nodes.length;
    indexMap.set(oldIndex, nextIndex);
    nodes.push({
      serviceId,
      name: asText(rawNode.name, `${service.id}-${nextIndex + 1}`).slice(0, 100),
      values,
      reason: asText(rawNode.reason, service.description).slice(0, 240),
    });
  });

  const seenEdges = new Set<string>();
  const edges: ArchitecturePlanEdge[] = [];
  if (Array.isArray(record.edges)) {
    record.edges.slice(0, 80).forEach((entry) => {
      if (!entry || typeof entry !== "object") return;
      const rawEdge = entry as Record<string, unknown>;
      const oldFrom = Number(rawEdge.from);
      const oldTo = Number(rawEdge.to);
      const from = indexMap.get(oldFrom);
      const to = indexMap.get(oldTo);
      if (from === undefined || to === undefined || from === to) return;
      const key = `${from}:${to}`;
      if (seenEdges.has(key)) return;
      seenEdges.add(key);
      edges.push({ from, to, reason: asText(rawEdge.reason, "Architecture dependency").slice(0, 180) });
    });
  }

  return {
    title: asText(record.title, `${provider.shortName} architecture draft`).slice(0, 120),
    summary: asText(record.summary, `A configurable ${provider.shortName} architecture generated from your brief.`).slice(0, 500),
    assumptions: Array.isArray(record.assumptions)
      ? record.assumptions.map((item) => asText(item)).filter(Boolean).slice(0, 8)
      : [],
    nodes,
    edges,
    source,
  };
}

type DraftBuilder = {
  add: (serviceId: string, name: string, values?: Record<string, string>, reason?: string) => number;
  connect: (from: number, to: number, reason?: string) => void;
};

/**
 * Credential-free fallback used when the hosted AI endpoint is not configured.
 * It intentionally remains deterministic and is identified as a local draft in
 * the UI instead of pretending to be a model response.
 */
export function createLocalArchitectureDraft(
  provider: ProviderDefinition,
  prompt: string,
): ArchitecturePlan {
  const query = prompt.toLowerCase();
  const nodes: ArchitecturePlanNode[] = [];
  const edges: ArchitecturePlanEdge[] = [];
  const add: DraftBuilder["add"] = (serviceId, name, values = {}, reason = "Requested architecture capability") => {
    const service = serviceById(provider, serviceId);
    if (!service || service.iacSupport === "diagram") return -1;
    nodes.push({ serviceId, name, values, reason });
    return nodes.length - 1;
  };
  const connect: DraftBuilder["connect"] = (from, to, reason = "Architecture dependency") => {
    if (from < 0 || to < 0 || from === to) return;
    if (edges.some((edge) => edge.from === from && edge.to === to)) return;
    edges.push({ from, to, reason });
  };
  const builder = { add, connect };

  if (provider.id === "aws") buildAwsDraft(builder, query);
  else if (provider.id === "azure") buildAzureDraft(builder, query);
  else if (provider.id === "gcp") buildGcpDraft(builder, query);
  else buildOciDraft(builder, query);

  return normalizeArchitecturePlan(
    provider,
    {
      title: `${provider.shortName} ${/serverless/.test(query) ? "serverless" : /kubernetes|eks|gke|aks/.test(query) ? "Kubernetes" : "production"} architecture`,
      summary: `A secure, editable ${provider.shortName} starting point based on the requested workload. Review every generated value before creating infrastructure.`,
      assumptions: [
        "Private networking is preferred for application and data tiers.",
        "Encryption, secrets management, and monitoring should be enabled.",
        "Resource sizes are starting values and must be reviewed for cost and traffic.",
      ],
      nodes: nodes.map((node) => ({
        ...node,
        configuration: Object.entries(node.values).map(([key, value]) => ({ key, value })),
      })),
      edges,
    },
    "local",
  );
}

function buildAwsDraft({ add, connect }: DraftBuilder, query: string) {
  const dns = add("route53", "public-dns", {}, "Public application DNS");
  const edge = add("cloudfront", "global-edge", {}, "Global TLS edge and caching");
  const waf = add("waf", "edge-waf", { rate_limit: "1000" }, "Web application protection");
  const vpc = add("vpc", "production-vpc", { cidr: "10.20.0.0/16" }, "Isolated production network");
  const subnet = add("subnet", "private-application", { cidr: "10.20.10.0/24", visibility: "private" }, "Private application tier");
  const security = add("security_group", "application-security", { source_cidr: "10.20.0.0/16", ingress_port: "443" }, "Restrictive application ingress");
  const loadBalancer = add("alb", "public-application-lb", { scheme: "internet-facing", port: "443", protocol: "HTTPS" }, "Highly available public entry point");
  const target = add("target_group", "application-targets", { port: "8080", health_check_path: "/health" }, "Health-checked application targets");
  const runtimeId = /kubernetes|eks/.test(query)
    ? "eks"
    : /serverless|lambda|function/.test(query)
      ? "lambda"
      : /container|ecs|microservice/.test(query)
        ? "ecs"
        : "ec2";
  const runtime = add(runtimeId, runtimeId === "eks" ? "application-eks" : runtimeId === "lambda" ? "application-api" : "application-runtime", {}, "Primary application runtime");
  const database = add(/nosql|dynamodb/.test(query) ? "dynamodb" : "rds", "application-data", {}, "Durable application data");
  const storage = add("s3", "private-artifacts", { public_access: "blocked", versioning: "Enabled" }, "Encrypted private object storage");
  const secrets = add("secrets_manager", "application-secrets", {}, "Central secret storage");
  const monitoring = add("cloudwatch_alarm", "platform-health", { threshold: "75" }, "Operational alerting");
  const queue = /queue|event|async/.test(query) ? add("sqs", "work-queue", {}, "Asynchronous workload isolation") : -1;
  const cache = /cache|redis/.test(query) ? add("elasticache", "application-cache", {}, "Low-latency cache") : -1;

  connect(dns, edge); connect(edge, waf); connect(waf, loadBalancer); connect(vpc, subnet);
  connect(subnet, security); connect(security, loadBalancer); connect(loadBalancer, target);
  connect(target, runtime); connect(runtime, database); connect(runtime, storage); connect(secrets, runtime);
  connect(runtime, monitoring); connect(runtime, queue); connect(runtime, cache);
}

function buildAzureDraft({ add, connect }: DraftBuilder, query: string) {
  const edge = add("front_door", "global-edge", {}, "Global application entry point");
  const network = add("vnet", "production-vnet", { address_space: "10.30.0.0/16" }, "Isolated production network");
  const subnet = add("subnet", "application-subnet", { prefix: "10.30.10.0/24" }, "Private application tier");
  const security = add("nsg", "application-nsg", { port: "443", source: "Internet" }, "Controlled network ingress");
  const gateway = add("app_gateway", "waf-application-gateway", { sku: "WAF_v2", backend_port: "443" }, "Regional WAF and load balancing");
  const runtimeId = /kubernetes|aks/.test(query) ? "aks" : /serverless|function/.test(query) ? "functions" : /container/.test(query) ? "container_apps" : "app_service";
  const runtime = add(runtimeId, "application-runtime", {}, "Primary application runtime");
  const database = add(/nosql|cosmos/.test(query) ? "cosmos" : "postgres", "application-data", {}, "Durable application data");
  const storage = add("storage_account", "private-artifacts", { replication: "ZRS" }, "Private application storage");
  const secrets = add("key_vault", "platform-vault", {}, "Keys and application secrets");
  const monitoring = add("log_analytics", "central-observability", { retention_days: "90" }, "Central logs and diagnostics");
  const queue = /queue|event|async/.test(query) ? add("servicebus", "application-events", {}, "Reliable asynchronous messaging") : -1;
  const cache = /cache|redis/.test(query) ? add("redis", "application-cache", {}, "Low-latency cache") : -1;

  connect(edge, gateway); connect(network, subnet); connect(subnet, security); connect(security, gateway);
  connect(gateway, runtime); connect(runtime, database); connect(runtime, storage); connect(secrets, runtime);
  connect(runtime, monitoring); connect(runtime, queue); connect(runtime, cache);
}

function buildGcpDraft({ add, connect }: DraftBuilder, query: string) {
  const dns = add("dns_record", "public-dns", { record_name: "app.example.com." }, "Public application DNS");
  const network = add("vpc", "production-vpc", { routing_mode: "GLOBAL" }, "Global private network");
  const subnet = add("subnet", "application-subnet", { cidr: "10.40.10.0/24", private_google_access: "true" }, "Private application tier");
  const firewall = add("firewall", "application-ingress", { port: "443", source: "0.0.0.0/0" }, "Controlled HTTPS ingress");
  const loadBalancer = add("load_balancer", "global-https-lb", { protocol: "HTTPS", port: "443" }, "Global load balancing");
  const runtimeId = /kubernetes|gke/.test(query) ? "gke" : /serverless|function/.test(query) ? "cloud_function" : /compute|vm/.test(query) ? "compute" : "cloud_run";
  const runtime = add(runtimeId, "application-runtime", {}, "Primary application runtime");
  const database = add(/nosql|firestore/.test(query) ? "firestore" : "cloud_sql", "application-data", {}, "Durable application data");
  const storage = add("storage", "private-artifacts", { class: "STANDARD", versioning: "true" }, "Private object storage");
  const secrets = add("secret_manager", "application-secrets", {}, "Central secret storage");
  const monitoring = add("monitoring_alert", "platform-health", {}, "Operational alerting");
  const queue = /queue|event|async/.test(query) ? add("pubsub", "application-events", {}, "Asynchronous event delivery") : -1;
  const cache = /cache|redis/.test(query) ? add("memorystore", "application-cache", {}, "Low-latency cache") : -1;

  connect(dns, loadBalancer); connect(network, subnet); connect(subnet, firewall); connect(firewall, loadBalancer);
  connect(loadBalancer, runtime); connect(runtime, database); connect(runtime, storage); connect(secrets, runtime);
  connect(runtime, monitoring); connect(runtime, queue); connect(runtime, cache);
}

function buildOciDraft({ add, connect }: DraftBuilder, query: string) {
  const network = add("vcn", "production-vcn", { cidr: "10.50.0.0/16" }, "Isolated production network");
  const gateway = add("internet_gateway", "public-internet", {}, "Public ingress");
  const subnet = add("subnet", "private-application", { cidr: "10.50.10.0/24", private: "true" }, "Private application tier");
  const security = add("nsg", "application-nsg", { port: "443", source: "0.0.0.0/0" }, "Controlled ingress");
  const loadBalancer = add("load_balancer", "public-load-balancer", { port: "443", private: "false" }, "Highly available public entry point");
  const runtimeId = /kubernetes|oke/.test(query) ? "oke" : /serverless|function/.test(query) ? "functions" : "instance";
  const runtime = add(runtimeId, "application-runtime", {}, "Primary application runtime");
  const database = add(/mysql/.test(query) ? "mysql" : "autonomous_db", "application-data", {}, "Durable application data");
  const storage = add("object_storage", "private-artifacts", { versioning: "Enabled" }, "Private object storage");
  const secrets = add("vault", "platform-vault", {}, "Keys and application secrets");
  const monitoring = add("monitoring_alarm", "platform-health", {}, "Operational alerting");
  const queue = /queue|event|async/.test(query) ? add("streaming", "application-events", {}, "Asynchronous event stream") : -1;

  connect(network, subnet); connect(gateway, loadBalancer); connect(subnet, security); connect(security, loadBalancer);
  connect(loadBalancer, runtime); connect(runtime, database); connect(runtime, storage); connect(secrets, runtime);
  connect(runtime, monitoring); connect(runtime, queue);
}

export function planNodeDefaults(
  provider: ProviderDefinition,
  node: ArchitecturePlanNode,
  sequence: number,
): Record<string, string> {
  const service = serviceById(provider, node.serviceId);
  if (!service) return { name: node.name };
  return { ...defaultValues(service, sequence), ...node.values, name: node.name };
}

export const AI_ARCHITECT_EXAMPLES: Record<ProviderId, string[]> = {
  aws: [
    "A secure highly available web application with EKS, PostgreSQL, Redis, a queue, WAF, and monitoring",
    "A serverless API using Lambda, asynchronous events, DynamoDB, private storage, and alerts",
  ],
  azure: [
    "A production AKS platform with PostgreSQL, Redis, Front Door, Key Vault, and centralized logs",
    "A serverless event processing application using Functions, Service Bus, Cosmos DB, and private storage",
  ],
  gcp: [
    "A global Cloud Run application with Cloud SQL, Memorystore, Pub/Sub, private networking, and monitoring",
    "A secure GKE microservices platform with object storage, secrets, event delivery, and alerts",
  ],
  oci: [
    "A secure OKE application with Autonomous Database, private storage, Vault, load balancing, and monitoring",
    "A private compute application using MySQL, Streaming, object storage, and operational alerts",
  ],
};
