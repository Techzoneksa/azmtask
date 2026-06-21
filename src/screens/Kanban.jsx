import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
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
  X
} from 'lucide-react';

function TaskCard({ task, stages, onDragStart, isDragging = false }) {
  const stage = stages.find(s => s.id === task.stage_id);
  
  const statusBadgeClass = {
    'new': 'badge-new',
    'in-progress': 'badge-in-progress',
    'pending-review': 'badge-pending-review',
    'completed': 'badge-completed',
    'blocked': 'badge-blocked',
    'delayed': 'badge-delayed'
  };
  
  const priorityBadgeClass = {
    'high': 'badge-priority-high',
    'medium': 'badge-priority-medium',
    'low': 'badge-priority-low'
  };

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task)}
      data-status={task.status}
      className={`task-card ${isDragging ? 'shadow-xl opacity-50' : ''}`}
    >
      <div className="flex items-start gap-2 mb-2">
        <GripVertical className="w-4 h-4 text-slate-400 flex-shrink-0 mt-1 cursor-move" />
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-slate-800 text-sm line-clamp-2">{task.title}</h4>
        </div>
      </div>
      
      {task.description && (
        <p className="text-xs text-slate-500 mb-3 line-clamp-2 mr-6">{task.description}</p>
      )}
      
      <div className="flex items-center gap-2 mr-6 flex-wrap">
        <span 
          className="text-xs px-2 py-0.5 rounded-full font-medium"
          style={{ backgroundColor: stage?.color + '20', color: stage?.color }}
        >
          {stage?.name}
        </span>
        <span className={`badge text-xs ${priorityBadgeClass[task.priority] || 'badge-gray'}`}>
          {task.priority === 'high' ? 'عالية' : task.priority === 'medium' ? 'متوسطة' : 'منخفضة'}
        </span>
      </div>
      
      <div className="flex items-center gap-2 mt-3 mr-6">
        <div className="flex-1 progress-bar h-2">
          <div className="progress-fill" style={{ width: `${task.progress}%` }} />
        </div>
        <span className="text-xs text-slate-500 font-medium">{task.progress}%</span>
      </div>
      
      {task.priority === 'high' && (
        <div className="absolute top-2 left-2 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
      )}
    </div>
  );
}

