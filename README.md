# عزم - برنامج الإنجاز والتشغيل

برنامج متابعة مهام وتشغيل داخلي لشركة عزم اللوجستية.

## المميزات

- لوحة تحكم شاملة مع مؤشر جاهزية الانطلاق
- خارطة مراحل التأسيس والتشغيل (11 مرحلة)
- لوحة Kanban للمهام مع سحب وإفلات
- نظام الحضور والانصراف
- تتبع المعوقات
- التقارير اليومية والأسبوعية
- نظام تنبيهات داخلي
- المساعد التشغيلي
- PWA Support كامل
- تصميم Mobile-first, RTL Arabic

## المستخدمون

- **الأستاذ سلطان**: المدير العام
- **عبدالرحمن**: مدير العمليات

## إعداد Supabase

### 1. إنشاء مشروع Supabase

1. اذهب إلى [supabase.com](https://supabase.com) وأنشئ مشروع جديد
2. انتظر حتى يتم إنشاء قاعدة البيانات

### 2. تشغيل Schema

1. في Supabase Dashboard، اذهب إلى **SQL Editor**
2. انسخ محتوى ملف `supabase-schema.sql` والصقه
3. اضغط **Run** لتنفيذ الـ schema

هذا سيقوم بإنشاء:
- جدول للمستخدمين (profiles)
- جدول المراحل (setup_phases)
- جدول المهام (tasks)
- جدول الحضور (attendance)
- جدول المعوقات (blockers)
- جدول المستندات (documents)
- جدول الملاحظات (notes)
- جدول التنبيهات (notifications)
- والـ Seed Data

### 3. الحصول على مفاتيح API

1. اذهب إلى **Settings > API**
2. انسخ **Project URL** وضعه في `VITE_SUPABASE_URL`
3. انسخ **anon public** key وضعه في `VITE_SUPABASE_ANON_KEY`

### 4. إعداد البيئة المحلية

```bash
# انسخ ملف البيئة
cp .env.example .env

# عدّل الملف وضع مفاتيحك
# VITE_SUPABASE_URL=your_url
# VITE_SUPABASE_ANON_KEY=your_key

# ثبّت المكتبات
npm install

# Build
npm run build
```

## النشر على Hostinger

### 1. إعداد متغيرات البيئة على Hostinger

في Hostinger، اضبط متغيرات البيئة:
- `VITE_SUPABASE_URL` = رابط مشروعك
- `VITE_SUPABASE_ANON_KEY` = المفتاح العمومي

### 2. رفع الملفات

1. ارفع محتويات مجلد `dist/` إلى `public_html`
2. تأكد من تفعيل SSL

## تسجيل الدخول

```
المدير العام:
- البريد: sultan@azm.sa
- كلمة المرور: Azm2026Director!

مدير العمليات:
- البريد: abdulrahman@azm.sa  
- كلمة المرور: Azm2026Operations!
```

**ملاحظة:** يجب تغيير كلمات المرور بعد أول تسجيل دخول.

## التقنيات

- React 18
- Vite
- Tailwind CSS
- React Router 6
- Supabase (PostgreSQL)
- PWA Support

## هيكل قاعدة البيانات

```
profiles          - المستخدمون والصلاحيات
setup_phases      - مراحل التأسيس
tasks             - المهام
attendance        - الحضور والانصراف
blockers          - المعوقات
documents         - المستندات
notes             - الملاحظات
notifications     - التنبيهات
settings          - الإعدادات
```

## ملاحظات

- البريد الإلكتروني والواتساب **مؤجلان**
- البيانات محفوظة في Supabase (ليست localStorage)
- النظام يدعم الوقت الحقيقي (Real-time)