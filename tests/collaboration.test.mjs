import assert from "node:assert/strict";
import test from "node:test";

import {
  canReview,
  createReviewPacket,
  createReviewRoom,
  createReviewVersion,
  diagramStructureDigest,
  parseReviewPacket,
  reviewPacketMarkdown,
  validateReviewText,
} from "../dist/generator-test-bundle.mjs";

const now = "2026-10-08T08:30:00.000Z";
const diagram = {
  providerId: "aws",
  projectName: "Payments platform",
  nodes: [
    { id: "node-db", serviceId: "rds", x: 400, y: 200, values: { name: "orders", password: "never-export-me" } },
    { id: "node-api", serviceId: "lambda", x: 100, y: 200, values: { name: "api", token: "also-private" } },
  ],
  edges: [{ id: "edge-1", from: "node-api", to: "node-db" }],
};

test("roles enforce the local review workflow boundary", () => {
  assert.equal(canReview("owner", "manage_members"), true);
  assert.equal(canReview("reviewer", "decide"), true);
  assert.equal(canReview("reviewer", "manage_members"), false);
  assert.equal(canReview("viewer", "comment"), false);
  assert.equal(canReview("viewer", "export"), true);
});

test("structural digests are stable and intentionally ignore configuration values", () => {
  const first = diagramStructureDigest(diagram);
  const renamed = structuredClone(diagram);
  renamed.nodes[0].values.password = "a-different-value";
  assert.equal(diagramStructureDigest(renamed), first);

  const moved = structuredClone(diagram);
  moved.nodes[0].x += 24;
  assert.notEqual(diagramStructureDigest(moved), first);
});

test("review packet exports exclude diagram configuration and secrets", () => {
  const room = createReviewRoom("Security review", "Karthik", now, "room-1");
  room.versions.push(createReviewVersion(diagram, "Baseline", room.members[0].id, now, "version-1"));
  const packet = createReviewPacket(room, diagram, now);
  const serialized = JSON.stringify(packet);

  assert.equal(serialized.includes("never-export-me"), false);
  assert.equal(serialized.includes("also-private"), false);
  assert.equal(serialized.includes('"values"'), false);
  assert.equal(packet.project.resourceCount, 2);
  assert.match(packet.project.structuralDigest, /^ic-[a-f0-9]{8}$/);
});

test("bounded parser accepts a valid packet and drops anchors absent from this canvas", () => {
  const room = createReviewRoom("Production review", "Owner", now, "room-2");
  room.comments.push({
    id: "comment-1",
    authorId: room.members[0].id,
    nodeId: "node-db",
    nodeLabel: "Orders database",
    body: "Confirm the private subnet boundary.",
    createdAt: now,
    replies: [],
  });
  const raw = JSON.stringify(createReviewPacket(room, diagram, now));
  const matched = parseReviewPacket(raw, new Set(["node-db"]));
  assert.equal(matched.room.comments[0].nodeId, "node-db");

  const orphaned = parseReviewPacket(raw, new Set(["different-node"]));
  assert.equal(orphaned.room.comments[0].nodeId, undefined);
  assert.equal(orphaned.room.comments[0].body, "Confirm the private subnet boundary.");
});

test("parser rejects credential-shaped content, unsupported roles, and oversized packets", () => {
  const room = createReviewRoom("Security review", "Owner", now, "room-3");
  const packet = createReviewPacket(room, diagram, now);

  const withSecret = structuredClone(packet);
  withSecret.room.comments.push({
    id: "comment-secret",
    authorId: room.members[0].id,
    body: "token=super-secret-value",
    createdAt: now,
    replies: [],
  });
  assert.throws(() => parseReviewPacket(JSON.stringify(withSecret)), /credential or secret/i);

  const withRole = structuredClone(packet);
  withRole.room.members[0].role = "administrator";
  assert.throws(() => parseReviewPacket(JSON.stringify(withRole)), /unsupported member role/i);
  assert.throws(() => parseReviewPacket("x".repeat(512 * 1024 + 1)), /512 KB/);
});

test("new comments reject secret-shaped input before local persistence", () => {
  assert.equal(validateReviewText("Check encryption at rest", "Comment", 2000), "Check encryption at rest");
  assert.throws(() => validateReviewText("password = hunter2-value", "Comment", 2000), /credential or secret/i);
});

test("Markdown summary is auditable without exposing configuration", () => {
  const room = createReviewRoom("Launch review", "Owner", now, "room-4");
  room.members[0].decision = "approved";
  room.comments.push({ id: "comment-2", authorId: room.members[0].id, body: "Document the rollback path.", createdAt: now, replies: [] });
  const markdown = reviewPacketMarkdown(createReviewPacket(room, diagram, now));
  assert.match(markdown, /Launch review/);
  assert.match(markdown, /Document the rollback path/);
  assert.match(markdown, /collaboration metadata only/);
  assert.equal(markdown.includes("never-export-me"), false);
});
