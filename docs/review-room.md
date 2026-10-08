# Review Room

Review Room is InfraCanvas's local-first architecture review workflow. It adds collaboration to a
canvas without pretending that a browser-only application is an authenticated team service.

## Workflow

1. Open **Review** and create a room with a room name and owner display name.
2. Add reviewers or viewers. These are portable workflow roles, not security identities.
3. Capture a version before review. A version records resource and connection counts plus a
   deterministic structural digest; configuration values are not copied.
4. Add project-wide comments or anchor a thread to a canvas resource. Reviewers can reply,
   resolve or reopen threads, and record an approval or request changes.
5. Export the JSON packet for another InfraCanvas browser or export Markdown for a human-readable
   review summary. Importing a packet reports whether its topology matches the current canvas.

## Security boundary

Review Room stores its state under `infracanvas.review-room.v1` in browser `localStorage`. The
portable packet is capped at 512 KB and bounded to 50 members, 500 comments, 100 replies per
comment, 100 versions, and 1,000 activity entries. Imported roles, decisions, dates, authors, and
resource anchors are validated. Anchors that do not exist on the current canvas are discarded
while their discussion remains available as project-level feedback.

Both new comments and imported packets reject common credential and private-key patterns. React
renders all user text as text rather than HTML. The packet schema has no place for diagram values,
Terraform/Pulumi code, state, inventory, prior AI prompts, or cloud credentials.

Do not treat local roles as authorization. Anyone with local browser access can choose an acting
member or edit a downloaded JSON file. Use the packet as review evidence in a trusted Git workflow,
not as a cryptographic approval. Authenticated workspaces, server-enforced authorization, signed
decisions, and real-time synchronization remain future hosted capabilities.

## Packet contents

- Room name, member display names, workflow roles, and decisions
- Comments, replies, timestamps, resolution state, and optional resource IDs/labels
- Version labels, topology counts, and structural digests
- A bounded activity trail
- Project name, provider, counts, and current structural digest

The export does **not** contain configuration values, generated infrastructure code, state files,
cloud inventory, secrets, or credentials.
