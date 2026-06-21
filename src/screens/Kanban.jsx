import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useFeedback } from '../context/FeedbackContext';
import TaskEditModal from '../components/TaskEditModal';
import EmptyState from '../components/EmptyState';
import { 
  LayoutGrid, 
  ChevronLeft,
  Clock,
  CheckCircle,
  AlertTriangle,
  PauseCircle,
  XCircle,
  Plus,
  GripVertical,
  X,
  Pencil,
  Calendar,
  User,
  ArrowRight
} from 'lucide-react';

const STATUS_CONFIG = {
  'new': { label: 'جديد', color: '#0369A1', bg: '#E0F2FE', border: '#7DD3FC', icon: Clock },
  'in-progress': { label: 'قيد التنفيذ', color: '#4338CA', bg: '#EEF2FF', border: '#A5B4FC', icon: Clock },
  'pending-review': { label: 'بانتظار المراجعة', color: '#B45309', bg: '#FEF3C7', border: '#FCD34D', icon: AlertTriangle },
  'completed': { label: 'مكتمل', color: '#15803D', bg: '#DCFCE7', border: '#86EFAC', icon: CheckCircle },
  'delayed': { label: 'مؤجل', color: '#475569', bg: '#F1F5F9', border: '#CBD5E1', icon: PauseCircle },
  'blocked': { label: 'متعثر', color: '#BE123C', bg: '#FFE4E6', border: '#FDA4AF', icon: XCircle }
};

