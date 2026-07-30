"use client";

import {
  type CSSProperties,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  CATEGORY_ORDER,
  providerById,
  providers,
  SAMPLE_ARCHITECTURES,
  SAMPLE_EDGES,
  serviceById,
} from "@/lib/catalog";
import { defaultValues } from "@/lib/catalog/helpers";
import { diagramToSvg, svgToPngBlob } from "@/lib/export-diagram";
import { safeName } from "@/lib/hcl";
import { HighlightedCode } from "@/lib/highlight";
import { ProviderMark, ServiceGlyph } from "@/lib/icons";
import { generate } from "@/lib/terraform/generate";
import type {
  DiagramEdge,
  DiagramNode,
  FieldDefinition,
  ProviderId,
  ServiceDefinition,
} from "@/lib/types";
import {
  getServerTheme,
  getTheme,
  setTheme as persistTheme,
  subscribeTheme,
} from "@/lib/theme";
import { validateDiagram } from "@/lib/validate";
import { createZip } from "@/lib/zip";

const NODE_WIDTH = 200;
const NODE_HEIGHT = 86;
const GRID = 24;
const CANVAS_WIDTH = 3200;
const CANVAS_HEIGHT = 2200;
const STORAGE_KEY = "infracanvas.project.v2";

type Doc = { nodes: DiagramNode[]; edges: DiagramEdge[] };
type Marquee = { x: number; y: number; width: number; height: number };

