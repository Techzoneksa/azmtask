import "dotenv/config";

import mariadb from "mariadb";

/**
 * Connection diagnostic.
 *
 * `/api/health` deliberately says only "reachable" or "not" — it is public, and a
 * public endpoint that explains *why* a database refused it is telling strangers
 * about your infrastructure. This runs on the server console instead, where the
 * detail is safe and the person reading it is the person who can fix it.
 *
 * Talks to the driver directly rather than through Prisma's pool: a pool reports
 * "timed out waiting for a connection" no matter why the connection failed, which
 * is precisely the information this tool exists to recover. A single connection
 * fails fast and carries the server's real error code.
 *
 * Run it on the host:  npm run db:check
 */

const line = (label: string, value: string) =>
  console.log(`  ${label.padEnd(22)} ${value}`);

function fail(title: string, causes: string[]): never {
  console.log(`\n❌ ${title}\n`);
  console.log("الأسباب المحتملة:");
  for (const cause of causes) console.log(`  • ${cause}`);
  console.log("");
  process.exit(1);
}

const raw = process.env.DATABASE_URL;

console.log("\nفحص الاتصال بقاعدة البيانات\n" + "─".repeat(50));

if (!raw) {
  fail("DATABASE_URL غير مضبوط إطلاقًا", [
    "أضفه في hPanel → Node.js → Environment Variables",
    "الصيغة: mysql://المستخدم:كلمة_المرور@المضيف:3306/اسم_القاعدة",
    "ثم أعد تشغيل التطبيق ليقرأ المتغير الجديد",
  ]);
}

/*
 * A panel's environment-variable field stores exactly what was pasted, including a
 * trailing space or a stray quote that a .env file would have stripped. Either ends
 * up inside the password and the server answers 1045 — indistinguishable from a
 * genuinely wrong password, and invisible when you read the value back.
 */
if (raw !== raw.trim()) {
  fail("الرابط يحتوي مسافة أو سطرًا جديدًا في أوله أو آخره", [
    "المسافة تدخل ضمن كلمة المرور فيرفضها الخادم بالخطأ 1045",
    "احذف القيمة من لوحة التحكم وأعد لصقها بلا مسافات",
  ]);
}

