import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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

  // React separates adjacent text nodes with comment markers; strip them so
  // assertions can read the copy the user actually sees.
  const html = (await response.text()).replaceAll("<!-- -->", "");
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

  // Provider cards advertise the real catalog size and Terraform provider.
  assert.match(html, /hashicorp\/aws/);
  assert.match(html, /\d+ services/);

  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("applies the stored theme before first paint", async () => {
  const response = await render();
  const html = await response.text();
  assert.match(html, /prefers-color-scheme: dark/);
  assert.match(html, /data-theme/);
});

test("ships product code rather than starter scaffolding", async () => {
  const [page, layout, globals, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /"use client"/);
  assert.match(page, /application\/infracanvas-service/);
  assert.match(page, /localStorage/);
  assert.match(page, /resumeSavedDraft/);
  assert.match(page, /Saved session found/);
  assert.match(page, /Load saved session/);
  assert.match(page, /Start new session/);
  assert.match(page, /applyProvider\(nextId, false\)/);
  assert.doesNotMatch(page, /session-choice|Choose how to begin/);
  assert.match(page, /--edge-color/);
  assert.match(page, /onClick=\{openValidation\}/);
  assert.match(page, /focusValidationIssue/);
  assert.match(page, /id="architecture-validation"/);
  assert.match(page, /CANVAS_PAN_PADDING/);
  assert.match(page, /canvas\.scrollLeft = pan\.scrollLeft/);
  assert.match(page, /canvas\.scrollTop = pan\.scrollTop/);
  assert.match(page, /CANVAS_WIDTH \* zoom - canvas\.clientWidth/);
  assert.match(page, /CANVAS_HEIGHT \* zoom - canvas\.clientHeight/);
  assert.match(page, /beginCanvasPan\(event\.pointerId/);
  assert.match(page, /className="canvas-overlays"/);
  assert.match(
    globals,
    /\.canvas-stage\s*\{[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/s,
  );
  assert.match(globals, /\.canvas-badge\s*\{[^}]*position:\s*absolute;/s);
  assert.match(page, /className="empty-canvas empty-canvas-overlay"/);
  assert.match(page, /Load real-world example architecture/);
  assert.match(page, /Load example architecture/);
  assert.match(page, /Start with blank canvas/);
  assert.match(page, /Back to canvas/);
  assert.match(page, /const CANVAS_PAN_PADDING = 0/);
  assert.match(page, /getData\("text\/plain"\)/);
  assert.match(page, /setData\("text\/plain", service\.id\)/);
  assert.match(page, /A stale scroll position must never make a successful drop/);
  assert.match(page, /@\/lib\/terraform\/generate/);
  assert.match(layout, /InfraCanvas — Visual Cloud Architecture to Terraform/);
  assert.doesNotMatch(layout, /Starter Project|codex-preview|_sites-preview/);
  assert.match(packageJson, /"name": "infracanvas"/);

  await assert.rejects(
    readFile(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)),
  );
});

test("no source file contains a credential-shaped literal", async () => {
  const files = [
    "../app/page.tsx",
    "../lib/hcl.ts",
    "../lib/terraform/generate.ts",
    "../lib/catalog/aws.ts",
    "../lib/catalog/azure.ts",
    "../lib/catalog/gcp.ts",
    "../lib/catalog/oci.ts",
  ];

  for (const relative of files) {
    const contents = await readFile(new URL(relative, import.meta.url), "utf8");
    assert.doesNotMatch(contents, /AKIA[0-9A-Z]{16}/, `${relative} has an AWS key id`);
    assert.doesNotMatch(
      contents,
      /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
      `${relative} has a private key`,
    );
    // Credentials must always be Terraform variable references, never literals.
    assert.doesNotMatch(
      contents,
      /(admin_password|administrator_login_password|administrator_password)",\s*str\(/,
      `${relative} inlines a password literal instead of a sensitive variable`,
    );
  }
});
