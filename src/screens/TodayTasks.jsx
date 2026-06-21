import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import StatCard from '../components/StatCard';
import EmptyState from '../components/EmptyState';
import { 
  Calendar, 
  Clock, 
  AlertTriangle, 
  CheckCircle,
  ChevronLeft,
  Zap,
  CalendarCheck,
  Plus,
  ArrowRight,
  Play,
  Pause,
  Eye
} from 'lucide-react';

const STATUS_COLORS = {
  'new': '#0369A1',
  'in-progress': '#4338CA',
  'pending-review': '#B45309',
  'completed': '#15803D',
  'blocked': '#BE123C',
  'delayed': '#475569'
};

const STATUS_LABELS = {
  'new': 'جديد',
  'in-progress': 'قيد التنفيذ',
  'pending-review': 'بانتظار المراجعة',
  'completed': 'مكتمل',
  'blocked': 'متعثر',
  'delayed': 'مؤجل'
};

export default function TodayTasks() {
  const { user } = useAuth();
  const { data } = useData();
  const [activeTab, setActiveTab] = useState('all');

  const getTodaysTasks = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return data.tasks.filter(task => {
      const due = new Date(task.due_date);
      due.setHours(0, 0, 0, 0);
      return due.getTime() >= today.getTime() && due.getTime() < tomorrow.getTime() && task.status !== 'completed';
    });
  };

  const getTodaysTasksIncludingOverdue = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return data.tasks.filter(task => {
      const due = new Date(task.due_date);
      due.setHours(0, 0, 0, 0);
      return due.getTime() < tomorrow.getTime() && task.status !== 'completed';
    });
  };

  const getDelayedTasks = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return data.tasks.filter(task => {
      const due = new Date(task.due_date);
      due.setHours(0, 0, 0, 0);
      return due.getTime() < today.getTime() && task.status !== 'completed';
    });
  };

  const getPendingReviewTasks = () => {
    return data.tasks.filter(task => task.status === 'pending-review');
  };

  const getBlockedTasks = () => {
    return data.tasks.filter(task => task.status === 'blocked');
  };

  const getTomorrowTasks = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const dayAfter = new Date(tomorrow);
    dayAfter.setDate(dayAfter.getDate() + 1);
    return data.tasks.filter(task => {
      const due = new Date(task.due_date);
      due.setHours(0, 0, 0, 0);
      return due.getTime() >= tomorrow.getTime() && due.getTime() < dayAfter.getTime();
    });
  };

  const getTopPriorities = () => {
    return data.tasks
      .filter(task => task.status !== 'completed' && task.priority === 'high')
      .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
      .slice(0, 3);
  };

  const getStageById = (id) => {
    return data.stages.find(s => s.id === id);
  };

  const tabs = [
    { id: 'all', label: 'الكل', count: getTodaysTasksIncludingOverdue().length, color: '#0369A1', bg: '#E0F2FE' },
    { id: 'urgent', label: 'عالية الأولوية', count: getTodaysTasksIncludingOverdue().filter(t => t.priority === 'high').length, color: '#BE123C', bg: '#FFE4E6' },
    { id: 'delayed', label: 'متأخرة', count: getDelayedTasks().length, color: '#F97316', bg: '#FFEDD5' },
    { id: 'review', label: 'بانتظار المراجعة', count: getPendingReviewTasks().length, color: '#4338CA', bg: '#EEF2FF' },
    { id: 'blocked', label: 'متعثرة', count: getBlockedTasks().length, color: '#BE123C', bg: '#FFE4E6' },
    { id: 'tomorrow', label: 'خطة الغد', count: getTomorrowTasks().length, color: '#15803D', bg: '#DCFCE7' }
  ];

  const getFilteredTasks = () => {
    switch (activeTab) {
      case 'urgent':
        return getTodaysTasksIncludingOverdue().filter(t => t.priority === 'high');
      case 'delayed':
        return getDelayedTasks();
      case 'review':
        return getPendingReviewTasks();
      case 'blocked':
        return getBlockedTasks();
      case 'tomorrow':
        return getTomorrowTasks();
      default:
        return getTodaysTasksIncludingOverdue();
    }
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const taskDate = new Date(date);
    taskDate.setHours(0, 0, 0, 0);
    const diff = taskDate.getTime() - today.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (days < 0) return `متأخر ${Math.abs(days)} يوم`;
    if (days === 0) return 'اليوم';
    if (days === 1) return 'غداً';
    return `بعد ${days} يوم`;
  };

  const getTaskIcon = (task) => {
    if (task.status === 'completed') return <CheckCircle className="w-5 h-5 text-green-500" />;
    if (task.status === 'blocked') return <AlertTriangle className="w-5 h-5 text-red-500" />;
    if (task.status === 'pending-review') return <Eye className="w-5 h-5 text-purple-500" />;
    if (task.priority === 'high') return <Zap className="w-5 h-5 text-red-500" />;
    return <Clock className="w-5 h-5 text-blue-500" />;
  };

  const getTaskBgColor = (task) => {
    if (task.status === 'completed') return 'bg-green-50 dark:bg-green-900/20';
    if (task.status === 'blocked') return 'bg-red-50 dark:bg-red-900/20';
    if (task.priority === 'high') return 'bg-red-50 dark:bg-red-900/20';
    return 'bg-slate-50 dark:bg-slate-800/50';
  };

  const filteredTasks = getFilteredTasks();

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-gradient-to-br from-emerald-600 to-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <CalendarCheck className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">مهام اليوم</h1>
            <p className="text-slate-500 dark:text-slate-400">
              {new Date().toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
        </div>
        <Link to="/kanban" className="btn-primary flex items-center gap-2 text-sm shadow-lg shadow-emerald-500/20">
          <Plus className="w-4 h-4" />
          إضافة مهمة
        </Link>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={Calendar}
          label="مهام اليوم"
          value={getTodaysTasksIncludingOverdue().length}
          color="#0369A1"
          bgColor="#E0F2FE"
        />
        <StatCard
          icon={AlertTriangle}
          label="متأخرة"
          value={getDelayedTasks().length}
          color="#F97316"
          bgColor="#FFEDD5"
        />
        <StatCard
          icon={Eye}
          label="بانتظار المراجعة"
          value={getPendingReviewTasks().length}
          color="#4338CA"
          bgColor="#EEF2FF"
        />
        <StatCard
          icon={Zap}
          label="عالية الأولوية"
          value={getTodaysTasksIncludingOverdue().filter(t => t.priority === 'high').length}
          color="#BE123C"
          bgColor="#FFE4E6"
        />
      </div>

      {/* Top Priorities Card */}
      {getTopPriorities().length > 0 && (
        <div className="card bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20 border border-red-100 dark:border-red-900/30">
          <h3 className="section-title flex items-center gap-2 text-red-600 dark:text-red-400">
            <Zap className="w-5 h-5" />
            أهم 3 أولويات
          </h3>
          <div className="space-y-3">
            {getTopPriorities().map((task, index) => (
              <Link
                key={task.id}
                to={`/task/${task.id}`}
                className="flex items-center gap-4 p-3 bg-white dark:bg-slate-800 rounded-xl hover:shadow-md transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-500 to-orange-500 text-white flex items-center justify-center font-bold text-lg shadow-lg shadow-red-500/30">
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">{task.title}</p>
                  <p className="text-xs text-slate-500">
                    {getStageById(task.phase_id)?.name}
                  </p>
                </div>
                <ArrowRight className="w-5 h-5 text-slate-400" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-all ${
              activeTab === tab.id
                ? 'text-white shadow-lg'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
            }`}
            style={activeTab === tab.id ? { backgroundColor: tab.color } : {}}
          >
            {tab.label}
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
              activeTab === tab.id ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-600'
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Task Cards */}
      <div className="space-y-4">
        {filteredTasks.map(task => {
          const stage = getStageById(task.phase_id);
          return (
            <Link
              key={task.id}
              to={`/task/${task.id}`}
              className={`card block hover:shadow-lg transition-all duration-300 ${getTaskBgColor(task)}`}
            >
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                  task.status === 'completed' ? 'bg-green-100 dark:bg-green-900/40' :
                  task.status === 'blocked' ? 'bg-red-100 dark:bg-red-900/40' :
                  task.priority === 'high' ? 'bg-red-100 dark:bg-red-900/40' :
                  'bg-blue-100 dark:bg-blue-900/40'
                }`}>
                  {getTaskIcon(task)}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100">{task.title}</h3>
                    <span className={`badge flex-shrink-0 ${
                      task.priority === 'high' ? 'badge-priority-high' :
                      task.priority === 'medium' ? 'badge-priority-medium' : 'badge-priority-low'
                    }`}>
                      {task.priority === 'high' ? 'عالية' : task.priority === 'medium' ? 'متوسطة' : 'منخفضة'}
                    </span>
                  </div>
                  
                  {task.description && (
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 line-clamp-2">{task.description}</p>
                  )}
                  
                  <div className="flex items-center gap-3 mt-4 flex-wrap">
                    {stage && (
                      <span 
                        className="text-xs px-3 py-1.5 rounded-full font-medium"
                        style={{ backgroundColor: stage.color + '20', color: stage.color }}
                      >
                        {stage.name}
                      </span>
                    )}
                    <span className={`badge text-xs ${
                      task.status === 'new' ? 'badge-new' :
                      task.status === 'in-progress' ? 'badge-in-progress' :
                      task.status === 'pending-review' ? 'badge-pending-review' :
                      task.status === 'completed' ? 'badge-completed' :
                      task.status === 'blocked' ? 'badge-blocked' : 'badge-delayed'
                    }`}>
                      {STATUS_LABELS[task.status]}
                    </span>
                    <span className={`text-xs font-medium flex items-center gap-1 ${
                      formatDate(task.due_date).includes('متأخر') ? 'text-red-500' : 'text-slate-500'
                    }`}>
                      <Calendar className="w-3.5 h-3.5" />
                      {formatDate(task.due_date)}
                    </span>
                  </div>
                  
                  <div className="mt-4">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div 
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${task.progress}%`, backgroundColor: STATUS_COLORS[task.status] || '#059669' }}
                        />
                      </div>
                      <span className="text-sm font-bold text-slate-600 dark:text-slate-300">{task.progress}%</span>
                    </div>
                  </div>
                </div>
                
                <ChevronLeft className="w-6 h-6 text-slate-400 flex-shrink-0" />
              </div>
            </Link>
          );
        })}
        
        {filteredTasks.length === 0 && (
          <div className="card">
            <EmptyState
              icon={CheckCircle}
              title={
                activeTab === 'all' ? 'جميع المهام مكتملة' :
                activeTab === 'urgent' ? 'لا توجد أولويات عالية' :
                activeTab === 'delayed' ? 'لا توجد مهام متأخرة' :
                activeTab === 'review' ? 'لا توجد مهام بانتظار المراجعة' :
                activeTab === 'blocked' ? 'لا توجد مهام متعثرة' :
                'لا توجد مهام للغد'
              }
              description="قم بإنجاز المهام أو أضف مهام جديدة"
              color="#22C55E"
            />
          </div>
        )}
      </div>
    </div>
  );
}