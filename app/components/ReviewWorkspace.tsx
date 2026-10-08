"use client";

import { useMemo, useRef, useState } from "react";

import {
  canReview,
  createReviewRoom,
  createReviewVersion,
  type ReviewDecision,
  type ReviewMember,
  type ReviewRole,
  type ReviewRoom,
  validateReviewText,
} from "@/lib/collaboration";
import type { DiagramState } from "@/lib/types";

type Anchor = { id: string; label: string };

type Props = {
  room: ReviewRoom | null;
  diagram: DiagramState;
  anchors: Anchor[];
  onRoomChange: (room: ReviewRoom | null) => void;
  onBack: () => void;
  onExportJson: () => void;
  onExportMarkdown: () => void;
  onImport: (file: File) => void;
  onFocusNode: (nodeId: string) => void;
  onNotify: (message: string) => void;
};

const stamp = () => new Date().toISOString();
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

const decisionCopy: Record<ReviewDecision, string> = {
  pending: "Pending",
  approved: "Approved",
  changes_requested: "Changes requested",
};

const roleCopy: Record<ReviewRole, string> = {
  owner: "Owner",
  reviewer: "Reviewer",
  viewer: "Viewer",
};

export function ReviewWorkspace({
  room,
  diagram,
  anchors,
  onRoomChange,
  onBack,
  onExportJson,
  onExportMarkdown,
  onImport,
  onFocusNode,
  onNotify,
}: Props) {
  const [ownerName, setOwnerName] = useState("");
  const [roomName, setRoomName] = useState(`${diagram.projectName} review`);
  const [activeMemberId, setActiveMemberId] = useState("");
  const [memberName, setMemberName] = useState("");
  const [memberRole, setMemberRole] = useState<ReviewRole>("reviewer");
  const [versionLabel, setVersionLabel] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [commentAnchor, setCommentAnchor] = useState("");
  const [replyByComment, setReplyByComment] = useState<Record<string, string>>({});
  const [commentFilter, setCommentFilter] = useState<"open" | "resolved" | "all">("open");
  const [error, setError] = useState("");
  const importRef = useRef<HTMLInputElement>(null);

  const activeMember = room?.members.find((member) => member.id === activeMemberId) ?? room?.members[0];
  const membersById = useMemo(
    () => new Map((room?.members ?? []).map((member) => [member.id, member])),
    [room?.members],
  );
  const visibleComments = (room?.comments ?? []).filter((comment) =>
    commentFilter === "all" ? true : commentFilter === "resolved" ? Boolean(comment.resolvedAt) : !comment.resolvedAt,
  );
  const openCount = room?.comments.filter((comment) => !comment.resolvedAt).length ?? 0;
  const approvals = room?.members.filter((member) => member.decision === "approved").length ?? 0;

  const mutate = (update: (current: ReviewRoom) => ReviewRoom) => {
    if (room) onRoomChange(update(room));
  };

  const activity = (actor: ReviewMember, action: string) => ({
    id: uid("activity"),
    actorId: actor.id,
    action,
    createdAt: stamp(),
  });

  const createRoom = () => {
    setError("");
    try {
      const now = stamp();
      const next = createReviewRoom(roomName, ownerName, now, uid("room"));
      onRoomChange(next);
      setActiveMemberId(next.members[0].id);
      onNotify("Review room created locally");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create the review room.");
    }
  };

  const addMember = () => {
    if (!room || !activeMember || !canReview(activeMember.role, "manage_members")) return;
    setError("");
    try {
      const name = validateReviewText(memberName, "Member name", 80);
      if (room.members.some((member) => member.name.toLowerCase() === name.toLowerCase())) {
        throw new Error("That member is already in this review room.");
      }
      const now = stamp();
      const member: ReviewMember = { id: uid("member"), name, role: memberRole, decision: "pending", addedAt: now };
      mutate((current) => ({
        ...current,
        members: [...current.members, member],
        activity: [...current.activity.slice(-998), activity(activeMember, `added ${name} as ${roleCopy[memberRole].toLowerCase()}`)],
      }));
      setMemberName("");
      onNotify(`${name} added to the review`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to add this member.");
    }
  };

  const captureVersion = () => {
    if (!room || !activeMember || !canReview(activeMember.role, "capture_version")) return;
    setError("");
    try {
      const label = versionLabel.trim() || `Review ${room.versions.length + 1}`;
      const version = createReviewVersion(diagram, label, activeMember.id, stamp(), uid("version"));
      mutate((current) => ({
        ...current,
        versions: [...current.versions.slice(-98), version],
        activity: [...current.activity.slice(-998), activity(activeMember, `captured version “${version.label}”`)],
      }));
      setVersionLabel("");
      onNotify("Structural version captured without configuration values");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to capture this version.");
    }
  };

  const addComment = () => {
    if (!room || !activeMember || !canReview(activeMember.role, "comment")) return;
    setError("");
    try {
      const body = validateReviewText(commentBody, "Comment", 2000);
      const anchor = anchors.find((item) => item.id === commentAnchor);
      mutate((current) => ({
        ...current,
        comments: [...current.comments, {
          id: uid("comment"),
          authorId: activeMember.id,
          ...(anchor ? { nodeId: anchor.id, nodeLabel: anchor.label } : {}),
          body,
          createdAt: stamp(),
          replies: [],
        }],
        activity: [...current.activity.slice(-998), activity(activeMember, anchor ? `commented on ${anchor.label}` : "started a project review thread")],
      }));
      setCommentBody("");
      onNotify("Review comment added");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to add this comment.");
    }
  };

  const addReply = (commentId: string) => {
    if (!room || !activeMember || !canReview(activeMember.role, "comment")) return;
    setError("");
    try {
      const body = validateReviewText(replyByComment[commentId], "Reply", 1200);
      mutate((current) => ({
        ...current,
        comments: current.comments.map((comment) => comment.id === commentId ? {
          ...comment,
          replies: [...comment.replies, { id: uid("reply"), authorId: activeMember.id, body, createdAt: stamp() }],
        } : comment),
        activity: [...current.activity.slice(-998), activity(activeMember, "replied to a review thread")],
      }));
      setReplyByComment((current) => ({ ...current, [commentId]: "" }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to add this reply.");
    }
  };

  const toggleResolved = (commentId: string) => {
    if (!room || !activeMember || !canReview(activeMember.role, "resolve")) return;
    const target = room.comments.find((comment) => comment.id === commentId);
    if (!target) return;
    const resolving = !target.resolvedAt;
    mutate((current) => ({
      ...current,
      comments: current.comments.map((comment) => comment.id === commentId ? {
        ...comment,
        ...(resolving ? { resolvedAt: stamp(), resolvedBy: activeMember.id } : { resolvedAt: undefined, resolvedBy: undefined }),
      } : comment),
      activity: [...current.activity.slice(-998), activity(activeMember, `${resolving ? "resolved" : "reopened"} a review thread`)],
    }));
  };

  const setDecision = (decision: ReviewDecision) => {
    if (!room || !activeMember || !canReview(activeMember.role, "decide")) return;
    mutate((current) => ({
      ...current,
      members: current.members.map((member) => member.id === activeMember.id ? { ...member, decision } : member),
      activity: [...current.activity.slice(-998), activity(activeMember, `marked the review ${decisionCopy[decision].toLowerCase()}`)],
    }));
    onNotify(`Review marked ${decisionCopy[decision].toLowerCase()}`);
  };

  if (!room) {
    return (
      <section className="review-page" aria-labelledby="review-title">
        <header className="review-header">
          <div>
            <button className="back-design-button" onClick={onBack} aria-label="Return to canvas"><span aria-hidden="true">←</span></button>
            <span className="review-mark" aria-hidden="true"><i /><i /><i /></span>
            <span><small>LOCAL-FIRST COLLABORATION</small><h2 id="review-title">Review Room</h2></span>
          </div>
          <button className="review-secondary-button" onClick={() => importRef.current?.click()}>Import review packet</button>
        </header>
        <input ref={importRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) onImport(file); event.target.value = ""; }} />
        <div className="review-privacy-strip"><span className="review-lock" aria-hidden="true" /><p><strong>Private by default.</strong> This room stays in your browser. Portable packets exclude diagram values, generated code, cloud state, inventory, and credentials.</p></div>
        <div className="review-onboarding">
          <section className="review-hero-card">
            <span className="review-eyebrow">ARCHITECTURE REVIEW, WITHOUT A BACKEND</span>
            <h3>Turn a diagram into a decision trail.</h3>
            <p>Capture structural versions, anchor feedback to resources, collect approvals, and hand off a bounded review packet for asynchronous review.</p>
            <div className="review-feature-row">
              <span><i className="review-dot violet" />Resource comments</span>
              <span><i className="review-dot emerald" />Approval trail</span>
              <span><i className="review-dot amber" />Redacted versions</span>
            </div>
          </section>
          <section className="review-create-card">
            <div><small>START A REVIEW</small><h3>Create a local review room</h3></div>
            <label>Room name<input value={roomName} maxLength={80} onChange={(event) => setRoomName(event.target.value)} /></label>
            <label>Your display name<input value={ownerName} maxLength={80} placeholder="e.g. Karthik" onChange={(event) => setOwnerName(event.target.value)} /></label>
            {error && <p className="review-error" role="alert">{error}</p>}
            <button className="review-primary-button" onClick={createRoom}>Create Review Room</button>
            <small className="review-boundary">Workflow roles in this local slice are labels, not authentication or hosted access control.</small>
          </section>
        </div>
      </section>
    );
  }

  return (
    <section className="review-page" aria-labelledby="review-title">
      <header className="review-header">
        <div>
          <button className="back-design-button" onClick={onBack} aria-label="Return to canvas"><span aria-hidden="true">←</span></button>
          <span className="review-mark" aria-hidden="true"><i /><i /><i /></span>
          <span><small>REVIEW ROOM · BROWSER LOCAL</small><h2 id="review-title">{room.name}</h2></span>
        </div>
        <div className="review-header-actions">
          <label className="review-identity">Acting as<select value={activeMember?.id ?? ""} onChange={(event) => setActiveMemberId(event.target.value)}>{room.members.map((member) => <option key={member.id} value={member.id}>{member.name} · {roleCopy[member.role]}</option>)}</select></label>
          <button className="review-secondary-button" onClick={onExportMarkdown}>Export summary</button>
          <button className="review-primary-button compact" onClick={onExportJson}>Export packet</button>
          <button className="review-icon-button" onClick={() => importRef.current?.click()} aria-label="Import review packet" title="Import review packet"><span aria-hidden="true">↥</span></button>
        </div>
      </header>
      <input ref={importRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) onImport(file); event.target.value = ""; }} />
      <div className="review-privacy-strip"><span className="review-lock" aria-hidden="true" /><p><strong>No secrets in review packets.</strong> Only collaboration metadata and structural digests are portable.</p></div>

      <div className="review-summary-grid">
        <article><small>OPEN THREADS</small><strong>{openCount}</strong><span>{room.comments.length} total</span></article>
        <article><small>APPROVALS</small><strong>{approvals}</strong><span>of {room.members.filter((member) => member.role !== "viewer").length} decision makers</span></article>
        <article><small>VERSIONS</small><strong>{room.versions.length}</strong><span>structural snapshots</span></article>
        <article><small>CURRENT CANVAS</small><strong>{diagram.nodes.length}</strong><span>{diagram.edges.length} connections</span></article>
      </div>

      {error && <p className="review-error floating" role="alert">{error}<button onClick={() => setError("")} aria-label="Dismiss error">×</button></p>}

      <div className="review-layout">
        <aside className="review-members-panel">
          <header><small>PEOPLE & DECISIONS</small><span>{room.members.length}</span></header>
          <div className="review-member-list">
            {room.members.map((member) => <article key={member.id} className={member.id === activeMember?.id ? "active" : ""}>
              <span className="review-avatar" aria-hidden="true">{member.name.slice(0, 2).toUpperCase()}</span>
              <div><strong>{member.name}</strong><small>{roleCopy[member.role]}</small></div>
              <span className={`review-decision ${member.decision}`}>{decisionCopy[member.decision]}</span>
            </article>)}
          </div>
          {activeMember && canReview(activeMember.role, "manage_members") && <div className="review-add-member">
            <label>Add teammate<input value={memberName} maxLength={80} placeholder="Display name" onChange={(event) => setMemberName(event.target.value)} /></label>
            <div><select value={memberRole} onChange={(event) => setMemberRole(event.target.value as ReviewRole)} aria-label="New member role"><option value="reviewer">Reviewer</option><option value="viewer">Viewer</option><option value="owner">Owner</option></select><button onClick={addMember}>Add</button></div>
          </div>}
          <p className="review-role-note"><span aria-hidden="true">i</span> Roles coordinate this portable workflow. They do not replace authenticated server-side authorization.</p>
        </aside>

        <main className="review-discussion-panel">
          <header>
            <div><small>REVIEW THREADS</small><h3>Architecture feedback</h3></div>
            <div className="review-filter" role="group" aria-label="Filter comments">{(["open", "resolved", "all"] as const).map((filter) => <button key={filter} className={commentFilter === filter ? "active" : ""} onClick={() => setCommentFilter(filter)} aria-pressed={commentFilter === filter}>{filter}</button>)}</div>
          </header>
          {activeMember && canReview(activeMember.role, "comment") && <section className="review-composer">
            <div className="review-avatar" aria-hidden="true">{activeMember.name.slice(0, 2).toUpperCase()}</div>
            <div><textarea value={commentBody} maxLength={2000} placeholder="Add an actionable architecture review comment…" onChange={(event) => setCommentBody(event.target.value)} /><footer><select value={commentAnchor} onChange={(event) => setCommentAnchor(event.target.value)} aria-label="Attach comment to a resource"><option value="">Whole architecture</option>{anchors.map((anchor) => <option key={anchor.id} value={anchor.id}>{anchor.label}</option>)}</select><span>{commentBody.length}/2000</span><button onClick={addComment}>Add comment</button></footer></div>
          </section>}
          <div className="review-thread-list">
            {visibleComments.length === 0 ? <div className="review-empty"><span className="review-empty-icon" aria-hidden="true"><i /><i /></span><strong>No {commentFilter === "all" ? "" : commentFilter} threads yet.</strong><p>Anchor feedback to a resource or review the architecture as a whole.</p></div> : visibleComments.map((comment) => {
              const author = membersById.get(comment.authorId);
              return <article className={`review-thread ${comment.resolvedAt ? "resolved" : ""}`} key={comment.id}>
                <header><span className="review-avatar" aria-hidden="true">{author?.name.slice(0, 2).toUpperCase() ?? "?"}</span><div><strong>{author?.name ?? "Former member"}</strong><small>{new Date(comment.createdAt).toLocaleString()}</small></div>{comment.nodeId && <button className="review-anchor" onClick={() => onFocusNode(comment.nodeId!)}><span aria-hidden="true">⌖</span>{comment.nodeLabel ?? "Canvas resource"}</button>}{comment.resolvedAt && <span className="review-resolved-pill">Resolved</span>}</header>
                <p>{comment.body}</p>
                {comment.replies.map((reply) => { const replyAuthor = membersById.get(reply.authorId); return <div className="review-reply" key={reply.id}><strong>{replyAuthor?.name ?? "Former member"}</strong><span>{reply.body}</span><small>{new Date(reply.createdAt).toLocaleString()}</small></div>; })}
                <footer>{activeMember && canReview(activeMember.role, "comment") && <><input value={replyByComment[comment.id] ?? ""} maxLength={1200} placeholder="Reply…" aria-label="Reply to thread" onChange={(event) => setReplyByComment((current) => ({ ...current, [comment.id]: event.target.value }))} /><button onClick={() => addReply(comment.id)}>Reply</button></>}{activeMember && canReview(activeMember.role, "resolve") && <button className="review-resolve-button" onClick={() => toggleResolved(comment.id)}>{comment.resolvedAt ? "Reopen" : "Resolve"}</button>}</footer>
              </article>;
            })}
          </div>
        </main>

        <aside className="review-versions-panel">
          <header><small>VERSIONS & AUDIT</small><span className="review-live-dot">Live canvas</span></header>
          {activeMember && canReview(activeMember.role, "capture_version") && <div className="review-capture"><input value={versionLabel} maxLength={80} placeholder={`Review ${room.versions.length + 1}`} onChange={(event) => setVersionLabel(event.target.value)} /><button onClick={captureVersion}>Capture version</button><small>Stores topology and counts only—never configuration values.</small></div>}
          <div className="review-version-list">{[...room.versions].reverse().map((version) => <article key={version.id}><span className="review-timeline-node" aria-hidden="true" /><div><strong>{version.label}</strong><small>{version.resourceCount} resources · {version.connectionCount} connections</small><code>{version.structuralDigest}</code><time>{new Date(version.createdAt).toLocaleString()}</time></div></article>)}</div>
          {room.versions.length === 0 && <div className="review-version-empty">Capture the first structural checkpoint before review begins.</div>}
          <section className="review-audit"><small>RECENT ACTIVITY</small>{[...room.activity].reverse().slice(0, 6).map((entry) => <p key={entry.id}><span />{membersById.get(entry.actorId)?.name ?? "Member"} {entry.action}<time>{new Date(entry.createdAt).toLocaleDateString()}</time></p>)}</section>
        </aside>
      </div>

      {activeMember && canReview(activeMember.role, "decide") && <footer className="review-decision-bar"><div><span className="review-avatar" aria-hidden="true">{activeMember.name.slice(0, 2).toUpperCase()}</span><p><strong>{activeMember.name}, record your decision</strong><small>Decisions travel with the exported review packet.</small></p></div><button className="request-changes" onClick={() => setDecision("changes_requested")}>Request changes</button><button className="approve-review" onClick={() => setDecision("approved")}>Approve architecture</button></footer>}
    </section>
  );
}
