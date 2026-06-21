// Users
export const users = [
  { id: '1', name: 'الأستاذ سلطان', email: 'sultan@azm.sa', password: 'azm2026', role: 'director', position: 'المدير العام' },
  { id: '2', name: 'عبدالرحمن', email: 'abdulrahman@azm.sa', password: 'azm2026', role: 'operations', position: 'مدير العمليات' }
];

// Stages
export const stages = [
  { id: 'stage-1', name: 'المستندات والسجلات', icon: 'FileText', order: 1, color: '#3b82f6' },
  { id: 'stage-2', name: 'التراخيص والهيئات', icon: 'Stamp', order: 2, color: '#8b5cf6' },
  { id: 'stage-3', name: 'المقر والتجهيزات', icon: 'Building', order: 3, color: '#10b981' },
  { id: 'stage-4', name: 'المركبات والتشغيل', icon: 'Truck', order: 4, color: '#f59e0b' },
  { id: 'stage-5', name: 'التوظيف والفريق', icon: 'Users', order: 5, color: '#ec4899' },
  { id: 'stage-6', name: 'الأنظمة والأدوات', icon: 'Monitor', order: 6, color: '#06b6d4' },
  { id: 'stage-7', name: 'السياسات والإجراءات', icon: 'ClipboardList', order: 7, color: '#84cc16' },
  { id: 'stage-8', name: 'العقود والشراكات', icon: 'FileSignature', order: 8, color: '#f97316' },
  { id: 'stage-9', name: 'التسويق والهوية', icon: 'Palette', order: 9, color: '#a855f7' },
  { id: 'stage-10', name: 'التشغيل التجريبي', icon: 'PlayCircle', order: 10, color: '#14b8a6' },
  { id: 'stage-11', name: 'الانطلاق الرسمي', icon: 'Rocket', order: 11, color: '#1a5f3c' }
];

