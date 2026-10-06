import { providerById, providers, serviceById } from "./catalog";
import type { DiagramEdge, DiagramNode, DiagramState, ProviderId } from "./types";

const SHARE_VERSION = 1;
const MAX_FRAGMENT_LENGTH = 32_000;
const MAX_NODES = 200;
const MAX_EDGES = 400;
const MAX_VALUE_LENGTH = 256;
const MAX_PROJECT_LENGTH = 120;
const CREDENTIAL_KEY = /(password|passwd|secret|token|credential|private.?key|access.?key|client.?secret|api.?key)/i;

type SharePayload = {
  v: 1;
  p: ProviderId;
  t: string;
  n: [string, number, number, Record<string, string>][];
  e: [number, number][];
};

export type ShareDecodeResult = {
  diagram: DiagramState;
  omittedValues: number;
};

const cleanText = (value: unknown, max: number) =>
  typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "";
const cleanCoordinate = (value: unknown) =>
  Math.max(0, Math.min(10_000, Number.isFinite(Number(value)) ? Math.round(Number(value)) : 0));

const bytesToBase64Url = (bytes: Uint8Array) => {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const base64UrlToBytes = (value: string) => {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("This share link contains invalid characters.");
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

function sanitizedValues(
  providerId: ProviderId,
  serviceId: string,
  values: Record<string, string>,
) {
  const provider = providerById(providerId);
  const service = serviceById(provider, serviceId);
  if (!service) return { values: {}, omitted: Object.keys(values).length };
  const allowed = new Set(["name", ...service.fields.map((field) => field.key)]);
  const safe: Record<string, string> = {};
  let omitted = 0;
  Object.entries(values).forEach(([key, value]) => {
    if (!allowed.has(key) || CREDENTIAL_KEY.test(key) || typeof value !== "string") {
      omitted += 1;
      return;
    }
    const clean = cleanText(value, MAX_VALUE_LENGTH);
    if (clean) safe[key] = clean;
  });
  return { values: safe, omitted };
}

export function encodeSharedDiagram(diagram: DiagramState) {
  if (diagram.nodes.length === 0) throw new Error("Add at least one resource before creating a share link.");
  if (diagram.nodes.length > MAX_NODES || diagram.edges.length > MAX_EDGES) {
    throw new Error(`Share links support up to ${MAX_NODES} resources and ${MAX_EDGES} connections.`);
  }
  const provider = providerById(diagram.providerId);
  const indexById = new Map<string, number>();
  const safeNodes: SharePayload["n"] = [];
  diagram.nodes.forEach((node) => {
    if (!serviceById(provider, node.serviceId)) return;
    indexById.set(node.id, safeNodes.length);
    const result = sanitizedValues(diagram.providerId, node.serviceId, node.values);
    safeNodes.push([node.serviceId, cleanCoordinate(node.x), cleanCoordinate(node.y), result.values]);
  });
  if (safeNodes.length === 0) throw new Error("This architecture contains no supported catalog resources.");
  const payload: SharePayload = {
    v: SHARE_VERSION,
    p: diagram.providerId,
    t: cleanText(diagram.projectName, MAX_PROJECT_LENGTH) || "Shared architecture",
    n: safeNodes,
    e: diagram.edges.flatMap((edge) => {
      const from = indexById.get(edge.from);
      const to = indexById.get(edge.to);
      return from === undefined || to === undefined || from === to ? [] : [[from, to]];
    }),
  };
  const encoded = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  if (encoded.length > MAX_FRAGMENT_LENGTH) {
    throw new Error("This architecture is too large for a reliable browser share link. Export JSON instead.");
  }
  return `#share=${encoded}`;
}

export function decodeSharedDiagram(fragment: string): ShareDecodeResult {
  const encoded = fragment.replace(/^#/, "").split("&").find((part) => part.startsWith("share="))?.slice(6) ?? "";
  if (!encoded) throw new Error("No InfraCanvas share payload was found in this link.");
  if (encoded.length > MAX_FRAGMENT_LENGTH) throw new Error("This share link exceeds the safe size limit.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(base64UrlToBytes(encoded)));
  } catch {
    throw new Error("This share link is malformed or corrupted.");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("This share link has an invalid payload.");
  const payload = parsed as Partial<SharePayload>;
  const candidateProvider = payload.p;
  if (payload.v !== SHARE_VERSION || !providers.some((provider) => provider.id === candidateProvider)) {
    throw new Error("This share link uses an unsupported InfraCanvas format or cloud provider.");
  }
  if (!Array.isArray(payload.n) || !Array.isArray(payload.e) || payload.n.length === 0) {
    throw new Error("This share link does not contain a usable architecture.");
  }
  if (payload.n.length > MAX_NODES || payload.e.length > MAX_EDGES) {
    throw new Error("This shared architecture exceeds the safe resource limits.");
  }
  const providerId = candidateProvider as ProviderId;
  const provider = providerById(providerId);
  let omittedValues = 0;
  const sourceToOutput = new Map<number, number>();
  const nodes: DiagramNode[] = [];
  payload.n.forEach((entry, sourceIndex) => {
    if (!Array.isArray(entry) || typeof entry[0] !== "string") return;
    if (!serviceById(provider, entry[0])) return;
    const rawValues = entry[3] && typeof entry[3] === "object" && !Array.isArray(entry[3])
      ? entry[3] as Record<string, string>
      : {};
    const sanitized = sanitizedValues(providerId, entry[0], rawValues);
    omittedValues += sanitized.omitted;
    sourceToOutput.set(sourceIndex, nodes.length);
    nodes.push({
      id: `shared-${nodes.length + 1}`,
      serviceId: entry[0],
      x: cleanCoordinate(entry[1]),
      y: cleanCoordinate(entry[2]),
      values: sanitized.values,
    });
  });
  if (nodes.length === 0) throw new Error("This share link contains no supported catalog resources.");
  const seen = new Set<string>();
  const edges: DiagramEdge[] = [];
  payload.e.forEach((entry) => {
    if (!Array.isArray(entry)) return;
    const fromIndex = sourceToOutput.get(Number(entry[0]));
    const toIndex = sourceToOutput.get(Number(entry[1]));
    if (fromIndex === undefined || toIndex === undefined || fromIndex === toIndex) return;
    const key = `${fromIndex}:${toIndex}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ id: `shared-edge-${edges.length + 1}`, from: nodes[fromIndex].id, to: nodes[toIndex].id });
  });
  return {
    diagram: {
      providerId,
      projectName: cleanText(payload.t, MAX_PROJECT_LENGTH) || "Shared architecture",
      nodes,
      edges,
    },
    omittedValues,
  };
}

export const shareLimits = {
  maxFragmentLength: MAX_FRAGMENT_LENGTH,
  maxNodes: MAX_NODES,
  maxEdges: MAX_EDGES,
};
