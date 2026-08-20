import { FileQuestion } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-surface-inset">
          <FileQuestion className="h-7 w-7 text-content-subtle" aria-hidden />
        </div>
        <h1 className="text-xl font-semibold text-content">الصفحة غير موجودة</h1>
        <p className="mt-2 text-sm leading-relaxed text-content-muted">
          الرابط الذي فتحته غير صحيح أو تم نقل الصفحة. تحقق من العنوان أو عد إلى
          الشاشة الرئيسية.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-10 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-700"
        >
          العودة إلى الشاشة الرئيسية
        </Link>
      </div>
    </div>
  );
}
