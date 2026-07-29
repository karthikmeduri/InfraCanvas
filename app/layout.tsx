import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
