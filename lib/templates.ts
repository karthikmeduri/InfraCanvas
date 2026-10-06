import { SAMPLE_ARCHITECTURES, SAMPLE_EDGES, providerById, serviceById } from "./catalog";
import { defaultValues } from "./catalog/helpers";
import type { DiagramState, ProviderId } from "./types";

export type ProductionTemplate = {
  id: string;
  providerId: ProviderId;
  name: string;
  summary: string;
  workload: string;
  availability: string;
  tags: string[];
  featuredServices: string[];
};

export const PRODUCTION_TEMPLATES: ProductionTemplate[] = [
  {
    id: "aws-secure-web-platform",
    providerId: "aws",
    name: "Secure AWS web platform",
    summary: "A multi-tier public application with private compute and data planes, managed edge protection, queues, observability, and encrypted storage.",
    workload: "Web + containers + events",
    availability: "Multi-AZ",
    tags: ["Zero-trust network", "EKS", "RDS", "Event-driven"],
    featuredServices: ["cloudfront", "alb", "eks", "rds", "s3", "cloudwatch_alarm"],
  },
  {
    id: "azure-enterprise-application",
    providerId: "azure",
    name: "Azure enterprise application",
    summary: "A zone-aware application foundation with Front Door, WAF, private application and data tiers, AKS, managed databases, and central logs.",
    workload: "Enterprise web + data",
    availability: "Zone redundant",
    tags: ["WAF", "AKS", "PostgreSQL", "Private data"],
    featuredServices: ["front_door", "app_gateway", "aks", "postgres", "key_vault", "log_analytics"],
  },
  {
    id: "gcp-data-application-platform",
    providerId: "gcp",
    name: "GCP data application platform",
    summary: "A global application path backed by private GKE and Cloud Run workloads, regional data services, event streaming, analytics, and monitoring.",
    workload: "Cloud-native + analytics",
    availability: "Regional HA",
    tags: ["GKE", "Cloud Run", "BigQuery", "Pub/Sub"],
    featuredServices: ["load_balancer", "gke", "cloud_run", "cloud_sql", "bigquery", "monitoring_alert"],
  },
  {
    id: "oci-resilient-cloud-foundation",
    providerId: "oci",
    name: "OCI resilient cloud foundation",
    summary: "A segmented OCI landing architecture with private OKE and compute, autonomous and MySQL data services, Vault, Streaming, and alarms.",
    workload: "Containers + Oracle data",
    availability: "Fault-domain ready",
    tags: ["OKE", "Autonomous DB", "Vault", "Streaming"],
    featuredServices: ["load_balancer", "oke", "autonomous_db", "object_storage", "vault", "monitoring_alarm"],
  },
];

export function productionTemplateById(id: string) {
  return PRODUCTION_TEMPLATES.find((template) => template.id === id);
}

export function instantiateProductionTemplate(
  id: string,
  makeId?: (prefix: string) => string,
): DiagramState {
  const template = productionTemplateById(id);
  if (!template) throw new Error("Unknown production template.");
  let fallbackCounter = 0;
  const createId = makeId ?? ((prefix: string) => `${prefix}-template-${++fallbackCounter}`);
  const provider = providerById(template.providerId);
  const nodes = SAMPLE_ARCHITECTURES[template.providerId].flatMap((entry, index) => {
    const service = serviceById(provider, entry.serviceId);
    if (!service) return [];
    return [{
      id: createId(entry.serviceId),
      serviceId: entry.serviceId,
      x: entry.x,
      y: entry.y,
      values: { ...defaultValues(service, index + 1), ...entry.values },
    }];
  });
  const edges = SAMPLE_EDGES[template.providerId].flatMap(([from, to]) => {
    const source = nodes[from];
    const target = nodes[to];
    return source && target ? [{ id: createId("edge"), from: source.id, to: target.id }] : [];
  });
  return { providerId: template.providerId, projectName: template.name, nodes, edges };
}
