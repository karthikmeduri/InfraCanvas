"use client";

import { useMemo, useState } from "react";

import {
  DRIFT_SEVERITIES,
  type DriftMatch,
  type DriftSeverity,
  type TfwhyReport,
} from "@/lib/drift";

type LoadedReport = {
  report: TfwhyReport;
  fileName: string;
  importedAt: string;
};

type Props = {
  loaded: LoadedReport | null;
  matches: DriftMatch[];
  error: string;
  onBack: () => void;
  onImport: () => void;
  onClear: () => void;
  onFocusNode: (nodeId: string) => void;
  onCopy: (text: string, message: string) => void;
};

const severityLabel: Record<DriftSeverity, string> = {
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
  INFO: "Info",
};

export function DriftWorkspace({
  loaded,
  matches,
  error,
  onBack,
  onImport,
  onClear,
  onFocusNode,
  onCopy,
}: Props) {
  const [severity, setSeverity] = useState<DriftSeverity | "ALL">("ALL");
  const [matchFilter, setMatchFilter] = useState<"all" | "matched" | "unmatched">("all");
  const scanCommand = "tfwhy drift --chdir . --json > tfwhy-drift.json";
  const offlineCommands = [
    "terraform plan -refresh-only -out=tfplan",
    "terraform show -json tfplan > plan.json",
    "tfwhy drift plan.json --offline --json > tfwhy-drift.json",
  ].join("\n");

  const filtered = useMemo(
    () => matches.filter((match) => {
      if (severity !== "ALL" && match.finding.severity !== severity) return false;
      if (matchFilter === "matched" && !match.nodeId) return false;
      if (matchFilter === "unmatched" && match.nodeId) return false;
      return true;
    }),
    [matchFilter, matches, severity],
  );
  const matchedCount = matches.filter((match) => match.nodeId).length;

  return (
    <section className="drift-page" aria-labelledby="drift-title">
      <header className="drift-header">
        <div>
          <button className="back-design-button" onClick={onBack} aria-label="Return to canvas">
            <span aria-hidden="true">←</span>
          </button>
          <span className="drift-mark" aria-hidden="true"><i /><i /><i /></span>
          <span>
            <small>TFwhy · local drift intelligence</small>
            <h2 id="drift-title">Infrastructure drift</h2>
          </span>
        </div>
        <div className="drift-header-actions">
          {loaded && <button className="ghost-button" onClick={onClear}>Clear report</button>}
          <button className="drift-import-button" onClick={onImport}>Import TFwhy JSON</button>
        </div>
      </header>

      <div className="drift-privacy-strip">
        <span aria-hidden="true">⌾</span>
        <p><strong>Local by design.</strong> Your report is parsed in this browser tab. InfraCanvas does not upload Terraform state, cloud credentials, or report contents.</p>
      </div>

      {!loaded ? (
        <div className="drift-onboarding">
          <section className="drift-hero-card">
            <span className="eyebrow">CLOSE THE LOOP</span>
            <h3>See real infrastructure changes on the canvas.</h3>
            <p>Run TFwhy beside your Terraform project, import its machine-readable report, and InfraCanvas will match drift to the resources you designed.</p>
            <div className="drift-flow" aria-label="Drift detection workflow">
              <span><b>1</b> Refresh cloud state</span><i>→</i>
              <span><b>2</b> Analyze with TFwhy</span><i>→</i>
              <span><b>3</b> Highlight the canvas</span>
            </div>
            <button className="drift-import-button large" onClick={onImport}>Choose TFwhy report</button>
            {error && <p className="drift-error" role="alert">{error}</p>}
          </section>

          <section className="drift-command-card">
            <div>
              <span className="command-index">01</span>
              <span><strong>Run a fresh drift scan</strong><small>TFwhy asks Terraform/OpenTofu for a refresh-only plan.</small></span>
            </div>
            <pre><code>{scanCommand}</code></pre>
            <button onClick={() => onCopy(scanCommand, "TFwhy scan command copied")}>Copy command</button>
          </section>

          <section className="drift-command-card">
            <div>
              <span className="command-index">02</span>
              <span><strong>Or analyze an existing plan offline</strong><small>TFwhy makes no network calls when given plan JSON with --offline.</small></span>
            </div>
            <pre><code>{offlineCommands}</code></pre>
            <button onClick={() => onCopy(offlineCommands, "Offline workflow copied")}>Copy commands</button>
          </section>
        </div>
      ) : (
        <div className="drift-results">
          <section className="drift-summary-grid">
            <article className="drift-summary-card report-card">
              <small>REPORT</small>
              <strong title={loaded.fileName}>{loaded.fileName}</strong>
              <span>Imported {new Date(loaded.importedAt).toLocaleString()}</span>
            </article>
            {DRIFT_SEVERITIES.slice(0, 4).map((level) => (
              <article className={`drift-summary-card severity-${level.toLowerCase()}`} key={level}>
                <small>{severityLabel[level]}</small>
                <strong>{matches.filter((match) => match.finding.severity === level).length}</strong>
                <span>findings</span>
              </article>
            ))}
            <article className="drift-summary-card match-card">
              <small>CANVAS MATCH</small>
              <strong>{matchedCount}<em>/{matches.length}</em></strong>
              <span>resources located</span>
            </article>
          </section>

          {(loaded.report.errored || loaded.report.warnings.length > 0) && (
            <section className="drift-report-warning" role="alert">
              <strong>{loaded.report.errored ? "TFwhy marked this plan as errored." : "TFwhy report warning"}</strong>
              {loaded.report.warnings.map((warning) => <span key={warning}>{warning}</span>)}
            </section>
          )}

          <section className="drift-findings-panel">
            <header>
              <div><small>DETECTED CHANGES</small><h3>{matches.length} drift {matches.length === 1 ? "finding" : "findings"}</h3></div>
              <div className="drift-filters">
                <select value={severity} onChange={(event) => setSeverity(event.target.value as DriftSeverity | "ALL")} aria-label="Filter by severity">
                  <option value="ALL">All severities</option>
                  {DRIFT_SEVERITIES.map((level) => <option key={level} value={level}>{severityLabel[level]}</option>)}
                </select>
                <select value={matchFilter} onChange={(event) => setMatchFilter(event.target.value as typeof matchFilter)} aria-label="Filter by canvas match">
                  <option value="all">All resources</option>
                  <option value="matched">Matched on canvas</option>
                  <option value="unmatched">Not on canvas</option>
                </select>
              </div>
            </header>

            {filtered.length === 0 ? (
              <div className="drift-empty-result"><strong>No findings match these filters.</strong><span>Adjust a filter to see the rest of the report.</span></div>
            ) : (
              <div className="drift-finding-list">
                {filtered.map(({ finding, nodeId, expectedAddress }, index) => (
                  <article className={`drift-finding severity-${finding.severity.toLowerCase()}`} key={`${finding.address}-${index}`}>
                    <span className="drift-severity">{finding.severity}</span>
                    <div className="drift-finding-body">
                      <div><code>{finding.address}</code><span className="drift-action">{finding.action}</span>{finding.stateful && <span className="stateful-pill">Stateful</span>}</div>
                      <strong>{finding.title}</strong>
                      {finding.detail && <p>{finding.detail}</p>}
                      {expectedAddress && expectedAddress !== finding.address && <small>Matched to <code>{expectedAddress}</code></small>}
                    </div>
                    {nodeId ? (
                      <button className="locate-node-button" onClick={() => onFocusNode(nodeId)}>Locate on canvas <span>→</span></button>
                    ) : (
                      <span className="unmatched-pill">Not on this canvas</span>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  );
}

export type { LoadedReport };
