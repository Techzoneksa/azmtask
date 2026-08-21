import { AppShell } from "@/components/layout/AppShell";
import { requireSession } from "@/lib/auth/guard";
import { getPendingMigrations } from "@/server/schema-state";
import { getPropertyName } from "@/server/services/property.service";

/**
 * Authenticated area.
 *
 * The middleware already rejected requests without a session cookie; this layout
 * re-derives the session on the server so navigation and the user menu are built
 * from verified data rather than anything the client could set.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  // The shell names the property it is operating, rather than a name compiled in.
  const [propertyName, pendingMigrations] = await Promise.all([
    getPropertyName(),
    getPendingMigrations(),
  ]);

  return (
    <AppShell
      propertyName={propertyName}
      permissions={[...session.permissions]}
      user={{
        name: session.name,
        email: session.email,
        role: session.role,
        jobTitle: session.jobTitle,
      }}
      canOpenSettings={session.permissions.includes("settings.view")}
      pendingMigrations={pendingMigrations}
    >
      {children}
    </AppShell>
  );
}
