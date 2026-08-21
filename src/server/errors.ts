import "server-only";

import { Prisma } from "@/generated/prisma/client";

/**
 * Database and domain errors.
 *
 * Raw Prisma errors carry table names, column names and sometimes the offending
 * values. None of that belongs in a browser response — it is a map of the schema
 * handed to anyone who can trigger an error. So every failure crossing out of the
 * data layer becomes an AppError with an Arabic message safe to display, while the
 * technical detail is logged on the server.
 */

export type AppErrorCode =
  | "VALIDATION"
  | "DUPLICATE"
  | "NOT_FOUND"
  | "RELATED_RECORD_MISSING"
  | "IN_USE"
  | "CONFLICT"
  | "UNAVAILABLE"
  | "FORBIDDEN"
  | "UNAUTHENTICATED"
  | "INTERNAL";

const STATUS_BY_CODE: Record<AppErrorCode, number> = {
  VALIDATION: 400,
  DUPLICATE: 409,
  NOT_FOUND: 404,
  RELATED_RECORD_MISSING: 400,
  IN_USE: 409,
  CONFLICT: 409,
  UNAVAILABLE: 503,
  FORBIDDEN: 403,
  UNAUTHENTICATED: 401,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  /** Field-level messages, for forms. Keyed by field name. */
  readonly fields?: Record<string, string>;
  /** Never sent to the browser — logged alongside the request. */
  readonly cause?: unknown;

  constructor(
    code: AppErrorCode,
    message: string,
    options: { fields?: Record<string, string>; cause?: unknown } = {},
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.fields = options.fields;
    this.cause = options.cause;
  }
}

export const notFound = (what = "السجل") =>
  new AppError("NOT_FOUND", `${what} غير موجود.`);

export const validationFailed = (
  message: string,
  fields?: Record<string, string>,
) => new AppError("VALIDATION", message, { fields });

export const conflict = (message: string) => new AppError("CONFLICT", message);

export const forbidden = (message = "لا تملك صلاحية تنفيذ هذا الإجراء.") =>
  new AppError("FORBIDDEN", message);

/**
 * Arabic wording for the unique constraints a user can actually collide with.
 * Anything not listed falls back to a generic duplicate message rather than
 * echoing the raw index name.
 */
const DUPLICATE_MESSAGES: Record<string, { message: string; field?: string }> = {
  "units.propertyId_unitNumber": {
    message: "رقم الوحدة مستخدم بالفعل في هذه المنشأة.",
    field: "unitNumber",
  },
  "unit_types.propertyId_name": {
    message: "يوجد نوع وحدة بهذا الاسم في المنشأة.",
    field: "name",
  },
  "guests.identificationType_identificationNumber": {
    message: "يوجد نزيل مسجّل بنفس نوع ورقم الهوية.",
    field: "identificationNumber",
  },
  "reservations.reservationNumber": {
    message: "رقم الحجز مستخدم بالفعل.",
    field: "reservationNumber",
  },
  "payments.paymentNumber": {
    message: "رقم سند القبض مستخدم بالفعل.",
    field: "paymentNumber",
  },
  "invoices.invoiceNumber": {
    message: "رقم الفاتورة مستخدم بالفعل.",
    field: "invoiceNumber",
  },
  "expenses.expenseNumber": {
    message: "رقم سند الصرف مستخدم بالفعل.",
    field: "expenseNumber",
  },
  "users.email": {
    message: "البريد الإلكتروني مستخدم بحساب آخر.",
    field: "email",
  },
  "users.employeeId": {
    message: "هذا الموظف لديه حساب دخول بالفعل.",
    field: "employeeId",
  },
  "properties.taxNumber": {
    message: "الرقم الضريبي مسجّل لمنشأة أخرى.",
    field: "taxNumber",
  },
  "roles.key": { message: "معرّف الدور مستخدم بالفعل.", field: "key" },
  "permissions.key": { message: "معرّف الصلاحية مستخدم بالفعل.", field: "key" },
  "outlets.propertyId_name": {
    message: "يوجد منفذ خدمة بهذا الاسم في المنشأة.",
    field: "name",
  },
  "inventory_items.propertyId_sku": {
    message: "رمز الصنف (SKU) مستخدم بالفعل.",
    field: "sku",
  },
  "inventory_categories.propertyId_name": {
    message: "يوجد تصنيف مخزون بهذا الاسم.",
    field: "name",
  },
};

/**
 * Shown when a table or column the code needs is missing from the database.
 *
 * Names the remedy, because this failure has exactly one cause and exactly one fix,
 * and an operator who has just deployed is the person reading it.
 */
export const SCHEMA_BEHIND_MESSAGE =
  "بنية قاعدة البيانات أقدم من نسخة التطبيق — لم تُطبَّق آخر الترحيلات. " +
  "شغّل `npm run db:deploy` ثم أعد تشغيل التطبيق.";

