import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { 
  Map, 
  CheckCircle,
  Clock,
  AlertTriangle,
  FileText,
  Building,
  Truck,
  Users,
  Monitor,
  ClipboardList,
  FileSignature,
  Palette,
  PlayCircle,
  Rocket,
  Stamp,
  ChevronLeft
} from 'lucide-react';

const iconMap = {
  FileText,
  Stamp,
  Building,
  Truck,
  Users,
  Monitor,
  ClipboardList,
  FileSignature,
  Palette,
  PlayCircle,
  Rocket
};

export default function Roadmap() {
  const { data } = useData();
  const [selectedStage, setSelectedStage] = useState(null);

  const getStageStats = (stageId) => {
    const stageTasks = data.tasks.filter(t => t.stage_id === stageId);
    const completed = stageTasks.filter(t => t.status === 'completed').length;
    const delayed = stageTasks.filter(t => t.status === 'blocked' || t.status === 'delayed').length;
    const progress = stageTasks.length > 0 
      ? Math.round(stageTasks.reduce((sum, t) => sum + t.progress, 0) / stageTasks.length)
      : 0;
    
    return { total: stageTasks.length, completed, delayed, progress };
  };

  const getStageTasks = (stageId) => {
    return data.tasks.filter(t => t.stage_id === stageId);
  };

  const sortedStages = [...data.stages].sort((a, b) => a.order - b.order);

  const overallProgress = data.tasks.length > 0 
    ? Math.round(data.tasks.reduce((sum, t) => sum + (t.progress || 0), 0) / data.tasks.length)
    : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-azm-green rounded-xl flex items-center justify-center">
            <Map className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">خارطة التأسيس والتشغيل</h1>
            <p className="text-gray-500">تتبع مراحل تأسيس شركة عزم</p>
          </div>
        </div>
        
        <Link to="/kanban" className="btn-secondary text-sm flex items-center gap-2">
          <Rocket className="w-4 h-4" />
          عرض المهام
        </Link>
      </div>

      {/* Progress Overview */}
      <div className="card-glass">
        <h3 className="font-semibold text-gray-800 mb-4">نسبة الإنجاز الكلية</h3>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="progress-bar h-3">
              <div className="progress-fill" style={{ width: `${overallProgress}%` }} />
            </div>
          </div>
          <span className="text-xl font-bold text-azm-green">{overallProgress}%</span>
        </div>
        <div className="grid grid-cols-3 gap-4 mt-4">
          <div className="text-center">
            <div className="text-lg font-bold text-green-500">
              {data.tasks.filter(t => t.status === 'completed').length}
            </div>
            <div className="text-xs text-gray-500">مكتمل</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-orange-500">
              {data.tasks.filter(t => t.status === 'in-progress').length}
            </div>
            <div className="text-xs text-gray-500">قيد التنفيذ</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-red-500">
              {data.tasks.filter(t => t.status === 'blocked' || t.status === 'delayed').length}
            </div>
            <div className="text-xs text-gray-500">متعثر</div>
          </div>
        </div>
      </div>

      {/* Stage Detail Modal */}
      {selectedStage && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedStage(null)}>
          <div className="bg-white rounded-3xl w-full max-w-lg max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100" style={{ borderRightColor: selectedStage.color, borderRightWidth: 4 }}>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-800">{selectedStage.name}</h2>
                  <p className="text-sm text-gray-500">{getStageStats(selectedStage.id).total} مهمة</p>
                </div>
                <button onClick={() => setSelectedStage(null)} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                  ✕
                </button>
              </div>
              
              <div className="flex items-center gap-4 mt-4">
                <div className="flex-1">
                  <div className="progress-bar h-2">
                    <div className="progress-fill" style={{ width: `${getStageStats(selectedStage.id).progress}%`, backgroundColor: selectedStage.color }} />
                  </div>
                </div>
                <span className="font-bold" style={{ color: selectedStage.color }}>{getStageStats(selectedStage.id).progress}%</span>
              </div>
            </div>
            
            <div className="p-4 overflow-y-auto max-h-[50vh] space-y-3">
              {getStageTasks(selectedStage.id).map(task => (
                <Link
                  key={task.id}
                  to={`/task/${task.id}`}
                  onClick={() => setSelectedStage(null)}
                  className="block p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      task.status === 'completed' ? 'bg-green-100' :
                      task.status === 'blocked' ? 'bg-red-100' :
                      task.status === 'pending-review' ? 'bg-purple-100' :
                      'bg-blue-100'
                    }`}>
                      {task.status === 'completed' ? (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      ) : task.status === 'blocked' ? (
                        <AlertTriangle className="w-4 h-4 text-red-600" />
                      ) : (
                        <Clock className="w-4 h-4 text-blue-600" />
                      )}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-800">{task.title}</h4>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200">{task.progress}%</span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Stages Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sortedStages.map((stage, index) => {
          const stats = getStageStats(stage.id);
          const IconComponent = iconMap[stage.icon] || FileText;
          
          return (
            <button
              key={stage.id}
              onClick={() => setSelectedStage(stage)}
              className="card text-right hover:shadow-lg transition-shadow"
              style={{ borderTopColor: stage.color, borderTopWidth: 4 }}
            >
              <div className="flex items-start gap-4">
                <div 
                  className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: stage.color + '20' }}
                >
                  <IconComponent className="w-6 h-6" style={{ color: stage.color }} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-gray-800">{stage.name}</h3>
                    <span className="text-xs text-gray-400">#{index + 1}</span>
                  </div>
                  
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-sm text-gray-500">{stats.total} مهمة</span>
                    <span className="text-green-500 text-sm">• {stats.completed} مكتمل</span>
                  </div>
                  
                  <div className="progress-bar h-2 mb-2">
                    <div 
                      className="progress-fill" 
                      style={{ width: `${stats.progress}%`, backgroundColor: stage.color }} 
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold" style={{ color: stage.color }}>{stats.progress}%</span>
                    {stats.delayed > 0 && (
                      <span className="badge badge-red text-xs">{stats.delayed} متعثر</span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}