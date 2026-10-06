"use client";

type Props = {
  url: string;
  error: string;
  resources: number;
  connections: number;
  onClose: () => void;
  onCopy: () => void;
};

export function ShareDiagramDialog({ url, error, resources, connections, onClose, onCopy }: Props) {
  return (
    <div
      className="modal-backdrop share-dialog-backdrop"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="share-dialog" role="dialog" aria-modal="true" aria-labelledby="share-dialog-title">
        <button className="share-close" onClick={onClose} aria-label="Close share dialog">×</button>
        <span className="share-dialog-mark" aria-hidden="true"><i /><i /><i /></span>
        <small>CLIENT-SIDE SNAPSHOT</small>
        <h2 id="share-dialog-title">Share this architecture</h2>
        <p>Create a portable view of the current graph without uploading the diagram to InfraCanvas.</p>

        <div className="share-safety-note" role="note">
          <span aria-hidden="true">✓</span>
          <p><strong>Sanitized before sharing.</strong> Only catalog-defined fields are included. Credential-shaped and unknown fields are removed, and the payload stays in the URL fragment instead of the HTTP request.</p>
        </div>

        <div className="share-stats">
          <span><strong>{resources}</strong> resources</span>
          <span><strong>{connections}</strong> connections</span>
          <span><strong>0</strong> server uploads</span>
        </div>

        {error ? (
          <p className="share-error" role="alert">{error}</p>
        ) : (
          <label className="share-url-field">
            Share link
            <textarea value={url} readOnly rows={4} onFocus={(event) => event.currentTarget.select()} />
          </label>
        )}

        <p className="share-disclosure"><strong>Important:</strong> Anyone with this link can view the sanitized snapshot. Links have no access control or revocation; never enter secrets into diagram fields.</p>
        <div className="share-actions">
          <button className="ghost-button" onClick={onClose}>Cancel</button>
          <button className="primary-small" onClick={onCopy} disabled={!url || Boolean(error)}>Copy share link</button>
        </div>
      </section>
    </div>
  );
}