function TaskCard({ task, stage, onDragStart, isDragging = false, onEdit }) {
  const config = STATUS_CONFIG[task.status] || STATUS_CONFIG['new'];
  
  const getPriorityColor = () => {
    if (task.priority === 'high') return '#EF4444';
    if (task.priority === 'medium') return '#F59E0B';
    return '#22C55E';
  };

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task)}
      data-status={task.status}
      className={`task-card ${isDragging ? 'shadow-2xl opacity-50 scale-95' : ''} relative overflow-hidden`}
      style={{ borderRight: `4px solid ${config.color}` }}
    >
      {/* High Priority Indicator */}
      {task.priority === 'high' && (
        <div className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
      )}
      
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start gap-2 mb-3">
          <GripVertical className="w-4 h-4 text-slate-300 flex-shrink-0 mt-0.5 cursor-grab active:cursor-grabbing" />
          <div className="flex-1 min-w-0">
            <Link to={`/task/${task.id}`} className="block">
              <h4 className="font-semibold text-slate-800 dark:text-slate-100 text-sm line-clamp-2 hover:text-azm-green transition-colors">
                {task.title}
              </h4>
            </Link>
          </div>
          {onEdit && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onEdit(task);
              }}
              className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors flex-shrink-0"
            >
              <Pencil className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
            </button>
          )}
        </div>
        
        {/* Description */}
        {task.description && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 mr-6 line-clamp-2">{task.description}</p>
        )}
        
        {/* Tags */}
        <div className="flex items-center gap-2 mr-6 flex-wrap mb-3">
          {stage && (
            <span 
              className="text-xs px-2.5 py-1 rounded-full font-medium"
              style={{ backgroundColor: stage.color + '20', color: stage.color }}
            >
              {stage.name}
            </span>
          )}
          <span className="text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1"
            style={{ backgroundColor: getPriorityColor() + '20', color: getPriorityColor() }}>
            {task.priority === 'high' ? 'عالية' : task.priority === 'medium' ? 'متوسطة' : 'منخفضة'}
          </span>
        </div>
        
        {/* Progress */}
        <div className="flex items-center gap-2 mr-6 mb-3">
          <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
            <div 
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${task.progress}%`, backgroundColor: config.color }}
            />
          </div>
          <span className="text-xs font-bold text-slate-500">{task.progress}%</span>
        </div>
        
        {/* Footer */}
        <div className="flex items-center justify-between mr-6">
          {task.due_date && (
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {new Date(task.due_date).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' })}
            </span>
          )}
          <span className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{ backgroundColor: config.bg, color: config.color }}>
            {config.label}
          </span>
        </div>
      </div>
    </div>
  );
}

function KanbanColumn({ status, tasks, stage, title, color, bg, border, icon: Icon, onDrop, onDragStart, draggedTask, onEdit }) {
  const config = STATUS_CONFIG[status];
  const taskCount = tasks.length;
  
  return (
    <div 
      className="kanban-column flex flex-col"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => onDrop(e, status)}
    >
      {/* Column Header */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: bg }}>
              <Icon className="w-5 h-5" style={{ color }} />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 dark:text-slate-100">{title}</h3>
            </div>
          </div>
          <span className="task-counter font-bold" style={{ backgroundColor: bg, color }}>{taskCount}</span>
        </div>
        <div className="h-1.5 rounded-full" style={{ backgroundColor: border }} />
      </div>
      
      {/* Tasks */}
      <div className="flex-1 space-y-3 min-h-[200px]">
        {tasks.map(task => (
          <TaskCard 
            key={task.id}
            task={task} 
            stage={stage}
            onDragStart={onDragStart}
            isDragging={draggedTask?.id === task.id}
            onEdit={onEdit}
          />
        ))}
        {tasks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: bg }}>
              <Icon className="w-6 h-6" style={{ color: color }}/>
            </div>
            <p className="text-sm text-slate-400">لا توجد مهام</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Kanban() {
  const { user, profile } = useAuth();
  const { data, updateTask, addTask } = useData();
  const { success, error, warning } = useFeedback();
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    phase_id: '',
    assigned_to: user?.id || '',
    priority: 'medium',
    status: 'new',
    due_date: new Date().toISOString().split('T')[0],
    progress: 0
  });
  
  const getRoles = () => {
    if (!profile) return [];
    if (Array.isArray(profile.roles)) return profile.roles;
    if (typeof profile.roles === 'string' && profile.roles.startsWith('[')) {
      try { return JSON.parse(profile.roles); } catch { return []; }
    }
    return [];
  };
  
  const isAdmin = profile?.role === 'admin' || profile?.role === 'director' || getRoles().includes('admin');
  const [draggedTask, setDraggedTask] = useState(null);

  const handleEditTask = (task) => {
    setEditingTask(task);
  };

  const handleEditSuccess = () => {
    setEditingTask(null);
    success('تم تحديث المهمة بنجاح');
  };

  const statuses = [
    { id: 'new', ...STATUS_CONFIG['new'] },
    { id: 'in-progress', ...STATUS_CONFIG['in-progress'] },
    { id: 'pending-review', ...STATUS_CONFIG['pending-review'] },
    { id: 'completed', ...STATUS_CONFIG['completed'] },
    { id: 'delayed', ...STATUS_CONFIG['delayed'] },
    { id: 'blocked', ...STATUS_CONFIG['blocked'] }
  ];

  const handleDragStart = (e, task) => {
    setDraggedTask(task);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = async (e, newStatus) => {
    e.preventDefault();
    
    if (!draggedTask) return;

    if (draggedTask.status !== newStatus) {
      const result = await updateTask(draggedTask.id, { status: newStatus });
      
      if (!result.success) {
        console.error('Task update error:', result.error);
        error('تعذر تحديث حالة المهمة، حاول مرة أخرى');
      } else {
        success('تم تحديث حالة المهمة بنجاح');
      }
    }
    
    setDraggedTask(null);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const getTasksByStatus = (statusId) => {
    return data.tasks.filter(t => t.status === statusId);
  };

  const handleAddTask = async (e) => {
    e.preventDefault();
    if (!newTask.title.trim()) {
      warning('يرجى إدخال عنوان المهمة');
      return;
    }
    
    const result = await addTask(newTask);
    if (result.success) {
      setShowAddModal(false);
      setNewTask({
        title: '',
        description: '',
        phase_id: '',
        assigned_to: user?.id || '',
        priority: 'medium',
        status: 'new',
        due_date: new Date().toISOString().split('T')[0],
        progress: 0
      });
      success('تمت إضافة المهمة بنجاح');
    } else {
      console.error('Task add error:', result.error);
      error('تعذر إضافة المهمة، حاول مرة أخرى');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-gradient-to-br from-emerald-600 to-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <LayoutGrid className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">لوحة المهام</h1>
            <p className="text-slate-500 dark:text-slate-400">{data.tasks.length} مهمة</p>
          </div>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="btn-primary flex items-center gap-2 shadow-lg shadow-emerald-500/20"
        >
          <Plus className="w-5 h-5" />
          إضافة مهمة
        </button>
      </div>

      {/* Kanban Board */}
      <div 
        className="kanban-scroll flex gap-4 -mx-4 px-4 pb-4"
        onDragOver={handleDragOver}
      >
        {statuses.map(status => (
          <KanbanColumn
            key={status.id}
            status={status.id}
            tasks={getTasksByStatus(status.id)}
            stage={data.stages.find(s => s.id === getTasksByStatus(status.id)[0]?.phase_id)}
            stages={data.stages}
            title={status.label}
            color={status.color}
            bg={status.bg}
            border={status.border}
            icon={status.icon}
            onDrop={handleDrop}
            onDragStart={handleDragStart}
            draggedTask={draggedTask}
            onEdit={handleEditTask}
          />
        ))}
      </div>

      {/* Add Task Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">إضافة مهمة جديدة</h2>
              <button onClick={() => setShowAddModal(false)} className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <form onSubmit={handleAddTask} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">عنوان المهمة *</label>
                <input
                  type="text"
                  value={newTask.title}
                  onChange={(e) => setNewTask({...newTask, title: e.target.value})}
                  className="input-field"
                  placeholder="أدخل عنوان المهمة"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">الوصف</label>
                <textarea
                  value={newTask.description}
                  onChange={(e) => setNewTask({...newTask, description: e.target.value})}
                  className="input-field min-h-[80px]"
                  placeholder="أدخل وصف المهمة"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">المرحلة</label>
                  <select
                    value={newTask.phase_id}
                    onChange={(e) => setNewTask({...newTask, phase_id: e.target.value})}
                    className="input-field"
                  >
                    <option value="">اختر المرحلة</option>
                    {data.stages.map(stage => (
                      <option key={stage.id} value={stage.id}>{stage.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">الحالة</label>
                  <select
                    value={newTask.status}
                    onChange={(e) => setNewTask({...newTask, status: e.target.value})}
                    className="input-field"
                  >
                    {statuses.map(s => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">المسؤول</label>
                  <select
                    value={newTask.assigned_to}
                    onChange={(e) => setNewTask({...newTask, assigned_to: e.target.value})}
                    className="input-field"
                  >
                    <option value={user?.id}>أنا</option>
                    {data.users?.map(u => (
                      <option key={u.id} value={u.id}>{u.name || u.email}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">الأولوية</label>
                  <select
                    value={newTask.priority}
                    onChange={(e) => setNewTask({...newTask, priority: e.target.value})}
                    className="input-field"
                  >
                    <option value="low">منخفضة</option>
                    <option value="medium">متوسطة</option>
                    <option value="high">عالية</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">تاريخ الاستحقاق</label>
                  <input
                    type="date"
                    value={newTask.due_date}
                    onChange={(e) => setNewTask({...newTask, due_date: e.target.value})}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">نسبة الإنجاز</label>
                  <select
                    value={newTask.progress}
                    onChange={(e) => setNewTask({...newTask, progress: parseInt(e.target.value)})}
                    className="input-field"
                  >
                    <option value="0">0%</option>
                    <option value="25">25%</option>
                    <option value="50">50%</option>
                    <option value="75">75%</option>
                    <option value="100">100%</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button type="submit" className="btn-primary flex-1">
                  حفظ المهمة
                </button>
                <button type="button" onClick={() => setShowAddModal(false)} className="btn-secondary">
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Task Modal */}
      {editingTask && (
        <TaskEditModal
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onSuccess={handleEditSuccess}
        />
      )}
    </div>
  );
}