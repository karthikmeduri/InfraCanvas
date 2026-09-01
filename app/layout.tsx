import type { Metadata } from "next";
import { THEME_BOOTSTRAP_SCRIPT } from "@/lib/theme";
import "./globals.css";
import "./builder.css";

const siteUrl = process.env.SITE_URL ?? "https://infracanvas-builder.karthik-m.chatgpt.site";
const title = "InfraCanvas — The Bidirectional IaC Workspace";
const description =
  "The open-source bidirectional infrastructure workspace for AWS, Azure, GCP and OCI: prompt or draw, generate Terraform and Pulumi, import state, and visualize drift.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  applicationName: "InfraCanvas — The Bidirectional IaC Workspace",
  authors: [
    { name: "Karthik Meduri", url: "https://github.com/karthikmeduri" },
    { name: "Sai Sravan Meduri" },
    { name: "Srikar Podicheti" },
  ],
  creator: "Karthik Meduri, Sai Sravan Meduri, and Srikar Podicheti",
  publisher: "InfraCanvas open-source project",
  category: "Developer Tools",
  keywords: [
    "bidirectional IaC workspace",
    "visual Terraform builder",
    "AI cloud architecture generator",
    "infrastructure visual builder",
    "Terraform architecture diagram",
    "Pulumi visual builder",
    "Terraform state visualization",
    "Terraform drift detection",
    "AWS architecture diagram",
    "Azure architecture diagram",
    "GCP architecture diagram",
    "Oracle Cloud architecture",
    "infrastructure as code",
    "Karthik Meduri",
  ],
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "InfraCanvas — The Bidirectional IaC Workspace",
    title,
    description,
    images: [
      {
        url: "/og-expanded-catalog.png",
        width: 1745,
        height: 909,
        alt: "InfraCanvas AI visual cloud architecture builder for Terraform and Pulumi",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og-expanded-catalog.png"],
  },
};

const productStructuredData = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "InfraCanvas by Karthik Meduri",
  alternateName: ["InfraCanvas Bidirectional IaC Workspace", "InfraCanvas AI Visual IaC Builder"],
  applicationCategory: "DeveloperApplication",
  applicationSubCategory: "Infrastructure as Code and Cloud Architecture",
  operatingSystem: "Web",
  url: siteUrl,
  codeRepository: "https://github.com/karthikmeduri/InfraCanvas",
  license: "https://www.apache.org/licenses/LICENSE-2.0",
  isAccessibleForFree: true,
  description,
  author: [
    { "@type": "Person", name: "Karthik Meduri", url: "https://github.com/karthikmeduri" },
    { "@type": "Person", name: "Sai Sravan Meduri" },
    { "@type": "Person", name: "Srikar Podicheti" },
  ],
  featureList: [
    "Bidirectional prompt, diagram, IaC, state, and drift workflow",
    "Natural-language prompt to editable cloud architecture diagram",
    "Visual AWS, Azure, Google Cloud, and Oracle Cloud architecture builder",
    "Terraform and Pulumi code generation",
    "Terraform and Pulumi state to architecture with StateLens",
    "Infrastructure drift visualization with TFwhy",
  ],
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
};

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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(productStructuredData).replace(/</g, "\\u003c"),
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
