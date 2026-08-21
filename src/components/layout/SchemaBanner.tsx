import { AlertTriangle } from "lucide-react";

/**
 * Says out loud that the database is older than the code.
 *
 * Shown on every screen, because the symptom is not confined to one: whichever page
 * happens to touch a missing table fails, and the rest work, which reads as a random
 * fault rather than a single missed step. One sentence naming the command turns an
 * afternoon of checking credentials into a thirty-second fix.
 *
 * Renders nothing at all when the schema is current, which is every normal request.
 *
 * Presentational on purpose: the shell around it is a client component, so the facts
 * are gathered in the server layout and handed down. Reading the filesystem from
 * inside a client boundary is not something to work around — it is something not to
 * ask for.
 */
export function SchemaBanner({ pending }: { pending: string[] }) {
  if (pending.length === 0) return null;

  return (
    <div
      role="alert"
      className="border-b border-warn-fg/25 bg-warn-bg px-4 py-2.5 lg:px-6"
    >
      <div className="mx-auto flex max-w-[1600px] items-start gap-2.5">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn-fg" aria-hidden />
        <div className="min-w-0 text-[12px] leading-relaxed text-warn-fg">
          <p className="font-semibold">
            بنية قاعدة البيانات أقدم من نسخة التطبيق — {pending.length} ترحيل لم
            يُطبَّق.
          </p>
          <p className="mt-0.5">
            بعض الشاشات ستفشل حتى تُطبَّق. على الخادم شغّل{" "}
            <code className="rounded bg-warn-fg/10 px-1.5 py-0.5 font-mono" dir="ltr">
              npm run db:deploy
            </code>{" "}
            ثم أعد تشغيل التطبيق.
          </p>
          <p className="mt-1 font-mono text-[11px] opacity-80" dir="ltr">
            {pending.join(" · ")}
          </p>
        </div>
      </div>
    </div>
  );
}
