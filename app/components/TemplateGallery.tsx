"use client";

import { useMemo, useState, type CSSProperties } from "react";

import { providerById, SAMPLE_ARCHITECTURES, SAMPLE_EDGES, serviceById } from "@/lib/catalog";
import { ProviderMark, ServiceArtwork } from "@/lib/icons";
import { PRODUCTION_TEMPLATES } from "@/lib/templates";
import type { ProviderId } from "@/lib/types";

type Props = {
  providerId: ProviderId;
  onBack: () => void;
  onUse: (templateId: string) => void;
};

const filters: Array<{ id: "all" | ProviderId; label: string }> = [
  { id: "all", label: "All clouds" },
  { id: "aws", label: "AWS" },
  { id: "azure", label: "Azure" },
  { id: "gcp", label: "Google Cloud" },
  { id: "oci", label: "Oracle Cloud" },
];

function TemplatePreview({ providerId }: { providerId: ProviderId }) {
  const provider = providerById(providerId);
  const nodes = SAMPLE_ARCHITECTURES[providerId];
  const edges = SAMPLE_EDGES[providerId];
  const minX = Math.min(...nodes.map((node) => node.x));
  const minY = Math.min(...nodes.map((node) => node.y));
  const maxX = Math.max(...nodes.map((node) => node.x));
  const maxY = Math.max(...nodes.map((node) => node.y));
  const scaleX = (x: number) => 26 + ((x - minX) / Math.max(1, maxX - minX)) * 348;
  const scaleY = (y: number) => 24 + ((y - minY) / Math.max(1, maxY - minY)) * 112;

  return (
    <svg viewBox="0 0 400 160" role="img" aria-label={`${provider.shortName} architecture preview`}>
      <defs>
        <pattern id={`template-grid-${providerId}`} width="16" height="16" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="currentColor" opacity=".13" />
        </pattern>
      </defs>
      <rect width="400" height="160" rx="16" fill={`url(#template-grid-${providerId})`} />
      {edges.map(([from, to], index) => {
        const source = nodes[from];
        const target = nodes[to];
        if (!source || !target) return null;
        const service = serviceById(provider, source.serviceId);
        return (
          <path
            key={`${from}-${to}-${index}`}
            d={`M ${scaleX(source.x)} ${scaleY(source.y)} C ${scaleX(source.x) + 22} ${scaleY(source.y)}, ${scaleX(target.x) - 22} ${scaleY(target.y)}, ${scaleX(target.x)} ${scaleY(target.y)}`}
            fill="none"
            stroke={service?.accent ?? provider.accent}
            strokeWidth="1.4"
            opacity=".46"
          />
        );
      })}
      {nodes.map((node, index) => {
        const service = serviceById(provider, node.serviceId);
        return (
          <g key={`${node.serviceId}-${index}`} transform={`translate(${scaleX(node.x)}, ${scaleY(node.y)})`}>
            <circle r="7" fill="var(--panel)" stroke={service?.accent ?? provider.accent} strokeWidth="2" />
            <circle r="2.25" fill={service?.accent ?? provider.accent} />
          </g>
        );
      })}
    </svg>
  );
}

export function TemplateGallery({ providerId, onBack, onUse }: Props) {
  const [filter, setFilter] = useState<"all" | ProviderId>("all");
  const [query, setQuery] = useState("");
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return PRODUCTION_TEMPLATES.filter((template) => {
      if (filter !== "all" && template.providerId !== filter) return false;
      if (!needle) return true;
      return `${template.name} ${template.summary} ${template.workload} ${template.tags.join(" ")}`
        .toLowerCase()
        .includes(needle);
    }).sort((left, right) =>
      Number(right.providerId === providerId) - Number(left.providerId === providerId),
    );
  }, [filter, providerId, query]);

  return (
    <section className="template-page" aria-labelledby="template-gallery-title">
      <header className="template-header">
        <div>
          <button className="back-design-button" onClick={onBack} aria-label="Return to canvas">←</button>
          <span className="template-header-mark" aria-hidden="true"><i /><i /><i /></span>
          <span>
            <small>REVIEWED STARTING POINTS</small>
            <h2 id="template-gallery-title">Production template gallery</h2>
          </span>
        </div>
        <label className="template-search">
          <span aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search workloads or services"
            aria-label="Search production templates"
          />
        </label>
      </header>

      <div className="template-trust-strip" role="note">
        <strong>Editable, not magical.</strong>
        <span>Every template opens as a normal InfraCanvas graph. Review its region, sizing, identity, networking, and data settings before deployment.</span>
      </div>

      <div className="template-filter-row" role="group" aria-label="Filter templates by cloud provider">
        {filters.map((item) => (
          <button
            key={item.id}
            className={filter === item.id ? "active" : ""}
            onClick={() => setFilter(item.id)}
            aria-pressed={filter === item.id}
          >
            {item.id !== "all" && <ProviderMark provider={item.id} className="template-filter-mark" />}
            {item.label}
          </button>
        ))}
      </div>

      <div className="template-grid">
        {visible.map((template) => {
          const provider = providerById(template.providerId);
          const nodes = SAMPLE_ARCHITECTURES[template.providerId];
          const featured = template.featuredServices
            .map((id) => serviceById(provider, id))
            .filter((service) => service !== undefined);
          return (
            <article
              className="template-card"
              key={template.id}
              style={{ "--provider-accent": provider.accent } as CSSProperties}
            >
              <div className="template-preview"><TemplatePreview providerId={template.providerId} /></div>
              <div className="template-card-body">
                <div className="template-provider-row">
                  <span className="template-provider-pill">
                    <ProviderMark provider={template.providerId} className="template-provider-mark" />
                    {provider.shortName}
                  </span>
                  <span>{template.availability}</span>
                </div>
                <h3>{template.name}</h3>
                <p>{template.summary}</p>
                <dl className="template-metrics">
                  <div><dt>Resources</dt><dd>{nodes.length}</dd></div>
                  <div><dt>Connections</dt><dd>{SAMPLE_EDGES[template.providerId].length}</dd></div>
                  <div><dt>Workload</dt><dd>{template.workload}</dd></div>
                </dl>
                <div className="template-service-stack" aria-label="Featured services">
                  {featured.slice(0, 6).map((service) => (
                    <span key={service.id} title={service.name} style={{ "--service-accent": service.accent } as CSSProperties}>
                      <ServiceArtwork service={service} className="template-service-icon" />
                    </span>
                  ))}
                  <small>{template.tags.slice(0, 2).join(" · ")}</small>
                </div>
                <button className="template-use-button" onClick={() => onUse(template.id)}>
                  Use this template <span aria-hidden="true">→</span>
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {visible.length === 0 && (
        <div className="template-empty">
          <strong>No templates match that search.</strong>
          <button onClick={() => { setQuery(""); setFilter("all"); }}>Show all templates</button>
        </div>
      )}
    </section>
  );
}
