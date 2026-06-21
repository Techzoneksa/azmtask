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
  
  const statusColors = {
    'new': 'bg-blue-50 border-blue-200',
    'in-progress': 'bg-orange-50 border-orange-200',
    'pending-review': 'bg-purple-50 border-purple-200',
    'completed': 'bg-green-50 border-green-200',
    'blocked': 'bg-red-50 border-red-200',
    'delayed': 'bg-gray-50 border-gray-200'
  };

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task)}
      className={`task-card border ${statusColors[task.status] || ''} ${isDragging ? 'shadow-xl opacity-50' : ''}`}
    >
      <div className="flex items-start gap-2 mb-2">
        <GripVertical className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1 cursor-move" />
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-gray-800 text-sm line-clamp-2">{task.title}</h4>
        </div>
      </div>
      
      {task.description && (
        <p className="text-xs text-gray-500 mb-3 line-clamp-2 mr-6">{task.description}</p>
      )}
      
      <div className="flex items-center gap-2 mr-6 flex-wrap">
        <span 
          className="text-xs px-2 py-0.5 rounded-full"
          style={{ backgroundColor: stage?.color + '20', color: stage?.color }}
        >
          {stage?.name}
        </span>
      </div>
      
      <div className="flex items-center gap-2 mt-3 mr-6">
        <div className="flex-1 progress-bar h-1.5">
          <div className="progress-fill" style={{ width: `${task.progress}%` }} />
        </div>
        <span className="text-xs text-gray-500">{task.progress}%</span>
      </div>
      
      {task.priority === 'high' && (
        <div className="absolute top-2 left-2 w-2 h-2 bg-red-500 rounded-full" />
      )}
    </div>
  );
}

function KanbanColumn({ status, tasks, stages, title, color, icon: Icon, onDrop, onDragStart, draggedTask }) {
  return (
    <div 
      className="kanban-column"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => onDrop(e, status)}
    >
      <div className="flex items-center justify-between mb-4 px-1">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center`} style={{ backgroundColor: color + '20' }}>
            <Icon className="w-4 h-4" style={{ color }} />
          </div>
          <h3 className="font-semibold text-gray-800">{title}</h3>
        </div>
        <span className="bg-gray-100 text-gray-600 text-sm px-2 py-0.5 rounded-full">{tasks.length}</span>
      </div>
      
      <div className="space-y-2 min-h-[200px]">
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
  
  const isAdmin = profile?.role === 'admin' || profile?.role === 'director';
  const [draggedTask, setDraggedTask] = useState(null);

  const statuses = [
    { id: 'new', name: 'جديد', color: '#3b82f6', icon: Clock },
    { id: 'in-progress', name: 'قيد التنفيذ', color: '#f59e0b', icon: Clock },
    { id: 'pending-review', name: 'بانتظار المراجعة', color: '#8b5cf6', icon: AlertTriangle },
    { id: 'completed', name: 'مكتمل', color: '#22c55e', icon: CheckCircle },
    { id: 'delayed', name: 'مؤجل', color: '#6b7280', icon: PauseCircle },
    { id: 'blocked', name: 'متعثر', color: '#ef4444', icon: XCircle }
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