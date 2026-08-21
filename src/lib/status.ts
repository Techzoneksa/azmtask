/**
 * The system's status vocabulary.
 *
 * Every operational status has exactly one Arabic label and one visual tone, defined
 * here. Screens read from these maps instead of inventing their own wording, so a
 * room shown as "تحت النظافة" on the board says the same thing on the reservation.
 */

export type Tone = "ok" | "warn" | "danger" | "info" | "neutral" | "brand";

export type StatusMeta = { label: string; tone: Tone };

export const RESERVATION_STATUS = {
  pending: { label: "بانتظار التأكيد", tone: "warn" },
  confirmed: { label: "مؤكد", tone: "info" },
  checked_in: { label: "نزيل حالي", tone: "ok" },
  checked_out: { label: "تم المغادرة", tone: "neutral" },
  cancelled: { label: "ملغي", tone: "danger" },
  no_show: { label: "لم يحضر", tone: "danger" },
} as const satisfies Record<string, StatusMeta>;

export type ReservationStatus = keyof typeof RESERVATION_STATUS;

/*
 * Keyed by the database's own enum values, lower-cased.
 *
 * `partially_paid` used to be spelled `partial` here, which matched nothing — so a
 * part-paid booking rendered the raw `PARTIALLY_PAID` on screen, which is exactly what
 * a label map exists to prevent. Keys in these maps must be the enum member, not a
 * shortened reading of it.
 */
export const PAYMENT_STATUS = {
  unpaid: { label: "غير مدفوع", tone: "danger" },
  partially_paid: { label: "مدفوع جزئيًا", tone: "warn" },
  paid: { label: "مدفوع بالكامل", tone: "ok" },
  refunded: { label: "مسترجع", tone: "neutral" },
} as const satisfies Record<string, StatusMeta>;

export type PaymentStatus = keyof typeof PAYMENT_STATUS;

export const UNIT_STATUS = {
  available: { label: "متاحة", tone: "ok" },
  reserved: { label: "محجوزة", tone: "info" },
  occupied: { label: "مشغولة", tone: "brand" },
  cleaning: { label: "تحت النظافة", tone: "warn" },
  maintenance: { label: "تحت الصيانة", tone: "danger" },
  blocked: { label: "موقوفة", tone: "neutral" },
} as const satisfies Record<string, StatusMeta>;

export type UnitStatus = keyof typeof UNIT_STATUS;

export const HOUSEKEEPING_STATUS = {
  clean: { label: "نظيفة", tone: "ok" },
  dirty: { label: "تحتاج تنظيف", tone: "warn" },
  cleaning: { label: "جاري التنظيف", tone: "info" },
  inspected: { label: "تم الفحص", tone: "ok" },
  out_of_service: { label: "خارج الخدمة", tone: "danger" },
} as const satisfies Record<string, StatusMeta>;

export type HousekeepingStatus = keyof typeof HOUSEKEEPING_STATUS;

export const HOUSEKEEPING_TASK_STATUS = {
  pending: { label: "بانتظار التنفيذ", tone: "warn" },
  assigned: { label: "تم الإسناد", tone: "info" },
  in_progress: { label: "جاري التنفيذ", tone: "info" },
  completed: { label: "مكتملة", tone: "ok" },
  cancelled: { label: "ملغاة", tone: "neutral" },
} as const satisfies Record<string, StatusMeta>;

export type HousekeepingTaskStatus = keyof typeof HOUSEKEEPING_TASK_STATUS;

export const MAINTENANCE_STATUS = {
  open: { label: "مفتوح", tone: "warn" },
  assigned: { label: "تم الإسناد", tone: "info" },
  in_progress: { label: "قيد التنفيذ", tone: "info" },
  completed: { label: "مكتمل", tone: "ok" },
  cancelled: { label: "ملغي", tone: "neutral" },
} as const satisfies Record<string, StatusMeta>;

export type MaintenanceStatus = keyof typeof MAINTENANCE_STATUS;

/*
 * Keyed by the InvoiceStatus enum. `partial` and `void` were invented here and match
 * nothing the database can produce — the real members are PARTIALLY_PAID and
 * CANCELLED — so a part-paid or cancelled invoice showed its raw enum.
 */
export const INVOICE_STATUS = {
  draft: { label: "مسودة", tone: "neutral" },
  issued: { label: "صادرة", tone: "info" },
  partially_paid: { label: "مدفوعة جزئيًا", tone: "warn" },
  paid: { label: "مدفوعة", tone: "ok" },
  cancelled: { label: "ملغاة", tone: "danger" },
} as const satisfies Record<string, StatusMeta>;

export type InvoiceStatus = keyof typeof INVOICE_STATUS;

export const PRIORITY = {
  low: { label: "منخفضة", tone: "neutral" },
  medium: { label: "متوسطة", tone: "info" },
  high: { label: "عالية", tone: "warn" },
  urgent: { label: "عاجلة", tone: "danger" },
} as const satisfies Record<string, StatusMeta>;

export type Priority = keyof typeof PRIORITY;

export const RECORD_STATUS = {
  active: { label: "نشط", tone: "ok" },
  inactive: { label: "غير نشط", tone: "neutral" },
  suspended: { label: "موقوف", tone: "danger" },
} as const satisfies Record<string, StatusMeta>;

export type RecordStatus = keyof typeof RECORD_STATUS;

export const PROPERTY_TYPE = {
  hotel: { label: "فندق", tone: "brand" },
  serviced_apartment: { label: "شقق مخدومة", tone: "info" },
  resort: { label: "منتجع", tone: "ok" },
} as const satisfies Record<string, StatusMeta>;

export type PropertyType = keyof typeof PROPERTY_TYPE;

export const RESERVATION_SOURCE = {
  direct: { label: "حجز مباشر", tone: "brand" },
  website: { label: "الموقع الإلكتروني", tone: "info" },
  phone: { label: "هاتف", tone: "info" },
  walk_in: { label: "زيارة مباشرة", tone: "ok" },
  channel: { label: "قناة حجز", tone: "warn" },
  corporate: { label: "عقد شركات", tone: "neutral" },
} as const satisfies Record<string, StatusMeta>;

export type ReservationSource = keyof typeof RESERVATION_SOURCE;

export const PAYMENT_METHOD = {
  cash: { label: "نقدًا", tone: "ok" },
  card: { label: "شبكة / بطاقة", tone: "info" },
  transfer: { label: "تحويل بنكي", tone: "brand" },
  other: { label: "أخرى", tone: "neutral" },
} as const satisfies Record<string, StatusMeta>;

export type PaymentMethod = keyof typeof PAYMENT_METHOD;

/** Safe lookup — an unknown key renders as itself rather than crashing a table row. */
export function statusMeta(
  map: Record<string, StatusMeta>,
  key: string | null | undefined,
): StatusMeta {
  if (!key) return { label: "—", tone: "neutral" };

  /*
   * Case-normalised, because the two sides of this lookup are written differently on
   * purpose: the maps above read as lower-case identifiers, and the database's enums
   * arrive SCREAMING_CASE. An exact match therefore never succeeded, and every caller
   * fell through to the fallback — which renders the raw enum on screen, the one thing
   * a label map exists to prevent. Several modules had quietly grown their own
   * lowercasing wrapper around this function rather than fixing it.
   */
  return map[key.toLowerCase()] ?? { label: key, tone: "neutral" };
}

/** Turns a status map into `<Select>` options in declaration order. */
export function statusOptions(
  map: Record<string, StatusMeta>,
): Array<{ value: string; label: string }> {
  return Object.entries(map).map(([value, meta]) => ({ value, label: meta.label }));
}
