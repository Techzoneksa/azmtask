import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

const DataContext = createContext(null);

export function DataProvider({ children }) {
  const { user, profile } = useAuth();
  const [data, setData] = useState({
    stages: [],
    tasks: [],
    blockers: [],
    documents: [],
    attendance: [],
    notes: [],
    notifications: [],
    settings: null
  });
  const [isLoading, setIsLoading] = useState(true);

  const fetchAllData = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    try {
      const [
        stagesRes,
        tasksRes,
        blockersRes,
        documentsRes,
        attendanceRes,
        notesRes,
        notificationsRes
      ] = await Promise.all([
        supabase.from('setup_phases').select('*').order('sort_order', { ascending: true }),
        supabase.from('tasks').select('*'),
        supabase.from('blockers').select('*'),
        supabase.from('documents').select('*'),
        supabase.from('attendance').select('*').order('work_date', { ascending: false }),
        supabase.from('notes').select('*').order('created_at', { ascending: false }),
        supabase.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
      ]);

      setData({
        stages: stagesRes.data || [],
        tasks: tasksRes.data || [],
        blockers: blockersRes.data || [],
        documents: documentsRes.data || [],
        attendance: attendanceRes.data || [],
        notes: notesRes.data || [],
        notifications: notificationsRes.data || [],
        settings: null
      });
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  useEffect(() => {
    if (!user) return;

    const tasksChannel = supabase
      .channel('tasks-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        fetchAllData();
      })
      .subscribe();

    const blockersChannel = supabase
      .channel('blockers-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'blockers' }, () => {
        fetchAllData();
      })
      .subscribe();

    const attendanceChannel = supabase
      .channel('attendance-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, () => {
        fetchAllData();
      })
      .subscribe();

    const notificationsChannel = supabase
      .channel('notifications-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => {
        fetchAllData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(tasksChannel);
      supabase.removeChannel(blockersChannel);
      supabase.removeChannel(attendanceChannel);
      supabase.removeChannel(notificationsChannel);
    };
  }, [user, fetchAllData]);

  const updateTask = async (taskId, updates) => {
    try {
      const { data: updatedTask, error } = await supabase
        .from('tasks')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', taskId)
        .select()
        .single();

      if (error) throw error;

      if (profile && profile.role === 'director' && updates.status === 'completed') {
        const assignedUserId = data.tasks.find(t => t.id === taskId)?.assigned_to;
        if (assignedUserId) {
          await supabase.from('notifications').insert({
            title: 'تمت الموافقة على المهمة',
            message: `تم اعتماد "${updatedTask.title}"`,
            user_id: assignedUserId,
            task_id: taskId,
            read: false
          });
        }
      }

      await fetchAllData();
      return { success: true };
    } catch (error) {
      console.error('Error updating task:', error);
      return { success: false, error: error.message };
    }
  };

  const addTask = async (taskData) => {
    try {
      const dueDate = taskData.due_date 
        ? new Date(taskData.due_date).toISOString()
        : new Date().toISOString();
      
      const newTask = {
        title: taskData.title,
        description: taskData.description || '',
        status: taskData.status || 'new',
        phase_id: taskData.phase_id || data.stages?.[0]?.id || null,
        assigned_to: taskData.assigned_to || user?.id,
        priority: taskData.priority || 'medium',
        due_date: dueDate,
        progress: typeof taskData.progress === 'number' ? taskData.progress : 0
      };

      const { error } = await supabase.from('tasks').insert(newTask);

      if (error) {
        console.error('Task save error:', error);
        throw error;
      }

      await fetchAllData();
      return { success: true };
    } catch (error) {
      console.error('Error adding task:', error);
      return { success: false, error: error.message };
    }
  };

  const addTaskLog = async (taskId, logEntry) => {
    try {
      await supabase.from('task_updates').insert({
        task_id: taskId,
        action: logEntry.action,
        details: logEntry.details || null,
        user_id: user?.id
      });
      return { success: true };
    } catch (error) {
      console.error('Error adding task log:', error);
      return { success: false, error: error.message };
    }
  };

  const addNote = async (noteData) => {
    try {
      const { data: newNote, error } = await supabase.from('notes').insert({
        title: noteData.title || 'ملاحظة جديدة',
        content: noteData.content,
        task_id: noteData.taskId || null,
        created_by: user?.id,
        created_by_name: profile?.name || 'مستخدم',
        read: false,
        status: 'active'
      }).select().single();

      if (error) throw error;

      const targetUserId = profile?.role === 'director' 
        ? '22222222-2222-2222-2222-222222222222' 
        : '11111111-1111-1111-1111-111111111111';

      await supabase.from('notifications').insert({
        title: 'ملاحظة جديدة',
        message: `${profile?.name}: ${noteData.content.substring(0, 50)}...`,
        user_id: targetUserId,
        read: false
      });

      await fetchAllData();
      return { success: true };
    } catch (error) {
      console.error('Error adding note:', error);
      return { success: false, error: error.message };
    }
  };

  const checkIn = async () => {
    try {
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      
      const { data: existing } = await supabase
        .from('attendance')
        .select('*')
        .eq('user_id', user?.id)
        .eq('work_date', today)
        .single();
      
      if (existing) {
        return { success: false, error: 'تم تسجيل الحضور مسبقًا' };
      }
      
      const newRecord = {
        user_id: user?.id,
        user_name: profile?.name,
        work_date: today,
        check_in_time: now.toISOString(),
        status: 'present'
      };

      const { error } = await supabase.from('attendance').insert(newRecord);
      if (error) {
        console.error('Attendance check-in error:', error);
        throw error;
      }

      await supabase.from('notifications').insert({
        title: 'تسجيل حضور',
        message: `تم تسجيل حضور ${profile?.name}`,
        user_id: '11111111-1111-1111-1111-111111111111',
        read: false
      });

      await fetchAllData();
      return { success: true };
    } catch (error) {
      console.error('Error checking in:', error);
      return { success: false, error: error.message };
    }
  };

  const checkOut = async (attendanceId) => {
    try {
      const now = new Date();
      
      const { data: record } = await supabase
        .from('attendance')
        .select('*')
        .eq('id', attendanceId)
        .single();

      if (!record) return { success: false, error: 'Record not found' };
      
      if (record.check_out_time) {
        return { success: false, error: 'تم تسجيل الخروج مسبقًا' };
      }

      const checkInTime = new Date(record.check_in_time);
      const hours = (now - checkInTime) / (1000 * 60 * 60);

      const { error } = await supabase
        .from('attendance')
        .update({
          check_out_time: now.toISOString(),
          total_hours: Math.round(hours * 10) / 10,
          updated_at: now.toISOString()
        })
        .eq('id', attendanceId);
        
      if (error) {
        console.error('Attendance check-out error:', error);
        throw error;
      }

      await supabase.from('notifications').insert({
        title: 'تسجيل انصراف',
        message: `تم تسجيل انصراف ${profile?.name} - ${Math.round(hours * 10) / 10} ساعات`,
        user_id: '11111111-1111-1111-1111-111111111111',
        read: false
      });

      await fetchAllData();
      return { success: true };
    } catch (error) {
      console.error('Error checking out:', error);
      return { success: false, error: error.message };
    }
  };

  const addBlocker = async (blockerData) => {
    try {
      const { error } = await supabase.from('blockers').insert({
        title: blockerData.title,
        description: blockerData.description,
        phase_id: blockerData.stageId || null,
        priority: blockerData.priority,
        status: 'open'
      });

      if (error) throw error;

      const targetUserId = profile?.role === 'director' 
        ? '22222222-2222-2222-2222-222222222222' 
        : '11111111-1111-1111-1111-111111111111';

      await supabase.from('notifications').insert({
        title: 'تم إضافة تحدٍ تشغيلي جديد',
        message: `تم تسجيل تحدٍ تشغيلي: ${blockerData.title}`,
        user_id: targetUserId,
        read: false
      });

      await fetchAllData();
      return { success: true };
    } catch (error) {
      console.error('Error adding blocker:', error);
      return { success: false, error: error.message };
    }
  };

  const resolveBlocker = async (blockerId) => {
    try {
      const { error } = await supabase
        .from('blockers')
        .update({ 
          status: 'resolved',
          resolved_at: new Date().toISOString()
        })
        .eq('id', blockerId);

      if (error) throw error;

      await supabase.from('notifications').insert({
        title: 'تم حل التحدي التشغيلي',
        message: `تم إغلاق التحدي التشغيلي`,
        user_id: profile?.role === 'director' ? '22222222-2222-2222-2222-222222222222' : '11111111-1111-1111-1111-111111111111',
        read: false
      });

      await fetchAllData();
      return { success: true };
    } catch (error) {
      console.error('Error resolving blocker:', error);
      return { success: false, error: error.message };
    }
  };

  const markNotificationRead = async (notificationId) => {
    try {
      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notificationId);

      await fetchAllData();
      return { success: true };
    } catch (error) {
      console.error('Error marking notification read:', error);
      return { success: false, error: error.message };
    }
  };

  const updatePhase = async (phaseId, updates) => {
    try {
      const { error } = await supabase
        .from('setup_phases')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', phaseId);

      if (error) throw error;

      await fetchAllData();
      return { success: true };
    } catch (error) {
      console.error('Error updating phase:', error);
      return { success: false, error: error.message };
    }
  };

  const refreshData = () => {
    fetchAllData();
  };

  return (
    <DataContext.Provider value={{ 
      data, 
      isLoading,
      updateTask,
      updatePhase,
      addTask,
      addTaskLog,
      addNote,
      checkIn,
      checkOut,
      addBlocker,
      resolveBlocker,
      markNotificationRead,
      refreshData
    }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
}