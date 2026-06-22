import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import StatCard from '../components/StatCard';
import EmptyState from '../components/EmptyState';
import ChartCard from '../components/ChartCard';
import { 
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area
} from 'recharts';
import { 
  CheckCircle, 
  AlertCircle, 
  Clock, 
  TrendingUp, 
  Rocket,
  Calendar,
  AlertTriangle,
  Zap,
  Target,
  ChevronLeft,
  Plus,
  ClipboardList,
  ShieldAlert,
  BarChart3,
  Play,
  FileText
} from 'lucide-react';

const STATUS_COLORS = {
  'new': '#0369A1',
  'in-progress': '#4338CA',
  'pending-review': '#B45309',
  'completed': '#15803D',
  'delayed': '#475569',
  'blocked': '#BE123C'
};

const STATUS_LABELS = {
  'new': 'جديد',
  'in-progress': 'قيد التنفيذ',
  'pending-review': 'بانتظار المراجعة',
  'completed': 'مكتمل',
  'delayed': 'مؤجل',
  'blocked': 'متعثر'
};

export default function Dashboard() {
  const { user } = useAuth();
  const { data, refreshData } = useData();
  const [readiness, setReadiness] = useState(null);

  useEffect(() => {
    if (data.tasks.length > 0) {
      calculateReadiness();
    }
  }, [data]);

  const calculateReadiness = () => {
    const completedTasks = data.tasks.filter(t => t.status === 'completed').length;
    const totalTasks = data.tasks.length;
    const delayedTasks = data.tasks.filter(t => t.status === 'blocked' || t.status === 'delayed').length;
    const openObstacles = data.blockers?.filter(o => o.status === 'open').length || 0;
    
    const completedStages = data.stages.filter(stage => {
      const stageTasks = data.tasks.filter(t => t.phase_id === stage.id);
      return stageTasks.length > 0 && stageTasks.every(t => t.status === 'completed');
    }).length;
    
    const stageProgress = (completedStages / (data.stages.length || 1)) * 100;
    const taskProgress = (completedTasks / (totalTasks || 1)) * 100;
    
    let score = (stageProgress * 0.4) + (taskProgress * 0.4) + (20 - (delayedTasks * 2) - (openObstacles * 3));
    score = Math.max(0, Math.min(100, score));
    
    let status;
    if (score < 30) status = 'غير جاهز';
    else if (score < 60) status = 'يحتاج استكمال';
    else if (score < 85) status = 'قريب من الجاهزية';
    else status = 'جاهز للانطلاق';
    
    setReadiness({ 
      score: Math.round(score), 
      status, 
      completedTasks, 
      totalTasks, 
      delayedTasks, 
      openObstacles, 
      completedStages,
      totalStages: data.stages.length 
    });
  };

  const getTasksForToday = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return data.tasks.filter(task => {
      const due = new Date(task.due_date);
      due.setHours(0, 0, 0, 0);
      return due.getTime() <= today.getTime() && task.status !== 'completed';
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

  const getTopPriorities = () => {
    return data.tasks
      .filter(task => task.status !== 'completed' && task.priority === 'high')
      .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
      .slice(0, 3);
  };

  const getOpenObstacles = () => {
    return data.blockers?.filter(o => o.status === 'open') || [];
  };

  const getOverallProgress = () => {
    if (data.tasks.length === 0) return 0;
    const totalProgress = data.tasks.reduce((sum, t) => sum + (t.progress || 0), 0);
    return Math.round(totalProgress / data.tasks.length);
  };

  const readinessColor = () => {
    if (!readiness) return '#64748B';
    if (readiness.score < 30) return '#EF4444';
    if (readiness.score < 60) return '#F97316';
    if (readiness.score < 85) return '#EAB308';
    return '#22C55E';
  };

  const getStatusChartData = () => {
    const statusCounts = {};
    data.tasks.forEach(t => {
      const status = t.status || 'new';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });
    return Object.entries(statusCounts).map(([status, count]) => ({
      name: STATUS_LABELS[status] || status,
      value: count,
      color: STATUS_COLORS[status] || '#64748B'
    }));
  };

  const getPhaseChartData = () => {
    return data.stages.map(stage => {
      const stageTasks = data.tasks.filter(t => t.phase_id === stage.id);
      const progress = stageTasks.length > 0 
        ? Math.round(stageTasks.reduce((sum, t) => sum + (t.progress || 0), 0) / stageTasks.length)
        : 0;
      return {
        name: stage.name?.length > 12 ? stage.name.substring(0, 12) + '...' : stage.name,
        progress,
        color: stage.color || '#059669'
      };
    });
  };

  const getProgressChartData = () => {
    const completed = data.tasks.filter(t => t.status === 'completed').length;
    const inProgress = data.tasks.filter(t => t.status === 'in-progress').length;
    const pending = data.tasks.filter(t => t.status === 'pending-review').length;
    const delayed = data.tasks.filter(t => t.status === 'blocked' || t.status === 'delayed').length;
    const newTasks = data.tasks.filter(t => t.status === 'new').length;
    
    return [
      { name: 'مكتمل', value: completed, color: '#15803D' },
      { name: 'قيد التنفيذ', value: inProgress, color: '#4338CA' },
      { name: 'بانتظار', value: pending, color: '#B45309' },
      { name: 'متأخر', value: delayed, color: '#EF4444' },
      { name: 'جديد', value: newTasks, color: '#0369A1' }
    ];
  };

  const getExpiringDocuments = () => {
    if (!data.companyDocuments || data.companyDocuments.length === 0) return [];
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return data.companyDocuments
      .filter(doc => {
        if (!doc.expiry_date) return false;
        const expiry = new Date(doc.expiry_date);
        const daysUntil = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
        return daysUntil > 0 && daysUntil <= 30;
      })
      .sort((a, b) => new Date(a.expiry_date) - new Date(b.expiry_date));
  };

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-slate-800 p-3 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700">
          <p className="font-medium text-slate-800 dark:text-slate-100">{payload[0].payload.name}</p>
          <p className="text-sm text-slate-500">{payload[0].value} مهمة</p>
        </div>
      );
    }
    return null;
  };

  if (data.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse">
          <div className="w-12 h-12 bg-azm-green rounded-xl"></div>
        </div>
      </div>
    );
  }

  const phaseChartData = getPhaseChartData();
  const statusChartData = getStatusChartData();
  const progressChartData = getProgressChartData();
  const hasData = data.tasks.length > 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Welcome Section */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-gradient-to-br from-emerald-600 to-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Rocket className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">مرحباً، {user?.name || 'المستخدم'}</h1>
            <p className="text-slate-500 dark:text-slate-400">{user?.position || 'مستخدم'}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/today" className="btn-secondary flex items-center gap-2 text-sm">
            <Calendar className="w-4 h-4" />
            مهام اليوم
          </Link>
          <Link to="/kanban" className="btn-primary flex items-center gap-2 text-sm shadow-lg shadow-emerald-500/20">
            <Plus className="w-4 h-4" />
            إضافة مهمة
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard
          icon={ClipboardList}
          label="إجمالي المهام"
          value={data.tasks?.length || 0}
          color="#0369A1"
          bgColor="#E0F2FE"
        />
        <StatCard
          icon={CheckCircle}
          label="مكتمل"
          value={data.tasks?.filter(t => t.status === 'completed').length || 0}
          color="#15803D"
          bgColor="#DCFCE7"
        />
        <StatCard
          icon={Clock}
          label="قيد التنفيذ"
          value={data.tasks?.filter(t => t.status === 'in-progress').length || 0}
          color="#4338CA"
          bgColor="#EEF2FF"
        />
        <StatCard
          icon={AlertTriangle}
          label="متأخر"
          value={getDelayedTasks().length}
          color="#BE123C"
          bgColor="#FFE4E6"
        />
        <StatCard
          icon={ShieldAlert}
          label="تحديات مفتوحة"
          value={getOpenObstacles().length}
          color="#F97316"
          bgColor="#FFEDD5"
        />
        <StatCard
          icon={Target}
          label="نسبة الإنجاز"
          value={`${getOverallProgress()}%`}
          color="#059669"
          bgColor="#D1FAE5"
        />
      </div>

      {/* Readiness Card */}
      <div className="card-glass relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1.5 bg-slate-100 dark:bg-slate-700">
          <div 
            className="h-full transition-all duration-700"
            style={{ width: `${readiness?.score || 0}%`, backgroundColor: readinessColor() }}
          />
        </div>
        <div className="flex items-start justify-between mb-4 pt-2">
          <div className="flex items-center gap-4">
            <div 
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: readinessColor() + '20' }}
            >
              <Rocket className="w-7 h-7" style={{ color: readinessColor() }} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">جاهزية عزم للانطلاق</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {readiness?.completedStages || 0} من {readiness?.totalStages || 0} مراحل مكتملة
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-4xl font-bold" style={{ color: readinessColor() }}>
              {readiness?.score || 0}%
            </div>
          </div>
        </div>
        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold`}
          style={{ backgroundColor: readinessColor() + '20', color: readinessColor() }}>
          {readiness?.status === 'جاهز للانطلاق' && <CheckCircle className="w-4 h-4" />}
          {readiness?.status || 'جاري التحميل...'}
        </div>
      </div>

      {/* Charts Section */}
      {hasData ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Status Pie Chart */}
          <div className="card">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-azm-green/10 flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-azm-green" />
              </div>
              <h3 className="font-semibold text-slate-800 dark:text-slate-100">توزيع المهام</h3>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={statusChartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {statusChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-2 mt-4 justify-center">
              {statusChartData.map((item, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-xs text-slate-500">{item.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Phase Progress Bar Chart */}
          <div className="card">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-purple-500" />
              </div>
              <h3 className="font-semibold text-slate-800 dark:text-slate-100">إنجاز المراحل</h3>
            </div>
            {phaseChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={phaseChartData} layout="vertical">
                  <XAxis type="number" domain={[0, 100]} hide />
                  <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="progress" radius={[0, 4, 4, 0]}>
                    {phaseChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color || '#059669'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState
                icon={TrendingUp}
                title="لا توجد مراحل"
                description="أضف مراحل لمتابعة الإنجاز"
                color="#6366F1"
              />
            )}
          </div>

          {/* Progress Donut */}
          <div className="card">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <Target className="w-5 h-5 text-emerald-500" />
              </div>
              <h3 className="font-semibold text-slate-800 dark:text-slate-100">ملخص الأداء</h3>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={progressChartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={75}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {progressChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-2 mt-4">
              {progressChartData.map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-xs text-slate-500">{item.name}</span>
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 mr-auto">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="card">
          <EmptyState
            icon={BarChart3}
            title="لا توجد بيانات كافية للرسم بعد"
            description="أضف مهام لمراقبة الأداء"
            color="#059669"
          />
        </div>
      )}

      {/* Priority Tasks */}
      <div className="card">
        <h3 className="section-title flex items-center gap-2">
          <Zap className="w-5 h-5 text-orange-500" />
          أهم 3 أولويات
        </h3>
        <div className="space-y-3">
          {getTopPriorities().map((task, index) => (
            <Link 
              key={task.id}
              to={`/task/${task.id}`}
              className="flex items-center gap-4 p-4 bg-gradient-to-r from-orange-50 to-transparent dark:from-orange-900/20 rounded-xl hover:from-orange-100 dark:hover:from-orange-900/30 transition-all"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-orange-400 text-white flex items-center justify-center font-bold text-lg shadow-lg shadow-orange-500/30">
                {index + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">{task.title}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  المرحلة: {data.stages.find(s => s.id === task.phase_id)?.name}
                </p>
              </div>
              <span className={`badge ${
                task.priority === 'high' ? 'badge-priority-high' :
                task.priority === 'medium' ? 'badge-priority-medium' : 'badge-priority-low'
              }`}>
                {task.priority === 'high' ? 'عالية' : task.priority === 'medium' ? 'متوسطة' : 'منخفضة'}
              </span>
              <ChevronLeft className="w-5 h-5 text-slate-400" />
            </Link>
          ))}
          {getTopPriorities().length === 0 && (
            <EmptyState
              icon={Zap}
              title="لا توجد أولويات عالية"
              description="جميع المهام ذات أولوية عادية أو منخفضة"
              color="#F97316"
            />
          )}
        </div>
      </div>

      {/* Three Column Grid */}
      <div className="grid md:grid-cols-3 gap-6">
        {/* Today's Tasks */}
        <div className="card">
          <h3 className="section-title flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-500" />
            مهام اليوم
          </h3>
          <div className="space-y-2">
            {getTasksForToday().slice(0, 4).map(task => (
              <Link
                key={task.id}
                to={`/task/${task.id}`}
                className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                  task.priority === 'high' ? 'bg-red-500 animate-pulse' :
                  task.priority === 'medium' ? 'bg-yellow-500' : 'bg-green-500'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-800 dark:text-slate-100 text-sm truncate">{task.title}</p>
                </div>
                <span className={`badge text-xs flex-shrink-0 ${
                  task.status === 'new' ? 'badge-new' :
                  task.status === 'in-progress' ? 'badge-in-progress' :
                  task.status === 'pending-review' ? 'badge-pending-review' :
                  task.status === 'completed' ? 'badge-completed' :
                  task.status === 'blocked' ? 'badge-blocked' : 'badge-delayed'
                }`}>
                  {STATUS_LABELS[task.status]}
                </span>
              </Link>
            ))}
            {getTasksForToday().length > 4 && (
              <Link to="/today" className="block text-center text-azm-green text-sm py-2 font-medium">
                عرض الكل ({getTasksForToday().length})
              </Link>
            )}
            {getTasksForToday().length === 0 && (
              <EmptyState
                icon={CheckCircle}
                title="لا توجد مهام مستحقة"
                description="جميع المهام في الموعد المحدد"
                color="#22C55E"
              />
            )}
          </div>
        </div>

        {/* Delayed Tasks */}
        <div className="card">
          <h3 className="section-title flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            المهام المتأخرة
          </h3>
          <div className="space-y-2">
            {getDelayedTasks().slice(0, 4).map(task => (
              <Link
                key={task.id}
                to={`/task/${task.id}`}
                className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
              >
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-800 dark:text-slate-100 text-sm truncate">{task.title}</p>
                  <p className="text-xs text-red-500 font-medium">
                    متأخر {Math.ceil((new Date() - new Date(task.due_date)) / (1000 * 60 * 60 * 24))} يوم
                  </p>
                </div>
              </Link>
            ))}
            {getDelayedTasks().length > 4 && (
              <Link to="/today" className="block text-center text-red-500 text-sm py-2 font-medium">
                عرض الكل ({getDelayedTasks().length})
              </Link>
            )}
            {getDelayedTasks().length === 0 && (
              <EmptyState
                icon={CheckCircle}
                title="لا توجد مهام متأخرة"
                description="جميع المهام في وقتها"
                color="#22C55E"
              />
            )}
          </div>
        </div>

        {/* Pending Review */}
        <div className="card">
          <h3 className="section-title flex items-center gap-2">
            <Clock className="w-5 h-5 text-purple-500" />
            بانتظار المراجعة
          </h3>
          <div className="space-y-2">
            {getPendingReviewTasks().slice(0, 4).map(task => (
              <Link
                key={task.id}
                to={`/task/${task.id}`}
                className="flex items-center gap-3 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-xl hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-purple-400 text-white flex items-center justify-center">
                  <Play className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-800 dark:text-slate-100 text-sm truncate">{task.title}</p>
                  <p className="text-xs text-slate-500">نسبة الإنجاز: {task.progress}%</p>
                </div>
              </Link>
            ))}
            {getPendingReviewTasks().length > 4 && (
              <Link to="/kanban" className="block text-center text-purple-500 text-sm py-2 font-medium">
                عرض الكل ({getPendingReviewTasks().length})
              </Link>
            )}
            {getPendingReviewTasks().length === 0 && (
              <EmptyState
                icon={CheckCircle}
                title="لا توجد مهام بانتظار المراجعة"
                description="لم يطلب أي شخص مراجعة مهامه"
                color="#6366F1"
              />
            )}
          </div>
        </div>
      </div>

      {/* Open Obstacles */}
      <div className="card">
        <h3 className="section-title flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-orange-500" />
          التحديات التشغيلية المفتوحة ({getOpenObstacles().length})
        </h3>
        <div className="grid md:grid-cols-2 gap-4">
          {getOpenObstacles().slice(0, 4).map(obstacle => (
            <div
              key={obstacle.id}
              className="flex items-start gap-4 p-4 bg-gradient-to-r from-orange-50 to-transparent dark:from-orange-900/20 rounded-xl border border-orange-100 dark:border-orange-900/30"
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                obstacle.priority === 'high' ? 'bg-red-100 dark:bg-red-900/40' : 'bg-yellow-100 dark:bg-yellow-900/40'
              }`}>
                <AlertTriangle className={`w-5 h-5 ${obstacle.priority === 'high' ? 'text-red-500' : 'text-yellow-500'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-800 dark:text-slate-100">{obstacle.title}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2">{obstacle.description}</p>
              </div>
            </div>
          ))}
          {getOpenObstacles().length > 4 && (
            <Link to="/obstacles" className="block text-center text-orange-500 text-sm py-4 font-medium">
              عرض الكل ({getOpenObstacles().length})
            </Link>
          )}
          {getOpenObstacles().length === 0 && (
            <div className="col-span-2">
              <EmptyState
                icon={CheckCircle}
                title="لا توجد تحديات تشغيلية مفتوحة"
                description="جميع التحديات تم حلها بنجاح"
                color="#22C55E"
              />
            </div>
          )}
        </div>
      </div>

      {/* Documents Expiring Soon */}
      {getExpiringDocuments().length > 0 && (
        <div className="card">
          <h3 className="section-title flex items-center gap-2">
            <FileText className="w-5 h-5 text-orange-500" />
            وثائق قاربت على الانتهاء ({getExpiringDocuments().length})
          </h3>
          <div className="space-y-3">
            {getExpiringDocuments().slice(0, 4).map(doc => {
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const expiry = new Date(doc.expiry_date);
              const daysUntil = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
              
              return (
                <Link
                  key={doc.id}
                  to="/documents"
                  className="flex items-center gap-3 p-3 bg-orange-50 dark:bg-orange-900/20 rounded-xl hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center">
                    <FileText className="w-5 h-5 text-orange-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 dark:text-slate-100 truncate">
                      {doc.document_name || doc.document_type}
                    </p>
                    <p className="text-xs text-orange-500 font-medium">
                      تنتهي خلال {daysUntil} يوم
                    </p>
                  </div>
                </Link>
              );
            })}
            {getExpiringDocuments().length > 4 && (
              <Link to="/documents" className="block text-center text-orange-500 text-sm py-2 font-medium">
                عرض الكل ({getExpiringDocuments().length})
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}