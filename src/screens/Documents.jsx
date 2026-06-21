import { useData } from '../context/DataContext';
import StatCard from '../components/StatCard';
import EmptyState from '../components/EmptyState';
import { 
  FileText, 
  CheckCircle,
  Clock,
  Calendar,
  AlertCircle,
  Mail,
  MessageSquare
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
      'completed': { label: 'تم', badgeClass: 'badge-completed', icon: CheckCircle, color: '#15803D', bg: '#DCFCE7' },
      'in-progress': { label: 'قيد التجهيز', badgeClass: 'badge-in-progress', icon: Clock, color: '#B45309', bg: '#FEF3C7' },
      'pending': { label: 'معلق', badgeClass: 'badge-delayed', icon: Clock, color: '#475569', bg: '#F1F5F9' }
    };
    return statusMap[status] || statusMap['pending'];
  };

  const completedCount = documentsList.filter(d => d.status === 'completed').length;
  const inProgressCount = documentsList.filter(d => d.status === 'in-progress').length;
  const pendingCount = documentsList.filter(d => d.status === 'pending').length;
  const totalCount = documentsList.length;
  const progress = Math.round((completedCount / totalCount) * 100);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-blue-500 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20">
          <FileText className="w-7 h-7 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">المستندات والسجلات</h1>
          <p className="text-slate-500 dark:text-slate-400">متابعة المستندات المطلوبة</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={FileText}
          label="إجمالي المستندات"
          value={totalCount}
          color="#0369A1"
          bgColor="#E0F2FE"
        />
        <StatCard
          icon={CheckCircle}
          label="مكتمل"
          value={completedCount}
          color="#15803D"
          bgColor="#DCFCE7"
        />
        <StatCard
          icon={Clock}
          label="قيد التجهيز"
          value={inProgressCount}
          color="#B45309"
          bgColor="#FEF3C7"
        />
        <StatCard
          icon={AlertCircle}
          label="معلق"
          value={pendingCount}
          color="#475569"
          bgColor="#F1F5F9"
        />
      </div>

      {/* Overall Progress */}
      <div className="card-glass">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <FileText className="w-5 h-5 text-azm-green" />
            نسبة الإنجاز الكلية
          </h3>
          <span className="text-2xl font-bold text-azm-green">{progress}%</span>
        </div>
        <div className="h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-700"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-sm text-slate-500">
          <span>{completedCount} مستند مكتمل</span>
          <span>{pendingCount} مستند متبقي</span>
        </div>
      </div>

      {/* Documents Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {documentsList.map((doc, index) => {
          const statusInfo = getStatusInfo(doc.status);
          const StatusIcon = statusInfo.icon;
          const isEven = index % 2 === 0;
          
          return (
            <div 
              key={doc.id} 
              className={`card hover:shadow-lg transition-all cursor-pointer ${
                doc.status === 'completed' 
                  ? 'border-green-200 dark:border-green-900/30' 
                  : doc.status === 'in-progress' 
                    ? 'border-orange-200 dark:border-orange-900/30' 
                    : 'border-slate-200 dark:border-slate-700'
              }`}
              style={{ borderRightWidth: '4px', borderRightColor: statusInfo.color }}
            >
              <div className="flex items-start gap-4">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 ${
                  doc.status === 'completed' 
                    ? 'bg-green-100 dark:bg-green-900/40' 
                    : doc.status === 'in-progress' 
                      ? 'bg-orange-100 dark:bg-orange-900/40' 
                      : 'bg-slate-100 dark:bg-slate-700'
                }`}>
                  {doc.icon}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100">{doc.name}</h3>
                    <span className={`badge flex-shrink-0 ${statusInfo.badgeClass}`}>
                      <StatusIcon className="w-3.5 h-3.5 ml-1" />
                      {statusInfo.label}
                    </span>
                  </div>
                  
                  {doc.status === 'in-progress' && (
                    <div className="mb-3">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-slate-500">التقدم</span>
                        <span className="font-medium text-orange-600">60%</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-orange-400 to-orange-500 rounded-full" style={{ width: '60%' }} />
                      </div>
                    </div>
                  )}
                  
                  {doc.status === 'completed' && (
                    <div className="flex items-center gap-2 text-sm text-green-600">
                      <CheckCircle className="w-4 h-4" />
                      <span>تم التجهيز</span>
                    </div>
                  )}
                  
                  {doc.status === 'pending' && (
                    <div className="flex items-center gap-2 text-sm text-slate-400">
                      <Clock className="w-4 h-4" />
                      <span>في الانتظار</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Email & WhatsApp Notice - Postponed */}
      <div className="space-y-4">
        <div className="card bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 border-dashed">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-slate-200 dark:bg-slate-700 rounded-2xl flex items-center justify-center">
              <Mail className="w-7 h-7 text-slate-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-slate-600 dark:text-slate-300">البريد الإلكتروني</h3>
              <p className="text-sm text-slate-400 dark:text-slate-500">مؤجل للمرحلة الأخيرة</p>
            </div>
            <span className="badge badge-delayed">مؤجل</span>
          </div>
        </div>

        <div className="card bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 border-dashed">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-slate-200 dark:bg-slate-700 rounded-2xl flex items-center justify-center">
              <MessageSquare className="w-7 h-7 text-slate-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-slate-600 dark:text-slate-300">واتساب الأعمال</h3>
              <p className="text-sm text-slate-400 dark:text-slate-500">مؤجل لمرحلة لاحقة</p>
            </div>
            <span className="badge badge-delayed">مؤجل</span>
          </div>
        </div>
      </div>
    </div>
  );
}