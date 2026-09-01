import { providerById, providers } from "./catalog";
import { defaultValues } from "./catalog/helpers";
import type { DiagramEdge, DiagramNode, ProviderId, ServiceDefinition } from "./types";

export type StateLensSource = "terraform-state" | "terraform-json" | "pulumi-stack";

export type StateLensResource = {
  address: string;
  type: string;
  name: string;
  providerId: ProviderId | null;
  serviceId: string | null;
  values: Record<string, unknown>;
  sensitiveValues?: unknown;
  dependencies: string[];
};

export type StateLensPreview = {
  source: StateLensSource;
  sourceLabel: string;
  providerId: ProviderId;
  resources: StateLensResource[];
  matched: StateLensResource[];
  unsupported: StateLensResource[];
  foreignProviderResources: StateLensResource[];
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  warnings: string[];
};

const SECRET_KEY = /(password|passwd|secret|token|private[_-]?key|access[_-]?key|client[_-]?secret|connection[_-]?string|credentials?)/i;
const TERRAFORM_PROVIDER_PREFIX: Record<string, ProviderId> = {
  aws: "aws",
  azurerm: "azure",
  google: "gcp",
  google_beta: "gcp",
  oci: "oci",
};

const PULUMI_PROVIDER_PREFIX: Record<string, ProviderId> = {
  aws: "aws",
  "aws-native": "aws",
  azure: "azure",
  "azure-native": "azure",
  gcp: "gcp",
  google: "gcp",
  oci: "oci",
};

