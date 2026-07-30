import { safeName } from "../hcl";
import type {
  DiagramEdge,
  DiagramNode,
  ProviderDefinition,
  RefTarget,
  ServiceDefinition,
  ServiceRole,
} from "../types";

export type ResolvedNode = {
  node: DiagramNode;
  service: ServiceDefinition;
  /** Unique Terraform-safe local name (deduplicated across the diagram). */
  name: string;
  address: string;
  target: RefTarget;
};

export type DiagramGraph = {
  /** Nodes in emit order — networks first, then subnets, then everything else. */
  ordered: ResolvedNode[];
  byId: Map<string, ResolvedNode>;
  neighbours: Map<string, string[]>;
  /**
   * Nodes matching `roles`, ordered by graph distance from `nodeId`.
   * `distance` is `Infinity` for role matches that share no path with the node,
   * which lets the caller decide between "wire it up" and "fall back to a
   * variable".
   */
  findByRole: (nodeId: string, roles: ServiceRole[]) => RoleMatch[];
};

export type RoleMatch = { item: ResolvedNode; distance: number };

/**
 * Emit ordering only affects readability of main.tf — Terraform resolves the
 * real dependency order from references — but grouping foundations first makes
 * the generated file read like something a human wrote.
 */
const ROLE_WEIGHT: Record<ServiceRole, number> = {
  network: 0,
  subnet: 1,
  gateway: 2,
  firewall: 3,
  webfirewall: 4,
  identity: 5,
  secrets: 6,
  registry: 7,
  storage: 8,
  database: 9,
  cache: 10,
  queue: 11,
  topic: 12,
  compute: 13,
  container: 14,
  serverless: 15,
  targetgroup: 16,
  loadbalancer: 17,
  cdn: 18,
  dns: 19,
  analytics: 20,
  monitoring: 21,
};

export function buildGraph(
  provider: ProviderDefinition,
  nodes: DiagramNode[],
  edges: DiagramEdge[],
): DiagramGraph {
  const serviceById = new Map(provider.services.map((service) => [service.id, service]));
  const usedNames = new Map<string, number>();

  const resolved: ResolvedNode[] = [];
  nodes.forEach((node) => {
    const service = serviceById.get(node.serviceId);
    if (!service) return;

    const base = safeName(node.values.name || service.id, service.id.replace(/-/g, "_"));
    const seen = usedNames.get(base) ?? 0;
    usedNames.set(base, seen + 1);
    const name = seen === 0 ? base : `${base}_${seen + 1}`;

    resolved.push({
      node,
      service,
      name,
      address: `${service.tfType}.${name}`,
      target: {
        name,
        tfType: service.tfType,
        serviceId: service.id,
        values: node.values,
      },
    });
  });

  const byId = new Map(resolved.map((item) => [item.node.id, item]));

  const neighbours = new Map<string, string[]>();
  resolved.forEach((item) => neighbours.set(item.node.id, []));
  edges.forEach((edge) => {
    if (!byId.has(edge.from) || !byId.has(edge.to)) return;
    neighbours.get(edge.from)!.push(edge.to);
    neighbours.get(edge.to)!.push(edge.from);
  });

  const distanceCache = new Map<string, Map<string, number>>();
  const distancesFrom = (nodeId: string) => {
    const cached = distanceCache.get(nodeId);
    if (cached) return cached;

    const distances = new Map<string, number>([[nodeId, 0]]);
    const queue = [nodeId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const currentDistance = distances.get(current)!;
      (neighbours.get(current) ?? []).forEach((next) => {
        if (distances.has(next)) return;
        distances.set(next, currentDistance + 1);
        queue.push(next);
      });
    }

    distanceCache.set(nodeId, distances);
    return distances;
  };

  const findByRole = (nodeId: string, roles: ServiceRole[]) => {
    const roleSet = new Set(roles);
    const distances = distancesFrom(nodeId);
    const matches: RoleMatch[] = resolved
      .filter((item) => item.node.id !== nodeId && roleSet.has(item.service.role))
      .map((item) => ({
        item,
        distance: distances.get(item.node.id) ?? Number.POSITIVE_INFINITY,
      }));

    return matches.sort((a, b) => {
      if (a.distance !== b.distance) return a.distance - b.distance;
      // Stable tiebreak on canvas position so regenerating is deterministic.
      if (a.item.node.y !== b.item.node.y) return a.item.node.y - b.item.node.y;
      return a.item.node.x - b.item.node.x;
    });
  };

  const ordered = [...resolved].sort((a, b) => {
    const wa = ROLE_WEIGHT[a.service.role] ?? 99;
    const wb = ROLE_WEIGHT[b.service.role] ?? 99;
    if (wa !== wb) return wa - wb;
    if (a.node.y !== b.node.y) return a.node.y - b.node.y;
    return a.node.x - b.node.x;
  });

  return { ordered, byId, neighbours, findByRole };
}
