import type { Metadata } from "next";
import { THEME_BOOTSTRAP_SCRIPT } from "@/lib/theme";
import "./globals.css";
import "./builder.css";

export const metadata: Metadata = {
  title: "InfraCanvas — Visual Cloud Architecture to Terraform",
  description:
    "Design AWS, Azure, Google Cloud, and Oracle Cloud architectures visually, configure real infrastructure values, and generate editable Terraform templates.",
  applicationName: "InfraCanvas",
  keywords: [
    "Terraform",
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
      </head>
      <body>{children}</body>
    </html>
  );
}
