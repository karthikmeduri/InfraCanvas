import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parseStateFile, stateLensSupportedTypes } from "../dist/generator-test-bundle.mjs";

const fixture = (name) => readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

test("StateLens converts raw Terraform state into an AWS diagram", async () => {
  const result = parseStateFile(await fixture("terraform-state.json"));
  assert.equal(result.source, "terraform-state");
  assert.equal(result.providerId, "aws");
  assert.equal(result.nodes.length, 5);
  assert.equal(result.unsupported.length, 1);
  assert.ok(result.edges.length >= 5);
  const instance = result.nodes.find((node) => node.serviceId === "ec2");
  assert.equal(instance?.values.instance_type, "m7i.large");
  assert.equal(Object.values(instance?.values ?? {}).includes("must-not-import"), false);
});

test("StateLens converts a Pulumi stack export into a GCP diagram", async () => {
  const result = parseStateFile(await fixture("pulumi-stack.json"));
  assert.equal(result.source, "pulumi-stack");
  assert.equal(result.providerId, "gcp");
  assert.equal(result.nodes.length, 4);
  assert.equal(result.edges.length, 3);
  const instance = result.nodes.find((node) => node.serviceId === "compute");
  assert.equal(instance?.values.machine_type, "n2-standard-4");
  assert.equal(Object.values(instance?.values ?? {}).includes("must-not-import"), false);
});

test("StateLens rejects malformed and unrecognized state files", () => {
  assert.throws(() => parseStateFile("not-json"), /not valid JSON/);
  assert.throws(() => parseStateFile('{"hello":"world"}'), /could not recognize/);
});

test("StateLens exposes the full Terraform catalog as importable types", () => {
  const supported = stateLensSupportedTypes();
  assert.ok(supported.length >= 70);
  assert.ok(supported.some((item) => item.tfType === "aws_instance"));
  assert.ok(supported.some((item) => item.tfType === "azurerm_kubernetes_cluster"));
  assert.ok(supported.some((item) => item.tfType === "google_sql_database_instance"));
  assert.ok(supported.some((item) => item.tfType === "oci_core_instance"));
});
