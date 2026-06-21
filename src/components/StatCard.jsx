import { TrendingUp, TrendingDown } from 'lucide-react';

export default function StatCard({ 
  icon: Icon, 
  label, 
  value, 
  color = '#059669', 
  bgColor = '#D1FAE5',
  trend,
  description,
  progress
}) {
  return (
    <div className="card group hover:shadow-lg transition-all duration-300 cursor-default">
      <div className="flex items-start justify-between">
        <div 
          className="w-12 h-12 rounded-2xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110"
          style={{ backgroundColor: bgColor }}
        >
          <Icon className="w-6 h-6" style={{ color }} />
        </div>
        {trend !== undefined && (
          <div className={`flex items-center gap-1 text-xs font-medium ${trend >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {trend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      
      <div className="mt-4">
        <div className="text-2xl font-bold" style={{ color }}>
          {value}
        </div>
        <div className="text-sm font-medium text-slate-600 dark:text-slate-300 mt-1">
          {label}
        </div>
        {description && (
          <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            {description}
          </div>
        )}
      </div>
      
      {progress !== undefined && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-500">التقدم</span>
            <span className="font-medium" style={{ color }}>{progress}%</span>
          </div>
          <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
            <div 
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progress}%`, backgroundColor: color }}
            />
          </div>
        </div>
      )}
    </div>
  );
}