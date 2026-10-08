import type { DiagramState, ProviderId } from "./types";

export const REVIEW_PACKET_KIND = "infracanvas-review-packet";
export const REVIEW_STORAGE_KEY = "infracanvas.review-room.v1";
export const MAX_REVIEW_PACKET_BYTES = 512 * 1024;

export type ReviewRole = "owner" | "reviewer" | "viewer";
export type ReviewDecision = "pending" | "approved" | "changes_requested";

export type ReviewMember = {
  id: string;
  name: string;
  role: ReviewRole;
  decision: ReviewDecision;
  addedAt: string;
};

export type ReviewReply = {
  id: string;
  authorId: string;
  body: string;
  createdAt: string;
};

export type ReviewComment = {
  id: string;
  authorId: string;
  nodeId?: string;
  nodeLabel?: string;
  body: string;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  replies: ReviewReply[];
};

export type ReviewVersion = {
  id: string;
  label: string;
  authorId: string;
  createdAt: string;
  resourceCount: number;
  connectionCount: number;
  structuralDigest: string;
};

export type ReviewActivity = {
  id: string;
  actorId: string;
  action: string;
  createdAt: string;
};

export type ReviewRoom = {
  schemaVersion: 1;
  id: string;
  name: string;
  createdAt: string;
  members: ReviewMember[];
  comments: ReviewComment[];
  versions: ReviewVersion[];
  activity: ReviewActivity[];
};

export type ReviewPacket = {
  kind: typeof REVIEW_PACKET_KIND;
  schemaVersion: 1;
  exportedAt: string;
  project: {
    name: string;
    providerId: ProviderId;
    resourceCount: number;
    connectionCount: number;
    structuralDigest: string;
  };
  room: ReviewRoom;
};

type Permission = "manage_members" | "capture_version" | "comment" | "resolve" | "decide" | "export";

const ROLE_PERMISSIONS: Record<ReviewRole, ReadonlySet<Permission>> = {
  owner: new Set(["manage_members", "capture_version", "comment", "resolve", "decide", "export"]),
  reviewer: new Set(["capture_version", "comment", "resolve", "decide", "export"]),
  viewer: new Set(["export"]),
};

const PROVIDERS = new Set<ProviderId>(["aws", "azure", "gcp", "oci"]);
const ROLES = new Set<ReviewRole>(["owner", "reviewer", "viewer"]);
const DECISIONS = new Set<ReviewDecision>(["pending", "approved", "changes_requested"]);
const SECRET_PATTERN = /(?:AKIA|ASIA)[A-Z0-9]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:password|passwd|secret|token|api[_-]?key|client[_-]?secret)\s*[:=]\s*[^\s,;]{6,}/i;

const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Review packet must contain JSON objects.");
  return value as Record<string, unknown>;
};

const text = (value: unknown, field: string, max = 160): string => {
  if (typeof value !== "string") throw new Error(`${field} must be text.`);
  const clean = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  if (!clean) throw new Error(`${field} cannot be empty.`);
  if (clean.length > max) throw new Error(`${field} is longer than ${max} characters.`);
  if (SECRET_PATTERN.test(clean)) throw new Error(`${field} appears to contain a credential or secret.`);
  return clean;
};

/** Validate user-authored collaboration text before it enters local storage. */
export const validateReviewText = (value: unknown, field: string, max = 160) =>
  text(value, field, max);

const optionalText = (value: unknown, field: string, max = 160): string | undefined =>
  value === undefined ? undefined : text(value, field, max);

const isoDate = (value: unknown, field: string): string => {
  const candidate = text(value, field, 40);
  if (!Number.isFinite(Date.parse(candidate))) throw new Error(`${field} must be an ISO date.`);
  return candidate;
};

const boundedArray = (value: unknown, field: string, max: number): unknown[] => {
  if (!Array.isArray(value)) throw new Error(`${field} must be a list.`);
  if (value.length > max) throw new Error(`${field} exceeds the ${max}-item safety limit.`);
  return value;
};

const finiteCount = (value: unknown, field: string): number => {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 100_000) {
    throw new Error(`${field} must be a safe non-negative integer.`);
  }
  return value as number;
};

const fnv1a = (value: string) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `ic-${(hash >>> 0).toString(16).padStart(8, "0")}`;
};

export const canReview = (role: ReviewRole, permission: Permission) =>
  ROLE_PERMISSIONS[role].has(permission);

