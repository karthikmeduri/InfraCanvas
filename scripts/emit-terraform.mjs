#!/usr/bin/env node
/**
 * Emit a full-catalog Terraform bundle per provider so the output can be run
 * through the real toolchain:
 *
 *   node scripts/emit-terraform.mjs            # all providers -> dist/emitted
 *   node scripts/emit-terraform.mjs aws        # one provider
 *
 * Then, per directory:
 *   tofu init -backend=false && tofu validate
 *
 * `npm test` already gates on `tofu fmt`; this script is for the heavier
 * schema-level check against downloaded providers.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bundlePath = join(root, "dist", "generator-test-bundle.mjs");

// Reuse the same bundle the test suite builds. The JavaScript API is
// cross-platform; invoking esbuild's native executable through Node is not.
await build({
  entryPoints: [join(root, "build", "test-entry", "generator.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: bundlePath,
  logLevel: "info",
});

const { providers, generate, defaultValues } = await import(
  `file:///${bundlePath.replace(/\\/g, "/")}?t=${Date.now()}`
);

const requested = process.argv.slice(2);
const selected = requested.length
  ? providers.filter((provider) => requested.includes(provider.id))
  : providers;

if (selected.length === 0) {
  console.error(`No matching provider. Available: ${providers.map((p) => p.id).join(", ")}`);
  process.exit(1);
}

for (const provider of selected) {
  const nodes = provider.services.map((service, index) => ({
    id: `${service.id}-${index}`,
    serviceId: service.id,
    x: (index % 6) * 240,
    y: Math.floor(index / 6) * 200,
    values: defaultValues(service, index + 1),
  }));

  const network = nodes.find((node) => /^(vpc|vnet|vcn)$/.test(node.serviceId));
  const subnet = nodes.find((node) => node.serviceId === "subnet");
  const edges = [];
  for (const node of nodes) {
    if (network && node !== network) {
      edges.push({ id: `net-${node.id}`, from: network.id, to: node.id });
    }
    if (subnet && node !== subnet && node !== network) {
      edges.push({ id: `sub-${node.id}`, from: subnet.id, to: node.id });
    }
  }

  const result = generate(provider, nodes, edges, `${provider.shortName} full catalog`);
  const outDir = join(root, "dist", "emitted", provider.id);
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  for (const file of result.files) {
    await writeFile(join(outDir, file.path), file.contents, "utf8");
  }

  console.log(
    `${provider.shortName.padEnd(6)} ${String(result.resourceCount).padStart(3)} resources  ${result.unresolved.length} unresolved refs  ->  ${outDir}`,
  );
}
