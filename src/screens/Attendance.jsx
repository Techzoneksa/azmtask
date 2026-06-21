import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useFeedback } from '../context/FeedbackContext';
import StatCard from '../components/StatCard';
import EmptyState from '../components/EmptyState';
import { 
  Clock, 
  LogOut,
  LogIn,
  Calendar,
  FileText,
  CheckCircle,
  AlertCircle,
  Timer,
  User
} from 'lucide-react';

export default function Attendance() {
  const { user, profile } = useAuth();
  const { data, checkIn, checkOut } = useData();
  const { success, error, warning } = useFeedback();
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  const getTodayRecord = () => {
    const today = new Date().toISOString().split('T')[0];
    return data.attendance?.find(a => 
      a.work_date === today && a.user_id === user?.id
    );
  };

  const todayRecord = getTodayRecord();

  const handleCheckIn = async () => {
    setLoading(true);
    const result = await checkIn();
    setLoading(false);
    if (result.success) {
      success('تم تسجيل الحضور بنجاح');
    } else {
      console.error('Check-in error:', result.error);
      error(result.error || 'تعذر تسجيل الحضور، حاول مرة أخرى');
    }
  };

  const handleCheckOut = async () => {
    if (!todayRecord) return;
    setLoading(true);
    const result = await checkOut(todayRecord.id);
    setLoading(false);
    if (result.success) {
      success('تم تسجيل الخروج بنجاح');
    } else {
      console.error('Check-out error:', result.error);
      warning(result.error || 'تعذر تسجيل الخروج، حاول مرة أخرى');
    }
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '--:--';
    return new Date(dateStr).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('ar-SA', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getTodayStats = () => {
    const today = new Date().toISOString().split('T')[0];
    const todayRecords = data.attendance?.filter(a => 
      a.work_date === today
    ) || [];
    
    const totalHours = todayRecords.reduce((sum, r) => sum + (r.total_hours || 0), 0);
    return { count: todayRecords.length, hours: totalHours };
  };

  const getAllRecords = () => {
    return (data.attendance || [])
      .filter(a => a.user_id === user?.id)
      .slice(0, 30);
  };

  const getRoles = () => {
    if (!profile) return [];
    if (Array.isArray(profile.roles)) return profile.roles;
    if (typeof profile.roles === 'string' && profile.roles.startsWith('[')) {
      try { return JSON.parse(profile.roles); } catch { return []; }
    }
    return [];
  };

  const isDirector = profile?.role === 'admin' || profile?.role === 'director' || getRoles().includes('admin');

  const totalHoursThisWeek = data.attendance
    ?.filter(a => a.user_id === user?.id)
    .reduce((sum, r) => sum + (r.total_hours || 0), 0) || 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 bg-gradient-to-br from-emerald-600 to-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
          <Clock className="w-7 h-7 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">الحضور والانصراف</h1>
          <p className="text-slate-500 dark:text-slate-400">{user?.name}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={Calendar}
          label="تاريخ اليوم"
          value={new Date().toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' })}
          color="#0369A1"
          bgColor="#E0F2FE"
        />
        <StatCard
          icon={Timer}
          label="إجمالي الساعات"
          value={todayRecord?.total_hours || 0}
          color="#059669"
          bgColor="#D1FAE5"
          description="ساعة اليوم"
        />
        <StatCard
          icon={CheckCircle}
          label="حالة اليوم"
          value={todayRecord ? (todayRecord.check_out_time ? 'انصراف' : 'حاضر') : 'غائب'}
          color={todayRecord ? (todayRecord.check_out_time ? '#15803D' : '#4338CA') : '#EF4444'}
          bgColor={todayRecord ? (todayRecord.check_out_time ? '#DCFCE7' : '#EEF2FF') : '#FFE4E6'}
        />
        <StatCard
          icon={Clock}
          label="ساعات الأسبوع"
          value={totalHoursThisWeek}
          color="#B45309"
          bgColor="#FEF3C7"
          description="ساعة"
        />
      </div>

      {/* Today's Card */}
      <div className="card-glass">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 bg-azm-green/10 rounded-2xl flex items-center justify-center">
            <Calendar className="w-7 h-7 text-azm-green" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">سجل اليوم</h2>
            <p className="text-sm text-slate-500">{formatDate(new Date().toISOString())}</p>
          </div>
        </div>

        {todayRecord ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {/* Check In */}
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-2xl p-5 text-center border border-green-100 dark:border-green-900/30">
                <div className="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-900/40 flex items-center justify-center mx-auto mb-3">
                  <LogIn className="w-6 h-6 text-green-600" />
                </div>
                <div className="text-sm text-slate-500 mb-1">وقت الحضور</div>
                <div className="text-2xl font-bold text-green-700 dark:text-green-400">
                  {formatTime(todayRecord.check_in_time)}
                </div>
              </div>
              
              {/* Check Out */}
              <div className={`rounded-2xl p-5 text-center border ${
                todayRecord.check_out_time 
                  ? 'bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-blue-100 dark:border-blue-900/30'
                  : 'bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 border-orange-100 dark:border-orange-900/30'
              }`}>
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3 ${
                  todayRecord.check_out_time 
                    ? 'bg-blue-100 dark:bg-blue-900/40' 
                    : 'bg-orange-100 dark:bg-orange-900/40'
                }`}>
                  <LogOut className={`w-6 h-6 ${todayRecord.check_out_time ? 'text-blue-600' : 'text-orange-600'}`} />
                </div>
                <div className="text-sm text-slate-500 mb-1">وقت الانصراف</div>
                <div className={`text-2xl font-bold ${
                  todayRecord.check_out_time 
                    ? 'text-blue-700 dark:text-blue-400' 
                    : 'text-orange-700 dark:text-orange-400'
                }`}>
                  {todayRecord.check_out_time ? formatTime(todayRecord.check_out_time) : 'لم يسجل'}
                </div>
              </div>
            </div>
            
            {/* Total Hours */}
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-5 text-center">
              <div className="flex items-center justify-center gap-3">
                <Timer className="w-6 h-6 text-azm-green" />
                <div>
                  <div className="text-sm text-slate-500">إجمالي ساعات اليوم</div>
                  <div className="text-3xl font-bold text-azm-green">{todayRecord.total_hours || 0}</div>
                </div>
              </div>
              <div className="text-sm text-slate-400 mt-1">ساعة</div>
            </div>

            {!todayRecord.check_out_time && (
              <button
                onClick={handleCheckOut}
                disabled={loading}
                className="btn-primary w-full flex items-center justify-center gap-2 py-4 text-lg shadow-lg shadow-blue-500/20"
              >
                <LogOut className="w-5 h-5" />
                {loading ? 'جاري التسجيل...' : 'تسجيل الانصراف'}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-8 text-center">
              <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Clock className="w-8 h-8 text-slate-400" />
              </div>
              <p className="text-slate-500 dark:text-slate-400 mb-2">لم تسجل الحضور اليوم</p>
              <p className="text-sm text-slate-400">اضغط زر الحضور لتسجيل دخولك</p>
            </div>
            
            <button
              onClick={handleCheckIn}
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2 py-4 text-lg shadow-lg shadow-green-500/20"
            >
              <LogIn className="w-5 h-5" />
              {loading ? 'جاري التسجيل...' : 'تسجيل الحضور'}
            </button>
          </div>
        )}
      </div>

      {/* Attendance Records Timeline */}
      <div className="card">
        <h3 className="section-title flex items-center gap-2">
          <FileText className="w-5 h-5 text-gray-400" />
          سجل الحضور السابق
        </h3>
        
        {getAllRecords().length > 0 ? (
          <div className="relative">
            {/* Timeline Line */}
            <div className="absolute right-6 top-0 bottom-0 w-0.5 bg-slate-200 dark:bg-slate-700" />
            
            <div className="space-y-4">
              {getAllRecords().map((record, index) => {
                const isEven = index % 2 === 0;
                return (
                  <div key={record.id} className="relative flex gap-4">
                    {/* Timeline Dot */}
                    <div 
                      className={`w-10 h-10 rounded-xl flex items-center justify-center z-10 flex-shrink-0 ${
                        record.check_out_time 
                          ? 'bg-green-100 dark:bg-green-900/40 border-2 border-green-500'
                          : 'bg-orange-100 dark:bg-orange-900/40 border-2 border-orange-500'
                      }`}
                    >
                      {record.check_out_time 
                        ? <CheckCircle className="w-5 h-5 text-green-500" />
                        : <Clock className="w-5 h-5 text-orange-500" />
                      }
                    </div>
                    
                    {/* Record Card */}
                    <div className="flex-1 card hover:shadow-md transition-all">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-azm-green text-white flex items-center justify-center text-sm font-bold">
                            {record.user_name?.charAt(0) || '?'}
                          </div>
                          <span className="font-medium text-slate-800 dark:text-slate-100">{record.user_name}</span>
                        </div>
                        <span className="text-sm text-slate-500">
                          {new Date(record.work_date).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-3 text-center">
                          <LogIn className="w-4 h-4 text-green-600 mx-auto mb-1" />
                          <div className="text-xs text-slate-500">الحضور</div>
                          <div className="font-semibold text-green-600">{formatTime(record.check_in_time)}</div>
                        </div>
                        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 text-center">
                          <LogOut className="w-4 h-4 text-blue-600 mx-auto mb-1" />
                          <div className="text-xs text-slate-500">الانصراف</div>
                          <div className="font-semibold text-blue-600">{formatTime(record.check_out_time)}</div>
                        </div>
                        <div className="bg-azm-green/10 rounded-xl p-3 text-center">
                          <Timer className="w-4 h-4 text-azm-green mx-auto mb-1" />
                          <div className="text-xs text-slate-500">الساعات</div>
                          <div className="font-semibold text-azm-green">{record.total_hours || 0}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <EmptyState
            icon={FileText}
            title="لا يوجد سجل حضور"
            description="قم بتسجيل الحضور لبدء تتبع وقتك"
            color="#059669"
          />
        )}
      </div>
    </div>
  );
}