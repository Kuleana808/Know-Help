"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/creator", label: "Overview", icon: "home" },
  { href: "/creator/mindsets", label: "My Mindsets", icon: "layers" },
  { href: "/creator/import", label: "Import", icon: "upload" },
  { href: "/creator/capture", label: "Capture", icon: "radio" },
  { href: "/creator/profile", label: "Profile", icon: "user" },
  { href: "/creator/verify", label: "Verification", icon: "shield" },
  { href: "/creator/payouts", label: "Payouts", icon: "dollar" },
];

const icons: Record<string, string> = {
  home: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  layers: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10",
  user: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
  shield: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
  dollar: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  upload: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12",
  radio: "M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728m-9.9-2.829a5 5 0 010-7.07m7.072 0a5 5 0 010 7.07M13 12a1 1 0 11-2 0 1 1 0 012 0z",
};

export default function CreatorSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 border-r border-border bg-surface flex flex-col h-screen sticky top-0">
      <div className="p-4 border-b border-border">
        <Link href="/" className="font-serif text-lg font-medium">
          know.help
        </Link>
        <p className="text-[10px] tracking-[0.16em] uppercase text-accent-mid mt-1">
          Creator Portal
        </p>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/creator" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded text-sm transition-colors ${
                isActive
                  ? "bg-accent-light text-accent font-medium"
                  : "text-muted hover:bg-bg2 hover:text-text"
              }`}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d={icons[item.icon]}
                />
              </svg>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border space-y-2">
        <Link
          href="/mindsets"
          className="text-xs text-muted hover:text-text transition-colors block"
        >
          Marketplace
        </Link>
        <Link
          href="/dashboard"
          className="text-xs text-muted hover:text-text transition-colors block"
        >
          Dashboard
        </Link>
      </div>
    </aside>
  );
}
