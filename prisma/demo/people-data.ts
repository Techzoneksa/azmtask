/**
 * Name and contact pools for the demo.
 *
 * All fictional. Mobile numbers use the 0555/0556 blocks with varied digits rather
 * than a visible sequence — 0500000001, 0500000002 reads as filler on a screen a
 * client is looking at. Identity numbers are shaped correctly (Saudi national IDs
 * start with 1, iqamas with 2) but belong to nobody.
 */

export const SAUDI_MALE_NAMES = [
  "عبدالله الغامدي", "محمد الزهراني", "سعود العنزي", "فهد القحطاني",
  "تركي الشمري", "بندر الحربي", "ماجد الدوسري", "نايف العتيبي",
  "سلطان البقمي", "ريان المالكي", "عمر الصاعدي", "يوسف الثبيتي",
  "خالد السبيعي", "أحمد الرشيدي", "عبدالعزيز الجهني", "مشعل المطيري",
] as const;

export const SAUDI_FEMALE_NAMES = [
  "نورة الشهري", "ريم القرني", "لمى الحارثي", "سارة العمري",
  "هيفاء الشريف", "دانة الزهراني", "منال الغامدي", "أمل الفيفي",
  "شهد باوزير", "جواهر السلمي",
] as const;

export const GCC_NAMES = [
  "حمد المهيري", "علي البلوشي", "ناصر الكواري", "فيصل العجمي",
  "يعقوب الرشيد", "منصور الهاجري", "طلال الصباح",
] as const;

export const INTERNATIONAL_NAMES = [
  { name: "أحمد سيف الدين", nationality: "مصري" },
  { name: "محمد إقبال خان", nationality: "باكستاني" },
  { name: "رامي حداد", nationality: "أردني" },
  { name: "عبدالرحمن سيسيه", nationality: "سنغالي" },
  { name: "ديفيد مورغان", nationality: "بريطاني" },
  { name: "سمير بن عمار", nationality: "تونسي" },
  { name: "إلياس دياب", nationality: "لبناني" },
  { name: "أنور رحمن", nationality: "بنغلاديشي" },
  { name: "جوزيف أوكونكو", nationality: "نيجيري" },
  { name: "مراد يلماز", nationality: "تركي" },
] as const;

export const GCC_NATIONALITIES = ["إماراتي", "كويتي", "قطري", "بحريني", "عُماني"] as const;

/** Written on a minority of profiles only — a note on every guest is noise. */
export const GUEST_NOTES = [
  "يفضل طابق مرتفع",
  "يفضل غرفة هادئة بعيدة عن المصعد",
  "يحتاج سرير أطفال إضافي",
  "وصول متأخر بعد منتصف الليل",
  "عميل متكرر — يفضل نفس الغرفة",
  "حساسية من الريش، يرجى تغيير الوسائد",
  "يطلب مغادرة متأخرة عادةً",
  "لا يرغب بخدمة التنظيف اليومية",
] as const;

export const GUEST_PREFERENCES = [
  "غرفة غير مدخنين",
  "إطلالة بحرية",
  "سرير كبير",
  "سريران منفصلان",
  "قريبة من المصعد",
] as const;

/**
 * The hotel team. Departments follow the schema's enum; positions are the Arabic
 * titles reception and HR would actually use.
 */
export const EMPLOYEES = [
  { key: "gm", name: "ماجد بن سعد العتيبي", department: "MANAGEMENT", position: "مدير الفندق", mobile: "0555102030" },
  { key: "ops", name: "عبدالله بن ناصر الحربي", department: "MANAGEMENT", position: "مدير التشغيل", mobile: "0555102031" },
  { key: "fo_super", name: "نورة بنت خالد الشهري", department: "FRONT_OFFICE", position: "مشرفة الاستقبال", mobile: "0555102032" },
  { key: "fo_1", name: "ريم بنت فهد القرني", department: "FRONT_OFFICE", position: "موظفة استقبال", mobile: "0555102033" },
  { key: "fo_2", name: "سلمان بن عايض الزهراني", department: "FRONT_OFFICE", position: "موظف استقبال", mobile: "0555102034" },
  { key: "fo_3", name: "تركي بن مبارك الدوسري", department: "FRONT_OFFICE", position: "موظف استقبال", mobile: "0555102035" },
  { key: "acc", name: "خالد بن إبراهيم السبيعي", department: "FINANCE", position: "محاسب", mobile: "0555102036" },
  { key: "hk_super", name: "منال بنت سعيد الغامدي", department: "HOUSEKEEPING", position: "مشرفة النظافة", mobile: "0555102037" },
  { key: "hk_1", name: "فاطمة بنت علي الفيفي", department: "HOUSEKEEPING", position: "عاملة نظافة", mobile: "0555102038" },
  { key: "hk_2", name: "أمينة بنت محمد جالو", department: "HOUSEKEEPING", position: "عاملة نظافة", mobile: "0555102039" },
  { key: "hk_3", name: "سعاد بنت حسن باوزير", department: "HOUSEKEEPING", position: "عاملة نظافة", mobile: "0555102040" },
  { key: "hk_4", name: "هدى بنت عمر الشريف", department: "HOUSEKEEPING", position: "عاملة نظافة", mobile: "0555102041" },
  { key: "mt_1", name: "ياسر بن صالح المالكي", department: "MAINTENANCE", position: "فني صيانة", mobile: "0555102042" },
  { key: "mt_2", name: "إقبال أحمد", department: "MAINTENANCE", position: "فني تكييف", mobile: "0555102043" },
  { key: "store", name: "بندر بن راشد الرشيدي", department: "OTHER", position: "مسؤول المستودع", mobile: "0555102044" },
  { key: "sec", name: "مبارك بن دخيل العنزي", department: "SECURITY", position: "مشرف أمن", mobile: "0555102045" },
] as const;

export type EmployeeKey = (typeof EMPLOYEES)[number]["key"];

/**
 * Demo logins, each attached to a real employee record so the employee/user
 * separation is visible: eleven of the sixteen staff have no account at all.
 */
export const DEMO_USERS: ReadonlyArray<{
  employeeKey: EmployeeKey | null;
  name: string;
  email: string;
  roleKey: string;
}> = [
  // The bootstrap admin is created by the system seed; the demo only adds the hotel's
  // own staff on top of it.
  { employeeKey: "gm", name: "ماجد بن سعد العتيبي", email: "manager@arwiqah-demo.sa", roleKey: "hotel_manager" },
  { employeeKey: "fo_super", name: "نورة بنت خالد الشهري", email: "reception@arwiqah-demo.sa", roleKey: "reception" },
  { employeeKey: "acc", name: "خالد بن إبراهيم السبيعي", email: "accountant@arwiqah-demo.sa", roleKey: "accountant" },
  { employeeKey: "hk_super", name: "منال بنت سعيد الغامدي", email: "housekeeping@arwiqah-demo.sa", roleKey: "housekeeping_supervisor" },
  { employeeKey: "hk_1", name: "فاطمة بنت علي الفيفي", email: "hk.staff@arwiqah-demo.sa", roleKey: "housekeeping" },
];
