"use client";

import { type CSSProperties, useMemo, useRef, useState } from "react";

import {
  componentPackageJson,
  componentParameterCandidates,
  createComponentVersion,
  instantiateComponentVersion,
  latestComponentVersion,
  mergeImportedComponent,
  nextPatchVersion,
  parseComponentPackage,
  upsertComponentPackage,
  type ArchitectureComponentPackage,
  type ArchitectureComponentVersion,
  type ComponentLibrary,
} from "@/lib/architecture-components";
import { providerById, serviceById } from "@/lib/catalog";
import { ProviderMark, ServiceArtwork } from "@/lib/icons";
import type { DiagramEdge, DiagramNode, ProviderId } from "@/lib/types";

type Props = {
  providerId: ProviderId;
  selectedNodes: DiagramNode[];
  diagramEdges: DiagramEdge[];
  library: ComponentLibrary;
  onLibraryChange: (library: ComponentLibrary) => void;
  onInsert: (component: ArchitectureComponentPackage, version: ArchitectureComponentVersion, overrides: Record<string, string>) => void;
  onBack: () => void;
  onNotify: (message: string) => void;
};

const download = (contents: string, filename: string) => {
  const url = URL.createObjectURL(new Blob([contents], { type: "application/json;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const safeFileName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "component";

export function ArchitectureComponentsWorkspace({
  providerId,
  selectedNodes,
  diagramEdges,
  library,
  onLibraryChange,
  onInsert,
  onBack,
  onNotify,
}: Props) {
  const provider = providerById(providerId);
  const [selectedComponentId, setSelectedComponentId] = useState(library[0]?.id ?? "");
  const [selectedVersion, setSelectedVersion] = useState("");
  const [targetComponentId, setTargetComponentId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [version, setVersion] = useState("1.0.0");
  const [changelog, setChangelog] = useState("Initial reusable component");
  const [parameterTargets, setParameterTargets] = useState<string[]>([]);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const importRef = useRef<HTMLInputElement>(null);

  const filteredLibrary = library.filter((component) =>
    `${component.name} ${component.description} ${component.providerId}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const selectedComponent = library.find((component) => component.id === selectedComponentId) ?? filteredLibrary[0];
  const activeVersion = selectedComponent?.versions.find((item) => item.version === selectedVersion)
    ?? (selectedComponent ? latestComponentVersion(selectedComponent) : undefined);
  const candidates = useMemo(
    () => componentParameterCandidates(provider, selectedNodes).slice(0, 64),
    [provider, selectedNodes],
  );

  const chooseTarget = (id: string) => {
    setTargetComponentId(id);
    const component = library.find((item) => item.id === id);
    if (!component) {
      setName("");
      setDescription("");
      setVersion("1.0.0");
      setChangelog("Initial reusable component");
      return;
    }
    const latest = latestComponentVersion(component);
    setName(component.name);
    setDescription(component.description);
    setVersion(nextPatchVersion(latest.version));
    setChangelog("");
  };

  const toggleParameter = (target: string) => {
    setParameterTargets((current) => current.includes(target)
      ? current.filter((item) => item !== target)
      : [...current, target]);
  };

  const saveVersion = () => {
    setError("");
    try {
      const existing = library.find((item) => item.id === targetComponentId);
      const created = createComponentVersion({
        provider,
        selectedNodes,
        diagramEdges,
        version,
        changelog,
        parameterTargets: new Set(parameterTargets),
        createdAt: new Date().toISOString(),
      });
      const id = existing?.id ?? `component-${crypto.randomUUID()}`;
      const next = upsertComponentPackage(library, { id, name, description, providerId }, created);
      onLibraryChange(next);
      setSelectedComponentId(id);
      setSelectedVersion(created.version);
      setTargetComponentId(id);
      setVersion(nextPatchVersion(created.version));
      setChangelog("");
      setParameterTargets([]);
      onNotify(`${name} ${created.version} saved to the local component library`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save this component version.");
    }
  };

  const importPackage = async (file?: File) => {
    if (!file) return;
    setError("");
    if (file.size > 1024 * 1024) {
      setError("Component package exceeds the 1 MB safety limit.");
      return;
    }
    try {
      const imported = parseComponentPackage(await file.text(), providerById);
      const next = mergeImportedComponent(library, imported);
      onLibraryChange(next);
      setSelectedComponentId(imported.id);
      setSelectedVersion(latestComponentVersion(imported).version);
      onNotify(`${imported.name} imported after catalog and integrity validation`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to import this component package.");
    }
  };

  const insert = () => {
    if (!selectedComponent || !activeVersion) return;
    setError("");
    try {
      // Validate the override surface before the page commits anything.
      instantiateComponentVersion(selectedComponent, activeVersion, overrides, { x: 0, y: 0 }, "preview");
      onInsert(selectedComponent, activeVersion, overrides);
      onNotify(`${selectedComponent.name} ${activeVersion.version} added with fresh resource ids`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to add this component.");
    }
  };

  return (
    <section className="component-page" aria-labelledby="component-page-title">
      <header className="component-header">
        <div>
          <button className="back-design-button" onClick={onBack} aria-label="Return to architecture canvas"><span aria-hidden="true">←</span></button>
          <span className="component-mark" aria-hidden="true"><i /><i /><i /></span>
          <span><small>LOCAL COMPONENT REGISTRY</small><h2 id="component-page-title">Reusable architecture components</h2></span>
        </div>
        <div className="component-header-actions">
          <button className="component-secondary-button" onClick={() => importRef.current?.click()}>Import package</button>
          {selectedComponent && <button className="component-secondary-button" onClick={() => download(componentPackageJson(selectedComponent), `${safeFileName(selectedComponent.name)}.infracanvas-component.json`)}>Export package</button>}
        </div>
      </header>
      <input ref={importRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={(event) => { void importPackage(event.target.files?.[0]); event.target.value = ""; }} />

      <div className="component-boundary-strip"><span className="component-shield" aria-hidden="true" /><p><strong>Portable and redacted.</strong> Packages contain catalog-allowlisted topology and defaults. Credential-shaped fields and values never enter the registry.</p></div>
      {error && <p className="component-error" role="alert">{error}<button onClick={() => setError("")} aria-label="Dismiss error">×</button></p>}

      <div className="component-layout">
        <aside className="component-library-panel">
          <header><div><small>REGISTRY</small><h3>Component library</h3></div><span>{library.length}</span></header>
          <label className="component-search"><span aria-hidden="true" /><input value={query} placeholder="Search components" aria-label="Search components" onChange={(event) => setQuery(event.target.value)} /></label>
          <div className="component-list">
            {filteredLibrary.map((component) => {
              const latest = latestComponentVersion(component);
              return <button key={component.id} className={selectedComponent?.id === component.id ? "active" : ""} onClick={() => { setSelectedComponentId(component.id); setSelectedVersion(latest.version); setOverrides({}); }}>
                <ProviderMark provider={component.providerId} className="component-provider-mark" />
                <span><strong>{component.name}</strong><small>{component.description || "Reusable architecture building block"}</small><em>{latest.version} · {latest.nodes.length} resources</em></span>
                <i aria-hidden="true">›</i>
              </button>;
            })}
            {filteredLibrary.length === 0 && <div className="component-empty-list"><span aria-hidden="true"><i /><i /></span><strong>No components yet</strong><p>Select resources on the canvas, then capture your first reusable building block.</p></div>}
          </div>
        </aside>

        <main className="component-detail-panel">
          {selectedComponent && activeVersion ? <>
            <header className="component-detail-header">
              <div><ProviderMark provider={selectedComponent.providerId} className="component-detail-mark" /><span><small>{providerById(selectedComponent.providerId).name}</small><h3>{selectedComponent.name}</h3></span></div>
              <span className="component-immutable-pill"><i />Immutable version</span>
            </header>
            <p className="component-description">{selectedComponent.description || "Reusable catalog-constrained architecture component."}</p>
            <div className="component-stats">
              <span><strong>{activeVersion.nodes.length}</strong> resources</span><span><strong>{activeVersion.edges.length}</strong> internal connections</span><span><strong>{activeVersion.parameters.length}</strong> typed inputs</span><code>{activeVersion.digest}</code>
            </div>
            <section className="component-topology">
              <header><small>TOPOLOGY</small><label>Version<select value={activeVersion.version} onChange={(event) => { setSelectedVersion(event.target.value); setOverrides({}); }}>{[...selectedComponent.versions].reverse().map((item) => <option key={item.version} value={item.version}>{item.version}</option>)}</select></label></header>
              <div className="component-node-grid">{activeVersion.nodes.map((node) => { const service = serviceById(providerById(selectedComponent.providerId), node.serviceId); return <article key={node.ref} style={{ "--component-accent": service?.accent ?? "#6366f1" } as CSSProperties}>{service ? <ServiceArtwork service={service} className="component-service-icon" /> : null}<span><strong>{node.values.name || service?.name || node.serviceId}</strong><small>{service?.category ?? "Resource"}</small></span></article>; })}</div>
            </section>
            <section className="component-inputs">
              <header><div><small>TYPED INPUT CONTRACT</small><h4>Configure this instance</h4></div><span>{activeVersion.parameters.length} inputs</span></header>
              {activeVersion.parameters.length ? <div className="component-input-grid">{activeVersion.parameters.map((parameter) => <label key={parameter.id}><span>{parameter.label}<em>{parameter.type}</em></span>{parameter.type === "enum" ? <select value={overrides[parameter.id] ?? parameter.defaultValue} onChange={(event) => setOverrides((current) => ({ ...current, [parameter.id]: event.target.value }))}>{parameter.options?.map((option) => <option key={option}>{option}</option>)}</select> : parameter.type === "boolean" ? <select value={overrides[parameter.id] ?? parameter.defaultValue} onChange={(event) => setOverrides((current) => ({ ...current, [parameter.id]: event.target.value }))}><option value="true">true</option><option value="false">false</option></select> : <input type={parameter.type === "number" ? "number" : "text"} value={overrides[parameter.id] ?? parameter.defaultValue} onChange={(event) => setOverrides((current) => ({ ...current, [parameter.id]: event.target.value }))} />}</label>)}</div> : <p className="component-no-inputs">This version has no exposed inputs. Its safe defaults will be used as captured.</p>}
            </section>
            <section className="component-release-note"><span className="component-timeline-dot" /><div><small>VERSION {activeVersion.version} · {new Date(activeVersion.createdAt).toLocaleDateString()}</small><p>{activeVersion.changelog || "No release note provided."}</p></div></section>
            <footer className="component-detail-footer"><p><span aria-hidden="true">i</span> External connections are intentionally excluded. Connect the new instance to its environment after insertion.</p><button disabled={selectedComponent.providerId !== providerId} onClick={insert}>{selectedComponent.providerId === providerId ? "Add component to canvas" : `Switch to ${providerById(selectedComponent.providerId).shortName} to add`}</button></footer>
          </> : <div className="component-empty-detail"><span className="component-empty-graphic" aria-hidden="true"><i /><i /><i /></span><small>BUILD ONCE · REUSE SAFELY</small><h3>Your architecture, packaged as a contract.</h3><p>Capture a working subgraph, expose only the values consumers should configure, and keep every release immutable and reviewable.</p></div>}
        </main>

        <aside className="component-capture-panel">
          <header><div><small>CAPTURE SELECTION</small><h3>Create a version</h3></div><span className={selectedNodes.length ? "ready" : ""}>{selectedNodes.length} selected</span></header>
          {selectedNodes.length ? <div className="component-capture-form">
            <label>Publish to<select value={targetComponentId} onChange={(event) => chooseTarget(event.target.value)}><option value="">New component</option>{library.filter((component) => component.providerId === providerId).map((component) => <option key={component.id} value={component.id}>New {component.name} version</option>)}</select></label>
            <label>Component name<input value={name} maxLength={80} placeholder="e.g. Private web tier" onChange={(event) => setName(event.target.value)} /></label>
            <label>Description<textarea value={description} maxLength={300} placeholder="What this building block provides" onChange={(event) => setDescription(event.target.value)} /></label>
            <div className="component-version-row"><label>Semantic version<input value={version} maxLength={40} placeholder="1.0.0" onChange={(event) => setVersion(event.target.value)} /></label><span>Immutable after save</span></div>
            <label>Release note<textarea value={changelog} maxLength={500} placeholder="What changed in this version" onChange={(event) => setChangelog(event.target.value)} /></label>
            <fieldset><legend>Expose typed inputs <span>{parameterTargets.length}/64</span></legend><p>Checked values become configurable when this component is inserted.</p><div className="component-candidate-list">{candidates.map((candidate) => <label key={candidate.target}><input type="checkbox" checked={parameterTargets.includes(candidate.target)} onChange={() => toggleParameter(candidate.target)} /><span><strong>{candidate.label}</strong><small>{candidate.nodeLabel} · {candidate.type}</small></span></label>)}</div></fieldset>
            <button className="component-save-button" disabled={!name.trim() || !version.trim()} onClick={saveVersion}>{targetComponentId ? "Publish immutable version" : "Save reusable component"}</button>
            <p className="component-capture-note"><span aria-hidden="true">i</span> Only connections fully inside the selection are captured. Sensitive and unknown fields are dropped.</p>
          </div> : <div className="component-selection-empty"><span className="component-select-graphic" aria-hidden="true"><i /><i /></span><strong>Select canvas resources first</strong><p>Return to the builder and Shift-click or marquee-select the resources that form one reusable unit.</p><button onClick={onBack}>Return to canvas</button></div>}
        </aside>
      </div>
    </section>
  );
}
