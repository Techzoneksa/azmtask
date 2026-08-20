import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { defaultRouteFor } from "@/lib/nav";

/** Entry point — sends the visitor to the first screen their role can open. */
export default async function RootPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  redirect(defaultRouteFor(session.permissions));
}
