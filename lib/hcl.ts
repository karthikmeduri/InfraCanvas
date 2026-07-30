/**
 * A tiny HCL2 emitter.
 *
 * Terraform's parser requires one argument per line — the earlier
 * string-concatenation approach silently produced `a = 1; b = 2` bodies that
 * fail at parse time. Building a small tree and rendering it once means the
 * output is always newline-separated and `terraform fmt` clean.
 */

export type HclValue =
  | { kind: "raw"; value: string }
  | { kind: "string"; value: string }
  | { kind: "number"; value: number }
  | { kind: "bool"; value: boolean }
  | { kind: "list"; items: HclValue[] }
  | { kind: "object"; entries: [string, HclValue][] }
  | { kind: "heredoc"; tag: string; value: string };

export type HclEntry =
  | { kind: "attr"; name: string; value: HclValue }
  | { kind: "block"; type: string; labels: string[]; body: HclEntry[] }
  | { kind: "comment"; text: string }
  | { kind: "blank" };

/** Unquoted expression, e.g. `aws_vpc.main.id` or `var.region`. */
export const raw = (value: string): HclValue => ({ kind: "raw", value });

/** Quoted string literal. Interpolation is intentionally preserved. */
export const str = (value: string): HclValue => ({
  kind: "string",
  value: value ?? "",
});

export const bool = (value: boolean): HclValue => ({ kind: "bool", value });

export const list = (...items: HclValue[]): HclValue => ({
  kind: "list",
  items,
});

export const listOf = (items: HclValue[]): HclValue => ({ kind: "list", items });

export const obj = (entries: Record<string, HclValue>): HclValue => ({
  kind: "object",
  entries: Object.entries(entries),
});

export const heredoc = (tag: string, value: string): HclValue => ({
  kind: "heredoc",
  tag,
  value,
});

/** Coerce free-text UI input to a number literal, falling back when invalid. */
export const num = (value: string | number | undefined, fallback: number): HclValue => {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return {
    kind: "number",
    value: Number.isFinite(parsed) ? parsed : fallback,
  };
};

/** Coerce a `"true"`/`"false"` dropdown value to a boolean literal. */
export const flag = (value: string | boolean | undefined, fallback = false): HclValue => {
  if (typeof value === "boolean") return bool(value);
  if (value === "true" || value === "Enabled" || value === "yes") return bool(true);
  if (value === "false" || value === "Disabled" || value === "no") return bool(false);
  return bool(fallback);
};

export const attr = (name: string, value: HclValue): HclEntry => ({
  kind: "attr",
  name,
  value,
});

export const block = (
  type: string,
  labels: string[],
  body: HclEntry[],
): HclEntry => ({ kind: "block", type, labels, body });

export const comment = (text: string): HclEntry => ({ kind: "comment", text });

export const blank = (): HclEntry => ({ kind: "blank" });

/** Convenience for a `resource "type" "name" { ... }` block. */
export const resource = (
  type: string,
  name: string,
  body: HclEntry[],
): HclEntry => block("resource", [type, name], body);

export const dataSource = (
  type: string,
  name: string,
  body: HclEntry[],
): HclEntry => block("data", [type, name], body);

const escapeString = (value: string) =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");

/** HCL identifiers that need quoting when used as object keys. */
const BARE_KEY = /^[A-Za-z_][A-Za-z0-9_-]*$/;

function renderValue(value: HclValue, indent: string): string {
  switch (value.kind) {
    case "raw":
      return value.value;
    case "string":
      return `"${escapeString(value.value)}"`;
    case "number":
      return String(value.value);
    case "bool":
      return value.value ? "true" : "false";
    case "heredoc": {
      const lines = value.value.split("\n").map((line) => `${indent}  ${line}`);
      return `<<-${value.tag}\n${lines.join("\n")}\n${indent}${value.tag}`;
    }
    case "list": {
      if (value.items.length === 0) return "[]";
      const inline = value.items.map((item) => renderValue(item, indent));
      const oneLine = `[${inline.join(", ")}]`;
      if (oneLine.length + indent.length <= 92 && !oneLine.includes("\n")) {
        return oneLine;
      }
      const inner = value.items
        .map((item) => `${indent}  ${renderValue(item, `${indent}  `)},`)
        .join("\n");
      return `[\n${inner}\n${indent}]`;
    }
    case "object": {
      if (value.entries.length === 0) return "{}";
      const width = Math.max(
        ...value.entries.map(([key]) => (BARE_KEY.test(key) ? key.length : key.length + 2)),
      );
      const inner = value.entries
        .map(([key, entryValue]) => {
          const label = BARE_KEY.test(key) ? key : `"${escapeString(key)}"`;
          return `${indent}  ${label.padEnd(width)} = ${renderValue(entryValue, `${indent}  `)}`;
        })
        .join("\n");
      return `{\n${inner}\n${indent}}`;
    }
  }
}

