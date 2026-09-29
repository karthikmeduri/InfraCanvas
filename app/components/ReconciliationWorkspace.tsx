"use client";

import { Fragment, useMemo, useState } from "react";

import type {
  ReconciliationPresence,
  ReconciliationResult,
  ReconciliationStatus,
} from "@/lib/reconciliation";

type Props = {
  result: ReconciliationResult;
  providerName: string;
  stateLabel?: string;
  liveLabel?: string;
  onBack: () => void;
  onOpenStateLens: () => void;
  onOpenDrift: () => void;
  onFocusNode: (nodeId: string) => void;
};

const statusCopy: Record<ReconciliationStatus, string> = {
  aligned: "Aligned",
  attention: "Review",
  drift: "Live drift",
  untracked: "Untracked",
  pending: "Incomplete",
};

const presenceCopy: Record<ReconciliationPresence, string> = {
  present: "Present",
  missing: "Missing",
  changed: "Changed",
  unknown: "Not loaded",
  "not-applicable": "N/A",
};

function PresenceCell({ value }: { value: ReconciliationPresence }) {
  return (
    <span className={`reconcile-presence presence-${value}`}>
      <i aria-hidden="true" />
      {presenceCopy[value]}
    </span>
  );
}

export function ReconciliationWorkspace({
  result,
  providerName,
  stateLabel,
  liveLabel,
  onBack,
  onOpenStateLens,
  onOpenDrift,
  onFocusNode,
}: Props) {
  const [filter, setFilter] = useState<ReconciliationStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return result.rows.filter((row) => {
      if (filter !== "all" && row.status !== filter) return false;
      if (!normalized) return true;
      return `${row.name} ${row.address} ${row.type} ${row.explanation}`.toLowerCase().includes(normalized);
    });
  }, [filter, query, result.rows]);

  const reviewCount = result.summary.attention + result.summary.drift + result.summary.untracked;
  const sourceCount = [
    result.readiness.canvas,
    result.readiness.iac,
    result.readiness.state && !result.readiness.providerMismatch,
    result.readiness.live,
  ].filter(Boolean).length;
  const healthCopy = sourceCount < 4
    ? `${sourceCount} of 4 sources loaded`
    : reviewCount
      ? `${reviewCount} items need review`
      : "All four sources agree";

  return (
    <section className="reconcile-page" aria-labelledby="reconcile-title">
      <header className="reconcile-header">
        <div>
          <button className="back-design-button" onClick={onBack} aria-label="Return to canvas">
            <span aria-hidden="true">←</span>
          </button>
          <span className="reconcile-mark" aria-hidden="true"><i /><i /><i /><i /></span>
          <span>
            <small>FOUR-WAY CHANGE INTELLIGENCE</small>
            <h2 id="reconcile-title">Reconciliation Center</h2>
          </span>
        </div>
        <span className={`reconcile-health ${reviewCount || sourceCount < 4 ? "needs-review" : "healthy"}`} role="status">
          <i aria-hidden="true" />
          {healthCopy}
        </span>
      </header>

      <div className="reconcile-safety-strip" role="note">
        <span aria-hidden="true"><i /></span>
        <p>
          <strong>Review first, change nothing silently.</strong> This workspace compares local snapshots only.
          It never runs Terraform, contacts a cloud account, or overwrites the canvas, state, or live infrastructure.
        </p>
      </div>

      <div className="reconcile-content">
        <section className="reconcile-source-grid" aria-label="Comparison sources">
          <article className={result.readiness.canvas ? "ready" : "missing"}>
            <span className="source-index">01</span>
            <div><small>DESIRED DESIGN</small><strong>Canvas</strong><p>{result.readiness.canvas ? `${providerName} architecture in this tab` : "Add resources to the canvas"}</p></div>
            <b>{result.readiness.canvas ? "Ready" : "Empty"}</b>
          </article>
          <article className={result.readiness.iac ? "ready" : "missing"}>
            <span className="source-index">02</span>
            <div><small>GENERATED MODEL</small><strong>IaC</strong><p>{result.readiness.iac ? "Current Terraform output" : "No deployable resources generated"}</p></div>
            <b>{result.readiness.iac ? "Ready" : "Empty"}</b>
          </article>
          <article className={result.readiness.state && !result.readiness.providerMismatch ? "ready" : "missing"}>
            <span className="source-index">03</span>
            <div><small>RECORDED REALITY</small><strong>State</strong><p>{result.readiness.providerMismatch ? "Imported state belongs to another provider" : stateLabel || "Import with StateLens"}</p></div>
            {result.readiness.state && !result.readiness.providerMismatch
              ? <b>Ready</b>
              : <button onClick={onOpenStateLens}>Import</button>}
          </article>
          <article className={result.readiness.live ? "ready" : "missing"}>
            <span className="source-index">04</span>
            <div><small>LIVE OBSERVATION</small><strong>TFwhy</strong><p>{liveLabel || "Import a fresh drift scan"}</p></div>
            {result.readiness.live ? <b>Ready</b> : <button onClick={onOpenDrift}>Scan</button>}
          </article>
        </section>

        <section className="reconcile-summary" aria-label="Reconciliation summary">
          <article className="summary-aligned"><small>ALIGNED</small><strong>{result.summary.aligned}</strong><span>all loaded sources agree</span></article>
          <article className="summary-drift"><small>LIVE DRIFT</small><strong>{result.summary.drift}</strong><span>TFwhy changes detected</span></article>
          <article className="summary-attention"><small>CONFIG REVIEW</small><strong>{result.summary.attention}</strong><span>missing or different values</span></article>
          <article className="summary-untracked"><small>UNTRACKED</small><strong>{result.summary.untracked}</strong><span>outside the current design</span></article>
          <article><small>INCOMPLETE</small><strong>{result.summary.pending}</strong><span>needs another snapshot</span></article>
        </section>

        <section className="reconcile-matrix-panel">
          <header>
            <div>
              <small>RESOURCE-BY-RESOURCE EVIDENCE</small>
              <h3>{result.rows.length} reconciliation records</h3>
            </div>
            <div className="reconcile-controls">
              <label>
                <span className="visually-hidden">Search reconciliation records</span>
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search resource or address" />
              </label>
              <label>
                <span className="visually-hidden">Filter reconciliation status</span>
                <select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
                  <option value="all">All statuses</option>
                  <option value="drift">Live drift</option>
                  <option value="attention">Needs review</option>
                  <option value="untracked">Untracked</option>
                  <option value="aligned">Aligned</option>
                  <option value="pending">Incomplete</option>
                </select>
              </label>
            </div>
          </header>

          <div className="reconcile-table-wrap">
            <table className="reconcile-table">
              <thead>
                <tr>
                  <th scope="col">Resource</th>
                  <th scope="col">Canvas</th>
                  <th scope="col">IaC</th>
                  <th scope="col">State</th>
                  <th scope="col">Live</th>
                  <th scope="col">Result</th>
                  <th scope="col"><span className="visually-hidden">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <Fragment key={row.key}>
                  <tr className={`reconcile-row status-${row.status}`}>
                    <td>
                      <strong>{row.name}</strong>
                      <code title={row.address}>{row.address}</code>
                    </td>
                    <td><PresenceCell value={row.canvas} /></td>
                    <td><PresenceCell value={row.iac} /></td>
                    <td><PresenceCell value={row.state} /></td>
                    <td><PresenceCell value={row.live} /></td>
                    <td>
                      <span className={`reconcile-status status-${row.status}`}><i />{statusCopy[row.status]}</span>
                      {row.highestSeverity && <small className={`reconcile-severity severity-${row.highestSeverity.toLowerCase()}`}>{row.highestSeverity}</small>}
                    </td>
                    <td>
                      <button
                        className="reconcile-review-button"
                        onClick={() => setExpanded((current) => current === row.key ? null : row.key)}
                        aria-expanded={expanded === row.key}
                      >
                        {expanded === row.key ? "Close" : "Review"}
                      </button>
                      {row.nodeId && <button className="reconcile-locate-button" onClick={() => onFocusNode(row.nodeId!)}>Locate</button>}
                    </td>
                  </tr>
                  {expanded === row.key && (
                    <tr className="reconcile-detail-row">
                      <td className="reconcile-detail-cell" colSpan={7}>
                        <div className="reconcile-detail">
                          <div><small>WHAT CHANGED</small><p>{row.explanation}</p></div>
                          <div><small>SAFE NEXT STEP</small><p>{row.recommendation}</p></div>
                          {row.differences.length > 0 && (
                            <dl>
                              {row.differences.map((difference) => (
                                <div key={difference.field}>
                                  <dt>{difference.field}</dt>
                                  <dd><span>Canvas <code>{difference.canvasValue}</code></span><span>State <code>{difference.stateValue}</code></span></dd>
                                </div>
                              ))}
                            </dl>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="reconcile-empty"><strong>No records match this view.</strong><span>Clear the search or choose another status.</span></div>
            )}
          </div>
        </section>

        <footer className="reconcile-footer">
          <span><i aria-hidden="true" /><p><strong>Live means the imported TFwhy snapshot</strong><small>A direct short-lived cloud connection is deliberately reserved for the next secure-identity feature.</small></p></span>
          <button onClick={onBack}>Return to architecture <span>→</span></button>
        </footer>
      </div>
    </section>
  );
}
