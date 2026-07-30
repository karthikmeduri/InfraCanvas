import type { DiagramEdge, DiagramNode, ProviderDefinition, ServiceDefinition } from "./types";

const NODE_WIDTH = 200;
const NODE_HEIGHT = 86;
const PADDING = 56;

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const truncate = (value: string, max: number) =>
  value.length > max ? `${value.slice(0, max - 1)}…` : value;

/**
 * Render the diagram as a standalone SVG.
 *
 * The canvas nodes are HTML elements, so rather than trying to inline foreign
 * objects (which rasterizes inconsistently across browsers) this draws an
 * equivalent scene with plain SVG primitives and system fonts.
 */
export function diagramToSvg(
  provider: ProviderDefinition,
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  projectName: string,
  theme: "light" | "dark" = "light",
): string {
  const palette =
    theme === "dark"
      ? { bg: "#14161f", grid: "#242734", card: "#1c1f2b", stroke: "#2f3342", text: "#f2f3f6", muted: "#9aa0b0", edge: "#5b6070" }
      : { bg: "#f7f8fa", grid: "#e6e8ee", card: "#ffffff", stroke: "#dfe2ea", text: "#151824", muted: "#6f7485", edge: "#a8adbc" };

  const serviceFor = (node: DiagramNode): ServiceDefinition | undefined =>
    provider.services.find((service) => service.id === node.serviceId);

  const minX = nodes.length ? Math.min(...nodes.map((node) => node.x)) : 0;
  const minY = nodes.length ? Math.min(...nodes.map((node) => node.y)) : 0;
  const maxX = nodes.length ? Math.max(...nodes.map((node) => node.x + NODE_WIDTH)) : 400;
  const maxY = nodes.length ? Math.max(...nodes.map((node) => node.y + NODE_HEIGHT)) : 300;

  const offsetX = PADDING - minX;
  const offsetY = PADDING + 44 - minY;
  const width = Math.max(560, maxX - minX + PADDING * 2);
  const height = Math.max(320, maxY - minY + PADDING * 2 + 44);

  const positioned = new Map(nodes.map((node) => [node.id, node]));

  const edgePaths = edges
    .map((edge) => {
      const from = positioned.get(edge.from);
      const to = positioned.get(edge.to);
      if (!from || !to) return "";
      const x1 = from.x + offsetX + NODE_WIDTH;
      const y1 = from.y + offsetY + NODE_HEIGHT / 2;
      const x2 = to.x + offsetX;
      const y2 = to.y + offsetY + NODE_HEIGHT / 2;
      const curve = Math.max(60, Math.abs(x2 - x1) * 0.45);
      return `<path d="M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}" fill="none" stroke="${palette.edge}" stroke-width="2" marker-end="url(#arrow)" />`;
    })
    .join("\n    ");

  const nodeShapes = nodes
    .map((node) => {
      const service = serviceFor(node);
      if (!service) return "";
      const x = node.x + offsetX;
      const y = node.y + offsetY;
      const label = truncate(node.values.name || service.name, 22);
      return `<g>
      <rect x="${x}" y="${y}" width="${NODE_WIDTH}" height="${NODE_HEIGHT}" rx="14" fill="${palette.card}" stroke="${palette.stroke}" stroke-width="1.5" />
      <rect x="${x}" y="${y}" width="4" height="${NODE_HEIGHT}" rx="2" fill="${service.accent}" />
      <rect x="${x + 16}" y="${y + 18}" width="34" height="34" rx="10" fill="${service.accent}" opacity="0.16" />
      <text x="${x + 33}" y="${y + 40}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="11" font-weight="700" fill="${service.accent}" text-anchor="middle">${escapeXml(truncate(service.short, 5))}</text>
      <text x="${x + 60}" y="${y + 35}" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="13.5" font-weight="650" fill="${palette.text}">${escapeXml(label)}</text>
      <text x="${x + 60}" y="${y + 54}" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="11" fill="${palette.muted}">${escapeXml(truncate(service.name, 26))}</text>
    </g>`;
    })
    .join("\n    ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
      <circle cx="1" cy="1" r="1" fill="${palette.grid}" />
    </pattern>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="${palette.edge}" />
    </marker>
  </defs>
  <rect width="${width}" height="${height}" fill="${palette.bg}" />
  <rect width="${width}" height="${height}" fill="url(#grid)" />
  <text x="${PADDING}" y="42" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="17" font-weight="700" fill="${palette.text}">${escapeXml(projectName || "Untitled architecture")}</text>
  <text x="${PADDING}" y="62" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="11.5" fill="${palette.muted}">${escapeXml(provider.name)} · ${nodes.length} resources · ${edges.length} connections · InfraCanvas</text>
  <g>
    ${edgePaths}
  </g>
  <g>
    ${nodeShapes}
  </g>
</svg>
`;
}

/** Rasterize an SVG string to a PNG blob at the requested pixel density. */
export async function svgToPngBlob(svg: string, scale = 2): Promise<Blob> {
  const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Could not rasterize the diagram."));
      element.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth * scale;
    canvas.height = image.naturalHeight * scale;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D context is unavailable.");
    context.scale(scale, scale);
    context.drawImage(image, 0, 0);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("PNG export failed."))),
        "image/png",
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
