import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { 
  Bot, 
  Calendar,
  AlertTriangle,
  CheckCircle,
  Clock,
  Target,
  Zap,
  TrendingUp,
  ChevronLeft
} from 'lucide-react';

export default function Assistant() {
  const { user } = useAuth();
  const { data } = useData();

  const getTodaysTasks = () => {
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

  const getOpenObstacles = () => {
    return data.blockers?.filter(o => o.status === 'open') || [];
  };

  const getStageProgress = () => {
    return data.stages.map(stage => {
      const stageTasks = data.tasks.filter(t => t.stage_id === stage.id);
      const completed = stageTasks.filter(t => t.status === 'completed').length;
      const progress = stageTasks.length > 0 
        ? Math.round(stageTasks.reduce((sum, t) => sum + t.progress, 0) / stageTasks.length)
        : 0;
      return { ...stage, total: stageTasks.length, completed, progress };
    });
  };

  const getTopPriorities = () => {
    return data.tasks
      .filter(task => task.status !== 'completed' && task.priority === 'high')
      .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
      .slice(0, 3);
  };

  const getSlowestStage = () => {
    const stageProgress = getStageProgress();
    const activeStages = stageProgress.filter(s => s.progress < 100);
    if (activeStages.length === 0) return null;
    return activeStages.sort((a, b) => a.progress - b.progress)[0];
  };

  const getReadinessScore = () => {
    const completedTasks = data.tasks.filter(t => t.status === 'completed').length;
    const totalTasks = data.tasks.length;
    const openObstacles = getOpenObstacles().length;
    const delayedTasks = getDelayedTasks().length;
    
    let score = ((completedTasks / (totalTasks || 1)) * 100) - (openObstacles * 5) - (delayedTasks * 3);
    score = Math.max(0, Math.min(100, score));
    return Math.round(score);
  };

  const todaysTasks = getTodaysTasks();
  const delayedTasks = getDelayedTasks();
  const pendingReview = getPendingReviewTasks();
  const openObstacles = getOpenObstacles();
  const slowestStage = getSlowestStage();
  const priorities = getTopPriorities();
  const readinessScore = getReadinessScore();

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-indigo-500 rounded-xl flex items-center justify-center">
          <Bot className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">المساعد التشغيلي</h1>
          <p className="text-gray-500">تحليل البيانات وتوجيه العمل</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Link to="/today" className="card hover:shadow-md transition-shadow text-center">
          <Calendar className="w-8 h-8 text-blue-500 mx-auto mb-2" />
          <div className="text-2xl font-bold text-gray-800">{todaysTasks.length}</div>
          <div className="text-sm text-gray-500">مهام اليوم</div>
        </Link>
        
        <Link to="/obstacles" className="card hover:shadow-md transition-shadow text-center">
          <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-2" />
          <div className="text-2xl font-bold text-gray-800">{openObstacles.length}</div>
          <div className="text-sm text-gray-500">تحديات تشغيلية مفتوحة</div>
        </Link>
        
        <Link to="/kanban" className="card hover:shadow-md transition-shadow text-center">
          <Clock className="w-8 h-8 text-orange-500 mx-auto mb-2" />
          <div className="text-2xl font-bold text-gray-800">{delayedTasks.length}</div>
          <div className="text-sm text-gray-500">مهام متأخرة</div>
        </Link>
        
        <Link to="/roadmap" className="card hover:shadow-md transition-shadow text-center">
          <TrendingUp className="w-8 h-8 text-green-500 mx-auto mb-2" />
          <div className="text-2xl font-bold text-gray-800">{readinessScore}%</div>
          <div className="text-sm text-gray-500">جاهزية الانطلاق</div>
        </Link>
      </div>

      {/* What should be done today */}
      <div className="card">
        <h3 className="section-title flex items-center gap-2">
          <Target className="w-5 h-5 text-blue-500" />
          ماذا يجب عمله اليوم؟
        </h3>
        
        {todaysTasks.length > 0 ? (
          <div className="space-y-3">
            {todaysTasks.slice(0, 5).map(task => (
              <Link
                key={task.id}
                to={`/task/${task.id}`}
                className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl hover:bg-blue-100 transition-colors"
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  task.priority === 'high' ? 'bg-red-100' : 'bg-blue-100'
                }`}>
                  {task.priority === 'high' ? (
                    <Zap className="w-4 h-4 text-red-600" />
                  ) : (
                    <Clock className="w-4 h-4 text-blue-600" />
                  )}
                </div>
                <div className="flex-1">
                  <p className="font-medium text-gray-800">{task.title}</p>
                  <span className={`text-xs ${
                    task.status === 'blocked' ? 'text-red-500' : 'text-gray-500'
                  }`}>
                    {task.status === 'blocked' ? 'متعثر' : task.status === 'in-progress' ? 'قيد التنفيذ' : 'جديد'}
                  </span>
                </div>
                <ChevronLeft className="w-5 h-5 text-gray-400" />
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-6">
            <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-2" />
            <p className="text-gray-600">جميع المهام مكتملة أو ليس هناك ما هو مستحق اليوم</p>
          </div>
        )}
      </div>

      {/* Top Priorities */}
      <div className="card">
        <h3 className="section-title flex items-center gap-2">
          <Zap className="w-5 h-5 text-orange-500" />
          أهم 3 أولويات
        </h3>
        
        {priorities.length > 0 ? (
          <div className="space-y-3">
            {priorities.map((task, index) => (
              <Link
                key={task.id}
                to={`/task/${task.id}`}
                className="flex items-center gap-3 p-3 bg-orange-50 rounded-xl hover:bg-orange-100 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center font-bold">
                  {index + 1}
                </div>
                <div className="flex-1">
                  <p className="font-medium text-gray-800">{task.title}</p>
                  <p className="text-xs text-gray-500">
                    المرحلة: {data.stages.find(s => s.id === task.stage_id)?.name}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-center text-gray-400 py-4">لا توجد أولويات عالية</p>
        )}
      </div>

      {/* Delayed Tasks */}
      <div className="card border-red-200">
        <h3 className="section-title flex items-center gap-2 text-red-600">
          <AlertTriangle className="w-5 h-5" />
          المهام المتأخرة ({delayedTasks.length})
        </h3>
        
        {delayedTasks.length > 0 ? (
          <div className="space-y-3">
            {delayedTasks.slice(0, 5).map(task => (
              <div key={task.id} className="p-3 bg-red-50 rounded-xl">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-gray-800">{task.title}</p>
                  <Link to={`/task/${task.id}`} className="text-xs text-red-600 hover:underline">
                    عرض
                  </Link>
                </div>
                <p className="text-xs text-red-500 mt-1">
                  متأخر منذ {Math.ceil((new Date() - new Date(task.due_date)) / (1000 * 60 * 60 * 24))} يوم
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-4">
            <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
            <p className="text-green-600">لا توجد مهام متأخرة</p>
          </div>
        )}
      </div>

      {/* Slowest Stage */}
      {slowestStage && (
        <div className="card">
          <h3 className="section-title flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-gray-500" />
            المرحلة الأبطأ
          </h3>
          
          <div className="p-4 bg-gray-50 rounded-xl">
            <div className="flex items-center gap-4 mb-4">
              <div 
                className="w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold"
                style={{ backgroundColor: slowestStage.color }}
              >
                {slowestStage.order}
              </div>
              <div>
                <h4 className="font-semibold text-gray-800">{slowestStage.name}</h4>
                <p className="text-sm text-gray-500">{slowestStage.completed} من {slowestStage.total} مكتمل</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="progress-bar h-3">
                  <div className="progress-fill" style={{ width: `${slowestStage.progress}%`, backgroundColor: slowestStage.color }} />
                </div>
              </div>
              <span className="font-bold" style={{ color: slowestStage.color }}>{slowestStage.progress}%</span>
            </div>
            
            <Link 
              to="/roadmap" 
              className="inline-flex items-center gap-2 text-sm text-azm-green hover:underline mt-3"
            >
              عرض تفاصيل المرحلة
            </Link>
          </div>
        </div>
      )}

      {/* Requirements Before Launch */}
      <div className="card bg-gradient-to-br from-azm-green to-azm-green-dark text-white">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <CheckCircle className="w-5 h-5" />
          ما المطلوب قبل الانطلاق؟
        </h3>
        
        <div className="space-y-3">
          {slowestStage && (
            <div className="flex items-center gap-3 p-3 bg-white/10 rounded-xl">
              <CheckCircle className="w-5 h-5" />
              <span>استكمال مرحلة {slowestStage.name}</span>
            </div>
          )}
          
          {openObstacles.length > 0 && (
            <div className="flex items-center gap-3 p-3 bg-white/10 rounded-xl">
              <AlertTriangle className="w-5 h-5" />
              <span>حل {openObstacles.length} معوق مفتوح</span>
            </div>
          )}
          
          {delayedTasks.length > 0 && (
            <div className="flex items-center gap-3 p-3 bg-white/10 rounded-xl">
              <Clock className="w-5 h-5" />
              <span>إنجاز {delayedTasks.length} مهمة متأخرة</span>
            </div>
          )}
          
          {readinessScore >= 85 && openObstacles.length === 0 && delayedTasks.length === 0 && (
            <div className="flex items-center gap-3 p-3 bg-green-400/20 rounded-xl">
              <CheckCircle className="w-5 h-5" />
              <span>كل المتطلبات جاهزة! يمكن الانطلاق</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}