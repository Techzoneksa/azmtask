import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { 
  MessageSquare, 
  Plus,
  Send,
  Check
} from 'lucide-react';

export default function Notes() {
  const { user } = useAuth();
  const { data, addNote } = useData();
  const [showAddModal, setShowAddModal] = useState(false);
  const [newNote, setNewNote] = useState({ title: '', content: '', taskId: '' });

  const notes = data.notes || [];
  const sortedNotes = [...notes].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const handleAddNote = async () => {
    if (!newNote.content.trim()) return;
    
    const result = await addNote({
      title: newNote.title,
      content: newNote.content,
      taskId: newNote.taskId
    });
    
    if (result.success) {
      setNewNote({ title: '', content: '', taskId: '' });
      setShowAddModal(false);
    }
  };

  const getTaskById = (taskId) => {
    return data.tasks?.find(t => t.id === taskId);
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('ar-SA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const unreadCount = notes.filter(n => !n.read && n.created_by !== user?.id).length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-500 rounded-xl flex items-center justify-center">
            <MessageSquare className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">الملاحظات والاعتمادات</h1>
            <p className="text-gray-500">ملاحظات بين عبدالرحمن والأستاذ سلطان</p>
          </div>
        </div>
        
        <button 
          onClick={() => setShowAddModal(true)}
          className="btn-primary flex items-center gap-2 text-sm"
        >
          <Plus className="w-4 h-4" />
          إضافة ملاحظة
        </button>
      </div>

      {/* Unread Count */}
      {unreadCount > 0 && (
        <div className="card bg-indigo-50 border-indigo-200 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-indigo-500 text-white flex items-center justify-center">
            {unreadCount}
          </div>
          <div>
            <p className="font-medium text-indigo-800">ملاحظات غير مقروءة</p>
            <p className="text-sm text-indigo-600">لديك {unreadCount} ملاحظة جديدة</p>
          </div>
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-800">إضافة ملاحظة جديدة</h3>
              <button onClick={() => setShowAddModal(false)} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                ✕
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">العنوان (اختياري)</label>
                <input
                  type="text"
                  value={newNote.title}
                  onChange={(e) => setNewNote({ ...newNote, title: e.target.value })}
                  className="input-field"
                  placeholder="عنوان الملاحظة..."
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">المحتوى</label>
                <textarea
                  value={newNote.content}
                  onChange={(e) => setNewNote({ ...newNote, content: e.target.value })}
                  className="input-field min-h-[120px]"
                  placeholder="نص الملاحظة..."
                />
              </div>
              
              <button onClick={handleAddNote} className="btn-primary w-full">
                إضافة الملاحظة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notes List */}
      <div className="space-y-4">
        {sortedNotes.map(note => {
          const relatedTask = note.task_id ? getTaskById(note.task_id) : null;
          const isOwnNote = note.created_by === user?.id;
          
          return (
            <div key={note.id} className={`card ${note.read || isOwnNote ? '' : 'border-r-4 border-r-indigo-500'}`}>
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  isOwnNote ? 'bg-azm-green text-white' : 'bg-gray-200 text-gray-600'
                }`}>
                  {note.created_by_name?.charAt(0)}
                </div>
                
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h3 className="font-semibold text-gray-800">{note.title}</h3>
                      <span className="text-sm text-gray-500">{note.created_by_name}</span>
                    </div>
                    {note.read && (
                      <span className="badge badge-green text-xs">مقروء</span>
                    )}
                  </div>
                  
                  <p className="text-gray-600 mb-3">{note.content}</p>
                  
                  {relatedTask && (
                    <Link 
                      to={`/task/${relatedTask.id}`}
                      className="inline-flex items-center gap-2 text-sm text-azm-green hover:underline"
                    >
                      <Send className="w-4 h-4" />
                      عرض المهمة المرتبطة
                    </Link>
                  )}
                  
                  <p className="text-xs text-gray-400 mt-3">{formatDate(note.created_at)}</p>
                </div>
              </div>
            </div>
          );
        })}
        
        {sortedNotes.length === 0 && (
          <div className="card text-center py-12">
            <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="font-semibold text-gray-800 mb-2">لا توجد ملاحظات</h3>
            <p className="text-gray-500">أضف أول ملاحظة للتواصل مع المدير</p>
          </div>
        )}
      </div>
    </div>
  );
}