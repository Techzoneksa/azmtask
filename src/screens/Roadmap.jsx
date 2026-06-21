import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { useFeedback } from '../context/FeedbackContext';
import PhaseEditModal from '../components/PhaseEditModal';
import EmptyState from '../components/EmptyState';
import StatCard from '../components/StatCard';
import { 
  Map, 
  CheckCircle,
  Clock,
  AlertTriangle,
  FileText,
  Building,
  Truck,
  Users,
  Monitor,
  ClipboardList,
  FileSignature,
  Palette,
  PlayCircle,
  Rocket,
  Stamp,
  ChevronLeft,
  Pencil,
  ArrowRight,
  Target,
  BarChart3
} from 'lucide-react';

const iconMap = {
  FileText,
  Stamp,
  Building,
  Truck,
  Users,
  Monitor,
  ClipboardList,
  FileSignature,
  Palette,
  PlayCircle,
  Rocket
};

const STATUS_COLORS = {
  'completed': '#15803D',
  'in-progress': '#4338CA',
  'not-started': '#64748B',
  'delayed': '#F97316',
  'blocked': '#BE123C'
};

export default function Roadmap() {
  const { data } = useData();
  const { success } = useFeedback();
  const [selectedStage, setSelectedStage] = useState(null);
  const [editingPhase, setEditingPhase] = useState(null);

  const getStageStats = (stageId) => {
    const stageTasks = data.tasks.filter(t => t.phase_id === stageId);
    const completed = stageTasks.filter(t => t.status === 'completed').length;
    const inProgress = stageTasks.filter(t => t.status === 'in-progress').length;
    const delayed = stageTasks.filter(t => t.status === 'blocked' || t.status === 'delayed').length;
    const progress = stageTasks.length > 0 
      ? Math.round(stageTasks.reduce((sum, t) => sum + t.progress, 0) / stageTasks.length)
      : 0;
    
    let status = 'not-started';
    if (completed === stageTasks.length && stageTasks.length > 0) status = 'completed';
    else if (inProgress > 0 || delayed > 0) status = delayed > 0 ? 'delayed' : 'in-progress';
    else if (completed > 0) status = 'in-progress';
    
    return { total: stageTasks.length, completed, inProgress, delayed, progress, status };
  };

  const getStageTasks = (stageId) => {
    return data.tasks.filter(t => t.phase_id === stageId);
  };

  const sortedStages = [...data.stages].sort((a, b) => (a.sort_order || a.order || 0) - (b.sort_order || b.order || 0));

  const overallProgress = data.tasks.length > 0 
    ? Math.round(data.tasks.reduce((sum, t) => sum + (t.progress || 0), 0) / data.tasks.length)
    : 0;

  const completedCount = data.tasks.filter(t => t.status === 'completed').length;
  const inProgressCount = data.tasks.filter(t => t.status === 'in-progress').length;
  const delayedCount = data.tasks.filter(t => t.status === 'blocked' || t.status === 'delayed').length;

  const getStatusInfo = (status) => {
    const info = {
      'completed': { label: 'مكتمل', color: '#15803D', bg: '#DCFCE7', icon: CheckCircle },
      'in-progress': { label: 'قيد التنفيذ', color: '#4338CA', bg: '#EEF2FF', icon: PlayCircle },
      'delayed': { label: 'متأخر', color: '#F97316', bg: '#FFEDD5', icon: AlertTriangle },
      'blocked': { label: 'متعثر', color: '#BE123C', bg: '#FFE4E6', icon: AlertTriangle },
      'not-started': { label: 'لم يبدأ', color: '#64748B', bg: '#F1F5F9', icon: Clock }
    };
    return info[status] || info['not-started'];
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-gradient-to-br from-emerald-600 to-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Map className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">خارطة التأسيس والتشغيل</h1>
            <p className="text-slate-500 dark:text-slate-400">{data.stages.length} مراحل</p>
          </div>
        </div>
        <Link to="/kanban" className="btn-secondary text-sm flex items-center gap-2">
          <Rocket className="w-4 h-4" />
          عرض المهام
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={Target}
          label="نسبة الإنجاز"
          value={`${overallProgress}%`}
          color="#059669"
          bgColor="#D1FAE5"
          progress={overallProgress}
        />
        <StatCard
          icon={CheckCircle}
          label="مكتمل"
          value={completedCount}
          color="#15803D"
          bgColor="#DCFCE7"
        />
        <StatCard
          icon={PlayCircle}
          label="قيد التنفيذ"
          value={inProgressCount}
          color="#4338CA"
          bgColor="#EEF2FF"
        />
        <StatCard
          icon={AlertTriangle}
          label="متأخر"
          value={delayedCount}
          color="#F97316"
          bgColor="#FFEDD5"
        />
      </div>

      {/* Overall Progress */}
      <div className="card-glass">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-azm-green" />
            نسبة الإنجاز الكلية
          </h3>
          <span className="text-2xl font-bold text-azm-green">{overallProgress}%</span>
        </div>
        <div className="h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-700"
            style={{ width: `${overallProgress}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs text-slate-500">
          <span>{completedCount} مكتمل</span>
          <span>{inProgressCount} قيد التنفيذ</span>
          <span>{delayedCount} متأخر</span>
        </div>
      </div>

      {/* Timeline */}
      {sortedStages.length > 0 ? (
        <div className="card">
          <h3 className="section-title flex items-center gap-2">
            <Map className="w-5 h-5 text-emerald-500" />
            المراحل
          </h3>
          
          <div className="relative">
            {/* Timeline Line */}
            <div className="absolute right-6 top-0 bottom-0 w-0.5 bg-slate-200 dark:bg-slate-700" />
            
            <div className="space-y-4">
              {sortedStages.map((stage, index) => {
                const stats = getStageStats(stage.id);
                const statusInfo = getStatusInfo(stats.status);
                const IconComponent = iconMap[stage.icon] || FileText;
                const isLast = index === sortedStages.length - 1;
                
                return (
                  <div key={stage.id} className="relative flex gap-4">
                    {/* Timeline Dot */}
                    <div 
                      className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 z-10 shadow-lg"
                      style={{ backgroundColor: statusInfo.bg, border: `2px solid ${statusInfo.color}` }}
                    >
                      <IconComponent className="w-6 h-6" style={{ color: statusInfo.color }} />
                    </div>
                    
                    {/* Content Card */}
                    <div className="flex-1 card hover:shadow-lg transition-all cursor-pointer group"
                      style={{ borderTopColor: stage.color, borderTopWidth: 4 }}
                      onClick={() => setSelectedStage(stage)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full" 
                              style={{ backgroundColor: statusInfo.bg, color: statusInfo.color }}>
                              {statusInfo.label}
                            </span>
                            <span className="text-xs text-slate-400">#{index + 1}</span>
                          </div>
                          <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100">{stage.name}</h3>
                          {stage.description && (
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">{stage.description}</p>
                          )}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingPhase(stage);
                          }}
                          className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                        >
                          <Pencil className="w-4 h-4 text-slate-500" />
                        </button>
                      </div>
                      
                      {/* Stats Row */}
                      <div className="flex items-center gap-4 mt-4 flex-wrap">
                        <div className="flex items-center gap-1.5 text-sm">
                          <span className="w-2 h-2 rounded-full bg-blue-500" />
                          <span className="text-slate-600 dark:text-slate-400">{stats.total} مهمة</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-sm text-green-600">
                          <CheckCircle className="w-4 h-4" />
                          <span>{stats.completed} مكتمل</span>
                        </div>
                        {stats.inProgress > 0 && (
                          <div className="flex items-center gap-1.5 text-sm text-purple-600">
                            <PlayCircle className="w-4 h-4" />
                            <span>{stats.inProgress} قيد التنفيذ</span>
                          </div>
                        )}
                        {stats.delayed > 0 && (
                          <div className="flex items-center gap-1.5 text-sm text-orange-600">
                            <AlertTriangle className="w-4 h-4" />
                            <span>{stats.delayed} متأخر</span>
                          </div>
                        )}
                      </div>
                      
                      {/* Progress Bar */}
                      <div className="mt-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-slate-500">التقدم</span>
                          <span className="text-lg font-bold" style={{ color: stage.color }}>{stats.progress}%</span>
                        </div>
                        <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div 
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${stats.progress}%`, backgroundColor: stage.color }}
                          />
                        </div>
                      </div>
                      
                      {/* View Tasks Link */}
                      {stats.total > 0 && (
                        <div className="mt-4 flex items-center justify-between">
                          <span className="text-xs text-slate-400">
                            {stats.completed} من {stats.total} مكتمل
                          </span>
                          <span className="text-sm font-medium text-azm-green flex items-center gap-1 group-hover:gap-2 transition-all">
                            عرض المهام
                            <ArrowRight className="w-4 h-4" />
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="card">
          <EmptyState
            icon={Map}
            title="لا توجد مراحل"
            description="أضف مراحل لتتبع تقدم التأسيس والتشغيل"
            color="#059669"
          />
        </div>
      )}

      {/* Stage Detail Modal */}
      {selectedStage && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedStage(null)}>
          <div className="bg-white dark:bg-slate-800 rounded-3xl w-full max-w-lg max-h-[80vh] overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-200 dark:border-slate-700" style={{ borderRightColor: selectedStage.color, borderRightWidth: 4 }}>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">{selectedStage.name}</h2>
                  <p className="text-sm text-slate-500">{getStageStats(selectedStage.id).total} مهمة</p>
                </div>
                <button onClick={() => setSelectedStage(null)} className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
                  ✕
                </button>
              </div>
              
              <div className="flex items-center gap-4 mt-4">
                <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${getStageStats(selectedStage.id).progress}%`, backgroundColor: selectedStage.color }}
                  />
                </div>
                <span className="font-bold text-lg" style={{ color: selectedStage.color }}>{getStageStats(selectedStage.id).progress}%</span>
              </div>
            </div>
            
            <div className="p-4 overflow-y-auto max-h-[50vh] space-y-3">
              {getStageTasks(selectedStage.id).map(task => (
                <Link
                  key={task.id}
                  to={`/task/${task.id}`}
                  onClick={() => setSelectedStage(null)}
                  className="block p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      task.status === 'completed' ? 'bg-green-100 dark:bg-green-900/40' :
                      task.status === 'blocked' ? 'bg-red-100 dark:bg-red-900/40' :
                      task.status === 'pending-review' ? 'bg-purple-100 dark:bg-purple-900/40' :
                      'bg-blue-100 dark:bg-blue-900/40'
                    }`}>
                      {task.status === 'completed' ? (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      ) : task.status === 'blocked' ? (
                        <AlertTriangle className="w-5 h-5 text-red-600" />
                      ) : (
                        <Clock className="w-5 h-5 text-blue-600" />
                      )}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-slate-800 dark:text-slate-100">{task.title}</h4>
                      <div className="flex items-center gap-3 mt-2">
                        <span className={`badge text-xs ${
                          task.priority === 'high' ? 'badge-priority-high' :
                          task.priority === 'medium' ? 'badge-priority-medium' : 'badge-priority-low'
                        }`}>
                          {task.priority === 'high' ? 'عالية' : task.priority === 'medium' ? 'متوسطة' : 'منخفضة'}
                        </span>
                        <span className="text-sm font-medium text-slate-600">{task.progress}%</span>
                      </div>
                    </div>
                    <ArrowRight className="w-5 h-5 text-slate-400" />
                  </div>
                </Link>
              ))}
              {getStageTasks(selectedStage.id).length === 0 && (
                <EmptyState
                  icon={FileText}
                  title="لا توجد مهام"
                  description="هذه المرحلة لا تحتوي على مهام بعد"
                  color="#64748B"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Phase Modal */}
      {editingPhase && (
        <PhaseEditModal
          phase={editingPhase}
          onClose={() => setEditingPhase(null)}
          onSuccess={() => success('تم تحديث المرحلة بنجاح')}
        />
      )}
    </div>
  );
}