/**
 * Render a body, aligning `=` within each run of consecutive attributes the
 * way `terraform fmt` does.
 */
function renderBody(body: HclEntry[], indent: string): string {
  const lines: string[] = [];
  let index = 0;

  while (index < body.length) {
    const entry = body[index];

    if (entry.kind === "attr") {
      const run: { name: string; rendered: string }[] = [];
      while (index < body.length && body[index].kind === "attr") {
        const item = body[index] as Extract<HclEntry, { kind: "attr" }>;
        run.push({ name: item.name, rendered: renderValue(item.value, indent) });
        index += 1;
      }

      // `terraform fmt` aligns `=` only across consecutive single-line
      // arguments; a multi-line value breaks the group on both sides.
      let group: typeof run = [];
      const flush = () => {
        if (group.length === 0) return;
        const width = Math.max(...group.map((item) => item.name.length));
        group.forEach((item) => {
          lines.push(`${indent}${item.name.padEnd(width)} = ${item.rendered}`);
        });
        group = [];
      };

      run.forEach((item) => {
        if (item.rendered.includes("\n")) {
          flush();
          lines.push(`${indent}${item.name} = ${item.rendered}`);
          return;
        }
        group.push(item);
      });
      flush();
      continue;
    }

    if (entry.kind === "block") {
      const labels = entry.labels.map((label) => `"${escapeString(label)}"`).join(" ");
      const head = [entry.type, labels].filter(Boolean).join(" ");
      if (entry.body.length === 0) {
        lines.push(`${indent}${head} {}`);
      } else {
        lines.push(`${indent}${head} {`);
        lines.push(renderBody(entry.body, `${indent}  `));
        lines.push(`${indent}}`);
      }
      index += 1;
      continue;
    }

    if (entry.kind === "comment") {
      entry.text.split("\n").forEach((line) => lines.push(`${indent}# ${line}`.trimEnd()));
      index += 1;
      continue;
    }

    lines.push("");
    index += 1;
  }

  return lines.join("\n");
}

/**
 * Render a single value to an expression string, for composing a larger
 * expression with `raw(...)`.
 */
export function expr(value: HclValue): string {
  return renderValue(value, "");
}

/** Render top-level entries into a `.tf` document. */
export function render(entries: HclEntry[]): string {
  const chunks: string[] = [];

  entries.forEach((entry, index) => {
    if (entry.kind === "blank") {
      chunks.push("");
      return;
    }
    // Separate consecutive top-level blocks so the document reads like
    // hand-written Terraform rather than one dense wall.
    const previous = entries[index - 1];
    if (previous && previous.kind === "block" && entry.kind === "block") {
      chunks.push("");
    }
    chunks.push(renderBody([entry], ""));
  });

  return `${chunks
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()}\n`;
}

/** Sanitize any user string into a valid Terraform identifier. */
export function safeName(value: string, fallback = "resource"): string {
  const cleaned = (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^[^a-z_]+/, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || fallback;
}

/** Sanitize into a DNS-style name (lowercase, hyphens, no leading digit). */
export function dnsName(value: string, fallback = "resource", maxLength = 63): string {
  const cleaned = (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^[^a-z]+/, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
  return cleaned || fallback;
}

/** Sanitize into an alphanumeric-only name (Azure storage accounts, OCI DB names). */
export function alphaNumName(value: string, fallback = "res", maxLength = 24): string {
  const cleaned = (value || "").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, maxLength);
  return cleaned || fallback;
}
