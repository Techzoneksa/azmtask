import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useFeedback } from '../context/FeedbackContext';
import StatCard from '../components/StatCard';
import EmptyState from '../components/EmptyState';
import { 
  AlertTriangle, 
  CheckCircle,
  Plus,
  X,
  Calendar,
  ArrowRight,
  ShieldAlert,
  Zap
} from 'lucide-react';

export default function Obstacles() {
  const { user, profile } = useAuth();
  const { data, addBlocker, resolveBlocker } = useData();
  const { success, error, warning } = useFeedback();
  
  const getRoles = () => {
    if (!profile) return [];
    if (Array.isArray(profile.roles)) return profile.roles;
    if (typeof profile.roles === 'string' && profile.roles.startsWith('[')) {
      try { return JSON.parse(profile.roles); } catch { return []; }
    }
    return [];
  };
  
  const canResolve = profile?.role === 'admin' || profile?.role === 'director' || getRoles().includes('admin');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newObstacle, setNewObstacle] = useState({ title: '', description: '', stageId: '', priority: 'medium' });

  const openObstacles = data.blockers?.filter(o => o.status === 'open') || [];
  const resolvedObstacles = data.blockers?.filter(o => o.status === 'resolved') || [];
  const highPriorityCount = openObstacles.filter(o => o.priority === 'high').length;

  const handleAddObstacle = async () => {
    if (!newObstacle.title.trim()) {
      warning('يرجى إدخال عنوان التحدي');
      return;
    }
    
    const result = await addBlocker({
      title: newObstacle.title,
      description: newObstacle.description,
      stageId: newObstacle.stageId,
      priority: newObstacle.priority
    });
    
    if (result.success) {
      setNewObstacle({ title: '', description: '', stageId: '', priority: 'medium' });
      setShowAddModal(false);
      success('تمت إضافة التحدي التشغيلي بنجاح');
    } else {
      console.error('Blocker save error:', result.error);
      error('تعذر حفظ التحدي التشغيلي، تحقق من الحقول المطلوبة.');
    }
  };

  const handleResolveObstacle = async (id) => {
    const result = await resolveBlocker(id);
    if (result && result.success) {
      success('تم إغلاق التحدي التشغيلي بنجاح');
    }
  };

  const getStageById = (id) => {
    return data.stages?.find(s => s.id === id);
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('ar-SA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-gradient-to-br from-red-600 to-orange-500 rounded-2xl flex items-center justify-center shadow-lg shadow-red-500/20">
            <AlertTriangle className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">التحديات التشغيلية</h1>
            <p className="text-slate-500 dark:text-slate-400">{openObstacles.length} تحدي مفتوح</p>
          </div>
        </div>
        
        <button 
          onClick={() => setShowAddModal(true)}
          className="btn-primary flex items-center gap-2 text-sm shadow-lg shadow-red-500/20"
        >
          <Plus className="w-4 h-4" />
          إضافة تحدٍ
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={ShieldAlert}
          label="إجمالي التحديات"
          value={openObstacles.length + resolvedObstacles.length}
          color="#F97316"
          bgColor="#FFEDD5"
        />
        <StatCard
          icon={AlertTriangle}
          label="مفتوحة"
          value={openObstacles.length}
          color="#EF4444"
          bgColor="#FFE4E6"
        />
        <StatCard
          icon={CheckCircle}
          label="تم حلها"
          value={resolvedObstacles.length}
          color="#22C55E"
          bgColor="#DCFCE7"
        />
        <StatCard
          icon={Zap}
          label="عالية الأولوية"
          value={highPriorityCount}
          color="#BE123C"
          bgColor="#FFE4E6"
        />
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">إضافة تحدٍ تشغيلي جديد</h3>
              <button onClick={() => setShowAddModal(false)} className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">العنوان *</label>
                <input
                  type="text"
                  value={newObstacle.title}
                  onChange={(e) => setNewObstacle({ ...newObstacle, title: e.target.value })}
                  className="input-field"
                  placeholder="مثال: ترخيص ناقص"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">الوصف</label>
                <textarea
                  value={newObstacle.description}
                  onChange={(e) => setNewObstacle({ ...newObstacle, description: e.target.value })}
                  className="input-field min-h-[100px]"
                  placeholder="وصف تفصيلي للمشكلة..."
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">المرحلة</label>
                <select
                  value={newObstacle.stageId}
                  onChange={(e) => setNewObstacle({ ...newObstacle, stageId: e.target.value })}
                  className="input-field"
                >
                  <option value="">اختر المرحلة</option>
                  {data.stages?.map(stage => (
                    <option key={stage.id} value={stage.id}>{stage.name}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">الأولوية</label>
                <select
                  value={newObstacle.priority}
                  onChange={(e) => setNewObstacle({ ...newObstacle, priority: e.target.value })}
                  className="input-field"
                >
                  <option value="high">عالية</option>
                  <option value="medium">متوسطة</option>
                  <option value="low">منخفضة</option>
                </select>
              </div>
              
              <button onClick={handleAddObstacle} className="btn-primary w-full">
                إضافة التحدي
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Open Obstacles */}
      <div className="card">
        <h3 className="section-title flex items-center gap-2 text-red-600 dark:text-red-400">
          <AlertTriangle className="w-5 h-5" />
          التحديات المفتوحة ({openObstacles.length})
        </h3>
        
        <div className="space-y-4">
          {openObstacles.map(obstacle => {
            const stage = getStageById(obstacle.phase_id);
            return (
              <div 
                key={obstacle.id} 
                className="p-5 bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20 rounded-2xl border border-red-100 dark:border-red-900/30 hover:shadow-lg transition-all"
              >
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    obstacle.priority === 'high' 
                      ? 'bg-red-100 dark:bg-red-900/40' 
                      : 'bg-orange-100 dark:bg-orange-900/40'
                  }`}>
                    <AlertTriangle className={`w-6 h-6 ${
                      obstacle.priority === 'high' ? 'text-red-500' : 'text-orange-500'
                    }`} />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className={`badge ${
                        obstacle.priority === 'high' ? 'badge-priority-high' :
                        obstacle.priority === 'medium' ? 'badge-priority-medium' : 'badge-priority-low'
                      }`}>
                        {obstacle.priority === 'high' ? 'عالية' : obstacle.priority === 'medium' ? 'متوسطة' : 'منخفضة'}
                      </span>
                      {stage && (
                        <span 
                          className="text-xs px-2.5 py-1 rounded-full font-medium"
                          style={{ backgroundColor: stage.color + '20', color: stage.color }}
                        >
                          {stage.name}
                        </span>
                      )}
                    </div>
                    
                    <h4 className="font-bold text-lg text-slate-800 dark:text-slate-100 mb-2">{obstacle.title}</h4>
                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{obstacle.description}</p>
                    
                    <div className="flex items-center justify-between mt-4">
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <Calendar className="w-4 h-4" />
                        {formatDate(obstacle.created_at)}
                      </div>
                      
                      {canResolve && (
                        <button 
                          onClick={() => handleResolveObstacle(obstacle.id)}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-green-500 text-white hover:bg-green-600 transition-colors shadow-lg shadow-green-500/20"
                        >
                          <CheckCircle className="w-4 h-4" />
                          تم الحل
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          
          {openObstacles.length === 0 && (
            <div className="py-8">
              <EmptyState 
                icon={CheckCircle} 
                title="لا توجد تحديات مفتوحة" 
                description="جميع التحديات التشغيلية تم حلها بنجاح"
                color="#22C55E"
              />
            </div>
          )}
        </div>
      </div>

      {/* Resolved Obstacles */}
      {resolvedObstacles.length > 0 && (
        <div className="card">
          <h3 className="section-title flex items-center gap-2 text-green-600 dark:text-green-400">
            <CheckCircle className="w-5 h-5" />
            التحديات المحلولة ({resolvedObstacles.length})
          </h3>
          
          <div className="space-y-3">
            {resolvedObstacles.map(obstacle => {
              const stage = getStageById(obstacle.phase_id);
              return (
                <div 
                  key={obstacle.id} 
                  className="p-4 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-100 dark:border-green-900/30 opacity-75 hover:opacity-100 transition-opacity"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      </div>
                      <div>
                        <h4 className="font-medium text-slate-700 dark:text-slate-200 line-through">{obstacle.title}</h4>
                        {stage && (
                          <span className="text-xs text-slate-400">{stage.name}</span>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" />
                      {formatDate(obstacle.resolved_at)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}