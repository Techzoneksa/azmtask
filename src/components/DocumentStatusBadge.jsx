import { CheckCircle, Clock, AlertTriangle, XCircle, FileQuestion } from 'lucide-react';

export default function DocumentStatusBadge({ status }) {
  const statusConfig = {
    'active': { 
      label: 'ساري', 
      icon: CheckCircle, 
      color: '#15803D', 
      bg: '#DCFCE7',
      darkBg: '#14532d',
      darkColor: '#4ade80'
    },
    'expired': { 
      label: 'منتهي', 
      icon: XCircle, 
      color: '#BE123C', 
      bg: '#FFE4E6',
      darkBg: '#4c0519',
      darkColor: '#f87171'
    },
    'expiring_soon': { 
      label: 'قريب الانتهاء', 
      icon: AlertTriangle, 
      color: '#F97316', 
      bg: '#FFEDD5',
      darkBg: '#9a3412',
      darkColor: '#fb923c'
    },
    'missing_data': { 
      label: 'ناقص بيانات', 
      icon: FileQuestion, 
      color: '#64748B', 
      bg: '#F1F5F9',
      darkBg: '#334155',
      darkColor: '#94a3b8'
    },
    'pending_review': { 
      label: 'بانتظار المراجعة', 
      icon: Clock, 
      color: '#B45309', 
      bg: '#FEF3C7',
      darkBg: '#451a03',
      darkColor: '#fbbf24'
    }
  };

  const config = statusConfig[status] || statusConfig['missing_data'];
  const Icon = config.icon;

  return (
    <span 
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium"
      style={{ 
        backgroundColor: config.bg, 
        color: config.color,
        border: `1px solid ${config.color}30`
      }}
    >
      <Icon className="w-4 h-4" />
      {config.label}
    </span>
  );
}

export function getDocumentStatus(expiryDate, hasFile, hasRequiredData) {
  if (!hasRequiredData) return 'missing_data';
  
  if (!expiryDate) return 'missing_data';
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);
  
  if (expiry < today) return 'expired';
  
  const daysUntilExpiry = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
  if (daysUntilExpiry <= 30) return 'expiring_soon';
  
  return 'active';
}