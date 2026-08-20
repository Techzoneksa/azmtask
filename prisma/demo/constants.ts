import { businessDate } from "../../src/lib/datetime";

/**
 * Demo scenario constants.
 *
 * Every date in the demo is derived from DEMO_BUSINESS_DATE, never from
 * `new Date()` at seed time. That is what makes the scenario reproducible: the
 * hotel seeded today and the hotel seeded in six months are the same hotel, so a
 * validator run and a screenshot both stay meaningful.
 */

/** The single day the entire demo is staged around. */
export const DEMO_BUSINESS_DATE = businessDate("2026-08-20");

/** Fixed seed for every pseudo-random choice in the demo. */
export const DEMO_SEED = 20260820;

/**
 * A stable marker written into the property's settings. The reset command uses it
 * to recognise demo-owned data, so it can never mistake a real hotel for one.
 */
export const DEMO_MARKER_KEY = "demo.dataset";
export const DEMO_MARKER_VALUE = "arwiqah-jeddah-v1";

/** Fictional. Not a real hotel, and deliberately not a real company's tax identity. */
export const DEMO_PROPERTY = {
  name: "فندق أروقة جدة",
  type: "HOTEL",
  city: "جدة",
  address: "طريق الكورنيش، حي الشاطئ، جدة",
  phone: "0126543210",
  email: "info@arwiqah-demo.sa",
  /** Demo-safe: a valid-shaped Saudi VAT number that belongs to nobody. */
  taxNumber: "399999999900003",
} as const;

export const HISTORY_DAYS = 40;
export const FUTURE_DAYS = 35;

export const UNIT_TYPES = [
  { key: "standard", name: "غرفة قياسية", capacity: 2, baseRate: "220.00",
    description: "غرفة بسرير مزدوج، مساحة 24 م²، إطلالة داخلية." },
  { key: "deluxe", name: "غرفة ديلوكس", capacity: 2, baseRate: "280.00",
    description: "غرفة أوسع بإطلالة جانبية على البحر، مساحة 32 م²." },
  { key: "junior_suite", name: "جناح جونيور", capacity: 3, baseRate: "350.00",
    description: "جناح بمنطقة جلوس منفصلة، مساحة 45 م²." },
  { key: "executive_suite", name: "جناح تنفيذي", capacity: 4, baseRate: "450.00",
    description: "جناح بغرفة نوم وصالة ومكتب، إطلالة بحرية، مساحة 60 م²." },
  { key: "apartment", name: "شقة غرفة وصالة", capacity: 4, baseRate: "550.00",
    description: "شقة فندقية بمطبخ صغير وغرفة نوم وصالة، مساحة 75 م²." },
] as const;

export type UnitTypeKey = (typeof UNIT_TYPES)[number]["key"];

/**
 * Floor plan: 40 units over four floors. Upper floors carry the larger units, the
 * way a real property is laid out — it also gives the unit board something to show
 * beyond a uniform grid.
 */
export const FLOOR_PLAN: ReadonlyArray<{
  floor: number;
  rooms: ReadonlyArray<{ number: string; type: UnitTypeKey }>;
}> = [
  {
    floor: 1,
    rooms: [
      { number: "101", type: "standard" }, { number: "102", type: "standard" },
      { number: "103", type: "standard" }, { number: "104", type: "standard" },
      { number: "105", type: "standard" }, { number: "106", type: "standard" },
      { number: "107", type: "deluxe" }, { number: "108", type: "deluxe" },
      { number: "109", type: "deluxe" }, { number: "110", type: "deluxe" },
    ],
  },
  {
    floor: 2,
    rooms: [
      { number: "201", type: "standard" }, { number: "202", type: "standard" },
      { number: "203", type: "standard" }, { number: "204", type: "deluxe" },
      { number: "205", type: "deluxe" }, { number: "206", type: "deluxe" },
      { number: "207", type: "deluxe" }, { number: "208", type: "junior_suite" },
      { number: "209", type: "junior_suite" }, { number: "210", type: "junior_suite" },
    ],
  },
  {
    floor: 3,
    rooms: [
      { number: "301", type: "deluxe" }, { number: "302", type: "deluxe" },
      { number: "303", type: "junior_suite" }, { number: "304", type: "junior_suite" },
      { number: "305", type: "junior_suite" }, { number: "306", type: "junior_suite" },
      { number: "307", type: "executive_suite" }, { number: "308", type: "executive_suite" },
      { number: "309", type: "executive_suite" }, { number: "310", type: "apartment" },
    ],
  },
  {
    floor: 4,
    rooms: [
      { number: "401", type: "junior_suite" }, { number: "402", type: "executive_suite" },
      { number: "403", type: "executive_suite" }, { number: "404", type: "executive_suite" },
      { number: "405", type: "apartment" }, { number: "406", type: "apartment" },
      { number: "407", type: "apartment" }, { number: "408", type: "apartment" },
      { number: "409", type: "apartment" }, { number: "410", type: "apartment" },
    ],
  },
];

export const OUTLETS = [
  { name: "مقهى أروقة", type: "CAFE", location: "الطابق الأرضي" },
  { name: "خدمة الغرف", type: "ROOM_SERVICE", location: "المطبخ الرئيسي" },
  { name: "مغسلة الفندق", type: "LAUNDRY", location: "القبو" },
  { name: "مطعم الشاطئ", type: "RESTAURANT", location: "الطابق الأول" },
] as const;
