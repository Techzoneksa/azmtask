import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth, useData } from '../context/AuthContext';
import { 
  ArrowRight,
  Calendar,
  User,
  Tag,
  Flag,
  CheckCircle,
  Clock,
  AlertTriangle,
  Plus,
  Send,
  ThumbsUp,
  XCircle,
  MessageSquare,
  AlertCircle,
  ChevronLeft,
  Trash2
} from 'lucide-react';

export default function TaskDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, updateData, refreshData } = useData();
  
  const task = data.tasks?.find(t => t.id === id);
  const stage = data.stages?.find(s => s.id === task?.stageId);
  const assignedUser = data.users?.find(u => u.id === task?.assignedTo);
  
  const [newNote, setNewNote] = useState('');
  const [newLog, setNewLog] = useState('');
  const [progress, setProgress] = useState(task?.progress || 0);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  
  useEffect(() => {
    if (task) {
      setProgress(task.progress);
    }
  }, [task]);

  if (!task) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-800 mb-2">المهمة غير موجودة</h3>
        <Link to="/kanban" className="btn-primary">العودة للوحة المهام</Link>
      </div>
    );
  }

  const handleAddNote = () => {
    if (!newNote.trim()) return;
    
    const note = {
      id: 'note-' + Date.now(),
      text: newNote,
      userId: user.id,
      createdAt: new Date().toISOString()
    };
    
    const updatedTasks = data.tasks.map(t => {
      if (t.id === id) {
        return {
          ...t,
          notes: [...(t.notes || []), note],
          logs: [...t.logs, {
            action: 'note_added',
            text: newNote.substring(0, 50),
            userId: user.id,
            timestamp: new Date().toISOString()
          }]
        };
      }
      return t;
    });
    
    updateData({ ...data, tasks: updatedTasks });
    setNewNote('');
    
    const notification = {
      id: 'notif-' + Date.now(),
      title: 'تم إضافة ملاحظة',
      message: `تم إضافة ملاحظة على مهمة "${task.title}"`,
      userId: task.assignedTo,
      taskId: task.id,
      read: false,
      createdAt: new Date().toISOString()
    };
    updateData({ ...data, tasks: updatedTasks, notifications: [...(data.notifications || []), notification] });
  };

  const handleUpdateProgress = (newProgress) => {
    const updatedTasks = data.tasks.map(t => {
      if (t.id === id) {
        return {
          ...t,
          progress: newProgress,
          logs: [...t.logs, {
            action: 'progress_updated',
            from: t.progress,
            to: newProgress,
            userId: user.id,
            timestamp: new Date().toISOString()
          }]
        };
      }
      return t;
    });
    
    updateData({ ...data, tasks: updatedTasks });
    setProgress(newProgress);
  };

  const handleSendForReview = () => {
    const updatedTasks = data.tasks.map(t => {
      if (t.id === id) {
        return {
          ...t,
          status: 'pending-review',
          logs: [...t.logs, {
            action: 'sent_for_review',
            userId: user.id,
            timestamp: new Date().toISOString()
          }]
        };
      }
      return t;
    });
    
    updateData({ ...data, tasks: updatedTasks });
    
    const notification = {
      id: 'notif-' + Date.now(),
      title: 'مهمة بانتظار المراجعة',
      message: `تم إرسال "${task.title}" للمراجعة`,
      userId: '1',
      taskId: task.id,
      read: false,
      createdAt: new Date().toISOString()
    };
    updateData({ ...data, tasks: updatedTasks, notifications: [...(data.notifications || []), notification] });
  };

  const handleApprove = () => {
    const updatedTasks = data.tasks.map(t => {
      if (t.id === id) {
        return {
          ...t,
          status: 'completed',
          progress: 100,
          logs: [...t.logs, {
            action: 'approved',
            userId: user.id,
            timestamp: new Date().toISOString()
          }]
        };
      }
      return t;
    });
    
    updateData({ ...data, tasks: updatedTasks });
    
    const notification = {
      id: 'notif-' + Date.now(),
      title: 'تمت الموافقة على المهمة',
      message: `تم اعتماد "${task.title}"`,
      userId: task.assignedTo,
      taskId: task.id,
      read: false,
      createdAt: new Date().toISOString()
    };
    updateData({ ...data, tasks: updatedTasks, notifications: [...(data.notifications || []), notification] });
  };

  const handleReject = () => {
    if (!rejectReason.trim()) {
      alert('يرجى إدخال سبب الرفض');
      return;
    }
    
    const updatedTasks = data.tasks.map(t => {
      if (t.id === id) {
        return {
          ...t,
          status: 'in-progress',
          logs: [...t.logs, {
            action: 'rejected',
            reason: rejectReason,
            userId: user.id,
            timestamp: new Date().toISOString()
          }]
        };
      }
      return t;
    });
    
    updateData({ ...data, tasks: updatedTasks });
    
    const notification = {
      id: 'notif-' + Date.now(),
      title: 'تم رفض المهمة',
      message: `تم رفض "${task.title}" - ${rejectReason}`,
      userId: task.assignedTo,
      taskId: task.id,
      read: false,
      createdAt: new Date().toISOString()
    };
    updateData({ ...data, tasks: updatedTasks, notifications: [...(data.notifications || []), notification] });
    
    setShowRejectModal(false);
    setRejectReason('');
  };

  const getStatusInfo = () => {
    const statusMap = {
      'new': { label: 'جديد', color: 'bg-blue-100 text-blue-700', icon: Clock },
      'in-progress': { label: 'قيد التنفيذ', color: 'bg-orange-100 text-orange-700', icon: Clock },
      'pending-review': { label: 'بان等待 المراجعة', color: 'bg-purple-100 text-purple-700', icon: AlertTriangle },
      'completed': { label: 'مكتمل', color: 'bg-green-100 text-green-700', icon: CheckCircle },
      'blocked': { label: 'متعثر', color: 'bg-red-100 text-red-700', icon: XCircle },
      'delayed': { label: 'مؤجل', color: 'bg-gray-100 text-gray-700', icon: Clock }
    };
    return statusMap[task.status] || statusMap['new'];
  };

  const statusInfo = getStatusInfo();
  const StatusIcon = statusInfo.icon;

  const priorityLabels = {
    'high': { label: 'عالية', color: 'bg-red-100 text-red-700' },
    'medium': { label: 'متوسطة', color: 'bg-orange-100 text-orange-700' },
    'low': { label: 'منخفضة', color: 'bg-green-100 text-green-700' }
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
      <div className="flex items-start gap-4">
        <Link to="/kanban" className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <div className="flex-1">
          <div className="flex items-start gap-3 mb-2">
            <span className={`badge ${statusInfo.color}`}>
              <StatusIcon className="w-4 h-4 ml-1" />
              {statusInfo.label}
            </span>
            <span className={`badge ${priorityLabels[task.priority]?.color}`}>
              {priorityLabels[task.priority]?.label}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-gray-800">{task.title}</h1>
        </div>
      </div>

      {/* Task Info Card */}
      <div className="card">
        <h3 className="font-semibold text-gray-800 mb-4">تفاصيل المهمة</h3>
        
        {task.description && (
          <p className="text-gray-600 mb-6">{task.description}</p>
        )}
        
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
            <User className="w-5 h-5 text-gray-400" />
            <div>
              <div className="text-xs text-gray-500">المسؤول</div>
              <div className="font-medium text-gray-800">{assignedUser?.name}</div>
            </div>
          </div>
          
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
            <Tag className="w-5 h-5 text-gray-400" />
            <div>
              <div className="text-xs text-gray-500">المرحلة</div>
              <div className="font-medium" style={{ color: stage?.color }}>{stage?.name}</div>
            </div>
          </div>
          
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
            <Calendar className="w-5 h-5 text-gray-400" />
            <div>
              <div className="text-xs text-gray-500">تاريخ البداية</div>
              <div className="font-medium text-gray-800">{formatDate(task.createdAt)}</div>
            </div>
          </div>
          
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
            <Calendar className="w-5 h-5 text-gray-400" />
            <div>
              <div className="text-xs text-gray-500">تاريخ الاستحقاق</div>
              <div className="font-medium text-gray-800">{formatDate(task.dueDate)}</div>
            </div>
          </div>
        </div>

        {/* Progress */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">نسبة الإنجاز</span>
            <span className="text-sm font-bold text-azm-green">{progress}%</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            {user.id === task.assignedTo && task.status !== 'completed' && (
              <select
                value={progress}
                onChange={(e) => handleUpdateProgress(parseInt(e.target.value))}
                className="px-3 py-1 rounded-lg border border-gray-200 text-sm"
              >
                {[0, 25, 50, 75, 100].map(p => (
                  <option key={p} value={p}>{p}%</option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      {/* Obstacles */}
      {task.obstacles && task.obstacles.length > 0 && (
        <div className="card border-red-200">
          <h3 className="font-semibold text-red-700 mb-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            المعوقات
          </h3>
          <div className="space-y-2">
            {task.obstacles.map((obstacle, index) => (
              <div key={index} className="p-3 bg-red-50 rounded-xl text-red-700">
                {obstacle}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      {task.status !== 'completed' && (
        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-4">الإجراءات</h3>
          <div className="flex flex-wrap gap-3">
            {user.id === task.assignedTo && (
              <>
                {task.status !== 'pending-review' && (
                  <button onClick={handleSendForReview} className="btn-secondary flex items-center gap-2">
                    <Send className="w-4 h-4" />
                    إرسال للمراجعة
                  </button>
                )}
              </>
            )}
            
            {user.role === 'director' && task.status === 'pending-review' && (
              <>
                <button onClick={handleApprove} className="btn-primary flex items-center gap-2 bg-green-600 hover:bg-green-700">
                  <ThumbsUp className="w-4 h-4" />
                  اعتماد
                </button>
                <button onClick={() => setShowRejectModal(true)} className="btn-secondary flex items-center gap-2 text-red-600 border-red-200 hover:bg-red-50">
                  <XCircle className="w-4 h-4" />
                  رفض
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Notes */}
      <div className="card">
        <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-gray-400" />
          الملاحظات
        </h3>
        
        <div className="space-y-3 mb-4">
          {task.notes && task.notes.length > 0 ? (
            task.notes.map((note, index) => {
              const noteUser = data.users?.find(u => u.id === note.userId);
              return (
                <div key={index} className="p-4 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-full bg-azm-green text-white flex items-center justify-center text-xs">
                      {noteUser?.name?.charAt(0)}
                    </div>
                    <span className="font-medium text-gray-800 text-sm">{noteUser?.name}</span>
                    <span className="text-xs text-gray-400">{formatDate(note.createdAt)}</span>
                  </div>
                  <p className="text-gray-600 text-sm">{note.text}</p>
                </div>
              );
            })
          ) : (
            <p className="text-center text-gray-400 py-4">لا توجد ملاحظات</p>
          )}
        </div>
        
        <div className="flex gap-2">
          <input
            type="text"
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="أضف ملاحظة..."
            className="input-field flex-1"
            onKeyPress={(e) => e.key === 'Enter' && handleAddNote()}
          />
          <button onClick={handleAddNote} className="btn-primary px-4">
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Activity Log */}
      <div className="card">
        <h3 className="font-semibold text-gray-800 mb-4">سجل التحديثات</h3>
        
        <div className="space-y-3">
          {task.logs && task.logs.length > 0 ? (
            task.logs.slice().reverse().map((log, index) => {
              const logUser = data.users?.find(u => u.id === log.userId);
              const actionLabels = {
                'status_changed': `تم تغيير الحالة من ${log.from} إلى ${log.to}`,
                'progress_updated': `تم تحديث التقدم من ${log.from}% إلى ${log.to}%`,
                'note_added': `تم إضافة ملاحظة: ${log.text}`,
                'sent_for_review': 'تم إرسال المهمة للمراجعة',
                'approved': 'تمت الموافقة على المهمة',
                'rejected': `تم رفض المهمة: ${log.reason}`
              };
              
              return (
                <div key={index} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
                  <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs">
                    {logUser?.name?.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-gray-800">{actionLabels[log.action] || log.action}</p>
                    <p className="text-xs text-gray-400">{formatDate(log.timestamp)}</p>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-center text-gray-400 py-4">لا يوجد سجل</p>
          )}
        </div>
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">رفض المهمة</h3>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="أدخل سبب الرفض..."
              className="input-field min-h-[100px] mb-4"
            />
            <div className="flex gap-3">
              <button onClick={handleReject} className="btn-primary bg-red-600 hover:bg-red-700 flex-1">
                تأكيد الرفض
              </button>
              <button onClick={() => setShowRejectModal(false)} className="btn-secondary flex-1">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}