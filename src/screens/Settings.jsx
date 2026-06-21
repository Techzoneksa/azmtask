import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { 
  Settings, 
  Building,
  Users,
  Layers,
  Mail,
  MessageSquare,
  Save,
  Shield,
  Globe,
  Clock,
  Smartphone
} from 'lucide-react';

export default function SettingsPage() {
  const { user, profile } = useAuth();
  const { data } = useData();
  const [activeTab, setActiveTab] = useState('company');
  const [saved, setSaved] = useState(false);

  const isAdmin = profile?.role === 'admin' || profile?.role === 'director';

  const tabs = [
    { id: 'company', label: 'بيانات الشركة', icon: Building },
    { id: 'users', label: 'المستخدمون', icon: Users },
    { id: 'stages', label: 'المراحل', icon: Layers },
    { id: 'email', label: 'البريد', icon: Mail, disabled: true },
    { id: 'whatsapp', label: 'الواتساب', icon: MessageSquare, disabled: true },
    { id: 'general', label: 'عام', icon: Globe }
  ];

  const getStageStats = (stageId) => {
    const stageTasks = data.tasks?.filter(t => t.stage_id === stageId) || [];
    const completed = stageTasks.filter(t => t.status === 'completed').length;
    const total = stageTasks.length;
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { completed, total, progress };
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-azm-green to-azm-green-light rounded-xl flex items-center justify-center">
            <Settings className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">الإعدادات</h1>
            <p className="text-gray-500">إدارة النظام والإعدادات</p>
          </div>
        </div>
        {saved && (
          <div className="flex items-center gap-2 text-green-600 bg-green-50 px-4 py-2 rounded-full">
            <Save className="w-4 h-4" />
            <span className="text-sm font-medium">تم الحفظ</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="overflow-x-auto -mx-4 px-4 hide-scrollbar">
        <div className="flex gap-2 min-w-max">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => !tab.disabled && setActiveTab(tab.id)}
                disabled={tab.disabled}
                className={`flex items-center gap-2 px-4 py-3 rounded-xl font-medium transition-all ${
                  tab.disabled 
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed' :
                    activeTab === tab.id
                    ? 'bg-gradient-to-r from-azm-green to-azm-green-light text-white shadow-lg'
                    : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
                }`}
              >
                <Icon className="w-5 h-5" />
                {tab.label}
                {tab.disabled && (
                  <span className="text-xs bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full mr-2">قريبًا</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="space-y-4">
        {/* Company Data */}
        {activeTab === 'company' && (
          <div className="space-y-4">
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-800 mb-6 flex items-center gap-2">
                <Building className="w-5 h-5 text-azm-green" />
                بيانات الشركة
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">اسم الشركة</label>
                  <input type="text" defaultValue="عزم للخدمات اللوجستية" className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">رقم السجل التجاري</label>
                  <input type="text" placeholder="رقم السجل التجاري" className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">الرقم الضريبي</label>
                  <input type="text" placeholder="الرقم الضريبي" className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">العنوان الوطني</label>
                  <input type="text" placeholder="العنوان الوطني" className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">البريد الإلكتروني الرسمي</label>
                  <input type="email" defaultValue="info@azm.sa" className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">رقم الجوال الرسمي</label>
                  <input type="tel" placeholder="+966XXXXXXXXX" className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">المدينة</label>
                  <input type="text" defaultValue="الرياض" className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">الدولة</label>
                  <input type="text" defaultValue="المملكة العربية السعودية" className="input-field" />
                </div>
              </div>
              
              {/* Logo Section */}
              <div className="mt-6 p-6 bg-gray-50 rounded-xl text-center">
                <div className="w-20 h-20 bg-white rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-md border-2 border-dashed border-gray-300">
                  <span className="text-azm-green font-bold text-3xl">ع</span>
                </div>
                <p className="text-sm text-gray-500">شعار الشركة - سيتم تفعيل رفع الشعار قريبًا</p>
              </div>
              
              <div className="mt-6 flex justify-end">
                <button onClick={handleSave} className="btn-primary flex items-center gap-2">
                  <Save className="w-4 h-4" />
                  حفظ التغييرات
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Users */}
        {activeTab === 'users' && (
          <div className="space-y-4">
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-800 mb-6 flex items-center gap-2">
                <Users className="w-5 h-5 text-azm-green" />
                المستخدمون والصلاحيات
              </h3>
              
              <div className="space-y-4">
                {/* Sultan */}
                <div className="p-4 bg-gradient-to-r from-green-50 to-white rounded-xl border border-green-100">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-azm-green to-azm-green-light text-white flex items-center justify-center text-xl font-bold">
                      س
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-800">الأستاذ سلطان</h4>
                      <p className="text-sm text-gray-500">sultan@azm.promksa.com</p>
                      <div className="flex gap-2 mt-2">
                        <span className="badge badge-green">
                          <Shield className="w-3 h-3 ml-1" />
                          المدير العام
                        </span>
                        <span className="badge badge-blue">Admin</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-3">يمتلك صلاحيات كاملة في النظام</p>
                </div>
                
                {/* Abdu */}
                <div className="p-4 bg-gradient-to-r from-blue-50 to-white rounded-xl border border-blue-100">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-white flex items-center justify-center text-xl font-bold">
                      ع
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-800">عبدالرحمن</h4>
                      <p className="text-sm text-gray-500">abdu@azm.promksa.com</p>
                      <div className="flex gap-2 mt-2">
                        <span className="badge badge-blue">
                          <Shield className="w-3 h-3 ml-1" />
                          مدير العمليات
                        </span>
                        <span className="badge badge-purple">Admin + Ops</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-3">يمتلك صلاحيات كاملة - نفس صلاحيات المدير العام</p>
                </div>
              </div>
              
              <div className="mt-6 p-4 bg-amber-50 rounded-xl border border-amber-200">
                <p className="text-sm text-amber-700">
                  <strong>ملاحظة:</strong> عبدالرحمن يمتلك صلاحيات كاملة كـ Admin ويستطيع:
                  اعتماد المهام، نقلها للمكتمل، إدارة التحديات التشغيلية، الوصول لجميع البيانات.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Stages */}
        {activeTab === 'stages' && (
          <div className="space-y-4">
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-800 mb-6 flex items-center gap-2">
                <Layers className="w-5 h-5 text-azm-green" />
                مراحل التأسيس
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {data.stages?.map(stage => {
                  const stats = getStageStats(stage.id);
                  return (
                    <div key={stage.id} className="p-4 bg-gray-50 rounded-xl border border-gray-100 hover:border-azm-green transition-colors">
                      <div className="flex items-center gap-3 mb-3">
                        <div 
                          className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold"
                          style={{ backgroundColor: stage.color }}
                        >
                          {stage.order}
                        </div>
                        <div className="flex-1">
                          <h4 className="font-semibold text-gray-800 text-sm">{stage.name}</h4>
                          <p className="text-xs text-gray-500">{stats.total} مهمة</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div 
                            className="h-full rounded-full transition-all duration-500"
                            style={{ 
                              width: `${stats.progress}%`,
                              backgroundColor: stage.color
                            }}
                          />
                        </div>
                        <span className="text-xs font-medium text-gray-600">{stats.progress}%</span>
                      </div>
                      <div className="flex gap-2 mt-2">
                        <span className="text-xs text-green-600">{stats.completed} مكتمل</span>
                        <span className="text-xs text-gray-400">|</span>
                        <span className="text-xs text-orange-600">{stats.total - stats.completed} قيد التنفيذ</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Email Settings (Disabled) */}
        {activeTab === 'email' && (
          <div className="space-y-4">
            <div className="card">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                  <Mail className="w-5 h-5 text-azm-green" />
                  إعدادات البريد الإلكتروني
                </h3>
                <span className="badge badge-amber">مؤجل - سيتم تفعيله لاحقًا</span>
              </div>
              
              <div className="p-6 bg-gray-50 rounded-xl mb-6">
                <div className="flex items-center gap-3 text-gray-600">
                  <Clock className="w-5 h-5" />
                  <span>حالة التكامل: <strong>مؤجل</strong></span>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 opacity-60">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">SMTP Host</label>
                  <input type="text" placeholder="smtp.example.com" className="input-field" disabled />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">SMTP Port</label>
                  <input type="text" placeholder="587" className="input-field" disabled />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">SMTP Username</label>
                  <input type="text" placeholder="username" className="input-field" disabled />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">From Email</label>
                  <input type="email" placeholder="noreply@azm.sa" className="input-field" disabled />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">From Name</label>
                  <input type="text" placeholder="عزم اللوجستية" className="input-field" disabled />
                </div>
              </div>
              
              <h4 className="font-medium text-gray-700 mt-6 mb-4">قوالب البريد</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 opacity-60">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">قالب إنشاء مهمة جديدة</label>
                  <textarea className="input-field min-h-[80px]" placeholder="نص القالب..." disabled />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">قالب اعتماد مهمة</label>
                  <textarea className="input-field min-h-[80px]" placeholder="نص القالب..." disabled />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">قالب رفض مهمة</label>
                  <textarea className="input-field min-h-[80px]" placeholder="نص القالب..." disabled />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">قالب تقرير نهاية اليوم</label>
                  <textarea className="input-field min-h-[80px]" placeholder="نص القالب..." disabled />
                </div>
              </div>
              
              <div className="mt-6 flex justify-end">
                <button disabled className="btn-secondary flex items-center gap-2 opacity-50 cursor-not-allowed">
                  <Mail className="w-4 h-4" />
                  اختبار الإرسال - سيتم تفعيله لاحقًا
                </button>
              </div>
            </div>
          </div>
        )}

        {/* WhatsApp Settings (Disabled) */}
        {activeTab === 'whatsapp' && (
          <div className="space-y-4">
            <div className="card">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-azm-green" />
                  إعدادات الواتساب
                </h3>
                <span className="badge badge-amber">مؤجل - سيتم تفعيله لاحقًا</span>
              </div>
              
              <div className="p-6 bg-gray-50 rounded-xl mb-6">
                <div className="flex items-center gap-3 text-gray-600">
                  <Clock className="w-5 h-5" />
                  <span>حالة التكامل: <strong>مؤجل</strong></span>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 opacity-60">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">مزود الخدمة المستقبلي</label>
                  <select className="input-field" disabled>
                    <option>سيتم تحديده لاحقًا</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">رقم واتساب الشركة</label>
                  <input type="tel" placeholder="+966XXXXXXXXX" className="input-field" disabled />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">رقم المدير العام</label>
                  <input type="tel" placeholder="+966XXXXXXXXX" className="input-field" disabled />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">رقم مدير العمليات</label>
                  <input type="tel" placeholder="+966XXXXXXXXX" className="input-field" disabled />
                </div>
              </div>
              
              <h4 className="font-medium text-gray-700 mt-6 mb-4">قوالب الرسائل</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 opacity-60">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">قالب تنبيه مهمة جديدة</label>
                  <textarea className="input-field min-h-[80px]" placeholder="نص القالب..." disabled />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">قالب تذكير يومي</label>
                  <textarea className="input-field min-h-[80px]" placeholder="نص القالب..." disabled />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">قالب اعتماد مهمة</label>
                  <textarea className="input-field min-h-[80px]" placeholder="نص القالب..." disabled />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">قالب رفض مهمة</label>
                  <textarea className="input-field min-h-[80px]" placeholder="نص القالب..." disabled />
                </div>
              </div>
              
              <div className="mt-6 flex justify-end">
                <button disabled className="btn-secondary flex items-center gap-2 opacity-50 cursor-not-allowed">
                  <MessageSquare className="w-4 h-4" />
                  اختبار واتساب - سيتم تفعيله لاحقًا
                </button>
              </div>
            </div>
          </div>
        )}

        {/* General Settings */}
        {activeTab === 'general' && (
          <div className="space-y-4">
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-800 mb-6 flex items-center gap-2">
                <Globe className="w-5 h-5 text-azm-green" />
                الإعدادات العامة
              </h3>
              
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="p-4 bg-gray-50 rounded-xl">
                    <div className="flex items-center gap-3 mb-2">
                      <Globe className="w-5 h-5 text-gray-400" />
                      <span className="font-medium text-gray-700">لغة النظام</span>
                    </div>
                    <p className="text-gray-600">العربية فقط</p>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-xl">
                    <div className="flex items-center gap-3 mb-2">
                      <Globe className="w-5 h-5 text-gray-400" />
                      <span className="font-medium text-gray-700">اتجاه النظام</span>
                    </div>
                    <p className="text-gray-600">RTL (من اليمين لليسار)</p>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-xl">
                    <div className="flex items-center gap-3 mb-2">
                      <Clock className="w-5 h-5 text-gray-400" />
                      <span className="font-medium text-gray-700">المنطقة الزمنية</span>
                    </div>
                    <p className="text-gray-600">Asia/Riyadh (AST)</p>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-xl">
                    <div className="flex items-center gap-3 mb-2">
                      <Smartphone className="w-5 h-5 text-gray-400" />
                      <span className="font-medium text-gray-700">وضع التطبيق</span>
                    </div>
                    <p className="text-gray-600">PWA - تطبيق ويب تقدمي</p>
                  </div>
                </div>
                
                <div className="border-t border-gray-200 pt-6">
                  <h4 className="font-medium text-gray-700 mb-4">حالة التكاملات</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Mail className="w-5 h-5 text-amber-500" />
                        <span className="font-medium text-amber-700">البريد الإلكتروني</span>
                      </div>
                      <span className="badge badge-amber">مؤجل</span>
                    </div>
                    <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <MessageSquare className="w-5 h-5 text-amber-500" />
                        <span className="font-medium text-amber-700">واتساب الأعمال</span>
                      </div>
                      <span className="badge badge-amber">مؤجل</span>
                    </div>
                  </div>
                </div>
                
                <div className="p-4 bg-green-50 rounded-xl border border-green-200">
                  <p className="text-sm text-green-700">
                    <strong>ملاحظة:</strong> نظام عزم للإنجاز والتشغيل يعمل بدون الحاجة للبريد الإلكتروني أو الواتساب.
                    جميع الإشعارات تظهر داخل التطبيق.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}