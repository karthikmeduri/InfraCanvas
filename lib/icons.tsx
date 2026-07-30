import type { ProviderId, ServiceRole } from "./types";

/**
 * All artwork is inline SVG on purpose: no network requests, no CDN, crisp at
 * any zoom, and it survives the strict CSP the app is deployed under.
 *
 * Provider marks are simplified, original geometric interpretations rather than
 * copies of the vendors' trademarked logos.
 */

type MarkProps = { className?: string; title?: string };

export function ProviderMark({ provider, className, title }: MarkProps & { provider: ProviderId }) {
  const label = title ?? PROVIDER_LABEL[provider];
  switch (provider) {
    case "aws":
      return (
        <svg viewBox="0 0 32 32" className={className} role="img" aria-label={label}>
          <path
            d="M7 13.4c0 .5.05.9.15 1.2.11.3.26.63.46.98a.6.6 0 0 1 .1.31c0 .14-.08.27-.26.4l-.86.58a.66.66 0 0 1-.36.12c-.14 0-.28-.07-.42-.2a4.3 4.3 0 0 1-.5-.66 11 11 0 0 1-.44-.83c-1.07 1.26-2.42 1.9-4.04 1.9-1.15 0-2.07-.34-2.75-1a3.55 3.55 0 0 1-1.02-2.65c0-1.16.41-2.1 1.24-2.8.83-.72 1.93-1.07 3.33-1.07.46 0 .94.04 1.44.11.5.07 1.02.18 1.56.3v-.98c0-1.03-.21-1.75-.63-2.17-.43-.42-1.16-.62-2.2-.62-.47 0-.96.05-1.46.17-.5.12-.99.27-1.46.46a3.9 3.9 0 0 1-.48.17.83.83 0 0 1-.21.04c-.19 0-.28-.14-.28-.42v-.67c0-.21.03-.37.1-.46a1 1 0 0 1 .37-.28 7.6 7.6 0 0 1 1.7-.61A8.2 8.2 0 0 1 3.2 4c1.6 0 2.77.36 3.52 1.09.74.72 1.11 1.82 1.11 3.3v4.34Zm-5.58 2.09c.44 0 .9-.08 1.38-.24a3 3 0 0 0 1.28-.86c.2-.24.35-.5.42-.8.08-.3.13-.66.13-1.08v-.52a11.3 11.3 0 0 0-2.5-.34c-.9 0-1.55.18-1.99.54-.44.35-.65.86-.65 1.53 0 .62.16 1.09.49 1.4.32.32.79.48 1.44.48Z"
            transform="translate(4 5)"
            fill="currentColor"
          />
          <path
            d="M4.6 27.9c5.2 3.1 11.6 3.1 16.9.2.6-.3 1.1.3.5.8-2.5 2-6 3.1-9.1 3.1-4.3 0-8.2-1.6-11.2-4.3-.3-.2 0-.6.3-.4Z"
            transform="translate(3 -3)"
            fill="currentColor"
            opacity="0.55"
          />
          <path
            d="M23.5 24.4c-.4-.6.3-2.8.6-3.4.3-.6.9-.4.9-.4s.6.3.4 1.4c-.2 1.1-1.1 2.5-1.5 2.7-.2.1-.4-.1-.4-.3Z"
            fill="currentColor"
            opacity="0.55"
          />
        </svg>
      );
    case "azure":
      return (
        <svg viewBox="0 0 32 32" className={className} role="img" aria-label={label}>
          <path d="M12.8 3.6h6.3L12.5 23a1.3 1.3 0 0 1-1.2.9H6.4a1.3 1.3 0 0 1-1.2-1.7L11.6 4.5c.18-.54.68-.9 1.25-.9Z" fill="currentColor" opacity="0.6" />
          <path d="M22.4 21.1H12.2a.6.6 0 0 0-.4 1l6.5 6.1c.19.18.44.28.7.28h8.7l-5.3-7.4Z" fill="currentColor" />
          <path d="M22.5 3.6h-9.8l-7.4 22a1.3 1.3 0 0 0 1.2 1.7h5.1c.55 0 1.04-.35 1.22-.87l1.5-4.4 5.4 5.05c.18.15.4.24.63.24h8.6l-3.77-5.4-10.9-.03 6.7-15.8a1.3 1.3 0 0 0-1.2-1.8Z" fill="currentColor" opacity="0.9" />
        </svg>
      );
    case "gcp":
      return (
        <svg viewBox="0 0 32 32" className={className} role="img" aria-label={label}>
          <path d="M20.1 11.3h.9l2.6-2.6.13-1.1A11.7 11.7 0 0 0 4.7 13.3a1.4 1.4 0 0 1 .9-.05l5.2-.86s.27-.44.4-.41a6.5 6.5 0 0 1 8.9-.7Z" fill="currentColor" opacity="0.55" />
          <path d="M27.3 13.3a11.7 11.7 0 0 0-3.5-5.7l-3.7 3.7a6.5 6.5 0 0 1 2.4 5.15v.65a3.25 3.25 0 0 1 0 6.5h-6.5l-.65.66v3.9l.65.64h6.5a8.45 8.45 0 0 0 4.8-15.5Z" fill="currentColor" />
          <path d="M10.2 28.8h6.5v-5.2h-6.5a3.2 3.2 0 0 1-1.34-.3l-.9.3-2.6 2.6-.23.9a8.4 8.4 0 0 0 5.07 1.7Z" fill="currentColor" opacity="0.8" />
          <path d="M10.2 11.9A8.45 8.45 0 0 0 5.1 27.1l3.77-3.77a3.25 3.25 0 1 1 4.3-4.3l3.77-3.77a8.44 8.44 0 0 0-6.74-3.36Z" fill="currentColor" opacity="0.65" />
        </svg>
      );
    case "oci":
      return (
        <svg viewBox="0 0 32 32" className={className} role="img" aria-label={label}>
          <path
            d="M11.6 8h8.8a8 8 0 0 1 0 16h-8.8a8 8 0 0 1 0-16Zm.17 4.3a3.7 3.7 0 0 0 0 7.4h8.46a3.7 3.7 0 0 0 0-7.4h-8.46Z"
            fill="currentColor"
          />
        </svg>
      );
  }
}