// Seed Tasks
export const seedTasks = [
  // Stage 1: المستندات والسجلات
  { id: 't-1-1', title: 'مراجعة السجل التجاري', description: 'مراجعة بيانات السجل التجاري والتأكد من صحتها', stageId: 'stage-1', status: 'new', priority: 'high', assignedTo: '2', dueDate: new Date().toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-1-2', title: 'التأكد من نشاط الخدمات اللوجستية أو النقل', description: 'ال verificação من أن نشاط الشركة مسجل بشكل صحيح', stageId: 'stage-1', status: 'in-progress', priority: 'high', assignedTo: '2', dueDate: new Date().toISOString(), progress: 50, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-1-3', title: 'تجهيز العنوان الوطني', description: 'الحصول على العنوان الوطني وتجهيزه للنظام', stageId: 'stage-1', status: 'new', priority: 'medium', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 3).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-1-4', title: 'تجهيز الرقم الضريبي إن وجد', description: 'التأكد من وجود الرقم الضريبي أو تقديم طلب الحصول عليه', stageId: 'stage-1', status: 'new', priority: 'medium', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 5).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-1-5', title: 'تجهيز بيانات المالك أو المفوض', description: 'جمع وتجهيز بيانات المالك أو المفوض للشركة', stageId: 'stage-1', status: 'pending-review', priority: 'high', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 2).toISOString(), progress: 100, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-1-6', title: 'تجهيز البريد الرسمي', description: 'إنشاء وتجهيز البريد الإلكتروني الرسمي للشركة', stageId: 'stage-1', status: 'new', priority: 'medium', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 7).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-1-7', title: 'تجهيز رقم الجوال الرسمي', description: 'توفير رقم جوال رسمي للتواصل', stageId: 'stage-1', status: 'completed', priority: 'medium', assignedTo: '2', dueDate: new Date().toISOString(), progress: 100, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-1-8', title: 'تجهيز شعار الشركة وبيانات التواصل', description: 'تصميم شعار الشركة وتجهيز معلومات التواصل', stageId: 'stage-1', status: 'in-progress', priority: 'high', assignedTo: '1', dueDate: new Date(Date.now() + 86400000 * 4).toISOString(), progress: 60, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-1-9', title: 'تجهيز ملف تعريفي للشركة', description: 'إنشاء ملف تعريفي PDF يحتوي على معلومات الشركة', stageId: 'stage-1', status: 'new', priority: 'low', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 10).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-1-10', title: 'تجهيز ختم الشركة', description: 'تصميم وختم الشركة الرسمي', stageId: 'stage-1', status: 'blocked', priority: 'medium', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 5).toISOString(), progress: 0, checklist: [], notes: [], obstacles: ['في انتظار اعتماد الشعار'], logs: [], createdAt: new Date().toISOString() },
  
  // Stage 2: التراخيص والهيئات
  { id: 't-2-1', title: 'الدخول إلى منصة هيئة النقل', description: 'التسجيل والدخول إلى منصة هيئة النقل العامة', stageId: 'stage-2', status: 'in-progress', priority: 'high', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 2).toISOString(), progress: 40, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-2-2', title: 'تحديد نوع الترخيص', description: 'تحديد نوع الترخيص المطلوب لشركة النقل', stageId: 'stage-2', status: 'new', priority: 'high', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 3).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-2-3', title: 'تجهيز متطلبات هيئة النقل', description: 'جمع وتجهيز جميع المتطلبات المطلوبة من هيئة النقل', stageId: 'stage-2', status: 'new', priority: 'high', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 5).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-2-4', title: 'رفع طلب الترخيص', description: 'تقديم طلب الترخيص عبر المنصة', stageId: 'stage-2', status: 'new', priority: 'high', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 7).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-2-5', title: 'متابعة حالة الطلب', description: 'متابعة حالة الطلب المقدم لهيئة النقل', stageId: 'stage-2', status: 'new', priority: 'medium', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 14).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-2-6', title: 'تسجيل النواقص', description: 'تسجيل أي نقص في المتطلبات ومعالجته', stageId: 'stage-2', status: 'new', priority: 'medium', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 10).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-2-7', title: 'سداد الرسوم إن وجدت', description: 'سداد رسوم الترخيص المطلوبة', stageId: 'stage-2', status: 'new', priority: 'high', assignedTo: '1', dueDate: new Date(Date.now() + 86400000 * 12).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-2-8', title: 'حفظ رقم الطلب', description: 'حفظ رقم الطلب المرجعي للمتابعة', stageId: 'stage-2', status: 'new', priority: 'low', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 8).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-2-9', title: 'متابعة الموافقة', description: 'متابعة موافقة هيئة النقل على الطلب', stageId: 'stage-2', status: 'new', priority: 'high', assignedTo: '1', dueDate: new Date(Date.now() + 86400000 * 21).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  
  // Stage 3: المقر والتجهيزات
  { id: 't-3-1', title: 'تحديد احتياج الشركة للمقر', description: 'تحديد المساحة والموقع المطلوبين للمقر', stageId: 'stage-3', status: 'completed', priority: 'high', assignedTo: '1', dueDate: new Date().toISOString(), progress: 100, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-3-2', title: 'البحث عن مقر مناسب', description: 'البحث عن مكاتب مناسبة في الموقع المطلوب', stageId: 'stage-3', status: 'in-progress', priority: 'high', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 5).toISOString(), progress: 70, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-3-3', title: 'مقارنة أسعار المكاتب', description: 'مقارنة أسعار الإيجار للمكاتب المتاحة', stageId: 'stage-3', status: 'new', priority: 'medium', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 7).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-3-4', title: 'التفاوض على الإيجار', description: 'التفاوض للحصول على أفضل سعر', stageId: 'stage-3', status: 'new', priority: 'medium', assignedTo: '1', dueDate: new Date(Date.now() + 86400000 * 10).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-3-5', title: 'تجهيز عقد الإيجار', description: 'مراجعة وتجهيز عقد إيجار المكتب', stageId: 'stage-3', status: 'new', priority: 'high', assignedTo: '1', dueDate: new Date(Date.now() + 86400000 * 12).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-3-6', title: 'اعتماد المقر', description: 'اعتماد الموقع والمكتب النهائي', stageId: 'stage-3', status: 'pending-review', priority: 'high', assignedTo: '1', dueDate: new Date(Date.now() + 86400000 * 14).toISOString(), progress: 100, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-3-7', title: 'تجهيز الإنترنت', description: 'توصيل خدمة الإنترنت للمقر', stageId: 'stage-3', status: 'new', priority: 'high', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 16).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-3-8', title: 'تجهيز أجهزة الكمبيوتر والطابعة', description: 'شراء وتجهيز الأجهزة المكتبية', stageId: 'stage-3', status: 'new', priority: 'medium', assignedTo: '1', dueDate: new Date(Date.now() + 86400000 * 18).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-3-9', title: 'تجهيز الأدوات المكتبية', description: 'توفير الأدوات واللوازم المكتبية', stageId: 'stage-3', status: 'new', priority: 'low', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 15).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  
  // Stage 4: المركبات والتشغيل
  { id: 't-4-1', title: 'تحديد عدد السيارات المطلوبة', description: 'تحديد عدد السيارات بناءً على خطة العمل', stageId: 'stage-4', status: 'in-progress', priority: 'high', assignedTo: '1', dueDate: new Date(Date.now() + 86400000 * 3).toISOString(), progress: 50, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-4-2', title: 'تحديد نوع السيارات المناسبة', description: 'تحديد المواصفات والموديلات المناسبة', stageId: 'stage-4', status: 'new', priority: 'high', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 5).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-4-3', title: 'مقارنة الشراء أو التأجير', description: 'دراسة جدوى للشراء مقابل التأجير', stageId: 'stage-4', status: 'new', priority: 'medium', assignedTo: '1', dueDate: new Date(Date.now() + 86400000 * 8).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-4-4', title: 'الحصول على عروض أسعار', description: 'جمع عروض أسعار من عدة موردين', stageId: 'stage-4', status: 'new', priority: 'medium', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 10).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-4-5', title: 'اعتماد ميزانية السيارات', description: 'اعتماد الميزانية النهائية لشراء السيارات', stageId: 'stage-4', status: 'pending-review', priority: 'high', assignedTo: '1', dueDate: new Date(Date.now() + 86400000 * 12).toISOString(), progress: 100, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-4-6', title: 'شراء أو استئجار السيارات', description: 'إتمام عملية الشراء أو التأجير', stageId: 'stage-4', status: 'new', priority: 'high', assignedTo: '1', dueDate: new Date(Date.now() + 86400000 * 20).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-4-7', title: 'التأكد من التأمين', description: 'تجهيز وثائق التأمين لجميع السيارات', stageId: 'stage-4', status: 'new', priority: 'high', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 22).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-4-8', title: 'التأكد من الفحص الدوري', description: 'إتمام الفحص الدوري لجميع السيارات', stageId: 'stage-4', status: 'new', priority: 'medium', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 23).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-4-9', title: 'تجهيز هوية السيارات', description: 'تجهيز لوحات وهوية كل سيارة', stageId: 'stage-4', status: 'new', priority: 'medium', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 21).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-4-10', title: 'إعداد سجل لكل سيارة', description: 'إنشاء ملف خاص بكل سيارة', stageId: 'stage-4', status: 'new', priority: 'low', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 25).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-4-11', title: 'تجهيز خطة صيانة أولية', description: 'إعداد جدول الصيانة الدورية', stageId: 'stage-4', status: 'new', priority: 'medium', assignedTo: '2', dueDate: new Date(Date.now() + 86400024).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  
  // Stage 5: التوظيف والفريق
  { id: 't-5-1', title: 'تحديد الوظائف المطلوبة', description: 'تحديد عدد وأنواع الوظائف المطلوبة', stageId: 'stage-5', status: 'in-progress', priority: 'high', assignedTo: '1', dueDate: new Date(Date.now() + 86400000 * 4).toISOString(), progress: 60, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-5-2', title: 'كتابة الوصف الوظيفي', description: 'إعداد وصف واضح لكل وظيفة', stageId: 'stage-5', status: 'new', priority: 'high', assignedTo: '1', dueDate: new Date(Date.now() + 86400000 * 6).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-5-3', title: 'نشر طلبات التوظيف', description: 'نشر الإعلانات على مواقع التوظيف', stageId: 'stage-5', status: 'new', priority: 'medium', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 8).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-5-4', title: 'استقبال المرشحين', description: 'استقبال وترتيب طلبات المرشحين', stageId: 'stage-5', status: 'new', priority: 'medium', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 15).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-5-5', title: 'إجراء المقابلات', description: 'جدولة وإجراء المقابلات', stageId: 'stage-5', status: 'new', priority: 'high', assignedTo: '1', dueDate: new Date(Date.now() + 86400000 * 20).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-5-6', title: 'اختيار المرشحين', description: 'اختيار المرشحين النهائيين', stageId: 'stage-5', status: 'new', priority: 'high', assignedTo: '1', dueDate: new Date(Date.now() + 86400000 * 22).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-5-7', title: 'تجهيز العقود', description: 'إعداد عقود العمل', stageId: 'stage-5', status: 'new', priority: 'high', assignedTo: '1', dueDate: new Date(Date.now() + 86400000 * 25).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-5-8', title: 'تدريب الفريق على النظام', description: 'تدريب الموظفين على استخدام نظام عزم', stageId: 'stage-5', status: 'new', priority: 'medium', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 30).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-5-9', title: 'تعريف الموظفين بالسياسات', description: 'شرح سياسات وإجراءات الشركة', stageId: 'stage-5', status: 'new', priority: 'medium', assignedTo: '1', dueDate: new Date(Date.now() + 86400000 * 28).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  
  // Stage 6: الأنظمة والأدوات
  { id: 't-6-1', title: 'اعتماد نظام إدارة المهام', description: 'اختيار وتفعيل نظام إدارة المهام', stageId: 'stage-6', status: 'completed', priority: 'high', assignedTo: '1', dueDate: new Date().toISOString(), progress: 100, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-6-2', title: 'تجهيز بريد الشركة', description: 'إعداد حسابات البريد الإلكتروني', stageId: 'stage-6', status: 'in-progress', priority: 'high', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 3).toISOString(), progress: 50, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-6-3', title: 'تجهيز أرقام التواصل', description: 'تجهيز أرقام الهاتف للتواصل الداخلي', stageId: 'stage-6', status: 'new', priority: 'medium', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 5).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-6-4', title: 'تجهيز واتساب الأعمال لاحقًا', description: 'تجهيز حساب واتساب للأعمال - مؤجل', stageId: 'stage-6', status: 'new', priority: 'low', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 30).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-6-5', title: 'تجهيز نماذج العمل اليومية', description: 'إنشاء نماذج للتقارير اليومية', stageId: 'stage-6', status: 'new', priority: 'medium', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 7).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-6-6', title: 'تجهيز نموذج التقرير اليومي', description: 'إنشاء نموذج التقرير اليومي', stageId: 'stage-6', status: 'new', priority: 'medium', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 8).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-6-7', title: 'تجهيز نموذج متابعة المركبات', description: 'إنشاء نموذج متابعة المركبات', stageId: 'stage-6', status: 'new', priority: 'medium', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 10).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-6-8', title: 'تجهيز نموذج متابعة السائقين', description: 'إنشاء نموذج متابعة السائقين', stageId: 'stage-6', status: 'new', priority: 'medium', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 12).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-6-9', title: 'تجهيز نسخة احتياطية للملفات', description: 'إعداد نظام النسخ الاحتياطي', stageId: 'stage-6', status: 'new', priority: 'high', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 15).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  
  // Stage 7: السياسات والإجراءات
  { id: 't-7-1', title: 'كتابة سياسة الحضور والانصراف', description: 'تحديد أوقات العمل وساعات الدوام', stageId: 'stage-7', status: 'in-progress', priority: 'high', assignedTo: '1', dueDate: new Date(Date.now() + 86400000 * 5).toISOString(), progress: 40, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-7-2', title: 'كتابة سياسة استخدام السيارات', description: 'تحديد قواعد استخدام سيارات الشركة', stageId: 'stage-7', status: 'new', priority: 'high', assignedTo: '1', dueDate: new Date(Date.now() + 86400000 * 8).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-7-3', title: 'كتابة سياسة تسليم واستلام المركبة', description: 'تحديد إجراءات تسليم واستلام السيارات', stageId: 'stage-7', status: 'new', priority: 'high', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 10).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-7-4', title: 'كتابة سياسة متابعة المهام اليومية', description: 'تحديد آلية متابعة المهام والتقارير', stageId: 'stage-7', status: 'new', priority: 'medium', assignedTo: '1', dueDate: new Date(Date.now() + 86400000 * 12).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-7-5', title: 'كتابة سياسة التقارير اليومية', description: 'تحديد نموذج ومحتوى التقارير اليومية', stageId: 'stage-7', status: 'new', priority: 'medium', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 14).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-7-6', title: 'كتابة آلية اعتماد المهام', description: 'تحديد خطوات اعتماد المهام', stageId: 'stage-7', status: 'new', priority: 'high', assignedTo: '1', dueDate: new Date(Date.now() + 86400000 * 7).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-7-7', title: 'كتابة آلية التصعيد عند التأخير', description: 'تحديد خطوات التصعيد عند تأخر المهام', stageId: 'stage-7', status: 'new', priority: 'medium', assignedTo: '1', dueDate: new Date(Date.now() + 86400000 * 12).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-7-8', title: 'كتابة إجراءات السلامة', description: 'تحديد إجراءات السلامة المطلوبة', stageId: 'stage-7', status: 'new', priority: 'high', assignedTo: '1', dueDate: new Date(Date.now() + 86400000 * 15).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-7-9', title: 'كتابة نموذج محضر اجتماع', description: 'إنشاء نموذج لمحاضر الاجتماعات', stageId: 'stage-7', status: 'new', priority: 'low', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 10).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-7-10', title: 'كتابة نموذج تسليم عهدة', description: 'إنشاء نموذج لتسليم العهدة', stageId: 'stage-7', status: 'new', priority: 'medium', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 12).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-7-11', title: 'كتابة نموذج طلب شراء', description: 'إنشاء نموذج لطلبات الشراء', stageId: 'stage-7', status: 'new', priority: 'low', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 14).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  
  // Stage 8: العقود والشراكات
  { id: 't-8-1', title: 'تجهيز عقد إيجار المقر', description: 'مراجعة واعتماد عقد إيجار المكتب', stageId: 'stage-8', status: 'pending-review', priority: 'high', assignedTo: '1', dueDate: new Date(Date.now() + 86400000 * 5).toISOString(), progress: 100, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-8-2', title: 'تجهيز عقود الموظفين', description: 'إعداد عقود العمل للموظفين', stageId: 'stage-8', status: 'new', priority: 'high', assignedTo: '1', dueDate: new Date(Date.now() + 86400000 * 20).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-8-3', title: 'تجهيز اتفاقية السائقين إن وجدت', description: 'إعداد اتفاقيات عمل للسائقين', stageId: 'stage-8', status: 'new', priority: 'medium', assignedTo: '1', dueDate: new Date(Date.now() + 86400000 * 25).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-8-4', title: 'تجهيز عقود الموردين', description: 'إعداد عقود مع الموردين', stageId: 'stage-8', status: 'new', priority: 'medium', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 20).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-8-5', title: 'تجهيز عقود صيانة السيارات', description: 'إبرام عقود صيانة دورية', stageId: 'stage-8', status: 'new', priority: 'medium', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 22).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-8-6', title: 'تجهيز اتفاقيات مع شركاء التوصيل أو النقل', description: 'إعداد اتفاقيات مع الشركات الشريكة', stageId: 'stage-8', status: 'new', priority: 'medium', assignedTo: '1', dueDate: new Date(Date.now() + 86400000 * 30).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-8-7', title: 'تجهيز عرض تعريفي للشركة', description: 'إنشاء عرض تقديمي للشركة', stageId: 'stage-8', status: 'new', priority: 'low', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 15).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-8-8', title: 'تجهيز نموذج اتفاقية خدمة', description: 'إنشاء نموذج لاتفاقيات الخدمة', stageId: 'stage-8', status: 'new', priority: 'medium', assignedTo: '1', dueDate: new Date(Date.now() + 86400000 * 18).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-8-9', title: 'مراجعة العقود من الأستاذ سلطان', description: 'المراجعة النهائية للعقود', stageId: 'stage-8', status: 'new', priority: 'high', assignedTo: '1', dueDate: new Date(Date.now() + 86400000 * 28).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-8-10', title: 'اعتماد العقود النهائية', description: 'اعتماد جميع العقود بشكل نهائي', stageId: 'stage-8', status: 'new', priority: 'high', assignedTo: '1', dueDate: new Date(Date.now() + 86400000 * 30).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  
  // Stage 9: التسويق والهوية
  { id: 't-9-1', title: 'اعتماد الهوية البصرية', description: 'اعتماد التصميم النهائي للهوية', stageId: 'stage-9', status: 'in-progress', priority: 'high', assignedTo: '1', dueDate: new Date(Date.now() + 86400000 * 5).toISOString(), progress: 30, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-9-2', title: 'تجهيز شعار عزم النهائي', description: 'إنتاج الشعار بجميع المقاسات', stageId: 'stage-9', status: 'new', priority: 'high', assignedTo: '1', dueDate: new Date(Date.now() + 86400000 * 7).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-9-3', title: 'تجهيز بروفايل الشركة', description: 'إنشاء بروفايل احترافي للشركة', stageId: 'stage-9', status: 'new', priority: 'medium', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 10).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-9-4', title: 'تجهيز صفحة تعريفية بسيطة', description: 'إنشاء صفحة تعريفية للموقع', stageId: 'stage-9', status: 'new', priority: 'low', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 15).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-9-5', title: 'تجهيز توقيع البريد الإلكتروني', description: 'تصميم توقيع احترافي للبريد', stageId: 'stage-9', status: 'new', priority: 'low', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 8).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-9-6', title: 'تجهيز بطاقة عمل', description: 'تصميم وبطاقات العمل', stageId: 'stage-9', status: 'new', priority: 'medium', assignedTo: '1', dueDate: new Date(Date.now() + 86400000 * 12).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-9-7', title: 'تجهيز ملف تعريفي PDF', description: 'إنشاء كتيب تعريفي PDF', stageId: 'stage-9', status: 'new', priority: 'medium', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 18).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-9-8', title: 'تجهيز رسائل تعريفية للشركاء والعملاء', description: 'إعداد رسائل تعريفية جاهزة', stageId: 'stage-9', status: 'new', priority: 'low', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 14).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  
  // Stage 10: التشغيل التجريبي
  { id: 't-10-1', title: 'إعداد خطة تشغيل تجريبية لمدة أسبوع', description: 'إنشاء جدول التشغيل التجريبي', stageId: 'stage-10', status: 'new', priority: 'high', assignedTo: '1', dueDate: new Date(Date.now() + 86400000 * 25).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-10-2', title: 'اختبار تسجيل المهام يوميًا', description: 'اختبار نظام تسجيل المهام', stageId: 'stage-10', status: 'new', priority: 'medium', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 28).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-10-3', title: 'اختبار الحضور والانصراف', description: 'اختبار نظام تسجيل الحضور', stageId: 'stage-10', status: 'new', priority: 'medium', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 27).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-10-4', title: 'اختبار متابعة السيارات', description: 'اختبار نظام متابعة المركبات', stageId: 'stage-10', status: 'new', priority: 'medium', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 29).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-10-5', title: 'اختبار متابعة السائقين', description: 'اختبار نظام متابعة السائقين', stageId: 'stage-10', status: 'new', priority: 'low', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 29).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-10-6', title: 'اختبار التقارير اليومية', description: 'اختبار إنشاء التقارير', stageId: 'stage-10', status: 'new', priority: 'medium', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 30).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-10-7', title: 'اختبار اعتماد المهام', description: 'اختبار سير عمل الاعتماد', stageId: 'stage-10', status: 'new', priority: 'high', assignedTo: '1', dueDate: new Date(Date.now() + 86400000 * 30).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-10-8', title: 'تسجيل مشاكل التشغيل', description: 'توثيق أي مشاكل تظهر', stageId: 'stage-10', status: 'new', priority: 'medium', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 32).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-10-9', title: 'معالجة الملاحظات', description: 'معالجة الملاحظات والمشكلات', stageId: 'stage-10', status: 'new', priority: 'high', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 34).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-10-10', title: 'إعداد تقرير التشغيل التجريبي', description: 'كتابة تقرير شامل عن فترة التشغيل التجريبي', stageId: 'stage-10', status: 'new', priority: 'medium', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 35).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-10-11', title: 'اعتماد الجاهزية', description: 'اعتماد جاهزية الشركة للتشغيل', stageId: 'stage-10', status: 'new', priority: 'high', assignedTo: '1', dueDate: new Date(Date.now() + 86400000 * 36).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  
  // Stage 11: الانطلاق الرسمي
  { id: 't-11-1', title: 'مراجعة جميع المتطلبات', description: 'مراجعة نهائية لجميع متطلبات الانطلاق', stageId: 'stage-11', status: 'new', priority: 'high', assignedTo: '1', dueDate: new Date(Date.now() + 86400000 * 38).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-11-2', title: 'التأكد من اكتمال الترخيص', description: 'التأكد من صحة الترخيص النهائي', stageId: 'stage-11', status: 'new', priority: 'high', assignedTo: '1', dueDate: new Date(Date.now() + 86400000 * 39).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-11-3', title: 'التأكد من جاهزية المقر', description: 'فحص جاهزية المقر بالكامل', stageId: 'stage-11', status: 'new', priority: 'high', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 39).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-11-4', title: 'التأكد من جاهزية السيارات', description: 'فحص جاهزية جميع السيارات', stageId: 'stage-11', status: 'new', priority: 'high', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 39).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-11-5', title: 'التأكد من جاهزية الفريق', description: 'التأكد من جاهزية جميع الموظفين', stageId: 'stage-11', status: 'new', priority: 'high', assignedTo: '1', dueDate: new Date(Date.now() + 86400000 * 40).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-11-6', title: 'التأكد من جاهزية العقود', description: 'مراجعة نهائية للعقود', stageId: 'stage-11', status: 'new', priority: 'high', assignedTo: '1', dueDate: new Date(Date.now() + 86400000 * 40).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-11-7', title: 'التأكد من جاهزية السياسات', description: 'مراجعة السياسات والإجراءات', stageId: 'stage-11', status: 'new', priority: 'medium', assignedTo: '1', dueDate: new Date(Date.now() + 86400000 * 40).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-11-8', title: 'اعتماد خطة الانطلاق', description: 'اعتماد خطة الانطلاق الرسمي', stageId: 'stage-11', status: 'new', priority: 'high', assignedTo: '1', dueDate: new Date(Date.now() + 86400000 * 42).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-11-9', title: 'إعلان الانطلاق الداخلي', description: 'إبلاغ الفريق ببداية التشغيل الرسمي', stageId: 'stage-11', status: 'new', priority: 'high', assignedTo: '1', dueDate: new Date(Date.now() + 86400000 * 44).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-11-10', title: 'بدء التشغيل الرسمي', description: 'بداية العمل التشغيلي الرسمي', stageId: 'stage-11', status: 'new', priority: 'high', assignedTo: '1', dueDate: new Date(Date.now() + 86400000 * 45).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() },
  { id: 't-11-11', title: 'إصدار تقرير أول أسبوع تشغيل', description: 'إعداد تقرير أول أسبوع من التشغيل', stageId: 'stage-11', status: 'new', priority: 'medium', assignedTo: '2', dueDate: new Date(Date.now() + 86400000 * 52).toISOString(), progress: 0, checklist: [], notes: [], obstacles: [], logs: [], createdAt: new Date().toISOString() }
];

