-- =============================================
-- عزم - Supabase Database Schema
-- Run this in Supabase SQL Editor
-- =============================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- =============================================
-- PROFILES TABLE
-- =============================================
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  name text not null,
  email text not null unique,
  password text not null,
  role text not null check (role in ('director', 'operations')) default 'operations',
  position text not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- =============================================
-- SETUP PHASES TABLE (المراحل)
-- =============================================
create table if not exists public.setup_phases (
  id text primary key,
  name text not null,
  icon text not null,
  "order" integer not null unique,
  color text not null,
  created_at timestamp with time zone default now()
);

-- =============================================
-- TASKS TABLE (المهام)
-- =============================================
create table if not exists public.tasks (
  id text primary key,
  title text not null,
  description text,
  stage_id text references setup_phases(id) on delete set null,
  status text not null default 'new' check (status in ('new', 'in-progress', 'pending-review', 'completed', 'blocked', 'delayed')),
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  assigned_to uuid references profiles(id) on delete set null,
  due_date timestamp with time zone not null,
  progress integer not null default 0 check (progress >= 0 and progress <= 100),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- =============================================
-- TASK CHECKLIST ITEMS
-- =============================================
create table if not exists public.task_checklist_items (
  id text primary key,
  task_id text references tasks(id) on delete cascade not null,
  content text not null,
  completed boolean not null default false,
  created_at timestamp with time zone default now()
);

-- =============================================
-- TASK UPDATES LOG (سجل التحديثات)
-- =============================================
create table if not exists public.task_updates (
  id text primary key,
  task_id text references tasks(id) on delete cascade not null,
  action text not null,
  details jsonb,
  user_id uuid references profiles(id) on delete set null,
  created_at timestamp with time zone default now()
);

-- =============================================
-- ATTENDANCE TABLE (الحضور والانصراف)
-- =============================================
create table if not exists public.attendance (
  id text primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  user_name text not null,
  date timestamp with time zone not null,
  check_in timestamp with time zone,
  check_out timestamp with time zone,
  note text,
  total_hours numeric(4,1) default 0,
  created_at timestamp with time zone default now()
);

-- =============================================
-- NOTES TABLE (الملاحظات)
-- =============================================
create table if not exists public.notes (
  id text primary key,
  title text,
  content text not null,
  task_id text references tasks(id) on delete set null,
  created_by uuid references profiles(id) on delete set null,
  created_by_name text not null,
  read boolean not null default false,
  status text not null default 'active',
  created_at timestamp with time zone default now()
);

-- =============================================
-- NOTIFICATIONS TABLE (التنبيهات)
-- =============================================
create table if not exists public.notifications (
  id text primary key,
  title text not null,
  message text not null,
  user_id uuid references profiles(id) on delete cascade not null,
  task_id text references tasks(id) on delete set null,
  read boolean not null default false,
  created_at timestamp with time zone default now()
);

-- =============================================
-- BLOCKERS TABLE (المعوقات)
-- =============================================
create table if not exists public.blockers (
  id text primary key,
  title text not null,
  description text,
  stage_id text references setup_phases(id) on delete set null,
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamp with time zone default now(),
  resolved_at timestamp with time zone
);

-- =============================================
-- DOCUMENTS TABLE (المستندات)
-- =============================================
create table if not exists public.documents (
  id text primary key,
  name text not null,
  status text not null default 'pending' check (status in ('pending', 'in-progress', 'completed')),
  icon text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- =============================================
-- SETTINGS TABLE (الإعدادات)
-- =============================================
create table if not exists public.settings (
  id text primary key,
  key text not null unique,
  value jsonb not null,
  updated_at timestamp with time zone default now()
);

-- =============================================
-- Row Level Security (RLS)
-- =============================================

-- Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.setup_phases enable row level security;
alter table public.tasks enable row level security;
alter table public.task_checklist_items enable row level security;
alter table public.task_updates enable row level security;
alter table public.attendance enable row level security;
alter table public.notes enable row level security;
alter table public.notifications enable row level security;
alter table public.blockers enable row level security;
alter table public.documents enable row level security;
alter table public.settings enable row level security;

-- Profiles: Users can read all, update own
create policy "Profiles are viewable by everyone" on public.profiles for select using (true);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);

-- Setup Phases: Readable by all authenticated users
create policy "Setup phases are viewable by authenticated users" on public.setup_phases for select using (auth.role() = 'authenticated');
create policy "Only directors can modify setup phases" on public.setup_phases for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'director')
);

