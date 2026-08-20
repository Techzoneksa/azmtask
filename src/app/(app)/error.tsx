"use client";

import { RotateCcw } from "lucide-react";
import { useEffect } from "react";

import { Button, Card, ErrorState } from "@/components/ui";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surfaced in the server log / browser console for diagnosis; the user sees the
    // friendly state below rather than a stack trace.
    console.error("Unhandled error in app route:", error);
  }, [error]);

  return (
    <Card>
      <ErrorState
        description={
          <>
            حدث خطأ غير متوقع أثناء عرض هذه الشاشة. يمكنك إعادة المحاولة، وإذا تكرر
            الخطأ تواصل مع مدير النظام.
            {error.digest && (
              <span className="mt-2 block font-mono text-[11px] text-content-subtle" dir="ltr">
                {error.digest}
              </span>
            )}
          </>
        }
        action={
          <Button icon={RotateCcw} onClick={reset}>
            إعادة المحاولة
          </Button>
        }
      />
    </Card>
  );
}