// Obstacles
export const seedObstacles = [
  { id: 'obs-1', title: 'الترخيص ينتظر موافقة هيئة النقل', description: 'تم رفع الطلب ولا يزال قيد المراجعة', stageId: 'stage-2', priority: 'high', status: 'open', createdAt: new Date().toISOString(), resolvedAt: null },
  { id: 'obs-2', title: 'ختم الشركة ينتظر اعتماد الشعار', description: 'لا يمكن عمل الختم بدون الشعار النهائي', stageId: 'stage-1', priority: 'medium', status: 'open', createdAt: new Date().toISOString(), resolvedAt: null },
  { id: 'obs-3', title: 'المقر يحتاج موافقة نهائية', description: 'في انتظار اعتماد الأستاذ سلطان للمقر', stageId: 'stage-3', priority: 'high', status: 'open', createdAt: new Date().toISOString(), resolvedAt: null }
];

// Attendance records
export const seedAttendance = [];

// Notifications
export const seedNotifications = [];

// Notes
export const seedNotes = [];

// Company settings
export const companySettings = {
  name: 'عزم اللوجستية',
  logo: null,
  address: '',
  phone: '',
  email: '',
  startDate: '2026-01-01'
};

// Classification categories
export const categories = [
  { id: 'cat-1', name: 'مستندات', color: '#3b82f6' },
  { id: 'cat-2', name: 'تراخيص', color: '#8b5cf6' },
  { id: 'cat-3', name: 'مقر', color: '#10b981' },
  { id: 'cat-4', name: 'مركبات', color: '#f59e0b' },
  { id: 'cat-5', name: 'توظيف', color: '#ec4899' },
  { id: 'cat-6', name: 'أنظمة', color: '#06b6d4' },
  { id: 'cat-7', name: 'سياسات', color: '#84cc16' },
  { id: 'cat-8', name: 'عقود', color: '#f97316' },
  { id: 'cat-9', name: 'تسويق', color: '#a855f7' },
  { id: 'cat-10', name: 'تشغيل', color: '#14b8a6' },
  { id: 'cat-11', name: 'انطلاق', color: '#1a5f3c' }
];

