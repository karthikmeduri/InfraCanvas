"use client";

import { type CSSProperties, useMemo, useState } from "react";

import type { ArchitectureOverlay, OverlaySeverity } from "@/lib/overlays";
import type { ProviderDefinition } from "@/lib/types";

type OverlayWorkspaceProps = {
  provider: ProviderDefinition;
  overlay: ArchitectureOverlay;
  onBack: () => void;
  onFocusNode: (nodeId: string) => void;
};

type View = "all" | "cost" | "security";
const severityOrder: OverlaySeverity[] = ["critical", "high", "medium", "low", "info"];
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);

export function OverlayWorkspace({ provider, overlay, onBack, onFocusNode }: OverlayWorkspaceProps) {
  const [view, setView] = useState<View>("all");
  const [severity, setSeverity] = useState<OverlaySeverity | "all">("all");
  const rows = useMemo(() => overlay.resources
    .map((resource) => ({ ...resource, visibleFindings: resource.findings.filter((finding) => severity === "all" || finding.severity === severity) }))
    .filter((resource) => view !== "security" || resource.visibleFindings.length > 0)
    .sort((a, b) => b.cost.high - a.cost.high), [overlay.resources, severity, view]);
  const maxCost = Math.max(1, ...overlay.resources.map((resource) => resource.cost.high));

  return (
    <section className="overlay-page" aria-labelledby="overlay-title">
      <header className="overlay-header">
        <div>
          <button className="overlay-back" onClick={onBack} aria-label="Return to architecture canvas">←</button>
          <span className="overlay-orbit" aria-hidden="true"><i /><i /><i /></span>
          <span>
            <small>LOCAL ARCHITECTURE ANALYSIS · {provider.shortName}</small>
            <h1 id="overlay-title">Cost &amp; security insights</h1>
            <p>Prioritize expensive components and risky configuration before deployment.</p>
          </span>
        </div>
        <div className="overlay-view-switcher" role="group" aria-label="Insight view">
          {(["all", "cost", "security"] as View[]).map((item) => (
            <button key={item} className={view === item ? "active" : ""} onClick={() => setView(item)} aria-pressed={view === item}>
              {item === "all" ? "Combined" : item === "cost" ? "Cost" : "Security"}
            </button>
          ))}
        </div>
      </header>

      {overlay.resources.length === 0 ? (
        <div className="overlay-empty">
          <span className="overlay-empty-mark" aria-hidden="true"><i /><i /><i /></span>
          <h2>Build an architecture to unlock insights</h2>
          <p>Add configured resources to the canvas. InfraCanvas will create a local planning range and flag risky settings.</p>
          <button onClick={onBack}>Return to builder</button>
        </div>
      ) : (
        <div className="overlay-shell">
          <section className="overlay-summary" aria-label="Architecture insight summary">
            <article className="overlay-metric cost-metric">
              <span className="metric-icon" aria-hidden="true">$</span>
              <div><small>PLANNING RANGE / MONTH</small><strong>{money(overlay.cost.low)}–{money(overlay.cost.high)}</strong><p>{overlay.cost.covered} of {overlay.resources.length} resources covered</p></div>
            </article>
            <article className="overlay-metric score-metric">
              <span className="score-ring" style={{ "--score": `${overlay.security.score * 3.6}deg` } as CSSProperties}><b>{overlay.security.score}</b></span>
              <div><small>CONFIGURATION POSTURE</small><strong>{overlay.security.score >= 85 ? "Strong" : overlay.security.score >= 65 ? "Needs review" : "Action required"}</strong><p>Heuristic score, not a compliance grade</p></div>
            </article>
            <article className="overlay-metric findings-metric">
              <span className="metric-icon shield-icon" aria-hidden="true"><i /></span>
              <div><small>OPEN FINDINGS</small><strong>{overlay.security.findings.length}</strong><p>{overlay.security.counts.critical + overlay.security.counts.high} critical or high priority</p></div>
            </article>
            <article className="overlay-metric coverage-metric">
              <span className="metric-icon layers-icon" aria-hidden="true"><i /><i /><i /></span>
              <div><small>ANALYZED</small><strong>{overlay.resources.length}</strong><p>{overlay.cost.unpriced ? `${overlay.cost.unpriced} unpriced diagram-only` : "All resources have planning bands"}</p></div>
            </article>
          </section>

          <section className="overlay-toolbar">
            <div><strong>Resource intelligence</strong><span>Sorted by upper planning range</span></div>
            {view !== "cost" && <label>Severity <select value={severity} onChange={(event) => setSeverity(event.target.value as OverlaySeverity | "all")}><option value="all">All findings</option>{severityOrder.map((item) => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}</select></label>}
          </section>

          <div className="overlay-grid">
            <section className="overlay-resource-list" aria-label="Resource insights">
              {rows.length === 0 ? <p className="overlay-no-results">No findings match this severity filter.</p> : rows.map((resource) => (
                <article className="overlay-resource-card" key={resource.nodeId}>
                  <header>
                    <span className="overlay-resource-mark" aria-hidden="true"><i /></span>
                    <div><strong>{resource.resourceName}</strong><small>{resource.serviceName} · {resource.role}</small></div>
                    <button onClick={() => onFocusNode(resource.nodeId)}>Locate on canvas <span>↗</span></button>
                  </header>
                  {view !== "security" && <div className="resource-cost-row">
                    <div><span><b>{money(resource.cost.low)}–{money(resource.cost.high)}</b> / month</span><small>{resource.cost.confidence === "modeled" ? "Configuration-adjusted band" : "Baseline band"}</small></div>
                    <span className="cost-track"><i style={{ width: `${Math.max(2, resource.cost.high / maxCost * 100)}%` }} /></span>
                    <p>{resource.drivers.join(" · ")}</p>
                  </div>}
                  {view !== "cost" && <div className="resource-findings">
                    {resource.visibleFindings.length === 0 ? <p className="finding-clean"><i /> No flagged configuration patterns</p> : resource.visibleFindings.map((finding) => (
                      <div className={`overlay-finding ${finding.severity}`} key={finding.id}>
                        <span>{finding.severity}</span>
                        <div><strong>{finding.title}</strong><p>{finding.detail}</p><small>{finding.recommendation}</small></div>
                      </div>
                    ))}
                  </div>}
                </article>
              ))}
            </section>

            <aside className="overlay-assumptions">
              <span className="assumption-eyebrow"><i /> INTERPRET WITH CONTEXT</span>
              <h2>Planning aid, not a bill</h2>
              <p>InfraCanvas intentionally uses broad ranges so a diagram never looks more precise than its configuration.</p>
              <ol>{overlay.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}</ol>
              <div className="overlay-privacy"><span aria-hidden="true"><i /></span><p><strong>Private by design</strong>Analysis runs locally and credential-shaped properties are excluded.</p></div>
              <a href={provider.id === "aws" ? "https://calculator.aws/" : provider.id === "azure" ? "https://azure.microsoft.com/pricing/calculator/" : provider.id === "gcp" ? "https://cloud.google.com/products/calculator" : "https://www.oracle.com/cloud/costestimator.html"} target="_blank" rel="noreferrer">Open official {provider.shortName} calculator <span>↗</span></a>
            </aside>
          </div>
        </div>
      )}
    </section>
  );
}
