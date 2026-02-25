import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mindset Marketplace — know.help",
  description:
    "Install expertise, not employees. Subscribe to Mindsets from verified professionals. Living judgment for your AI.",
  openGraph: {
    title: "Mindset Marketplace — know.help",
    description:
      "Subscribe to Mindsets from verified professionals. Living judgment for your AI.",
    url: "https://know.help/mindsets",
    siteName: "know.help",
    images: [
      {
        url: "https://know.help/og-image.png",
        width: 1200,
        height: 630,
        alt: "know.help — Mindset Marketplace",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Mindset Marketplace — know.help",
    description:
      "Install expertise, not employees. Subscribe to Mindsets from verified professionals.",
    images: ["https://know.help/og-image.png"],
  },
};

export default function MindsetsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
