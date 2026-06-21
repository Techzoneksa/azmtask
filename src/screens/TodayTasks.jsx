import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { 
  Calendar, 
  Clock, 
  AlertTriangle, 
  CheckCircle,
  ChevronLeft,
  Zap,
  CalendarCheck
} from 'lucide-react';

export default function TodayTasks() {
  const { user } = useAuth();
  const { data } = useData();
  const [activeTab, setActiveTab] = useState('all');

  const getTodaysTasks = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    return data.tasks.filter(task => {
      const due = new Date(task.due_date);
      due.setHours(0, 0, 0, 0);
      return due.getTime() >= today.getTime() && due.getTime() < tomorrow.getTime() && task.status !== 'completed';
    });
  };

  const getTodaysTasksIncludingOverdue = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    return data.tasks.filter(task => {
      const due = new Date(task.due_date);
      due.setHours(0, 0, 0, 0);
      return due.getTime() < tomorrow.getTime() && task.status !== 'completed';
    });
  };

  const getDelayedTasks = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return data.tasks.filter(task => {
      const due = new Date(task.due_date);
      due.setHours(0, 0, 0, 0);
      return due.getTime() < today.getTime() && task.status !== 'completed';
    });
  };

  const getPendingReviewTasks = () => {
    return data.tasks.filter(task => task.status === 'pending-review');
  };

  const getBlockedTasks = () => {
    return data.tasks.filter(task => task.status === 'blocked');
  };

  const getTomorrowTasks = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    
    const dayAfter = new Date(tomorrow);
    dayAfter.setDate(dayAfter.getDate() + 1);
    
    return data.tasks.filter(task => {
      const due = new Date(task.due_date);
      due.setHours(0, 0, 0, 0);
      return due.getTime() >= tomorrow.getTime() && due.getTime() < dayAfter.getTime();
    });
  };

  const getStageById = (id) => {
    return data.stages.find(s => s.id === id);
  };

  const tabs = [
    { id: 'all', label: 'الكل', count: getTodaysTasksIncludingOverdue().length, color: 'bg-blue-500' },
    { id: 'urgent', label: 'عالية الأولوية', count: getTodaysTasksIncludingOverdue().filter(t => t.priority === 'high').length, color: 'bg-red-500' },
    { id: 'delayed', label: 'متأخرة', count: getDelayedTasks().length, color: 'bg-orange-500' },
    { id: 'review', label: 'بانتظار المراجعة', count: getPendingReviewTasks().length, color: 'bg-purple-500' },
    { id: 'blocked', label: 'متعثرة', count: getBlockedTasks().length, color: 'bg-red-600' },
    { id: 'tomorrow', label: 'خطة الغد', count: getTomorrowTasks().length, color: 'bg-green-500' }
  ];

  const getFilteredTasks = () => {
    switch (activeTab) {
      case 'urgent':
        return getTodaysTasksIncludingOverdue().filter(t => t.priority === 'high');
      case 'delayed':
        return getDelayedTasks();
      case 'review':
        return getPendingReviewTasks();
      case 'blocked':
        return getBlockedTasks();
      case 'tomorrow':
        return getTomorrowTasks();
      default:
        return getTodaysTasksIncludingOverdue();
    }
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const taskDate = new Date(date);
    taskDate.setHours(0, 0, 0, 0);
    
    const diff = taskDate.getTime() - today.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    
    if (days < 0) return `متأخر ${Math.abs(days)} يوم`;
    if (days === 0) return 'اليوم';
    if (days === 1) return 'غداً';
    return `بعد ${days} يوم`;
  };

  const getStatusLabel = (status) => {
    const labels = {
      'new': 'جديد',
      'in-progress': 'قيد التنفيذ',
      'pending-review': 'بانتظار المراجعة',
      'completed': 'مكتمل',
      'blocked': 'متعثر',
      'delayed': 'مؤجل'
    };
    return labels[status] || status;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-azm-green rounded-xl flex items-center justify-center">
          <CalendarCheck className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">مهام اليوم</h1>
          <p className="text-gray-500">مهام يجب إنجازها اليوم</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card text-center">
          <div className="text-3xl font-bold text-blue-500">{getTodaysTasksIncludingOverdue().length}</div>
          <div className="text-sm text-gray-500">مهام اليوم</div>
        </div>
        <div className="card text-center">
          <div className="text-3xl font-bold text-red-500">{getDelayedTasks().length}</div>
          <div className="text-sm text-gray-500">متأخرة</div>
        </div>
        <div className="card text-center">
          <div className="text-3xl font-bold text-purple-500">{getPendingReviewTasks().length}</div>
          <div className="text-sm text-gray-500">بانتظار المراجعة</div>
        </div>
        <div className="card text-center">
          <div className="text-3xl font-bold text-orange-500">{getBlockedTasks().length}</div>
          <div className="text-sm text-gray-500">متعثرة</div>
        </div>
      </div>

      {/* Tabs - Horizontal scroll on mobile */}
      <div className="overflow-x-auto -mx-4 px-4 hide-scrollbar">
        <div className="flex gap-2 min-w-max">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all ${
                activeTab === tab.id
                  ? `${tab.color} text-white` 
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {tab.label}
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                activeTab === tab.id ? 'bg-white/20' : 'bg-gray-100'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Task List as Cards */}
      <div className="space-y-3">
        {getFilteredTasks().map(task => (
          <Link
            key={task.id}
            to={`/task/${task.id}`}
            className="card block hover:shadow-md transition-shadow"
          >
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                task.status === 'completed' ? 'bg-green-100' :
                task.status === 'blocked' ? 'bg-red-100' :
                task.priority === 'high' ? 'bg-red-100' :
                'bg-blue-100'
              }`}>
                {task.status === 'completed' ? (
                  <CheckCircle className="w-5 h-5 text-green-600" />
                ) : task.status === 'blocked' ? (
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                ) : task.priority === 'high' ? (
                  <Zap className="w-5 h-5 text-red-600" />
                ) : (
                  <Clock className="w-5 h-5 text-blue-600" />
                )}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-gray-800">{task.title}</h3>
                  <span className={`badge text-xs flex-shrink-0 ${
                    task.priority === 'high' ? 'badge-priority-high' :
                    task.priority === 'medium' ? 'badge-priority-medium' : 'badge-priority-low'
                  }`}>
                    {task.priority === 'high' ? 'عالية' : task.priority === 'medium' ? 'متوسطة' : 'منخفضة'}
                  </span>
                </div>
                
                <p className="text-sm text-gray-500 mt-1 line-clamp-2">{task.description}</p>
                
                <div className="flex items-center gap-4 mt-3 flex-wrap">
                  <span className={`text-xs px-2 py-1 rounded-full`}
                  style={{ backgroundColor: getStageById(task.stage_id)?.color + '20', color: getStageById(task.stage_id)?.color }}
                  >
                    {getStageById(task.stage_id)?.name}
                  </span>
                  
                  <span className={`text-xs font-medium ${
                    formatDate(task.due_date).includes('متأخر') ? 'text-red-500' : 'text-gray-500'
                  }`}>
                    {formatDate(task.due_date)}
                  </span>
                </div>
                
                <div className="mt-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 progress-bar h-2">
                      <div className="progress-fill" style={{ width: `${task.progress}%` }} />
                    </div>
                    <span className="text-xs text-gray-500">{task.progress}%</span>
                  </div>
                </div>
              </div>
              
              <ChevronLeft className="w-5 h-5 text-gray-400 flex-shrink-0" />
            </div>
          </Link>
        ))}
        
        {getFilteredTasks().length === 0 && (
          <div className="card text-center py-12">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <h3 className="font-semibold text-gray-800 mb-2">لا توجد مهام</h3>
            <p className="text-gray-500">
              {activeTab === 'all' ? 'جميع المهام مكتملة' : 'لا توجد مهام في هذا التصنيف'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}