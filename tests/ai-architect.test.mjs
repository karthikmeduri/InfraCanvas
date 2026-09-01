import assert from "node:assert/strict";
import test from "node:test";

import {
  createLocalArchitectureDraft,
  normalizeArchitecturePlan,
  providers,
  removeDiagramEdge,
} from "../dist/generator-test-bundle.mjs";

test("AI fallback drafts only use deployable catalog resources", () => {
  for (const provider of providers) {
    const plan = createLocalArchitectureDraft(
      provider,
      "A secure production Kubernetes application with PostgreSQL, Redis, a queue, private storage, secrets, and monitoring",
    );
    const serviceIds = new Set(provider.services.filter((service) => service.iacSupport !== "diagram").map((service) => service.id));

    assert.equal(plan.source, "local");
    assert.ok(plan.nodes.length >= 8, `${provider.id} should produce a useful production draft`);
    assert.ok(plan.edges.length > 0, `${provider.id} should connect the draft`);
    plan.nodes.forEach((node) => assert.ok(serviceIds.has(node.serviceId), `${provider.id}:${node.serviceId} must be deployable`));
    plan.edges.forEach((edge) => {
      assert.ok(edge.from >= 0 && edge.from < plan.nodes.length);
      assert.ok(edge.to >= 0 && edge.to < plan.nodes.length);
      assert.notEqual(edge.from, edge.to);
    });
  }
});

test("AI plan normalization rejects unknown services, diagram-only services, and unknown values", () => {
  const provider = providers.find((item) => item.id === "aws");
  assert.ok(provider);
  const diagramOnly = provider.services.find((service) => service.iacSupport === "diagram");
  const deployable = provider.services.find((service) => service.iacSupport !== "diagram");
  assert.ok(diagramOnly);
  assert.ok(deployable);

  const knownKey = deployable.fields[0]?.key;
  const plan = normalizeArchitecturePlan(provider, {
    title: "Untrusted response",
    nodes: [
      {
        serviceId: deployable.id,
        name: "valid-resource",
        configuration: [
          ...(knownKey ? [{ key: knownKey, value: "review-me" }] : []),
          { key: "not_a_real_field", value: "discard-me" },
        ],
      },
      { serviceId: diagramOnly.id, name: "diagram-only" },
      { serviceId: "invented_cloud_service", name: "unknown" },
    ],
    edges: [
      { from: 0, to: 1, reason: "invalid filtered endpoint" },
      { from: 0, to: 0, reason: "self loop" },
    ],
  });

  assert.equal(plan.nodes.length, 1);
  assert.equal(plan.nodes[0].serviceId, deployable.id);
  assert.equal(plan.nodes[0].values.not_a_real_field, undefined);
  if (knownKey) assert.equal(plan.nodes[0].values[knownKey], "review-me");
  assert.deepEqual(plan.edges, []);
});

test("removing a selected connection keeps resources and every other connection", () => {
  const document = {
    nodes: [
      { id: "a", serviceId: "one", x: 0, y: 0, values: { name: "a" } },
      { id: "b", serviceId: "two", x: 1, y: 1, values: { name: "b" } },
      { id: "c", serviceId: "three", x: 2, y: 2, values: { name: "c" } },
    ],
    edges: [
      { id: "edge-ab", from: "a", to: "b" },
      { id: "edge-bc", from: "b", to: "c" },
    ],
  };

  const next = removeDiagramEdge(document, "edge-ab");
  assert.deepEqual(next.nodes, document.nodes);
  assert.deepEqual(next.edges, [{ id: "edge-bc", from: "b", to: "c" }]);
  assert.equal(document.edges.length, 2, "the helper must not mutate the current history entry");
});
