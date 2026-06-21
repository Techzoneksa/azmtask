import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { 
  Bell, 
  Check,
  BellRing,
  Calendar,
  CheckCircle,
  AlertTriangle,
  MessageSquare
} from 'lucide-react';

export default function Notifications() {
  const { user } = useAuth();
  const { data, markNotificationRead } = useData();

  const notifications = (data.notifications || [])
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleMarkAsRead = async (id) => {
    await markNotificationRead(id);
  };

  const getNotificationIcon = (notification) => {
    if (notification.title.includes('حضور') || notification.title.includes('انصراف')) {
      return { icon: Calendar, color: 'bg-blue-100 text-blue-600' };
    }
    if (notification.title.includes('اعتماد') || notification.title.includes('موافقة')) {
      return { icon: CheckCircle, color: 'bg-green-100 text-green-600' };
    }
    if (notification.title.includes('رفض')) {
      return { icon: AlertTriangle, color: 'bg-red-100 text-red-600' };
    }
    if (notification.title.includes('ملاحظة')) {
      return { icon: MessageSquare, color: 'bg-purple-100 text-purple-600' };
    }
    return { icon: Bell, color: 'bg-gray-100 text-gray-600' };
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 60) return `منذ ${minutes} دقيقة`;
    if (hours < 24) return `منذ ${hours} ساعة`;
    if (days < 7) return `منذ ${days} يوم`;
    return date.toLocaleDateString('ar-SA');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-amber-500 rounded-xl flex items-center justify-center">
            <Bell className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">التنبيهات الداخلية</h1>
            <p className="text-gray-500">
              {unreadCount > 0 ? `${unreadCount} تنبيه غير مقروء` : 'جميع التنبيهات مقروءة'}
            </p>
          </div>
        </div>
      </div>

      {/* Notifications List */}
      <div className="space-y-3">
        {notifications.map(notification => {
          const { icon: Icon, color } = getNotificationIcon(notification);
          const isRead = notification.read;
          
          return (
            <div 
              key={notification.id} 
              className={`card ${isRead ? 'opacity-70' : 'border-r-4 border-r-amber-500'}`}
            >
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-semibold text-gray-800">{notification.title}</h3>
                    {!isRead && (
                      <div className="w-2 h-2 rounded-full bg-amber-500" />
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mb-2">{notification.message}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">{formatDate(notification.created_at)}</span>
                    {!isRead && (
                      <button 
                        onClick={() => handleMarkAsRead(notification.id)}
                        className="text-xs text-amber-600 hover:underline"
                      >
                        تحديد كمقروء
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        
        {notifications.length === 0 && (
          <div className="card text-center py-12">
            <BellRing className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="font-semibold text-gray-800 mb-2">لا توجد تنبيهات</h3>
            <p className="text-gray-500">ستظهر التنبيهات عند أحداث معينة</p>
          </div>
        )}
      </div>
    </div>
  );
}