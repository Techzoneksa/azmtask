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

  const getOpenObstacles = () => {
    return data.blockers?.filter(o => o.status === 'open') || [];
  };

  const getTopPriorities = () => {
    return data.tasks
      .filter(task => task.status !== 'completed' && task.priority === 'high')
      .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
      .slice(0, 3);
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
  const openObstacles = getOpenObstacles();
  const priorities = getTopPriorities();
  const readinessScore = getReadinessScore();

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
          <Bot className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">المساعد التشغيلي</h1>
          <p className="text-slate-500">تحليل البيانات وتوجيه العمل</p>
        </div>
      </div>

      {/* Quick Stats - Horizontal */}
      <div className="grid grid-cols-4 gap-3">
        <Link to="/today" className="card text-center hover:shadow-lg transition-shadow">
          <Calendar className="w-6 h-6 text-blue-500 mx-auto mb-2" />
          <div className="text-2xl font-bold text-slate-800">{todaysTasks.length}</div>
          <div className="text-xs text-slate-500">مهام اليوم</div>
        </Link>
        
        <Link to="/obstacles" className="card text-center hover:shadow-lg transition-shadow">
          <AlertTriangle className="w-6 h-6 text-red-500 mx-auto mb-2" />
          <div className="text-2xl font-bold text-slate-800">{openObstacles.length}</div>
          <div className="text-xs text-slate-500">تحديات</div>
        </Link>
        
        <Link to="/kanban" className="card text-center hover:shadow-lg transition-shadow">
          <Clock className="w-6 h-6 text-orange-500 mx-auto mb-2" />
          <div className="text-2xl font-bold text-slate-800">{delayedTasks.length}</div>
          <div className="text-xs text-slate-500">متأخرة</div>
        </Link>
        
        <Link to="/roadmap" className="card text-center hover:shadow-lg transition-shadow">
          <TrendingUp className="w-6 h-6 text-emerald-500 mx-auto mb-2" />
          <div className="text-2xl font-bold text-emerald-600">{readinessScore}%</div>
          <div className="text-xs text-slate-500">الجاهزية</div>
        </Link>
      </div>

      {/* Two Column Grid */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Left Column - Tasks */}
        <div className="space-y-4">
          {/* Today's Tasks */}
          <div className="card">
            <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
              <Target className="w-5 h-5 text-blue-500" />
              ماذا يجب عمله اليوم؟
            </h3>
            
            {todaysTasks.length > 0 ? (
              <div className="space-y-2">
                {todaysTasks.slice(0, 4).map(task => (
                  <Link
                    key={task.id}
                    to={`/task/${task.id}`}
                    className="flex items-center gap-3 p-2.5 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                      task.priority === 'high' ? 'bg-red-100' : 'bg-blue-100'
                    }`}>
                      {task.priority === 'high' ? (
                        <Zap className="w-4 h-4 text-red-600" />
                      ) : (
                        <Clock className="w-4 h-4 text-blue-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800 text-sm truncate">{task.title}</p>
                    </div>
                    <ChevronLeft className="w-4 h-4 text-slate-400" />
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-4">
                <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
                <p className="text-slate-600 text-sm">لا توجد مهام مستحقة</p>
              </div>
            )}
          </div>

          {/* Top Priorities */}
          <div className="card">
            <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
              <Zap className="w-5 h-5 text-orange-500" />
              أهم الأولويات
            </h3>
            
            {priorities.length > 0 ? (
              <div className="space-y-2">
                {priorities.map((task, index) => (
                  <Link
                    key={task.id}
                    to={`/task/${task.id}`}
                    className="flex items-center gap-3 p-2.5 bg-orange-50 rounded-lg hover:bg-orange-100 transition-colors"
                  >
                    <div className="w-7 h-7 rounded-full bg-orange-500 text-white flex items-center justify-center font-bold text-sm">
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-800 text-sm truncate">{task.title}</p>
                      <p className="text-xs text-slate-500 truncate">{data.stages.find(s => s.id === task.stage_id)?.name}</p>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-center text-slate-400 py-3 text-sm">لا توجد أولويات</p>
            )}
          </div>
        </div>

        {/* Right Column - Status & Actions */}
        <div className="space-y-4">
          {/* Delayed Tasks */}
          <div className="card border border-red-200">
            <h3 className="font-semibold text-red-600 mb-3 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              المهام المتأخرة ({delayedTasks.length})
            </h3>
            
            {delayedTasks.length > 0 ? (
              <div className="space-y-2">
                {delayedTasks.slice(0, 3).map(task => (
                  <Link
                    key={task.id}
                    to={`/task/${task.id}`}
                    className="flex items-center justify-between p-2.5 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                  >
                    <p className="font-medium text-slate-800 text-sm truncate flex-1">{task.title}</p>
                    <span className="text-xs text-red-600 mr-2 whitespace-nowrap">
                      {Math.ceil((new Date() - new Date(task.due_date)) / (1000 * 60 * 60 * 24))} يوم
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-3">
                <CheckCircle className="w-6 h-6 text-green-500 mx-auto mb-1" />
                <p className="text-green-600 text-sm">لا توجد مهام متأخرة</p>
              </div>
            )}
          </div>

          {/* Requirements Before Launch */}
          <div className="card bg-gradient-to-br from-emerald-600 to-emerald-700 text-white">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <CheckCircle className="w-5 h-5" />
              قبل الانطلاق
            </h3>
            
            <div className="space-y-2">
              {openObstacles.length > 0 && (
                <div className="flex items-center gap-2 p-2 bg-white/10 rounded-lg text-sm">
                  <AlertTriangle className="w-4 h-4" />
                  <span>حل {openObstacles.length} تحدٍ تشغيلي مفتوح</span>
                </div>
              )}
              
              {delayedTasks.length > 0 && (
                <div className="flex items-center gap-2 p-2 bg-white/10 rounded-lg text-sm">
                  <Clock className="w-4 h-4" />
                  <span>إنجاز {delayedTasks.length} مهمة متأخرة</span>
                </div>
              )}
              
              {todaysTasks.filter(t => t.priority === 'high').length > 0 && (
                <div className="flex items-center gap-2 p-2 bg-white/10 rounded-lg text-sm">
                  <Zap className="w-4 h-4" />
                  <span>{todaysTasks.filter(t => t.priority === 'high').length} مهام عاجلة اليوم</span>
                </div>
              )}
              
              {readinessScore >= 85 && openObstacles.length === 0 && delayedTasks.length === 0 && (
                <div className="flex items-center gap-2 p-2 bg-green-400/20 rounded-lg text-sm">
                  <CheckCircle className="w-4 h-4" />
                  <span>كل المتطلبات جاهزة!</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}