function KanbanColumn({ status, tasks, stages, title, color, bg, border, icon: Icon, onDrop, onDragStart, draggedTask }) {
  return (
    <div 
      className="kanban-column"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => onDrop(e, status)}
    >
      <div className="mb-4">
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center`} style={{ backgroundColor: bg }}>
              <Icon className="w-4 h-4" style={{ color }} />
            </div>
            <h3 className="font-semibold text-slate-700">{title}</h3>
          </div>
          <span className="task-counter">{tasks.length}</span>
        </div>
        <div className="h-1 rounded-full" style={{ backgroundColor: border }} />
      </div>
      
      <div className="space-y-3 min-h-[200px]">
        {tasks.map(task => (
          <Link key={task.id} to={`/task/${task.id}`}>
            <TaskCard 
              task={task} 
              stages={stages}
              onDragStart={onDragStart}
              isDragging={draggedTask?.id === task.id}
            />
          </Link>
        ))}
        {tasks.length === 0 && (
          <div className="text-center py-8 text-gray-400 text-sm">
            لا توجد مهام
          </div>
        )}
      </div>
    </div>
  );
}

export default function Kanban() {
  const { user, profile } = useAuth();
  const { data, updateTask, addTask } = useData();
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    stage_id: '',
    assigned_to: user?.id || '',
    priority: 'medium',
    status: 'new',
    due_date: new Date().toISOString().split('T')[0],
    progress: 0,
    needs_follow_up: false,
    needs_approval: false,
    notes: ''
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

  const statuses = [
    { id: 'new', name: 'جديد', color: '#0369A1', bg: '#E0F2FE', border: '#7DD3FC', icon: Clock },
    { id: 'in-progress', name: 'قيد التنفيذ', color: '#4338CA', bg: '#EEF2FF', border: '#A5B4FC', icon: Clock },
    { id: 'pending-review', name: 'بانتظار المراجعة', color: '#B45309', bg: '#FEF3C7', border: '#FCD34D', icon: AlertTriangle },
    { id: 'completed', name: 'مكتمل', color: '#15803D', bg: '#DCFCE7', border: '#86EFAC', icon: CheckCircle },
    { id: 'delayed', name: 'مؤجل', color: '#475569', bg: '#F1F5F9', border: '#CBD5E1', icon: PauseCircle },
    { id: 'blocked', name: 'متعثر', color: '#BE123C', bg: '#FFE4E6', border: '#FDA4AF', icon: XCircle }
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
        alert('حدث خطأ أثناء تحديث المهمة');
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
      alert('يرجى إدخال عنوان المهمة');
      return;
    }
    
    const result = await addTask(newTask);
    if (result.success) {
      setShowAddModal(false);
      setNewTask({
        title: '',
        description: '',
        stage_id: '',
        assigned_to: user?.id || '',
        priority: 'medium',
        status: 'new',
        due_date: new Date().toISOString().split('T')[0],
        progress: 0,
        needs_follow_up: false,
        needs_approval: false,
        notes: ''
      });
    } else {
      alert('تعذر إضافة المهمة، حاول مرة أخرى');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-azm-green rounded-xl flex items-center justify-center">
            <LayoutGrid className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">لوحة المهام</h1>
            <p className="text-gray-500">اسحب وأفلت المهام لتغيير حالتها</p>
          </div>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          إضافة مهمة
        </button>
      </div>

      {/* Kanban Board */}
      <div 
        className="kanban-scroll flex gap-4 -mx-4 px-4"
        onDragOver={handleDragOver}
      >
        {statuses.map(status => (
          <KanbanColumn
            key={status.id}
            status={status.id}
            tasks={getTasksByStatus(status.id)}
            stages={data.stages}
            title={status.name}
            color={status.color}
            bg={status.bg}
            border={status.border}
            icon={status.icon}
            onDrop={handleDrop}
            onDragStart={handleDragStart}
            draggedTask={draggedTask}
          />
        ))}
      </div>

      {/* Add Task Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-800">إضافة مهمة جديدة</h2>
              <button onClick={() => setShowAddModal(false)} className="btn-ghost p-2">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddTask} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">عنوان المهمة *</label>
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
                <label className="block text-sm font-medium text-slate-700 mb-1">الوصف</label>
                <textarea
                  value={newTask.description}
                  onChange={(e) => setNewTask({...newTask, description: e.target.value})}
                  className="input-field min-h-[80px]"
                  placeholder="أدخل وصف المهمة"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">المرحلة</label>
                  <select
                    value={newTask.stage_id}
                    onChange={(e) => setNewTask({...newTask, stage_id: e.target.value})}
                    className="input-field"
                  >
                    <option value="">اختر المرحلة</option>
                    {data.stages.map(stage => (
                      <option key={stage.id} value={stage.id}>{stage.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">المسؤول</label>
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
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">الأولوية</label>
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
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">تاريخ الاستحقاق</label>
                  <input
                    type="date"
                    value={newTask.due_date}
                    onChange={(e) => setNewTask({...newTask, due_date: e.target.value})}
                    className="input-field"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">نسبة الإنجاز (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={newTask.progress}
                  onChange={(e) => setNewTask({...newTask, progress: parseInt(e.target.value) || 0})}
                  className="input-field"
                />
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newTask.needs_follow_up}
                    onChange={(e) => setNewTask({...newTask, needs_follow_up: e.target.checked})}
                    className="w-4 h-4 text-emerald-600 rounded border-slate-300"
                  />
                  <span className="text-sm text-slate-700">تحتاج متابعة</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newTask.needs_approval}
                    onChange={(e) => setNewTask({...newTask, needs_approval: e.target.checked})}
                    className="w-4 h-4 text-emerald-600 rounded border-slate-300"
                  />
                  <span className="text-sm text-slate-700">تحتاج اعتماد</span>
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">ملاحظات</label>
                <textarea
                  value={newTask.notes}
                  onChange={(e) => setNewTask({...newTask, notes: e.target.value})}
                  className="input-field min-h-[60px]"
                  placeholder="أي ملاحظات إضافية"
                />
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
    </div>
  );
}

      