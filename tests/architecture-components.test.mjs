import assert from "node:assert/strict";
import test from "node:test";

import {
  componentPackageJson,
  componentParameterCandidates,
  createComponentVersion,
  instantiateComponentVersion,
  latestComponentVersion,
  mergeImportedComponent,
  nextPatchVersion,
  parseComponentPackage,
  providers,
  upsertComponentPackage,
} from "../dist/generator-test-bundle.mjs";

const aws = providers.find((provider) => provider.id === "aws");
const providerFor = (id) => providers.find((provider) => provider.id === id);
const createdAt = "2026-10-10T08:30:00.000Z";

const nodes = [
  { id: "vpc-a", serviceId: "vpc", x: 400, y: 200, values: { name: "platform-vpc", cidr: "10.0.0.0/16", password: "must-never-export" } },
  { id: "subnet-a", serviceId: "subnet", x: 680, y: 200, values: { name: "private-app", cidr: "10.0.1.0/24", availability_zone: "a", visibility: "private" } },
  { id: "ec2-a", serviceId: "ec2", x: 960, y: 200, values: { name: "web", instance_type: "t3.micro", count: "2", monitoring: "true", api_key: "must-never-export" } },
];
const edges = [
  { id: "edge-1", from: "vpc-a", to: "subnet-a" },
  { id: "edge-2", from: "subnet-a", to: "ec2-a" },
  { id: "external", from: "ec2-a", to: "outside-node" },
];

const makeVersion = (version = "1.0.0") => createComponentVersion({
  provider: aws,
  selectedNodes: nodes,
  diagramEdges: edges,
  version,
  changelog: "Initial private web tier",
  parameterTargets: new Set(["subnet-a:cidr", "ec2-a:instance_type", "ec2-a:count", "ec2-a:name"]),
  createdAt,
});

test("capture keeps internal topology, relative positions, and redacted catalog values", () => {
  const version = makeVersion();
  assert.equal(version.nodes.length, 3);
  assert.equal(version.edges.length, 2);
  assert.deepEqual(version.nodes.map(({ x, y }) => [x, y]), [[0, 0], [280, 0], [560, 0]]);
  const serialized = JSON.stringify(version);
  assert.equal(serialized.includes("must-never-export"), false);
  assert.equal(serialized.includes("password"), false);
  assert.equal(serialized.includes("api_key"), false);
  assert.match(version.digest, /^ic-component-[a-f0-9]{8}$/);
});

test("parameter candidates and saved contracts use catalog-derived types", () => {
  const candidates = componentParameterCandidates(aws, nodes);
  assert.equal(candidates.find((candidate) => candidate.target === "ec2-a:count")?.type, "number");
  assert.equal(candidates.find((candidate) => candidate.target === "ec2-a:monitoring")?.type, "boolean");
  assert.equal(candidates.find((candidate) => candidate.target === "ec2-a:instance_type")?.type, "enum");
  assert.equal(candidates.find((candidate) => candidate.target === "ec2-a:name")?.type, "string");
  const version = makeVersion();
  assert.equal(version.parameters.find((parameter) => parameter.fieldKey === "cidr")?.type, "string");
  assert.equal(version.parameters.find((parameter) => parameter.fieldKey === "instance_type")?.type, "enum");
  assert.equal(version.parameters.find((parameter) => parameter.fieldKey === "count")?.type, "number");
  assert.equal(version.parameters.find((parameter) => parameter.fieldKey === "name")?.type, "string");
});

test("versions are immutable and must advance semantic versioning", () => {
  const first = makeVersion();
  const library = upsertComponentPackage([], { id: "private-web-tier", name: "Private web tier", description: "VPC, subnet, and compute", providerId: "aws" }, first);
  assert.equal(nextPatchVersion("1.2.9"), "1.2.10");
  assert.throws(() => upsertComponentPackage(library, { ...library[0] }, makeVersion("1.0.0")), /already exists and is immutable/i);
  assert.throws(() => upsertComponentPackage(library, { ...library[0] }, makeVersion("0.9.0")), /greater than 1.0.0/i);
  const updated = upsertComponentPackage(library, { ...library[0] }, makeVersion("1.0.1"));
  assert.equal(updated[0].versions.length, 2);
  assert.equal(latestComponentVersion(updated[0]).version, "1.0.1");
});

test("instantiation creates fresh ids and validates typed overrides", () => {
  const version = makeVersion();
  const component = upsertComponentPackage([], { id: "private-web-tier", name: "Private web tier", description: "", providerId: "aws" }, version)[0];
  const count = version.parameters.find((parameter) => parameter.fieldKey === "count");
  const machine = version.parameters.find((parameter) => parameter.fieldKey === "instance_type");
  const instance = instantiateComponentVersion(component, version, { [count.id]: "4", [machine.id]: machine.options[0] }, { x: 100, y: 300 }, "instance-a");
  assert.equal(new Set(instance.nodes.map((node) => node.id)).size, 3);
  assert.equal(instance.nodes[0].x, 100);
  assert.equal(instance.nodes.find((node) => node.serviceId === "ec2").values.count, "4");
  assert.ok(instance.edges.every((edge) => edge.from.startsWith("instance-a-") && edge.to.startsWith("instance-a-")));
  assert.throws(() => instantiateComponentVersion(component, version, { [count.id]: "many" }, { x: 0, y: 0 }, "bad"), /must be a number/i);
  assert.throws(() => instantiateComponentVersion(component, version, { [machine.id]: "not-a-real-option" }, { x: 0, y: 0 }, "bad"), /allowed option/i);
});

test("package parser allowlists catalog structure and enforces integrity", () => {
  const version = makeVersion();
  const component = upsertComponentPackage([], { id: "private-web-tier", name: "Private web tier", description: "Safe reusable tier", providerId: "aws" }, version)[0];
  const parsed = parseComponentPackage(componentPackageJson(component), providerFor);
  assert.equal(parsed.versions[0].digest, version.digest);

  const tampered = structuredClone(component);
  tampered.versions[0].nodes[0].x = 999;
  assert.throws(() => parseComponentPackage(JSON.stringify(tampered), providerFor), /integrity check/i);

  const rewrittenHistory = structuredClone(component);
  rewrittenHistory.versions[0].changelog = "Unreviewed replacement";
  assert.throws(() => parseComponentPackage(JSON.stringify(rewrittenHistory), providerFor), /integrity check/i);

  const unknown = structuredClone(component);
  unknown.versions[0].nodes[0].serviceId = "made-up-service";
  assert.throws(() => parseComponentPackage(JSON.stringify(unknown), providerFor), /not an allowed/i);
  assert.throws(() => parseComponentPackage("x".repeat(1024 * 1024 + 1), providerFor), /1 MB safety limit/i);
});

test("import merge rejects a conflicting immutable version", () => {
  const version = makeVersion();
  const local = upsertComponentPackage([], { id: "private-web-tier", name: "Private web tier", description: "", providerId: "aws" }, version);
  const conflicting = structuredClone(local[0]);
  conflicting.versions[0].digest = "ic-component-deadbeef";
  assert.throws(() => mergeImportedComponent(local, conflicting), /conflicts with an immutable local version/i);
});
