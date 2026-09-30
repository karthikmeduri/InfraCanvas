"use client";

import { useMemo, useState, type CSSProperties } from "react";

import {
  AWS_CONNECTION_SESSION_MINUTES,
  generateAwsConnectionBundle,
  validateAwsConnectionDraft,
  type AwsConnectionSessionMinutes,
  type SecureConnectionBundle,
} from "@/lib/cloud-connect";
import { providerById } from "@/lib/catalog";
import { ProviderMark } from "@/lib/icons";
import type { ProviderId } from "@/lib/types";
import { createZip } from "@/lib/zip";

type Props = {
  onBack: () => void;
  onCopy: (value: string, message: string) => void;
};

const PROVIDER_STATUS: Array<{ id: ProviderId; label: string; status: "available" | "planned" }> = [
  { id: "aws", label: "AWS", status: "available" },
  { id: "azure", label: "Azure", status: "planned" },
  { id: "gcp", label: "Google Cloud", status: "planned" },
  { id: "oci", label: "Oracle Cloud", status: "planned" },
];

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const newRequestId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "";
};

export function CloudConnectWorkspace({ onBack, onCopy }: Props) {
  const aws = providerById("aws");
  const [requestId, setRequestId] = useState(newRequestId);
  const [connectionName, setConnectionName] = useState("Production inventory");
  const [accountId, setAccountId] = useState("");
  const [roleName, setRoleName] = useState("InfraCanvasReadOnly");
  const [issuerUrl, setIssuerUrl] = useState("https://token.actions.githubusercontent.com");
  const [oidcProviderArn, setOidcProviderArn] = useState("");
  const [subject, setSubject] = useState("");
  const [audience, setAudience] = useState("sts.amazonaws.com");
  const [regionsText, setRegionsText] = useState("us-east-1, us-west-2");
  const [sessionMinutes, setSessionMinutes] = useState<AwsConnectionSessionMinutes>(60);
  const [bundle, setBundle] = useState<SecureConnectionBundle | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const regions = useMemo(
    () => [...new Set(regionsText.split(",").map((region) => region.trim()).filter(Boolean))],
    [regionsText],
  );
  const draft = useMemo(
    () => ({
      requestId,
      connectionName,
      accountId: accountId.trim(),
      roleName: roleName.trim(),
      oidcProviderArn: oidcProviderArn.trim(),
      issuerUrl: issuerUrl.trim(),
      subject: subject.trim(),
      audience: audience.trim(),
      sessionMinutes,
      regions,
    }),
    [accountId, audience, connectionName, issuerUrl, oidcProviderArn, regions, requestId, roleName, sessionMinutes, subject],
  );
  const issues = useMemo(() => validateAwsConnectionDraft(draft), [draft]);
  const issueFor = (field: string) => submitted ? issues.find((issue) => issue.field === field)?.message : undefined;

  const prepare = () => {
    setSubmitted(true);
    if (issues.length > 0) {
      setBundle(null);
      return;
    }
    setBundle(generateAwsConnectionBundle(draft));
  };

  const startOver = () => {
    setBundle(null);
    setSubmitted(false);
    setRequestId(newRequestId());
  };

  const downloadPacket = () => {
    if (!bundle) return;
    downloadBlob(createZip(bundle.files), "infracanvas-aws-secure-connect.zip");
  };

  return (
    <section className="cloud-connect-page" aria-labelledby="cloud-connect-title">
      <header className="cloud-connect-header">
        <div>
          <button className="back-design-button" onClick={onBack} aria-label="Return to canvas">
            <span aria-hidden="true">←</span>
          </button>
          <span className="cloud-connect-logo" aria-hidden="true"><i /><i /><i /></span>
          <span>
            <small>SHORT-LIVED IDENTITY · LEAST PRIVILEGE</small>
            <h2 id="cloud-connect-title">Secure Cloud Connect</h2>
          </span>
        </div>
        <div className="cloud-connect-header-actions">
          {bundle && <button className="ghost-button" onClick={startOver}>Prepare another</button>}
          <span className="connection-safety-pill"><i /> No access keys accepted</span>
        </div>
      </header>

      <div className="cloud-connect-security-strip" role="note">
        <span className="connect-shield" aria-hidden="true"><i /></span>
        <p>
          <strong>Trust first, tokens later.</strong> This browser-only slice prepares an exact OIDC trust and a read-only AWS inventory policy. It never asks for, stores, or exchanges cloud credentials.
        </p>
      </div>

      <div className="cloud-connect-provider-row" role="list" aria-label="Secure connection provider support">
        {PROVIDER_STATUS.map((item) => {
          return (
            <button
              key={item.id}
              type="button"
              className={item.status === "available" ? "active" : "planned"}
              disabled={item.status === "planned"}
              title={item.status === "planned" ? `${item.label} federation is planned for a later slice` : "AWS OIDC setup is available"}
            >
              <ProviderMark provider={item.id} className="connect-provider-mark" />
              <span><strong>{item.label}</strong><small>{item.status === "available" ? "Available now" : "Planned next"}</small></span>
            </button>
          );
        })}
      </div>

      {!bundle ? (
        <div className="cloud-connect-setup">
          <section className="cloud-connect-intro">
            <span className="eyebrow">AWS OIDC ONBOARDING SLICE</span>
            <h3>Prepare a connection without creating another permanent credential.</h3>
            <p>
              InfraCanvas generates a reviewable Terraform trust packet. An administrator applies it in the target account, and a separately deployed trusted OIDC broker can then request a temporary read-only session.
            </p>
            <div className="connect-trust-flow" aria-label="Secure identity flow">
              <span><b>01</b> Exact OIDC identity</span><i aria-hidden="true">→</i>
              <span><b>02</b> AWS STS exchange</span><i aria-hidden="true">→</i>
              <span><b>03</b> Read-only inventory</span>
            </div>
            <div className="connect-boundary-card">
              <span className="boundary-mark" aria-hidden="true"><i /></span>
              <div>
                <strong>What this release does—and does not do</strong>
                <p>It generates the AWS trust role, bounded inventory policy, and connection manifest. The hosted browser app does not yet run an identity broker or call AWS, so “prepared” never masquerades as “connected.”</p>
              </div>
            </div>
          </section>

          <form className="cloud-connect-form" onSubmit={(event) => { event.preventDefault(); prepare(); }} noValidate>
            <header>
              <span><small>CONNECTION CONTRACT</small><strong>AWS inventory access</strong></span>
              <ProviderMark provider="aws" className="connect-form-provider" />
            </header>

            <div className="connect-form-section">
              <span className="connect-section-number">01</span>
              <div className="connect-section-fields">
                <strong>Target account</strong>
                <label>
                  <span>Connection name</span>
                  <input value={connectionName} onChange={(event) => setConnectionName(event.target.value)} maxLength={80} />
                  {issueFor("connectionName") && <small className="connect-field-error">{issueFor("connectionName")}</small>}
                </label>
                <div className="connect-field-grid">
                  <label>
                    <span>AWS account ID</span>
                    <input value={accountId} onChange={(event) => setAccountId(event.target.value.replace(/\D/g, "").slice(0, 12))} inputMode="numeric" placeholder="123456789012" />
                    {issueFor("accountId") && <small className="connect-field-error">{issueFor("accountId")}</small>}
                  </label>
                  <label>
                    <span>IAM role name</span>
                    <input value={roleName} onChange={(event) => setRoleName(event.target.value)} placeholder="InfraCanvasReadOnly" />
                    {issueFor("roleName") && <small className="connect-field-error">{issueFor("roleName")}</small>}
                  </label>
                </div>
              </div>
            </div>

            <div className="connect-form-section">
              <span className="connect-section-number">02</span>
              <div className="connect-section-fields">
                <strong>Exact federated identity</strong>
                <label>
                  <span>OIDC issuer URL</span>
                  <input value={issuerUrl} onChange={(event) => setIssuerUrl(event.target.value)} spellCheck={false} />
                  {issueFor("issuerUrl") && <small className="connect-field-error">{issueFor("issuerUrl")}</small>}
                </label>
                <label>
                  <span>OIDC provider ARN</span>
                  <input value={oidcProviderArn} onChange={(event) => setOidcProviderArn(event.target.value)} placeholder={accountId ? `arn:aws:iam::${accountId}:oidc-provider/token.actions.githubusercontent.com` : "arn:aws:iam::ACCOUNT_ID:oidc-provider/issuer.example.com"} spellCheck={false} />
                  {issueFor("oidcProviderArn") && <small className="connect-field-error">{issueFor("oidcProviderArn")}</small>}
                </label>
                <label>
                  <span>Exact subject claim</span>
                  <input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="repo:your-org/your-repo:environment:production" spellCheck={false} />
                  <small>Wildcards are rejected so another repository, branch, or tenant cannot reuse the trust.</small>
                  {issueFor("subject") && <small className="connect-field-error">{issueFor("subject")}</small>}
                </label>
                <label>
                  <span>Audience claim</span>
                  <input value={audience} onChange={(event) => setAudience(event.target.value)} spellCheck={false} />
                  {issueFor("audience") && <small className="connect-field-error">{issueFor("audience")}</small>}
                </label>
              </div>
            </div>

            <div className="connect-form-section">
              <span className="connect-section-number">03</span>
              <div className="connect-section-fields">
                <strong>Session and inventory scope</strong>
                <div className="connect-field-grid">
                  <label>
                    <span>Session lifetime</span>
                    <select value={sessionMinutes} onChange={(event) => setSessionMinutes(Number(event.target.value) as AwsConnectionSessionMinutes)}>
                      {AWS_CONNECTION_SESSION_MINUTES.map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}
                    </select>
                    {issueFor("sessionMinutes") && <small className="connect-field-error">{issueFor("sessionMinutes")}</small>}
                  </label>
                  <label>
                    <span>AWS regions</span>
                    <input value={regionsText} onChange={(event) => setRegionsText(event.target.value)} placeholder="us-east-1, us-west-2" spellCheck={false} />
                    {issueFor("regions") && <small className="connect-field-error">{issueFor("regions")}</small>}
                  </label>
                </div>
              </div>
            </div>

            {submitted && issues.length > 0 && (
              <div className="connect-validation-summary" role="alert">
                <strong>Review {issues.length} security {issues.length === 1 ? "requirement" : "requirements"}</strong>
                <p>The trust packet is generated only after every identity and scope check passes.</p>
              </div>
            )}

            <footer>
              <span><i /> Session-only form · nothing saved locally</span>
              <button className="connect-prepare-button" type="submit" disabled={!requestId}>Prepare trust packet <span>→</span></button>
            </footer>
          </form>
        </div>
      ) : (
        <div className="cloud-connect-result">
          <section className="connect-result-hero" style={{ "--provider-accent": aws.accent } as CSSProperties}>
            <div>
              <span className="prepared-mark" aria-hidden="true"><i /></span>
              <span><small>SECURITY CONTRACT PREPARED</small><h3>{bundle.manifest.metadata.name}</h3><p>Ready for administrator review—not connected and not deployed.</p></span>
            </div>
            <ProviderMark provider="aws" className="connect-result-provider" />
          </section>

          <section className="connect-result-metrics" aria-label="Connection packet summary">
            <article><small>IDENTITY</small><strong>Exact subject</strong><span>No wildcard trust</span></article>
            <article><small>REQUESTED SESSION</small><strong>{sessionMinutes} min</strong><span>Broker-enforced STS request</span></article>
            <article><small>REGIONS</small><strong>{regions.length}</strong><span>{regions.join(", ")}</span></article>
            <article><small>POLICY</small><strong>{bundle.permissionCount}</strong><span>read-only action families</span></article>
          </section>

          <section className="connect-result-grid">
            <article className="connect-ready-card">
              <header><span><small>TRUST PATH</small><strong>What will happen after approval</strong></span><b>PREPARED</b></header>
              <ol>
                <li><span>1</span><p><strong>Administrator reviews the packet</strong><small>Terraform plan shows one IAM role, one customer-managed policy, and one attachment.</small></p></li>
                <li><span>2</span><p><strong>Trusted broker presents an OIDC token</strong><small>AWS requires exact issuer, subject, and audience matches.</small></p></li>
                <li><span>3</span><p><strong>AWS STS returns a temporary session</strong><small>The session expires automatically and can read inventory only in the selected regions.</small></p></li>
              </ol>
            </article>

            <article className="connect-packet-card">
              <header><span><small>DOWNLOAD</small><strong>Reviewable setup packet</strong></span><b>{bundle.files.length} files</b></header>
              <ul>
                {bundle.files.map((file) => <li key={file.path}><span>{file.path.endsWith(".json") ? "{}" : file.path.endsWith(".tf") ? "TF" : "TXT"}</span>{file.path}</li>)}
              </ul>
              <button className="connect-download-button" onClick={downloadPacket}>Download secure setup .zip</button>
              <button className="connect-copy-button" onClick={() => onCopy(JSON.stringify(bundle.manifest, null, 2), "Connection manifest copied")}>Copy connection manifest</button>
            </article>
          </section>

          <section className="connect-safety-review">
            <span className="connect-shield large" aria-hidden="true"><i /></span>
            <div>
              <small>ENFORCED BOUNDARIES</small>
              <h3>InfraCanvas refused the dangerous shortcuts.</h3>
              <ul>
                <li>No access key, secret key, session token, or private key input</li>
                <li>No wildcard subject, audience, or federated principal</li>
                <li>No secret-value, parameter-value, or S3 object-content permission</li>
                <li>No browser persistence and no live exchange in this release</li>
              </ul>
            </div>
            <a href="https://docs.aws.amazon.com/STS/latest/APIReference/API_AssumeRoleWithWebIdentity.html" target="_blank" rel="noreferrer">Review AWS STS documentation <span>↗</span></a>
          </section>
        </div>
      )}
    </section>
  );
}
