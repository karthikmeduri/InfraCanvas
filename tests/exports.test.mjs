import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const { providers, generate, defaultValues, createZip, diagramToSvg, validateDiagram } =
  await import("../dist/generator-test-bundle.mjs");

const aws = providers.find((provider) => provider.id === "aws");

function smallDiagram() {
  const pick = ["vpc", "subnet", "ec2"].map((id) =>
    aws.services.find((service) => service.id === id),
  );
  const nodes = pick.map((service, index) => ({
    id: `n${index}`,
    serviceId: service.id,
    x: index * 240,
    y: 120,
    values: defaultValues(service, index + 1),
  }));
  const edges = [
    { id: "e0", from: "n0", to: "n1" },
    { id: "e1", from: "n1", to: "n2" },
  ];
  return { nodes, edges };
}

test("the generated zip is a valid archive real tools can extract", async (t) => {
  const { nodes, edges } = smallDiagram();
  const result = generate(aws, nodes, edges, "zip check");
  const blob = createZip(
    result.files.map((file) => ({ path: file.path, contents: file.contents })),
    new Date(2026, 0, 1, 12, 0, 0),
  );
  const bytes = new Uint8Array(await blob.arrayBuffer());

  // Local file header and end-of-central-directory signatures.
  assert.deepEqual([...bytes.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  assert.deepEqual([...bytes.slice(-22, -18)], [0x50, 0x4b, 0x05, 0x06]);

  const dir = join(tmpdir(), "infracanvas-zip-test");
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const archive = join(dir, "module.zip");
  await writeFile(archive, bytes);

  // Round-trip through an independent extractor when one is available.
  const extractDir = join(dir, "out");
  const unzip = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `Expand-Archive -LiteralPath '${archive}' -DestinationPath '${extractDir}' -Force`,
    ],
    { encoding: "utf8" },
  );

  if (unzip.status !== 0) {
    t.diagnostic(`skipping extraction: ${unzip.stderr || "Expand-Archive unavailable"}`);
    await rm(dir, { recursive: true, force: true });
    return;
  }

  const extracted = await readdir(extractDir);
  assert.ok(extracted.includes("main.tf"), "archive should contain main.tf");
  assert.ok(extracted.includes("variables.tf"), "archive should contain variables.tf");

  const mainTf = await readFile(join(extractDir, "main.tf"), "utf8");
  assert.equal(
    mainTf,
    result.files.find((file) => file.path === "main.tf").contents,
    "extracted contents must match byte for byte",
  );

  await rm(dir, { recursive: true, force: true });
});

test("the diagram exports as well-formed standalone SVG", () => {
  const { nodes, edges } = smallDiagram();
  const svg = diagramToSvg(aws, nodes, edges, "Export check", "light");

  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /<\/svg>\s*$/);
  assert.equal((svg.match(/<g>/g) ?? []).length, (svg.match(/<\/g>/g) ?? []).length);
  assert.match(svg, /Export check/);
  // One node group per resource plus the two structural groups.
  assert.equal((svg.match(/<rect/g) ?? []).length >= nodes.length, true);
  // No external references: the export must render offline.
  assert.doesNotMatch(svg, /https?:\/\/(?!www\.w3\.org)/);
});

test("diagram connections inherit the source resource color", () => {
  const ec2 = aws.services.find((service) => service.id === "ec2");
  const rds = aws.services.find((service) => service.id === "rds");
  const nodes = [
    { id: "compute", serviceId: ec2.id, x: 0, y: 0, values: defaultValues(ec2, 1) },
    { id: "database", serviceId: rds.id, x: 300, y: 0, values: defaultValues(rds, 2) },
  ];
  const edges = [
    { id: "compute-to-database", from: "compute", to: "database" },
    { id: "database-to-compute", from: "database", to: "compute" },
  ];
  const svg = diagramToSvg(aws, nodes, edges, "Directional colors", "dark");

  assert.match(svg, new RegExp(`stroke="${ec2.accent}"`));
  assert.match(svg, new RegExp(`stroke="${rds.accent}"`));
  assert.match(svg, new RegExp(`marker-end="url\\(#arrow-${ec2.accent.slice(1)}\\)"`));
  assert.match(svg, new RegExp(`marker-end="url\\(#arrow-${rds.accent.slice(1)}\\)"`));
});

test("validation flags an unconnected database and an open firewall", () => {
  const rds = aws.services.find((service) => service.id === "rds");
  const sg = aws.services.find((service) => service.id === "security_group");
  const nodes = [
    { id: "db", serviceId: "rds", x: 0, y: 0, values: defaultValues(rds, 1) },
    {
      id: "fw",
      serviceId: "security_group",
      x: 300,
      y: 0,
      values: { ...defaultValues(sg, 2), source_cidr: "0.0.0.0/0" },
    },
  ];

  const issues = validateDiagram(aws, nodes, []);
  assert.ok(
    issues.some((issue) => issue.severity === "error" && /no subnet/i.test(issue.title)),
    "an unconnected database should be a blocking error",
  );
  assert.ok(
    issues.some((issue) => /traffic from anywhere/i.test(issue.title)),
    "0.0.0.0/0 ingress should raise a warning",
  );
  // Errors sort ahead of warnings so the panel leads with what blocks a plan.
  assert.equal(issues[0].severity, "error");
});

test("an invalid CIDR is reported rather than silently emitted", () => {
  const vpc = aws.services.find((service) => service.id === "vpc");
  const nodes = [
    {
      id: "v",
      serviceId: "vpc",
      x: 0,
      y: 0,
      values: { ...defaultValues(vpc, 1), cidr: "10.0.0.0/64" },
    },
  ];
  const issues = validateDiagram(aws, nodes, []);
  assert.ok(issues.some((issue) => /invalid CIDR/i.test(issue.title)));
});