// Priority levels
export const priorities = [
  { id: 'high', name: 'عالية', color: '#ef4444' },
  { id: 'medium', name: 'متوسطة', color: '#f59e0b' },
  { id: 'low', name: 'منخفضة', color: '#22c55e' }
];

// Status definitions
export const statuses = [
  { id: 'new', name: 'جديد', color: '#3b82f6', order: 1 },
  { id: 'in-progress', name: 'قيد التنفيذ', color: '#f59e0b', order: 2 },
  { id: 'pending-review', name: 'بانتظار المراجعة', color: '#8b5cf6', order: 3 },
  { id: 'completed', name: 'مكتمل', color: '#22c55e', order: 4 },
  { id: 'blocked', name: 'متعثر', color: '#ef4444', order: 5 },
  { id: 'delayed', name: 'مؤجل', color: '#6b7280', order: 6 }
];

// Initial data
const initialData = {
  users,
  stages,
  tasks: seedTasks,
  obstacles: seedObstacles,
  attendance: seedAttendance,
  notifications: seedNotifications,
  notes: seedNotes,
  companySettings,
  categories,
  priorities,
  statuses
};

// Load data from localStorage or use initial data
export function loadData() {
  try {
    const savedData = localStorage.getItem('azm_data');
    if (savedData) {
      return JSON.parse(savedData);
    }
  } catch (e) {
    console.error('Error loading data:', e);
  }
  return initialData;
}

