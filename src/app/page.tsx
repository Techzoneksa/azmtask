import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth/session";
import { defaultRouteFor } from "@/lib/nav";

/**
 * Entry point — sends the visitor to the first screen their role can open.
 *
 * A database outage must not turn the front door into a system error. Both the
 * failure and the absence of a session lead to the login screen, which renders
 * without a database and says plainly when one is missing.
 */
export default async function RootPage() {
  let session = null;
  let unavailable = false;

  try {
    session = await getSession();
  } catch (error) {
    console.error("[root] could not resolve the session", error);
    unavailable = true;
  }

  // Outside the try: Next implements redirect by throwing.
  if (unavailable) redirect("/login?unavailable=1");
  if (!session) redirect("/login");
  redirect(defaultRouteFor(session.permissions));
}