const PROVIDER_LABEL: Record<ProviderId, string> = {
  aws: "Amazon Web Services",
  azure: "Microsoft Azure",
  gcp: "Google Cloud",
  oci: "Oracle Cloud Infrastructure",
};

/**
 * Service glyphs are keyed by role so a newly added service gets a sensible
 * icon without touching this file.
 */
export function ServiceGlyph({ role, className }: MarkProps & { role: ServiceRole }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {GLYPHS[role]}
    </svg>
  );
}

const GLYPHS: Record<ServiceRole, React.ReactNode> = {
  network: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" strokeDasharray="3 2.5" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  subnet: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M9 6v12M15 6v12" />
    </>
  ),
  gateway: (
    <>
      <path d="M12 3v7M12 21v-7" />
      <rect x="4" y="10" width="16" height="4" rx="1.5" />
      <path d="M8 3h8M8 21h8" />
    </>
  ),
  loadbalancer: (
    <>
      <circle cx="12" cy="5" r="2.2" />
      <circle cx="5" cy="19" r="2.2" />
      <circle cx="12" cy="19" r="2.2" />
      <circle cx="19" cy="19" r="2.2" />
      <path d="M12 7.2v3.3M12 10.5H5v6.3M12 10.5h7v6.3M12 10.5v6.3" />
    </>
  ),
  targetgroup: (
    <>
      <circle cx="6" cy="7" r="2.5" />
      <circle cx="18" cy="7" r="2.5" />
      <circle cx="12" cy="17" r="2.5" />
      <path d="M8.2 8.3l2.5 6.4M15.8 8.3l-2.5 6.4M8.5 7h7" />
    </>
  ),
  cdn: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 2.5 15.4 0 18M12 3c-2.5 2.6-2.5 15.4 0 18" />
    </>
  ),
  dns: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 9.5h7M8.5 14.5h7M12 6v12" />
    </>
  ),
  firewall: (
    <>
      <path d="M12 3l7.5 3v5.5c0 4.6-3.1 8.3-7.5 9.5-4.4-1.2-7.5-4.9-7.5-9.5V6L12 3Z" />
      <path d="M9.5 12l1.8 1.9 3.4-3.7" />
    </>
  ),
  webfirewall: (
    <>
      <path d="M12 3l7.5 3v5.5c0 4.6-3.1 8.3-7.5 9.5-4.4-1.2-7.5-4.9-7.5-9.5V6L12 3Z" />
      <path d="M7.5 9h9M7.5 13h9M10 7v8M14 7v8" />
    </>
  ),
  compute: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2.5" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
      <path d="M9 1.8v2.2M15 1.8v2.2M9 20v2.2M15 20v2.2M1.8 9H4M1.8 15H4M20 9h2.2M20 15h2.2" />
    </>
  ),
  container: (
    <>
      <path d="M12 2.6l8 4.6v9.6l-8 4.6-8-4.6V7.2l8-4.6Z" />
      <path d="M4 7.2l8 4.6 8-4.6M12 11.8V21" />
    </>
  ),
  serverless: (
    <>
      <path d="M13.5 2.5L5 13.5h5.5L9.5 21.5 19 10.5h-5.7l.2-8Z" />
    </>
  ),
  registry: (
    <>
      <rect x="3" y="9" width="7" height="6" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
      <rect x="12" y="4" width="7" height="6" rx="1" />
      <rect x="12" y="11" width="7" height="10" rx="1" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="6" rx="7.5" ry="3.2" />
      <path d="M4.5 6v12c0 1.8 3.4 3.2 7.5 3.2s7.5-1.4 7.5-3.2V6" />
      <path d="M4.5 12c0 1.8 3.4 3.2 7.5 3.2s7.5-1.4 7.5-3.2" />
    </>
  ),
  cache: (
    <>
      <path d="M13 2.5L4.5 13H11l-1 8.5L19.5 11H13l0-8.5Z" />
      <circle cx="12" cy="12" r="9.3" strokeDasharray="2 3" />
    </>
  ),
  storage: (
    <>
      <path d="M4 7.5C4 5.6 7.6 4 12 4s8 1.6 8 3.5-3.6 3.5-8 3.5-8-1.6-8-3.5Z" />
      <path d="M4 7.5v9C4 18.4 7.6 20 12 20s8-1.6 8-3.5v-9" />
      <path d="M4 12c0 1.9 3.6 3.5 8 3.5s8-1.6 8-3.5" />
    </>
  ),
  queue: (
    <>
      <rect x="2.5" y="8" width="5" height="8" rx="1.3" />
      <rect x="9.5" y="8" width="5" height="8" rx="1.3" />
      <rect x="16.5" y="8" width="5" height="8" rx="1.3" />
      <path d="M12 4.5h8M17.5 2.5l2.5 2-2.5 2" />
    </>
  ),
  topic: (
    <>
      <circle cx="6" cy="12" r="2.5" />
      <path d="M8.5 12h4M15 8.5l5-3M15 12h5M15 15.5l5 3" />
      <circle cx="14" cy="12" r="2" />
    </>
  ),
  secrets: (
    <>
      <rect x="4.5" y="10" width="15" height="10.5" rx="2.2" />
      <path d="M8 10V7.2a4 4 0 0 1 8 0V10" />
      <circle cx="12" cy="15.2" r="1.5" />
    </>
  ),
  identity: (
    <>
      <circle cx="12" cy="8.5" r="3.8" />
      <path d="M4.8 20.5a7.5 7.5 0 0 1 14.4 0" />
    </>
  ),
  monitoring: (
    <>
      <path d="M3 12h4l2.5-6.5 4 13L16 12h5" />
      <rect x="2.5" y="4" width="19" height="16" rx="2.5" />
    </>
  ),
  analytics: (
    <>
      <path d="M4 20V9M10 20V4M16 20v-7M22 20H2" />
    </>
  ),
};
