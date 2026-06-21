import { useState } from 'react';
import { useData } from '../context/DataContext';
import { 
  BarChart3, 
  Calendar,
  CheckCircle,
  AlertTriangle,
  Clock,
  TrendingUp,
  Users,
  AlertCircle
} from 'lucide-react';

export default function Reports() {
  const { data } = useData();
  const [selectedReport, setSelectedReport] = useState('today');

  const getDelayedTasks = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return data.tasks?.filter(t => {
      const due = new Date(t.due_date);
      due.setHours(0, 0, 0, 0);
      return due < today && t.status !== 'completed';
    }) || [];
  };

  const getStageProgress = () => {
    return data.stages.map(stage => {
      const stageTasks = data.tasks?.filter(t => t.phase_id === stage.id) || [];
      const completed = stageTasks.filter(t => t.status === 'completed').length;
      const progress = stageTasks.length > 0 
        ? Math.round(stageTasks.reduce((sum, t) => sum + t.progress, 0) / stageTasks.length)
        : 0;
      return { ...stage, total: stageTasks.length, completed, progress };
    });
  };

  const getTodayReport = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayTasks = data.tasks?.filter(t => {
      const due = new Date(t.due_date);
      due.setHours(0, 0, 0, 0);
      return due.getTime() <= today.getTime();
    }) || [];
    
    const completed = todayTasks.filter(t => t.status === 'completed').length;
    const inProgress = todayTasks.filter(t => t.status === 'in-progress').length;
    const pending = todayTasks.filter(t => t.status === 'pending-review').length;
    const delayed = getDelayedTasks().length;
    
    return { total: todayTasks.length, completed, inProgress, pending, delayed };
  };

  const reportTypes = [
    { id: 'today', label: 'تقرير اليوم', icon: Calendar },
    { id: 'stages', label: 'تقرير المراحل', icon: BarChart3 },
    { id: 'delayed', label: 'تقرير المتأخرات', icon: AlertTriangle },
    { id: 'obstacles', label: 'تقرير التحديات التشغيلية', icon: AlertCircle }
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
                      <div 
                        className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold"
                        style={{ backgroundColor: stage.color }}
                      >
                        {stage.order}
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
        const openObstacles = data.blockers?.filter(o => o.status === 'open') || [];
        const resolvedObstacles = data.blockers?.filter(o => o.status === 'resolved') || [];
        
        return (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-gray-800">تقرير التحديات التشغيلية</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="card text-center">
                <div className="text-3xl font-bold text-red-600">{openObstacles.length}</div>
                <div className="text-sm text-gray-500">تحديات تشغيلية مفتوحة</div>
              </div>
              <div className="card text-center">
                <div className="text-3xl font-bold text-green-600">{resolvedObstacles.length}</div>
                <div className="text-sm text-gray-500">تم حلها</div>
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
          <p className="text-gray-500">عرض وتحليل البيانات</p>
        </div>
      </div>

      {/* Report Types */}
      <div className="flex gap-2 flex-wrap">
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

      {/* Report Content */}
      <div className="card">
        {renderReport()}
      </div>
    </div>
  );
}