import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useFeedback } from '../context/FeedbackContext';
import { useAuth } from '../context/AuthContext';

export default function TaskEditModal({ task, onClose, onSuccess }) {
  const { updateTask } = useData();
  const { success, error } = useFeedback();
  const { user, profile } = useAuth();
  
  const [formData, setFormData] = useState({
    title: task.title || '',
    description: task.description || '',
    phase_id: task.phase_id || '',
    assigned_to: task.assigned_to || user?.id || '',
    priority: task.priority || 'medium',
    status: task.status || 'new',
    due_date: task.due_date ? new Date(task.due_date).toISOString().split('T')[0] : '',
    progress: task.progress || 0,
    start_date: task.start_date || '',
    category: task.category || '',
    notes: task.notes || ''
  });
  
  const [isSaving, setIsSaving] = useState(false);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    
    try {
      const updates = {
        title: formData.title,
        description: formData.description,
        phase_id: formData.phase_id || null,
        assigned_to: formData.assigned_to || null,
        priority: formData.priority,
        status: formData.status,
        progress: typeof formData.progress === 'string' ? parseInt(formData.progress) : formData.progress,
        due_date: formData.due_date ? new Date(formData.due_date).toISOString() : null,
        start_date: formData.start_date ? new Date(formData.start_date).toISOString() : null,
        category: formData.category || null,
        notes: formData.notes || null
      };

      const result = await updateTask(task.id, updates);
      
      if (result.success) {
        success('تم تحديث المهمة بنجاح');
        onSuccess();
        onClose();
      } else {
        console.error('Task update error:', result.error);
        error('تعذر تحديث المهمة، حاول مرة أخرى');
      }
    } catch (err) {
      console.error('Task update error:', err);
      error('تعذر تحديث المهمة، حاول مرة أخرى');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-hidden">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">تحرير المهمة</h2>
          <button 
            onClick={onClose} 
            className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto max-h-[calc(90vh-180px)]">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">عنوان المهمة *</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => handleChange('title', e.target.value)}
              className="input-field dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600 dark:placeholder-slate-400"
              placeholder="أدخل عنوان المهمة"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">الوصف</label>
            <textarea
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              className="input-field min-h-[80px] dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600 dark:placeholder-slate-400"
              placeholder="أدخل وصف المهمة"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">المرحلة</label>
              <select
                value={formData.phase_id}
                onChange={(e) => handleChange('phase_id', e.target.value)}
                className="input-field dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600"
              >
                <option value="">اختر المرحلة</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">الحالة</label>
              <select
                value={formData.status}
                onChange={(e) => handleChange('status', e.target.value)}
                className="input-field dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600"
              >
                <option value="new">جديد</option>
                <option value="in-progress">قيد التنفيذ</option>
                <option value="pending-review">بانتظار المراجعة</option>
                <option value="completed">مكتمل</option>
                <option value="delayed">مؤجل</option>
                <option value="blocked">متعثر</option>
              </select>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">المسؤول</label>
              <select
                value={formData.assigned_to}
                onChange={(e) => handleChange('assigned_to', e.target.value)}
                className="input-field dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600"
              >
                <option value={user?.id}>أنا</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">الأولوية</label>
              <select
                value={formData.priority}
                onChange={(e) => handleChange('priority', e.target.value)}
                className="input-field dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600"
              >
                <option value="low">منخفضة</option>
                <option value="medium">متوسطة</option>
                <option value="high">عالية</option>
                <option value="urgent">عاجلة جدًا</option>
              </select>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">تاريخ البدء</label>
              <input
                type="date"
                value={formData.start_date}
                onChange={(e) => handleChange('start_date', e.target.value)}
                className="input-field dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">تاريخ الاستحقاق</label>
              <input
                type="date"
                value={formData.due_date}
                onChange={(e) => handleChange('due_date', e.target.value)}
                className="input-field dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">نسبة الإنجاز</label>
            <select
              value={formData.progress}
              onChange={(e) => handleChange('progress', parseInt(e.target.value))}
              className="input-field dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600"
            >
              <option value="0">0%</option>
              <option value="25">25%</option>
              <option value="50">50%</option>
              <option value="75">75%</option>
              <option value="100">100%</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">التصنيف</label>
            <input
              type="text"
              value={formData.category}
              onChange={(e) => handleChange('category', e.target.value)}
              className="input-field dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600 dark:placeholder-slate-400"
              placeholder="أدخل تصنيف المهمة"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">ملاحظات</label>
            <textarea
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              className="input-field min-h-[60px] dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600 dark:placeholder-slate-400"
              placeholder="أدخل ملاحظات إضافية"
            />
          </div>
          
          <div className="flex gap-3 pt-4">
            <button 
              type="submit" 
              disabled={isSaving}
              className="btn-primary flex-1 disabled:opacity-50"
            >
              {isSaving ? 'جاري الحفظ...' : 'حفظ التغييرات'}
            </button>
            <button 
              type="button" 
              onClick={onClose} 
              className="btn-secondary dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600"
            >
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}