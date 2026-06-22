import { useState, useEffect } from 'react';
import { X, User, Mail, Shield, Briefcase } from 'lucide-react';
import { ROLES, isRoleHigherOrEqual, getRoleLabel } from '../lib/permissions';

export default function UserFormModal({ isOpen, onClose, onSubmit, user = null, currentUserRole }) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: ROLES.EMPLOYEE,
    position: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || '',
        email: user.email || '',
        role: user.role || ROLES.EMPLOYEE,
        position: user.position || ''
      });
    } else {
      setFormData({ name: '', email: '', role: ROLES.EMPLOYEE, position: '' });
    }
  }, [user, isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSubmit(formData);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const availableRoles = Object.values(ROLES).filter(role => 
    isRoleHigherOrEqual(currentUserRole, role)
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md animate-scale-in">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-azm-green/10 rounded-xl flex items-center justify-center">
                <User className="w-5 h-5 text-azm-green" />
              </div>
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white">
                {user ? 'تعديل المستخدم' : 'إضافة مستخدم جديد'}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <span className="flex items-center gap-2">
                <User className="w-4 h-4" />
                الاسم الكامل
              </span>
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              className="input-field"
              placeholder="اسم المستخدم"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <span className="flex items-center gap-2">
                <Mail className="w-4 h-4" />
                البريد الإلكتروني
              </span>
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              className="input-field"
              placeholder="email@azm.sa"
              dir="ltr"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <span className="flex items-center gap-2">
                <Briefcase className="w-4 h-4" />
                المنصب
              </span>
            </label>
            <input
              type="text"
              name="position"
              value={formData.position}
              onChange={handleChange}
              className="input-field"
              placeholder="منصب المستخدم"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <span className="flex items-center gap-2">
                <Shield className="w-4 h-4" />
                الدور
              </span>
            </label>
            <select
              name="role"
              value={formData.role}
              onChange={handleChange}
              className="input-field"
            >
              {availableRoles.map(role => (
                <option key={role} value={role}>
                  {getRoleLabel(role)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors font-medium"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 btn-primary"
            >
              {isSubmitting ? 'جاري الحفظ...' : (user ? 'حفظ التغييرات' : 'إضافة المستخدم')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}