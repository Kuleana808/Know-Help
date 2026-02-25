import type { Metadata } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "know.help — Personal AI OS",
  description:
    "Give your AI a persistent knowledge base about you. Trigger-based context loading via MCP.",
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
