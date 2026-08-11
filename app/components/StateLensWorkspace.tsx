"use client";

import { useState, type CSSProperties, type DragEvent } from "react";

import { providerById } from "@/lib/catalog";
import { ProviderMark, ServiceGlyph } from "@/lib/icons";
import type { StateLensPreview } from "@/lib/state-lens";

export type LoadedState = {
  preview: StateLensPreview;
  fileName: string;
  fileSize: number;
  importedAt: string;
};

type Props = {
  loaded: LoadedState | null;
  error: string;
  replacingCount: number;
  onBack: () => void;
  onChooseFile: () => void;
  onFile: (file: File) => void;
  onClear: () => void;
  onBuild: () => void;
};

const readableBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export function StateLensWorkspace({
  loaded,
  error,
  replacingCount,
  onBack,
  onChooseFile,
  onFile,
  onClear,
  onBuild,
}: Props) {
  const [dragging, setDragging] = useState(false);
  const provider = loaded ? providerById(loaded.preview.providerId) : null;

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) onFile(file);
  };

  return (
    <section className="statelens-page" aria-labelledby="statelens-title">
      <header className="statelens-header">
        <div>
          <button className="back-design-button" onClick={onBack} aria-label="Return to canvas">
            <span aria-hidden="true">←</span>
          </button>
          <span className="statelens-logo" aria-hidden="true"><i /><i /></span>
          <span>
            <small>STATE TO ARCHITECTURE</small>
            <h2 id="statelens-title">StateLens</h2>
          </span>
        </div>
        <div className="statelens-header-actions">
          {loaded && <button className="ghost-button" onClick={onClear}>Start over</button>}
          <button className="statelens-import-button" onClick={onChooseFile}>
            {loaded ? "Choose another file" : "Import state file"}
          </button>
        </div>
      </header>

      <div className="statelens-privacy-strip" role="note">
        <span className="privacy-lock" aria-hidden="true"><i /></span>
        <p><strong>Your state stays local.</strong> StateLens parses this file inside your browser tab. It is never uploaded, transmitted, or saved by InfraCanvas.</p>
      </div>

      {!loaded ? (
        <div className="statelens-onboarding">
          <section className="statelens-intro-card">
            <span className="eyebrow">REVEAL WHAT IS ALREADY RUNNING</span>
            <h3>Turn infrastructure state into an editable cloud diagram.</h3>
            <p>Import Terraform or Pulumi state, review the detected resources and dependencies, then rebuild the architecture on your canvas in one click.</p>
            <div className="statelens-flow" aria-label="StateLens workflow">
              <span><b>1</b> Import state</span><i>→</i>
              <span><b>2</b> Review mapping</span><i>→</i>
              <span><b>3</b> Build canvas</span>
            </div>
          </section>

          <section
            className={`statelens-dropzone ${dragging ? "dragging" : ""}`}
            onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
            }}
            onDrop={onDrop}
            aria-label="Drop a Terraform or Pulumi state file"
          >
            <span className="state-file-graphic" aria-hidden="true"><i /><i /><i /></span>
            <strong>{dragging ? "Release to inspect state" : "Drop your state export here"}</strong>
            <p><code>terraform.tfstate</code>, <code>terraform show -json</code>, or <code>pulumi stack export</code></p>
            <span className="dropzone-divider">OR</span>
            <button className="statelens-import-button large" onClick={onChooseFile}>Choose JSON file</button>
            <small>Maximum 25 MB · JSON only</small>
          </section>

          <section className="statelens-safety-card">
            <div className="safety-mark" aria-hidden="true"><i /></div>
            <div>
              <strong>State files can contain sensitive values</strong>
              <p>StateLens excludes fields marked sensitive and properties that look like passwords, tokens, keys, or credentials. Use an export without plaintext secrets whenever possible.</p>
            </div>
          </section>
          {error && <p className="statelens-error" role="alert">{error}</p>}
        </div>
      ) : (
        <div className="statelens-review">
          <section className="statelens-result-hero" style={{ "--provider-accent": provider?.accent } as CSSProperties}>
            <div className="statelens-detected-provider">
              {provider && <ProviderMark provider={provider.id} className="statelens-provider-mark" />}
              <span><small>DETECTED CLOUD</small><strong>{provider?.name}</strong><em>{loaded.preview.sourceLabel}</em></span>
            </div>
            <div className="statelens-file-meta">
              <small>IMPORTED FILE</small>
              <strong title={loaded.fileName}>{loaded.fileName}</strong>
              <span>{readableBytes(loaded.fileSize)} · {new Date(loaded.importedAt).toLocaleTimeString()}</span>
            </div>
          </section>

          <section className="statelens-metrics" aria-label="Import summary">
            <article className="metric-mapped"><small>READY TO MAP</small><strong>{loaded.preview.matched.length}</strong><span>catalog resources</span></article>
            <article><small>CONNECTIONS</small><strong>{loaded.preview.edges.length}</strong><span>dependencies found</span></article>
            <article className={loaded.preview.unsupported.length ? "metric-warning" : ""}><small>UNSUPPORTED</small><strong>{loaded.preview.unsupported.length}</strong><span>types skipped</span></article>
            <article className={loaded.preview.foreignProviderResources.length ? "metric-warning" : ""}><small>OTHER CLOUDS</small><strong>{loaded.preview.foreignProviderResources.length}</strong><span>resources omitted</span></article>
          </section>

          <section className="statelens-resource-panel">
            <header>
              <div><small>CANVAS PREVIEW</small><h3>{loaded.preview.matched.length} resources ready</h3></div>
              <span className="mapping-confidence"><i /> Catalog-matched</span>
            </header>
            <div className="statelens-resource-grid">
              {loaded.preview.matched.map((resource, index) => {
                const service = provider?.services.find((item) => item.id === resource.serviceId);
                if (!service) return null;
                return (
                  <article key={resource.address} style={{ "--service-accent": service.accent } as CSSProperties}>
                    <span className="mapped-service-icon"><ServiceGlyph role={service.role} className="service-glyph" /></span>
                    <span><strong>{resource.name}</strong><small>{service.name}</small><code>{resource.type}</code></span>
                    <b>{String(index + 1).padStart(2, "0")}</b>
                  </article>
                );
              })}
            </div>
          </section>

          {(loaded.preview.warnings.length > 0 || loaded.preview.unsupported.length > 0) && (
            <section className="statelens-warning-panel" role="status">
              <strong>Review before building</strong>
              {loaded.preview.warnings.map((warning) => <p key={warning}>{warning}</p>)}
              {loaded.preview.unsupported.length > 0 && (
                <details>
                  <summary>Show unsupported resource types</summary>
                  <div>{[...new Set(loaded.preview.unsupported.map((item) => item.type))].map((type) => <code key={type}>{type}</code>)}</div>
                </details>
              )}
            </section>
          )}

          <footer className="statelens-build-bar">
            <div>
              <span className="privacy-lock small" aria-hidden="true"><i /></span>
              <p><strong>Ready to reveal the architecture</strong><small>{replacingCount > 0 ? `This will replace ${replacingCount} resources currently on the canvas.` : "A new editable diagram will be created on the canvas."}</small></p>
            </div>
            <button className="statelens-build-button" onClick={onBuild}>Build architecture <span>→</span></button>
          </footer>
        </div>
      )}
    </section>
  );
}