const emptyDoc: Doc = { nodes: [], edges: [] };

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const isTypingTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable);

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoke on the next tick so Safari has time to start the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export default function Home() {
  /* ------------------------------------------------------------------ state */
  const [providerId, setProviderId] = useState<ProviderId>("aws");
  const [providerPickerOpen, setProviderPickerOpen] = useState(true);
  const [pendingProvider, setPendingProvider] = useState<ProviderId | null>(null);
  const [projectName, setProjectName] = useState("Production web platform");

  const [doc, setDoc] = useState<Doc>(emptyDoc);
  const [past, setPast] = useState<Doc[]>([]);
  const [future, setFuture] = useState<Doc[]>([]);

  const [selection, setSelection] = useState<string[]>([]);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  const [collapsedCategories, setCollapsedCategories] = useState<string[]>([]);
  const [search, setSearch] = useState("");

  const [zoom, setZoom] = useState(1);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [handMode, setHandMode] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [connectMode, setConnectMode] = useState(false);
  const [connectionStart, setConnectionStart] = useState<string | null>(null);
  const [connectionSide, setConnectionSide] = useState<"input" | "output">("output");
  const [connectionPointer, setConnectionPointer] = useState<{ x: number; y: number } | null>(null);
  const [marquee, setMarquee] = useState<Marquee | null>(null);

  const [codeOpen, setCodeOpen] = useState(false);
  const [activeFile, setActiveFile] = useState("main.tf");
  const [issuesOpen, setIssuesOpen] = useState(true);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [mobileLibraryOpen, setMobileLibraryOpen] = useState(false);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
  const theme = useSyncExternalStore(subscribeTheme, getTheme, getServerTheme);
  const [toast, setToast] = useState("");

  const canvasRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    origins: Map<string, { x: number; y: number }>;
    startX: number;
    startY: number;
    moved: boolean;
    collapseTo: string | null;
  } | null>(null);
  const panRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  } | null>(null);
  const marqueeRef = useRef<{ pointerId: number; startX: number; startY: number } | null>(null);
  // Monotonic id source. Keeping it in a ref avoids calling Date.now() from a
  // function defined during render, and ids only need to be document-unique.
  const idCounter = useRef(0);

  const provider = providerById(providerId);
  const { nodes, edges } = doc;

  const nextId = (prefix: string) => {
    idCounter.current += 1;
    return `${prefix}-n${idCounter.current}`;
  };

  /* ------------------------------------------------------------ derivations */
  const selectedNodes = nodes.filter((node) => selection.includes(node.id));
  const selectedNode = selectedNodes.length === 1 ? selectedNodes[0] : null;
  const selectedService = selectedNode ? serviceById(provider, selectedNode.serviceId) : undefined;

  const generated = generate(provider, nodes, edges, projectName);
  const issues = validateDiagram(provider, nodes, edges);
  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.filter((issue) => issue.severity === "warning").length;

  const currentFile =
    generated.files.find((file) => file.path === activeFile) ?? generated.files[0];

  const groupedServices = (() => {
    const query = search.trim().toLowerCase();
    const filtered = provider.services.filter((service) =>
      query.length === 0
        ? true
        : `${service.name} ${service.short} ${service.category} ${service.description} ${service.tfType}`
            .toLowerCase()
            .includes(query),
    );
    const groups = new Map<string, ServiceDefinition[]>();
    filtered.forEach((service) => {
      const bucket = groups.get(service.category) ?? [];
      bucket.push(service);
      groups.set(service.category, bucket);
    });
    return [...groups.entries()].sort(
      (a, b) => CATEGORY_ORDER.indexOf(a[0]) - CATEGORY_ORDER.indexOf(b[0]),
    );
  })();

  const activeStep = providerPickerOpen ? 0 : codeOpen ? 2 : 1;

  /* --------------------------------------------------------------- mutation */
  const pushHistory = () => {
    setPast((current) => [...current.slice(-49), doc]);
    setFuture([]);
  };

  /** Structural change: snapshot for undo, then apply. */
  const commit =
    (updater: (current: Doc) => Doc) => {
      setPast((current) => [...current.slice(-49), doc]);
      setFuture([]);
      setDoc((current) => updater(current));
    };

  const undo = () => {
    setPast((currentPast) => {
      if (currentPast.length === 0) return currentPast;
      const previous = currentPast[currentPast.length - 1];
      setFuture((currentFuture) => [doc, ...currentFuture.slice(0, 49)]);
      setDoc(previous);
      setSelection((current) => current.filter((id) => previous.nodes.some((n) => n.id === id)));
      return currentPast.slice(0, -1);
    });
  };

  const redo = () => {
    setFuture((currentFuture) => {
      if (currentFuture.length === 0) return currentFuture;
      const next = currentFuture[0];
      setPast((currentPast) => [...currentPast.slice(-49), doc]);
      setDoc(next);
      return currentFuture.slice(1);
    });
  };

  const notify = (message: string) => setToast(message);

  /* ---------------------------------------------------------------- effects */
  // Restoring a saved draft is a one-shot read of an external store into
  // editable state, which is what setState-in-effect exists for. Reading it
  // during render instead would desynchronise SSR and hydration.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as {
        providerId?: ProviderId;
        projectName?: string;
        nodes?: DiagramNode[];
        edges?: DiagramEdge[];
      };
      if (!parsed.providerId || !providers.some((item) => item.id === parsed.providerId)) return;

      // Drop anything the current catalog no longer defines so a stale save
      // cannot render an unknown service.
      const restoredProvider = providerById(parsed.providerId);
      const validNodes = (parsed.nodes ?? []).filter((node) =>
        serviceById(restoredProvider, node.serviceId),
      );
      const validIds = new Set(validNodes.map((node) => node.id));

      // Continue the id sequence past anything already saved.
      validNodes.forEach((node) => {
        const suffix = /-n(\d+)$/.exec(node.id);
        if (suffix) idCounter.current = Math.max(idCounter.current, Number(suffix[1]));
      });

      setProviderId(parsed.providerId);
      setProjectName(parsed.projectName ?? "Production web platform");
      setDoc({
        nodes: validNodes,
        edges: (parsed.edges ?? []).filter(
          (edge) => validIds.has(edge.from) && validIds.has(edge.to),
        ),
      });
      setProviderPickerOpen(false);
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  /* --------------------------------------------------------------- commands */
  const addNode =
    (serviceId: string, x: number, y: number) => {
      const service = serviceById(provider, serviceId);
      if (!service) return;
      const position = snapToGrid
        ? { x: Math.round(x / GRID) * GRID, y: Math.round(y / GRID) * GRID }
        : { x, y };
      const node: DiagramNode = {
        id: nextId(serviceId),
        serviceId,
        x: clamp(position.x, 0, CANVAS_WIDTH - NODE_WIDTH),
        y: clamp(position.y, 0, CANVAS_HEIGHT - NODE_HEIGHT),
        values: defaultValues(service, nodes.length + 1),
      };
      commit((current) => ({ ...current, nodes: [...current.nodes, node] }));
      setSelection([node.id]);
      setSelectedEdgeId(null);
      setMobileLibraryOpen(false);
      notify(`${service.name} added`);
    };

  const loadSample =
    (targetProvider: ProviderId) => {
      const definition = providerById(targetProvider);
      const layout = SAMPLE_ARCHITECTURES[targetProvider];
      const sampleNodes: DiagramNode[] = layout.flatMap((entry, index) => {
        const service = serviceById(definition, entry.serviceId);
        if (!service) return [];
        return [
          {
            id: nextId(entry.serviceId),
            serviceId: entry.serviceId,
            x: entry.x,
            y: entry.y,
            values: {
              ...defaultValues(service, index + 1),
              ...entry.values,
            },
          },
        ];
      });
      const sampleEdges: DiagramEdge[] = SAMPLE_EDGES[targetProvider].flatMap(([from, to]) => {
        const source = sampleNodes[from];
        const target = sampleNodes[to];
        if (!source || !target) return [];
        return [{ id: nextId("edge"), from: source.id, to: target.id }];
      });
      commit(() => ({ nodes: sampleNodes, edges: sampleEdges }));
      const focusNode =
        sampleNodes.find((node) => node.serviceId === "alb") ??
        sampleNodes.find((node) => node.serviceId === "app_gateway") ??
        sampleNodes.find((node) => node.serviceId === "load_balancer") ??
        sampleNodes[4];
      setSelection(focusNode ? [focusNode.id] : []);
      setSelectedEdgeId(null);
      setMobileInspectorOpen(false);

      // Clearing or panning can leave the viewport far from the sample's
      // coordinates. Fit and recenter after React has painted the new graph.
      const minX = Math.min(...sampleNodes.map((node) => node.x));
      const minY = Math.min(...sampleNodes.map((node) => node.y));
      const maxX = Math.max(...sampleNodes.map((node) => node.x + NODE_WIDTH));
      const maxY = Math.max(...sampleNodes.map((node) => node.y + NODE_HEIGHT));
      const canvas = canvasRef.current;
      const nextZoom = canvas
        ? clamp(
            Math.min(
              (canvas.clientWidth - 80) / Math.max(1, maxX - minX),
              (canvas.clientHeight - 100) / Math.max(1, maxY - minY),
            ),
            0.35,
            0.9,
          )
        : 0.5;
      setZoom(nextZoom);
      window.requestAnimationFrame(() => {
        canvas?.scrollTo({
          left: Math.max(0, minX * nextZoom - 32),
          top: Math.max(0, minY * nextZoom - 32),
          behavior: "smooth",
        });
      });
      notify(
        targetProvider === "aws"
          ? "Secure AWS production reference architecture loaded"
          : `${definition.shortName} reference architecture loaded`,
      );
    };

  const applyProvider =
    (nextId: ProviderId, withSample: boolean) => {
      setProviderId(nextId);
      setProviderPickerOpen(false);
      setPendingProvider(null);
      setCodeOpen(false);
      setSearch("");
      if (withSample) loadSample(nextId);
      notify(`${providerById(nextId).shortName} resource library loaded`);
    };

  const chooseProvider =
    (nextId: ProviderId) => {
      // Switching provider invalidates every node, so never discard work silently.
      if (nodes.length > 0 && nextId !== providerId) {
        setPendingProvider(nextId);
        return;
      }
      applyProvider(nextId, nodes.length === 0);
    };

  const deleteSelection = () => {
    if (selectedEdgeId) {
      commit((current) => ({
        ...current,
        edges: current.edges.filter((edge) => edge.id !== selectedEdgeId),
      }));
      setSelectedEdgeId(null);
      notify("Connection removed");
      return;
    }
    if (selection.length === 0) return;
    const removing = new Set(selection);
    commit((current) => ({
      nodes: current.nodes.filter((node) => !removing.has(node.id)),
      edges: current.edges.filter((edge) => !removing.has(edge.from) && !removing.has(edge.to)),
    }));
    setSelection([]);
    notify(selection.length === 1 ? "Resource removed" : `${selection.length} resources removed`);
  };

  const duplicateSelection = () => {
    if (selection.length === 0) return;
    const copies: DiagramNode[] = [];
    const idMap = new Map<string, string>();

    nodes
      .filter((node) => selection.includes(node.id))
      .forEach((node) => {
        const id = nextId(node.serviceId);
        idMap.set(node.id, id);
        copies.push({
          ...node,
          id,
          x: clamp(node.x + GRID * 2, 0, CANVAS_WIDTH - NODE_WIDTH),
          y: clamp(node.y + GRID * 2, 0, CANVAS_HEIGHT - NODE_HEIGHT),
          values: { ...node.values, name: `${node.values.name}-copy` },
        });
      });

    // Preserve connections that live entirely inside the copied selection.
    const copiedEdges: DiagramEdge[] = edges
      .filter((edge) => idMap.has(edge.from) && idMap.has(edge.to))
      .map((edge) => ({
        id: nextId("edge"),
        from: idMap.get(edge.from)!,
        to: idMap.get(edge.to)!,
      }));

    commit((current) => ({
      nodes: [...current.nodes, ...copies],
      edges: [...current.edges, ...copiedEdges],
    }));
    setSelection(copies.map((node) => node.id));
    notify(copies.length === 1 ? "Resource duplicated" : `${copies.length} resources duplicated`);
  };

  const clearCanvas = () => {
    if (nodes.length === 0) return;
    commit(() => emptyDoc);
    setSelection([]);
    setSelectedEdgeId(null);
    notify("Canvas cleared");
  };

  const updateSelectedValue =
    (key: string, value: string) => {
      if (!selectedNode) return;
      const id = selectedNode.id;
      setDoc((current) => ({
        ...current,
        nodes: current.nodes.map((node) =>
          node.id === id ? { ...node, values: { ...node.values, [key]: value } } : node,
        ),
      }));
    };

  const saveProject = () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ providerId, projectName, nodes, edges }),
    );
    notify("Project saved in this browser");
  };

  /* --------------------------------------------------- canvas coordinates */
  const toCanvasPoint =
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return {
        x: (clientX - rect.left + canvas.scrollLeft) / zoom,
        y: (clientY - rect.top + canvas.scrollTop) / zoom,
      };
    };

  const contentBounds = () => {
    if (nodes.length === 0) {
      return { minX: 0, minY: 0, maxX: CANVAS_WIDTH, maxY: CANVAS_HEIGHT };
    }
    return {
      minX: Math.min(...nodes.map((node) => node.x)),
      minY: Math.min(...nodes.map((node) => node.y)),
      maxX: Math.max(...nodes.map((node) => node.x + NODE_WIDTH)),
      maxY: Math.max(...nodes.map((node) => node.y + NODE_HEIGHT)),
    };
  };

  const zoomToFit = () => {
    const canvas = canvasRef.current;
    if (!canvas || nodes.length === 0) {
      setZoom(1);
      return;
    }
    const bounds = contentBounds();
    const width = bounds.maxX - bounds.minX + 120;
    const height = bounds.maxY - bounds.minY + 120;
    const nextZoom = clamp(
      Math.min(canvas.clientWidth / width, canvas.clientHeight / height),
      0.35,
      1.5,
    );
    setZoom(nextZoom);
    requestAnimationFrame(() => {
      canvas.scrollLeft = Math.max(0, (bounds.minX - 60) * nextZoom);
      canvas.scrollTop = Math.max(0, (bounds.minY - 60) * nextZoom);
    });
  };

  const revealNode =
    (nodeId: string) => {
      const node = nodes.find((item) => item.id === nodeId);
      const canvas = canvasRef.current;
      if (!node || !canvas) return;
      canvas.scrollTo({
        left: Math.max(0, node.x * zoom - canvas.clientWidth / 2 + NODE_WIDTH),
        top: Math.max(0, node.y * zoom - canvas.clientHeight / 2 + NODE_HEIGHT),
        behavior: "smooth",
      });
    };

  /* --------------------------------------------------------- drag and drop */
  const onCanvasDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const serviceId = event.dataTransfer.getData("application/infracanvas-service");
    if (!serviceId) return;
    const point = toCanvasPoint(event.clientX, event.clientY);
    addNode(serviceId, point.x - NODE_WIDTH / 2, point.y - NODE_HEIGHT / 2);
  };

  const onNodePointerDown = (event: ReactPointerEvent<HTMLDivElement>, node: DiagramNode) => {
    event.stopPropagation();
    if (connectMode) return;

    const additive = event.shiftKey || event.metaKey || event.ctrlKey;
    const preserveGroupForDrag =
      !additive && selection.length > 1 && selection.includes(node.id);
    const nextSelection = additive
      ? selection.includes(node.id)
        ? selection.filter((id) => id !== node.id)
        : [...selection, node.id]
      : preserveGroupForDrag
        ? selection
        : [node.id];

    setSelection(nextSelection);
    setSelectedEdgeId(null);
    setMobileInspectorOpen(true);
    if (additive || handMode) {
      if (handMode && preserveGroupForDrag) setSelection([node.id]);
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      collapseTo: preserveGroupForDrag ? node.id : null,
      origins: new Map(
        nodes
          .filter((item) => nextSelection.includes(item.id))
          .map((item) => [item.id, { x: item.x, y: item.y }]),
      ),
    };
  };

  const onNodePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = dragRef.current;
    if (!active || active.pointerId !== event.pointerId) return;

    const deltaX = (event.clientX - active.startX) / zoom;
    const deltaY = (event.clientY - active.startY) / zoom;
    if (!active.moved && Math.abs(deltaX) + Math.abs(deltaY) < 2) return;

    // Snapshot once, on the first real movement, so a drag is one undo step.
    if (!active.moved) {
      active.moved = true;
      pushHistory();
    }

    setDoc((current) => ({
      ...current,
      nodes: current.nodes.map((node) => {
        const origin = active.origins.get(node.id);
        if (!origin) return node;
        const rawX = origin.x + deltaX;
        const rawY = origin.y + deltaY;
        return {
          ...node,
          x: clamp(
            snapToGrid ? Math.round(rawX / GRID) * GRID : rawX,
            0,
            CANVAS_WIDTH - NODE_WIDTH,
          ),
          y: clamp(
            snapToGrid ? Math.round(rawY / GRID) * GRID : rawY,
            0,
            CANVAS_HEIGHT - NODE_HEIGHT,
          ),
        };
      }),
    }));
  };

  const endNodeDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = dragRef.current;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (active && !active.moved && active.collapseTo) {
      setSelection([active.collapseTo]);
    }
    dragRef.current = null;
  };

  /* ------------------------------------------------------------ connections */
  const connectNodes =
    (from: string, to: string) => {
      if (from === to) return;
      const exists = edges.some(
        (edge) =>
          (edge.from === from && edge.to === to) || (edge.from === to && edge.to === from),
      );
      if (exists) {
        notify("Those resources are already connected");
        return;
      }
      commit((current) => ({
        ...current,
        edges: [
          ...current.edges,
          { id: nextId("edge"), from, to },
        ],
      }));
      notify("Resources connected");
    };

  const beginConnection =
    (nodeId: string, side: "input" | "output") => {
      const node = nodes.find((item) => item.id === nodeId);
      if (!node) return;
      setHandMode(false);
      setConnectMode(true);
      setConnectionStart(nodeId);
      setConnectionSide(side);
      setConnectionPointer({
        x: side === "input" ? node.x : node.x + NODE_WIDTH,
        y: node.y + NODE_HEIGHT / 2,
      });
    };

  const cancelConnection = () => {
    setConnectMode(false);
    setConnectionStart(null);
    setConnectionPointer(null);
  };

  const handleNodeActivate =
    (nodeId: string) => {
      if (!connectMode) {
        setSelection([nodeId]);
        setSelectedEdgeId(null);
        setMobileInspectorOpen(true);
        return;
      }
      if (!connectionStart) {
        beginConnection(nodeId, "output");
        return;
      }
      if (connectionStart === nodeId) {
        cancelConnection();
        return;
      }
      connectNodes(connectionStart, nodeId);
      cancelConnection();
    };

  const onPortPointerDown = (
    event: ReactPointerEvent<HTMLSpanElement>,
    nodeId: string,
    side: "input" | "output",
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (connectionStart && connectionStart !== nodeId) {
      connectNodes(connectionStart, nodeId);
      cancelConnection();
      return;
    }
    beginConnection(nodeId, side);
  };

  /* --------------------------------------------------------- canvas gestures */
  const onCanvasPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;

    if (handMode) {
      event.currentTarget.setPointerCapture(event.pointerId);
      panRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        scrollLeft: event.currentTarget.scrollLeft,
        scrollTop: event.currentTarget.scrollTop,
      };
      setIsPanning(true);
      return;
    }

    if (connectMode) return;

    // Background press starts a marquee selection.
    const point = toCanvasPoint(event.clientX, event.clientY);
    event.currentTarget.setPointerCapture(event.pointerId);
    marqueeRef.current = { pointerId: event.pointerId, startX: point.x, startY: point.y };
    if (!event.shiftKey) {
      setSelection([]);
      setSelectedEdgeId(null);
    }
  };

  const onCanvasPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const canvas = event.currentTarget;

    const pan = panRef.current;
    if (pan && pan.pointerId === event.pointerId) {
      canvas.scrollLeft = pan.scrollLeft - (event.clientX - pan.startX);
      canvas.scrollTop = pan.scrollTop - (event.clientY - pan.startY);
      return;
    }

    const box = marqueeRef.current;
    if (box && box.pointerId === event.pointerId) {
      const point = toCanvasPoint(event.clientX, event.clientY);
      setMarquee({
        x: Math.min(box.startX, point.x),
        y: Math.min(box.startY, point.y),
        width: Math.abs(point.x - box.startX),
        height: Math.abs(point.y - box.startY),
      });
      return;
    }

    if (connectionStart) {
      setConnectionPointer(toCanvasPoint(event.clientX, event.clientY));
    }
  };

  const onCanvasPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (marqueeRef.current && marquee && marquee.width > 6 && marquee.height > 6) {
      const hits = nodes
        .filter(
          (node) =>
            node.x < marquee.x + marquee.width &&
            node.x + NODE_WIDTH > marquee.x &&
            node.y < marquee.y + marquee.height &&
            node.y + NODE_HEIGHT > marquee.y,
        )
        .map((node) => node.id);
      setSelection((current) =>
        event.shiftKey ? [...new Set([...current, ...hits])] : hits,
      );
    }

    marqueeRef.current = null;
    setMarquee(null);
    panRef.current = null;
    setIsPanning(false);
  };

  const onCanvasWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    setZoom((current) => clamp(current - event.deltaY * 0.0015, 0.35, 2));
  };

  /* --------------------------------------------------------------- exports */
  const copyText =
    async (value: string, message: string) => {
      try {
        await navigator.clipboard.writeText(value);
        notify(message);
      } catch {
        notify("Clipboard access was blocked by the browser");
      }
    };

  const bundleName = safeName(projectName, "infrastructure").replace(/_/g, "-");

  const downloadZip = () => {
    const blob = createZip(
      generated.files.map((file) => ({ path: file.path, contents: file.contents })),
    );
    downloadBlob(blob, `${bundleName}-terraform.zip`);
    notify(`${generated.files.length} files downloaded as .zip`);
  };

  const downloadCurrentFile = () => {
    if (!currentFile) return;
    downloadBlob(
      new Blob([currentFile.contents], { type: "text/plain;charset=utf-8" }),
      currentFile.path,
    );
    notify(`${currentFile.path} downloaded`);
  };

  const exportSvg = () => {
    const svg = diagramToSvg(provider, nodes, edges, projectName, theme);
    downloadBlob(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), `${bundleName}.svg`);
    notify("Diagram exported as SVG");
  };

  const exportPng = async () => {
    try {
      const svg = diagramToSvg(provider, nodes, edges, projectName, theme);
      const blob = await svgToPngBlob(svg, 2);
      downloadBlob(blob, `${bundleName}.png`);
      notify("Diagram exported as PNG");
    } catch {
      notify("PNG export failed — try the SVG export");
    }
  };

  /* ------------------------------------------------------------- shortcuts */
  // The listener is attached once; this ref keeps it pointed at the latest
  // command closures without re-subscribing on every render.
  const commandsRef = useRef({
    cancelConnection,
    codeOpen,
    connectMode,
    connectionStart,
    deleteSelection,
    duplicateSelection,
    nodes,
    notify,
    pendingProvider,
    redo,
    saveProject,
    shortcutsOpen,
    snapToGrid,
    undo,
    zoomToFit,
  });
  useEffect(() => {
    commandsRef.current = {
      cancelConnection,
      codeOpen,
      connectMode,
      connectionStart,
      deleteSelection,
      duplicateSelection,
      nodes,
      notify,
      pendingProvider,
      redo,
      saveProject,
      shortcutsOpen,
      snapToGrid,
      undo,
      zoomToFit,
    };
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const {
        cancelConnection,
        codeOpen,
        connectMode,
        connectionStart,
        deleteSelection,
        duplicateSelection,
        nodes,
        notify,
        pendingProvider,
        redo,
        saveProject,
        shortcutsOpen,
        snapToGrid,
        undo,
        zoomToFit,
      } = commandsRef.current;

      const mod = event.metaKey || event.ctrlKey;

      if (event.key === "Escape") {
        if (shortcutsOpen) return setShortcutsOpen(false);
        if (pendingProvider) return setPendingProvider(null);
        if (connectionStart || connectMode) return cancelConnection();
        if (codeOpen) return setCodeOpen(false);
        setSelection([]);
        setSelectedEdgeId(null);
        return;
      }

      if (mod && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveProject();
        return;
      }
      if (mod && event.key === "Enter") {
        event.preventDefault();
        setCodeOpen((current) => !current);
        return;
      }
      if (mod && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
        return;
      }

      if (isTypingTarget(event.target)) return;

      if (mod && event.key.toLowerCase() === "a") {
        event.preventDefault();
        setSelection(nodes.map((node) => node.id));
        return;
      }
      if (mod && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicateSelection();
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteSelection();
        return;
      }
      if (event.key === "/") {
        event.preventDefault();
        setMobileLibraryOpen(true);
        searchRef.current?.focus();
        return;
      }
      if (event.key === "?") {
        event.preventDefault();
        setShortcutsOpen(true);
        return;
      }
      if (event.key.toLowerCase() === "c") {
        setHandMode(false);
        setConnectMode((current) => !current);
        setConnectionStart(null);
        setConnectionPointer(null);
        return;
      }
      if (event.key.toLowerCase() === "h") {
        cancelConnection();
        setHandMode((current) => !current);
        return;
      }
      if (event.key.toLowerCase() === "g") {
        setSnapToGrid((current) => !current);
        notify(snapToGrid ? "Snap to grid off" : "Snap to grid on");
        return;
      }
      if (event.key.toLowerCase() === "f") {
        zoomToFit();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  /* ------------------------------------------------------------------ views */
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const bounds = contentBounds();
  const minimapScale = Math.min(
    168 / Math.max(600, bounds.maxX - bounds.minX + 200),
    104 / Math.max(400, bounds.maxY - bounds.minY + 200),
  );

  const visibleFields = (service: ServiceDefinition, values: Record<string, string>) =>
    service.fields.filter(
      (field) =>
        !field.showWhen || field.showWhen.equals.includes(values[field.showWhen.key] ?? ""),
    );

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-symbol" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="brand-name">InfraCanvas</span>
          <span className="beta-pill">BETA</span>
        </div>

        <div className="project-title-wrap">
          <span className="breadcrumb">Projects /</span>
          <input
            aria-label="Project name"
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
          />
          <span className="saved-state">Local draft</span>
        </div>

        <div className="top-actions">
          <button
            className="icon-button mobile-only"
            onClick={() => setMobileLibraryOpen(true)}
            aria-label="Open resource library"
          >
            +
          </button>
          <div className="history-group" role="group" aria-label="History">
            <button onClick={undo} disabled={past.length === 0} title="Undo (Ctrl+Z)" aria-label="Undo">
              ↺
            </button>
            <button onClick={redo} disabled={future.length === 0} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">
              ↻
            </button>
          </div>
          <div className="theme-switcher" role="group" aria-label="Color theme">
            <button
              className={theme === "light" ? "active" : ""}
              onClick={() => persistTheme("light")}
              aria-pressed={theme === "light"}
              title="Use light mode"
            >
              <span className="theme-icon sun-icon" aria-hidden="true" />
              <span className="theme-label">Light</span>
            </button>
            <button
              className={theme === "dark" ? "active" : ""}
              onClick={() => persistTheme("dark")}
              aria-pressed={theme === "dark"}
              title="Use dark mode"
            >
              <span className="theme-icon moon-icon" aria-hidden="true" />
              <span className="theme-label">Dark</span>
            </button>
          </div>
          <button
            className="icon-button"
            onClick={() => setShortcutsOpen(true)}
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts (?)"
          >
            ?
          </button>
          <button className="ghost-button" onClick={saveProject}>
            Save
          </button>
          <button className="generate-button" onClick={() => setCodeOpen((current) => !current)}>
            <span className="code-glyph" aria-hidden="true">
              {codeOpen ? "←" : "</>"}
            </span>
            {codeOpen ? "Back to design" : "Generate Terraform"}
            {!codeOpen && <span className="key-hint">⌘↵</span>}
          </button>
        </div>
      </header>

      <div className="workflow-bar">
        <ol className="workflow-steps" aria-label="Builder workflow">
          {["Provider", "Design & configure", "Generate"].map((label, index) => (
            <li
              key={label}
              className={index === activeStep ? "active" : index < activeStep ? "complete" : ""}
            >
              <span>{index < activeStep ? "✓" : index + 1}</span>
              {label}
            </li>
          ))}
        </ol>
        <div className="validation-status">
          <button
            className={`issue-chip ${errorCount > 0 ? "has-errors" : warningCount > 0 ? "has-warnings" : "clean"}`}
            onClick={() => setIssuesOpen((current) => !current)}
            aria-expanded={issuesOpen}
          >
            <span className="status-dot" />
            {errorCount > 0
              ? `${errorCount} blocking ${errorCount === 1 ? "issue" : "issues"}`
              : warningCount > 0
                ? `${warningCount} ${warningCount === 1 ? "warning" : "warnings"}`
                : "Diagram valid"}
          </button>
          <span>{nodes.length} resources</span>
          <span>{edges.length} connections</span>
          <span>{generated.resourceCount} Terraform blocks</span>
        </div>
      </div>

      {!codeOpen && (
        <section className="workspace">
          <aside className={`library-panel ${mobileLibraryOpen ? "mobile-open" : ""}`}>
            <div className="panel-heading provider-heading">
              <button
                className="provider-switcher"
                onClick={() => setProviderPickerOpen(true)}
                aria-label="Change cloud provider"
              >
                <ProviderMark provider={provider.id} className="provider-mark-svg" />
                <span>
                  <small>Cloud provider</small>
                  <strong>{provider.shortName}</strong>
                </span>
                <b aria-hidden="true">⌄</b>
              </button>
              <button
                className="mobile-close"
                onClick={() => setMobileLibraryOpen(false)}
                aria-label="Close resource library"
              >
                ×
              </button>
            </div>

            <label className="search-box">
              <span aria-hidden="true" />
              <input
                ref={searchRef}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={`Search ${provider.services.length} ${provider.shortName} services`}
                aria-label={`Search ${provider.shortName} services`}
              />
              <kbd>/</kbd>
            </label>

            <div className="service-library">
              {groupedServices.map(([category, items]) => {
                const collapsed = collapsedCategories.includes(category);
                return (
                  <section className="service-category" key={category}>
                    <button
                      className="category-title"
                      onClick={() =>
                        setCollapsedCategories((current) =>
                          current.includes(category)
                            ? current.filter((item) => item !== category)
                            : [...current, category],
                        )
                      }
                      aria-expanded={!collapsed}
                    >
                      <span>{category}</span>
                      <b>{items.length}</b>
                      <i aria-hidden="true">{collapsed ? "›" : "⌄"}</i>
                    </button>
                    {!collapsed && (
                      <div className="service-list">
                        {items.map((service) => (
                          <button
                            className="service-item"
                            draggable
                            key={service.id}
                            onDragStart={(event) => {
                              event.dataTransfer.setData(
                                "application/infracanvas-service",
                                service.id,
                              );
                              event.dataTransfer.effectAllowed = "copy";
                            }}
                            onDoubleClick={() => {
                              const canvas = canvasRef.current;
                              const x = canvas ? (canvas.scrollLeft + canvas.clientWidth / 2) / zoom : 360;
                              const y = canvas ? (canvas.scrollTop + canvas.clientHeight / 2) / zoom : 240;
                              addNode(service.id, x - NODE_WIDTH / 2, y - NODE_HEIGHT / 2);
                            }}
                            title={`Drag ${service.name} onto the canvas, or double-click to add it`}
                          >
                            <span
                              className="service-icon"
                              style={{ "--service-accent": service.accent } as CSSProperties}
                            >
                              <ServiceGlyph role={service.role} className="service-glyph" />
                            </span>
                            <span className="service-copy">
                              <strong>{service.name}</strong>
                              <small>{service.description}</small>
                              <code>{service.tfType}</code>
                            </span>
                            <b className="drag-grip" aria-hidden="true">
                              ⠿
                            </b>
                          </button>
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
              {groupedServices.length === 0 && (
                <div className="empty-search">
                  <strong>No services found</strong>
                  <span>Try another resource name, category, or Terraform type.</span>
                </div>
              )}
            </div>

            <div className="library-tip">
              <span className="tip-icon">i</span>
              <p>
                <strong>Drag to create</strong>
                <br />
                Connections drive the generated references — link a subnet to an instance and the
                Terraform picks it up.
              </p>
            </div>
          </aside>

          <div className="canvas-stage">
            <div className="canvas-toolbar" role="toolbar" aria-label="Diagram tools">
              <button
                className={`hand-tool-button ${handMode ? "selected" : ""}`}
                onClick={() => {
                  cancelConnection();
                  setHandMode((current) => !current);
                }}
                aria-pressed={handMode}
                title="Pan the canvas (H)"
              >
                <span className="hand-icon" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="tool-copy">
                  <strong>Hand</strong>
                  <small>Pan canvas</small>
                </span>
              </button>
              <button
                className={`connection-tool-button ${connectMode ? "selected" : ""}`}
                onClick={() => {
                  setHandMode(false);
                  setConnectMode((current) => !current);
                  setConnectionStart(null);
                  setConnectionPointer(null);
                }}
                aria-pressed={connectMode}
                title="Connect resources (C)"
              >
                <span className="connector-icon" aria-hidden="true">
                  <i />
                  <i />
                </span>
                <span className="tool-copy">
                  <strong>Connect</strong>
                  <small>Link resources</small>
                </span>
              </button>
              <span className="toolbar-divider" />
              <button onClick={() => setZoom((value) => clamp(value - 0.1, 0.35, 2))} aria-label="Zoom out">
                −
              </button>
              <button className="zoom-readout" onClick={() => setZoom(1)} title="Reset zoom">
                {Math.round(zoom * 100)}%
              </button>
              <button onClick={() => setZoom((value) => clamp(value + 0.1, 0.35, 2))} aria-label="Zoom in">
                +
              </button>
              <button onClick={zoomToFit} title="Zoom to fit (F)">
                Fit
              </button>
              <span className="toolbar-divider" />
              <button
                className={snapToGrid ? "selected" : ""}
                onClick={() => setSnapToGrid((current) => !current)}
                aria-pressed={snapToGrid}
                title="Snap to grid (G)"
              >
                Snap
              </button>
              <button onClick={duplicateSelection} disabled={selection.length === 0} title="Duplicate (Ctrl+D)">
                Duplicate
              </button>
              <button onClick={clearCanvas} disabled={nodes.length === 0}>
                Clear
              </button>
              <span className="toolbar-divider" />
              <button onClick={exportSvg} disabled={nodes.length === 0} title="Export diagram as SVG">
                SVG
              </button>
              <button onClick={exportPng} disabled={nodes.length === 0} title="Export diagram as PNG">
                PNG
              </button>
            </div>

            <div
              className={`diagram-canvas ${connectMode ? "is-connecting" : ""} ${handMode ? "is-hand-tool" : ""} ${isPanning ? "is-panning" : ""}`}
              ref={canvasRef}
              onPointerDown={onCanvasPointerDown}
              onPointerMove={onCanvasPointerMove}
              onPointerUp={onCanvasPointerUp}
              onPointerCancel={onCanvasPointerUp}
              onWheel={onCanvasWheel}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
              }}
              onDrop={onCanvasDrop}
              style={
                {
                  "--grid-size": `${GRID * zoom}px`,
                  "--provider-accent": provider.accent,
                } as CSSProperties
              }
            >
              <div
                className="canvas-scroll"
                style={{ width: CANVAS_WIDTH * zoom, height: CANVAS_HEIGHT * zoom }}
              >
                <div
                  className="canvas-content"
                  style={{
                    width: CANVAS_WIDTH,
                    height: CANVAS_HEIGHT,
                    transform: `scale(${zoom})`,
                  }}
                >
                  <svg className="edge-layer" width={CANVAS_WIDTH} height={CANVAS_HEIGHT}>
                    <defs>
                      <marker
                        id="edge-arrow"
                        viewBox="0 0 10 10"
                        refX="9"
                        refY="5"
                        markerWidth="6"
                        markerHeight="6"
                        orient="auto-start-reverse"
                      >
                        <path d="M 0 0 L 10 5 L 0 10 z" />
                      </marker>
                    </defs>
                    {edges.map((edge) => {
                      const from = nodeById.get(edge.from);
                      const to = nodeById.get(edge.to);
                      if (!from || !to) return null;
                      const x1 = from.x + NODE_WIDTH;
                      const y1 = from.y + NODE_HEIGHT / 2;
                      const x2 = to.x;
                      const y2 = to.y + NODE_HEIGHT / 2;
                      const curve = Math.max(70, Math.abs(x2 - x1) * 0.45);
                      const path = `M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`;
                      const active = selectedEdgeId === edge.id;
                      return (
                        <g
                          key={edge.id}
                          className={`edge ${active ? "selected" : ""}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedEdgeId(edge.id);
                            setSelection([]);
                          }}
                        >
                          <path className="edge-hit" d={path} />
                          <path className="edge-line" d={path} markerEnd="url(#edge-arrow)" />
                        </g>
                      );
                    })}
                    {connectionStart &&
                      connectionPointer &&
                      (() => {
                        const source = nodeById.get(connectionStart);
                        if (!source) return null;
                        const x1 =
                          connectionSide === "input" ? source.x : source.x + NODE_WIDTH;
                        const y1 = source.y + NODE_HEIGHT / 2;
                        const direction = connectionSide === "input" ? -1 : 1;
                        const curve = Math.max(
                          70,
                          Math.abs(connectionPointer.x - x1) * 0.4,
                        );
                        return (
                          <path
                            className="pending-edge"
                            d={`M ${x1} ${y1} C ${x1 + curve * direction} ${y1}, ${connectionPointer.x - curve * direction} ${connectionPointer.y}, ${connectionPointer.x} ${connectionPointer.y}`}
                            markerEnd="url(#edge-arrow)"
                          />
                        );
                      })()}
                  </svg>

                  {nodes.map((node) => {
                    const service = serviceById(provider, node.serviceId);
                    if (!service) return null;
                    const selected = selection.includes(node.id);
                    const nodeIssues = issues.filter((issue) => issue.nodeId === node.id);
                    const worst = nodeIssues.some((issue) => issue.severity === "error")
                      ? "error"
                      : nodeIssues.length > 0
                        ? "warning"
                        : "ok";
                    return (
                      <div
                        key={node.id}
                        className={`diagram-node ${selected ? "selected" : ""} ${connectionStart === node.id ? "connection-start" : ""} status-${worst}`}
                        style={
                          {
                            left: node.x,
                            top: node.y,
                            width: NODE_WIDTH,
                            height: NODE_HEIGHT,
                            "--service-accent": service.accent,
                          } as CSSProperties
                        }
                        onPointerDown={(event) => onNodePointerDown(event, node)}
                        onPointerMove={onNodePointerMove}
                        onPointerUp={endNodeDrag}
                        onPointerCancel={endNodeDrag}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (connectMode) handleNodeActivate(node.id);
                        }}
                        onDoubleClick={() => setMobileInspectorOpen(true)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            handleNodeActivate(node.id);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        aria-label={`${node.values.name}, ${service.name}${nodeIssues.length ? `, ${nodeIssues.length} issues` : ""}`}
                      >
                        <span
                          className="node-port input-port"
                          role="button"
                          tabIndex={0}
                          aria-label={`Connect to the left side of ${node.values.name}`}
                          title="Drag or click to connect"
                          onPointerDown={(event) => onPortPointerDown(event, node.id, "input")}
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              event.stopPropagation();
                              beginConnection(node.id, "input");
                            }
                          }}
                        >
                          <i aria-hidden="true">+</i>
                        </span>
                        <span className="node-service-icon">
                          <ServiceGlyph role={service.role} className="node-glyph" />
                        </span>
                        <span className="node-copy">
                          <strong>{node.values.name}</strong>
                          <small>{service.name}</small>
                        </span>
                        <span
                          className="node-status"
                          title={
                            worst === "ok"
                              ? "Configuration ready"
                              : nodeIssues.map((issue) => issue.title).join(" · ")
                          }
                        />
                        <span
                          className="node-port output-port"
                          role="button"
                          tabIndex={0}
                          aria-label={`Connect from the right side of ${node.values.name}`}
                          title="Drag or click to connect"
                          onPointerDown={(event) => onPortPointerDown(event, node.id, "output")}
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              event.stopPropagation();
                              beginConnection(node.id, "output");
                            }
                          }}
                        >
                          <i aria-hidden="true">+</i>
                        </span>
                      </div>
                    );
                  })}

                  {marquee && (
                    <div
                      className="marquee"
                      style={{
                        left: marquee.x,
                        top: marquee.y,
                        width: marquee.width,
                        height: marquee.height,
                      }}
                    />
                  )}

                  {nodes.length === 0 && (
                    <div className="empty-canvas">
                      <span className="empty-canvas-graphic">
                        <i />
                        <i />
                        <i />
                      </span>
                      <strong>Start composing your architecture</strong>
                      <p>
                        Drag services from the library, then connect them. Every connection becomes
                        a real Terraform reference.
                      </p>
                      <button
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation();
                          loadSample(provider.id);
                        }}
                      >
                        Load secure reference architecture
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="canvas-badge">
                <ProviderMark provider={provider.id} className="badge-mark" />
                <span>
                  <strong>{projectName}</strong>
                  <small>{provider.name}</small>
                </span>
              </div>

              {nodes.length > 0 && (
                <button
                  className="minimap"
                  onClick={(event) => {
                    const canvas = canvasRef.current;
                    if (!canvas) return;
                    const rect = event.currentTarget.getBoundingClientRect();
                    const ratioX = (event.clientX - rect.left) / rect.width;
                    const ratioY = (event.clientY - rect.top) / rect.height;
                    canvas.scrollTo({
                      left: Math.max(0, (bounds.minX + ratioX * (bounds.maxX - bounds.minX)) * zoom - canvas.clientWidth / 2),
                      top: Math.max(0, (bounds.minY + ratioY * (bounds.maxY - bounds.minY)) * zoom - canvas.clientHeight / 2),
                      behavior: "smooth",
                    });
                  }}
                  aria-label="Minimap — click to jump to a region"
                  title="Minimap"
                >
                  <svg viewBox={`0 0 ${Math.max(1, bounds.maxX - bounds.minX + 160)} ${Math.max(1, bounds.maxY - bounds.minY + 160)}`}>
                    {edges.map((edge) => {
                      const from = nodeById.get(edge.from);
                      const to = nodeById.get(edge.to);
                      if (!from || !to) return null;
                      return (
                        <line
                          key={edge.id}
                          x1={from.x - bounds.minX + 80 + NODE_WIDTH / 2}
                          y1={from.y - bounds.minY + 80 + NODE_HEIGHT / 2}
                          x2={to.x - bounds.minX + 80 + NODE_WIDTH / 2}
                          y2={to.y - bounds.minY + 80 + NODE_HEIGHT / 2}
                        />
                      );
                    })}
                    {nodes.map((node) => {
                      const service = serviceById(provider, node.serviceId);
                      return (
                        <rect
                          key={node.id}
                          x={node.x - bounds.minX + 80}
                          y={node.y - bounds.minY + 80}
                          width={NODE_WIDTH}
                          height={NODE_HEIGHT}
                          rx={16}
                          fill={service?.accent ?? "#888"}
                          opacity={selection.includes(node.id) ? 1 : 0.55}
                        />
                      );
                    })}
                  </svg>
                  <span style={{ opacity: minimapScale > 0 ? 1 : 1 }}>Overview</span>
                </button>
              )}

              {connectMode && (
                <div className="connect-guidance">
                  <span />
                  {connectionStart
                    ? "Select the destination resource"
                    : "Select the first resource, or drag from a node port"}
                  <button onClick={cancelConnection}>Cancel</button>
                </div>
              )}
            </div>

            {issuesOpen && issues.length > 0 && (
              <div className="issues-panel" aria-label="Architecture validation">
                <div className="issues-head">
                  <strong>Validation</strong>
                  <span>
                    {errorCount} {errorCount === 1 ? "error" : "errors"} · {warningCount}{" "}
                    {warningCount === 1 ? "warning" : "warnings"}
                  </span>
                  <button onClick={() => setIssuesOpen(false)} aria-label="Hide validation panel">
                    ×
                  </button>
                </div>
                <ul>
                  {issues.slice(0, 40).map((issue) => (
                    <li key={issue.id} className={`issue ${issue.severity}`}>
                      <button
                        onClick={() => {
                          if (!issue.nodeId) return;
                          setSelection([issue.nodeId]);
                          setSelectedEdgeId(null);
                          revealNode(issue.nodeId);
                        }}
                        disabled={!issue.nodeId}
                      >
                        <i aria-hidden="true">
                          {issue.severity === "error" ? "!" : issue.severity === "warning" ? "▲" : "i"}
                        </i>
                        <span>
                          <strong>{issue.title}</strong>
                          <small>{issue.detail}</small>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <footer className="canvas-footer">
              <span>Grid: {GRID}px{snapToGrid ? " · snapping" : ""}</span>
              <span>
                {selection.length > 0
                  ? `${selection.length} selected`
                  : selectedEdgeId
                    ? "1 connection selected"
                    : "Nothing selected"}
              </span>
              <span className="keyboard-note">
                Shift-click or drag to multi-select · Delete removes · Ctrl+scroll zooms · ? for
                shortcuts
              </span>
              <button className="mobile-inspector-button" onClick={() => setMobileInspectorOpen(true)}>
                Configure selected
              </button>
            </footer>
          </div>

          <aside className={`inspector-panel ${mobileInspectorOpen ? "mobile-open" : ""}`}>
            <div className="panel-heading inspector-heading">
              <div>
                <span className="eyebrow">Configuration</span>
                <h2>{selectedService ? selectedService.name : "Resource settings"}</h2>
              </div>
              <button
                className="mobile-close"
                onClick={() => setMobileInspectorOpen(false)}
                aria-label="Close resource inspector"
              >
                ×
              </button>
            </div>

            {selectedNode && selectedService ? (
              <>
                <div className="selected-resource-card">
                  <span
                    className="selected-resource-icon"
                    style={{ "--service-accent": selectedService.accent } as CSSProperties}
                  >
                    <ServiceGlyph role={selectedService.role} className="node-glyph" />
                  </span>
                  <span>
                    <strong>{selectedNode.values.name}</strong>
                    <small>
                      {provider.shortName} · {selectedService.category}
                    </small>
                  </span>
                  {selectedService.docs && (
                    <a
                      className="docs-link"
                      href={selectedService.docs}
                      target="_blank"
                      rel="noreferrer noopener"
                      title="Open the Terraform registry documentation"
                    >
                      docs ↗
                    </a>
                  )}
                </div>

                <div className="form-section">
                  <div className="form-section-title">
                    <span>General</span>
                    <i />
                  </div>
                  <label className="field">
                    <span>Resource name</span>
                    <input
                      value={selectedNode.values.name}
                      onChange={(event) => updateSelectedValue("name", event.target.value)}
                    />
                    <small>
                      Terraform address:{" "}
                      <code>
                        {selectedService.tfType}.{safeName(selectedNode.values.name)}
                      </code>
                    </small>
                  </label>
                </div>

                <div className="form-section">
                  <div className="form-section-title">
                    <span>Resource properties</span>
                    <i />
                  </div>
                  {visibleFields(selectedService, selectedNode.values).map((field) => (
                    <FieldControl
                      key={field.key}
                      field={field}
                      value={selectedNode.values[field.key] ?? ""}
                      onChange={(value) => updateSelectedValue(field.key, value)}
                    />
                  ))}
                </div>

                <div className="form-section">
                  <div className="form-section-title">
                    <span>Connections</span>
                    <i />
                  </div>
                  <ul className="connection-list">
                    {edges
                      .filter(
                        (edge) => edge.from === selectedNode.id || edge.to === selectedNode.id,
                      )
                      .map((edge) => {
                        const otherId = edge.from === selectedNode.id ? edge.to : edge.from;
                        const other = nodeById.get(otherId);
                        const otherService = other
                          ? serviceById(provider, other.serviceId)
                          : undefined;
                        return (
                          <li key={edge.id}>
                            <span>
                              <strong>{other?.values.name ?? "unknown"}</strong>
                              <small>{otherService?.name}</small>
                            </span>
                            <button
                              onClick={() =>
                                commit((current) => ({
                                  ...current,
                                  edges: current.edges.filter((item) => item.id !== edge.id),
                                }))
                              }
                              aria-label={`Remove the connection to ${other?.values.name ?? "resource"}`}
                            >
                              ×
                            </button>
                          </li>
                        );
                      })}
                    {edges.filter(
                      (edge) => edge.from === selectedNode.id || edge.to === selectedNode.id,
                    ).length === 0 && (
                      <li className="no-connections">
                        Not connected. The generator will fall back to input variables for this
                        resource.
                      </li>
                    )}
                  </ul>
                </div>

                <div className="inspector-actions">
                  <button className="danger-button" onClick={deleteSelection}>
                    Remove resource
                  </button>
                  <button className="primary-small" onClick={() => setCodeOpen(true)}>
                    View code
                  </button>
                </div>
              </>
            ) : (
              <div className="empty-inspector">
                <span className="selection-graphic">
                  <i />
                  <i />
                </span>
                <strong>{selection.length > 1 ? `${selection.length} resources selected` : "Select a resource"}</strong>
                <p>
                  {selection.length > 1
                    ? "Multi-selection supports move, duplicate, and delete. Select a single resource to edit its properties."
                    : "Choose any node on the canvas to configure its infrastructure values."}
                </p>
              </div>
            )}
          </aside>
        </section>
      )}

      {providerPickerOpen && (
        <div className="modal-backdrop provider-modal-backdrop" role="presentation">
          <section
            className="provider-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="provider-title"
          >
            <div className="modal-brand">
              <span className="brand-symbol">
                <i />
                <i />
                <i />
              </span>
              InfraCanvas
            </div>
            <span className="step-chip">STEP 1 OF 3</span>
            <h1 id="provider-title">Where are you building?</h1>
            <p>
              Choose a cloud provider. We load its native services, real property options, and the
              matching Terraform provider automatically.
            </p>
            <div className="provider-grid">
              {providers.map((item) => (
                <button
                  key={item.id}
                  className={`provider-card ${item.id === providerId ? "current" : ""}`}
                  onClick={() => chooseProvider(item.id)}
                  style={{ "--provider-accent": item.accent } as CSSProperties}
                >
                  <ProviderMark provider={item.id} className="provider-card-mark" />
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.tagline}</small>
                    <em>
                      {item.services.length} services · {item.source} {item.versionConstraint}
                    </em>
                  </span>
                  <i aria-hidden="true">→</i>
                </button>
              ))}
            </div>
            <div className="provider-modal-footer">
              <span>
                <i /> Real provider resources
              </span>
              <span>
                <i /> Connections become references
              </span>
              <span>
                <i /> Secure-by-default templates
              </span>
            </div>
            {nodes.length > 0 && (
              <button className="modal-dismiss" onClick={() => setProviderPickerOpen(false)}>
                Keep working in {provider.shortName}
              </button>
            )}
          </section>
        </div>
      )}

      {pendingProvider && (
        <div className="modal-backdrop" role="presentation">
          <section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="switch-title">
            <h2 id="switch-title">Switch to {providerById(pendingProvider).shortName}?</h2>
            <p>
              {providerById(pendingProvider).shortName} uses different resources, so the{" "}
              {nodes.length} {nodes.length === 1 ? "resource" : "resources"} on your canvas cannot
              carry over.
            </p>
            <div className="confirm-actions">
              <button onClick={() => setPendingProvider(null)}>Cancel</button>
              <button className="ghost-button" onClick={() => applyProvider(pendingProvider, false)}>
                Switch and start empty
              </button>
              <button className="primary-small" onClick={() => applyProvider(pendingProvider, true)}>
                Switch and load example
              </button>
            </div>
          </section>
        </div>
      )}

      {shortcutsOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setShortcutsOpen(false)}
        >
          <section
            className="shortcuts-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="shortcuts-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="shortcuts-title">Keyboard shortcuts</h2>
            <dl>
              {[
                ["Ctrl / ⌘ + ↵", "Generate Terraform"],
                ["Ctrl / ⌘ + Z", "Undo"],
                ["Ctrl / ⌘ + Shift + Z", "Redo"],
                ["Ctrl / ⌘ + D", "Duplicate selection"],
                ["Ctrl / ⌘ + A", "Select all"],
                ["Ctrl / ⌘ + S", "Save project"],
                ["Delete / Backspace", "Remove selection"],
                ["Shift + click", "Add to selection"],
                ["Drag on canvas", "Marquee select"],
                ["Ctrl / ⌘ + scroll", "Zoom"],
                ["C", "Connect tool"],
                ["H", "Hand tool"],
                ["G", "Toggle snap to grid"],
                ["F", "Zoom to fit"],
                ["/", "Search services"],
                ["Esc", "Cancel or clear selection"],
              ].map(([keys, description]) => (
                <div key={keys}>
                  <dt>{keys}</dt>
                  <dd>{description}</dd>
                </div>
              ))}
            </dl>
            <button onClick={() => setShortcutsOpen(false)}>Close</button>
          </section>
        </div>
      )}

      {codeOpen && (
        <section className="terraform-page" aria-labelledby="code-title">
          <section className="code-modal">
            <header className="code-modal-header">
              <div>
                <button
                  className="back-design-button"
                  onClick={() => setCodeOpen(false)}
                  aria-label="Return to the architecture canvas"
                >
                  <span aria-hidden="true">←</span>
                </button>
                <span className="code-modal-icon">&lt;/&gt;</span>
                <span>
                  <small>Step 3 · Generated infrastructure</small>
                  <h2 id="code-title">Terraform module</h2>
                </span>
              </div>
              <div className="code-modal-actions">
                <button
                  className="ghost-button"
                  onClick={() => currentFile && copyText(currentFile.contents, `${currentFile.path} copied`)}
                >
                  Copy file
                </button>
                <button className="ghost-button" onClick={downloadCurrentFile}>
                  Download file
                </button>
                <button className="download-button" onClick={downloadZip}>
                  Download .zip ({generated.files.length} files)
                </button>
              </div>
            </header>

            <div className="code-summary">
              <span>
                <ProviderMark provider={provider.id} className="summary-mark" /> {provider.name}
              </span>
              <span>{generated.resourceCount} resources</span>
              <span>{edges.length} wired references</span>
              <span className={errorCount > 0 ? "code-blocked" : "code-ready"}>
                <i />
                {errorCount > 0 ? `${errorCount} blocking issues` : "Ready for review"}
              </span>
            </div>

            <div className="code-workspace">
              <nav className="file-tree" aria-label="Generated files">
                <strong>TERRAFORM MODULE</strong>
                {generated.files.map((file) => (
                  <button
                    key={file.path}
                    className={file.path === currentFile?.path ? "active" : ""}
                    onClick={() => setActiveFile(file.path)}
                  >
                    <span>{file.language === "hcl" ? "tf" : file.language === "markdown" ? "md" : "txt"}</span>
                    {file.path}
                  </button>
                ))}
                {generated.unresolved.length > 0 ? (
                  <div className="code-callout warn">
                    <strong>{generated.unresolved.length} unresolved references</strong>
                    <p>
                      These resources are not connected to a matching resource, so the generator
                      declared input variables instead:
                    </p>
                    <ul>
                      {[
                        ...new Map(
                          generated.unresolved.map((item) => [`${item.label}-${item.variable}`, item]),
                        ).values(),
                      ]
                        .slice(0, 6)
                        .map((item) => (
                          <li key={`${item.nodeId}-${item.variable}`}>
                            {item.label} → <code>var.{item.variable}</code>
                          </li>
                        ))}
                    </ul>
                  </div>
                ) : (
                  <div className="code-callout ok">
                    <strong>Fully wired</strong>
                    <p>
                      Every cross-resource reference resolved from your diagram. No placeholder
                      variables were needed.
                    </p>
                  </div>
                )}
              </nav>

              <div className="code-editor">
                <div className="editor-tab">
                  <span>{currentFile?.language === "hcl" ? "tf" : "txt"}</span>
                  {currentFile?.path}
                </div>
                <pre>
                  {currentFile && (
                    <HighlightedCode
                      contents={currentFile.contents}
                      language={currentFile.language}
                    />
                  )}
                </pre>
              </div>
            </div>

            <footer className="code-modal-footer">
              <p>
                <span>i</span> Secrets are declared as <code>sensitive</code> variables — supply them
                from a secret manager. Run <code>terraform init && terraform validate</code>, review{" "}
                <code>terraform plan</code>, then apply.
              </p>
              <button onClick={downloadZip}>Download module</button>
            </footer>
          </section>
        </section>
      )}

      <div className={`toast ${toast ? "show" : ""}`} aria-live="polite">
        <span>✓</span>
        {toast}
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ fields */

function FieldControl({
  field,
  value,
  onChange,
}: {
  field: FieldDefinition;
  value: string;
  onChange: (value: string) => void;
}) {
  if (field.type === "toggle") {
    const on = value === "true";
    return (
      <div className="field toggle-field">
        <span>{field.label}</span>
        <button
          type="button"
          className={`switch ${on ? "on" : ""}`}
          role="switch"
          aria-checked={on}
          onClick={() => onChange(on ? "false" : "true")}
        >
          <i />
        </button>
        {field.hint && <small>{field.hint}</small>}
      </div>
    );
  }

  if (field.type === "combo") {
    const listId = `options-${field.key.replace(/[^a-z0-9_-]/gi, "-")}`;
    return (
      <label className="field">
        <span>{field.label}</span>
        <input
          list={listId}
          value={value}
          placeholder={field.placeholder ?? "Choose or enter a custom value"}
          onChange={(event) => onChange(event.target.value)}
          autoComplete="off"
        />
        <datalist id={listId}>
          {field.options?.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
        {field.hint && <small>{field.hint}</small>}
      </label>
    );
  }

  return (
    <label className="field">
      <span>{field.label}</span>
      {field.options ? (
        <select value={value || field.options[0]} onChange={(event) => onChange(event.target.value)}>
          {field.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={field.type === "number" ? "number" : "text"}
          value={value}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {field.hint && <small>{field.hint}</small>}
    </label>
  );
}
