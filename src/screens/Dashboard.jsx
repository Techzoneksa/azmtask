import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
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
  Plus
} from 'lucide-react';

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
      const stageTasks = data.tasks.filter(t => t.stage_id === stage.id);
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

  const getRecentCompletedTasks = () => {
    return data.tasks
      .filter(task => task.status === 'completed')
      .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
      .slice(0, 5);
  };

  const getOverallProgress = () => {
    if (data.tasks.length === 0) return 0;
    const totalProgress = data.tasks.reduce((sum, t) => sum + (t.progress || 0), 0);
    return Math.round(totalProgress / data.tasks.length);
  };

  const readinessColor = () => {
    if (!readiness) return 'bg-gray-400';
    if (readiness.score < 30) return 'bg-red-500';
    if (readiness.score < 60) return 'bg-orange-500';
    if (readiness.score < 85) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const readinessTextColor = () => {
    if (!readiness) return 'text-gray-400';
    if (readiness.score < 30) return 'text-red-600';
    if (readiness.score < 60) return 'text-orange-600';
    if (readiness.score < 85) return 'text-yellow-600';
    return 'text-green-600';
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

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Welcome Section */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">مرحباً، {user?.name || 'المستخدم'}</h1>
          <p className="text-gray-500">{user?.position || 'مستخدم'}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link 
            to="/kanban" 
            className="btn-primary flex items-center gap-2 text-sm"
          >
            <Plus className="w-4 h-4" />
            إضافة مهمة
          </Link>
          <Link 
            to="/today" 
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <Calendar className="w-4 h-4" />
            مهام اليوم
          </Link>
        </div>
      </div>

      {/* Readiness Card */}
      <div className="card-glass relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gray-200">
          <div 
            className={`h-full ${readinessColor()} transition-all duration-500`}
            style={{ width: `${readiness?.score || 0}%` }}
          />
        </div>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <Rocket className="w-5 h-5 text-azm-green" />
              جاهزية عزم للانطلاق
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {readiness?.completedStages || 0} من {readiness?.totalStages || 0} مراحل مكتملة
            </p>
          </div>
          <div className={`text-3xl font-bold ${readinessTextColor()}`}>
            {readiness?.score || 0}%
          </div>
        </div>
        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${
          readiness?.status === 'جاهز للانطلاق' ? 'bg-green-100 text-green-700' :
          readiness?.status === 'قريب من الجاهزية' ? 'bg-yellow-100 text-yellow-700' :
          readiness?.status === 'يحتاج استكمال' ? 'bg-orange-100 text-orange-700' :
          'bg-red-100 text-red-700'
        }`}>
          {readiness?.status === 'جاهز للانطلاق' && <CheckCircle className="w-4 h-4" />}
          {readiness?.status || 'جاري التحميل...'}
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <div className="bg-gray-50 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-azm-green">{readiness?.completedTasks || 0}</div>
            <div className="text-xs text-gray-500">مهمة مكتملة</div>
          </div>
          <div className="bg-gray-50 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-blue-500">{data.tasks?.length || 0}</div>
            <div className="text-xs text-gray-500">إجمالي المهام</div>
          </div>
          <div className="bg-gray-50 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-orange-500">{readiness?.delayedTasks || 0}</div>
            <div className="text-xs text-gray-500">مهام متعثرة</div>
          </div>
          <div className="bg-gray-50 rounded-xl p-3 text-center">
            <div className="text-2xl font-bold text-red-500">{readiness?.openObstacles || 0}</div>
            <div className="text-xs text-gray-500">تحديات تشغيلية مفتوحة</div>
          </div>
        </div>
      </div>

      {/* Top Priorities */}
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
              className="flex items-center gap-3 p-3 bg-orange-50 rounded-xl hover:bg-orange-100 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center font-bold text-sm">
                {index + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-800 truncate">{task.title}</p>
                <p className="text-xs text-gray-500">
                  المرحلة: {data.stages.find(s => s.id === task.stage_id)?.name}
                </p>
              </div>
              <ChevronLeft className="w-5 h-5 text-gray-400" />
            </Link>
          ))}
          {getTopPriorities().length === 0 && (
            <p className="text-center text-gray-400 py-4">لا توجد أولويات عالية</p>
          )}
        </div>
      </div>

      {/* Two Column Grid */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Today's Tasks */}
        <div className="card">
          <h3 className="section-title flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-500" />
            مهام اليوم
          </h3>
          <div className="space-y-2">
            {getTasksForToday().slice(0, 4).map(task => (
              <Link
                key={task.id}
                to={`/task/${task.id}`}
                className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
              >
                <div className={`w-2 h-2 rounded-full ${
                  task.priority === 'high' ? 'bg-red-500' :
                  task.priority === 'medium' ? 'bg-yellow-500' : 'bg-green-500'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-800 text-sm truncate">{task.title}</p>
                </div>
                <span className={`badge ${
                  task.status === 'new' ? 'badge-new' :
                  task.status === 'in-progress' ? 'badge-in-progress' :
                  task.status === 'pending-review' ? 'badge-pending-review' :
                  task.status === 'completed' ? 'badge-completed' :
                  task.status === 'blocked' ? 'badge-blocked' : 'badge-delayed'
                } text-xs`}>
                  {task.status === 'new' ? 'جديد' :
                   task.status === 'in-progress' ? 'قيد التنفيذ' : 
                   task.status === 'blocked' ? 'متعثر' : 
                   task.status === 'pending-review' ? 'بانتظار المراجعة' :
                   task.status === 'completed' ? 'مكتمل' : 'مؤجل'}
                </span>
              </Link>
            ))}
            {getTasksForToday().length > 4 && (
              <Link to="/today" className="block text-center text-azm-green text-sm py-2">
                عرض الكل ({getTasksForToday().length})
              </Link>
            )}
            {getTasksForToday().length === 0 && (
              <p className="text-center text-gray-400 py-4">لا توجد مهام مستحقة اليوم</p>
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
                className="flex items-center gap-3 p-3 bg-red-50 rounded-xl hover:bg-red-100 transition-colors"
              >
                <AlertCircle className="w-4 h-4 text-red-500" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-800 text-sm truncate">{task.title}</p>
                  <p className="text-xs text-red-500">
                    متأخر منذ {Math.ceil((new Date() - new Date(task.due_date)) / (1000 * 60 * 60 * 24))} يوم
                  </p>
                </div>
              </Link>
            ))}
            {getDelayedTasks().length > 4 && (
              <Link to="/today" className="block text-center text-red-500 text-sm py-2">
                عرض الكل ({getDelayedTasks().length})
              </Link>
            )}
            {getDelayedTasks().length === 0 && (
              <p className="text-center text-green-500 py-4">لا توجد مهام متأخرة</p>
            )}
          </div>
        </div>

        {/* Pending Review */}
        <div className="card">
          <h3 className="section-title flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-purple-500" />
            بانتظار اعتمادك
          </h3>
          <div className="space-y-2">
            {getPendingReviewTasks().slice(0, 4).map(task => (
              <Link
                key={task.id}
                to={`/task/${task.id}`}
                className="flex items-center gap-3 p-3 bg-purple-50 rounded-xl hover:bg-purple-100 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-purple-500 text-white flex items-center justify-center text-sm">
                  ?
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-800 text-sm truncate">{task.title}</p>
                  <p className="text-xs text-gray-500">جاري تحميل المسؤول...</p>
                </div>
                <span className="badge badge-green text-xs">{task.progress}%</span>
              </Link>
            ))}
            {getPendingReviewTasks().length > 4 && (
              <Link to="/kanban" className="block text-center text-purple-500 text-sm py-2">
                عرض الكل ({getPendingReviewTasks().length})
              </Link>
            )}
            {getPendingReviewTasks().length === 0 && (
              <p className="text-center text-gray-400 py-4">لا توجد مهام بانتظار المراجعة</p>
            )}
          </div>
        </div>

        {/* Open Obstacles */}
        <div className="card">
          <h3 className="section-title flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-red-500" />
            التحديات التشغيلية المفتوحة
          </h3>
          <div className="space-y-2">
            {getOpenObstacles().slice(0, 4).map(obstacle => (
              <div
                key={obstacle.id}
                className="flex items-center gap-3 p-3 bg-red-50 rounded-xl"
              >
                <div className={`w-2 h-2 rounded-full ${
                  obstacle.priority === 'high' ? 'bg-red-500' : 'bg-yellow-500'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-800 text-sm">{obstacle.title}</p>
                  <p className="text-xs text-gray-500 truncate">{obstacle.description}</p>
                </div>
              </div>
            ))}
            {getOpenObstacles().length > 4 && (
              <Link to="/obstacles" className="block text-center text-red-500 text-sm py-2">
                عرض الكل ({getOpenObstacles().length})
              </Link>
            )}
            {getOpenObstacles().length === 0 && (
              <p className="text-center text-green-500 py-4">لا توجد تحديات تشغيلية مفتوحة</p>
            )}
          </div>
        </div>
      </div>

      {/* Recent Completed Tasks */}
      <div className="card">
        <h3 className="section-title flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-green-500" />
          آخر الإنجازات
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {getRecentCompletedTasks().map(task => (
            <Link
              key={task.id}
              to={`/task/${task.id}`}
              className="flex items-center gap-3 p-3 bg-green-50 rounded-xl hover:bg-green-100 transition-colors"
            >
              <CheckCircle className="w-5 h-5 text-green-500" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-800 text-sm truncate">{task.title}</p>
                <p className="text-xs text-gray-500">مكتمل</p>
              </div>
            </Link>
          ))}
          {getRecentCompletedTasks().length === 0 && (
            <p className="col-span-full text-center text-gray-400 py-4">لا توجد إنجازات حتى الآن</p>
          )}
        </div>
      </div>

      {/* Overall Progress */}
      <div className="card">
        <h3 className="section-title flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-azm-green" />
          نسبة الإنجاز العامة
        </h3>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="progress-bar h-4">
              <div className="progress-fill" style={{ width: `${getOverallProgress()}%` }} />
            </div>
          </div>
          <span className="text-2xl font-bold text-azm-green">{getOverallProgress()}%</span>
        </div>
        <div className="grid grid-cols-3 gap-4 mt-4">
          <div className="text-center">
            <div className="text-xl font-bold text-blue-500">
              {data.tasks?.filter(t => t.status === 'new').length || 0}
            </div>
            <div className="text-xs text-gray-500">جديد</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-orange-500">
              {data.tasks?.filter(t => t.status === 'in-progress').length || 0}
            </div>
            <div className="text-xs text-gray-500">قيد التنفيذ</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-green-500">
              {data.tasks?.filter(t => t.status === 'completed').length || 0}
            </div>
            <div className="text-xs text-gray-500">مكتمل</div>
          </div>
        </div>
      </div>
    </div>
  );
}