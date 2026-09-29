import assert from "node:assert/strict";
import test from "node:test";

import {
  parseGeneratedIaCResources,
  providers,
  reconcileArchitecture,
} from "../dist/generator-test-bundle.mjs";

const aws = providers.find((provider) => provider.id === "aws");
assert.ok(aws);

const nodes = [
  { id: "vpc", serviceId: "vpc", x: 0, y: 0, values: { name: "production", cidr: "10.0.0.0/16" } },
  { id: "api", serviceId: "ec2", x: 320, y: 0, values: { name: "api", instance_type: "t3.micro" } },
];

const generatedFiles = [{
  path: "main.tf",
  contents: `
resource "aws_vpc" "production" {
  cidr_block = "10.0.0.0/16"
}
resource "aws_instance" "api" {
  instance_type = "t3.micro"
}
resource "aws_iam_instance_profile" "api" {
  name = "api"
}
`,
}];

const statePreview = {
  source: "terraform-state",
  sourceLabel: "Terraform state",
  providerId: "aws",
  resources: [],
  unsupported: [],
  foreignProviderResources: [],
  warnings: [],
  edges: [],
  matched: [
    { address: "aws_vpc.production", type: "aws_vpc", name: "production", providerId: "aws", serviceId: "vpc", values: {}, dependencies: [] },
    { address: "aws_instance.api", type: "aws_instance", name: "api", providerId: "aws", serviceId: "ec2", values: {}, dependencies: [] },
    { address: "aws_s3_bucket.logs", type: "aws_s3_bucket", name: "logs", providerId: "aws", serviceId: "s3", values: {}, dependencies: [] },
  ],
  nodes: [
    { id: "state-vpc", serviceId: "vpc", x: 0, y: 0, values: { name: "production", cidr: "10.0.0.0/16" } },
    { id: "state-api", serviceId: "ec2", x: 0, y: 0, values: { name: "api", instance_type: "m7i.large" } },
    { id: "state-logs", serviceId: "s3", x: 0, y: 0, values: { name: "logs" } },
  ],
};

test("extracts deterministic resource addresses from generated Terraform", () => {
  assert.deepEqual(
    parseGeneratedIaCResources(generatedFiles).map((resource) => resource.address),
    ["aws_iam_instance_profile.api", "aws_instance.api", "aws_vpc.production"],
  );
});

test("compares canvas, generated IaC, state, and TFwhy without mutating inputs", () => {
  const before = JSON.stringify(nodes);
  const result = reconcileArchitecture(aws, nodes, generatedFiles, statePreview, {
    counts: {},
    errored: false,
    warnings: [],
    findings: [{
      severity: "HIGH",
      address: "aws_instance.api",
      type: "aws_instance",
      action: "update",
      title: "Instance changed outside Terraform",
      stateful: false,
    }],
  });

  const instance = result.rows.find((row) => row.address === "aws_instance.api");
  assert.equal(instance?.status, "drift");
  assert.equal(instance?.state, "changed");
  assert.equal(instance?.live, "changed");
  assert.deepEqual(instance?.differences, [{ field: "Machine type", canvasValue: "t3.micro", stateValue: "m7i.large" }]);

  const stateOnly = result.rows.find((row) => row.address === "aws_s3_bucket.logs");
  assert.equal(stateOnly?.status, "untracked");
  assert.equal(stateOnly?.canvas, "missing");

  const generatedSupport = result.rows.find((row) => row.address === "aws_iam_instance_profile.api");
  assert.equal(generatedSupport?.iac, "present");
  assert.equal(result.readiness.state, true);
  assert.equal(result.readiness.live, true);
  assert.equal(JSON.stringify(nodes), before);
});

test("reports missing snapshots honestly instead of treating unknown as healthy", () => {
  const result = reconcileArchitecture(aws, nodes, generatedFiles, null, null);
  const instance = result.rows.find((row) => row.address === "aws_instance.api");
  assert.equal(instance?.status, "pending");
  assert.equal(instance?.state, "unknown");
  assert.equal(instance?.live, "unknown");
  assert.equal(result.summary.aligned, 0);
});

test("does not compare state imported from another provider", () => {
  const result = reconcileArchitecture(aws, nodes, generatedFiles, {
    ...statePreview,
    providerId: "gcp",
  }, null);
  assert.equal(result.readiness.providerMismatch, true);
  assert.ok(result.rows.every((row) => row.state === "unknown" || row.state === "not-applicable"));
});

test("never copies credential-shaped state values into reconciliation evidence", () => {
  const result = reconcileArchitecture(aws, nodes, generatedFiles, {
    ...statePreview,
    matched: statePreview.matched.map((resource, index) => index === 1
      ? { ...resource, values: { password: "do-not-expose", access_key: "also-secret" } }
      : resource),
    nodes: statePreview.nodes.map((node, index) => index === 1
      ? { ...node, values: { ...node.values, password: "do-not-expose", access_key: "also-secret" } }
      : node),
  }, null);
  assert.equal(JSON.stringify(result).includes("do-not-expose"), false);
  assert.equal(JSON.stringify(result).includes("also-secret"), false);
});
