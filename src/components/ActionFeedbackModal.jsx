import { useEffect } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

const TYPE_CONFIG = {
  success: {
    icon: CheckCircle,
    color: '#10B981',
    bgLight: '#ECFDF5',
    borderLight: '#10B981',
    textLight: '#065F46',
    bgDark: '#064E3A',
    borderDark: '#10B981',
    textDark: '#ECFDF5',
    title: 'نجاح'
  },
  error: {
    icon: XCircle,
    color: '#DC2626',
    bgLight: '#FEF2F2',
    borderLight: '#DC2626',
    textLight: '#991B1B',
    bgDark: '#7F1D1D',
    borderDark: '#DC2626',
    textDark: '#FEF2F2',
    title: 'خطأ'
  },
  warning: {
    icon: AlertTriangle,
    color: '#F59E0B',
    bgLight: '#FFFBEB',
    borderLight: '#F59E0B',
    textLight: '#92400E',
    bgDark: '#78350F',
    borderDark: '#F59E0B',
    textDark: '#FFFBEB',
    title: 'تحذير'
  },
  info: {
    icon: Info,
    color: '#3B82F6',
    bgLight: '#EFF6FF',
    borderLight: '#3B82F6',
    textLight: '#1E40AF',
    bgDark: '#1E3A8A',
    borderDark: '#3B82F6',
    textDark: '#EFF6FF',
    title: 'معلومة'
  }
};

export default function ActionFeedbackModal({ 
  type = 'info', 
  title = '', 
  message = '', 
  autoClose = true, 
  autoCloseDelay = 2500,
  onClose 
}) {
  const config = TYPE_CONFIG[type] || TYPE_CONFIG.info;
  const Icon = config.icon;

  useEffect(() => {
    if (autoClose && onClose) {
      const timer = setTimeout(() => {
        onClose();
      }, autoCloseDelay);
      return () => clearTimeout(timer);
    }
  }, [autoClose, autoCloseDelay, onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Overlay */}
      <div 
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className={`
        relative w-full max-w-sm rounded-2xl p-6 shadow-2xl
        animate-slide-up
        ${type === 'success' ? 'bg-white dark:bg-slate-800' : 'bg-white dark:bg-slate-800'}
        border-2
      `}
      style={{ 
        borderColor: type === 'success' ? config.color : 
                     type === 'error' ? config.color :
                     type === 'warning' ? config.color : config.color
      }}>
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 left-3 w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 flex items-center justify-center transition-colors"
        >
          <X className="w-4 h-4 text-slate-500 dark:text-slate-400" />
        </button>

        {/* Content */}
        <div className="text-center pt-2">
          {/* Icon */}
          <div 
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ 
              backgroundColor: type === 'success' ? '#ECFDF5' : 
                              type === 'error' ? '#FEF2F2' : 
                              type === 'warning' ? '#FFFBEB' : '#EFF6FF'
            }}
          >
            <Icon 
              className="w-10 h-10" 
              style={{ color: config.color }}
            />
          </div>

          {/* Title */}
          <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2">
            {title || config.title}
          </h3>

          {/* Message */}
          <p className="text-base text-slate-600 dark:text-slate-300 mb-6 leading-relaxed">
            {message}
          </p>

          {/* Action Button */}
          <button
            onClick={onClose}
            className={`
              w-full py-3 px-6 rounded-xl font-semibold text-white text-base
              transition-all duration-200 active:scale-[0.98]
            `}
            style={{ backgroundColor: config.color }}
          >
            حسنًا
          </button>
        </div>
      </div>
    </div>
  );
}