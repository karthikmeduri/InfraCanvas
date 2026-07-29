import type { FieldDefinition, ServiceDefinition } from "../types";

/** Select field with a fixed option list. */
export const select = (
  key: string,
  label: string,
  options: string[],
  hint?: string,
): FieldDefinition => ({ key, label, type: "select", options, hint });

/** Free-text field. */
export const text = (
  key: string,
  label: string,
  placeholder?: string,
  hint?: string,
): FieldDefinition => ({ key, label, type: "text", placeholder, hint });

/** Numeric field. */
export const number = (
  key: string,
  label: string,
  placeholder?: string,
  hint?: string,
): FieldDefinition => ({ key, label, type: "number", placeholder, hint });

/** Boolean field rendered as a switch. */
export const toggle = (
  key: string,
  label: string,
  defaultOn = false,
  hint?: string,
): FieldDefinition => ({
  key,
  label,
  type: "toggle",
  options: defaultOn ? ["true", "false"] : ["false", "true"],
  hint,
});

export const conditional = (
  base: FieldDefinition,
  showWhen: { key: string; equals: string[] },
): FieldDefinition => ({ ...base, showWhen });

/** Accent colours are grouped by category so the canvas reads at a glance. */
export const ACCENTS = {
  networking: "#8b5cf6",
  compute: "#f97316",
  containers: "#3b82f6",
  database: "#22c55e",
  storage: "#ec4899",
  security: "#ef4444",
  integration: "#06b6d4",
  observability: "#eab308",
} as const;

export type ServiceInput = Omit<ServiceDefinition, "accent"> & { accent?: string };

const CATEGORY_ACCENT: Record<string, string> = {
  Networking: ACCENTS.networking,
  Compute: ACCENTS.compute,
  Containers: ACCENTS.containers,
  Database: ACCENTS.database,
  Storage: ACCENTS.storage,
  Security: ACCENTS.security,
  Integration: ACCENTS.integration,
  Observability: ACCENTS.observability,
};

export const defineService = (input: ServiceInput): ServiceDefinition => ({
  ...input,
  accent: input.accent ?? CATEGORY_ACCENT[input.category] ?? ACCENTS.compute,
});

/** Default value used when a node is first dropped on the canvas. */
export const defaultValues = (
  service: ServiceDefinition,
  sequence: number,
): Record<string, string> => {
  const values: Record<string, string> = {
    name: `${service.id.replace(/_/g, "-")}-${sequence}`,
  };
  service.fields.forEach((item) => {
    values[item.key] = item.options?.[0] ?? item.placeholder ?? (item.type === "number" ? "1" : "");
  });
  return values;
};
