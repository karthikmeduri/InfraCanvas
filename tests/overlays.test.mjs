import assert from "node:assert/strict";
import test from "node:test";

import { analyzeArchitecture, providers } from "../dist/generator-test-bundle.mjs";

const aws = providers.find((provider) => provider.id === "aws");

test("cost ranges are deterministic, broad, and identify coverage", () => {
  const nodes = [
    { id: "vm-1", serviceId: "ec2", x: 0, y: 0, values: { name: "web", count: "2", instance_type: "m7i-flex.large" } },
    { id: "db-1", serviceId: "rds", x: 100, y: 0, values: { name: "orders", instance_class: "db.m7g.large", multi_az: "true" } },
  ];
  const first = analyzeArchitecture(aws, nodes, []);
  const second = analyzeArchitecture(aws, nodes, []);
  assert.deepEqual(first, second);
  assert.equal(first.currency, "USD");
  assert.equal(first.period, "month");
  assert.equal(first.cost.covered, 2);
  assert.ok(first.cost.high > first.cost.low);
  assert.match(first.assumptions[0], /not quotes or live provider prices/i);
  assert.equal("generatedAt" in first, false, "analysis should not introduce time-dependent output");
});

test("security checks flag internet-wide administration and unsafe storage", () => {
  const report = analyzeArchitecture(aws, [
    { id: "sg-1", serviceId: "security_group", x: 0, y: 0, values: { name: "admin", ingress_port: "22", source_cidr: "0.0.0.0/0" } },
    { id: "bucket-1", serviceId: "s3", x: 0, y: 0, values: { name: "uploads", public_access: "public", versioning: "Disabled" } },
  ]);
  assert.equal(report.security.counts.critical, 2);
  assert.ok(report.security.findings.some((finding) => finding.id === "sg-1-public-ingress"));
  assert.ok(report.security.findings.some((finding) => finding.id === "bucket-1-public-storage"));
  assert.ok(report.security.score < 70);
});

test("database and cluster resilience settings produce actionable findings", () => {
  const report = analyzeArchitecture(aws, [
    { id: "db-1", serviceId: "rds", x: 0, y: 0, values: { name: "orders", multi_az: "false", backup_retention: "1" } },
    { id: "eks-1", serviceId: "eks", x: 0, y: 0, values: { name: "apps", public_endpoint: "true" } },
  ]);
  assert.ok(report.security.findings.some((finding) => finding.id === "db-1-backup-window" && finding.severity === "high"));
  assert.ok(report.security.findings.some((finding) => finding.id === "db-1-single-zone"));
  assert.ok(report.security.findings.some((finding) => finding.id === "eks-1-public-control-plane"));
});

test("credential-shaped fields never appear in overlay output", () => {
  const marker = "AKIA-DO-NOT-EXPOSE";
  const nodes = [{
    id: "vm-1",
    serviceId: "ec2",
    x: 0,
    y: 0,
    values: { name: "worker", access_key: marker, client_secret: marker, count: "1" },
  }];
  const snapshot = structuredClone(nodes);
  const report = analyzeArchitecture(aws, nodes, []);
  assert.doesNotMatch(JSON.stringify(report), new RegExp(marker));
  assert.deepEqual(nodes, snapshot, "analysis must not mutate the canvas");
});

test("diagram-only services fail closed without fabricated cost", () => {
  const diagram = aws.services.find((service) => service.iacSupport === "diagram");
  assert.ok(diagram, "expanded provider catalog should include diagram-only services");
  const report = analyzeArchitecture(aws, [{ id: "visual-1", serviceId: diagram.id, x: 0, y: 0, values: { name: "reference" } }]);
  assert.equal(report.cost.covered, 0);
  assert.equal(report.cost.unpriced, 1);
  assert.equal(report.resources[0].cost.high, 0);
  assert.match(report.resources[0].drivers[0], /diagram-only/);
});
