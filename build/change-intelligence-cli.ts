import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { providerById } from "../lib/catalog";
import {
  architectureChangeMarkdown,
  compareArchitectureSnapshots,
  emptyArchitectureSnapshot,
  parseArchitectureSnapshot,
  type ArchitectureSnapshot,
} from "../lib/change-intelligence";
import { diagramToSvg } from "../lib/export-diagram";

const MAX_FILE_BYTES = 5 * 1024 * 1024;

const argument = (name: string) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const basePath = argument("--base");
const headPath = argument("--head");
const outputPath = resolve(argument("--out") ?? "architecture-review");

if (!basePath || !headPath) {
  throw new Error("Usage: change-intelligence --base <snapshot> --head <snapshot> [--out <directory>]");
}

async function load(path: string): Promise<ArchitectureSnapshot | null> {
  if (!existsSync(path)) return null;
  const contents = await readFile(path, "utf8");
  if (Buffer.byteLength(contents, "utf8") > MAX_FILE_BYTES) throw new Error(`${path} exceeds the 5 MB review limit.`);
  return parseArchitectureSnapshot(JSON.parse(contents) as unknown);
}

const [loadedBase, loadedHead] = await Promise.all([load(basePath), load(headPath)]);
if (!loadedBase && !loadedHead) throw new Error("Neither architecture snapshot exists.");
const base = loadedBase ?? emptyArchitectureSnapshot(loadedHead!.providerId, loadedHead!.projectName);
const head = loadedHead ?? emptyArchitectureSnapshot(loadedBase!.providerId, loadedBase!.projectName);
const report = compareArchitectureSnapshots(base, head);
const markdown = architectureChangeMarkdown(report);
const provider = providerById(report.providerId);

await mkdir(outputPath, { recursive: true });
await Promise.all([
  writeFile(resolve(outputPath, "report.md"), markdown, "utf8"),
  writeFile(resolve(outputPath, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8"),
  writeFile(resolve(outputPath, "before.svg"), diagramToSvg(provider, base.nodes, base.edges, `${base.projectName} · before`, "dark"), "utf8"),
  writeFile(resolve(outputPath, "after.svg"), diagramToSvg(provider, head.nodes, head.edges, `${head.projectName} · after`, "dark"), "utf8"),
]);

process.stdout.write(markdown);
