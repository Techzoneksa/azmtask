import { useState } from 'react';
import { useAuth, useData } from '../context/AuthContext';
import { 
  Settings, 
  Building,
  Users,
  Tag,
  Layers,
  Mail,
  MessageSquare,
  Save
} from 'lucide-react';

export default function SettingsPage() {
  const { user } = useAuth();
  const { data, updateData } = useData();
  const [activeTab, setActiveTab] = useState('company');
  const [saved, setSaved] = useState(false);

  const [companyData, setCompanyData] = useState({
    name: data.companySettings?.name || 'عزم اللوجستية',
    address: data.companySettings?.address || '',
    phone: data.companySettings?.phone || '',
    email: data.companySettings?.email || ''
  });

  const handleSaveCompany = () => {
    updateData({
      ...data,
      companySettings: companyData
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const tabs = [
    { id: 'company', label: 'بيانات الشركة', icon: Building },
    { id: 'users', label: 'المستخدمون', icon: Users },
    { id: 'stages', label: 'المراحل', icon: Layers },
    { id: 'categories', label: 'التصنيفات', icon: Tag },
    { id: 'email', label: 'البريد الإلكتروني', icon: Mail, disabled: true },
    { id: 'whatsapp', label: 'الواتساب', icon: MessageSquare, disabled: true }
  ];

  const isDirector = user.role === 'director';

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-gray-700 rounded-xl flex items-center justify-center">
          <Settings className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">الإعدادات</h1>
          <p className="text-gray-500">إدارة النظام والإعدادات</p>
        </div>
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
                    ? 'bg-azm-green text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Icon className="w-5 h-5" />
                {tab.label}
                {tab.disabled && (
                  <span className="text-xs bg-gray-200 px-2 py-0.5 rounded-full mr-2">مؤجل</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="card">
        {activeTab === 'company' && (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-gray-800">بيانات الشركة</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">اسم الشركة</label>
                <input
                  type="text"
                  value={companyData.name}
                  onChange={(e) => setCompanyData({ ...companyData, name: e.target.value })}
                  className="input-field"
                  disabled={!isDirector}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">العنوان</label>
                <input
                  type="text"
                  value={companyData.address}
                  onChange={(e) => setCompanyData({ ...companyData, address: e.target.value })}
                  className="input-field"
                  disabled={!isDirector}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">رقم الجوال</label>
                <input
                  type="text"
                  value={companyData.phone}
                  onChange={(e) => setCompanyData({ ...companyData, phone: e.target.value })}
                  className="input-field"
                  disabled={!isDirector}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">البريد الإلكتروني</label>
                <input
                  type="email"
                  value={companyData.email}
                  onChange={(e) => setCompanyData({ ...companyData, email: e.target.value })}
                  className="input-field"
                  disabled={!isDirector}
                />
              </div>
              
              {isDirector && (
                <button onClick={handleSaveCompany} className="btn-primary flex items-center gap-2">
                  <Save className="w-4 h-4" />
                  {saved ? 'تم الحفظ!' : 'حفظ التغييرات'}
                </button>
              )}
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-gray-800">المستخدمون</h3>
            
            <div className="space-y-4">
              {data.users?.map(userItem => (
                <div key={userItem.id} className="p-4 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-azm-green text-white flex items-center justify-center text-lg font-bold">
                      {userItem.name.charAt(0)}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-800">{userItem.name}</h4>
                      <p className="text-sm text-gray-500">{userItem.email}</p>
                      <span className={`badge ${
                        userItem.role === 'director' ? 'badge-green' : 'badge-gray'
                      } text-xs mt-1`}>
                        {userItem.position}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="p-4 bg-blue-50 rounded-xl">
              <p className="text-sm text-blue-700">
                <strong>ملاحظة:</strong> لا يمكن إضافة مستخدمين جدد في الوقت الحالي. النظام مخصص للاستخدام الداخلي فقط.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'stages' && (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-gray-800">مراحل العمل</h3>
            
            <div className="space-y-3">
              {data.stages?.map(stage => (
                <div key={stage.id} className="p-4 bg-gray-50 rounded-xl flex items-center gap-4">
                  <div 
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold"
                    style={{ backgroundColor: stage.color }}
                  >
                    {stage.order}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-800">{stage.name}</h4>
                    <p className="text-sm text-gray-500">
                      {data.tasks?.filter(t => t.stageId === stage.id).length || 0} مهمة
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'categories' && (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-gray-800">التصنيفات</h3>
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {data.categories?.map(cat => (
                <div key={cat.id} className="p-4 bg-gray-50 rounded-xl text-center">
                  <div 
                    className="w-8 h-8 rounded-full mx-auto mb-2"
                    style={{ backgroundColor: cat.color + '30' }}
                  >
                    <div className="w-full h-full rounded-full" style={{ backgroundColor: cat.color }} />
                  </div>
                  <span className="font-medium text-gray-800">{cat.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {(activeTab === 'email' || activeTab === 'whatsapp') && (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-200 rounded-full mx-auto mb-4 flex items-center justify-center">
              <Mail className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="font-semibold text-gray-600 mb-2">
              {activeTab === 'email' ? 'البريد الإلكتروني' : 'الواتساب'}
            </h3>
            <p className="text-gray-400">
              {activeTab === 'email' 
                ? 'البريد الإلكتروني مؤجل للمرحلة الأخيرة'
                : 'واتساب الأعمال مؤجل لمرحلة لاحقة'}
            </p>
            <span className="badge badge-gray mt-4">مؤجل</span>
          </div>
        )}
      </div>
    </div>
  );
}