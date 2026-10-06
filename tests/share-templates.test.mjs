import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeSharedDiagram,
  encodeSharedDiagram,
  generate,
  instantiateProductionTemplate,
  PRODUCTION_TEMPLATES,
  providers,
  shareLimits,
} from "../dist/generator-test-bundle.mjs";

test("every supported cloud has a connected, uniquely identified production template", () => {
  assert.deepEqual(
    new Set(PRODUCTION_TEMPLATES.map((template) => template.providerId)),
    new Set(["aws", "azure", "gcp", "oci"]),
  );

  for (const template of PRODUCTION_TEMPLATES) {
    const diagram = instantiateProductionTemplate(template.id);
    const provider = providers.find((item) => item.id === template.providerId);
    assert.ok(provider);
    assert.ok(diagram.nodes.length >= 12, `${template.id} should be a meaningful production architecture`);
    assert.ok(diagram.edges.length >= 10, `${template.id} should describe resource relationships`);
    assert.equal(new Set(diagram.nodes.map((node) => node.id)).size, diagram.nodes.length);
    assert.equal(new Set(diagram.edges.map((edge) => edge.id)).size, diagram.edges.length);

    const ids = new Set(diagram.nodes.map((node) => node.id));
    diagram.nodes.forEach((node) => assert.ok(provider.services.some((service) => service.id === node.serviceId)));
    diagram.edges.forEach((edge) => {
      assert.ok(ids.has(edge.from));
      assert.ok(ids.has(edge.to));
      assert.notEqual(edge.from, edge.to);
    });

    const generated = generate(provider, diagram.nodes, diagram.edges, diagram.projectName);
    assert.ok(generated.resourceCount > 0, `${template.id} should generate Terraform resources`);
  }
});

test("share links round-trip a sanitized catalog-constrained architecture", () => {
  const original = instantiateProductionTemplate("aws-secure-web-platform");
  original.nodes[0].values.password = "never-share-this";
  original.nodes[0].values.aws_access_key_id = "AKIA0000000000000000";
  original.nodes[0].values.unknown_setting = "not-in-catalog";
  const fragment = encodeSharedDiagram(original);
  const decoded = decodeSharedDiagram(fragment);

  assert.match(fragment, /^#share=[A-Za-z0-9_-]+$/);
  assert.equal(fragment.includes("never-share-this"), false);
  assert.equal(decoded.diagram.providerId, original.providerId);
  assert.equal(decoded.diagram.projectName, original.projectName);
  assert.equal(decoded.diagram.nodes.length, original.nodes.length);
  assert.equal(decoded.diagram.edges.length, original.edges.length);
  assert.equal(decoded.diagram.nodes[0].values.password, undefined);
  assert.equal(decoded.diagram.nodes[0].values.aws_access_key_id, undefined);
  assert.equal(decoded.diagram.nodes[0].values.unknown_setting, undefined);
  assert.equal(original.nodes[0].values.password, "never-share-this", "encoding must not mutate the canvas");
});

test("share decoder rejects malformed, unsupported, and oversized input", () => {
  assert.throws(() => decodeSharedDiagram("#share=not-json"), /malformed|corrupted/);
  assert.throws(() => decodeSharedDiagram(`#share=${"a".repeat(shareLimits.maxFragmentLength + 1)}`), /size limit/);
  assert.throws(() => encodeSharedDiagram({ providerId: "aws", projectName: "Empty", nodes: [], edges: [] }), /at least one resource/);
});

test("share decoder drops unknown services and their dangling connections", () => {
  const payload = {
    v: 1,
    p: "aws",
    t: "Untrusted shared payload",
    n: [
      ["vpc", 100, 100, { name: "network", password: "bad" }],
      ["invented_service", 200, 200, { name: "discard" }],
      ["ec2", 300, 300, { name: "app" }],
    ],
    e: [[0, 1], [1, 2], [0, 2], [0, 2], [2, 2]],
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const decoded = decodeSharedDiagram(`#share=${encoded}`);

  assert.deepEqual(decoded.diagram.nodes.map((node) => node.serviceId), ["vpc", "ec2"]);
  assert.equal(decoded.diagram.edges.length, 1);
  assert.equal(decoded.diagram.nodes[0].values.password, undefined);
  assert.equal(decoded.omittedValues, 1);
});
