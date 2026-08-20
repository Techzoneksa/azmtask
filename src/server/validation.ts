import { z } from "zod";

import { businessDate, nightsBetween } from "@/lib/datetime";
import { money } from "@/lib/money";

/**
 * Runtime validation.
 *
 * TypeScript types vanish at build time — they say nothing about a JSON body, a
 * form post or a query string. Everything entering a service goes through a schema
 * here first, with Arabic messages the UI can show directly.
 */

/** cuid — the id format every model in this schema uses. */
export const IdSchema = z
  .string()
  .trim()
  .min(1, "المعرّف مطلوب")
  .max(30, "المعرّف غير صالح")
  .regex(/^[a-z0-9]+$/i, "المعرّف غير صالح");

export const OptionalIdSchema = IdSchema.optional().nullable();

export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("صيغة البريد الإلكتروني غير صحيحة")
  .max(160, "البريد الإلكتروني أطول من الحد المسموح");

/** Saudi mobile: 05XXXXXXXX, or the +966 / 00966 forms, normalised to local. */
export const MobileSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s-()]/g, ""))
  .refine(
    (value) => /^(?:05\d{8}|(?:\+?966|00966)5\d{8})$/.test(value),
    "رقم الجوال غير صحيح. الصيغة المتوقعة: 05XXXXXXXX",
  )
  .transform((value) => {
    const digits = value.replace(/\D/g, "");
    return digits.length > 10 ? `0${digits.slice(-9)}` : digits;
  });

/** Business date: accepts "YYYY-MM-DD" or a Date, always yields UTC midnight. */
export const BusinessDateSchema = z
  .union([z.string(), z.date()])
  .transform((value, ctx) => {
    try {
      return businessDate(value);
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "التاريخ غير صالح" });
      return z.NEVER;
    }
  });

/** A monetary amount that must not be negative — a charge, a rate, a total. */
export const MoneySchema = z
  .union([z.number(), z.string(), z.instanceof(Object)])
  .transform((value, ctx) => {
    const amount = money(value as never);
    if (amount.isNegative()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "المبلغ لا يمكن أن يكون سالبًا",
      });
      return z.NEVER;
    }
    if (amount.greaterThan("9999999999.99")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "المبلغ أكبر من الحد المسموح",
      });
      return z.NEVER;
    }
    return amount;
  });

/** A payment amount: may be negative, because a refund is a negative receipt. */
export const SignedMoneySchema = z
  .union([z.number(), z.string(), z.instanceof(Object)])
  .transform((value, ctx) => {
    const amount = money(value as never);
    if (amount.isZero()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "المبلغ لا يمكن أن يكون صفرًا",
      });
      return z.NEVER;
    }
    return amount;
  });

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type Pagination = z.infer<typeof PaginationSchema>;

/** Turns page/pageSize into Prisma's skip/take. */
export function toSkipTake(pagination: Pagination): { skip: number; take: number } {
  return {
    skip: (pagination.page - 1) * pagination.pageSize,
    take: pagination.pageSize,
  };
}

/**
 * Stay dates. Enforces the invariant the database cannot express on its own:
 * check-out must come after check-in, so a zero or negative-length stay is
 * impossible before it ever reaches a table.
 */
export const StayDatesSchema = z
  .object({
    checkInDate: BusinessDateSchema,
    checkOutDate: BusinessDateSchema,
  })
  .refine((value) => nightsBetween(value.checkInDate, value.checkOutDate) >= 1, {
    message: "تاريخ المغادرة يجب أن يكون بعد تاريخ الوصول بليلة واحدة على الأقل",
    path: ["checkOutDate"],
  });

/** Flattens a ZodError into the field map AppError carries to a form. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}