if (/^["']|["']$/.test(raw)) {
  fail("الرابط محاط بعلامات اقتباس", [
    "في ملف .env تُحذف تلقائيًا، أما في حقل لوحة التحكم فتصبح جزءًا من القيمة",
    "أدخل الرابط بلا علامات اقتباس إطلاقًا",
  ]);
}

if (!raw.startsWith("mysql://")) {
  fail("الرابط لا يبدأ بـ mysql://", [
    `الرابط الحالي يبدأ بـ: ${raw.slice(0, 12)}…`,
    "النظام يعمل على MySQL/MariaDB. رابط postgres:// أو منفذ 6543 لن يعمل.",
  ]);
}

let url: URL;
try {
  url = new URL(raw);
} catch {
  fail("تعذّر تحليل الرابط — صيغته غير صالحة", [
    "الأرجح أن كلمة المرور تحتوي رمزًا يقطع الرابط",
    "رمّز الرموز: @ → %40   # → %23   / → %2F   : → %3A   ? → %3F",
  ]);
}

const password = decodeURIComponent(url.password);
const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
const user = decodeURIComponent(url.username);

console.log("\nما يقرأه التطبيق من الرابط:");
line("المضيف", url.hostname || "(فارغ)");
line("المنفذ", url.port || "3306 (افتراضي)");
line("المستخدم", user || "(فارغ)");
line("القاعدة", database || "(فارغ)");
line("كلمة المرور", password ? `${password.length} حرفًا` : "(فارغة)");

/*
 * The commonest failure is not a wrong password but a correct one that was pasted
 * unencoded, so the URL parser silently truncated it. Say so before connecting.
 */
if (password !== password.trim()) {
  console.log("\n⚠️  كلمة المرور تبدأ أو تنتهي بمسافة — الأرجح أنها التصقت عند النسخ.");
}

const risky = [...`@#/?:[]&`].filter((ch) => password.includes(ch));
if (risky.length > 0) {
  console.log(
    `\n⚠️  كلمة المرور تحتوي رموزًا يجب ترميزها في الرابط: ${risky.join(" ")}`,
  );
  console.log("    @ → %40   # → %23   / → %2F   ? → %3F   : → %3A");
}

/*
 * On shared hosting every database and every user of an account carry the same
 * numeric prefix. When the two differ it is almost always a mistyped digit, and the
 * server reports it as 1044 — a message that reads like a permissions problem and
 * sends people to reset a password that was never wrong. Catch it before connecting.
 */
const prefixOf = (value: string) => /^u(\d+)_/.exec(value)?.[1] ?? null;
const userPrefix = prefixOf(user);
const databasePrefix = prefixOf(database);

if (userPrefix && databasePrefix && userPrefix !== databasePrefix) {
  fail("بادئة الحساب في اسم المستخدم لا تطابق بادئة القاعدة", [
    `بادئة المستخدم: ${userPrefix} (${userPrefix.length} رقمًا)`,
    `بادئة القاعدة : ${databasePrefix} (${databasePrefix.length} رقمًا)`,
    "على هوستنجر البادئة واحدة لكل مستخدمي وقواعد الحساب — الأرجح خطأ في رقم",
    "انسخ الاسمين حرفيًا من hPanel → Databases بدل كتابتهما يدويًا",
  ]);
}

/*
 * MySQL accounts are user *and* host: 'u123_app'@'127.0.0.1' is a different account
 * from 'u123_app'@'localhost'. Since Node 17, DNS results are returned in the order
 * the resolver gives them, so on an IPv6-capable host "localhost" often resolves to
 * ::1 first — and a grant written for 127.0.0.1 does not match it. The server then
 * answers ACCESS DENIED for a password that is perfectly correct, which sends you
 * to reset a credential that was never the problem.
 *
 * Run `SELECT CURRENT_USER()` in the database console to see which host the account
 * is actually bound to.
 */
if (url.hostname === "localhost") {
  console.log(
    "\n⚠️  المضيف مكتوب localhost. إن كان حساب MySQL مقيّدًا بـ 127.0.0.1 فسيُرفض" +
      "\n    الاتصال رغم صحة كلمة المرور، لأن Node قد يحلّ localhost إلى ::1." +
      "\n    جرّب 127.0.0.1 بدلًا منه.",
  );
}

if (!database) {
  fail("اسم القاعدة مفقود من الرابط", [
    "الرابط يجب أن ينتهي بـ /اسم_القاعدة",
    "على هوستنجر يبدأ الاسم ببادئة الحساب، مثل u123456789_hotel",
  ]);
}

console.log("\n" + "─".repeat(50));
console.log("محاولة الاتصال…\n");

async function attempt() {
  const started = Date.now();

  try {
    const connection = await mariadb.createConnection({
      host: url.hostname,
      port: url.port ? Number(url.port) : 3306,
      user,
      password,
      database,
      // A single connection, so it fails fast and surfaces the server's own error
      // instead of a pool waiting out a retry loop.
      connectTimeout: 8000,
    });

    const [{ version }] = await connection.query("SELECT VERSION() AS version");
    console.log(`✅ الاتصال نجح في ${Date.now() - started}ms`);
    line("إصدار الخادم", String(version));

    const [{ total }] = await connection.query(
      "SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema = DATABASE()",
    );
    const count = Number(total);
    line("عدد الجداول", String(count));

    await connection.end();

    if (count === 0) {
      console.log("\n⚠️  القاعدة فارغة — الاتصال سليم لكن الهجرات لم تُطبَّق بعد.");
      console.log("    شغّل:  npm run db:deploy && npm run db:seed\n");
    } else if (count < 23) {
      console.log(`\n⚠️  عدد الجداول ${count} أقل من المتوقع (23).`);
      console.log("    شغّل:  npm run db:deploy\n");
    } else {
      console.log("\n✅ كل شيء سليم — الاتصال والبنية جاهزان.\n");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = (error as { code?: string })?.code ?? "";
    const combined = `${code} ${message}`;

    console.log(`❌ فشل الاتصال بعد ${Date.now() - started}ms\n`);
    line("رمز الخطأ", code || "(بلا رمز)");
    console.log(`\n  ${message}\n`);

    /*
     * MySQL separates two rejections that look alike and are fixed differently:
     * 1045 means the user could not sign in at all (password), while 1044 means the
     * sign-in worked but that user has no rights on that database — which on shared
     * hosting almost always means the user was never assigned to it in the panel.
     */
    if (/ER_DBACCESS_DENIED|no: 1044/i.test(combined)) {
      fail("الدخول صحيح لكن المستخدم لا يملك صلاحية على هذه القاعدة", [
        `القاعدة المطلوبة: ${database}`,
        "في hPanel → Databases: أسنِد هذا المستخدم للقاعدة وامنحه ALL PRIVILEGES",
        "أو أن اسم القاعدة خاطئ — تأكد من بادئة الحساب (u123456789_)",
      ]);
    }

    if (/ER_ACCESS_DENIED|no: 1045/i.test(combined)) {
      fail("الخادم رفض بيانات الدخول", [
        "كلمة المرور خاطئة — أو صحيحة لكنها غير مرمّزة في الرابط",
        "اسم المستخدم بلا بادئة الحساب (u123456789_)",
        "أعد تعيين كلمة المرور من hPanel وتجنّب الرموز @ # / ? :",
      ]);
    }

    if (/BAD_DB|Unknown database/i.test(combined)) {
      fail("القاعدة غير موجودة بهذا الاسم", [
        `الاسم المُرسَل: ${database}`,
        "تحقق من الاسم في hPanel → Databases — ويبدأ ببادئة الحساب",
      ]);
    }

    if (/ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EHOSTUNREACH|getaddrinfo/i.test(combined)) {
      fail("تعذّر الوصول إلى خادم القاعدة", [
        `المضيف المُرسَل: ${url.hostname}:${url.port || 3306}`,
        "هوستنجر أحيانًا يعطي مضيفًا مثل srv###.hstgr.io بدل localhost",
        "تحقق من المضيف الصحيح في hPanel → Databases → MySQL",
      ]);
    }

    fail("فشل غير متوقع", [
      "أرسل رمز الخطأ والرسالة أعلاه للمراجعة",
    ]);
  }
}

attempt();
