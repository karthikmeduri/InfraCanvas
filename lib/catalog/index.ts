import type { ProviderDefinition, ProviderId, ServiceDefinition } from "../types";
import { aws } from "./aws";
import { azure } from "./azure";
import { gcp } from "./gcp";
import { oci } from "./oci";

export const providers: ProviderDefinition[] = [aws, azure, gcp, oci];

export const providerById = (id: ProviderId): ProviderDefinition =>
  providers.find((provider) => provider.id === id) ?? aws;

export const serviceById = (
  provider: ProviderDefinition,
  serviceId: string,
): ServiceDefinition | undefined =>
  provider.services.find((service) => service.id === serviceId);

/** Category display order in the library sidebar. */
export const CATEGORY_ORDER = [
  "Networking",
  "Compute",
  "Containers",
  "Database",
  "Storage",
  "Security",
  "Integration",
  "Observability",
];

/** Starter architectures loaded when a provider is chosen. */
export const SAMPLE_ARCHITECTURES: Record<
  ProviderId,
  { serviceId: string; x: number; y: number }[]
> = {
  aws: [
    { serviceId: "vpc", x: 60, y: 300 },
    { serviceId: "subnet", x: 300, y: 180 },
    { serviceId: "security_group", x: 300, y: 420 },
    { serviceId: "alb", x: 540, y: 180 },
    { serviceId: "ec2", x: 780, y: 180 },
    { serviceId: "rds", x: 780, y: 420 },
    { serviceId: "s3", x: 540, y: 560 },
  ],
  azure: [
    { serviceId: "vnet", x: 60, y: 300 },
    { serviceId: "subnet", x: 300, y: 180 },
    { serviceId: "nsg", x: 300, y: 420 },
    { serviceId: "app_gateway", x: 540, y: 180 },
    { serviceId: "vm", x: 780, y: 180 },
    { serviceId: "postgres", x: 780, y: 420 },
    { serviceId: "storage_account", x: 540, y: 560 },
  ],
  gcp: [
    { serviceId: "vpc", x: 60, y: 300 },
    { serviceId: "subnet", x: 300, y: 180 },
    { serviceId: "firewall", x: 300, y: 420 },
    { serviceId: "load_balancer", x: 540, y: 180 },
    { serviceId: "compute", x: 780, y: 180 },
    { serviceId: "cloud_sql", x: 780, y: 420 },
    { serviceId: "storage", x: 540, y: 560 },
  ],
  oci: [
    { serviceId: "vcn", x: 60, y: 300 },
    { serviceId: "subnet", x: 300, y: 180 },
    { serviceId: "security_list", x: 300, y: 420 },
    { serviceId: "load_balancer", x: 540, y: 180 },
    { serviceId: "instance", x: 780, y: 180 },
    { serviceId: "autonomous_db", x: 780, y: 420 },
    { serviceId: "object_storage", x: 540, y: 560 },
  ],
};

/** Edges wired into the sample, expressed as indexes into the layout above. */
export const SAMPLE_EDGES: [number, number][] = [
  [0, 1],
  [0, 2],
  [1, 3],
  [2, 3],
  [1, 4],
  [2, 4],
  [3, 4],
  [1, 5],
  [2, 5],
  [4, 5],
  [4, 6],
];

export { aws, azure, gcp, oci };
