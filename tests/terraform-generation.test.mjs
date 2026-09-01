import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const { providers } = await import("../dist/generator-test-bundle.mjs");
const { SAMPLE_ARCHITECTURES, SAMPLE_EDGES } = await import("../dist/generator-test-bundle.mjs");
const { generate } = await import("../dist/generator-test-bundle.mjs");
const { defaultValues } = await import("../dist/generator-test-bundle.mjs");

/** Put every service of a provider on the canvas and chain them together. */
function fullDiagram(provider) {
  const nodes = provider.services.map((service, index) => ({
    id: `${service.id}-${index}`,
    serviceId: service.id,
    x: (index % 6) * 240,
    y: Math.floor(index / 6) * 200,
    values: defaultValues(service, index + 1),
  }));

  // Connect every non-foundational node to the network and the first subnet so
  // the graph resolver has real edges to work with.
  const network = nodes.find((node) => node.serviceId.match(/^(vpc|vnet|vcn)$/));
  const subnet = nodes.find((node) => node.serviceId === "subnet");
  const edges = [];
  nodes.forEach((node) => {
    if (network && node !== network) {
      edges.push({ id: `e-net-${node.id}`, from: network.id, to: node.id });
    }
    if (subnet && node !== subnet && node !== network) {
      edges.push({ id: `e-sub-${node.id}`, from: subnet.id, to: node.id });
    }
  });

  return { nodes, edges };
}

const HCL_TOOL = resolveHclTool();

function resolveHclTool() {
  for (const candidate of ["tofu", "terraform"]) {
    const probe = spawnSync(candidate, ["version"], { encoding: "utf8", shell: true });
    if (probe.status === 0) return candidate;
  }
  return null;
}

