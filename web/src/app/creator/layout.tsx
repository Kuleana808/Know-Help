import CreatorSidebar from "@/components/creator-sidebar";

export default function CreatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <CreatorSidebar />
      <main className="flex-1 bg-bg">{children}</main>
    </div>
  );
}
