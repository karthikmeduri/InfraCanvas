import type {
  ProviderDefinition,
  ServiceDefinition,
  ServiceRole,
} from "../types";
import { defineService, text } from "./helpers";
import type { GeneratedCatalogEntry } from "./generated-service-manifest";

const normalized = (value: string) =>
  value
    .toLowerCase()
    .replace(/\b(amazon|aws|microsoft|azure|google|cloud|service|services)\b/g, "")
    .replace(/[^a-z0-9]+/g, "");

const normalizedCategory = (value: string) => normalized(value).replace(/s$/, "");

const shortName = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
    .map((word) => word[0])
    .join("")
    .toUpperCase();

function inferRole(category: string, name: string): ServiceRole {
  const value = `${category} ${name}`.toLowerCase();
  if (/load balanc|application gateway|front door/.test(value)) return "loadbalancer";
  if (/dns|route 53|domain/.test(value)) return "dns";
  if (/cdn|cloudfront/.test(value)) return "cdn";
  if (/firewall|security group|network security|cloud armor|waf/.test(value)) return "firewall";
  if (/gateway|router|interconnect|vpn|network|vpc|virtual private|virtual network/.test(value)) return "network";
  if (/subnet/.test(value)) return "subnet";
  if (/kubernetes|container|fargate|openshift/.test(value)) return "container";
  if (/function|serverless|lambda|cloud run|app engine/.test(value)) return "serverless";
  if (/registry|artifact/.test(value)) return "registry";
  if (/redis|cache|memorystore/.test(value)) return "cache";
  if (/database|sql|spanner|firestore|dynamodb|cosmos|bigtable|alloydb|rds/.test(value)) return "database";
  if (/storage|file|disk|backup|archive|databox|data box/.test(value)) return "storage";
  if (/queue|task/.test(value)) return "queue";
  if (/pub.sub|topic|notification|event grid|eventarc/.test(value)) return "topic";
  if (/secret|vault|key management|kms|certificate/.test(value)) return "secrets";
  if (/identity|iam|directory|access|security/.test(value)) return "identity";
  if (/monitor|observ|logging|trace|alarm|health/.test(value)) return "monitoring";
  if (/analytics|data|machine learning| ai |intelligence|insight|looker|bigquery/.test(` ${value} `)) return "analytics";
  return "compute";
}

const documentationUrl = (provider: ProviderDefinition) => {
  if (provider.id === "aws") return "https://docs.aws.amazon.com/";
  if (provider.id === "azure") return "https://learn.microsoft.com/azure/";
  return "https://cloud.google.com/docs";
};

function diagramService(
  provider: ProviderDefinition,
  entry: GeneratedCatalogEntry,
): ServiceDefinition {
  return defineService({
    id: entry.id,
    name: entry.name,
    short: shortName(entry.name) || provider.shortName,
    category: entry.category,
    productFamily: entry.category,
    role: inferRole(entry.category, entry.name),
    tfType: "diagram_only",
    description: `Official ${provider.shortName} architecture service`,
    docs: documentationUrl(provider),
    icon: entry.icon,
    iacSupport: "diagram",
    fields: [
      text("notes", "Architecture notes", "", "Document the purpose, ownership, or configuration intent."),
      text(
        "terraform_resource_type",
        "Terraform resource type",
        "",
        "Optional planning metadata. InfraCanvas will not emit unverified provider code for this service.",
      ),
    ],
    emit: () => [],
  });
}

/**
 * Adds the complete official architecture icon catalog to a provider while
 * retaining the hand-authored, deployable resource definitions as the source
 * of truth for Terraform and Pulumi generation.
 */
export function expandProviderCatalog(
  provider: ProviderDefinition,
  entries: GeneratedCatalogEntry[],
  iconAliases: Record<string, string> = {},
): ProviderDefinition {
  const entryByPath = new Map(entries.map((entry) => [entry.icon, entry]));
  const iconUseCount = entries.reduce((counts, entry) => {
    counts.set(entry.icon, (counts.get(entry.icon) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
  const entryByName = new Map(entries.map((entry) => [normalized(entry.name), entry]));
  const entryByCategory = new Map(
    entries.map((entry) => [normalizedCategory(entry.category), entry]),
  );
  const usedCatalogIds = new Set<string>();

  const deployable = provider.services.map((service) => {
    const alias = iconAliases[service.id];
    const nameMatch = entryByName.get(normalized(service.name));
    const aliasMatch = alias && iconUseCount.get(alias) === 1 ? entryByPath.get(alias) : undefined;
    const directMatch = nameMatch ?? aliasMatch;
    const matched = directMatch ?? entryByCategory.get(normalizedCategory(service.category));
    const icon = alias ?? matched?.icon ?? entries[0]?.icon;
    if (directMatch) usedCatalogIds.add(directMatch.id);
    return {
      ...service,
      icon,
      iacSupport: "deployable" as const,
      productFamily: service.productFamily ?? service.category,
    };
  });

  const deployableNames = new Set(deployable.map((service) => normalized(service.name)));
  const architecture = entries
    .filter((entry) => !usedCatalogIds.has(entry.id) && !deployableNames.has(normalized(entry.name)))
    .map((entry) => diagramService(provider, entry));

  return {
    ...provider,
    tagline: `${provider.tagline.replace(/\.$/, "")} with the complete official architecture catalog.`,
    services: [...deployable, ...architecture],
  };
}
