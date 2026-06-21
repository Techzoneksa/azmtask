import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useFeedback } from '../context/FeedbackContext';
import { 
  AlertTriangle, 
  CheckCircle,
  Plus,
  X
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-red-500 rounded-xl flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">التحديات التشغيلية</h1>
            <p className="text-gray-500">التحديات التي تواجهنا وتعيق الانطلاق</p>
          </div>
        </div>
        
        <button 
          onClick={() => setShowAddModal(true)}
          className="btn-primary flex items-center gap-2 text-sm"
        >
          <Plus className="w-4 h-4" />
إضافة تحدي تشغيلي
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card text-center">
          <div className="text-3xl font-bold text-red-500">{openObstacles.length}</div>
          <div className="text-sm text-gray-500">تحديات تشغيلية مفتوحة</div>
        </div>
        <div className="card text-center">
          <div className="text-3xl font-bold text-green-500">{resolvedObstacles.length}</div>
          <div className="text-sm text-gray-500">تم حلها</div>
        </div>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-100">إضافة تحدٍ تشغيلي جديد</h3>
              <button onClick={() => setShowAddModal(false)} className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-slate-700 flex items-center justify-center">
                <X className="w-4 h-4 dark:text-slate-300" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">العنوان *</label>
                <input
                  type="text"
                  value={newObstacle.title}
                  onChange={(e) => setNewObstacle({ ...newObstacle, title: e.target.value })}
                  className="input-field dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600 dark:placeholder-slate-400"
                  placeholder="مثال: ترخيص ناقص"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">الوصف</label>
                <textarea
                  value={newObstacle.description}
                  onChange={(e) => setNewObstacle({ ...newObstacle, description: e.target.value })}
                  className="input-field min-h-[100px] dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600 dark:placeholder-slate-400"
                  placeholder="وصف تفصيلي للمشكلة..."
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">المرحلة</label>
                <select
                  value={newObstacle.stageId}
                  onChange={(e) => setNewObstacle({ ...newObstacle, stageId: e.target.value })}
                  className="input-field dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600"
                >
                  <option value="">اختر المرحلة</option>
                  {data.stages?.map(stage => (
                    <option key={stage.id} value={stage.id}>{stage.name}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">الأولوية</label>
                <select
                  value={newObstacle.priority}
                  onChange={(e) => setNewObstacle({ ...newObstacle, priority: e.target.value })}
                  className="input-field dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600"
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
        <h3 className="section-title text-red-600 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          التحديات التشغيلية المفتوحة ({openObstacles.length})
        </h3>
        
        <div className="space-y-4">
          {openObstacles.map(obstacle => {
            const stage = getStageById(obstacle.stage_id);
            return (
              <div key={obstacle.id} className="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-100 dark:border-red-900/30">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`badge ${
                        obstacle.priority === 'high' ? 'badge-priority-high' :
                        obstacle.priority === 'medium' ? 'badge-priority-medium' : 'badge-priority-low'
                      }`}>
                        {obstacle.priority === 'high' ? 'عالية' : obstacle.priority === 'medium' ? 'متوسطة' : 'منخفضة'}
                      </span>
                      {stage && (
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: stage.color + '20', color: stage.color }}>
                          {stage.name}
                        </span>
                      )}
                    </div>
                    <h4 className="font-semibold text-gray-800 dark:text-slate-100 mb-1">{obstacle.title}</h4>
                    <p className="text-sm text-gray-600 dark:text-slate-300">{obstacle.description}</p>
                    <p className="text-xs text-gray-400 dark:text-slate-500 mt-2">تاريخ التسجيل: {formatDate(obstacle.created_at)}</p>
                  </div>
                  
                  {canResolve && (
                    <button 
                      onClick={() => handleResolveObstacle(obstacle.id)}
                      className="btn-secondary text-green-600 dark:text-green-400 border-green-200 dark:border-green-900/30 hover:bg-green-50 dark:hover:bg-green-900/20 flex items-center gap-2 text-sm"
                    >
                      <CheckCircle className="w-4 h-4" />
                      تم الحل
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          
          {openObstacles.length === 0 && (
            <div className="text-center py-8">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <p className="text-gray-500">لا توجد تحديات تشغيلية مفتوحة</p>
            </div>
          )}
        </div>
      </div>

      {/* Resolved Obstacles */}
      {resolvedObstacles.length > 0 && (
        <div className="card">
          <h3 className="section-title text-green-600 flex items-center gap-2">
            <CheckCircle className="w-5 h-5" />
            التحديات التشغيلية المحلولة ({resolvedObstacles.length})
          </h3>
          
          <div className="space-y-3">
            {resolvedObstacles.map(obstacle => {
              const stage = getStageById(obstacle.stage_id);
              return (
                <div key={obstacle.id} className="p-4 bg-green-50 rounded-xl border border-green-100 opacity-75">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium text-gray-700 line-through">{obstacle.title}</h4>
                      {stage && (
                        <span className="text-xs text-gray-500">{stage.name}</span>
                      )}
                    </div>
                    <span className="text-xs text-green-600">
                      تم الحل: {formatDate(obstacle.resolved_at)}
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