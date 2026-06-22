import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useFeedback } from '../context/FeedbackContext';
import { supabase } from '../lib/supabase';
import { hasPermission, canManageUser, ROLES } from '../lib/permissions';
import PermissionGate from '../components/PermissionGate';
import UserTable from '../components/UserTable';
import UserFormModal from '../components/UserFormModal';
import { Users, UserPlus, Shield, UserCheck, TrendingUp } from 'lucide-react';

export default function UsersPage() {
  const { profile } = useAuth();
  const { success, error } = useFeedback();
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      setUsers(data || []);
    } catch (err) {
      console.error('Error fetching users:', err);
      error('تعذر تحميل قائمة المستخدمين');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleAddUser = async (formData) => {
    try {
      const { data, error } = await supabase.rpc('admin_create_user', {
        p_email: formData.email,
        p_password: formData.password,
        p_name: formData.name,
        p_position: formData.position,
        p_role: formData.role
      });

      if (error) {
        console.error('Create user RPC error:', error);
        error('تعذر إضافة المستخدم: ' + (error.message || 'خطأ غير معروف'));
        return;
      }

      if (!data?.success) {
        console.error('Create user RPC failed:', data);
        error(data?.message || 'تعذر إضافة المستخدم');
        return;
      }

      success('تم إضافة المستخدم بنجاح');
      setModalOpen(false);
      fetchUsers();
    } catch (err) {
      console.error('Error creating user:', err);
      error('تعذر إضافة المستخدم: ' + err.message);
    }
  };

  const handleEditUser = async (formData) => {
    if (!editingUser) return;
    
    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          name: formData.name,
          role: formData.role,
          position: formData.position || null
        })
        .eq('id', editingUser.id);

      if (updateError) throw updateError;

      success('تم تحديث بيانات المستخدم بنجاح');
      setModalOpen(false);
      setEditingUser(null);
      fetchUsers();
    } catch (err) {
      console.error('Error updating user:', err);
      error('تعذر تحديث المستخدم: ' + err.message);
    }
  };

  const handleDeleteUser = async (user) => {
    if (!confirm(`هل أنت متأكد من حذف المستخدم "${user.name}"؟`)) return;

    try {
      const { error: deleteProfileError } = await supabase
        .from('profiles')
        .delete()
        .eq('id', user.id);

      if (deleteProfileError) throw deleteProfileError;

      const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(user.id);
      if (deleteAuthError) console.error('Auth delete error:', deleteAuthError);

      success('تم حذف المستخدم بنجاح');
      fetchUsers();
    } catch (err) {
      console.error('Error deleting user:', err);
      error('تعذر حذف المستخدم: ' + err.message);
    }
  };

  const handleToggleActive = async (user) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: !user.is_active })
        .eq('id', user.id);

      if (error) throw error;

      success(user.is_active ? 'تم إيقاف حساب المستخدم' : 'تم تفعيل حساب المستخدم');
      fetchUsers();
    } catch (err) {
      console.error('Error toggling user active:', err);
      error('تعذر تعديل حالة المستخدم');
    }
  };

  const stats = {
    total: users.length,
    active: users.filter(u => u.is_active).length,
    directors: users.filter(u => u.role === ROLES.DIRECTOR || u.role === ROLES.ADMIN).length,
    employees: users.filter(u => u.role === ROLES.EMPLOYEE || u.role === ROLES.SUPERVISOR).length
  };

  return (
    <PermissionGate permission="users:view" fallback={
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <Shield className="w-16 h-16 text-gray-300 mb-4" />
        <h2 className="text-xl font-semibold text-gray-600">غير مصرح بالوصول</h2>
        <p className="text-gray-500 mt-2">لا تملك صلاحيةعرض قائمة المستخدمين</p>
      </div>
    }>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-azm-green to-azm-green-light rounded-xl flex items-center justify-center">
              <Users className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">إدارة المستخدمين</h1>
              <p className="text-gray-500">إدارة حسابات المستخدمين وصلاحياتهم</p>
            </div>
          </div>
          <PermissionGate permission="users:create">
            <button
              onClick={() => { setEditingUser(null); setModalOpen(true); }}
              className="btn-primary flex items-center gap-2"
            >
              <UserPlus className="w-5 h-5" />
              إضافة مستخدم
            </button>
          </PermissionGate>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-800">{stats.total}</p>
                <p className="text-sm text-gray-500">إجمالي المستخدمين</p>
              </div>
            </div>
          </div>
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                <UserCheck className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-800">{stats.active}</p>
                <p className="text-sm text-gray-500">مستخدمين نشطين</p>
              </div>
            </div>
          </div>
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                <Shield className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-800">{stats.directors}</p>
                <p className="text-sm text-gray-500">مديرين</p>
              </div>
            </div>
          </div>
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-800">{stats.employees}</p>
                <p className="text-sm text-gray-500">موظفين ومشرفين</p>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700">
            <h2 className="text-lg font-semibold text-gray-800">قائمة المستخدمين</h2>
          </div>
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin w-8 h-8 border-4 border-azm-green border-t-transparent rounded-full"></div>
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-center">
              <Users className="w-12 h-12 text-gray-300 mb-2" />
              <p className="text-gray-500">لا يوجد مستخدمين</p>
            </div>
          ) : (
            <UserTable
              users={users}
              onEdit={(user) => { setEditingUser(user); setModalOpen(true); }}
              onDelete={handleDeleteUser}
              onToggleActive={handleToggleActive}
              currentUserId={profile?.id}
            />
          )}
        </div>

        <UserFormModal
          isOpen={modalOpen}
          onClose={() => { setModalOpen(false); setEditingUser(null); }}
          onSubmit={editingUser ? handleEditUser : handleAddUser}
          user={editingUser}
          currentUserRole={profile?.role}
        />
      </div>
    </PermissionGate>
  );
}