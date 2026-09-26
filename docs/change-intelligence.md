# InfraCanvas Change Intelligence

Change Intelligence turns an InfraCanvas architecture snapshot into a review artifact for every
pull request. It compares the repository's base and proposed diagrams, separates configuration
changes from visual-only movement, and produces a concise risk-oriented report plus before/after
SVG diagrams.

## Quick start

1. Build or open an architecture in InfraCanvas.
2. Select **PR JSON** in the canvas export toolbar.
3. Save the download as `infracanvas.architecture.json` at the repository root.
4. Commit the snapshot and open a pull request.

The included GitHub workflow creates:

- a pull request comment for branches in the same repository;
- a GitHub Actions job summary;
- `before.svg`, `after.svg`, `report.md`, and `report.json` as a 14-day workflow artifact.

Fork pull requests can receive the same review without executing fork code. The workflow uses the
privileged `pull_request_target` event only with an explicit checkout of the trusted base commit.
It retrieves the base and proposed snapshots through GitHub's contents API, treats both strictly as
bounded untrusted JSON, and never checks out or executes the contributor's branch.

## Local review

```bash
npm ci
npm run review:architecture -- \
  --base path/to/base.infracanvas.json \
  --head infracanvas.architecture.json \
  --out architecture-review
```

Open `architecture-review/report.md`, `before.svg`, and `after.svg` to inspect the result.

## Security boundary

- Snapshots are limited to 2,000 nodes, 4,000 connections, 64 fields per node, and 5 MB in the CLI.
- Identifiers, coordinate ranges, referenced nodes, provider names, and value types are validated.
- Credential-shaped field names and values are replaced with `[REDACTED]` during export and parse.
- Markdown control characters and control bytes are escaped before a pull request comment is built.
- The workflow checks out and executes only the pull request's base commit. Proposed snapshot bytes
  are retrieved through the contents API and parsed as untrusted data, including for forks.
- Repository contents remain read-only. Pull-request write permission is used only to update the
  workflow's single marked review comment.
- Change Intelligence never runs Terraform, Pulumi, OpenTofu, generated code, or snapshot content.

This is architecture-level review, not a deployment prediction. Always review the actual
Terraform/OpenTofu plan or Pulumi preview before approving infrastructure changes.
