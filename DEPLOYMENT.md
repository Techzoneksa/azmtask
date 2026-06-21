# تعليمات النشر على Hostinger

## المتطلبات الأساسية

قبل البناء، يجب إعداد متغيرات البيئة.

---

## الخطوة 1: إضافة متغيرات البيئة في Hostinger

### إذا كان Hostinger يدعم Build من GitHub:

1. اذهب إلى **Settings** في مشروعك على Hostinger
2. ابحث عن **Environment Variables** أو **Build Settings**
3. أضف المتغيرات التالية:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

4. احفظ وأعد البناء (Redeploy)

### إذا كنت ترفع الملفات يدويًا:

1. أنشئ ملف `.env` في مجلد المشروع المحلي:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

2. ثم شغّل:
```bash
npm install
npm run build
```

3. ارفع مجلد `dist/` إلى `public_html`

---

## الخطوة 2: الحصول على مفاتيح Supabase

1. اذهب إلى [supabase.com](https://supabase.com)
2. افتح مشروعك
3. اذهب إلى **Settings > API**
4. انسخ:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon/public** key → `VITE_SUPABASE_ANON_KEY`

---

## الخطوة 3: تشغيل Supabase Schema

1. في Supabase Dashboard، اذهب إلى **SQL Editor**
2. انسخ محتوى ملف `supabase-schema.sql`
3. اضغط **Run**

هذا سينشئ جميع الجداول والـ Seed Data.

---

## الخطوة 4: التحقق من الملفات

تأكد من أن هذه الملفات موجودة في `dist/` بعد البناء:

```
dist/
├── index.html
├── manifest.webmanifest
├── sw.js
├── assets/
│   ├── index-xxxxx.css
│   └── index-xxxxx.js
├── pwa-192x192.svg    (أو .png)
├── pwa-512x512.svg    (أو .png)
├── favicon.svg
└── apple-touch-icon.svg
```

---

## الخطوة 5: حل المشاكل الشائعة

### خطأ "supabaseUrl is required"

**السبب:** متغيرات البيئة غير موجودة وقت البناء.

**الحل:**
1. تأكد من وجود `.env` مع القيم الصحيحة
2. أعد البناء: `npm run build`
3. ارفع `dist/` من جديد

### خطأ 404 للأيقونات

**السبب:** Build قديم أو ملفات ناقصة.

**الحل:**
1. احذف `dist/` القديمة
2. أعد البناء
3. تأكد من رفع جميع الملفات

### شاشة بيضاء

**السبب:** Supabase غير مهيأ.

**الحل:**
1. تحقق من `.env` يحتوي على القيم الصحيحة
2. تأكد من تشغيل Supabase Schema
3. أعد البناء ونشر

---

## هيكل الملفات النهائي

```
public_html/
├── index.html
├── manifest.webmanifest
├── sw.js
├── workbox-xxxxx.js
├── registerSW.js
├── favicon.svg
├── pwa-192x192.svg
├── pwa-512x512.svg
├── apple-touch-icon.svg
└── assets/
    ├── index-xxxxx.css
    └── index-xxxxx.js
```

---

## بيانات الدخول للاختبار

```
المدير العام:
- البريد: sultan@azm.sa
- كلمة المرور: Azm2026Director!

مدير العمليات:
- البريد: abdulrahman@azm.sa  
- كلمة المرور: Azm2026Operations!
```

**ملاحظة:** غيّر كلمات المرور بعد أول تسجيل دخول.

---

## البريد والواتساب

**مؤجلان** - لا يتم العمل عليهما حالياً.

---

## الدعم

إذا استمرت المشاكل:
1. افتح Console في المتصفح (F12)
2. ابحث عن أي أخطاء
3. تأكد من Supabase Schema تم تشغيله بنجاح