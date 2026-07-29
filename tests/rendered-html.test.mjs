import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the InfraCanvas builder", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(
    html,
    /<title>InfraCanvas — Visual Cloud Architecture to Terraform<\/title>/i,
  );
  assert.match(html, /Where are you building\?/);
  assert.match(html, /Amazon Web Services/);
  assert.match(html, /Microsoft Azure/);
  assert.match(html, /Google Cloud/);
  assert.match(html, /Oracle Cloud Infrastructure/);
  assert.match(html, /Generate Terraform/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("ships product metadata and no disposable starter preview", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /"use client"/);
  assert.match(page, /generateTerraform/);
  assert.match(page, /application\/infracanvas-service/);
  assert.match(page, /localStorage/);
  assert.match(layout, /InfraCanvas — Visual Cloud Architecture to Terraform/);
  assert.doesNotMatch(layout, /Starter Project|codex-preview|_sites-preview/);
  assert.match(packageJson, /"name": "infracanvas"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);

  await assert.rejects(readFile(new URL("../app/_sites-preview/SkeletonPreview.tsx", templateRoot)));
});