function duplicateFrom(error: Prisma.PrismaClientKnownRequestError): AppError {
  const target = error.meta?.target;
  const key = typeof target === "string" ? target : Array.isArray(target) ? target.join("_") : "";

  const match = Object.entries(DUPLICATE_MESSAGES).find(([lookup]) =>
    key.includes(lookup.split(".")[1] ?? lookup),
  );

  if (match) {
    const [, { message, field }] = match;
    return new AppError("DUPLICATE", message, {
      fields: field ? { [field]: message } : undefined,
      cause: error,
    });
  }

  return new AppError("DUPLICATE", "هذا السجل موجود مسبقًا.", { cause: error });
}

/**
 * Translates any thrown value into an AppError. Call it at the service boundary so
 * nothing above the data layer ever has to know Prisma exists.
 */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    /*
     * Every database outage reaches this layer as a pool exhaustion: the adapter
     * could not hand out a connection. Prisma files it under a generic code and
     * puts the real one (45028) in the message, so the message is what identifies
     * it. Without this the login screen answers an outage by telling someone to
     * try again, as though their password were the problem.
     */
    /*
     * The mariadb adapter reports a missing table or column by name before Prisma
     * assigns it a code, so the message is what identifies it in that path.
     */
    if (/TableDoesNotExist|ColumnNotFound|Unknown column|doesn't exist/i.test(error.message)) {
      return new AppError("UNAVAILABLE", SCHEMA_BEHIND_MESSAGE, { cause: error });
    }

    if (/45028|pool timeout|failed to retrieve a connection/i.test(error.message)) {
      return new AppError(
        "UNAVAILABLE",
        "تعذّر الاتصال بقاعدة البيانات. حاول مجددًا بعد قليل.",
        { cause: error },
      );
    }

    switch (error.code) {
      case "P2002":
        return duplicateFrom(error);

      case "P2003":
        return new AppError(
          "RELATED_RECORD_MISSING",
          "أحد السجلات المرتبطة غير موجود أو تم حذفه.",
          { cause: error },
        );

      case "P2014":
        return new AppError(
          "IN_USE",
          "لا يمكن تنفيذ العملية لأن هناك سجلات مرتبطة بهذا السجل.",
          { cause: error },
        );

      case "P2025":
        return new AppError("NOT_FOUND", "السجل المطلوب غير موجود.", {
          cause: error,
        });

      case "P2000":
        return new AppError(
          "VALIDATION",
          "إحدى القيم المدخلة أطول من الحد المسموح به.",
          { cause: error },
        );

      case "P2034":
        return new AppError(
          "CONFLICT",
          "تعذّر إتمام العملية بسبب تعارض مع عملية أخرى في نفس اللحظة. أعد المحاولة.",
          { cause: error },
        );

      /*
       * The schema is older than the code asking questions of it — a deployment that
       * shipped the application without running its migrations.
       *
       * Worth its own message rather than the generic database failure, because the
       * generic one sends an operator to check the connection, the credentials and the
       * host: everything except the one thing that is actually wrong. The connection is
       * fine. The table simply is not there yet.
       */
      case "P2021":
      case "P2022":
        return new AppError("UNAVAILABLE", SCHEMA_BEHIND_MESSAGE, { cause: error });

      default:
        return new AppError("INTERNAL", "تعذّر تنفيذ العملية على قاعدة البيانات.", {
          cause: error,
        });
    }
  }

  if (
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientRustPanicError
  ) {
    return new AppError(
      "UNAVAILABLE",
      "تعذّر الاتصال بقاعدة البيانات. حاول مجددًا بعد قليل.",
      { cause: error },
    );
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return new AppError("VALIDATION", "البيانات المرسلة غير صالحة.", {
      cause: error,
    });
  }

  return new AppError("INTERNAL", "حدث خطأ غير متوقع. حاول مجددًا.", {
    cause: error,
  });
}

/**
 * Wraps a data-layer call so callers only ever see AppError. The original error is
 * logged here with its context — the one place it is safe to keep the detail.
 */
export async function withDbErrors<T>(
  context: string,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const appError = toAppError(error);

    if (appError.code === "INTERNAL" || appError.code === "UNAVAILABLE") {
      console.error(`[db:${context}]`, appError.cause ?? appError);
    } else {
      console.warn(`[db:${context}] ${appError.code}: ${appError.message}`);
    }

    throw appError;
  }
}

/** Browser-safe shape of an error. Deliberately omits `cause`. */
export function serializeError(error: unknown): {
  error: string;
  code: AppErrorCode;
  fields?: Record<string, string>;
} {
  const appError = toAppError(error);
  return {
    error: appError.message,
    code: appError.code,
    ...(appError.fields ? { fields: appError.fields } : {}),
  };
}