export const diagramStructureDigest = (diagram: DiagramState) => {
  const nodes = diagram.nodes
    .map(({ id, serviceId, x, y }) => ({ id, serviceId, x: Math.round(x), y: Math.round(y) }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const edges = diagram.edges
    .map(({ id, from, to }) => ({ id, from, to }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return fnv1a(JSON.stringify({ providerId: diagram.providerId, nodes, edges }));
};

export const createReviewRoom = (
  name: string,
  ownerName: string,
  now: string,
  id: string,
): ReviewRoom => ({
  schemaVersion: 1,
  id: text(id, "Room id", 80),
  name: text(name, "Room name", 80),
  createdAt: isoDate(now, "Created at"),
  members: [{
    id: `${id}-owner`,
    name: text(ownerName, "Owner name", 80),
    role: "owner",
    decision: "pending",
    addedAt: now,
  }],
  comments: [],
  versions: [],
  activity: [{ id: `${id}-created`, actorId: `${id}-owner`, action: "created the review room", createdAt: now }],
});

export const createReviewVersion = (
  diagram: DiagramState,
  label: string,
  authorId: string,
  now: string,
  id: string,
): ReviewVersion => ({
  id: text(id, "Version id", 80),
  label: text(label, "Version label", 80),
  authorId: text(authorId, "Version author", 80),
  createdAt: isoDate(now, "Version date"),
  resourceCount: diagram.nodes.length,
  connectionCount: diagram.edges.length,
  structuralDigest: diagramStructureDigest(diagram),
});

export const createReviewPacket = (
  room: ReviewRoom,
  diagram: DiagramState,
  exportedAt: string,
): ReviewPacket => ({
  kind: REVIEW_PACKET_KIND,
  schemaVersion: 1,
  exportedAt: isoDate(exportedAt, "Exported at"),
  project: {
    name: text(diagram.projectName, "Project name", 120),
    providerId: diagram.providerId,
    resourceCount: diagram.nodes.length,
    connectionCount: diagram.edges.length,
    structuralDigest: diagramStructureDigest(diagram),
  },
  room,
});

export const parseReviewPacket = (raw: string, currentNodeIds: ReadonlySet<string> = new Set()): ReviewPacket => {
  if (new TextEncoder().encode(raw).byteLength > MAX_REVIEW_PACKET_BYTES) {
    throw new Error("Review packet exceeds the 512 KB safety limit.");
  }
  if (SECRET_PATTERN.test(raw)) throw new Error("Review packet appears to contain a credential or secret.");

  let root: Record<string, unknown>;
  try {
    root = record(JSON.parse(raw));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("Review packet is not valid JSON.");
    throw error;
  }
  if (root.kind !== REVIEW_PACKET_KIND || root.schemaVersion !== 1) {
    throw new Error("This is not a supported InfraCanvas review packet.");
  }

  const projectInput = record(root.project);
  if (!PROVIDERS.has(projectInput.providerId as ProviderId)) throw new Error("Review packet has an unsupported provider.");
  const roomInput = record(root.room);
  if (roomInput.schemaVersion !== 1) throw new Error("Review room schema is unsupported.");

  const memberIds = new Set<string>();
  const members = boundedArray(roomInput.members, "Members", 50).map((item, index): ReviewMember => {
    const input = record(item);
    const id = text(input.id, `Member ${index + 1} id`, 80);
    if (memberIds.has(id)) throw new Error("Review packet contains duplicate member ids.");
    memberIds.add(id);
    if (!ROLES.has(input.role as ReviewRole)) throw new Error("Review packet contains an unsupported member role.");
    if (!DECISIONS.has(input.decision as ReviewDecision)) throw new Error("Review packet contains an unsupported decision.");
    return {
      id,
      name: text(input.name, `Member ${index + 1} name`, 80),
      role: input.role as ReviewRole,
      decision: input.decision as ReviewDecision,
      addedAt: isoDate(input.addedAt, `Member ${index + 1} date`),
    };
  });
  if (!members.some((member) => member.role === "owner")) throw new Error("Review room must have an owner.");

  const parseAuthor = (value: unknown, field: string) => {
    const id = text(value, field, 80);
    if (!memberIds.has(id)) throw new Error(`${field} does not match a room member.`);
    return id;
  };

  const comments = boundedArray(roomInput.comments, "Comments", 500).map((item, index): ReviewComment => {
    const input = record(item);
    const nodeId = optionalText(input.nodeId, `Comment ${index + 1} node`, 120);
    const anchorValid = !nodeId || currentNodeIds.size === 0 || currentNodeIds.has(nodeId);
    const replies = boundedArray(input.replies, `Comment ${index + 1} replies`, 100).map((reply, replyIndex): ReviewReply => {
      const child = record(reply);
      return {
        id: text(child.id, `Reply ${replyIndex + 1} id`, 80),
        authorId: parseAuthor(child.authorId, `Reply ${replyIndex + 1} author`),
        body: text(child.body, `Reply ${replyIndex + 1}`, 1200),
        createdAt: isoDate(child.createdAt, `Reply ${replyIndex + 1} date`),
      };
    });
    return {
      id: text(input.id, `Comment ${index + 1} id`, 80),
      authorId: parseAuthor(input.authorId, `Comment ${index + 1} author`),
      ...(anchorValid && nodeId ? { nodeId, nodeLabel: optionalText(input.nodeLabel, `Comment ${index + 1} label`, 120) } : {}),
      body: text(input.body, `Comment ${index + 1}`, 2000),
      createdAt: isoDate(input.createdAt, `Comment ${index + 1} date`),
      ...(input.resolvedAt ? {
        resolvedAt: isoDate(input.resolvedAt, `Comment ${index + 1} resolution date`),
        resolvedBy: parseAuthor(input.resolvedBy, `Comment ${index + 1} resolver`),
      } : {}),
      replies,
    };
  });

  const versions = boundedArray(roomInput.versions, "Versions", 100).map((item, index): ReviewVersion => {
    const input = record(item);
    return {
      id: text(input.id, `Version ${index + 1} id`, 80),
      label: text(input.label, `Version ${index + 1} label`, 80),
      authorId: parseAuthor(input.authorId, `Version ${index + 1} author`),
      createdAt: isoDate(input.createdAt, `Version ${index + 1} date`),
      resourceCount: finiteCount(input.resourceCount, `Version ${index + 1} resources`),
      connectionCount: finiteCount(input.connectionCount, `Version ${index + 1} connections`),
      structuralDigest: text(input.structuralDigest, `Version ${index + 1} digest`, 40),
    };
  });

  const activity = boundedArray(roomInput.activity, "Activity", 1000).map((item, index): ReviewActivity => {
    const input = record(item);
    return {
      id: text(input.id, `Activity ${index + 1} id`, 80),
      actorId: parseAuthor(input.actorId, `Activity ${index + 1} actor`),
      action: text(input.action, `Activity ${index + 1} action`, 200),
      createdAt: isoDate(input.createdAt, `Activity ${index + 1} date`),
    };
  });

  return {
    kind: REVIEW_PACKET_KIND,
    schemaVersion: 1,
    exportedAt: isoDate(root.exportedAt, "Exported at"),
    project: {
      name: text(projectInput.name, "Project name", 120),
      providerId: projectInput.providerId as ProviderId,
      resourceCount: finiteCount(projectInput.resourceCount, "Project resources"),
      connectionCount: finiteCount(projectInput.connectionCount, "Project connections"),
      structuralDigest: text(projectInput.structuralDigest, "Project digest", 40),
    },
    room: {
      schemaVersion: 1,
      id: text(roomInput.id, "Room id", 80),
      name: text(roomInput.name, "Room name", 80),
      createdAt: isoDate(roomInput.createdAt, "Room created at"),
      members,
      comments,
      versions,
      activity,
    },
  };
};

export const reviewPacketMarkdown = (packet: ReviewPacket) => {
  const open = packet.room.comments.filter((comment) => !comment.resolvedAt);
  const decisions = packet.room.members.filter((member) => member.role !== "viewer");
  return [
    `# ${packet.room.name}`,
    "",
    `**Project:** ${packet.project.name} · ${packet.project.providerId.toUpperCase()}`,
    `**Structure:** ${packet.project.resourceCount} resources · ${packet.project.connectionCount} connections · \`${packet.project.structuralDigest}\``,
    `**Open review threads:** ${open.length}`,
    "",
    "## Decisions",
    "",
    ...decisions.map((member) => `- ${member.name} (${member.role}): ${member.decision.replace("_", " ")}`),
    "",
    "## Open comments",
    "",
    ...(open.length ? open.map((comment) => `- ${comment.nodeLabel ? `**${comment.nodeLabel}:** ` : ""}${comment.body}`) : ["No open comments."]),
    "",
    "> This portable summary contains collaboration metadata only. It excludes resource configuration, generated code, state, inventory, and credentials.",
    "",
  ].join("\n");
};