const PULUMI_SERVICE_ALIASES: Record<ProviderId, Record<string, string>> = {
  aws: {
    "ec2/vpc": "vpc", vpc: "vpc",
    "ec2/subnet": "subnet", subnet: "subnet",
    "ec2/internetgateway": "internet_gateway", internetgateway: "internet_gateway",
    "ec2/natgateway": "nat_gateway", natgateway: "nat_gateway",
    "lb/loadbalancer": "alb", "elasticloadbalancingv2/loadbalancer": "alb", loadbalancer: "alb",
    "lb/targetgroup": "target_group", "elasticloadbalancingv2/targetgroup": "target_group", targetgroup: "target_group",
    "cloudfront/distribution": "cloudfront", distribution: "cloudfront",
    "route53/record": "route53", record: "route53",
    "apigatewayv2/api": "api_gateway", api: "api_gateway",
    "ec2/instance": "ec2", instance: "ec2",
    "autoscaling/group": "asg", group: "asg",
    "lambda/function": "lambda", function: "lambda",
    "ecs/cluster": "ecs", cluster: "ecs",
    "eks/cluster": "eks",
    "ecr/repository": "ecr", repository: "ecr",
    "rds/instance": "rds",
    "dynamodb/table": "dynamodb", table: "dynamodb",
    "elasticache/replicationgroup": "elasticache", replicationgroup: "elasticache",
    "s3/bucket": "s3", bucket: "s3",
    "efs/filesystem": "efs", filesystem: "efs",
    "ec2/securitygroup": "security_group", securitygroup: "security_group",
    "wafv2/webacl": "waf", webacl: "waf",
    "kms/key": "kms", key: "kms",
    "secretsmanager/secret": "secrets_manager", secret: "secrets_manager",
    "iam/role": "iam_role", role: "iam_role",
    "sqs/queue": "sqs", queue: "sqs",
    "sns/topic": "sns", topic: "sns",
    "cloudwatch/metricalarm": "cloudwatch_alarm", metricalarm: "cloudwatch_alarm",
  },
  azure: {
    "network/virtualnetwork": "vnet", virtualnetwork: "vnet",
    "network/subnet": "subnet", subnet: "subnet",
    "network/publicipaddress": "public_ip", publicipaddress: "public_ip",
    "network/applicationgateway": "app_gateway", applicationgateway: "app_gateway",
    "cdn/profile": "front_door", "cdn/frontdoorprofile": "front_door", frontdoorprofile: "front_door",
    "compute/virtualmachine": "vm", virtualmachine: "vm",
    "web/webapp": "app_service", webapp: "app_service",
    "web/functionapp": "functions", functionapp: "functions",
    "containerservice/managedcluster": "aks", managedcluster: "aks",
    "containerregistry/registry": "acr", registry: "acr",
    "dbforpostgresql/flexibleserver": "postgres", flexibleserver: "postgres",
    "sql/server": "sql", server: "sql",
    "documentdb/databaseaccount": "cosmos", databaseaccount: "cosmos",
    "cache/redis": "redis", redis: "redis",
    "storage/storageaccount": "storage_account", storageaccount: "storage_account",
    "network/networksecuritygroup": "nsg", networksecuritygroup: "nsg",
    "keyvault/vault": "key_vault", vault: "key_vault",
    "servicebus/namespace": "servicebus", namespace: "servicebus",
    "operationalinsights/workspace": "log_analytics", workspace: "log_analytics",
  },
  gcp: {
    "compute/network": "vpc", network: "vpc",
    "compute/subnetwork": "subnet", subnetwork: "subnet",
    "compute/routernat": "cloud_nat", routernat: "cloud_nat",
    "compute/globalforwardingrule": "load_balancer", globalforwardingrule: "load_balancer",
    "dns/recordset": "dns_record", recordset: "dns_record",
    "compute/instance": "compute", instance: "compute",
    "cloudrun/service": "cloud_run", "cloudrunv2/service": "cloud_run", service: "cloud_run",
    "cloudfunctions/function": "cloud_function", function: "cloud_function",
    "container/cluster": "gke", cluster: "gke",
    "artifactregistry/repository": "artifact_registry", repository: "artifact_registry",
    "sql/databaseinstance": "cloud_sql", databaseinstance: "cloud_sql",
    "firestore/database": "firestore", database: "firestore",
    "redis/instance": "memorystore",
    "bigquery/dataset": "bigquery", dataset: "bigquery",
    "storage/bucket": "storage", bucket: "storage",
    "compute/firewall": "firewall", firewall: "firewall",
    "secretmanager/secret": "secret_manager", secret: "secret_manager",
    "serviceaccount/account": "service_account", account: "service_account",
    "pubsub/topic": "pubsub", topic: "pubsub",
    "monitoring/alertpolicy": "monitoring_alert", alertpolicy: "monitoring_alert",
  },
  oci: {
    "core/vcn": "vcn", vcn: "vcn",
    "core/subnet": "subnet", subnet: "subnet",
    "core/internetgateway": "internet_gateway", internetgateway: "internet_gateway",
    "core/natgateway": "nat_gateway", natgateway: "nat_gateway",
    "loadbalancer/loadbalancer": "load_balancer", loadbalancer: "load_balancer",
    "core/instance": "instance", instance: "instance",
    "functions/application": "functions", application: "functions",
    "containerengine/cluster": "oke", cluster: "oke",
    "artifacts/containerrepository": "container_registry", containerrepository: "container_registry",
    "database/autonomousdatabase": "autonomous_db", autonomousdatabase: "autonomous_db",
    "mysql/mysqldbsystem": "mysql", mysqldbsystem: "mysql",
    "objectstorage/bucket": "object_storage", bucket: "object_storage",
    "filestorage/filesystem": "file_storage", filesystem: "file_storage",
    "core/securitylist": "security_list", securitylist: "security_list",
    "core/networksecuritygroup": "nsg", networksecuritygroup: "nsg",
    "kms/vault": "vault", vault: "vault",
    "streaming/stream": "streaming", stream: "streaming",
    "monitoring/alarm": "monitoring_alarm", alarm: "monitoring_alarm",
  },
};

