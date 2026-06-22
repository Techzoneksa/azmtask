import StatCard from './StatCard';
import { FileText, CheckCircle, XCircle, AlertTriangle, FileQuestion, Calendar } from 'lucide-react';

export default function DocumentStatsCards({ documents }) {
  const totalCount = documents?.length || 0;
  
  const activeCount = documents?.filter(d => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = d.expiry_date ? new Date(d.expiry_date) : null;
    return expiry && expiry >= today && d.status !== 'missing_data';
  }).length || 0;
  
  const expiredCount = documents?.filter(d => {
    if (!d.expiry_date) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(d.expiry_date);
    return expiry < today;
  }).length || 0;
  
  const expiringSoonCount = documents?.filter(d => {
    if (!d.expiry_date || d.status === 'expired') return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(d.expiry_date);
    const daysUntil = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
    return daysUntil > 0 && daysUntil <= 30;
  }).length || 0;
  
  const missingDataCount = documents?.filter(d => d.status === 'missing_data' || !d.expiry_date).length || 0;

  const lastUpdate = documents?.length > 0 
    ? documents.reduce((latest, doc) => {
        const docDate = new Date(doc.updated_at || doc.created_at);
        return docDate > latest ? docDate : latest;
      }, new Date(0))
    : null;

  const formatLastUpdate = () => {
    if (!lastUpdate || lastUpdate.getTime() === 0) return 'لا يوجد';
    return lastUpdate.toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      <StatCard
        icon={FileText}
        label="إجمالي المستندات"
        value={totalCount}
        color="#0369A1"
        bgColor="#E0F2FE"
      />
      <StatCard
        icon={CheckCircle}
        label="ساري"
        value={activeCount}
        color="#15803D"
        bgColor="#DCFCE7"
      />
      <StatCard
        icon={XCircle}
        label="منتهي"
        value={expiredCount}
        color="#BE123C"
        bgColor="#FFE4E6"
      />
      <StatCard
        icon={AlertTriangle}
        label="قارب على الانتهاء"
        value={expiringSoonCount}
        color="#F97316"
        bgColor="#FFEDD5"
      />
      <StatCard
        icon={FileQuestion}
        label="ناقص بيانات"
        value={missingDataCount}
        color="#64748B"
        bgColor="#F1F5F9"
      />
      <StatCard
        icon={Calendar}
        label="آخر تحديث"
        value={formatLastUpdate()}
        color="#6366F1"
        bgColor="#EEF2FF"
        description="للمستندات"
      />
    </div>
  );
}