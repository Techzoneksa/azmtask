export default function EmptyState({ 
  icon: Icon, 
  title, 
  description, 
  action,
  actionLabel,
  color = '#059669'
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div 
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
        style={{ backgroundColor: color + '15' }}
      >
        <Icon className="w-8 h-8" style={{ color }} />
      </div>
      <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">
        {title}
      </h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs mb-4">
        {description}
      </p>
      {action && actionLabel && (
        <button
          onClick={action}
          className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
          style={{ backgroundColor: color + '20', color }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}