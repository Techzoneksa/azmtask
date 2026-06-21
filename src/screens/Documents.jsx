import { useData } from '../context/DataContext';
import { 
  FileText, 
  CheckCircle,
  Clock
} from 'lucide-react';

export default function Documents() {
  const { data } = useData();

  const documentsList = data.documents || [
    { id: 'doc-1', name: 'السجل التجاري', status: 'pending', icon: '📄' },
    { id: 'doc-2', name: 'نشاط الشركة', status: 'completed', icon: '✓' },
    { id: 'doc-3', name: 'العنوان الوطني', status: 'in-progress', icon: '📍' },
    { id: 'doc-4', name: 'الرقم الضريبي', status: 'pending', icon: '🔢' },
    { id: 'doc-5', name: 'بيانات المالك أو المفوض', status: 'completed', icon: '👤' },
    { id: 'doc-6', name: 'البريد الرسمي', status: 'pending', icon: '📧' },
    { id: 'doc-7', name: 'رقم الجوال الرسمي', status: 'completed', icon: '📱' },
    { id: 'doc-8', name: 'شعار الشركة', status: 'in-progress', icon: '🎨' },
    { id: 'doc-9', name: 'ختم الشركة', status: 'pending', icon: '🔏' },
    { id: 'doc-10', name: 'ملف تعريفي', status: 'pending', icon: '📋' }
  ];

  const getStatusInfo = (status) => {
    const statusMap = {
      'completed': { label: 'تم', badgeClass: 'badge-completed', icon: CheckCircle },
      'in-progress': { label: 'قيد التجهيز', badgeClass: 'badge-in-progress', icon: Clock },
      'pending': { label: 'معلق', badgeClass: 'badge-delayed', icon: Clock }
    };
    return statusMap[status] || statusMap['pending'];
  };

  const completedCount = documentsList.filter(d => d.status === 'completed').length;
  const totalCount = documentsList.length;
  const progress = Math.round((completedCount / totalCount) * 100);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-blue-500 rounded-xl flex items-center justify-center">
          <FileText className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-slate-100">المستندات والسجلات</h1>
          <p className="text-gray-500 dark:text-slate-400">متابعة المستندات المطلوبة</p>
        </div>
      </div>

      {/* Progress */}
      <div className="card-glass dark:bg-slate-800/80 dark:border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800 dark:text-slate-200">نسبة الإنجاز</h3>
          <span className="text-2xl font-bold text-azm-green">{progress}%</span>
        </div>
        <div className="progress-bar h-3 mb-4 dark:bg-slate-700">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex items-center justify-between text-sm text-gray-500 dark:text-slate-400">
          <span>{completedCount} مستند مكتمل</span>
          <span>{totalCount - completedCount} مستند متبقي</span>
        </div>
      </div>

      {/* Documents Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {documentsList.map(doc => {
          const statusInfo = getStatusInfo(doc.status);
          const StatusIcon = statusInfo.icon;
          
          return (
            <div key={doc.id} className="card dark:bg-slate-800 dark:border-slate-700">
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${
                  doc.status === 'completed' ? 'bg-green-100 dark:bg-green-900/40' :
                  doc.status === 'in-progress' ? 'bg-orange-100 dark:bg-orange-900/40' : 'bg-gray-100 dark:bg-slate-700'
                }`}>
                  {doc.icon}
                </div>
                
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-gray-800 dark:text-slate-100">{doc.name}</h3>
                    <span className={`badge ${statusInfo.badgeClass}`}>
                      <StatusIcon className="w-3 h-3 ml-1" />
                      {statusInfo.label}
                    </span>
                  </div>
                  
                  {doc.status === 'in-progress' && (
                    <div className="mt-3">
                      <div className="progress-bar h-1.5 dark:bg-slate-700">
                        <div className="progress-fill" style={{ width: '60%' }} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Email & WhatsApp Notice */}
      <div className="card bg-gray-50 dark:bg-slate-800 dark:border-slate-700 border-dashed border-2 border-gray-200 dark:border-slate-600">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gray-200 dark:bg-slate-700 rounded-xl flex items-center justify-center">
            <span className="text-2xl">📧</span>
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-gray-600 dark:text-slate-300">البريد الإلكتروني</h3>
            <p className="text-sm text-gray-400 dark:text-slate-500">مؤجل للمرحلة الأخيرة</p>
          </div>
          <span className="badge badge-delayed">مؤجل</span>
        </div>
      </div>

      <div className="card bg-gray-50 dark:bg-slate-800 dark:border-slate-700 border-dashed border-2 border-gray-200 dark:border-slate-600">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gray-200 dark:bg-slate-700 rounded-xl flex items-center justify-center">
            <span className="text-2xl">💬</span>
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-gray-600 dark:text-slate-300">واتساب الأعمال</h3>
            <p className="text-sm text-gray-400 dark:text-slate-500">مؤجل لمرحلة لاحقة</p>
          </div>
          <span className="badge badge-delayed">مؤجل</span>
        </div>
      </div>
    </div>
  );
}