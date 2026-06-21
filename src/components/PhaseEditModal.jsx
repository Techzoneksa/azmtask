import { useState } from 'react';
import { X } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useFeedback } from '../context/FeedbackContext';

export default function PhaseEditModal({ phase, onClose, onSuccess }) {
  const { updatePhase } = useData();
  const { success, error } = useFeedback();
  
  const [formData, setFormData] = useState({
    title: phase.title || phase.name || '',
    description: phase.description || '',
    status: phase.status || 'not-started',
    progress: phase.progress || 0,
    sort_order: phase.sort_order || phase.order || 0
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
        description: formData.description || null,
        status: formData.status,
        progress: typeof formData.progress === 'string' ? parseInt(formData.progress) : formData.progress,
        sort_order: formData.sort_order
      };

      const result = await updatePhase(phase.id, updates);
      
      if (result.success) {
        success('تم تحديث المرحلة بنجاح');
        onSuccess();
        onClose();
      } else {
        console.error('Phase update error:', result.error);
        error('تعذر تحديث المرحلة، حاول مرة أخرى');
      }
    } catch (err) {
      console.error('Phase update error:', err);
      error('تعذر تحديث المرحلة، حاول مرة أخرى');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-hidden">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">تحرير المرحلة</h2>
          <button 
            onClick={onClose} 
            className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto max-h-[calc(90vh-180px)]">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">اسم المرحلة *</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => handleChange('title', e.target.value)}
              className="input-field dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600 dark:placeholder-slate-400"
              placeholder="أدخل اسم المرحلة"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">الوصف</label>
            <textarea
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              className="input-field min-h-[80px] dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600 dark:placeholder-slate-400"
              placeholder="أدخل وصف المرحلة"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">الحالة</label>
              <select
                value={formData.status}
                onChange={(e) => handleChange('status', e.target.value)}
                className="input-field dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600"
              >
                <option value="not-started">لم تبدأ</option>
                <option value="in-progress">قيد التنفيذ</option>
                <option value="completed">مكتمل</option>
                <option value="delayed">مؤجل</option>
                <option value="blocked">متعثر</option>
              </select>
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
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">ترتيب المرحلة</label>
            <input
              type="number"
              value={formData.sort_order}
              onChange={(e) => handleChange('sort_order', parseInt(e.target.value))}
              className="input-field dark:bg-slate-700 dark:text-slate-100 dark:border-slate-600"
              min="0"
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