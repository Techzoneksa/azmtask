import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { 
  Clock, 
  LogOut,
  LogIn,
  Calendar,
  FileText
} from 'lucide-react';

export default function Attendance() {
  const { user, profile } = useAuth();
  const { data, checkIn, checkOut } = useData();
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  const getTodayRecord = () => {
    const today = new Date().toDateString();
    return data.attendance?.find(a => 
      new Date(a.date).toDateString() === today && a.user_id === user?.id
    );
  };

  const todayRecord = getTodayRecord();

  const handleCheckIn = async () => {
    setLoading(true);
    const result = await checkIn();
    setLoading(false);
  };

  const handleCheckOut = async () => {
    if (!todayRecord) return;
    setLoading(true);
    const result = await checkOut(todayRecord.id);
    setLoading(false);
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
    const today = new Date().toDateString();
    const todayRecords = data.attendance?.filter(a => 
      new Date(a.date).toDateString() === today
    ) || [];
    
    const totalHours = todayRecords.reduce((sum, r) => sum + (r.total_hours || 0), 0);
    return { count: todayRecords.length, hours: totalHours };
  };

  const getAllRecords = () => {
    return (data.attendance || [])
      .slice(0, 30);
  };

  const isDirector = profile?.role === 'admin' || profile?.role === 'director' || (Array.isArray(profile?.roles) && profile.roles.includes('admin'));

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-azm-green rounded-xl flex items-center justify-center">
          <Clock className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">الحضور والانصراف</h1>
          <p className="text-gray-500">{user?.name} - {user?.position}</p>
        </div>
      </div>

      {/* Today's Card */}
      <div className="card-glass">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 bg-azm-green/10 rounded-2xl flex items-center justify-center">
            <Calendar className="w-7 h-7 text-azm-green" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-800">اليوم</h2>
            <p className="text-sm text-gray-500">{formatDate(new Date().toISOString())}</p>
          </div>
        </div>

        {todayRecord ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-green-50 rounded-xl p-4 text-center">
                <LogIn className="w-6 h-6 text-green-600 mx-auto mb-2" />
                <div className="text-sm text-gray-500">وقت الحضور</div>
                <div className="text-xl font-bold text-green-700">{formatTime(todayRecord.check_in)}</div>
              </div>
              <div className={`${todayRecord.check_out ? 'bg-blue-50' : 'bg-orange-50'} rounded-xl p-4 text-center`}>
                <LogOut className={`w-6 h-6 mx-auto mb-2 ${todayRecord.check_out ? 'text-blue-600' : 'text-orange-600'}`} />
                <div className="text-sm text-gray-500">وقت الانصراف</div>
                <div className={`text-xl font-bold ${todayRecord.check_out ? 'text-blue-700' : 'text-orange-700'}`}>
                  {todayRecord.check_out ? formatTime(todayRecord.check_out) : 'لم يسجل'}
                </div>
              </div>
            </div>
            
            <div className="bg-gray-50 rounded-xl p-4 text-center">
              <div className="text-sm text-gray-500">إجمالي ساعات اليوم</div>
              <div className="text-3xl font-bold text-azm-green">{todayRecord.total_hours || 0}</div>
              <div className="text-sm text-gray-400">ساعة</div>
            </div>

            {!todayRecord.check_out && (
              <button
                onClick={handleCheckOut}
                disabled={loading}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                <LogOut className="w-5 h-5" />
                {loading ? 'جاري التسجيل...' : 'تسجيل الانصراف'}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-xl p-6 text-center">
              <Clock className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-500">لم تسجل الحضور اليوم</p>
            </div>
            
            <button
              onClick={handleCheckIn}
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              <LogIn className="w-5 h-5" />
              {loading ? 'جاري التسجيل...' : 'تسجيل الحضور'}
            </button>
          </div>
        )}
      </div>

      {/* Today's Summary */}
      {isDirector && (
        <div className="card">
          <h3 className="section-title">إحصائيات اليوم</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-blue-50 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-blue-600">{getTodayStats().count}</div>
              <div className="text-sm text-gray-500">سجل الحضور</div>
            </div>
            <div className="bg-green-50 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-green-600">{getTodayStats().hours}</div>
              <div className="text-sm text-gray-500">إجمالي الساعات</div>
            </div>
          </div>
        </div>
      )}

      {/* Attendance Records */}
      <div className="card">
        <h3 className="section-title flex items-center gap-2">
          <FileText className="w-5 h-5 text-gray-400" />
          سجل الحضور{isDirector ? ' (كل السجلات)' : ''}
        </h3>
        
        <div className="space-y-3">
          {getAllRecords().map(record => (
            <div key={record.id} className="p-4 bg-gray-50 rounded-xl">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-azm-green text-white flex items-center justify-center text-sm">
                    {record.user_name?.charAt(0)}
                  </div>
                  <span className="font-medium text-gray-800">{record.user_name}</span>
                </div>
                <span className="text-sm text-gray-500">{formatDate(record.date)}</span>
              </div>
              
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center">
                  <div className="text-xs text-gray-500">الحضور</div>
                  <div className="font-medium text-green-600">{formatTime(record.check_in)}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-500">الانصراف</div>
                  <div className="font-medium text-blue-600">{formatTime(record.check_out)}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-500">الساعات</div>
                  <div className="font-medium text-azm-green">{record.total_hours || 0}</div>
                </div>
              </div>
            </div>
          ))}
          
          {getAllRecords().length === 0 && (
            <p className="text-center text-gray-400 py-8">لا يوجد سجل حضور</p>
          )}
        </div>
      </div>
    </div>
  );
}