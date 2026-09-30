import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { generateAwsConnectionBundle } from "../dist/generator-test-bundle.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist", "emitted-secure-connect");
const bundle = generateAwsConnectionBundle({
  requestId: "55f4e098-d449-4b72-a1d8-5ad3d625fc2e",
  connectionName: "CI validation",
  accountId: "123456789012",
  roleName: "InfraCanvasReadOnly",
  oidcProviderArn: "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com",
  issuerUrl: "https://token.actions.githubusercontent.com",
  subject: "repo:example/infracanvas:environment:production",
  audience: "sts.amazonaws.com",
  sessionMinutes: 30,
  regions: ["us-east-1", "us-west-2"],
});

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of bundle.files) {
  await writeFile(path.join(output, file.path), file.contents, "utf8");
}
console.log(`Emitted ${bundle.files.length} secure-connect files to ${output}`);
