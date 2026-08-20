"use client";

import { useEffect } from "react";

/** Last-resort boundary — replaces the whole document, so it ships its own html/body. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Fatal application error:", error);
  }, [error]);

  return (
    <html lang="ar" dir="rtl">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#f8fafb",
          color: "#0f2124",
          padding: "1.25rem",
        }}
      >
        <div style={{ maxWidth: "26rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600, margin: 0 }}>
            حدث خطأ في النظام
          </h1>
          <p
            style={{
              marginTop: "0.5rem",
              fontSize: "0.875rem",
              color: "#5a6c70",
              lineHeight: 1.7,
            }}
          >
            تعذّر تحميل التطبيق. أعد المحاولة، وإذا استمر الخطأ تواصل مع مدير النظام.
          </p>
          {error.digest && (
            <p
              dir="ltr"
              style={{
                marginTop: "0.75rem",
                fontFamily: "ui-monospace, monospace",
                fontSize: "0.6875rem",
                color: "#859599",
              }}
            >
              {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              height: "2.5rem",
              padding: "0 1rem",
              borderRadius: "0.5rem",
              border: "none",
              background: "#1f6a69",
              color: "white",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            إعادة المحاولة
          </button>
        </div>
      </body>
    </html>
  );
}
