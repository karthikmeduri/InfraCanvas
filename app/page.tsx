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
import {
  AI_ARCHITECT_EXAMPLES,
  createLocalArchitectureDraft,
  normalizeArchitecturePlan,
  planNodeDefaults,
  type ArchitecturePlan,
} from "@/lib/ai-architect";
import { DriftWorkspace, type LoadedReport } from "@/app/components/DriftWorkspace";
import { StateLensWorkspace, type LoadedState } from "@/app/components/StateLensWorkspace";
import {
  canvasTerraformResources,
  highestDriftSeverity,
  matchDriftFindings,
  parseTfwhyReport,
  type TfwhyFinding,
} from "@/lib/drift";
import { diagramToSvg, svgToPngBlob } from "@/lib/export-diagram";
import { removeDiagramEdge } from "@/lib/diagram";
import { safeName } from "@/lib/hcl";
import { HighlightedCode } from "@/lib/highlight";
import { ProviderMark, ServiceArtwork } from "@/lib/icons";
import { generatePulumi } from "@/lib/pulumi/generate";
import { generate } from "@/lib/terraform/generate";
import { parseStateFile } from "@/lib/state-lens";
import type {
  DiagramEdge,
  DiagramNode,
  DiagramState,
  FieldDefinition,
  ProviderId,
  ServiceDefinition,
  ValidationIssue,
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
// Direct document coordinates keep dropped resources under the pointer.
const CANVAS_PAN_PADDING = 0;
const STORAGE_KEY = "infracanvas.project.v2";

type Doc = { nodes: DiagramNode[]; edges: DiagramEdge[] };
type SavedDraft = DiagramState & { savedAt?: string };
type Marquee = { x: number; y: number; width: number; height: number };
type IacTarget = "terraform" | "pulumi";
type CatalogFilter = "all" | "deployable" | "diagram";

const emptyDoc: Doc = { nodes: [], edges: [] };

const collapsedCatalogCategories = (providerId: ProviderId) => {
  const categories = [...new Set(providerById(providerId).services.map((service) => service.category))];
  return categories.slice(1);
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const edgeMarkerId = (providerId: ProviderId, accent: string) =>
  `edge-arrow-${providerId}-${accent.replace(/[^a-z0-9]/gi, "")}`;

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

const fileBadge = (language: string) =>
  ({
    hcl: "tf",
    typescript: "ts",
    javascript: "js",
    json: "{}",
    yaml: "yml",
    powershell: "ps",
    shell: "sh",
    markdown: "md",
    text: "txt",
  })[language] ?? "txt";

export default function Home() {
  /* ------------------------------------------------------------------ state */
  const [providerId, setProviderId] = useState<ProviderId>("aws");
  const [providerPickerOpen, setProviderPickerOpen] = useState(true);
  const [pendingProvider, setPendingProvider] = useState<ProviderId | null>(null);
  const [startupProvider, setStartupProvider] = useState<ProviderId | null>(null);
  const [savedDraft, setSavedDraft] = useState<SavedDraft | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  const [projectName, setProjectName] = useState("Production web platform");

  const [doc, setDoc] = useState<Doc>(emptyDoc);
  const [past, setPast] = useState<Doc[]>([]);
  const [future, setFuture] = useState<Doc[]>([]);

  const [selection, setSelection] = useState<string[]>([]);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  const [collapsedCategories, setCollapsedCategories] = useState<string[]>(() =>
    collapsedCatalogCategories("aws"),
  );
  const [search, setSearch] = useState("");
  const [catalogFilter, setCatalogFilter] = useState<CatalogFilter>("all");

  const [zoom, setZoom] = useState(1);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [handMode, setHandMode] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [connectMode, setConnectMode] = useState(false);
  const [connectionStart, setConnectionStart] = useState<string | null>(null);
  const [connectionSide, setConnectionSide] = useState<"input" | "output">("output");
  const [connectionPointer, setConnectionPointer] = useState<{ x: number; y: number } | null>(null);
  const [marquee, setMarquee] = useState<Marquee | null>(null);

  const [codeOpen, setCodeOpen] = useState(false);
  const [iacTarget, setIacTarget] = useState<IacTarget>("terraform");
  const [driftOpen, setDriftOpen] = useState(false);
  const [driftReport, setDriftReport] = useState<LoadedReport | null>(null);
  const [driftImportError, setDriftImportError] = useState("");
  const [stateLensOpen, setStateLensOpen] = useState(false);
  const [stateLensImport, setStateLensImport] = useState<LoadedState | null>(null);
  const [stateLensError, setStateLensError] = useState("");
  const [welcomeFeature, setWelcomeFeature] = useState<"statelens" | "drift" | null>(null);
  const [activeFile, setActiveFile] = useState("main.tf");
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [activeIssueId, setActiveIssueId] = useState<string | null>(null);
  const [examplePromptOpen, setExamplePromptOpen] = useState(false);
  const [aiArchitectOpen, setAiArchitectOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiPlan, setAiPlan] = useState<ArchitecturePlan | null>(null);
  const [aiPlanning, setAiPlanning] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiGuideNodeIds, setAiGuideNodeIds] = useState<string[]>([]);
  const [aiGuideIndex, setAiGuideIndex] = useState(0);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [mobileLibraryOpen, setMobileLibraryOpen] = useState(false);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
  const theme = useSyncExternalStore(subscribeTheme, getTheme, getServerTheme);
  const [toast, setToast] = useState("");

  const canvasRef = useRef<HTMLDivElement>(null);
  const issuesPanelRef = useRef<HTMLDivElement>(null);
  const providerDialogRef = useRef<HTMLElement>(null);
  const decisionDialogRef = useRef<HTMLElement>(null);
  const aiDialogRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const driftInputRef = useRef<HTMLInputElement>(null);
  const stateLensInputRef = useRef<HTMLInputElement>(null);
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
  const selectedEdge = selectedEdgeId
    ? edges.find((edge) => edge.id === selectedEdgeId) ?? null
    : null;
  const selectedEdgeFrom = selectedEdge ? nodes.find((node) => node.id === selectedEdge.from) : undefined;
  const selectedEdgeTo = selectedEdge ? nodes.find((node) => node.id === selectedEdge.to) : undefined;
  const aiGuideNodeId = aiGuideNodeIds[aiGuideIndex];

  const generated = generate(provider, nodes, edges, projectName);
  const pulumiGenerated = generatePulumi(provider, generated, projectName);
  const activeGenerated = iacTarget === "terraform" ? generated : pulumiGenerated;
  const issues = validateDiagram(provider, nodes, edges);
  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.filter((issue) => issue.severity === "warning").length;
  const driftMatches = driftReport
    ? matchDriftFindings(driftReport.report, canvasTerraformResources(provider, nodes))
    : [];
  const driftByNode = new Map<string, TfwhyFinding[]>();
  driftMatches.forEach(({ finding, nodeId }) => {
    if (!nodeId) return;
    driftByNode.set(nodeId, [...(driftByNode.get(nodeId) ?? []), finding]);
  });

  const currentFile =
    activeGenerated.files.find((file) => file.path === activeFile) ?? activeGenerated.files[0];

  const deployableServiceCount = provider.services.filter(
    (service) => service.iacSupport !== "diagram",
  ).length;
  const diagramServiceCount = provider.services.length - deployableServiceCount;
  const diagramOnlyNodeCount = nodes.filter(
    (node) => serviceById(provider, node.serviceId)?.iacSupport === "diagram",
  ).length;

  const groupedServices = (() => {
    const query = search.trim().toLowerCase();
    const filtered = provider.services.filter((service) => {
      const support = service.iacSupport === "diagram" ? "diagram" : "deployable";
      if (catalogFilter !== "all" && support !== catalogFilter) return false;
      if (query.length === 0) return true;
      return `${service.name} ${service.short} ${service.category} ${service.productFamily ?? ""} ${service.description} ${service.tfType} ${support}`
        .toLowerCase()
        .includes(query);
    });
    const groups = new Map<string, ServiceDefinition[]>();
    filtered.forEach((service) => {
      const bucket = groups.get(service.category) ?? [];
      bucket.push(service);
      groups.set(service.category, bucket);
    });
    return [...groups.entries()].sort((a, b) => {
      const aIndex = CATEGORY_ORDER.indexOf(a[0]);
      const bIndex = CATEGORY_ORDER.indexOf(b[0]);
      if (aIndex === -1 && bIndex === -1) return a[0].localeCompare(b[0]);
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
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

  const showBuilder = () => {
    setAiArchitectOpen(false);
    setCodeOpen(false);
    setDriftOpen(false);
    setStateLensOpen(false);
    if (welcomeFeature) setProviderPickerOpen(true);
    setWelcomeFeature(null);
  };

  const showDrift = (fromWelcome = false) => {
    setAiArchitectOpen(false);
    setProviderPickerOpen(false);
    setCodeOpen(false);
    setStateLensOpen(false);
    setDriftOpen(true);
    if (fromWelcome) setWelcomeFeature("drift");
  };

  const showStateLens = (fromWelcome = false) => {
    setAiArchitectOpen(false);
    setProviderPickerOpen(false);
    setCodeOpen(false);
    setDriftOpen(false);
    setStateLensOpen(true);
    if (fromWelcome) setWelcomeFeature("statelens");
  };

  const showGeneratedCode = () => {
    setAiArchitectOpen(false);
    setProviderPickerOpen(false);
    setDriftOpen(false);
    setStateLensOpen(false);
    setCodeOpen(true);
  };

  const showAiArchitect = () => {
    setProviderPickerOpen(false);
    setCodeOpen(false);
    setDriftOpen(false);
    setStateLensOpen(false);
    setExamplePromptOpen(false);
    setAiPlan(null);
    setAiError("");
    setAiArchitectOpen(true);
  };

  const requestAiArchitecture = async () => {
    const prompt = aiPrompt.trim();
    if (prompt.length < 12) {
      setAiError("Describe the workload, users, data, availability, and security needs in a little more detail.");
      return;
    }

    setAiPlanning(true);
    setAiError("");
    try {
      const response = await fetch("/api/architect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ providerId, prompt }),
      });
      const payload = await response.json().catch(() => null) as
        | { plan?: unknown; code?: string; message?: string }
        | null;

      if (response.ok && payload?.plan) {
        const plan = normalizeArchitecturePlan(provider, payload.plan, "ai");
        if (plan.nodes.length === 0) throw new Error("The AI plan did not contain supported resources.");
        setAiPlan(plan);
        return;
      }
      if (payload?.code !== "AI_NOT_CONFIGURED") {
        throw new Error(payload?.message || "The AI architect could not create a plan.");
      }

      setAiPlan(createLocalArchitectureDraft(provider, prompt));
      notify("AI service is not configured — a local catalog-backed draft was created");
    } catch (error) {
      // Keep the workflow usable during local development or a temporary API
      // outage, while clearly identifying that this is not a model response.
      setAiPlan(createLocalArchitectureDraft(provider, prompt));
      setAiError(
        `${error instanceof Error ? error.message : "The AI planner is unavailable"} A local catalog-backed draft is ready for review instead.`,
      );
    } finally {
      setAiPlanning(false);
    }
  };

  const importDriftFile = async (file?: File) => {
    if (!file) return;
    setDriftImportError("");
    if (file.size > 5 * 1024 * 1024) {
      setDriftImportError("The report is larger than 5 MB. Import TFwhy's JSON output, not a Terraform state file.");
      return;
    }
    try {
      const report = parseTfwhyReport(await file.text());
      setDriftReport({ report, fileName: file.name, importedAt: new Date().toISOString() });
      setDriftOpen(true);
      setCodeOpen(false);
      notify(`${report.findings.length} TFwhy drift findings imported locally`);
    } catch (error) {
      setDriftImportError(error instanceof Error ? error.message : "Unable to read this TFwhy report.");
    }
  };

  const clearDriftReport = () => {
    setDriftReport(null);
    setDriftImportError("");
    if (driftInputRef.current) driftInputRef.current.value = "";
    notify("Drift report cleared from this tab");
  };

  const importStateFile = async (file?: File) => {
    if (!file) return;
    setStateLensError("");
    if (file.size > 25 * 1024 * 1024) {
      setStateLensImport(null);
      setStateLensError("This file is larger than 25 MB. Export a smaller state snapshot and try again.");
      return;
    }
    try {
      const preview = parseStateFile(await file.text());
      setStateLensImport({
        preview,
        fileName: file.name,
        fileSize: file.size,
        importedAt: new Date().toISOString(),
      });
      setStateLensOpen(true);
      setCodeOpen(false);
      setDriftOpen(false);
      notify(`${preview.matched.length} resources mapped locally by StateLens`);
    } catch (error) {
      setStateLensImport(null);
      setStateLensError(error instanceof Error ? error.message : "StateLens could not inspect this file.");
      setStateLensOpen(true);
    }
  };

  const clearStateImport = () => {
    setStateLensImport(null);
    setStateLensError("");
    if (stateLensInputRef.current) stateLensInputRef.current.value = "";
  };

  const buildImportedArchitecture = () => {
    if (!stateLensImport) return;
    const { preview, fileName } = stateLensImport;
    setProviderId(preview.providerId);
    setCollapsedCategories(collapsedCatalogCategories(preview.providerId));
    setSearch("");
    setCatalogFilter("all");
    setProjectName(`${providerById(preview.providerId).shortName} · ${fileName.replace(/\.(tfstate|json)$/i, "")}`);
    commit(() => ({ nodes: preview.nodes, edges: preview.edges }));
    setSelection([]);
    setSelectedEdgeId(null);
    setAiGuideNodeIds([]);
    setAiGuideIndex(0);
    setProviderPickerOpen(false);
    setExamplePromptOpen(false);
    setStartupProvider(null);
    setPendingProvider(null);
    setStateLensOpen(false);
    setWelcomeFeature(null);
    setZoom(1);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const canvas = canvasRef.current;
        if (!canvas || preview.nodes.length === 0) return;
        const minX = Math.min(...preview.nodes.map((node) => node.x));
        const minY = Math.min(...preview.nodes.map((node) => node.y));
        const maxX = Math.max(...preview.nodes.map((node) => node.x + NODE_WIDTH));
        const maxY = Math.max(...preview.nodes.map((node) => node.y + NODE_HEIGHT));
        const nextZoom = clamp(
          Math.min(
            (canvas.clientWidth - 96) / Math.max(1, maxX - minX),
            (canvas.clientHeight - 120) / Math.max(1, maxY - minY),
          ),
          0.35,
          1.15,
        );
        setZoom(nextZoom);
        window.requestAnimationFrame(() => {
          canvas.scrollTo({
            left: Math.max(0, ((minX + maxX) / 2) * nextZoom - canvas.clientWidth / 2),
            top: Math.max(0, ((minY + maxY) / 2) * nextZoom - canvas.clientHeight / 2),
          });
        });
      });
    });
    notify(`StateLens built ${preview.nodes.length} editable resources`);
  };

  /* ---------------------------------------------------------------- effects */
  // Discover a saved draft without restoring it automatically. Every browser
  // session starts at the explicit resume / example / blank decision.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      setStorageReady(true);
      return;
    }
    try {
      const parsed = JSON.parse(stored) as Partial<SavedDraft>;
      if (!parsed.providerId || !providers.some((item) => item.id === parsed.providerId)) {
        window.localStorage.removeItem(STORAGE_KEY);
        return;
      }

      // Drop anything the current catalog no longer defines so a stale save
      // cannot render an unknown service.
      const restoredProvider = providerById(parsed.providerId);
      const validNodes = (parsed.nodes ?? []).filter((node) =>
        serviceById(restoredProvider, node.serviceId),
      );
      const validIds = new Set(validNodes.map((node) => node.id));

      setProviderId(parsed.providerId);
      setCollapsedCategories(collapsedCatalogCategories(parsed.providerId));
      setSavedDraft({
        providerId: parsed.providerId,
        projectName: parsed.projectName ?? "Production web platform",
        nodes: validNodes,
        edges: (parsed.edges ?? []).filter(
          (edge) => validIds.has(edge.from) && validIds.has(edge.to),
        ),
        savedAt: parsed.savedAt,
      });
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    } finally {
      setStorageReady(true);
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (providerPickerOpen && storageReady) providerDialogRef.current?.focus();
  }, [providerPickerOpen, storageReady]);

  useEffect(() => {
    if (startupProvider || pendingProvider || examplePromptOpen) {
      decisionDialogRef.current?.focus();
    }
  }, [examplePromptOpen, pendingProvider, startupProvider]);

  useEffect(() => {
    if (aiArchitectOpen) aiDialogRef.current?.focus();
  }, [aiArchitectOpen, aiPlan]);

  useEffect(() => {
    if (providerPickerOpen || codeOpen || nodes.length > 0) return;
    const frame = window.requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.scrollTo({
        left: Math.max(0, (CANVAS_WIDTH * zoom - canvas.clientWidth) / 2),
        top: Math.max(0, (CANVAS_HEIGHT * zoom - canvas.clientHeight) / 2),
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [codeOpen, nodes.length, providerId, providerPickerOpen, zoom]);

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
      setExamplePromptOpen(false);
      setMobileLibraryOpen(false);
      notify(`${service.name} added`);

      // A stale scroll position must never make a successful drop look like it
      // failed. Keep the user's viewport when the node is already visible and
      // only recenter when it landed outside the current view.
      window.requestAnimationFrame(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const screenX = CANVAS_PAN_PADDING + node.x * zoom - canvas.scrollLeft;
        const screenY = CANVAS_PAN_PADDING + node.y * zoom - canvas.scrollTop;
        const nodeWidth = NODE_WIDTH * zoom;
        const nodeHeight = NODE_HEIGHT * zoom;
        const visible =
          screenX + nodeWidth > 24 &&
          screenX < canvas.clientWidth - 24 &&
          screenY + nodeHeight > 72 &&
          screenY < canvas.clientHeight - 24;
        if (!visible) {
          canvas.scrollTo({
            left: Math.max(
              0,
              CANVAS_PAN_PADDING +
                (node.x + NODE_WIDTH / 2) * zoom -
                canvas.clientWidth / 2,
            ),
            top: Math.max(
              0,
              CANVAS_PAN_PADDING +
                (node.y + NODE_HEIGHT / 2) * zoom -
                canvas.clientHeight / 2,
            ),
            behavior: "smooth",
          });
        }
      });
    };

  const loadSample =
    (targetProvider: ProviderId) => {
      setExamplePromptOpen(false);
      setAiGuideNodeIds([]);
      setAiGuideIndex(0);
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
          left: Math.max(
            0,
            CANVAS_PAN_PADDING +
              ((minX + maxX) / 2) * nextZoom -
              (canvas?.clientWidth ?? 0) / 2,
          ),
          top: Math.max(
            0,
            CANVAS_PAN_PADDING +
              ((minY + maxY) / 2) * nextZoom -
              (canvas?.clientHeight ?? 0) / 2,
          ),
          behavior: "smooth",
        });
      });
      notify(`Secure ${definition.shortName} production reference architecture loaded`);
    };

  const applyProvider =
    (nextId: ProviderId, withSample: boolean) => {
      const definition = providerById(nextId);
      setProviderId(nextId);
      setCollapsedCategories(collapsedCatalogCategories(nextId));
      setSearch("");
      setCatalogFilter("all");
      setProviderPickerOpen(false);
      setPendingProvider(null);
      setStartupProvider(null);
      setCodeOpen(false);
      setDriftOpen(false);
      setStateLensOpen(false);
      setWelcomeFeature(null);
      setStateLensImport(null);
      setStateLensError("");
      setDriftReport(null);
      setDriftImportError("");
      setSearch("");
      setAiGuideNodeIds([]);
      setAiGuideIndex(0);
      if (withSample) {
        loadSample(nextId);
      } else {
        if (nodes.length > 0) commit(() => emptyDoc);
        setSelection([]);
        setSelectedEdgeId(null);
        setZoom(1);
        setExamplePromptOpen(true);
        notify(`${definition.shortName} blank canvas ready`);
      }
    };

  const chooseProvider =
    (nextId: ProviderId) => {
      if (nodes.length === 0) {
        if (!storageReady) return;
        setProviderId(nextId);
        setCollapsedCategories(collapsedCatalogCategories(nextId));
        setSearch("");
        setCatalogFilter("all");
        setProviderPickerOpen(false);
        if (savedDraft) {
          setStartupProvider(nextId);
        } else {
          applyProvider(nextId, false);
        }
        return;
      }
      // Switching provider invalidates every node, so never discard work silently.
      if (nodes.length > 0 && nextId !== providerId) {
        setPendingProvider(nextId);
        return;
      }
      setProviderPickerOpen(false);
    };

  const resumeSavedDraft = () => {
    if (!savedDraft) return;
    savedDraft.nodes.forEach((node) => {
      const suffix = /-n(\d+)$/.exec(node.id);
      if (suffix) idCounter.current = Math.max(idCounter.current, Number(suffix[1]));
    });
    setProviderId(savedDraft.providerId);
    setCollapsedCategories(collapsedCatalogCategories(savedDraft.providerId));
    setSearch("");
    setCatalogFilter("all");
    setProjectName(savedDraft.projectName);
    setDoc({ nodes: savedDraft.nodes, edges: savedDraft.edges });
    setPast([]);
    setFuture([]);
    setSelection([]);
    setSelectedEdgeId(null);
    setProviderPickerOpen(false);
    setWelcomeFeature(null);
    setCodeOpen(false);
    setDriftOpen(false);
    setStateLensOpen(false);
    setDriftReport(null);
    setDriftImportError("");
    setStartupProvider(null);
    setExamplePromptOpen(false);
    setAiGuideNodeIds([]);
    setAiGuideIndex(0);
    notify(`Resumed ${savedDraft.projectName}`);
  };

  const deleteConnection = (edgeId: string) => {
    const exists = edges.some((edge) => edge.id === edgeId);
    if (!exists) return;
    commit((current) => removeDiagramEdge(current, edgeId));
    if (selectedEdgeId === edgeId) setSelectedEdgeId(null);
    notify("Selected connection removed — both resources were kept");
  };

  const deleteSelection = () => {
    if (selectedEdgeId) {
      deleteConnection(selectedEdgeId);
      return;
    }
    if (selection.length === 0) return;
    const removing = new Set(selection);
    commit((current) => ({
      nodes: current.nodes.filter((node) => !removing.has(node.id)),
      edges: current.edges.filter((edge) => !removing.has(edge.from) && !removing.has(edge.to)),
    }));
    setSelection([]);
    setAiGuideNodeIds((current) => current.filter((id) => !removing.has(id)));
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
    setZoom(1);
    setDriftReport(null);
    setDriftImportError("");
    setAiGuideNodeIds([]);
    setAiGuideIndex(0);
    setExamplePromptOpen(true);
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
    const draft: SavedDraft = {
      providerId,
      projectName,
      nodes,
      edges,
      savedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(draft),
    );
    setSavedDraft(draft);
    notify("Project saved in this browser");
  };

  /* --------------------------------------------------- canvas coordinates */
  const toCanvasPoint =
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return {
        x: (clientX - rect.left + canvas.scrollLeft - CANVAS_PAN_PADDING) / zoom,
        y: (clientY - rect.top + canvas.scrollTop - CANVAS_PAN_PADDING) / zoom,
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
      canvas.scrollLeft = Math.max(
        0,
        CANVAS_PAN_PADDING +
          ((bounds.minX + bounds.maxX) / 2) * nextZoom -
          canvas.clientWidth / 2,
      );
      canvas.scrollTop = Math.max(
        0,
        CANVAS_PAN_PADDING +
          ((bounds.minY + bounds.maxY) / 2) * nextZoom -
          canvas.clientHeight / 2,
      );
    });
  };

  const revealNode =
    (nodeId: string) => {
      const node = nodes.find((item) => item.id === nodeId);
      const canvas = canvasRef.current;
      if (!node || !canvas) return;
      canvas.scrollTo({
        left: Math.max(
          0,
          CANVAS_PAN_PADDING + node.x * zoom - canvas.clientWidth / 2 + NODE_WIDTH,
        ),
        top: Math.max(
          0,
          CANVAS_PAN_PADDING + node.y * zoom - canvas.clientHeight / 2 + NODE_HEIGHT,
        ),
        behavior: "smooth",
      });
    };

  const applyAiArchitecture = () => {
    if (!aiPlan || aiPlan.nodes.length === 0) return;

    const levels = Array.from({ length: aiPlan.nodes.length }, () => 0);
    for (let pass = 0; pass < aiPlan.nodes.length; pass += 1) {
      let changed = false;
      aiPlan.edges.forEach((edge) => {
        const next = Math.min(aiPlan.nodes.length - 1, levels[edge.from] + 1);
        if (next > levels[edge.to]) {
          levels[edge.to] = next;
          changed = true;
        }
      });
      if (!changed) break;
    }

    const columns = new Map<number, number[]>();
    levels.forEach((level, index) => columns.set(level, [...(columns.get(level) ?? []), index]));
    const maxLevel = Math.max(0, ...levels);
    const graphWidth = maxLevel * 270 + NODE_WIDTH;
    const maxStartX = Math.max(180, CANVAS_WIDTH - graphWidth - 180);
    const startX = clamp((CANVAS_WIDTH - graphWidth) / 2, 180, maxStartX);
    const ids: string[] = [];
    const plannedNodes: DiagramNode[] = aiPlan.nodes.map((node, index) => {
      const id = nextId(node.serviceId);
      ids.push(id);
      const column = columns.get(levels[index]) ?? [index];
      const row = column.indexOf(index);
      const columnHeight = (column.length - 1) * 142 + NODE_HEIGHT;
      const startY = clamp((CANVAS_HEIGHT - columnHeight) / 2, 160, CANVAS_HEIGHT - columnHeight - 160);
      return {
        id,
        serviceId: node.serviceId,
        x: clamp(startX + levels[index] * 270, 0, CANVAS_WIDTH - NODE_WIDTH),
        y: clamp(startY + row * 142, 0, CANVAS_HEIGHT - NODE_HEIGHT),
        values: planNodeDefaults(provider, node, index + 1),
      };
    });
    const plannedEdges: DiagramEdge[] = aiPlan.edges.flatMap((edge) => {
      const from = ids[edge.from];
      const to = ids[edge.to];
      return from && to ? [{ id: nextId("edge"), from, to }] : [];
    });

    commit(() => ({ nodes: plannedNodes, edges: plannedEdges }));
    setProjectName(aiPlan.title);
    setSelection(ids[0] ? [ids[0]] : []);
    setSelectedEdgeId(null);
    setAiGuideNodeIds(ids);
    setAiGuideIndex(0);
    setAiArchitectOpen(false);
    setAiPlan(null);
    setAiError("");
    setMobileInspectorOpen(true);

    const minX = Math.min(...plannedNodes.map((node) => node.x));
    const minY = Math.min(...plannedNodes.map((node) => node.y));
    const maxX = Math.max(...plannedNodes.map((node) => node.x + NODE_WIDTH));
    const maxY = Math.max(...plannedNodes.map((node) => node.y + NODE_HEIGHT));
    const canvas = canvasRef.current;
    const nextZoom = canvas
      ? clamp(
          Math.min(
            (canvas.clientWidth - 96) / Math.max(1, maxX - minX),
            (canvas.clientHeight - 120) / Math.max(1, maxY - minY),
          ),
          0.38,
          0.95,
        )
      : 0.7;
    setZoom(nextZoom);
    window.requestAnimationFrame(() => {
      canvas?.scrollTo({
        left: Math.max(0, ((minX + maxX) / 2) * nextZoom - (canvas?.clientWidth ?? 0) / 2),
        top: Math.max(0, ((minY + maxY) / 2) * nextZoom - (canvas?.clientHeight ?? 0) / 2),
        behavior: "smooth",
      });
    });
    notify(`${plannedNodes.length} editable resources created — review configuration 1 of ${plannedNodes.length}`);
  };

  const selectAiGuideStep = (index: number) => {
    const bounded = clamp(index, 0, Math.max(0, aiGuideNodeIds.length - 1));
    const nodeId = aiGuideNodeIds[bounded];
    if (!nodeId) return;
    setAiGuideIndex(bounded);
    setSelection([nodeId]);
    setSelectedEdgeId(null);
    setMobileInspectorOpen(true);
    window.requestAnimationFrame(() => revealNode(nodeId));
  };

  const focusDriftNode = (nodeId: string) => {
    setWelcomeFeature(null);
    setProviderPickerOpen(false);
    setDriftOpen(false);
    setCodeOpen(false);
    setSelection([nodeId]);
    setSelectedEdgeId(null);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => revealNode(nodeId));
    });
  };

  const focusValidationIssue = (issue: ValidationIssue) => {
    setIssuesOpen(true);
    setActiveIssueId(issue.id);
    setCodeOpen(false);
    if (issue.nodeId) {
      setSelection([issue.nodeId]);
      setSelectedEdgeId(null);
    }
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (issue.nodeId) revealNode(issue.nodeId);
        issuesPanelRef.current?.focus();
      });
    });
  };

  const openValidation = () => {
    if (issues.length === 0) {
      notify("Diagram validation is clean");
      return;
    }
    focusValidationIssue(issues[0]);
  };

  /* --------------------------------------------------------- drag and drop */
  const onCanvasDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const serviceId =
      event.dataTransfer.getData("application/infracanvas-service") ||
      event.dataTransfer.getData("text/plain");
    if (!serviceId) return;
    const point = toCanvasPoint(event.clientX, event.clientY);
    addNode(serviceId, point.x - NODE_WIDTH / 2, point.y - NODE_HEIGHT / 2);
  };

  const onNodePointerDown = (event: ReactPointerEvent<HTMLDivElement>, node: DiagramNode) => {
    event.stopPropagation();
    if (handMode) {
      event.preventDefault();
      beginCanvasPan(event.pointerId, event.clientX, event.clientY);
      return;
    }
    if (connectMode) return;
    setActiveIssueId(null);

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
    if (additive) return;

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
        const guideIndex = aiGuideNodeIds.indexOf(nodeId);
        if (guideIndex >= 0) setAiGuideIndex(guideIndex);
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
  const beginCanvasPan = (pointerId: number, clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(pointerId);
    panRef.current = {
      pointerId,
      startX: clientX,
      startY: clientY,
      scrollLeft: canvas.scrollLeft,
      scrollTop: canvas.scrollTop,
    };
    setIsPanning(true);
  };

  const onCanvasPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;

    if (handMode) {
      beginCanvasPan(event.pointerId, event.clientX, event.clientY);
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

  const selectIacTarget = (target: IacTarget) => {
    setIacTarget(target);
    const files = target === "terraform" ? generated.files : pulumiGenerated.files;
    setActiveFile(target === "terraform" ? "main.tf" : files[0]?.path ?? "Pulumi.yaml");
    notify(`${target === "terraform" ? "Terraform" : "Pulumi"} output selected`);
  };

  const downloadZip = () => {
    const blob = createZip(
      activeGenerated.files.map((file) => ({ path: file.path, contents: file.contents })),
    );
    downloadBlob(blob, `${bundleName}-${iacTarget}.zip`);
    notify(`${activeGenerated.files.length} ${iacTarget === "terraform" ? "Terraform" : "Pulumi"} files downloaded as .zip`);
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
    aiArchitectOpen,
    cancelConnection,
    codeOpen,
    connectMode,
    connectionStart,
    deleteSelection,
    duplicateSelection,
    examplePromptOpen,
    nodes,
    notify,
    pendingProvider,
    redo,
    saveProject,
    shortcutsOpen,
    snapToGrid,
    startupProvider,
    undo,
    zoomToFit,
  });
  useEffect(() => {
    commandsRef.current = {
      aiArchitectOpen,
      cancelConnection,
      codeOpen,
      connectMode,
      connectionStart,
      deleteSelection,
      duplicateSelection,
      examplePromptOpen,
      nodes,
      notify,
      pendingProvider,
      redo,
      saveProject,
      shortcutsOpen,
      snapToGrid,
      startupProvider,
      undo,
      zoomToFit,
    };
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const {
        aiArchitectOpen,
        cancelConnection,
        codeOpen,
        connectMode,
        connectionStart,
        deleteSelection,
        duplicateSelection,
        examplePromptOpen,
        nodes,
        notify,
        pendingProvider,
        redo,
        saveProject,
        shortcutsOpen,
        snapToGrid,
        startupProvider,
        undo,
        zoomToFit,
      } = commandsRef.current;

      const mod = event.metaKey || event.ctrlKey;

      if (event.key === "Escape") {
        if (aiArchitectOpen) {
          setAiArchitectOpen(false);
          setAiPlan(null);
          setAiError("");
          return;
        }
        if (shortcutsOpen) return setShortcutsOpen(false);
        if (examplePromptOpen) return setExamplePromptOpen(false);
        if (startupProvider) {
          setStartupProvider(null);
          return setProviderPickerOpen(true);
        }
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
          <span className="brand-copy">
            <span className="brand-name">InfraCanvas</span>
            <small>The Bidirectional IaC Workspace</small>
          </span>
          <span className="beta-pill">BETA</span>
        </div>

        <div className="project-title-wrap">
          <span className="breadcrumb">Projects /</span>
          <input
            aria-label="Project name"
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
          />
          <span className="saved-state">{savedDraft ? "Saved locally" : "Unsaved session"}</span>
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
          <button
            className={`builder-nav-button ${!codeOpen && !driftOpen && !stateLensOpen && !aiArchitectOpen ? "active" : ""}`}
            onClick={showBuilder}
            aria-pressed={!codeOpen && !driftOpen && !stateLensOpen && !aiArchitectOpen}
            title="Return to the architecture builder"
          >
            <span className="builder-nav-icon" aria-hidden="true"><i /><i /><i /><i /></span>
            Build
          </button>
          <button
            className={`drift-nav-button ${driftOpen ? "active" : ""}`}
            onClick={() => showDrift()}
            aria-pressed={driftOpen}
            title="Import and inspect a TFwhy drift report"
          >
            <span className="drift-nav-icon" aria-hidden="true"><i /><i /><i /></span>
            Drift
            {driftReport && <b>{driftReport.report.findings.length}</b>}
          </button>
          <button
            className={`statelens-nav-button ${stateLensOpen ? "active" : ""}`}
            onClick={() => showStateLens()}
            aria-pressed={stateLensOpen}
            title="Turn Terraform or Pulumi state into an architecture diagram"
          >
            <span className="statelens-nav-icon" aria-hidden="true"><i /><i /></span>
            StateLens
            {stateLensImport && <b>{stateLensImport.preview.matched.length}</b>}
          </button>
          <button
            className={`ai-nav-button ${aiArchitectOpen ? "active" : ""}`}
            onClick={showAiArchitect}
            aria-pressed={aiArchitectOpen}
            title="Create a configurable architecture from a natural-language brief"
          >
            <span className="ai-nav-icon" aria-hidden="true"><i /><i /><i /></span>
            AI Architect
          </button>
          <button
            className={`generate-button ${codeOpen ? "active" : ""}`}
            onClick={showGeneratedCode}
            aria-pressed={codeOpen}
          >
            <span className="code-glyph" aria-hidden="true">{"</>"}</span>
            Generate IaC
            <span className="key-hint">⌘↵</span>
          </button>
        </div>
      </header>

      <input
        ref={driftInputRef}
        className="visually-hidden"
        type="file"
        accept="application/json,.json"
        onChange={(event) => {
          void importDriftFile(event.target.files?.[0]);
          event.target.value = "";
        }}
        tabIndex={-1}
        aria-hidden="true"
      />
      <input
        ref={stateLensInputRef}
        className="visually-hidden"
        type="file"
        accept="application/json,.json,.tfstate"
        onChange={(event) => {
          void importStateFile(event.target.files?.[0]);
          event.target.value = "";
        }}
        tabIndex={-1}
        aria-hidden="true"
      />

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
            onClick={openValidation}
            aria-expanded={issuesOpen}
            aria-controls="architecture-validation"
            title={issues.length > 0 ? "Show validation details and focus the first issue" : "Diagram validation is clean"}
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
          <span>{generated.resourceCount} IaC resource blocks</span>
          {diagramOnlyNodeCount > 0 && <span>{diagramOnlyNodeCount} diagram-only</span>}
        </div>
      </div>

      {!codeOpen && !driftOpen && !stateLensOpen && (
        <section
          className="workspace"
          style={{ "--provider-accent": provider.accent } as CSSProperties}
        >
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

            <div className="catalog-summary" aria-label={`${provider.shortName} service catalog coverage`}>
              <span><strong>{provider.services.length}</strong> official services</span>
              <span><i /> {deployableServiceCount} IaC ready</span>
            </div>
            <div className="catalog-filters" role="group" aria-label="Filter services by code generation support">
              {([
                ["all", "All", provider.services.length],
                ["deployable", "IaC ready", deployableServiceCount],
                ["diagram", "Diagram", diagramServiceCount],
              ] as const).map(([value, label, count]) => (
                <button
                  key={value}
                  className={catalogFilter === value ? "selected" : ""}
                  onClick={() => setCatalogFilter(value)}
                  aria-pressed={catalogFilter === value}
                >
                  {label}<b>{count}</b>
                </button>
              ))}
            </div>

            <div className="service-library">
              {groupedServices.map(([category, items]) => {
                const collapsed = search.trim().length === 0 && collapsedCategories.includes(category);
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
                              // Some embedded browsers only preserve standard
                              // transfer types across a drag operation.
                              event.dataTransfer.setData("text/plain", service.id);
                              event.dataTransfer.effectAllowed = "copy";
                            }}
                            onClick={() => {
                              const canvas = canvasRef.current;
                              const x = canvas
                                ? (canvas.scrollLeft - CANVAS_PAN_PADDING + canvas.clientWidth / 2) /
                                  zoom
                                : 360;
                              const y = canvas
                                ? (canvas.scrollTop - CANVAS_PAN_PADDING + canvas.clientHeight / 2) /
                                  zoom
                                : 240;
                              addNode(service.id, x - NODE_WIDTH / 2, y - NODE_HEIGHT / 2);
                            }}
                            title={`Drag ${service.name} onto the canvas, or click to add it`}
                          >
                            <span
                              className="service-icon"
                              style={{ "--service-accent": service.accent } as CSSProperties}
                            >
                              <ServiceArtwork service={service} className="service-glyph" />
                            </span>
                            <span className="service-copy">
                              <strong>
                                {service.name}
                                <em className={`support-badge ${service.iacSupport === "diagram" ? "diagram" : "deployable"}`}>
                                  {service.iacSupport === "diagram" ? "Diagram" : "IaC"}
                                </em>
                              </strong>
                              <small>{service.description}</small>
                              <code>{service.iacSupport === "diagram" ? service.productFamily : service.tfType}</code>
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
              {nodes.length === 0 && (
                <>
                  <button
                    className="ai-canvas-tool"
                    onClick={showAiArchitect}
                    title="Create an architecture from a natural-language brief"
                  >
                    Design with AI
                  </button>
                  <button
                    className="load-example-tool"
                    onClick={() => setExamplePromptOpen(true)}
                    title={`Load the secure ${provider.shortName} reference architecture`}
                  >
                    Load real-world example architecture
                  </button>
                </>
              )}
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
                style={{
                  width: CANVAS_WIDTH * zoom + CANVAS_PAN_PADDING * 2,
                  height: CANVAS_HEIGHT * zoom + CANVAS_PAN_PADDING * 2,
                  position: "relative",
                }}
              >
                <div
                  className="canvas-content"
                  style={{
                    width: CANVAS_WIDTH,
                    height: CANVAS_HEIGHT,
                    position: "absolute",
                    left: CANVAS_PAN_PADDING,
                    top: CANVAS_PAN_PADDING,
                    transform: `scale(${zoom})`,
                  }}
                >
                  <svg className="edge-layer" width={CANVAS_WIDTH} height={CANVAS_HEIGHT}>
                    <defs>
                      {[...new Set(provider.services.map((service) => service.accent))].map(
                        (accent) => (
                          <marker
                            key={accent}
                            id={edgeMarkerId(provider.id, accent)}
                            viewBox="0 0 10 10"
                            refX="9"
                            refY="5"
                            markerWidth="6"
                            markerHeight="6"
                            orient="auto-start-reverse"
                          >
                            <path d="M 0 0 L 10 5 L 0 10 z" fill={accent} />
                          </marker>
                        ),
                      )}
                    </defs>
                    {edges.map((edge) => {
                      const from = nodeById.get(edge.from);
                      const to = nodeById.get(edge.to);
                      if (!from || !to) return null;
                      const fromService = serviceById(provider, from.serviceId);
                      const toService = serviceById(provider, to.serviceId);
                      const accent = fromService?.accent ?? provider.accent;
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
                          style={{ "--edge-color": accent } as CSSProperties}
                          role="button"
                          tabIndex={handMode ? -1 : 0}
                          aria-label={`Connection from ${from.values.name || fromService?.name || "resource"} to ${to.values.name || toService?.name || "resource"}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (handMode) return;
                            setSelectedEdgeId(edge.id);
                            setSelection([]);
                            setMobileInspectorOpen(true);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setSelectedEdgeId(edge.id);
                              setSelection([]);
                              setMobileInspectorOpen(true);
                            }
                            if (event.key === "Delete" || event.key === "Backspace") {
                              event.preventDefault();
                              deleteConnection(edge.id);
                            }
                          }}
                        >
                          <title>{`${from.values.name || fromService?.name || "Resource"} to ${to.values.name || toService?.name || "resource"}`}</title>
                          <path className="edge-hit" d={path} />
                          <path
                            className="edge-line"
                            d={path}
                            markerEnd={`url(#${edgeMarkerId(provider.id, accent)})`}
                          />
                        </g>
                      );
                    })}
                    {connectionStart &&
                      connectionPointer &&
                      (() => {
                        const source = nodeById.get(connectionStart);
                        if (!source) return null;
                        const sourceService = serviceById(provider, source.serviceId);
                        const accent = sourceService?.accent ?? provider.accent;
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
                            style={{ "--edge-color": accent } as CSSProperties}
                            d={`M ${x1} ${y1} C ${x1 + curve * direction} ${y1}, ${connectionPointer.x - curve * direction} ${connectionPointer.y}, ${connectionPointer.x} ${connectionPointer.y}`}
                            markerEnd={`url(#${edgeMarkerId(provider.id, accent)})`}
                          />
                        );
                      })()}
                  </svg>

                  {nodes.map((node) => {
                    const service = serviceById(provider, node.serviceId);
                    if (!service) return null;
                    const selected = selection.includes(node.id);
                    const nodeIssues = issues.filter((issue) => issue.nodeId === node.id);
                    const focusedIssue = nodeIssues.find((issue) => issue.id === activeIssueId);
                    const nodeDrift = driftByNode.get(node.id) ?? [];
                    const driftSeverity = highestDriftSeverity(nodeDrift);
                    const worst = nodeIssues.some((issue) => issue.severity === "error")
                      ? "error"
                      : nodeIssues.length > 0
                        ? "warning"
                        : "ok";
                    return (
                      <div
                        key={node.id}
                        className={`diagram-node ${selected ? "selected" : ""} ${focusedIssue ? `validation-focus validation-${focusedIssue.severity}` : ""} ${connectionStart === node.id ? "connection-start" : ""} ${driftSeverity ? `has-drift drift-${driftSeverity.toLowerCase()}` : ""} status-${worst}`}
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
                          <ServiceArtwork service={service} className="node-glyph" />
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
                        {driftSeverity && (
                          <span
                            className="node-drift-badge"
                            title={`${nodeDrift.length} TFwhy drift ${nodeDrift.length === 1 ? "finding" : "findings"}`}
                          >
                            {nodeDrift.length}
                          </span>
                        )}
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

                </div>
              </div>
            </div>

            <div className="canvas-overlays">
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
                      left: Math.max(
                        0,
                        CANVAS_PAN_PADDING +
                          (bounds.minX + ratioX * (bounds.maxX - bounds.minX)) * zoom -
                          canvas.clientWidth / 2,
                      ),
                      top: Math.max(
                        0,
                        CANVAS_PAN_PADDING +
                          (bounds.minY + ratioY * (bounds.maxY - bounds.minY)) * zoom -
                          canvas.clientHeight / 2,
                      ),
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
                      const fromService = serviceById(provider, from.serviceId);
                      return (
                        <line
                          key={edge.id}
                          x1={from.x - bounds.minX + 80 + NODE_WIDTH / 2}
                          y1={from.y - bounds.minY + 80 + NODE_HEIGHT / 2}
                          x2={to.x - bounds.minX + 80 + NODE_WIDTH / 2}
                          y2={to.y - bounds.minY + 80 + NODE_HEIGHT / 2}
                          style={
                            {
                              "--edge-color": fromService?.accent ?? provider.accent,
                            } as CSSProperties
                          }
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

              {selectedEdge && selectedEdgeFrom && selectedEdgeTo && (
                <div className="edge-selection-toolbar" role="status" aria-live="polite">
                  <span className="edge-selection-mark" aria-hidden="true"><i /><i /></span>
                  <span>
                    <small>Connection selected</small>
                    <strong>{selectedEdgeFrom.values.name} → {selectedEdgeTo.values.name}</strong>
                  </span>
                  <button
                    className="edge-delete-button"
                    onClick={() => deleteConnection(selectedEdge.id)}
                  >
                    Delete this connection
                  </button>
                  <button
                    className="edge-close-button"
                    onClick={() => setSelectedEdgeId(null)}
                    aria-label="Clear connection selection"
                  >
                    ×
                  </button>
                </div>
              )}
            </div>

            {nodes.length === 0 && (
              <div
                className="empty-canvas empty-canvas-overlay"
                role="status"
                aria-label="Blank architecture canvas"
                onPointerDown={(event) => event.stopPropagation()}
              >
                <span className="empty-canvas-graphic" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <strong>Start composing your architecture</strong>
                <p>
                  Describe your workload to AI, drag services from the library, or load a secure
                  real-world {provider.shortName} example with {SAMPLE_ARCHITECTURES[provider.id].length}{" "}
                  configured resources.
                </p>
                <div className="empty-canvas-actions">
                  <button
                    type="button"
                    className="ai-empty-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      showAiArchitect();
                    }}
                  >
                    Design with AI
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      loadSample(provider.id);
                    }}
                  >
                    Load example
                  </button>
                </div>
              </div>
            )}

            {issuesOpen && issues.length > 0 && (
              <div
                ref={issuesPanelRef}
                id="architecture-validation"
                className="issues-panel"
                aria-label="Architecture validation"
                aria-live="polite"
                tabIndex={-1}
              >
                <div className="issues-head">
                  <strong>Validation</strong>
                  <span>
                    {errorCount} {errorCount === 1 ? "error" : "errors"} · {warningCount}{" "}
                    {warningCount === 1 ? "warning" : "warnings"}
                  </span>
                  <button
                    className="issues-back-button"
                    onClick={() => {
                      setIssuesOpen(false);
                      setActiveIssueId(null);
                    }}
                    aria-label="Close validation and return to canvas"
                  >
                    <span aria-hidden="true">←</span> Back to canvas
                  </button>
                </div>
                <ul>
                  {issues.slice(0, 40).map((issue) => (
                    <li
                      key={issue.id}
                      className={`issue ${issue.severity} ${activeIssueId === issue.id ? "active" : ""}`}
                    >
                      <button
                        onClick={() => focusValidationIssue(issue)}
                        aria-current={activeIssueId === issue.id ? "true" : undefined}
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
                <h2>
                  {selectedEdge
                    ? "Connection settings"
                    : selectedService
                      ? selectedService.name
                      : "Resource settings"}
                </h2>
              </div>
              <button
                className="mobile-close"
                onClick={() => setMobileInspectorOpen(false)}
                aria-label="Close resource inspector"
              >
                ×
              </button>
            </div>

            {selectedEdge && selectedEdgeFrom && selectedEdgeTo ? (
              <div className="connection-inspector">
                <div className="connection-inspector-path" aria-label="Selected connection endpoints">
                  {[selectedEdgeFrom, selectedEdgeTo].map((node, index) => {
                    const service = serviceById(provider, node.serviceId);
                    return (
                      <span key={node.id}>
                        <i
                          className="connection-endpoint-icon"
                          style={{ "--service-accent": service?.accent ?? provider.accent } as CSSProperties}
                        >
                          {service && <ServiceArtwork service={service} className="node-glyph" />}
                        </i>
                        <b>{node.values.name}</b>
                        <small>{service?.name}</small>
                        {index === 0 && <em aria-hidden="true">→</em>}
                      </span>
                    );
                  })}
                </div>
                <div className="connection-safe-note" role="note">
                  <strong>Delete only this line</strong>
                  <p>The two services and every other connection will stay on the canvas.</p>
                </div>
                <button
                  className="danger-button connection-delete-primary"
                  onClick={() => deleteConnection(selectedEdge.id)}
                >
                  Delete selected connection
                </button>
                <p className="connection-keyboard-hint">
                  Tip: select any line and press <kbd>Delete</kbd> or <kbd>Backspace</kbd>.
                </p>
              </div>
            ) : selectedNode && selectedService ? (
              <>
                {aiGuideNodeIds.length > 0 && aiGuideNodeId === selectedNode.id && (
                  <div className="ai-config-guide" role="status" aria-live="polite">
                    <span className="ai-guide-kicker"><i /> AI configuration review</span>
                    <strong>Resource {aiGuideIndex + 1} of {aiGuideNodeIds.length}</strong>
                    <p>Review the generated name and service values below before moving forward.</p>
                    <div className="ai-guide-progress" aria-hidden="true">
                      <i style={{ width: `${((aiGuideIndex + 1) / aiGuideNodeIds.length) * 100}%` }} />
                    </div>
                    <div className="ai-guide-actions">
                      <button
                        onClick={() => selectAiGuideStep(aiGuideIndex - 1)}
                        disabled={aiGuideIndex === 0}
                      >
                        Previous
                      </button>
                      {aiGuideIndex < aiGuideNodeIds.length - 1 ? (
                        <button className="primary-small" onClick={() => selectAiGuideStep(aiGuideIndex + 1)}>
                          Save & next
                        </button>
                      ) : (
                        <button
                          className="primary-small"
                          onClick={() => {
                            setAiGuideNodeIds([]);
                            setAiGuideIndex(0);
                            notify("AI architecture configuration review complete");
                          }}
                        >
                          Finish review
                        </button>
                      )}
                    </div>
                  </div>
                )}
                <div className="selected-resource-card">
                  <span
                    className="selected-resource-icon"
                    style={{ "--service-accent": selectedService.accent } as CSSProperties}
                  >
                    <ServiceArtwork service={selectedService} className="node-glyph" />
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
                      title={`Open ${provider.shortName} documentation`}
                    >
                      docs ↗
                    </a>
                  )}
                </div>

                {selectedService.iacSupport === "diagram" && (
                  <div className="diagram-only-notice" role="note">
                    <span aria-hidden="true"><i /></span>
                    <p>
                      <strong>Architecture component</strong>
                      This official service is available for diagrams and exports. Verified Terraform
                      and Pulumi generation has not been modeled yet, so it is intentionally omitted
                      from deployment files.
                    </p>
                  </div>
                )}

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
                      {selectedService.iacSupport === "diagram" ? (
                        <>Diagram identifier: <code>{safeName(selectedNode.values.name)}</code></>
                      ) : (
                        <>Terraform address: <code>{selectedService.tfType}.{safeName(selectedNode.values.name)}</code></>
                      )}
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
                              onClick={() => deleteConnection(edge.id)}
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
                  <button className="primary-small" onClick={showGeneratedCode}>
                    {selectedService.iacSupport === "diagram" ? "Review generation" : "View code"}
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
            ref={providerDialogRef}
            className="provider-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="provider-title"
            tabIndex={-1}
          >
            <div className="modal-brand">
              <span className="brand-symbol">
                <i />
                <i />
                <i />
              </span>
              <span className="modal-brand-copy">
                <strong>InfraCanvas</strong>
                <small>The Bidirectional IaC Workspace</small>
              </span>
            </div>
            <span className="step-chip">STEP 1 OF 3</span>
            <h1 id="provider-title">One graph for your infrastructure lifecycle.</h1>
            <p>
              Prompt it, draw it, generate real IaC, import its state, and bring drift back to
              the same editable architecture.
            </p>
            <ol className="lifecycle-ribbon" aria-label="InfraCanvas bidirectional infrastructure workflow">
              <li>
                <span>01</span>
                <strong>Prompt or draw</strong>
                <small>AI + visual canvas</small>
              </li>
              <li>
                <span>02</span>
                <strong>Configure</strong>
                <small>Provider-native values</small>
              </li>
              <li>
                <span>03</span>
                <strong>Generate</strong>
                <small>Terraform + Pulumi</small>
              </li>
              <li>
                <span>04</span>
                <strong>Reconcile</strong>
                <small>StateLens + TFwhy</small>
              </li>
            </ol>
            <div className="provider-grid">
              {providers.map((item) => (
                <button
                  key={item.id}
                  className={`provider-card ${item.id === providerId ? "current" : ""}`}
                  onClick={() => chooseProvider(item.id)}
                  style={{ "--provider-accent": item.accent } as CSSProperties}
                  disabled={!storageReady && nodes.length === 0}
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
            {!storageReady && nodes.length === 0 && (
              <div className="provider-storage-status" aria-live="polite">
                Checking this browser for a saved session…
              </div>
            )}
            <div className="welcome-feature-divider" aria-hidden="true">
              <span>Or start from your existing infrastructure</span>
            </div>
            <div className="welcome-feature-grid">
              <button
                className="welcome-feature-card statelens-feature-card"
                onClick={() => showStateLens(true)}
              >
                <span className="welcome-feature-icon statelens-welcome-icon" aria-hidden="true">
                  <i /><i />
                </span>
                <span className="welcome-feature-copy">
                  <small>STATE → ARCHITECTURE</small>
                  <strong>Open StateLens</strong>
                  <p>Import Terraform or Pulumi state and reveal an editable architecture diagram.</p>
                </span>
                <span className="welcome-feature-action">Import state <i aria-hidden="true">→</i></span>
                <span className="welcome-feature-glow" aria-hidden="true" />
              </button>
              <button
                className="welcome-feature-card drift-feature-card"
                onClick={() => showDrift(true)}
              >
                <span className="welcome-feature-icon drift-welcome-icon" aria-hidden="true">
                  <i /><i /><i />
                </span>
                <span className="welcome-feature-copy">
                  <small>LIVE DRIFT INTELLIGENCE</small>
                  <strong>Inspect with TFwhy</strong>
                  <p>Import a TFwhy report, review configuration drift, and locate affected resources.</p>
                </span>
                <span className="welcome-feature-action">Open drift <i aria-hidden="true">→</i></span>
                <span className="welcome-feature-glow" aria-hidden="true" />
              </button>
            </div>
            <div className="provider-modal-footer">
              <span>
                <i /> Four cloud providers
              </span>
              <span>
                <i /> One editable graph
              </span>
              <span>
                <i /> Verified IaC output
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

      {startupProvider && savedDraft && (
        <div className="modal-backdrop" role="presentation">
          <section
            ref={decisionDialogRef}
            className="confirm-modal saved-session-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="saved-session-title"
            tabIndex={-1}
          >
            <h2 id="saved-session-title">Saved session found</h2>
            <p>
              Resume the diagram stored in this browser, or start a new blank{" "}
              {providerById(startupProvider).shortName} canvas.
            </p>
            <div
              className="saved-draft-summary"
              style={
                {
                  "--provider-accent": providerById(savedDraft.providerId).accent,
                } as CSSProperties
              }
            >
              <ProviderMark provider={savedDraft.providerId} className="saved-draft-mark" />
              <span>
                <small>Saved in this browser</small>
                <strong>{savedDraft.projectName}</strong>
                <em>
                  {providerById(savedDraft.providerId).shortName} · {savedDraft.nodes.length}{" "}
                  resources · {savedDraft.edges.length} connections
                </em>
              </span>
            </div>
            <div className="confirm-actions two-actions">
              <button className="primary-small" onClick={resumeSavedDraft}>
                Load saved session
              </button>
              <button
                className="ghost-button"
                onClick={() => applyProvider(startupProvider, false)}
              >
                Start new session
              </button>
            </div>
          </section>
        </div>
      )}

      {pendingProvider && (
        <div className="modal-backdrop" role="presentation">
          <section
            ref={decisionDialogRef}
            className="confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="switch-title"
            tabIndex={-1}
          >
            <h2 id="switch-title">Switch to {providerById(pendingProvider).shortName}?</h2>
            <p>
              {providerById(pendingProvider).shortName} uses different resources, so the{" "}
              {nodes.length} {nodes.length === 1 ? "resource" : "resources"} on your canvas cannot
              carry over.
            </p>
            <div className="confirm-actions">
              <button onClick={() => setPendingProvider(null)}>Cancel</button>
              <button className="primary-small" onClick={() => applyProvider(pendingProvider, false)}>
                Switch and start blank
              </button>
            </div>
          </section>
        </div>
      )}

      {examplePromptOpen &&
        !providerPickerOpen &&
        !startupProvider &&
        !pendingProvider &&
        nodes.length === 0 && (
          <div className="modal-backdrop example-start-backdrop" role="presentation">
            <section
              ref={decisionDialogRef}
              className="confirm-modal example-start-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="example-start-title"
              tabIndex={-1}
              style={{ "--provider-accent": provider.accent } as CSSProperties}
            >
              <span className="example-start-icon" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span className="step-chip">STEP 2 OF 3</span>
              <h2 id="example-start-title">Your {provider.shortName} canvas is ready</h2>
              <p>
                Describe what you need and get an editable architecture draft, start blank, or load
                the secure production example with {SAMPLE_ARCHITECTURES[provider.id].length} configured resources.
              </p>
              <div className="confirm-actions three-actions">
                <button className="ai-start-button" onClick={showAiArchitect}>
                  Design with AI
                </button>
                <button className="primary-small" onClick={() => loadSample(provider.id)}>
                  Load example architecture
                </button>
                <button className="ghost-button" onClick={() => setExamplePromptOpen(false)}>
                  Start with blank canvas
                </button>
              </div>
            </section>
          </div>
        )}

      {aiArchitectOpen && (
        <div
          className="modal-backdrop ai-architect-backdrop"
          role="presentation"
          onPointerDown={(event) => {
            if (event.target !== event.currentTarget) return;
            setAiArchitectOpen(false);
            setAiPlan(null);
            setAiError("");
          }}
        >
          <section
            ref={aiDialogRef}
            className="ai-architect-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ai-architect-title"
            tabIndex={-1}
            style={{ "--provider-accent": provider.accent } as CSSProperties}
          >
            <header className="ai-architect-header">
              <span className="ai-architect-symbol" aria-hidden="true"><i /><i /><i /></span>
              <span>
                <small>INFRA CANVAS AI</small>
                <strong>AI Architect</strong>
              </span>
              <span className="ai-provider-pill">
                <ProviderMark provider={provider.id} className="ai-provider-mark" />
                {provider.shortName}
              </span>
              <button
                className="ai-modal-close"
                onClick={() => {
                  setAiArchitectOpen(false);
                  setAiPlan(null);
                  setAiError("");
                }}
                aria-label="Close AI Architect"
              >
                ×
              </button>
            </header>

            {!aiPlan ? (
              <div className="ai-prompt-layout">
                <div className="ai-prompt-copy">
                  <span className="ai-mode-pill"><i /> Prompt to architecture</span>
                  <h2 id="ai-architect-title">Describe it. InfraCanvas will map it.</h2>
                  <p>
                    Explain the workload, traffic, availability, data, and security needs. You will
                    review the proposed services before anything reaches the canvas.
                  </p>
                  <div className="ai-trust-note" role="note">
                    <i aria-hidden="true" />
                    <span>
                      <strong>Architecture draft only</strong>
                      No cloud credentials are requested and nothing is deployed. Review every value before generating IaC.
                    </span>
                  </div>
                </div>
                <form
                  className="ai-prompt-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void requestAiArchitecture();
                  }}
                >
                  <label htmlFor="ai-architecture-prompt">What are you building?</label>
                  <textarea
                    id="ai-architecture-prompt"
                    value={aiPrompt}
                    onChange={(event) => setAiPrompt(event.target.value.slice(0, 4000))}
                    placeholder={`Example: A secure, highly available ${provider.shortName} application with private compute, PostgreSQL, Redis, a queue, WAF, and monitoring.`}
                    rows={7}
                    autoFocus
                  />
                  <span className="ai-character-count">{aiPrompt.length} / 4,000</span>
                  <div className="ai-example-list">
                    <small>TRY AN EXAMPLE</small>
                    {AI_ARCHITECT_EXAMPLES[provider.id].map((example) => (
                      <button key={example} type="button" onClick={() => setAiPrompt(example)}>
                        {example}
                      </button>
                    ))}
                  </div>
                  {aiError && <p className="ai-planner-message" role="alert">{aiError}</p>}
                  <div className="ai-prompt-actions">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => setAiArchitectOpen(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="ai-generate-button"
                      disabled={aiPlanning || aiPrompt.trim().length < 12}
                    >
                      {aiPlanning ? <><i className="ai-spinner" /> Planning architecture…</> : <>Generate architecture <span>→</span></>}
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="ai-plan-review">
                <div className="ai-plan-summary">
                  <span className={`ai-source-pill ${aiPlan.source}`}><i />{aiPlan.source === "ai" ? "AI generated" : "Local catalog draft"}</span>
                  <h2 id="ai-architect-title">{aiPlan.title}</h2>
                  <p>{aiPlan.summary}</p>
                  <div className="ai-plan-metrics">
                    <span><strong>{aiPlan.nodes.length}</strong> editable services</span>
                    <span><strong>{aiPlan.edges.length}</strong> connections</span>
                    <span><strong>0</strong> deployments</span>
                  </div>
                  {aiPlan.assumptions.length > 0 && (
                    <div className="ai-assumptions">
                      <strong>Review assumptions</strong>
                      <ul>{aiPlan.assumptions.map((item) => <li key={item}>{item}</li>)}</ul>
                    </div>
                  )}
                  {nodes.length > 0 && (
                    <p className="ai-replace-warning" role="note">
                      Building this draft replaces the current canvas. Undo will restore it.
                    </p>
                  )}
                </div>
                <div className="ai-service-review">
                  <header>
                    <span>
                      <small>PROPOSED ARCHITECTURE</small>
                      <strong>Catalog-backed services</strong>
                    </span>
                    <b>{provider.shortName}</b>
                  </header>
                  <ol>
                    {aiPlan.nodes.map((planNode, index) => {
                      const service = serviceById(provider, planNode.serviceId);
                      if (!service) return null;
                      return (
                        <li key={`${planNode.serviceId}-${index}`} style={{ "--service-accent": service.accent } as CSSProperties}>
                          <span className="ai-review-service-icon"><ServiceArtwork service={service} className="node-glyph" /></span>
                          <span>
                            <strong>{planNode.name}</strong>
                            <small>{service.name} · {service.category}</small>
                            <p>{planNode.reason}</p>
                          </span>
                          <b>{Object.keys(planNode.values).length} values</b>
                        </li>
                      );
                    })}
                  </ol>
                </div>
                {aiError && <p className="ai-planner-message plan-message" role="alert">{aiError}</p>}
                <footer className="ai-plan-actions">
                  <button
                    className="ghost-button"
                    onClick={() => {
                      setAiPlan(null);
                      setAiError("");
                    }}
                  >
                    ← Edit prompt
                  </button>
                  <span>Next: review every service configuration</span>
                  <button className="ai-generate-button" onClick={applyAiArchitecture}>
                    Build & configure <span>→</span>
                  </button>
                </footer>
              </div>
            )}
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
                ["Ctrl / ⌘ + ↵", "Generate Terraform or Pulumi"],
                ["Ctrl / ⌘ + Z", "Undo"],
                ["Ctrl / ⌘ + Shift + Z", "Redo"],
                ["Ctrl / ⌘ + D", "Duplicate selection"],
                ["Ctrl / ⌘ + A", "Select all"],
                ["Ctrl / ⌘ + S", "Save project"],
                ["Delete / Backspace", "Remove selected resource or connection"],
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

      {stateLensOpen && (
        <StateLensWorkspace
          loaded={stateLensImport}
          error={stateLensError}
          replacingCount={nodes.length}
          onBack={showBuilder}
          onChooseFile={() => stateLensInputRef.current?.click()}
          onFile={(file) => void importStateFile(file)}
          onClear={clearStateImport}
          onBuild={buildImportedArchitecture}
        />
      )}

      {driftOpen && (
        <DriftWorkspace
          loaded={driftReport}
          matches={driftMatches}
          error={driftImportError}
          onBack={showBuilder}
          onImport={() => driftInputRef.current?.click()}
          onClear={clearDriftReport}
          onFocusNode={focusDriftNode}
          onCopy={copyText}
        />
      )}

      {codeOpen && (
        <section className="terraform-page" aria-labelledby="code-title">
          <section className="code-modal">
            <header className="code-modal-header">
              <div>
                <button
                  className="back-design-button"
                  onClick={showBuilder}
                  aria-label="Return to the architecture canvas"
                >
                  <span aria-hidden="true">←</span>
                </button>
                <span className="code-modal-icon">&lt;/&gt;</span>
                <span>
                  <small>Step 3 · Generated infrastructure</small>
                  <h2 id="code-title">
                    {iacTarget === "terraform" ? "Terraform module" : "Pulumi TypeScript project"}
                  </h2>
                </span>
                <div className="iac-target-switcher" role="group" aria-label="Infrastructure as code output">
                  <button
                    className={iacTarget === "terraform" ? "active terraform" : "terraform"}
                    onClick={() => selectIacTarget("terraform")}
                    aria-pressed={iacTarget === "terraform"}
                  >
                    <span aria-hidden="true">TF</span>
                    Terraform
                  </button>
                  <button
                    className={iacTarget === "pulumi" ? "active pulumi" : "pulumi"}
                    onClick={() => selectIacTarget("pulumi")}
                    aria-pressed={iacTarget === "pulumi"}
                  >
                    <span className="pulumi-target-mark" aria-hidden="true"><i /><i /><i /></span>
                    Pulumi
                  </button>
                </div>
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
                  Download .zip ({activeGenerated.files.length} files)
                </button>
              </div>
            </header>

            <div className="code-summary">
              <span>
                <ProviderMark provider={provider.id} className="summary-mark" /> {provider.name}
              </span>
              <span className={`iac-summary-pill ${iacTarget}`}>
                {iacTarget === "terraform" ? "Terraform native" : "Pulumi managed"}
              </span>
              <span>{generated.resourceCount} resources</span>
              <span>{edges.length} wired references</span>
              {diagramOnlyNodeCount > 0 && <span>{diagramOnlyNodeCount} diagram-only nodes excluded</span>}
              <span className={errorCount > 0 ? "code-blocked" : "code-ready"}>
                <i />
                {errorCount > 0 ? `${errorCount} blocking issues` : "Ready for review"}
              </span>
            </div>

            {diagramOnlyNodeCount > 0 && (
              <div className="generation-coverage-note" role="note">
                <span aria-hidden="true"><i /></span>
                <p>
                  <strong>Verified generation boundary</strong>
                  {diagramOnlyNodeCount} official architecture {diagramOnlyNodeCount === 1 ? "service is" : "services are"}
                  {" "}preserved in the diagram but omitted from deployment files until its required provider configuration is modeled.
                </p>
              </div>
            )}

            <div className="code-workspace">
              <nav className="file-tree" aria-label="Generated files">
                <strong>{iacTarget === "terraform" ? "TERRAFORM MODULE" : "PULUMI PROJECT"}</strong>
                {activeGenerated.files.map((file) => (
                  <button
                    key={file.path}
                    className={file.path === currentFile?.path ? "active" : ""}
                    onClick={() => setActiveFile(file.path)}
                  >
                    <span>{fileBadge(file.language)}</span>
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
                  <span>{currentFile ? fileBadge(currentFile.language) : "txt"}</span>
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
                <span>i</span>{" "}
                {iacTarget === "terraform" ? (
                  <>Secrets are declared as <code>sensitive</code> variables. Run <code>terraform init</code>, validate, and review <code>terraform plan</code> before applying.</>
                ) : (
                  <>Pulumi manages the stack and state. Run <code>npm run bootstrap</code>, set required secrets with <code>pulumi config set --secret</code>, then review <code>npm run preview</code>.</>
                )}
              </p>
              <button onClick={downloadZip}>
                Download {iacTarget === "terraform" ? "module" : "Pulumi project"}
              </button>
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