-- Tasks: All authenticated users can read, director can modify all, operations can modify assigned tasks
create policy "Tasks are viewable by authenticated users" on public.tasks for select using (auth.role() = 'authenticated');
create policy "Operations can update assigned tasks" on public.tasks for update using (
  assigned_to = auth.uid() OR 
  exists (select 1 from public.profiles where id = auth.uid() and role = 'director')
);
create policy "Operations can insert tasks" on public.tasks for insert with check (auth.role() = 'authenticated');

-- Attendance: Users can read all, insert/update own records, director can read all
create policy "Attendance viewable by authenticated users" on public.attendance for select using (auth.role() = 'authenticated');
create policy "Users can manage own attendance" on public.attendance for all using (user_id = auth.uid());

-- Notes: Users can read all, insert own, update own
create policy "Notes viewable by authenticated users" on public.notes for select using (auth.role() = 'authenticated');
create policy "Users can manage own notes" on public.notes for all using (created_by = auth.uid());

-- Notifications: Users can read/update own
create policy "Users can manage own notifications" on public.notifications for all using (user_id = auth.uid());

-- Blockers: All authenticated can read, director can modify
create policy "Blockers viewable by authenticated users" on public.blockers for select using (auth.role() = 'authenticated');
create policy "Directors can manage blockers" on public.blockers for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'director')
);

-- Documents: All authenticated can read, director can modify
create policy "Documents viewable by authenticated users" on public.documents for select using (auth.role() = 'authenticated');
create policy "Directors can manage documents" on public.documents for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'director')
);

-- Settings: Director only
create policy "Settings readable by authenticated users" on public.settings for select using (auth.role() = 'authenticated');
create policy "Directors can manage settings" on public.settings for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'director')
);

-- =============================================
-- SEED DATA
-- =============================================

-- Insert profiles (users)
insert into public.profiles (id, name, email, password, role, position) values
  ('11111111-1111-1111-1111-111111111111', 'الأستاذ سلطان', 'sultan@azm.sa', 'Azm2026Director!', 'director', 'المدير العام'),
  ('22222222-2222-2222-2222-222222222222', 'عبدالرحمن', 'abdulrahman@azm.sa', 'Azm2026Operations!', 'operations', 'مدير العمليات')
on conflict (email) do nothing;

-- Insert setup phases (11 stages)
insert into public.setup_phases (id, name, icon, "order", color) values
  ('stage-1', 'المستندات والسجلات', 'FileText', 1, '#3b82f6'),
  ('stage-2', 'التراخيص والهيئات', 'Stamp', 2, '#8b5cf6'),
  ('stage-3', 'المقر والتجهيزات', 'Building', 3, '#10b981'),
  ('stage-4', 'المركبات والتشغيل', 'Truck', 4, '#f59e0b'),
  ('stage-5', 'التوظيف والفريق', 'Users', 5, '#ec4899'),
  ('stage-6', 'الأنظمة والأدوات', 'Monitor', 6, '#06b6d4'),
  ('stage-7', 'السياسات والإجراءات', 'ClipboardList', 7, '#84cc16'),
  ('stage-8', 'العقود والشراكات', 'FileSignature', 8, '#f97316'),
  ('stage-9', 'التسويق والهوية', 'Palette', 9, '#a855f7'),
  ('stage-10', 'التشغيل التجريبي', 'PlayCircle', 10, '#14b8a6'),
  ('stage-11', 'الانطلاق الرسمي', 'Rocket', 11, '#1a5f3c')
on conflict (id) do nothing;