const FIELD_ALIASES: Record<string, string[]> = {
  name: ["display_name", "resource_name", "bucket", "bucket_name"],
  cidr: ["cidr_block", "address_prefix", "ip_cidr_range"],
  address_space: ["address_space", "address_spaces"],
  prefix: ["address_prefix", "address_prefixes"],
  instance_type: ["instance_type"],
  machine_type: ["machine_type"],
  size: ["size", "vm_size"],
  shape: ["shape", "shape_name"],
  port: ["port", "destination_port", "backend_port", "load_balancing_rules.frontend_port"],
  protocol: ["protocol"],
  engine: ["engine", "database_version"],
  version: ["version", "kubernetes_version", "engine_version"],
  storage: ["storage", "allocated_storage", "data_storage_size_in_gb"],
  disk_size: ["disk_size", "boot_disk.initialize_params.size"],
  node_count: ["node_count", "initial_node_count", "default_node_pool.node_count"],
  count: ["count", "instance_count", "capacity"],
  region: ["region", "location"],
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const providerFromTerraform = (type: string, providerName = ""): ProviderId | null => {
  const typePrefix = type.split("_")[0];
  if (TERRAFORM_PROVIDER_PREFIX[typePrefix]) return TERRAFORM_PROVIDER_PREFIX[typePrefix];
  const normalized = providerName.toLowerCase();
  if (normalized.includes("hashicorp/aws")) return "aws";
  if (normalized.includes("hashicorp/azurerm")) return "azure";
  if (normalized.includes("hashicorp/google")) return "gcp";
  if (normalized.includes("oracle/oci")) return "oci";
  return null;
};

const providerFromPulumi = (type: string): ProviderId | null =>
  PULUMI_PROVIDER_PREFIX[type.split(":")[0].toLowerCase()] ?? null;

const terraformServiceId = (providerId: ProviderId | null, type: string) => {
  if (!providerId) return null;
  return providerById(providerId).services.find(
    (service) => service.iacSupport !== "diagram" && service.tfType === type,
  )?.id ?? null;
};

const pulumiServiceId = (providerId: ProviderId | null, type: string) => {
  if (!providerId) return null;
  const parts = type.toLowerCase().split(":");
  const moduleName = (parts[1] ?? "").replace(/^resources\//, "");
  const member = parts.at(-1)?.replace(/[^a-z0-9]/g, "") ?? "";
  const moduleTail = moduleName.split("/").at(-1)?.replace(/[^a-z0-9]/g, "") ?? "";
  const aliases = PULUMI_SERVICE_ALIASES[providerId];
  return aliases[`${moduleName.replace(/[^a-z0-9/]/g, "")}/${member}`] ??
    aliases[`${moduleTail}/${member}`] ?? aliases[member] ?? null;
};

const urnName = (urn: string) => urn.split("::").at(-1) || urn;

const flattenValues = (
  value: unknown,
  sensitive: unknown,
  path = "",
  output: Map<string, unknown> = new Map(),
) => {
  if (!isRecord(value)) return output;
  for (const [key, nested] of Object.entries(value)) {
    if (SECRET_KEY.test(key)) continue;
    const sensitiveEntry = isRecord(sensitive) ? sensitive[key] : undefined;
    if (sensitiveEntry === true) continue;
    const nextPath = path ? `${path}.${key}` : key;
    if (typeof nested === "string" || typeof nested === "number" || typeof nested === "boolean") {
      output.set(nextPath.toLowerCase(), nested);
      output.set(key.toLowerCase(), nested);
    } else if (Array.isArray(nested)) {
      if (nested.every((item) => ["string", "number", "boolean"].includes(typeof item))) {
        output.set(nextPath.toLowerCase(), nested);
        output.set(key.toLowerCase(), nested);
      } else {
        nested.slice(0, 8).forEach((item, index) =>
          flattenValues(item, Array.isArray(sensitiveEntry) ? sensitiveEntry[index] : undefined, `${nextPath}.${index}`, output),
        );
      }
    } else if (isRecord(nested)) {
      // Pulumi secret wrappers and encrypted values must never reach the canvas.
      if (Object.keys(nested).some((nestedKey) => /secret|ciphertext|4dabf18193072939515e22adb298388d/i.test(nestedKey))) continue;
      flattenValues(nested, sensitiveEntry, nextPath, output);
    }
  }
  return output;
};

const scalarString = (value: unknown): string | null => {
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.every((item) => typeof item === "string" || typeof item === "number")) {
    return value.join(", ");
  }
  return null;
};

const findFieldValue = (flat: Map<string, unknown>, fieldKey: string) => {
  const candidates = [fieldKey, ...(FIELD_ALIASES[fieldKey] ?? [])];
  for (const candidate of candidates) {
    const direct = flat.get(candidate.toLowerCase());
    const directValue = scalarString(direct);
    if (directValue !== null) return directValue;
    for (const [key, value] of flat) {
      const normalizedKey = key.replace(/[^a-z0-9]/g, "");
      const normalizedCandidate = candidate.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (key.endsWith(`.${candidate.toLowerCase()}`) || normalizedKey.endsWith(normalizedCandidate)) {
        const nestedValue = scalarString(value);
        if (nestedValue !== null) return nestedValue;
      }
    }
  }
  return null;
};

const resourceValues = (resource: StateLensResource, service: ServiceDefinition, sequence: number) => {
  const values = defaultValues(service, sequence);
  const flat = flattenValues(resource.values, resource.sensitiveValues);
  const importedName = findFieldValue(flat, "name") || resource.name;
  values.name = importedName.replace(/[^a-zA-Z0-9-_ .]/g, "-").slice(0, 80) || values.name;
  for (const field of service.fields) {
    if (SECRET_KEY.test(field.key)) continue;
    const imported = findFieldValue(flat, field.key);
    if (imported !== null && imported.length <= 500) values[field.key] = imported;
  }
  return values;
};

const terraformShowResources = (root: unknown): StateLensResource[] => {
  const collected: StateLensResource[] = [];
  const walk = (module: unknown) => {
    if (!isRecord(module)) return;
    if (Array.isArray(module.resources)) {
      for (const item of module.resources) {
        if (!isRecord(item) || typeof item.type !== "string") continue;
        const address = typeof item.address === "string" ? item.address : `${item.type}.${String(item.name ?? "resource")}`;
        const providerId = providerFromTerraform(item.type, String(item.provider_name ?? ""));
        collected.push({
          address,
          type: item.type,
          name: String(item.name ?? address.split(".").at(-1) ?? "resource"),
          providerId,
          serviceId: terraformServiceId(providerId, item.type),
          values: isRecord(item.values) ? item.values : {},
          sensitiveValues: item.sensitive_values,
          dependencies: Array.isArray(item.depends_on) ? item.depends_on.filter((value): value is string => typeof value === "string") : [],
        });
      }
    }
    if (Array.isArray(module.child_modules)) module.child_modules.forEach(walk);
  };
  walk(root);
  return collected;
};

const terraformRawResources = (root: Record<string, unknown>): StateLensResource[] => {
  const collected: StateLensResource[] = [];
  const modules = Array.isArray(root.modules) ? root.modules.filter(isRecord) : [];
  const rawResources = [
    ...(Array.isArray(root.resources) ? root.resources.filter(isRecord) : []),
    ...modules.flatMap((module) => Array.isArray(module.resources) ? module.resources.filter(isRecord) : []),
  ];
  for (const item of rawResources) {
    if (typeof item.type !== "string") continue;
    const baseAddress = typeof item.address === "string"
      ? item.address
      : `${String(item.module ? `${item.module}.` : "")}${item.type}.${String(item.name ?? "resource")}`;
    const instances = Array.isArray(item.instances) && item.instances.length > 0 ? item.instances.filter(isRecord) : [item];
    instances.forEach((instance, index) => {
      const suffix = instances.length > 1 ? `[${index}]` : "";
      const address = `${baseAddress}${suffix}`;
      const providerId = providerFromTerraform(item.type as string, String(item.provider ?? item.provider_name ?? ""));
      collected.push({
        address,
        type: item.type as string,
        name: `${String(item.name ?? address.split(".").at(-1) ?? "resource")}${instances.length > 1 ? `-${index + 1}` : ""}`,
        providerId,
        serviceId: terraformServiceId(providerId, item.type as string),
        values: isRecord(instance.attributes) ? instance.attributes : isRecord(item.values) ? item.values : {},
        sensitiveValues: instance.sensitive_attributes,
        dependencies: Array.isArray(instance.dependencies) ? instance.dependencies.filter((value): value is string => typeof value === "string") : [],
      });
    });
  }
  return collected;
};

const pulumiResources = (root: Record<string, unknown>): StateLensResource[] => {
  const deployment = isRecord(root.deployment) ? root.deployment : root;
  if (!Array.isArray(deployment.resources)) return [];
  return deployment.resources.flatMap((item) => {
    if (!isRecord(item) || typeof item.type !== "string" || typeof item.urn !== "string") return [];
    if (item.type === "pulumi:pulumi:Stack" || item.type.startsWith("pulumi:providers:")) return [];
    const providerId = providerFromPulumi(item.type);
    const dependencies = [
      ...(Array.isArray(item.dependencies) ? item.dependencies : []),
      ...(isRecord(item.propertyDependencies) ? Object.values(item.propertyDependencies).flatMap((value) => Array.isArray(value) ? value : []) : []),
      ...(typeof item.parent === "string" ? [item.parent] : []),
    ].filter((value): value is string => typeof value === "string");
    return [{
      address: item.urn,
      type: item.type,
      name: urnName(item.urn),
      providerId,
      serviceId: pulumiServiceId(providerId, item.type),
      values: { ...(isRecord(item.inputs) ? item.inputs : {}), ...(isRecord(item.outputs) ? item.outputs : {}) },
      dependencies: [...new Set(dependencies)],
    }];
  });
};

const detectAndRead = (parsed: unknown) => {
  if (!isRecord(parsed)) throw new Error("This file must contain a JSON object.");
  if (isRecord(parsed.deployment) && Array.isArray(parsed.deployment.resources)) {
    return { source: "pulumi-stack" as const, resources: pulumiResources(parsed) };
  }
  if (Array.isArray(parsed.resources) || Array.isArray(parsed.modules)) {
    return { source: "terraform-state" as const, resources: terraformRawResources(parsed) };
  }
  const values = isRecord(parsed.planned_values)
    ? parsed.planned_values
    : isRecord(parsed.values)
      ? parsed.values
      : isRecord(parsed.prior_state) && isRecord(parsed.prior_state.values)
        ? parsed.prior_state.values
        : null;
  if (values && isRecord(values.root_module)) {
    return { source: "terraform-json" as const, resources: terraformShowResources(values.root_module) };
  }
  throw new Error("StateLens could not recognize this file. Use terraform.tfstate, `terraform show -json`, or `pulumi stack export` JSON.");
};

const valueStrings = (value: unknown, output: string[] = []): string[] => {
  if (typeof value === "string") output.push(value);
  else if (Array.isArray(value)) value.forEach((item) => valueStrings(item, output));
  else if (isRecord(value)) Object.entries(value).forEach(([key, nested]) => {
    if (!SECRET_KEY.test(key)) valueStrings(nested, output);
  });
  return output;
};

const layoutGraph = (resources: StateLensResource[], edges: Array<[string, string]>) => {
  const rank = new Map(resources.map((resource) => [resource.address, 0]));
  for (let pass = 0; pass < resources.length; pass += 1) {
    let changed = false;
    for (const [from, to] of edges) {
      const next = Math.min(7, (rank.get(from) ?? 0) + 1);
      if (next > (rank.get(to) ?? 0)) {
        rank.set(to, next);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const columns = new Map<number, StateLensResource[]>();
  resources.forEach((resource) => {
    const column = rank.get(resource.address) ?? 0;
    columns.set(column, [...(columns.get(column) ?? []), resource]);
  });
  const positions = new Map<string, { x: number; y: number }>();
  [...columns.entries()].sort(([a], [b]) => a - b).forEach(([column, items]) => {
    items.sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
    items.forEach((resource, row) => {
      positions.set(resource.address, { x: 260 + column * 330, y: 260 + row * 150 });
    });
  });
  return positions;
};

export const parseStateFile = (contents: string): StateLensPreview => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new Error("This state file is not valid JSON.");
  }
  const { source, resources } = detectAndRead(parsed);
  if (resources.length === 0) throw new Error("No infrastructure resources were found in this state export.");

  const providerCounts = new Map<ProviderId, number>();
  resources.forEach((resource) => {
    if (resource.providerId) providerCounts.set(resource.providerId, (providerCounts.get(resource.providerId) ?? 0) + 1);
  });
  const providerId = [...providerCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!providerId) throw new Error("StateLens found resources, but none belong to AWS, Azure, GCP, or Oracle Cloud.");

  const sameProvider = resources.filter((resource) => resource.providerId === providerId);
  const matched = sameProvider.filter((resource) => resource.serviceId);
  const unsupported = sameProvider.filter((resource) => !resource.serviceId);
  const foreignProviderResources = resources.filter((resource) => resource.providerId && resource.providerId !== providerId);
  if (matched.length === 0) throw new Error(`StateLens detected ${providerById(providerId).shortName}, but none of its resource types are in the current InfraCanvas catalog.`);

  const matchedAddresses = new Set(matched.map((resource) => resource.address));
  const addressByIdentifier = new Map<string, string>();
  matched.forEach((resource) => {
    const flat = flattenValues(resource.values, resource.sensitiveValues);
    ["id", "arn", "self_link", "selflink", "resource_id", "name"].forEach((key) => {
      const value = scalarString(flat.get(key));
      if (value && value.length >= 3) addressByIdentifier.set(value, resource.address);
    });
  });

  const edgePairs = new Map<string, [string, string]>();
  matched.forEach((resource) => {
    const dependencyAddresses = new Set(resource.dependencies.map((dependency) => {
      if (matchedAddresses.has(dependency)) return dependency;
      return matched.find((candidate) => dependency === candidate.address || dependency.startsWith(`${candidate.address}[`))?.address;
    }).filter((value): value is string => Boolean(value)));
    for (const value of valueStrings(resource.values)) {
      const reference = addressByIdentifier.get(value);
      if (reference && reference !== resource.address) dependencyAddresses.add(reference);
    }
    dependencyAddresses.forEach((dependency) => {
      const key = `${dependency}->${resource.address}`;
      edgePairs.set(key, [dependency, resource.address]);
    });
  });

  const positions = layoutGraph(matched, [...edgePairs.values()]);
  const nodeIdByAddress = new Map<string, string>();
  const nodes = matched.map((resource, index) => {
    const service = providerById(providerId).services.find((item) => item.id === resource.serviceId)!;
    const id = `statelens-${index + 1}`;
    nodeIdByAddress.set(resource.address, id);
    return {
      id,
      serviceId: service.id,
      ...(positions.get(resource.address) ?? { x: 260 + (index % 6) * 300, y: 260 + Math.floor(index / 6) * 150 }),
      values: resourceValues(resource, service, index + 1),
    };
  });
  const edges = [...edgePairs.values()].flatMap(([from, to], index) => {
    const fromId = nodeIdByAddress.get(from);
    const toId = nodeIdByAddress.get(to);
    return fromId && toId ? [{ id: `statelens-edge-${index + 1}`, from: fromId, to: toId }] : [];
  });

  const warnings: string[] = [];
  if (unsupported.length > 0) warnings.push(`${unsupported.length} ${providerById(providerId).shortName} resource types are not in the visual catalog yet.`);
  if (foreignProviderResources.length > 0) warnings.push(`${foreignProviderResources.length} resources from other cloud providers were left out of this single-provider canvas.`);
  if (edges.length === 0 && nodes.length > 1) warnings.push("This export did not expose usable dependency references, so resources were placed without connection lines.");

  return {
    source,
    sourceLabel: source === "pulumi-stack" ? "Pulumi stack export" : source === "terraform-json" ? "Terraform JSON view" : "Terraform state",
    providerId,
    resources,
    matched,
    unsupported,
    foreignProviderResources,
    nodes,
    edges,
    warnings,
  };
};

export const stateLensSupportedTypes = () =>
  providers.flatMap((provider) =>
    provider.services
      .filter((service) => service.iacSupport !== "diagram")
      .map((service) => ({ providerId: provider.id, tfType: service.tfType, serviceId: service.id })),
  );
