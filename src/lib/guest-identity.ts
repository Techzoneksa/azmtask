/**
 * Guest identity: normalization, comparison, and safe display.
 *
 * A guest is a long-term identity, not a per-booking record. That only holds if the
 * same person typed in twice reduces to the same stored values — so every field that
 * participates in matching is normalized here, in one place, and the same function
 * is used when storing and when searching. A normalizer used on write but not on
 * read is worse than none: it guarantees the lookup misses.
 *
 * The line this module will not cross: normalization may reformat, never reinterpret.
 * Whitespace, digit script and letter case are presentation. A character inside a
 * passport number is identity. Deleting one to make matching easier would corrupt a
 * legal document reference to save a keystroke.
 */

/** Arabic-Indic and Extended Arabic-Indic digits, in value order. */
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const EXTENDED_ARABIC_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

/**
 * Rewrites Arabic-Indic digits as Latin ones.
 *
 * An Arabic keyboard produces ٠٥٥ and a Latin one 055 for the same phone number.
 * Stored as typed they never match, and reception concludes the guest is new.
 */
export function normalizeDigits(value: string): string {
  let out = "";
  for (const char of value) {
    const arabic = ARABIC_DIGITS.indexOf(char);
    if (arabic >= 0) {
      out += String(arabic);
      continue;
    }
    const extended = EXTENDED_ARABIC_DIGITS.indexOf(char);
    out += extended >= 0 ? String(extended) : char;
  }
  return out;
}

/** Collapses whitespace runs and trims. Used on every free-text identity field. */
export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * A person's name as typed, tidied.
 *
 * Only spacing is touched. Arabic orthography carries meaning in its diacritics and
 * hamza forms — stripping them to improve matching would rewrite how someone's name
 * is spelled on their own documents.
 */
export function normalizeName(value: string): string {
  return normalizeWhitespace(normalizeDigits(value));
}

/** Lowercased and trimmed. Mail domains are case-insensitive, and so, in practice, are mailboxes. */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * A Saudi mobile in its one canonical form: 05XXXXXXXX.
 *
 * `+966551234567`, `00966 55 123 4567` and `055-123-4567` are the same phone, and a
 * guest directory that files them as three people is not a directory. Returns null
 * for anything that is not a recognisable Saudi mobile, so the caller decides
 * whether that is a validation failure or simply a search term that is not a phone.
 */
export function normalizeMobile(value: string): string | null {
  const cleaned = normalizeDigits(value).replace(/[\s\-().]/g, "");
  const match = /^(?:\+?966|00966|0)?(5\d{8})$/.exec(cleaned);
  return match ? `0${match[1]}` : null;
}

/**
 * A document number, tidied for storage and comparison.
 *
 * Trimmed, digit-normalized, inner spaces removed, and upper-cased — passport
 * numbers are case-insensitive by ICAO 9303, so `a1234567` and `A1234567` are one
 * document. Everything else is left exactly as entered: no character is dropped,
 * because a hyphen or letter inside a document number is part of the number.
 */
export function normalizeIdentificationNumber(value: string): string {
  return normalizeDigits(value).replace(/\s+/g, "").toUpperCase();
}

/** The controlled vocabulary. Raw enum values never reach a screen. */
export const IDENTIFICATION_TYPES = [
  { value: "NATIONAL_ID", label: "هوية وطنية" },
  { value: "IQAMA", label: "إقامة" },
  { value: "GCC_ID", label: "هوية خليجية" },
  { value: "PASSPORT", label: "جواز سفر" },
  { value: "OTHER", label: "أخرى" },
] as const;

export type IdentificationTypeValue = (typeof IDENTIFICATION_TYPES)[number]["value"];

export const IDENTIFICATION_TYPE_VALUES = IDENTIFICATION_TYPES.map((t) => t.value) as [
  IdentificationTypeValue,
  ...IdentificationTypeValue[],
];

export function identificationTypeLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return IDENTIFICATION_TYPES.find((type) => type.value === value)?.label ?? value;
}

export const GENDERS = [
  { value: "MALE", label: "ذكر" },
  { value: "FEMALE", label: "أنثى" },
] as const;

export function genderLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return GENDERS.find((gender) => gender.value === value)?.label ?? value;
}

/**
 * A document number with everything but the last four characters hidden.
 *
 * Enough to confirm you are looking at the right person, not enough to copy the
 * document down. Very short numbers are hidden entirely rather than shown almost
 * whole — masking that reveals most of the value is theatre.
 */
export function maskIdentificationNumber(value: string | null | undefined): string {
  if (!value) return "—";
  const trimmed = value.trim();
  if (trimmed.length === 0) return "—";
  if (trimmed.length <= 4) return "•".repeat(trimmed.length);
  return `${"•".repeat(Math.min(trimmed.length - 4, 8))}${trimmed.slice(-4)}`;
}

/** Spoken form of a masked number, so the masking is not conveyed by shape alone. */
export function maskedIdentificationLabel(value: string | null | undefined): string {
  if (!value || value.trim().length === 0) return "لا يوجد رقم وثيقة";
  const trimmed = value.trim();
  if (trimmed.length <= 4) return "رقم الوثيقة مخفي";
  return `رقم الوثيقة مخفي، ينتهي بـ ${trimmed.slice(-4)}`;
}