-- Insert tasks (seed data)
insert into public.tasks (id, title, description, stage_id, status, priority, assigned_to, due_date, progress) values
  -- Stage 1: المستندات والسجلات
  ('t-1-1', 'مراجعة السجل التجاري', 'مراجعة بيانات السجل التجاري والتأكد من صحتها', 'stage-1', 'new', 'high', '22222222-2222-2222-2222-222222222222', now() + interval '1 day', 0),
  ('t-1-2', 'التأكد من نشاط الخدمات اللوجستية', 'التأكد من نشاط الشركة مسجل بشكل صحيح', 'stage-1', 'in-progress', 'high', '22222222-2222-2222-2222-222222222222', now() + interval '2 days', 50),
  ('t-1-3', 'تجهيز العنوان الوطني', 'الحصول على العنوان الوطني وتجهيزه للنظام', 'stage-1', 'new', 'medium', '22222222-2222-2222-2222-222222222222', now() + interval '3 days', 0),
  ('t-1-4', 'تجهيز الرقم الضريبي', 'التأكد من وجود الرقم الضريبي أو تقديم طلب الحصول عليه', 'stage-1', 'new', 'medium', '22222222-2222-2222-2222-222222222222', now() + interval '5 days', 0),
  ('t-1-5', 'تجهيز بيانات المالك أو المفوض', 'جمع وتجهيز بيانات المالك أو المفوض للشركة', 'stage-1', 'pending-review', 'high', '22222222-2222-2222-2222-222222222222', now() + interval '2 days', 100),
  ('t-1-6', 'تجهيز البريد الرسمي', 'إنشاء وتجهيز البريد الإلكتروني الرسمي للشركة', 'stage-1', 'new', 'medium', '22222222-2222-2222-2222-222222222222', now() + interval '7 days', 0),
  ('t-1-7', 'تجهيز رقم الجوال الرسمي', 'توفير رقم جوال رسمي للتواصل', 'stage-1', 'completed', 'medium', '22222222-2222-2222-2222-222222222222', now(), 100),
  ('t-1-8', 'تجهيز شعار الشركة', 'تصميم شعار الشركة وتجهيز معلومات التواصل', 'stage-1', 'in-progress', 'high', '11111111-1111-1111-1111-111111111111', now() + interval '4 days', 60),
  ('t-1-9', 'تجهيز ملف تعريفي للشركة', 'إنشاء ملف تعريفي PDF يحتوي على معلومات الشركة', 'stage-1', 'new', 'low', '22222222-2222-2222-2222-222222222222', now() + interval '10 days', 0),
  ('t-1-10', 'تجهيز ختم الشركة', 'تصميم وختم الشركة الرسمي', 'stage-1', 'blocked', 'medium', '22222222-2222-2222-2222-222222222222', now() + interval '5 days', 0),
  
  -- Stage 2: التراخيص والهيئات
  ('t-2-1', 'الدخول إلى منصة هيئة النقل', 'التسجيل والدخول إلى منصة هيئة النقل العامة', 'stage-2', 'in-progress', 'high', '22222222-2222-2222-2222-222222222222', now() + interval '2 days', 40),
  ('t-2-2', 'تحديد نوع الترخيص', 'تحديد نوع الترخيص المطلوب لشركة النقل', 'stage-2', 'new', 'high', '22222222-2222-2222-2222-222222222222', now() + interval '3 days', 0),
  ('t-2-3', 'تجهيز متطلبات هيئة النقل', 'جمع وتجهيز جميع المتطلبات المطلوبة من هيئة النقل', 'stage-2', 'new', 'high', '22222222-2222-2222-2222-222222222222', now() + interval '5 days', 0),
  ('t-2-4', 'رفع طلب الترخيص', 'تقديم طلب الترخيص عبر المنصة', 'stage-2', 'new', 'high', '22222222-2222-2222-2222-222222222222', now() + interval '7 days', 0),
  ('t-2-5', 'متابعة حالة الطلب', 'متابعة حالة الطلب المقدم لهيئة النقل', 'stage-2', 'new', 'medium', '22222222-2222-2222-2222-222222222222', now() + interval '14 days', 0),
  ('t-2-6', 'تسجيل النواقص', 'تسجيل أي نقص في المتطلبات ومعالجته', 'stage-2', 'new', 'medium', '22222222-2222-2222-2222-222222222222', now() + interval '10 days', 0),
  ('t-2-7', 'سداد الرسوم', 'سداد رسوم الترخيص المطلوبة', 'stage-2', 'new', 'high', '11111111-1111-1111-1111-111111111111', now() + interval '12 days', 0),
  ('t-2-8', 'حفظ رقم الطلب', 'حفظ رقم الطلب المرجعي للمتابعة', 'stage-2', 'new', 'low', '22222222-2222-2222-2222-222222222222', now() + interval '8 days', 0),
  ('t-2-9', 'متابعة الموافقة', 'متابعة موافقة هيئة النقل على الطلب', 'stage-2', 'new', 'high', '11111111-1111-1111-1111-111111111111', now() + interval '21 days', 0),
  
  -- Stage 3: المقر والتجهيزات
  ('t-3-1', 'تحديد احتياج الشركة للمقر', 'تحديد المساحة والموقع المطلوبين للمقر', 'stage-3', 'completed', 'high', '11111111-1111-1111-1111-111111111111', now(), 100),
  ('t-3-2', 'البحث عن مقر مناسب', 'البحث عن مكاتب مناسبة في الموقع المطلوب', 'stage-3', 'in-progress', 'high', '22222222-2222-2222-2222-222222222222', now() + interval '5 days', 70),
  ('t-3-3', 'مقارنة أسعار المكاتب', 'مقارنة أسعار الإيجار للمكاتب المتاحة', 'stage-3', 'new', 'medium', '22222222-2222-2222-2222-222222222222', now() + interval '7 days', 0),
  ('t-3-4', 'التفاوض على الإيجار', 'التفاوض للحصول على أفضل سعر', 'stage-3', 'new', 'medium', '11111111-1111-1111-1111-111111111111', now() + interval '10 days', 0),
  ('t-3-5', 'تجهيز عقد الإيجار', 'مراجعة وتجهيز عقد إيجار المكتب', 'stage-3', 'new', 'high', '11111111-1111-1111-1111-111111111111', now() + interval '12 days', 0),
  ('t-3-6', 'اعتماد المقر', 'اعتماد الموقع والمكتب النهائي', 'stage-3', 'pending-review', 'high', '11111111-1111-1111-1111-111111111111', now() + interval '14 days', 100),
  ('t-3-7', 'تجهيز الإنترنت', 'توصيل خدمة الإنترنت للمقر', 'stage-3', 'new', 'high', '22222222-2222-2222-2222-222222222222', now() + interval '16 days', 0),
  ('t-3-8', 'تجهيز أجهزة الكمبيوتر', 'شراء وتجهيز الأجهزة المكتبية', 'stage-3', 'new', 'medium', '11111111-1111-1111-1111-111111111111', now() + interval '18 days', 0),
  ('t-3-9', 'تجهيز الأدوات المكتبية', 'توفير الأدوات واللوازم المكتبية', 'stage-3', 'new', 'low', '22222222-2222-2222-2222-222222222222', now() + interval '15 days', 0),
  
  -- Stage 4: المركبات والتشغيل
  ('t-4-1', 'تحديد عدد السيارات المطلوبة', 'تحديد عدد السيارات بناءً على خطة العمل', 'stage-4', 'in-progress', 'high', '11111111-1111-1111-1111-111111111111', now() + interval '3 days', 50),
  ('t-4-2', 'تحديد نوع السيارات المناسبة', 'تحديد المواصفات والموديلات المناسبة', 'stage-4', 'new', 'high', '22222222-2222-2222-2222-222222222222', now() + interval '5 days', 0),
  ('t-4-3', 'مقارنة الشراء أو التأجير', 'دراسة جدوى للشراء مقابل التأجير', 'stage-4', 'new', 'medium', '11111111-1111-1111-1111-111111111111', now() + interval '8 days', 0),
  ('t-4-4', 'الحصول على عروض أسعار', 'جمع عروض أسعار من عدة موردين', 'stage-4', 'new', 'medium', '22222222-2222-2222-2222-222222222222', now() + interval '10 days', 0),
  ('t-4-5', 'اعتماد ميزانية السيارات', 'اعتماد الميزانية النهائية لشراء السيارات', 'stage-4', 'pending-review', 'high', '11111111-1111-1111-1111-111111111111', now() + interval '12 days', 100),
  ('t-4-6', 'شراء أو استئجار السيارات', 'إتمام عملية الشراء أو التأجير', 'stage-4', 'new', 'high', '11111111-1111-1111-1111-111111111111', now() + interval '20 days', 0),
  ('t-4-7', 'التأكد من التأمين', 'تجهيز وثائق التأمين لجميع السيارات', 'stage-4', 'new', 'high', '22222222-2222-2222-2222-222222222222', now() + interval '22 days', 0),
  ('t-4-8', 'التأكد من الفحص الدوري', 'إتمام الفحص الدوري لجميع السيارات', 'stage-4', 'new', 'medium', '22222222-2222-2222-2222-222222222222', now() + interval '23 days', 0),
  ('t-4-9', 'تجهيز هوية السيارات', 'تجهيز لوحات وهوية كل سيارة', 'stage-4', 'new', 'medium', '22222222-2222-2222-2222-222222222222', now() + interval '21 days', 0),
  ('t-4-10', 'إعداد سجل لكل سيارة', 'إنشاء ملف خاص بكل سيارة', 'stage-4', 'new', 'low', '22222222-2222-2222-2222-222222222222', now() + interval '25 days', 0),
  ('t-4-11', 'تجهيز خطة صيانة أولية', 'إعداد جدول الصيانة الدورية', 'stage-4', 'new', 'medium', '22222222-2222-2222-2222-222222222222', now() + interval '24 days', 0),
  
  -- Stage 5: التوظيف والفريق
  ('t-5-1', 'تحديد الوظائف المطلوبة', 'تحديد عدد وأنواع الوظائف المطلوبة', 'stage-5', 'in-progress', 'high', '11111111-1111-1111-1111-111111111111', now() + interval '4 days', 60),
  ('t-5-2', 'كتابة الوصف الوظيفي', 'إعداد وصف واضح لكل وظيفة', 'stage-5', 'new', 'high', '11111111-1111-1111-1111-111111111111', now() + interval '6 days', 0),
  ('t-5-3', 'نشر طلبات التوظيف', 'نشر الإعلانات على مواقع التوظيف', 'stage-5', 'new', 'medium', '22222222-2222-2222-2222-222222222222', now() + interval '8 days', 0),
  ('t-5-4', 'استقبال المرشحين', 'استقبال وترتيب طلبات المرشحين', 'stage-5', 'new', 'medium', '22222222-2222-2222-2222-222222222222', now() + interval '15 days', 0),
  ('t-5-5', 'إجراء المقابلات', 'جدولة وإجراء المقابلات', 'stage-5', 'new', 'high', '11111111-1111-1111-1111-111111111111', now() + interval '20 days', 0),
  ('t-5-6', 'اختيار المرشحين', 'اختيار المرشحين النهائيين', 'stage-5', 'new', 'high', '11111111-1111-1111-1111-111111111111', now() + interval '22 days', 0),
  ('t-5-7', 'تجهيز العقود', 'إعداد عقود العمل', 'stage-5', 'new', 'high', '11111111-1111-1111-1111-111111111111', now() + interval '25 days', 0),
  ('t-5-8', 'تدريب الفريق على النظام', 'تدريب الموظفين على استخدام نظام عزم', 'stage-5', 'new', 'medium', '22222222-2222-2222-2222-222222222222', now() + interval '30 days', 0),
  ('t-5-9', 'تعريف الموظفين بالسياسات', 'شرح سياسات وإجراءات الشركة', 'stage-5', 'new', 'medium', '11111111-1111-1111-1111-111111111111', now() + interval '28 days', 0),
  
  -- Stage 6: الأنظمة والأدوات
  ('t-6-1', 'اعتماد نظام إدارة المهام', 'اختيار وتفعيل نظام إدارة المهام', 'stage-6', 'completed', 'high', '11111111-1111-1111-1111-111111111111', now(), 100),
  ('t-6-2', 'تجهيز بريد الشركة', 'إعداد حسابات البريد الإلكتروني', 'stage-6', 'in-progress', 'high', '22222222-2222-2222-2222-222222222222', now() + interval '3 days', 50),
  ('t-6-3', 'تجهيز أرقام التواصل', 'تجهيز أرقام الهاتف للتواصل الداخلي', 'stage-6', 'new', 'medium', '22222222-2222-2222-2222-222222222222', now() + interval '5 days', 0),
  ('t-6-4', 'تجهيز واتساب الأعمال', 'تجهيز حساب واتساب للأعمال - مؤجل', 'stage-6', 'new', 'low', '22222222-2222-2222-2222-222222222222', now() + interval '30 days', 0),
  ('t-6-5', 'تجهيز نماذج العمل اليومية', 'إنشاء نماذج للتقارير اليومية', 'stage-6', 'new', 'medium', '22222222-2222-2222-2222-222222222222', now() + interval '7 days', 0),
  ('t-6-6', 'تجهيز نموذج التقرير اليومي', 'إنشاء نموذج التقرير اليومي', 'stage-6', 'new', 'medium', '22222222-2222-2222-2222-222222222222', now() + interval '8 days', 0),
  ('t-6-7', 'تجهيز نموذج متابعة المركبات', 'إنشاء نموذج متابعة المركبات', 'stage-6', 'new', 'medium', '22222222-2222-2222-2222-222222222222', now() + interval '10 days', 0),
  ('t-6-8', 'تجهيز نموذج متابعة السائقين', 'إنشاء نموذج متابعة السائقين', 'stage-6', 'new', 'medium', '22222222-2222-2222-2222-222222222222', now() + interval '12 days', 0),
  ('t-6-9', 'تجهيز نسخة احتياطية للملفات', 'إعداد نظام النسخ الاحتياطي', 'stage-6', 'new', 'high', '22222222-2222-2222-2222-222222222222', now() + interval '15 days', 0),
  
  -- Stage 7: السياسات والإجراءات
  ('t-7-1', 'كتابة سياسة الحضور والانصراف', 'تحديد أوقات العمل وساعات الدوام', 'stage-7', 'in-progress', 'high', '11111111-1111-1111-1111-111111111111', now() + interval '5 days', 40),
  ('t-7-2', 'كتابة سياسة استخدام السيارات', 'تحديد قواعد استخدام سيارات الشركة', 'stage-7', 'new', 'high', '11111111-1111-1111-1111-111111111111', now() + interval '8 days', 0),
  ('t-7-3', 'كتابة سياسة تسليم واستلام المركبة', 'تحديد إجراءات تسليم واستلام السيارات', 'stage-7', 'new', 'high', '22222222-2222-2222-2222-222222222222', now() + interval '10 days', 0),
  ('t-7-4', 'كتابة سياسة متابعة المهام اليومية', 'تحديد آلية متابعة المهام والتقارير', 'stage-7', 'new', 'medium', '11111111-1111-1111-1111-111111111111', now() + interval '12 days', 0),
  ('t-7-5', 'كتابة سياسة التقارير اليومية', 'تحديد نموذج ومحتوى التقارير اليومية', 'stage-7', 'new', 'medium', '22222222-2222-2222-2222-222222222222', now() + interval '14 days', 0),
  ('t-7-6', 'كتابة آلية اعتماد المهام', 'تحديد خطوات اعتماد المهام', 'stage-7', 'new', 'high', '11111111-1111-1111-1111-111111111111', now() + interval '7 days', 0),
  ('t-7-7', 'كتابة آلية التصعيد عند التأخير', 'تحديد خطوات التصعيد عند تأخر المهام', 'stage-7', 'new', 'medium', '11111111-1111-1111-1111-111111111111', now() + interval '12 days', 0),
  ('t-7-8', 'كتابة إجراءات السلامة', 'تحديد إجراءات السلامة المطلوبة', 'stage-7', 'new', 'high', '11111111-1111-1111-1111-111111111111', now() + interval '15 days', 0),
  ('t-7-9', 'كتابة نموذج محضر اجتماع', 'إنشاء نموذج لمحاضر الاجتماعات', 'stage-7', 'new', 'low', '22222222-2222-2222-2222-222222222222', now() + interval '10 days', 0),
  ('t-7-10', 'كتابة نموذج تسليم عهدة', 'إنشاء نموذج لتسليم العهدة', 'stage-7', 'new', 'medium', '22222222-2222-2222-2222-222222222222', now() + interval '12 days', 0),
  ('t-7-11', 'كتابة نموذج طلب شراء', 'إنشاء نموذج لطلبات الشراء', 'stage-7', 'new', 'low', '22222222-2222-2222-2222-222222222222', now() + interval '14 days', 0),
  
  -- Stage 8: العقود والشراكات
  ('t-8-1', 'تجهيز عقد إيجار المقر', 'مراجعة واعتماد عقد إيجار المكتب', 'stage-8', 'pending-review', 'high', '11111111-1111-1111-1111-111111111111', now() + interval '5 days', 100),
  ('t-8-2', 'تجهيز عقود الموظفين', 'إعداد عقود العمل للموظفين', 'stage-8', 'new', 'high', '11111111-1111-1111-1111-111111111111', now() + interval '20 days', 0),
  ('t-8-3', 'تجهيز اتفاقية السائقين', 'إعداد اتفاقيات عمل للسائقين', 'stage-8', 'new', 'medium', '11111111-1111-1111-1111-111111111111', now() + interval '25 days', 0),
  ('t-8-4', 'تجهيز عقود الموردين', 'إعداد عقود مع الموردين', 'stage-8', 'new', 'medium', '22222222-2222-2222-2222-222222222222', now() + interval '20 days', 0),
  ('t-8-5', 'تجهيز عقود صيانة السيارات', 'إبرام عقود صيانة دورية', 'stage-8', 'new', 'medium', '22222222-2222-2222-2222-222222222222', now() + interval '22 days', 0),
  ('t-8-6', 'تجهيز اتفاقيات مع شركاء التوصيل', 'إعداد اتفاقيات مع الشركات الشريكة', 'stage-8', 'new', 'medium', '11111111-1111-1111-1111-111111111111', now() + interval '30 days', 0),
  ('t-8-7', 'تجهيز عرض تعريفي للشركة', 'إنشاء عرض تقديمي للشركة', 'stage-8', 'new', 'low', '22222222-2222-2222-2222-222222222222', now() + interval '15 days', 0),
  ('t-8-8', 'تجهيز نموذج اتفاقية خدمة', 'إنشاء نموذج لاتفاقيات الخدمة', 'stage-8', 'new', 'medium', '11111111-1111-1111-1111-111111111111', now() + interval '18 days', 0),
  ('t-8-9', 'مراجعة العقود من الأستاذ سلطان', 'المراجعة النهائية للعقود', 'stage-8', 'new', 'high', '11111111-1111-1111-1111-111111111111', now() + interval '28 days', 0),
  ('t-8-10', 'اعتماد العقود النهائية', 'اعتماد جميع العقود بشكل نهائي', 'stage-8', 'new', 'high', '11111111-1111-1111-1111-111111111111', now() + interval '30 days', 0),
  
  -- Stage 9: التسويق والهوية
  ('t-9-1', 'اعتماد الهوية البصرية', 'اعتماد التصميم النهائي للهوية', 'stage-9', 'in-progress', 'high', '11111111-1111-1111-1111-111111111111', now() + interval '5 days', 30),
  ('t-9-2', 'تجهيز شعار عزم النهائي', 'إنتاج الشعار بجميع المقاسات', 'stage-9', 'new', 'high', '11111111-1111-1111-1111-111111111111', now() + interval '7 days', 0),
  ('t-9-3', 'تجهيز بروفايل الشركة', 'إنشاء بروفايل احترافي للشركة', 'stage-9', 'new', 'medium', '22222222-2222-2222-2222-222222222222', now() + interval '10 days', 0),
  ('t-9-4', 'تجهيز صفحة تعريفية', 'إنشاء صفحة تعريفية للموقع', 'stage-9', 'new', 'low', '22222222-2222-2222-2222-222222222222', now() + interval '15 days', 0),
  ('t-9-5', 'تجهيز توقيع البريد الإلكتروني', 'تصميم توقيع احترافي للبريد', 'stage-9', 'new', 'low', '22222222-2222-2222-2222-222222222222', now() + interval '8 days', 0),
  ('t-9-6', 'تجهيز بطاقة عمل', 'تصميم وبطاقات العمل', 'stage-9', 'new', 'medium', '11111111-1111-1111-1111-111111111111', now() + interval '12 days', 0),
  ('t-9-7', 'تجهيز ملف تعريفي PDF', 'إنشاء كتيب تعريفي PDF', 'stage-9', 'new', 'medium', '22222222-2222-2222-2222-222222222222', now() + interval '18 days', 0),
  ('t-9-8', 'تجهيز رسائل تعريفية', 'إعداد رسائل تعريفية جاهزة', 'stage-9', 'new', 'low', '22222222-2222-2222-2222-222222222222', now() + interval '14 days', 0),
  
  -- Stage 10: التشغيل التجريبي
  ('t-10-1', 'إعداد خطة تشغيل تجريبية', 'إنشاء جدول التشغيل التجريبي', 'stage-10', 'new', 'high', '11111111-1111-1111-1111-111111111111', now() + interval '25 days', 0),
  ('t-10-2', 'اختبار تسجيل المهام', 'اختبار نظام تسجيل المهام', 'stage-10', 'new', 'medium', '22222222-2222-2222-2222-222222222222', now() + interval '28 days', 0),
  ('t-10-3', 'اختبار الحضور والانصراف', 'اختبار نظام تسجيل الحضور', 'stage-10', 'new', 'medium', '22222222-2222-2222-2222-222222222222', now() + interval '27 days', 0),
  ('t-10-4', 'اختبار متابعة السيارات', 'اختبار نظام متابعة المركبات', 'stage-10', 'new', 'medium', '22222222-2222-2222-2222-222222222222', now() + interval '29 days', 0),
  ('t-10-5', 'اختبار متابعة السائقين', 'اختبار نظام متابعة السائقين', 'stage-10', 'new', 'low', '22222222-2222-2222-2222-222222222222', now() + interval '29 days', 0),
  ('t-10-6', 'اختبار التقارير اليومية', 'اختبار إنشاء التقارير', 'stage-10', 'new', 'medium', '22222222-2222-2222-2222-222222222222', now() + interval '30 days', 0),
  ('t-10-7', 'اختبار اعتماد المهام', 'اختبار سير عمل الاعتماد', 'stage-10', 'new', 'high', '11111111-1111-1111-1111-111111111111', now() + interval '30 days', 0),
  ('t-10-8', 'تسجيل مشاكل التشغيل', 'توثيق أي مشاكل تظهر', 'stage-10', 'new', 'medium', '22222222-2222-2222-2222-222222222222', now() + interval '32 days', 0),
  ('t-10-9', 'معالجة الملاحظات', 'معالجة الملاحظات والمشكلات', 'stage-10', 'new', 'high', '22222222-2222-2222-2222-222222222222', now() + interval '34 days', 0),
  ('t-10-10', 'إعداد تقرير التشغيل التجريبي', 'كتابة تقرير شامل عن فترة التشغيل التجريبي', 'stage-10', 'new', 'medium', '22222222-2222-2222-2222-222222222222', now() + interval '35 days', 0),
  ('t-10-11', 'اعتماد الجاهزية', 'اعتماد جاهزية الشركة للتشغيل', 'stage-10', 'new', 'high', '11111111-1111-1111-1111-111111111111', now() + interval '36 days', 0),
  
  -- Stage 11: الانطلاق الرسمي
  ('t-11-1', 'مراجعة جميع المتطلبات', 'مراجعة نهائية لجميع متطلبات الانطلاق', 'stage-11', 'new', 'high', '11111111-1111-1111-1111-111111111111', now() + interval '38 days', 0),
  ('t-11-2', 'التأكد من اكتمال الترخيص', 'التأكد من صحة الترخيص النهائي', 'stage-11', 'new', 'high', '11111111-1111-1111-1111-111111111111', now() + interval '39 days', 0),
  ('t-11-3', 'التأكد من جاهزية المقر', 'فحص جاهزية المقر بالكامل', 'stage-11', 'new', 'high', '22222222-2222-2222-2222-222222222222', now() + interval '39 days', 0),
  ('t-11-4', 'التأكد من جاهزية السيارات', 'فحص جاهزية جميع السيارات', 'stage-11', 'new', 'high', '22222222-2222-2222-2222-222222222222', now() + interval '39 days', 0),
  ('t-11-5', 'التأكد من جاهزية الفريق', 'التأكد من جاهزية جميع الموظفين', 'stage-11', 'new', 'high', '11111111-1111-1111-1111-111111111111', now() + interval '40 days', 0),
  ('t-11-6', 'التأكد من جاهزية العقود', 'مراجعة نهائية للعقود', 'stage-11', 'new', 'high', '11111111-1111-1111-1111-111111111111', now() + interval '40 days', 0),
  ('t-11-7', 'التأكد من جاهزية السياسات', 'مراجعة السياسات والإجراءات', 'stage-11', 'new', 'medium', '11111111-1111-1111-1111-111111111111', now() + interval '40 days', 0),
  ('t-11-8', 'اعتماد خطة الانطلاق', 'اعتماد خطة الانطلاق الرسمي', 'stage-11', 'new', 'high', '11111111-1111-1111-1111-111111111111', now() + interval '42 days', 0),
  ('t-11-9', 'إعلان الانطلاق الداخلي', 'إبلاغ الفريق ببداية التشغيل الرسمي', 'stage-11', 'new', 'high', '11111111-1111-1111-1111-111111111111', now() + interval '44 days', 0),
  ('t-11-10', 'بدء التشغيل الرسمي', 'بداية العمل التشغيلي الرسمي', 'stage-11', 'new', 'high', '11111111-1111-1111-1111-111111111111', now() + interval '45 days', 0),
  ('t-11-11', 'إصدار تقرير أول أسبوع', 'إعداد تقرير أول أسبوع من التشغيل', 'stage-11', 'new', 'medium', '22222222-2222-2222-2222-222222222222', now() + interval '52 days', 0)