// Save data to localStorage
export function saveData(data) {
  try {
    localStorage.setItem('azm_data', JSON.stringify(data));
  } catch (e) {
    console.error('Error saving data:', e);
  }
}

// Reset data to initial seed data
export function resetData() {
  localStorage.setItem('azm_data', JSON.stringify(initialData));
  return initialData;
}

// Get tasks by stage
export function getTasksByStage(stageId) {
  const data = loadData();
  return data.tasks.filter(t => t.stageId === stageId);
}

// Get tasks by status
export function getTasksByStatus(status) {
  const data = loadData();
  return data.tasks.filter(t => t.status === status);
}

// Get tasks for today
export function getTodaysTasks() {
  const data = loadData();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  return {
    urgent: data.tasks.filter(t => {
      const due = new Date(t.dueDate);
      due.setHours(0, 0, 0, 0);
      return due.getTime() === today.getTime() && t.priority === 'high' && t.status !== 'completed';
    }),
    dueToday: data.tasks.filter(t => {
      const due = new Date(t.dueDate);
      due.setHours(0, 0, 0, 0);
      return due.getTime() === today.getTime() && t.status !== 'completed';
    }),
    delayed: data.tasks.filter(t => {
      const due = new Date(t.dueDate);
      due.setHours(0, 0, 0, 0);
      return due.getTime() < today.getTime() && t.status !== 'completed';
    }),
    pendingReview: data.tasks.filter(t => t.status === 'pending-review'),
    blocked: data.tasks.filter(t => t.status === 'blocked')
  };
}

