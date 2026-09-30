import assert from "node:assert/strict";
import test from "node:test";

import {
  AWS_INVENTORY_PERMISSION_COUNT,
  generateAwsConnectionBundle,
  validateAwsConnectionDraft,
} from "../dist/generator-test-bundle.mjs";

const validDraft = () => ({
  requestId: "55f4e098-d449-4b72-a1d8-5ad3d625fc2e",
  connectionName: "Production inventory",
  accountId: "123456789012",
  roleName: "InfraCanvasReadOnly",
  oidcProviderArn: "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com",
  issuerUrl: "https://token.actions.githubusercontent.com",
  subject: "repo:example/infracanvas:environment:production",
  audience: "sts.amazonaws.com",
  sessionMinutes: 30,
  regions: ["us-east-1", "us-west-2"],
});

test("secure connection bundle is short-lived, exact, and read-only", () => {
  const draft = validDraft();
  const before = structuredClone(draft);
  const bundle = generateAwsConnectionBundle(draft);

  assert.deepEqual(draft, before, "generation must not mutate the connection draft");
  assert.equal(bundle.manifest.spec.authentication.sessionDurationSeconds, 1800);
  assert.equal(bundle.manifest.spec.authentication.roleArn, "arn:aws:iam::123456789012:role/InfraCanvasReadOnly");
  assert.equal(bundle.manifest.spec.storage, "session-only");
  assert.equal(bundle.manifest.status.phase, "prepared");
  assert.equal(bundle.manifest.status.liveExchangeAvailable, false);
  assert.equal(bundle.permissionCount, AWS_INVENTORY_PERMISSION_COUNT);

  const trust = JSON.parse(bundle.files.find((file) => file.path === "trust-policy.json").contents);
  const condition = trust.Statement[0].Condition.StringEquals;
  assert.equal(condition["token.actions.githubusercontent.com:sub"], draft.subject);
  assert.equal(condition["token.actions.githubusercontent.com:aud"], draft.audience);
  assert.equal(trust.Statement[0].Action, "sts:AssumeRoleWithWebIdentity");

  const permissions = bundle.files.find((file) => file.path === "inventory-policy.json").contents;
  assert.doesNotMatch(permissions, /GetSecretValue|GetParameter|GetObject|Put|Create|Delete|Update/i);
  assert.match(permissions, /ec2:Describe\*/);
  assert.match(permissions, /aws:RequestedRegion/);
});

test("connection validation refuses wildcard trust and account confusion", () => {
  const draft = validDraft();
  draft.subject = "repo:example/*";
  draft.oidcProviderArn = "arn:aws:iam::123456789012:oidc-provider/attacker.example/token.actions.githubusercontent.com";

  const issues = validateAwsConnectionDraft(draft);
  assert.ok(issues.some((issue) => issue.field === "subject"));
  assert.ok(issues.some((issue) => issue.field === "oidcProviderArn"));
  assert.throws(() => generateAwsConnectionBundle(draft));
});

test("connection validation rejects secret material and unsafe issuers", () => {
  const credentialDraft = validDraft();
  credentialDraft.connectionName = "secret_access_key=do-not-store-this-value";
  assert.ok(validateAwsConnectionDraft(credentialDraft).some((issue) => issue.message.includes("not accepted")));

  for (const issuerUrl of [
    "http://issuer.example.com",
    "https://localhost:4443",
    "https://127.0.0.1/oidc",
    "https://issuer.example.com?redirect=https://attacker.example",
  ]) {
    const draft = validDraft();
    draft.issuerUrl = issuerUrl;
    assert.ok(validateAwsConnectionDraft(draft).some((issue) => issue.field === "issuerUrl"), issuerUrl);
  }
});

test("generated packet contains no credential fields or browser persistence", () => {
  const bundle = generateAwsConnectionBundle(validDraft());
  const serialized = JSON.stringify({
    manifest: bundle.manifest,
    files: bundle.files.filter((file) => file.path !== "README.md"),
  });
  assert.doesNotMatch(serialized, /access[_ -]?key|secret[_ -]?key|session[_ -]?token|private[_ -]?key/i);
  assert.doesNotMatch(serialized, /localStorage|indexedDB/i);
  assert.match(serialized, /session-only/);
});
