import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { 
  ArrowRight,
  Calendar,
  CheckCircle,
  Clock,
  AlertTriangle,
  Plus,
  Send,
  ThumbsUp,
  XCircle,
  MessageSquare,
  AlertCircle,
  ChevronLeft
} from 'lucide-react';

export default function TaskDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { data, updateTask, addNote, addTaskLog } = useData();
  
  const getRoles = () => {
    if (!profile) return [];
    if (Array.isArray(profile.roles)) return profile.roles;
    if (typeof profile.roles === 'string' && profile.roles.startsWith('[')) {
      try { return JSON.parse(profile.roles); } catch { return []; }
    }
    return [];
  };
  
  const canApprove = profile?.role === 'admin' || profile?.role === 'director' || getRoles().includes('admin');
  
  const task = data.tasks?.find(t => t.id === id);
  const stage = data.stages?.find(s => s.id === task?.phase_id);
  
  const [newNote, setNewNote] = useState('');
  const [progress, setProgress] = useState(task?.progress || 0);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  if (data.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse">
          <div className="w-12 h-12 bg-azm-green rounded-xl"></div>
        </div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-800 mb-2">المهمة غير موجودة</h3>
        <Link to="/kanban" className="btn-primary">العودة للوحة المهام</Link>
      </div>
    );
  }

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    
    const result = await addNote({ content: newNote });
    if (result.success) {
      setNewNote('');
    }
  };

  const handleUpdateProgress = async (newProgress) => {
    const result = await updateTask(id, { progress: newProgress });
    if (result.success) {
      setProgress(newProgress);
    }
  };

  const handleSendForReview = async () => {
    const result = await updateTask(id, { status: 'pending-review' });
    if (result.success) {
      await addTaskLog(id, { action: 'sent_for_review' });
    }
  };

  const handleApprove = async () => {
    const result = await updateTask(id, { status: 'completed', progress: 100 });
    if (result.success) {
      await addTaskLog(id, { action: 'approved' });
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      alert('يرجى إدخال سبب الرفض');
      return;
    }
    
    const result = await updateTask(id, { status: 'in-progress' });
    if (result.success) {
      await addTaskLog(id, { action: 'rejected', details: { reason: rejectReason } });
    }
    
    setShowRejectModal(false);
    setRejectReason('');
  };

  const getStatusInfo = () => {
    const statusMap = {
      'new': { label: 'جديد', badgeClass: 'badge-new', icon: Clock },
      'in-progress': { label: 'قيد التنفيذ', badgeClass: 'badge-in-progress', icon: Clock },
      'pending-review': { label: 'بانتظار المراجعة', badgeClass: 'badge-pending-review', icon: AlertTriangle },
      'completed': { label: 'مكتمل', badgeClass: 'badge-completed', icon: CheckCircle },
      'blocked': { label: 'متعثر', badgeClass: 'badge-blocked', icon: XCircle },
      'delayed': { label: 'مؤجل', badgeClass: 'badge-delayed', icon: Clock }
    };
    return statusMap[task.status] || statusMap['new'];
  };

  const statusInfo = getStatusInfo();
  const StatusIcon = statusInfo.icon;

  const priorityLabels = {
    'high': { label: 'عالية', badgeClass: 'badge-priority-high' },
    'medium': { label: 'متوسطة', badgeClass: 'badge-priority-medium' },
    'low': { label: 'منخفضة', badgeClass: 'badge-priority-low' }
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
            <span className={`badge ${statusInfo.badgeClass}`}>
              <StatusIcon className="w-4 h-4 ml-1" />
              {statusInfo.label}
            </span>
            <span className={`badge ${priorityLabels[task.priority]?.badgeClass}`}>
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
            <Clock className="w-5 h-5 text-gray-400" />
            <div>
              <div className="text-xs text-gray-500">المرحلة</div>
              <div className="font-medium" style={{ color: stage?.color }}>{stage?.name}</div>
            </div>
          </div>
          
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
            <Calendar className="w-5 h-5 text-gray-400" />
            <div>
              <div className="text-xs text-gray-500">تاريخ البداية</div>
              <div className="font-medium text-gray-800">{formatDate(task.created_at)}</div>
            </div>
          </div>
          
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl col-span-2">
            <Calendar className="w-5 h-5 text-gray-400" />
            <div>
              <div className="text-xs text-gray-500">تاريخ الاستحقاق</div>
              <div className="font-medium text-gray-800">{formatDate(task.due_date)}</div>
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
            {user?.id === task.assigned_to && task.status !== 'completed' && (
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

      {/* Actions */}
      {task.status !== 'completed' && (
        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-4">الإجراءات</h3>
          <div className="flex flex-wrap gap-3">
            {user?.id === task.assigned_to && (
              <>
                {task.status !== 'pending-review' && (
                  <button onClick={handleSendForReview} className="btn-secondary flex items-center gap-2">
                    <Send className="w-4 h-4" />
                    إرسال للمراجعة
                  </button>
                )}
              </>
            )}
            
            {canApprove && task.status === 'pending-review' && (
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
          {data.notes?.filter(n => n.task_id === id).map((note, index) => (
            <div key={index} className="p-4 bg-gray-50 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-full bg-azm-green text-white flex items-center justify-center text-xs">
                  {note.created_by_name?.charAt(0)}
                </div>
                <span className="font-medium text-gray-800 text-sm">{note.created_by_name}</span>
                <span className="text-xs text-gray-400">{formatDate(note.created_at)}</span>
              </div>
              <p className="text-gray-600 text-sm">{note.content}</p>
            </div>
          ))}
          {(!data.notes?.filter(n => n.task_id === id) || data.notes?.filter(n => n.task_id === id).length === 0) && (
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