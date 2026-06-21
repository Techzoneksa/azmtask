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
  GripVertical
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
  const { data, updateTask } = useData();
  
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

    if (!isAdmin && newStatus === 'completed') {
      alert('لا يمكن نقل المهمة إلى مكتمل. يجب اعتمادها من المدير العام.');
      setDraggedTask(null);
      return;
    }

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
      </div>

      {/* Kanban Board */}
      <div 
        className="flex gap-4 overflow-x-auto pb-4 hide-scrollbar -mx-4 px-4"
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

      {/* Legend */}
      {profile?.role === 'ops' && (
        <div className="card">
          <h3 className="text-sm font-medium text-gray-700 mb-3">ملاحظة للمدير التشغيلي</h3>
          <p className="text-sm text-gray-500">
            لا يمكن نقل المهام إلى "مكتمل" مباشرة. يجب إرسالها للمراجعة واعتماد المدير العام.
          </p>
        </div>
      )}
    </div>
  );
}