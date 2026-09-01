import type { DiagramEdge, DiagramNode } from "./types";

export type DiagramDocument = { nodes: DiagramNode[]; edges: DiagramEdge[] };

/** Remove exactly one selected connection without modifying either endpoint. */
export function removeDiagramEdge(document: DiagramDocument, edgeId: string): DiagramDocument {
  if (!document.edges.some((edge) => edge.id === edgeId)) return document;
  return {
    ...document,
    edges: document.edges.filter((edge) => edge.id !== edgeId),
  };
}
