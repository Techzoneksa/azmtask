import { useState } from 'react';
import { useData } from '../context/DataContext';
import StatCard from '../components/StatCard';
import EmptyState from '../components/EmptyState';
import { 
  BarChart3, 
  Calendar,
  CheckCircle,
  AlertTriangle,
  Clock,
  TrendingUp,
  Users,
  AlertCircle,
  PieChart,
  ArrowRight,
  Target,
  ShieldAlert
} from 'lucide-react';
import {
  PieChart as RePieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

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

export default function Reports() {
  const { data } = useData();
  const [selectedReport, setSelectedReport] = useState('overview');

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
      const inProgress = stageTasks.filter(t => t.status === 'in-progress').length;
      const progress = stageTasks.length > 0 
        ? Math.round(stageTasks.reduce((sum, t) => sum + t.progress, 0) / stageTasks.length)
        : 0;
      return { ...stage, total: stageTasks.length, completed, inProgress, progress };
    });
  };

  const getStatusDistribution = () => {
    const distribution = {};
    data.tasks?.forEach(t => {
      const status = t.status || 'new';
      distribution[status] = (distribution[status] || 0) + 1;
    });
    return Object.entries(distribution).map(([status, count]) => ({
      name: STATUS_LABELS[status] || status,
      value: count,
      color: STATUS_COLORS[status] || '#64748B'
    }));
  };

  const getPriorityDistribution = () => {
    const distribution = { high: 0, medium: 0, low: 0 };
    data.tasks?.forEach(t => {
      const p = t.priority || 'medium';
      distribution[p] = (distribution[p] || 0) + 1;
    });
    return [
      { name: 'عالية', value: distribution.high, color: '#EF4444' },
      { name: 'متوسطة', value: distribution.medium, color: '#F59E0B' },
      { name: 'منخفضة', value: distribution.low, color: '#22C55E' }
    ];
  };

  const getPhaseDistribution = () => {
    return data.stages.map(stage => {
      const count = data.tasks?.filter(t => t.phase_id === stage.id).length || 0;
      return {
        name: stage.name?.length > 10 ? stage.name.substring(0, 10) + '...' : stage.name,
        count,
        color: stage.color || '#059669'
      };
    });
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

  const reportTabs = [
    { id: 'overview', label: 'نظرة عامة', icon: BarChart3 },
    { id: 'stages', label: 'المراحل', icon: Target },
    { id: 'status', label: 'الحالات', icon: CheckCircle },
    { id: 'priority', label: 'الأولويات', icon: AlertTriangle },
    { id: 'delayed', label: 'المتأخرات', icon: Clock }
  ];

  const renderReport = () => {
    switch (selectedReport) {
      case 'overview':
        const delayed = getDelayedTasks();
        const openObstacles = data.blockers?.filter(o => o.status === 'open').length || 0;
        const completedTasks = data.tasks?.filter(t => t.status === 'completed').length || 0;
        const inProgressTasks = data.tasks?.filter(t => t.status === 'in-progress').length || 0;
        const totalProgress = data.tasks?.length > 0 
          ? Math.round(data.tasks.reduce((sum, t) => sum + (t.progress || 0), 0) / data.tasks.length) 
          : 0;
        
        return (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                icon={Target}
                label="نسبة الإنجاز"
                value={`${totalProgress}%`}
                color="#059669"
                bgColor="#D1FAE5"
                progress={totalProgress}
              />
              <StatCard
                icon={CheckCircle}
                label="المكتمل"
                value={completedTasks}
                color="#15803D"
                bgColor="#DCFCE7"
              />
              <StatCard
                icon={Clock}
                label="قيد التنفيذ"
                value={inProgressTasks}
                color="#4338CA"
                bgColor="#EEF2FF"
              />
              <StatCard
                icon={ShieldAlert}
                label="تحديات مفتوحة"
                value={openObstacles}
                color="#F97316"
                bgColor="#FFEDD5"
              />
            </div>

            {/* Charts Row */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* Status Pie */}
              <div className="card">
                <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
                  <PieChart className="w-5 h-5 text-purple-500" />
                  توزيع المهام حسب الحالة
                </h3>
                {getStatusDistribution().length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={200}>
                      <RePieChart>
                        <Pie
                          data={getStatusDistribution()}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={80}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {getStatusDistribution().map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                      </RePieChart>
                    </ResponsiveContainer>
                    <div className="flex flex-wrap gap-3 mt-4 justify-center">
                      {getStatusDistribution().map((item, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                          <span className="text-xs text-slate-500">{item.name} ({item.value})</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <EmptyState icon={PieChart} title="لا توجد بيانات" description="أضف مهام لعرض الإحصائيات" color="#6366F1" />
                )}
              </div>

              {/* Priority Pie */}
              <div className="card">
                <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-orange-500" />
                  توزيع المهام حسب الأولوية
                </h3>
                {getPriorityDistribution().some(d => d.value > 0) ? (
                  <>
                    <ResponsiveContainer width="100%" height={200}>
                      <RePieChart>
                        <Pie
                          data={getPriorityDistribution()}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={80}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {getPriorityDistribution().map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                      </RePieChart>
                    </ResponsiveContainer>
                    <div className="flex flex-wrap gap-3 mt-4 justify-center">
                      {getPriorityDistribution().map((item, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                          <span className="text-xs text-slate-500">{item.name} ({item.value})</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <EmptyState icon={AlertTriangle} title="لا توجد بيانات" description="أضف مهام لعرض الأولويات" color="#F97316" />
                )}
              </div>
            </div>

            {/* Delayed Tasks Preview */}
            {delayed.length > 0 && (
              <div className="card">
                <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                  المهام المتأخرة ({delayed.length})
                </h3>
                <div className="space-y-3">
                  {delayed.slice(0, 5).map(task => (
                    <div key={task.id} className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl">
                      <AlertCircle className="w-5 h-5 text-red-500" />
                      <div className="flex-1">
                        <p className="font-medium text-slate-800 dark:text-slate-100">{task.title}</p>
                        <p className="text-xs text-red-500">
                          متأخر {Math.ceil((new Date() - new Date(task.due_date)) / (1000 * 60 * 60 * 24))} يوم
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );

      case 'stages':
        const stageProgress = getStageProgress();
        return (
          <div className="space-y-6">
            <div className="card">
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-emerald-500" />
                تقرير المراحل
              </h3>
              {stageProgress.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={stageProgress} layout="vertical">
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="progress" radius={[0, 4, 4, 0]}>
                      {stageProgress.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color || '#059669'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState icon={Target} title="لا توجد مراحل" description="أضف مراحل لعرض التقرير" color="#059669" />
              )}
            </div>
            
            {/* Stage Cards */}
            <div className="grid md:grid-cols-2 gap-4">
              {stageProgress.map(stage => (
                <div key={stage.id} className="card" style={{ borderTopColor: stage.color, borderTopWidth: 4 }}>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold text-slate-800 dark:text-slate-100">{stage.name}</h4>
                    <span className="text-lg font-bold" style={{ color: stage.color }}>{stage.progress}%</span>
                  </div>
                  <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden mb-3">
                    <div 
                      className="h-full rounded-full transition-all"
                      style={{ width: `${stage.progress}%`, backgroundColor: stage.color }}
                    />
                  </div>
                  <div className="flex items-center gap-4 text-sm text-slate-500">
                    <span>{stage.total} مهمة</span>
                    <span className="text-green-600">{stage.completed} مكتمل</span>
                    {stage.inProgress > 0 && <span className="text-purple-600">{stage.inProgress} قيد التنفيذ</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      case 'status':
        const statusData = getStatusDistribution();
        return (
          <div className="space-y-6">
            <div className="card">
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
                <PieChart className="w-5 h-5 text-purple-500" />
                توزيع المهام حسب الحالة
              </h3>
              {statusData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={250}>
                    <RePieChart>
                      <Pie
                        data={statusData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {statusData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                    </RePieChart>
                  </ResponsiveContainer>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-6">
                    {statusData.map((item, i) => (
                      <div key={i} className="p-4 rounded-xl" style={{ backgroundColor: item.color + '15' }}>
                        <div className="text-2xl font-bold" style={{ color: item.color }}>{item.value}</div>
                        <div className="text-sm text-slate-600 dark:text-slate-400">{item.name}</div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <EmptyState icon={CheckCircle} title="لا توجد مهام" description="أضف مهام لعرض التوزيع" color="#22C55E" />
              )}
            </div>
          </div>
        );

      case 'priority':
        const priorityData = getPriorityDistribution();
        return (
          <div className="space-y-6">
            <div className="card">
              <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-orange-500" />
                توزيع المهام حسب الأولوية
              </h3>
              {priorityData.some(d => d.value > 0) ? (
                <>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={priorityData}>
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                        {priorityData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="grid grid-cols-3 gap-4 mt-6">
                    {priorityData.map((item, i) => (
                      <div key={i} className="p-4 rounded-xl text-center" style={{ backgroundColor: item.color + '15' }}>
                        <div className="text-2xl font-bold" style={{ color: item.color }}>{item.value}</div>
                        <div className="text-sm text-slate-600 dark:text-slate-400">{item.name}</div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <EmptyState icon={AlertTriangle} title="لا توجد مهام" description="أضف مهام لعرض الأولويات" color="#F97316" />
              )}
            </div>
          </div>
        );

      case 'delayed':
        const delayedTasks = getDelayedTasks();
        return (
          <div className="space-y-6">
            <div className="card">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                  تقرير المهام المتأخرة
                </h3>
                <div className="text-3xl font-bold text-red-500">{delayedTasks.length}</div>
              </div>
              
              {delayedTasks.length > 0 ? (
                <div className="space-y-4">
                  {delayedTasks.map(task => (
                    <div key={task.id} className="flex items-start gap-4 p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-100 dark:border-red-900/30">
                      <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/40 flex items-center justify-center flex-shrink-0">
                        <AlertCircle className="w-5 h-5 text-red-500" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-slate-800 dark:text-slate-100">{task.title}</h4>
                        <p className="text-sm text-slate-500 mt-1">
                          المرحلة: {data.stages.find(s => s.id === task.phase_id)?.name}
                        </p>
                        <div className="flex items-center gap-4 mt-2">
                          <span className="text-xs font-medium text-red-500">
                            متأخر {Math.ceil((new Date() - new Date(task.due_date)) / (1000 * 60 * 60 * 24))} يوم
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-full" 
                            style={{ backgroundColor: STATUS_COLORS[task.status] + '20', color: STATUS_COLORS[task.status] }}>
                            {STATUS_LABELS[task.status]}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState 
                  icon={CheckCircle} 
                  title="لا توجد مهام متأخرة" 
                  description="جميع المهام في وقتها المحدد"
                  color="#22C55E"
                />
              )}
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
        <div className="w-14 h-14 bg-gradient-to-br from-purple-600 to-purple-500 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/20">
          <BarChart3 className="w-7 h-7 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">التقارير</h1>
          <p className="text-slate-500 dark:text-slate-400">تحليل البيانات والأداء</p>
        </div>
      </div>

      {/* Report Tabs */}
      <div className="flex gap-2 flex-wrap">
        {reportTabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setSelectedReport(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 rounded-xl font-medium transition-all ${
                selectedReport === tab.id
                  ? 'bg-purple-600 text-white shadow-lg'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              <Icon className="w-5 h-5" />
              {tab.label}
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