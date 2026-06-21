# تعليمات النشر على Hostinger

## ⚠️ مهم: متغيرات البيئة في Vite

Vite يحقن `VITE_` المتغيرات وقت **البناء** (build time)، وليس وقت التشغيل.

هذا يعني:
- أي `dist/` تم بناؤه بدون `.env` سيظل يحمل قيم فارغة
- إضافة ENV في Hostinger بعد البناء لن تنفع - يجب إعادة البناء

---

## الطريقة الصحيحة للنشر على Hostinger

### الخيار 1: Hostinger يبني من GitHub

1. **قبل كل شي، أضف Environment Variables في Hostinger:**
   - اذهب إلى **Project Settings > Environment**
   - أضف:
     ```
     VITE_SUPABASE_URL=https://your-project.supabase.co
     VITE_SUPABASE_ANON_KEY=your-anon-key
     ```
   - احفظ

2. **اتصل GitHub بـ Hostinger:**
   - اذهب إلى **GitHub Actions / Deploy Settings**
   - تأكد أن Hostinger يسحب من `main` branch

3. **الآن كل ما تدفع GitHub، Hostinger يبني من جديد مع ENV**

4. **لا ترفع `dist/` يدويًا** - اترك Hostinger يبني

### الخيار 2: الرفع يدوي

1. **على جهازك، أنشئ ملف `.env`:**
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

2. **Build:**
```bash
npm install
npm run build
```

3. **ارفع `dist/` إلى `public_html`**

---

## الخطوات الكاملة لإعداد Supabase

### 1. أنشئ مشروع Supabase
اذهب إلى [supabase.com](https://supabase.com) وأنشئ مشروع.

### 2. تشغيل Schema
1. افتح **SQL Editor** في Supabase Dashboard
2. انسخ كل محتوى `supabase-schema.sql`
3. اضغط **Run**

### 3. الحصول على المفاتيح
من **Settings > API**:
- **Project URL** → `VITE_SUPABASE_URL`
- **anon public** key → `VITE_SUPABASE_ANON_KEY`

---

## ملفات المشروع

```
public/
├── .htaccess              ← SPA routing
├── manifest.json          ← PWA manifest (SVG icons)
├── favicon.svg            ← Favicon
├── pwa-192x192.svg        ← PWA icon 192x192
├── pwa-512x512.svg        ← PWA icon 512x512
└── apple-touch-icon.svg   ← iOS icon

supabase-schema.sql        ← Database schema + seed data
.env.example               ← Environment variables template
DEPLOYMENT.md              ← This file
```

---

## التحقق بعد النشر

افتح Console في المتصفح (F12) وتحقق:
- لا خطأ "supabaseUrl is required"
- لا 404 لأيقونات PWA
- Login يعمل
- البيانات تأتي من Supabase

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

**غير كلمات المرور بعد أول دخول.**

---

## المشاكل الشائعة

### خطأ "supabaseUrl is required"
**السبب:** `dist/` تم بناؤه بدون `.env`
**الحل:** أعد البناء مع `.env` موجود

### خطأ 404 لأيقونات PWA
**السبب:** Build قديم
**الحل:** احذف `dist/` وأعد البناء

### شاشة بيضاء
**السبب:** Supabase غير مهيأ
**الحل:** تأكد من ENV وأعد البناء والنشر

---

## البريد والواتساب
**مؤجلان** - لا يتم العمل عليهما حالياً

---

## الدعم
إذا استمرت المشاكل، افتح Console وأرسل لي الأخطاء.