on conflict (id) do nothing;

-- Insert blockers (seed data)
insert into public.blockers (id, title, description, stage_id, priority, status) values
  ('obs-1', 'الترخيص ينتظر موافقة هيئة النقل', 'تم رفع الطلب ولا يزال قيد المراجعة', 'stage-2', 'high', 'open'),
  ('obs-2', 'ختم الشركة ينتظر اعتماد الشعار', 'لا يمكن عمل الختم بدون الشعار النهائي', 'stage-1', 'medium', 'open'),
  ('obs-3', 'المقر يحتاج موافقة نهائية', 'في انتظار اعتماد الأستاذ سلطان للمقر', 'stage-3', 'high', 'open')
on conflict (id) do nothing;

-- Insert documents (seed data)
insert into public.documents (id, name, status, icon) values
  ('doc-1', 'السجل التجاري', 'pending', '📄'),
  ('doc-2', 'نشاط الشركة', 'completed', '✓'),
  ('doc-3', 'العنوان الوطني', 'in-progress', '📍'),
  ('doc-4', 'الرقم الضريبي', 'pending', '🔢'),
  ('doc-5', 'بيانات المالك أو المفوض', 'completed', '👤'),
  ('doc-6', 'البريد الرسمي', 'pending', '📧'),
  ('doc-7', 'رقم الجوال الرسمي', 'completed', '📱'),
  ('doc-8', 'شعار الشركة', 'in-progress', '🎨'),
  ('doc-9', 'ختم الشركة', 'pending', '🔏'),
  ('doc-10', 'ملف تعريفي', 'pending', '📋')
on conflict (id) do nothing;

-- Insert settings (seed data)
insert into public.settings (id, key, value) values
  ('settings-1', 'company_name', '"عزم اللوجستية"'),
  ('settings-2', 'email_setup', '"pending"'),
  ('settings-3', 'whatsapp_setup', '"pending"')
on conflict (id) do nothing;

-- =============================================
-- FUNCTION TO HANDLE NEW USER SIGNUP
-- =============================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  return new;
end;
$$ language plpgsql security definer;

-- Trigger for new user signup (if using Supabase Auth)
-- Note: For this app we pre-create users in profiles table
-- so we don't need automatic profile creation on signup

-- =============================================
-- END OF SCHEMA
-- =============================================