// Calculate stage progress
export function calculateStageProgress(stageId) {
  const data = loadData();
  const stageTasks = data.tasks.filter(t => t.stageId === stageId);
  if (stageTasks.length === 0) return 0;
  
  const totalProgress = stageTasks.reduce((sum, t) => sum + t.progress, 0);
  return Math.round(totalProgress / stageTasks.length);
}

// Calculate overall progress
export function calculateOverallProgress() {
  const data = loadData();
  if (data.tasks.length === 0) return 0;
  
  const totalProgress = data.tasks.reduce((sum, t) => sum + t.progress, 0);
  return Math.round(totalProgress / data.tasks.length);
}

// Calculate readiness
export function calculateReadiness() {
  const data = loadData();
  
  const completedTasks = data.tasks.filter(t => t.status === 'completed').length;
  const totalTasks = data.tasks.length;
  const delayedTasks = data.tasks.filter(t => t.status === 'blocked' || t.status === 'delayed').length;
  const openObstacles = data.obstacles.filter(o => o.status === 'open').length;
  
  const completedStages = data.stages.filter(stage => {
    const stageTasks = data.tasks.filter(t => t.stageId === stage.id);
    return stageTasks.length > 0 && stageTasks.every(t => t.status === 'completed');
  }).length;
  
  const stageProgress = (completedStages / data.stages.length) * 100;
  const taskProgress = (completedTasks / totalTasks) * 100;
  
  let score = (stageProgress * 0.4) + (taskProgress * 0.4) + (20 - (delayedTasks * 2) - (openObstacles * 3));
  score = Math.max(0, Math.min(100, score));
  
  let status;
  if (score < 30) status = 'غير جاهز';
  else if (score < 60) status = 'يحتاج استكمال';
  else if (score < 85) status = 'قريب من الجاهزية';
  else status = 'جاهز للانطلاق';
  
  return { score: Math.round(score), status, completedTasks, totalTasks, delayedTasks, openObstacles, completedStages, totalStages: data.stages.length };
}