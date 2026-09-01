import { copyFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative, sep } from "node:path";

const root = process.cwd();
const sourceRoot = join(root, "icons packs");
const outputRoot = join(root, "public", "cloud-icons");
const manifestPath = join(root, "lib", "catalog", "generated-service-manifest.ts");

const walk = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });

const words = (value) =>
  value
    .replace(/^Arch_/, "")
    .replace(/_\d+$/, "")
    .replace(/^\d+-icon-service-/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const title = (value) =>
  words(value)
    .split(" ")
    .map((part) => {
      if (/^(AWS|EC2|VPC|IAM|IoT|SQL|AI|ML|API|CDN|DNS|GPU|GKE|OS)$/i.test(part)) {
        return part.toUpperCase();
      }
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");

const slug = (value) =>
  words(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const copyIcon = (provider, source, id) => {
  const directory = join(outputRoot, provider);
  mkdirSync(directory, { recursive: true });
  const target = join(directory, `${id}.svg`);
  copyFileSync(source, target);
  return `/cloud-icons/${provider}/${id}.svg`;
};

rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(outputRoot, { recursive: true });

const awsRoot = join(sourceRoot, "AWS Icons Pack", "Architecture-Service-Icons_07312026");
const awsSeen = new Set();
const aws = walk(awsRoot)
  .filter((path) => extname(path).toLowerCase() === ".svg" && path.split(sep).includes("48"))
  .map((path) => {
    const file = basename(path, ".svg");
    const id = slug(file);
    const categoryDirectory = relative(awsRoot, dirname(dirname(path))).split(sep)[0] || "General";
    const category = title(categoryDirectory.replace(/^Arch_/, ""));
    return {
      id: `aws_catalog_${id}`,
      name: title(file),
      category,
      icon: copyIcon("aws", path, id),
    };
  })
  .filter((entry) => {
    if (!entry.id || awsSeen.has(entry.id)) return false;
    awsSeen.add(entry.id);
    return true;
  })
  .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

const azureRoot = join(sourceRoot, "Azure_Public_Service_Icons", "Icons");
const azureSeen = new Set();
const azure = walk(azureRoot)
  .filter((path) => extname(path).toLowerCase() === ".svg")
  .map((path) => {
    const rawName = basename(path, ".svg");
    const id = slug(rawName);
    const category = title(relative(azureRoot, dirname(path)).split(sep)[0] || "General");
    return { rawName, id, category, path };
  })
  .filter((entry) => {
    if (!entry.id || azureSeen.has(entry.id)) return false;
    azureSeen.add(entry.id);
    return true;
  })
  .map((entry) => ({
    id: `azure_catalog_${entry.id}`,
    name: title(entry.rawName),
    category: entry.category,
    icon: copyIcon("azure", entry.path, entry.id),
  }))
  .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

const gcpRoot = join(sourceRoot, "GCP Icons Pack", "Category Icons");
const gcpCategoryIcons = new Map(
  walk(gcpRoot)
    .filter((path) => extname(path).toLowerCase() === ".svg")
    .map((path) => {
      const category = relative(gcpRoot, path).split(sep)[0];
      const id = slug(category);
      return [category, copyIcon("gcp", path, id)];
    }),
);

// Product names and category assignments are transcribed from the supplied
// "Google Cloud product icons" guide (May 2026). Google intentionally uses a
// shared category icon for general products rather than hundreds of unique marks.
const gcpProducts = {
  "Agents": ["AI Testing agent", "Automotive AI agent", "Code Documentation agent", "Deep Research agent", "Food ordering AI agent", "Idea Generation agent", "Customer Engagement Suite", "Conversational Agents", "Agent Assist", "Conversational Insights", "Contact Center as a Service"],
  "AI _ Machine Learning": ["Advanced Agent Modeling", "AutoML Vision", "Dialogflow ES", "Agent Assist", "Cloud GPU", "Document AI", "AI Hub", "Cloud Healthcare API", "Genomics", "AI Hypercomputer", "Cloud Natural Language API", "Healthcare NLP API", "AI Platform", "Cloud Optimization", "AI Media Translation API", "AI Platform Unified", "Cloud Optimization AI Fleet", "Routing API", "Recommendations AI", "AutoML", "Cloud TPU", "Speech to Text", "AutoML Natural Language", "Cloud Translation API", "TensorFlow Enterprise", "AutoML Tables", "Cloud Vision API", "Text To Speech", "AutoML Translation", "Customer Engagement Suite", "Visual Inspection AI", "AutoML Video Intelligence", "Data Labeling"],
  "Business Intelligence": ["Looker", "Looker Studio", "Looker Studio Pro"],
  "Collaboration": ["Google Workspace"],
  "Compute": ["Batch", "OS Config Management", "Compute Engine", "OS Inventory Management", "Container Optimized OS", "OS Patch Management", "GCE Systems Management", "VMware Engine", "Migrate To Virtual Machines"],
  "Containers": ["Backup for GKE", "Google Kubernetes Engine", "Knative serving", "Migrate To Containers"],
  "Data Analytics": ["Analytics Hub", "Data Catalog", "Dataproc", "BigLake", "Data Layers", "Dataproc Metastore", "BigQuery", "Data Loss Prevention API", "Datashare", "BigQuery Functions", "Dataflow", "Datastream", "BigQuery Omni", "Dataplex", "Pub/Sub", "Cloud Composer", "Datapol", "Cloud Data Fusion", "Dataprep"],
  "Databases": ["AlloyDB", "Database Migration Service", "AlloyDB Omni", "Datastore", "Bare Metal Solution", "Firestore", "Bigtable", "Memorystore", "Cloud SQL", "Spanner", "Database Center", "SQL"],
  "Developer Tools": ["Cloud Code", "Cloud Workstations", "Cloud Deployment Manager", "Runtime Config", "Cloud Scheduler", "Service Catalog", "Cloud Shell", "Tools For PowerShell", "Cloud Tasks"],
  "DevOps": ["Artifact Registry", "Cloud Build", "Cloud Deploy", "Container Registry"],
  "Hybrid & Multicloud": ["Anthos", "Google Distributed Cloud"],
  "Integration Services": ["Advanced API Security", "Cloud Endpoints", "API Analytics", "Connectors", "Apigee", "Developer Portal", "Application Integration", "Eventarc", "Cloud API Gateway", "Workflows", "Cloud APIs"],
  "Management Tools": ["Carbon Footprint", "Producer Portal"],
  "Maps & Geospatial": ["Earth Engine", "Google Earth", "Google Maps Platform"],
  "Marketplace": ["Google Cloud Marketplace"],
  "Migration": ["Migrate For Compute Engine", "Transfer Appliance"],
  "Networking": ["Cloud Armor", "Cloud Network", "Network Topology", "Cloud CDN", "Cloud Router", "Packet Mirroring", "Cloud DNS", "Cloud VPN", "Partner Interconnect", "Cloud Domains", "Connectivity Test", "Premium Network Tier", "Cloud Firewall Rules", "Data Transfer", "Private Connectivity", "Cloud IDS", "Network Connectivity Center", "Private Service Connect", "Cloud Interconnect", "Network Intelligence Center", "Routes", "Cloud Load Balancing", "Network Security", "Service Mesh", "Cloud NAT", "Network Tiers", "Virtual Private Cloud"],
  "Observability": ["Cloud Audit Logs", "Google Cloud Observability", "Cloud Logging", "Profiler", "Cloud Monitoring", "Trace", "Error Reporting"],
  "Operations": ["App Hub", "Backup and DR", "Capacity Planner", "Performance Dashboard", "Personalized Service Health"],
  "Security Identity": ["Access Context Manager", "Cloud Security Scanner", "Phishing Protection", "Asset Inventory", "Google Security Operations", "Policy Analyzer", "Assured Workloads", "Google Threat Intelligence", "reCAPTCHA Enterprise", "BeyondCorp", "Identity and Access Management", "Risk Manager", "Binary Authorization", "Identity Aware Proxy", "Secret Manager", "Certificate Authority Service", "Identity Platform", "Security Command Center", "Certificate Manager", "Key Access Justifications", "Security Key Enforcement", "Cloud Asset Inventory", "Key Management Service", "Web Risk", "Cloud External Key Manager", "Managed Service For Microsoft Active Directory", "Web Security Scanner", "Cloud HSM", "Mandiant", "Workload Identity Federation"],
  "Serverless Computing": ["App Engine", "Cloud Functions", "Cloud Run"],
  "Storage": ["Cloud Storage", "Local SSD", "Filestore", "Parallelstore", "Google Cloud NetApp Volumes", "Persistent Disk", "Hyperdisk", "Storage Transfer Service"],
  "Web3": ["Blockchain Node Engine", "Blockchain RPC"],
};

const gcpSeen = new Set();
const gcp = Object.entries(gcpProducts).flatMap(([category, names]) => {
  const icon = gcpCategoryIcons.get(category) ?? gcpCategoryIcons.get("Operations");
  return names.flatMap((name) => {
    const id = slug(name);
    if (gcpSeen.has(id)) return [];
    gcpSeen.add(id);
    return [{ id: `gcp_catalog_${id}`, name, category: title(category), icon }];
  });
});

const source = `/* This file is generated by scripts/build-cloud-icon-catalog.mjs. */
export type GeneratedCatalogEntry = {
  id: string;
  name: string;
  category: string;
  icon: string;
};

export const AWS_SERVICE_CATALOG: GeneratedCatalogEntry[] = ${JSON.stringify(aws, null, 2)};

export const AZURE_SERVICE_CATALOG: GeneratedCatalogEntry[] = ${JSON.stringify(azure, null, 2)};

export const GCP_SERVICE_CATALOG: GeneratedCatalogEntry[] = ${JSON.stringify(gcp, null, 2)};
`;

writeFileSync(manifestPath, source);
console.log(`Generated ${aws.length} AWS, ${azure.length} Azure, and ${gcp.length} GCP catalog entries.`);
