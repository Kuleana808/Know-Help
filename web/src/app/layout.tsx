import type { Metadata } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "know.help — Personal AI OS",
  description:
    "Give your AI a persistent knowledge base about you. Trigger-based context loading via MCP.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "know.help — Your AI should already know this.",
    description:
      "Trigger-based context loading for Claude. Install professional judgment as Mindsets.",
    url: "https://know.help",
    siteName: "know.help",
    images: [
      {
        url: "https://know.help/og-image.png",
        width: 1200,
        height: 630,
        alt: "know.help — Context Engineering Platform",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "know.help — Your AI should already know this.",
    description:
      "Trigger-based context loading for Claude. Install professional judgment as Mindsets.",
    images: ["https://know.help/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
