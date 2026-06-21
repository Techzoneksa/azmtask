import { useState } from 'react';
import { useAuth, useData } from '../context/AuthContext';
import { 
  BarChart3, 
  Calendar,
  CheckCircle,
  AlertTriangle,
  Clock,
  FileText,
  TrendingUp,
  Users,
  AlertCircle
} from 'lucide-react';

export default function Reports() {
  const { user } = useAuth();
  const { data } = useData();
  const [selectedReport, setSelectedReport] = useState('today');

  const getTasksByStatus = (status) => {
    return data.tasks?.filter(t => t.status === status) || [];
  };

  const getDelayedTasks = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return data.tasks?.filter(t => {
      const due = new Date(t.dueDate);
      due.setHours(0, 0, 0, 0);
      return due < today && t.status !== 'completed';
    }) || [];
  };

  const getStageProgress = () => {
    return data.stages?.map(stage => {
      const stageTasks = data.tasks?.filter(t => t.stageId === stage.id) || [];
      const completed = stageTasks.filter(t => t.status === 'completed').length;
      const progress = stageTasks.length > 0 
        ? Math.round(stageTasks.reduce((sum, t) => sum + t.progress, 0) / stageTasks.length)
        : 0;
      return { ...stage, total: stageTasks.length, completed, progress };
    }) || [];
  };

  const getTodayReport = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayTasks = data.tasks?.filter(t => {
      const due = new Date(t.dueDate);
      due.setHours(0, 0, 0, 0);
      return due.getTime() <= today.getTime();
    }) || [];
    
    const completed = todayTasks.filter(t => t.status === 'completed').length;
    const inProgress = todayTasks.filter(t => t.status === 'in-progress').length;
    const pending = todayTasks.filter(t => t.status === 'pending-review').length;
    const delayed = todayTasks.filter(t => {
      const due = new Date(t.dueDate);
      due.setHours(0, 0, 0, 0);
      return due < today && t.status !== 'completed';
    }).length;
    
    return { total: todayTasks.length, completed, inProgress, pending, delayed };
  };

  const getWeekReport = () => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const weekTasks = data.tasks?.filter(t => 
      new Date(t.createdAt) >= weekAgo
    ) || [];
    
    const completed = weekTasks.filter(t => t.status === 'completed').length;
    
    return { total: weekTasks.length, completed };
  };

  const reportTypes = [
    { id: 'today', label: 'تقرير اليوم', icon: Calendar },
    { id: 'week', label: 'تقرير الأسبوع', icon: TrendingUp },
    { id: 'stages', label: 'تقرير المراحل', icon: BarChart3 },
    { id: 'delayed', label: 'تقرير المتأخرات', icon: AlertTriangle },
    { id: 'obstacles', label: 'تقرير المعوقات', icon: AlertCircle },
    { id: 'attendance', label: 'تقرير الحضور', icon: Users }
  ];

  const renderReport = () => {
    switch (selectedReport) {
      case 'today':
        const todayData = getTodayReport();
        return (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-gray-800">تقرير اليوم</h3>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="card text-center">
                <div className="text-3xl font-bold text-gray-700">{todayData.total}</div>
                <div className="text-sm text-gray-500">إجمالي المهام</div>
              </div>
              <div className="card text-center">
                <div className="text-3xl font-bold text-green-600">{todayData.completed}</div>
                <div className="text-sm text-gray-500">مكتمل</div>
              </div>
              <div className="card text-center">
                <div className="text-3xl font-bold text-orange-600">{todayData.inProgress}</div>
                <div className="text-sm text-gray-500">قيد التنفيذ</div>
              </div>
              <div className="card text-center">
                <div className="text-3xl font-bold text-red-600">{todayData.delayed}</div>
                <div className="text-sm text-gray-500">متأخر</div>
              </div>
            </div>
            
            <div className="card">
              <h4 className="font-medium text-gray-800 mb-4">نسبة الإنجاز</h4>
              <div className="flex items-center gap-4">
                <div className="flex-1 progress-bar h-4">
                  <div className="progress-fill" style={{ width: `${todayData.total > 0 ? (todayData.completed / todayData.total) * 100 : 0}%` }} />
                </div>
                <span className="text-xl font-bold text-azm-green">
                  {todayData.total > 0 ? Math.round((todayData.completed / todayData.total) * 100) : 0}%
                </span>
              </div>
            </div>
          </div>
        );

      case 'week':
        const weekData = getWeekReport();
        return (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-gray-800">تقرير الأسبوع</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="card text-center">
                <div className="text-3xl font-bold text-blue-600">{weekData.total}</div>
                <div className="text-sm text-gray-500">مهمة تم إنشاؤها</div>
              </div>
              <div className="card text-center">
                <div className="text-3xl font-bold text-green-600">{weekData.completed}</div>
                <div className="text-sm text-gray-500">مهمة مكتملة</div>
              </div>
            </div>
          </div>
        );

      case 'stages':
        const stageProgress = getStageProgress();
        return (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-gray-800">تقرير المراحل</h3>
            
            <div className="space-y-4">
              {stageProgress.map(stage => (
                <div key={stage.id} className="card">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: stage.color + '20' }}>
                        <span className="font-bold" style={{ color: stage.color }}>{stage.order}</span>
                      </div>
                      <span className="font-medium text-gray-800">{stage.name}</span>
                    </div>
                    <span className="font-bold" style={{ color: stage.color }}>{stage.progress}%</span>
                  </div>
                  <div className="progress-bar h-2 mb-2">
                    <div className="progress-fill" style={{ width: `${stage.progress}%`, backgroundColor: stage.color }} />
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <span>{stage.total} مهمة</span>
                    <span className="text-green-600">{stage.completed} مكتمل</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      case 'delayed':
        const delayedTasks = getDelayedTasks();
        return (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-gray-800">تقرير المهام المتأخرة</h3>
            
            <div className="card">
              <div className="text-center mb-6">
                <div className="text-4xl font-bold text-red-500">{delayedTasks.length}</div>
                <div className="text-sm text-gray-500">مهمة متأخرة</div>
              </div>
              
              <div className="space-y-3">
                {delayedTasks.slice(0, 10).map(task => (
                  <div key={task.id} className="p-3 bg-red-50 rounded-xl">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-800">{task.title}</span>
                      <span className="badge badge-red text-xs">متأخر</span>
                    </div>
                  </div>
                ))}
                {delayedTasks.length > 10 && (
                  <p className="text-center text-gray-400 text-sm">و {delayedTasks.length - 10} مهام أخرى...</p>
                )}
                {delayedTasks.length === 0 && (
                  <p className="text-center text-green-500 py-4">لا توجد مهام متأخرة</p>
                )}
              </div>
            </div>
          </div>
        );

      case 'obstacles':
        const openObstacles = data.obstacles?.filter(o => o.status === 'open') || [];
        const resolvedObstacles = data.obstacles?.filter(o => o.status === 'resolved') || [];
        
        return (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-gray-800">تقرير المعوقات</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="card text-center">
                <div className="text-3xl font-bold text-red-600">{openObstacles.length}</div>
                <div className="text-sm text-gray-500">معوقات مفتوحة</div>
              </div>
              <div className="card text-center">
                <div className="text-3xl font-bold text-green-600">{resolvedObstacles.length}</div>
                <div className="text-sm text-gray-500">تم حلها</div>
              </div>
            </div>
            
            {openObstacles.length > 0 && (
              <div className="card">
                <h4 className="font-medium text-red-600 mb-4">المعوقات المفتوحة</h4>
                <div className="space-y-3">
                  {openObstacles.map(obs => (
                    <div key={obs.id} className="p-3 bg-red-50 rounded-xl">
                      <p className="font-medium text-gray-800">{obs.title}</p>
                      <p className="text-sm text-gray-500">{obs.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );

      case 'attendance':
        const attendance = data.attendance || [];
        const totalHours = attendance.reduce((sum, a) => sum + (a.totalHours || 0), 0);
        
        return (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-gray-800">تقرير الحضور والانصراف</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="card text-center">
                <div className="text-3xl font-bold text-blue-600">{attendance.length}</div>
                <div className="text-sm text-gray-500">سجل حضور</div>
              </div>
              <div className="card text-center">
                <div className="text-3xl font-bold text-green-600">{totalHours}</div>
                <div className="text-sm text-gray-500">إجمالي الساعات</div>
              </div>
            </div>
            
            <div className="card">
              <h4 className="font-medium text-gray-800 mb-4">آخر السجلات</h4>
              <div className="space-y-3">
                {attendance.slice(0, 5).map(record => (
                  <div key={record.id} className="p-3 bg-gray-50 rounded-xl">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-800">{record.userName}</span>
                      <span className="text-sm text-gray-500">{record.totalHours} ساعة</span>
                    </div>
                  </div>
                ))}
                {attendance.length === 0 && (
                  <p className="text-center text-gray-400 py-4">لا يوجد سجل حضور</p>
                )}
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-purple-500 rounded-xl flex items-center justify-center">
          <BarChart3 className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">التقارير</h1>
          <p className="text-gray-500">عرض和分析 البيانات</p>
        </div>
      </div>

      {/* Report Types */}
      <div className="overflow-x-auto -mx-4 px-4 hide-scrollbar">
        <div className="flex gap-2 min-w-max">
          {reportTypes.map(report => {
            const Icon = report.icon;
            return (
              <button
                key={report.id}
                onClick={() => setSelectedReport(report.id)}
                className={`flex items-center gap-2 px-4 py-3 rounded-xl font-medium transition-all ${
                  selectedReport === report.id
                    ? 'bg-azm-green text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Icon className="w-5 h-5" />
                {report.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Report Content */}
      <div className="card">
        {renderReport()}
      </div>
    </div>
  );
}