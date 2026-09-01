import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const { providers, defaultValues, generate, validateDiagram } =
  await import("../dist/generator-test-bundle.mjs");

const expectedMinimums = { aws: 300, azure: 630, gcp: 200 };

const majorDeployableServices = {
  aws: [
    "beanstalk",
    "eventbridge",
    "step_functions",
    "cognito",
    "opensearch",
    "redshift",
    "kinesis",
    "sagemaker",
    "bedrock",
    "cloudtrail",
    "backup_vault",
    "athena",
  ],
  azure: [
    "load_balancer",
    "container_apps_environment",
    "container_apps",
    "api_management",
    "event_hubs",
    "event_grid_topics",
    "application_insights",
    "data_factory",
    "synapse",
    "azure_openai",
    "managed_identity",
    "container_instances",
  ],
  gcp: [
    "app_engine",
    "cloud_scheduler",
    "cloud_tasks",
    "spanner",
    "bigtable",
    "cloud_build",
    "eventarc",
    "kms",
    "cloud_armor",
    "vertex_ai_endpoint",
  ],
};

for (const providerId of ["aws", "azure", "gcp"]) {
  test(`${providerId} exposes the expanded official service catalog with local artwork`, async () => {
    const provider = providers.find((item) => item.id === providerId);
    assert.ok(provider);
    assert.ok(provider.services.length >= expectedMinimums[providerId]);
    assert.equal(new Set(provider.services.map((service) => service.id)).size, provider.services.length);

    for (const service of provider.services) {
      assert.match(service.icon ?? "", /^\/cloud-icons\/(aws|azure|gcp)\//);
      await access(join(process.cwd(), "public", service.icon.slice(1)));
    }
  });
}

for (const [providerId, serviceIds] of Object.entries(majorDeployableServices)) {
  test(`${providerId} major services are configurable and emit deployable IaC`, () => {
    const provider = providers.find((item) => item.id === providerId);
    assert.ok(provider);

    for (const [index, serviceId] of serviceIds.entries()) {
      const service = provider.services.find((item) => item.id === serviceId);
      assert.ok(service, `${providerId}/${serviceId} should exist`);
      assert.equal(service.iacSupport, "deployable", `${providerId}/${serviceId} should be IaC ready`);
      assert.ok(service.fields.length > 0, `${providerId}/${serviceId} should expose inspector fields`);
      assert.match(service.docs ?? "", /^https:\/\/registry\.terraform\.io\//);

      const node = {
        id: `${providerId}-${serviceId}`,
        serviceId,
        x: 100,
        y: 100,
        values: defaultValues(service, index + 1),
      };
      const generated = generate(provider, [node], [], `${providerId} ${serviceId}`);
      assert.ok(generated.resourceCount > 0, `${providerId}/${serviceId} should emit resources`);
      assert.equal(generated.diagramOnly.length, 0);
      assert.match(
        generated.files.find((file) => file.path === "main.tf").contents,
        new RegExp(`resource \\"${service.tfType}\\"`),
      );
    }
  });
}

test("diagram-only services stay visible but never masquerade as deployable IaC", () => {
  const aws = providers.find((item) => item.id === "aws");
  const service = aws.services.find((item) => item.iacSupport === "diagram");
  assert.ok(service);
  const node = {
    id: "diagram-service",
    serviceId: service.id,
    x: 100,
    y: 100,
    values: defaultValues(service, 1),
  };

  const generated = generate(aws, [node], [], "catalog boundary");
  assert.equal(generated.resourceCount, 0);
  assert.equal(generated.diagramOnly.length, 1);
  assert.match(generated.files.find((file) => file.path === "main.tf").contents, /Diagram-only services/);

  const issues = validateDiagram(aws, [node], []);
  assert.ok(issues.some((issue) => issue.id === "diagram-only-diagram-service"));
});
