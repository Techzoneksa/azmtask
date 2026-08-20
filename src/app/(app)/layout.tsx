import { AppShell } from "@/components/layout/AppShell";
import { requireSession } from "@/lib/auth/guard";

/**
 * Authenticated area.
 *
 * The middleware already rejected requests without a session cookie; this layout
 * re-derives the session on the server so navigation and the user menu are built
 * from verified data rather than anything the client could set.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  return (
    <AppShell
      permissions={[...session.permissions]}
      user={{
        name: session.name,
        email: session.email,
        role: session.role,
        jobTitle: session.jobTitle,
      }}
      canOpenSettings={session.permissions.includes("settings.view")}
    >
      {children}
    </AppShell>
  );
}
