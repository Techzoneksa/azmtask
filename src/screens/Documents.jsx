import { useState } from 'react';
import { useAuth, useData } from '../context/AuthContext';
import { 
  FileText, 
  CheckCircle,
  Clock,
  AlertTriangle,
  Upload,
  X
} from 'lucide-react';

export default function Documents() {
  const { user } = useAuth();
  const { data, updateData } = useData();
  const [showAddModal, setShowAddModal] = useState(false);

  const documentsList = [
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
      'completed': { label: 'تم', color: 'bg-green-100 text-green-700', icon: CheckCircle },
      'in-progress': { label: 'قيد التجهيز', color: 'bg-orange-100 text-orange-700', icon: Clock },
      'pending': { label: 'معلق', color: 'bg-gray-100 text-gray-600', icon: Clock }
    };
    return statusMap[status] || statusMap['pending'];
  };

  const completedCount = documentsList.filter(d => d.status === 'completed').length;
  const totalCount = documentsList.length;
  const progress = Math.round((completedCount / totalCount) * 100);

  const documentsWithTasks = documentsList.map(doc => {
    const relatedTasks = data.tasks?.filter(t => 
      t.title.toLowerCase().includes(doc.name.toLowerCase()) ||
      doc.name.includes('شعار') && t.title.includes('شعار') ||
      doc.name.includes('ختم') && t.title.includes('ختم')
    ) || [];
    
    return { ...doc, tasks: relatedTasks };
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-blue-500 rounded-xl flex items-center justify-center">
          <FileText className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">المستندات والسجلات</h1>
          <p className="text-gray-500">متابعة المستندات المطلوبة</p>
        </div>
      </div>

      {/* Progress */}
      <div className="card-glass">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800">نسبة الإنجاز</h3>
          <span className="text-2xl font-bold text-azm-green">{progress}%</span>
        </div>
        <div className="progress-bar h-3 mb-4">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>{completedCount} مستند مكتمل</span>
          <span>{totalCount - completedCount} مستند متبقي</span>
        </div>
      </div>

      {/* Documents Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {documentsWithTasks.map(doc => {
          const statusInfo = getStatusInfo(doc.status);
          const StatusIcon = statusInfo.icon;
          
          return (
            <div key={doc.id} className="card">
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${
                  doc.status === 'completed' ? 'bg-green-100' :
                  doc.status === 'in-progress' ? 'bg-orange-100' : 'bg-gray-100'
                }`}>
                  {doc.icon}
                </div>
                
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-gray-800">{doc.name}</h3>
                    <span className={`badge ${statusInfo.color}`}>
                      <StatusIcon className="w-3 h-3 ml-1" />
                      {statusInfo.label}
                    </span>
                  </div>
                  
                  {doc.tasks.length > 0 && (
                    <div className="text-sm text-gray-500">
                      {doc.tasks.length} مهمة مرتبطة
                    </div>
                  )}
                  
                  {doc.status === 'in-progress' && (
                    <div className="mt-3">
                      <div className="progress-bar h-1.5">
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
      <div className="card bg-gray-50 border-dashed border-2 border-gray-200">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gray-200 rounded-xl flex items-center justify-center">
            <span className="text-2xl">📧</span>
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-gray-600">البريد الإلكتروني</h3>
            <p className="text-sm text-gray-400">مؤجل للمرحلة الأخيرة</p>
          </div>
          <span className="badge badge-gray">مؤجل</span>
        </div>
      </div>

      <div className="card bg-gray-50 border-dashed border-2 border-gray-200">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gray-200 rounded-xl flex items-center justify-center">
            <span className="text-2xl">💬</span>
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-gray-600">واتساب الأعمال</h3>
            <p className="text-sm text-gray-400">مؤجل لمرحلة لاحقة</p>
          </div>
          <span className="badge badge-gray">مؤجل</span>
        </div>
      </div>
    </div>
  );
}