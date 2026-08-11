import type { Metadata } from "next";
import { headers } from "next/headers";
import { THEME_BOOTSTRAP_SCRIPT } from "@/lib/theme";
import "./globals.css";
import "./builder.css";

const title = "InfraCanvas — Visual Cloud Architecture to Terraform and Pulumi";
const description =
  "Design AWS, Azure, Google Cloud, and Oracle Cloud architectures visually, then generate deployable Terraform modules or Pulumi TypeScript projects.";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const origin = new URL(`${protocol}://${host}`);

  return {
    metadataBase: origin,
    title,
    description,
    applicationName: "InfraCanvas",
    keywords: [
      "Terraform",
      "Pulumi",
      "cloud architecture",
      "AWS",
      "Azure",
      "Google Cloud",
      "Oracle Cloud",
      "infrastructure as code",
    ],
    icons: {
      icon: "/favicon.svg",
      shortcut: "/favicon.svg",
    },
    openGraph: {
      type: "website",
      url: origin,
      siteName: "InfraCanvas",
      title,
      description,
      images: [
        {
          url: "/og.png",
          width: 1280,
          height: 640,
          alt: "InfraCanvas visual cloud architecture builder",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og.png"],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The bootstrap script rewrites `data-theme` before React hydrates, so the
    // attribute is expected to differ from the server-rendered default.
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        {/* Applies the saved theme before first paint so there is no flash. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
