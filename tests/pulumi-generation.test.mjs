import assert from "node:assert/strict";
import test from "node:test";
import { transform } from "esbuild";

const {
  defaultValues,
  generate,
  generatePulumi,
  providers,
} = await import("../dist/generator-test-bundle.mjs");

function fullDiagram(provider) {
  const nodes = provider.services.map((service, index) => ({
    id: `${service.id}-${index}`,
    serviceId: service.id,
    x: (index % 6) * 240,
    y: Math.floor(index / 6) * 180,
    values: defaultValues(service, index + 1),
  }));
  const network = nodes.find((node) => node.serviceId.match(/^(vpc|vnet|vcn)$/));
  const subnet = nodes.find((node) => node.serviceId === "subnet");
  const edges = [];
  nodes.forEach((node) => {
    if (network && node !== network) edges.push({ id: `network-${node.id}`, from: network.id, to: node.id });
    if (subnet && node !== subnet && node !== network) edges.push({ id: `subnet-${node.id}`, from: subnet.id, to: node.id });
  });
  return { nodes, edges };
}

for (const provider of providers) {
  test(`${provider.shortName}: emits a complete Pulumi TypeScript deployment project`, async () => {
    const { nodes, edges } = fullDiagram(provider);
    const terraform = generate(provider, nodes, edges, `${provider.shortName} Pulumi production`);
    const pulumi = generatePulumi(provider, terraform, `${provider.shortName} Pulumi production`);
    const paths = new Set(pulumi.files.map((file) => file.path));

    for (const required of [
      "Pulumi.yaml",
      "index.ts",
      "package.json",
      "tsconfig.json",
      "scripts/pulumi.mjs",
      "deploy.ps1",
      "deploy.sh",
      "README.md",
      "terraform/main.tf",
      "terraform/variables.tf",
      "terraform/outputs.tf",
      "terraform/versions.tf",
    ]) {
      assert.ok(paths.has(required), `${provider.id} bundle includes ${required}`);
    }

    assert.equal(pulumi.resourceCount, terraform.resourceCount);
    assert.equal(
      pulumi.files.filter((file) => file.path.startsWith("terraform/")).length,
      terraform.files.length,
      "the complete validated Terraform module is embedded",
    );

    const index = pulumi.files.find((file) => file.path === "index.ts").contents;
    assert.match(index, /from "@pulumi\/pulumi"/);
    assert.match(index, /from "@pulumi\/infracanvas"/);
    assert.match(index, /new infracanvas\.Module/);
    assert.doesNotMatch(index, /REPLACE_ME|set-me-from-a-secrets-manager/);
    await transform(index, { loader: "ts", format: "cjs" });

    const runner = pulumi.files.find((file) => file.path === "scripts/pulumi.mjs").contents;
    assert.match(runner, /package", "add", "terraform-module", "\.\/terraform", "infracanvas"/);
    assert.match(runner, /pulumi.*stack.*select/s);
    assert.match(runner, /\["preview", "up", "destroy"\]/);
  });
}

test("Pulumi maps sensitive Terraform inputs to encrypted stack configuration", () => {
  const provider = providers.find((item) => item.id === "aws");
  const rds = provider.services.find((service) => service.id === "rds");
  const node = {
    id: "rds",
    serviceId: "rds",
    x: 0,
    y: 0,
    values: defaultValues(rds, 1),
  };
  const terraform = generate(provider, [node], [], "sensitive database");
  const pulumi = generatePulumi(provider, terraform, "sensitive database");
  const index = pulumi.files.find((file) => file.path === "index.ts").contents;
  const example = pulumi.files.find((file) => file.path === "Pulumi.dev.yaml.example").contents;

  assert.match(index, /database_password: config\.requireSecret\("database_password"\)/);
  assert.match(example, /database_password: set-with-pulumi-config---secret/);
  assert.doesNotMatch(
    example,
    /^\s+[^#\s].*database_password:/m,
    "the example must not contain an active plaintext password entry",
  );
});
