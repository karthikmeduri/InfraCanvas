import { normalizeArchitecturePlan } from "@/lib/ai-architect";
import { providerById, providers } from "@/lib/catalog";
import type { ProviderId } from "@/lib/types";

export const runtime = "edge";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

const planSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "summary", "assumptions", "nodes", "edges"],
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    assumptions: { type: "array", items: { type: "string" } },
    nodes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["serviceId", "name", "reason", "configuration"],
        properties: {
          serviceId: { type: "string" },
          name: { type: "string" },
          reason: { type: "string" },
          configuration: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["key", "value"],
              properties: {
                key: { type: "string" },
                value: { type: "string" },
              },
            },
          },
        },
      },
    },
    edges: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["from", "to", "reason"],
        properties: {
          from: { type: "integer" },
          to: { type: "integer" },
          reason: { type: "string" },
        },
      },
    },
  },
} as const;

function outputText(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const response = payload as Record<string, unknown>;
  if (typeof response.output_text === "string") return response.output_text;
  if (!Array.isArray(response.output)) return "";
  for (const item of response.output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const text = (part as Record<string, unknown>).text;
      if (typeof text === "string") return text;
    }
  }
  return "";
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return json(
      {
        code: "AI_NOT_CONFIGURED",
        message: "The hosted AI planner is not configured. InfraCanvas can still create a local architecture draft.",
      },
      503,
    );
  }

  let input: Record<string, unknown>;
  try {
    input = await request.json() as Record<string, unknown>;
  } catch {
    return json({ message: "Send a valid JSON request." }, 400);
  }

  const providerId = typeof input.providerId === "string" ? input.providerId : "";
  if (!providers.some((provider) => provider.id === providerId)) {
    return json({ message: "Choose a supported cloud provider." }, 400);
  }
  const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
  if (prompt.length < 12 || prompt.length > 4000) {
    return json({ message: "Describe the architecture in 12 to 4,000 characters." }, 400);
  }

  const provider = providerById(providerId as ProviderId);
  const catalog = provider.services
    .filter((service) => service.iacSupport !== "diagram")
    .map((service) => ({
      id: service.id,
      name: service.name,
      category: service.category,
      role: service.role,
      description: service.description,
      configuration: service.fields.map((field) => ({
        key: field.key,
        label: field.label,
        type: field.type ?? "text",
        options: field.options ?? [],
        placeholder: field.placeholder ?? "",
      })),
    }));

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
      reasoning: { effort: "low" },
      input: [
        {
          role: "developer",
          content: [
            {
              type: "input_text",
              text: `You are the InfraCanvas cloud architecture planner. Produce a secure, realistic, cost-aware ${provider.name} architecture using only the supplied deployable catalog ids. Prefer 8-18 resources. Every edge index must reference the zero-based nodes array. Use configuration keys and valid options exactly as supplied; omit uncertain configuration instead of inventing fields. Include networking, security, observability, and data protection when appropriate. Never include cloud credentials, secrets, passwords, Terraform expressions, or destructive instructions. The result is a draft that the user must review before deployment.\n\nDeployable catalog:\n${JSON.stringify(catalog)}`,
            },
          ],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: prompt }],
        },
      ],
      text: {
        verbosity: "low",
        format: {
          type: "json_schema",
          name: "infracanvas_architecture_plan",
          description: "A catalog-backed cloud architecture diagram plan.",
          strict: true,
          schema: planSchema,
        },
      },
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = payload && typeof payload === "object"
      ? (payload as { error?: { message?: string } }).error?.message
      : undefined;
    return json({ message: detail || "The AI architect could not create a plan." }, response.status >= 500 ? 502 : 400);
  }

  const text = outputText(payload);
  try {
    const plan = normalizeArchitecturePlan(provider, JSON.parse(text), "ai");
    if (plan.nodes.length === 0) throw new Error("No supported resources returned");
    return json({ plan });
  } catch {
    return json({ message: "The AI response did not contain a usable catalog-backed architecture." }, 502);
  }
}
