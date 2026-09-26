import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ARCHITECTURE_REVIEW_MARKER,
  architectureChangeMarkdown,
  compareArchitectureSnapshots,
  createArchitectureSnapshot,
  parseArchitectureSnapshot,
} from "../dist/generator-test-bundle.mjs";

const snapshot = (overrides = {}) => createArchitectureSnapshot({
  providerId: "aws",
  projectName: "Payments platform",
  nodes: [
    { id: "vpc-1", serviceId: "vpc", x: 20, y: 40, values: { name: "core", cidr: "10.0.0.0/16" } },
    { id: "app-1", serviceId: "ec2", x: 280, y: 40, values: { name: "api", instanceType: "t3.micro" } },
  ],
  edges: [{ id: "edge-1", from: "vpc-1", to: "app-1" }],
  ...overrides,
});

test("architecture snapshots are canonical and redact credential-shaped data", () => {
  const result = createArchitectureSnapshot({
    providerId: "aws",
    projectName: "Secure export",
    nodes: [{
      id: "node-1",
      serviceId: "secrets-manager",
      x: 1.2,
      y: 2.8,
      values: { name: "vault", clientSecret: "do-not-print", note: "token=also-hidden" },
    }],
    edges: [],
  });
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.nodes[0].x, 1);
  assert.equal(result.nodes[0].values.clientSecret, "[REDACTED]");
  assert.equal(result.nodes[0].values.note, "[REDACTED]");
});

test("change intelligence separates configuration, connection, and layout changes", () => {
  const before = snapshot();
  const after = snapshot({
    nodes: [
      { id: "vpc-1", serviceId: "vpc", x: 44, y: 40, values: { name: "core", cidr: "10.0.0.0/16" } },
      { id: "app-1", serviceId: "ec2", x: 280, y: 40, values: { name: "api", instanceType: "m7i.large", ingress: "0.0.0.0/0" } },
      { id: "db-1", serviceId: "rds", x: 540, y: 40, values: { name: "orders" } },
    ],
    edges: [
      { id: "edge-1", from: "vpc-1", to: "app-1" },
      { id: "edge-2", from: "app-1", to: "db-1" },
    ],
  });
  const report = compareArchitectureSnapshots(before, after);
  assert.deepEqual(report.summary, {
    added: 1,
    removed: 0,
    modified: 1,
    moved: 1,
    connectionsAdded: 1,
    connectionsRemoved: 0,
  });
  assert.equal(report.risk, "critical");
  assert.match(report.warnings.join(" "), /0\.0\.0\.0\/0/);
  const markdown = architectureChangeMarkdown(report);
  assert.match(markdown, new RegExp(ARCHITECTURE_REVIEW_MARKER));
  assert.match(markdown, /m7i\.large/);
  assert.match(markdown, /Layout-only/);
});

test("invalid or adversarial snapshots are rejected", () => {
  assert.throws(() => parseArchitectureSnapshot({ schemaVersion: 1, providerId: "aws", projectName: "x", nodes: [{ id: "bad id", serviceId: "ec2", x: 0, y: 0, values: {} }], edges: [] }), /invalid identifier/);
  assert.throws(() => parseArchitectureSnapshot({ schemaVersion: 2, providerId: "aws", projectName: "x", nodes: [], edges: [] }), /Unsupported/);
  assert.throws(() => parseArchitectureSnapshot({ schemaVersion: 1, providerId: "aws", projectName: "x", nodes: [], edges: [{ id: "e", from: "a", to: "b" }] }), /missing node/);
});

test("pull request markdown neutralizes mentions and multiline injection", () => {
  const before = snapshot();
  const after = snapshot({
    projectName: "@everyone\n## injected",
    nodes: [
      { id: "vpc-1", serviceId: "vpc", x: 20, y: 40, values: { name: "core", cidr: "10.0.0.0/16" } },
      { id: "app-1", serviceId: "ec2", x: 280, y: 40, values: { name: "@team\nnew heading", instanceType: "t3.small" } },
    ],
    edges: [{ id: "edge-1", from: "vpc-1", to: "app-1" }],
  });
  const markdown = architectureChangeMarkdown(compareArchitectureSnapshots(before, after));
  assert.doesNotMatch(markdown, /@everyone/);
  assert.doesNotMatch(markdown, /@team/);
  assert.doesNotMatch(markdown, /\n## injected/);
});

test("the pull request workflow runs trusted code and treats fork content as data", async () => {
  const workflow = await readFile(new URL("../.github/workflows/architecture-review.yml", import.meta.url), "utf8");
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /pull-requests: write/);
  assert.match(workflow, /pull_request_target/);
  assert.match(workflow, /ref: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/);
  assert.match(workflow, /repos\.getContent/);
  assert.doesNotMatch(workflow, /checkout.*head\.sha/);
});
