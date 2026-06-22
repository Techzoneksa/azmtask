import { useState } from 'react';
import { MoreHorizontal, Edit, Trash2, UserCheck } from 'lucide-react';
import RoleBadge from './RoleBadge';

export default function UserTable({ users, onEdit, onDelete, onToggleActive, currentUserId }) {
  const [openMenu, setOpenMenu] = useState(null);

  const toggleMenu = (userId) => {
    setOpenMenu(openMenu === userId ? null : userId);
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-700">
            <th className="text-right py-4 px-4 text-sm font-semibold text-gray-600 dark:text-gray-400">المستخدم</th>
            <th className="text-right py-4 px-4 text-sm font-semibold text-gray-600 dark:text-gray-400">البريد الإلكتروني</th>
            <th className="text-right py-4 px-4 text-sm font-semibold text-gray-600 dark:text-gray-400">المنصب</th>
            <th className="text-right py-4 px-4 text-sm font-semibold text-gray-600 dark:text-gray-400">الدور</th>
            <th className="text-right py-4 px-4 text-sm font-semibold text-gray-600 dark:text-gray-400">الحالة</th>
            <th className="text-right py-4 px-4 text-sm font-semibold text-gray-600 dark:text-gray-400">إجراء</th>
          </tr>
        </thead>
        <tbody>
          {users?.map(user => (
            <tr key={user.id} className="border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
              <td className="py-4 px-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-azm-green to-azm-green-light rounded-xl flex items-center justify-center text-white font-semibold">
                    {user.name?.charAt(0) || '؟'}
                  </div>
                  <div>
                    <p className="font-medium text-gray-800 dark:text-white">{user.name}</p>
                    {user.id === currentUserId && (
                      <span className="text-xs text-azm-green">أنت</span>
                    )}
                  </div>
                </div>
              </td>
              <td className="py-4 px-4">
                <span className="text-gray-600 dark:text-gray-400" dir="ltr">{user.email}</span>
              </td>
              <td className="py-4 px-4">
                <span className="text-gray-600 dark:text-gray-400">{user.position || '-'}</span>
              </td>
              <td className="py-4 px-4">
                <RoleBadge role={user.role} />
              </td>
              <td className="py-4 px-4">
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                  user.is_active 
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                }`}>
                  {user.is_active ? 'نشط' : 'متوقف'}
                </span>
              </td>
              <td className="py-4 px-4">
                <div className="relative">
                  <button
                    onClick={() => toggleMenu(user.id)}
                    className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center transition-colors"
                  >
                    <MoreHorizontal className="w-5 h-5 text-gray-500" />
                  </button>
                  {openMenu === user.id && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(null)} />
                      <div className="absolute left-0 top-full mt-1 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 py-1 min-w-[140px] z-20 animate-scale-in">
                        <button
                          onClick={() => { onEdit(user); setOpenMenu(null); }}
                          className="w-full flex items-center gap-2 px-4 py-2.5 text-gray-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-sm"
                        >
                          <Edit className="w-4 h-4" />
                          تعديل
                        </button>
                        <button
                          onClick={() => { onToggleActive(user); setOpenMenu(null); }}
                          className="w-full flex items-center gap-2 px-4 py-2.5 text-gray-700 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-sm"
                        >
                          <UserCheck className="w-4 h-4" />
                          {user.is_active ? 'إيقاف' : 'تفعيل'}
                        </button>
                        {user.id !== currentUserId && (
                          <button
                            onClick={() => { onDelete(user); setOpenMenu(null); }}
                            className="w-full flex items-center gap-2 px-4 py-2.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-sm"
                          >
                            <Trash2 className="w-4 h-4" />
                            حذف
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}