for (const provider of providers) {
  test(`${provider.shortName}: every service emits parseable HCL`, async () => {
    const { nodes, edges } = fullDiagram(provider);
    const result = generate(provider, nodes, edges, "test project");

    const hclFiles = result.files.filter((file) => file.language === "hcl");
    assert.ok(hclFiles.length >= 6, "expected the standard Terraform file set");

    for (const file of hclFiles) {
      // HCL requires one argument per line — a semicolon between arguments is
      // the exact bug that made the first generator emit unparseable output.
      const offending = file.contents
        .split("\n")
        .filter((line) => /=\s*[^"#]*;\s*\S/.test(line) && !line.trim().startsWith("#"));
      assert.deepEqual(
        offending,
        [],
        `${provider.id}/${file.path} has semicolon-separated arguments`,
      );

      const opens = (file.contents.match(/\{/g) ?? []).length;
      const closes = (file.contents.match(/\}/g) ?? []).length;
      assert.equal(opens, closes, `${provider.id}/${file.path} has unbalanced braces`);
    }

    assert.ok(result.resourceCount > 0, "expected at least one resource");
  });

  test(`${provider.shortName}: connected diagram wires real references`, () => {
    const { nodes, edges } = fullDiagram(provider);
    const result = generate(provider, nodes, edges, "test project");
    const main = result.files.find((file) => file.path === "main.tf").contents;

    const networkType = { aws: "aws_vpc", azure: "azurerm_virtual_network", gcp: "google_compute_network", oci: "oci_core_vcn" }[
      provider.id
    ];
    assert.match(
      main,
      new RegExp(`${networkType}\\.[a-z0-9_]+\\.(id|name)`),
      "subnets should reference the diagram's network resource, not a placeholder",
    );
    assert.doesNotMatch(main, /= null\b/, "no null placeholders should survive generation");
  });
}

test("disconnected resources fall back to declared input variables", () => {
  const provider = providers.find((item) => item.id === "aws");
  const ec2 = provider.services.find((service) => service.id === "ec2");
  const nodes = [
    { id: "a", serviceId: "ec2", x: 0, y: 0, values: defaultValues(ec2, 1) },
  ];
  const result = generate(provider, nodes, [], "orphan");
  const variables = result.files.find((file) => file.path === "variables.tf").contents;

  assert.ok(result.unresolved.length > 0, "an orphaned instance should report unresolved refs");
  for (const fallback of new Set(result.unresolved.map((item) => item.variable))) {
    assert.match(
      variables,
      new RegExp(`variable "${fallback}"`),
      `fallback variable ${fallback} must be declared in variables.tf`,
    );
  }
});

test("AWS secure reference architecture is complete and wires protected private tiers", () => {
  const provider = providers.find((item) => item.id === "aws");
  const layout = SAMPLE_ARCHITECTURES.aws;
  const nodes = layout.map((entry, index) => {
    const service = provider.services.find((item) => item.id === entry.serviceId);
    return {
      id: `${entry.serviceId}-${index}`,
      serviceId: entry.serviceId,
      x: entry.x,
      y: entry.y,
      values: { ...defaultValues(service, index + 1), ...entry.values },
    };
  });
  const edges = SAMPLE_EDGES.aws.map(([from, to], index) => ({
    id: `sample-edge-${index}`,
    from: nodes[from].id,
    to: nodes[to].id,
  }));
  const categories = new Set(
    nodes.map(
      (node) => provider.services.find((service) => service.id === node.serviceId).category,
    ),
  );

  assert.deepEqual(
    [...categories].sort(),
    [...new Set(provider.services.filter((service) => service.iacSupport !== "diagram").map((service) => service.category))].sort(),
    "the reference should demonstrate every resource category",
  );

  const result = generate(provider, nodes, edges, "secure production reference");
  const main = result.files.find((file) => file.path === "main.tf").contents;

  assert.match(main, /resource "aws_lb_target_group" "web_targets"/);
  assert.match(main, /resource "aws_lb_target_group_attachment" "web_fleet"/);
  assert.match(main, /resource "aws_wafv2_web_acl_association" "edge_waf"/);
  assert.match(main, /associate_public_ip_address\s+= false/);
  assert.match(main, /publicly_accessible\s+= false/);
  assert.match(main, /multi_az\s+= true/);
  assert.match(main, /endpoint_public_access\s+= false/);
  assert.doesNotMatch(
    main,
    /security_groups\s+= \[[^\]]*aws_wafv2_web_acl/,
    "a WAF web ACL must not be emitted as a VPC security-group id",
  );
});

test("every cloud ships a complete production reference architecture", () => {
  for (const provider of providers) {
    const layout = SAMPLE_ARCHITECTURES[provider.id];
    const nodes = layout.map((entry, index) => {
      const service = provider.services.find((item) => item.id === entry.serviceId);
      assert.ok(service, `${provider.id} sample uses a catalog service: ${entry.serviceId}`);
      return {
        id: `${entry.serviceId}-${index}`,
        serviceId: entry.serviceId,
        x: entry.x,
        y: entry.y,
        values: { ...defaultValues(service, index + 1), ...entry.values },
      };
    });
    const edges = SAMPLE_EDGES[provider.id].map(([from, to], index) => {
      assert.ok(nodes[from], `${provider.id} sample edge ${index} has a source`);
      assert.ok(nodes[to], `${provider.id} sample edge ${index} has a target`);
      return { id: `sample-edge-${index}`, from: nodes[from].id, to: nodes[to].id };
    });
    const expectedCategories = [
      ...new Set(
        provider.services
          .filter((service) => service.iacSupport !== "diagram")
          .map((service) => service.category),
      ),
    ].sort();
    const sampleCategories = [
      ...new Set(
        nodes.map(
          (node) =>
            provider.services.find((service) => service.id === node.serviceId).category,
        ),
      ),
    ].sort();

    assert.deepEqual(
      sampleCategories,
      expectedCategories,
      `${provider.shortName} sample demonstrates every available category`,
    );
    assert.ok(nodes.length >= 18, `${provider.shortName} sample is production-scale`);
    assert.ok(edges.length >= nodes.length, `${provider.shortName} sample has meaningful wiring`);

    const result = generate(provider, nodes, edges, `${provider.shortName} production reference`);
    assert.equal(result.unresolved.length, 0, `${provider.shortName} sample resolves every reference`);
  }
});

test(HCL_TOOL ? `${HCL_TOOL} fmt accepts the generated files` : "hcl formatter check (skipped)", async (t) => {
  if (!HCL_TOOL) {
    t.skip("neither tofu nor terraform is on PATH");
    return;
  }

  for (const provider of providers) {
    const { nodes, edges } = fullDiagram(provider);
    const result = generate(provider, nodes, edges, "fmt check");
    const dir = join(tmpdir(), `infracanvas-fmt-${provider.id}`);
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });

    for (const file of result.files.filter((item) => item.language === "hcl")) {
      await writeFile(join(dir, file.path), file.contents, "utf8");
    }

    const fmt = spawnSync(HCL_TOOL, ["fmt", "-check", "-list=true", dir], {
      encoding: "utf8",
      shell: true,
    });
    assert.equal(
      fmt.status,
      0,
      `${provider.id} failed ${HCL_TOOL} fmt:\n${fmt.stdout}\n${fmt.stderr}`,
    );
    await rm(dir, { recursive: true, force: true });
  }
});
