import { buildGraph } from "./terraform/graph";
import type {
  DiagramEdge,
  DiagramNode,
  ProviderDefinition,
  ServiceRole,
  ValidationIssue,
} from "./types";

/** Roles that must sit inside a network to produce a deployable template. */
const NEEDS_SUBNET: ServiceRole[] = ["compute", "database", "cache", "container"];

const CIDR_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/;

function isValidCidr(value: string): boolean {
  const match = CIDR_PATTERN.exec(value.trim());
  if (!match) return false;
  const octets = [match[1], match[2], match[3], match[4]].map(Number);
  if (octets.some((octet) => octet > 255)) return false;
  const prefix = Number(match[5]);
  return prefix >= 0 && prefix <= 32;
}

/**
 * Everything surfaced here is checkable from the diagram alone. Anything that
 * would need a cloud API call belongs in `terraform plan`, not in this panel.
 */
export function validateDiagram(
  provider: ProviderDefinition,
  nodes: DiagramNode[],
  edges: DiagramEdge[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (nodes.length === 0) return issues;

  const graph = buildGraph(provider, nodes, edges);

  // Duplicate Terraform addresses would collide in the generated template.
  const addressCounts = new Map<string, number>();
  graph.ordered.forEach((item) => {
    addressCounts.set(item.address, (addressCounts.get(item.address) ?? 0) + 1);
  });

  const seenNames = new Map<string, string>();
  graph.ordered.forEach((item) => {
    const label = item.node.values.name || item.service.name;
    const key = `${item.service.tfType}::${label.toLowerCase()}`;
    const existing = seenNames.get(key);
    if (existing) {
      issues.push({
        id: `duplicate-${item.node.id}`,
        severity: "warning",
        title: `Duplicate name "${label}"`,
        detail: `Two ${item.service.name} resources share this name. InfraCanvas appends a suffix to keep the Terraform addresses unique, but distinct names read better in state.`,
        nodeId: item.node.id,
      });
    }
    seenNames.set(key, item.node.id);
  });

  graph.ordered.forEach((item) => {
    const label = item.node.values.name || item.service.name;
    const neighbours = graph.neighbours.get(item.node.id) ?? [];

    if (neighbours.length === 0 && nodes.length > 1) {
      issues.push({
        id: `orphan-${item.node.id}`,
        severity: "warning",
        title: `${label} is not connected`,
        detail:
          "Unconnected resources cannot inherit network or security references from the diagram, so the generator falls back to input variables.",
        nodeId: item.node.id,
      });
    }

    if (NEEDS_SUBNET.includes(item.service.role)) {
      const subnet = graph
        .findByRole(item.node.id, ["subnet"])
        .find((match) => Number.isFinite(match.distance));
      if (!subnet) {
        issues.push({
          id: `no-subnet-${item.node.id}`,
          severity: "error",
          title: `${label} has no subnet`,
          detail: `Connect ${label} to a ${provider.id === "gcp" ? "subnetwork" : "subnet"} so the generated resource gets a real network placement instead of a required input variable.`,
          nodeId: item.node.id,
        });
      }
    }

    // Open ingress from anywhere is the single most common review finding.
    const openSource = ["source_cidr", "source", "cidr"]
      .map((key) => item.node.values[key])
      .find((value) => value === "0.0.0.0/0" || value === "*" || value === "::/0");
    if (openSource && item.service.role === "firewall") {
      issues.push({
        id: `open-ingress-${item.node.id}`,
        severity: "warning",
        title: `${label} allows traffic from anywhere`,
        detail: `Ingress from ${openSource} is only appropriate in front of a public load balancer. Narrow the source range for internal tiers.`,
        nodeId: item.node.id,
      });
    }

    ["cidr", "prefix", "address_space", "source_cidr"].forEach((key) => {
      const value = item.node.values[key];
      if (!value) return;
      if (value === "*" || value === "VirtualNetwork" || value === "0.0.0.0/0") return;
      if (!isValidCidr(value)) {
        issues.push({
          id: `cidr-${item.node.id}-${key}`,
          severity: "error",
          title: `${label} has an invalid CIDR`,
          detail: `"${value}" is not a valid IPv4 CIDR block. Terraform will reject it during plan.`,
          nodeId: item.node.id,
        });
      }
    });

    const count = item.node.values.count;
    if (count !== undefined && count !== "" && !/^\d+$/.test(count)) {
      issues.push({
        id: `count-${item.node.id}`,
        severity: "error",
        title: `${label} has a non-numeric instance count`,
        detail: `"${count}" is not a whole number. The generator falls back to 1.`,
        nodeId: item.node.id,
      });
    }
  });

  const hasNetwork = graph.ordered.some((item) => item.service.role === "network");
  const needsNetwork = graph.ordered.some((item) => NEEDS_SUBNET.includes(item.service.role));
  if (needsNetwork && !hasNetwork) {
    issues.push({
      id: "no-network",
      severity: "warning",
      title: "No network on the canvas",
      detail: `Add a ${provider.id === "azure" ? "Virtual Network" : provider.id === "oci" ? "VCN" : "VPC"} so subnets, firewalls, and instances share one address space.`,
    });
  }

  const hasFirewall = graph.ordered.some(
    (item) => item.service.role === "firewall" || item.service.role === "webfirewall",
  );
  if (needsNetwork && !hasFirewall) {
    issues.push({
      id: "no-firewall",
      severity: "info",
      title: "No firewall rules defined",
      detail:
        "Compute and database resources will use the provider default security posture. Add a security group, NSG, or firewall rule to be explicit.",
    });
  }

  const order = { error: 0, warning: 1, info: 2 } as const;
  return issues.sort((a, b) => order[a.severity] - order[b.severity]);
}
