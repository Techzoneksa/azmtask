import { ResponsiveContainer } from 'recharts';

export default function ChartCard({ title, icon: Icon, children, className = '' }) {
  return (
    <div className={`card ${className}`}>
      <div className="flex items-center gap-3 mb-4">
        {Icon && (
          <div className="w-10 h-10 rounded-xl bg-azm-green/10 flex items-center justify-center">
            <Icon className="w-5 h-5 text-azm-green" />
          </div>
        )}
        {title && (
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
        )}
      </div>
      <ResponsiveContainer width="100%" height={200}>
        {children}
      </ResponsiveContainer>
    </div>
  );
}