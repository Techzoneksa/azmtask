import { useState } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useTheme } from '../context/ThemeContext';
import { 
  LayoutDashboard, 
  CalendarCheck, 
  Map, 
  Kanban, 
  Clock, 
  AlertTriangle,
  FileText,
  BarChart3,
  MessageSquare,
  Bell,
  Settings,
  Bot,
  LogOut,
  Menu,
  X,
  Moon,
  Sun
} from 'lucide-react';

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'الرئيسية' },
  { path: '/today', icon: CalendarCheck, label: 'مهام اليوم' },
  { path: '/roadmap', icon: Map, label: 'المراحل' },
  { path: '/kanban', icon: Kanban, label: 'المهام' },
  { path: '/attendance', icon: Clock, label: 'الحضور' },
  { path: '/obstacles', icon: AlertTriangle, label: 'التحديات' },
  { path: '/documents', icon: FileText, label: 'المستندات' },
  { path: '/reports', icon: BarChart3, label: 'التقارير' },
  { path: '/notes', icon: MessageSquare, label: 'الملاحظات' },
  { path: '/notifications', icon: Bell, label: 'التنبيهات' },
  { path: '/assistant', icon: Bot, label: 'المساعد' },
  { path: '/settings', icon: Settings, label: 'الإعدادات' }
];

const mainNavItems = [
  { path: '/', icon: LayoutDashboard, label: 'الرئيسية' },
  { path: '/today', icon: CalendarCheck, label: 'مهام اليوم' },
  { path: '/roadmap', icon: Map, label: 'المراحل' },
  { path: '/kanban', icon: Kanban, label: 'المهام' },
  { path: '/attendance', icon: Clock, label: 'الحضور' },
  { path: '/obstacles', icon: AlertTriangle, label: 'التحديات' }
];

export default function Layout() {
  const { user, logout } = useAuth();
  const { data } = useData();
  const { isDark, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  const logoUrl = typeof window !== 'undefined' ? localStorage.getItem('azm-logo') : '';
  
  const unreadNotifications = data.notifications?.filter(n => !n.read && n.userId === user?.id).length || 0;
  
  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };
  
  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Mobile Header */}
      <header className="md:hidden fixed top-0 left-0 right-0 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 z-40 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-azm-green rounded-xl flex items-center justify-center overflow-hidden">
              {logoUrl ? (
                <img src={logoUrl} alt="شعار" className="w-full h-full object-contain" />
              ) : (
                <span className="text-white font-bold text-lg">ع</span>
              )}
            </div>
            <div>
              <h1 className="font-semibold text-slate-800 dark:text-slate-100">عزم</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">{user?.position}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={toggleTheme}
              className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center"
            >
              {isDark ? <Sun className="w-5 h-5 text-amber-500" /> : <Moon className="w-5 h-5 text-slate-600" />}
            </button>
            <button 
              onClick={() => setSidebarOpen(true)}
              className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center"
            >
              <Menu className="w-5 h-5 text-slate-600 dark:text-slate-300" />
            </button>
          </div>
        </div>
      </header>

      {/* Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/50 z-50"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        md:hidden fixed top-0 right-0 h-full w-72 bg-white z-50 transform transition-transform duration-300
        ${sidebarOpen ? 'translate-x-0' : 'translate-x-full'}
      `}>
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-azm-green rounded-xl flex items-center justify-center overflow-hidden">
              {logoUrl ? (
                <img src={logoUrl} alt="شعار" className="w-full h-full object-contain" />
              ) : (
                <span className="text-white font-bold text-lg">ع</span>
              )}
            </div>
            <div>
              <h1 className="font-semibold text-slate-800 dark:text-slate-100">عزم</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">{user?.name}</p>
            </div>
          </div>
          <button 
            onClick={() => setSidebarOpen(false)}
            className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center"
          >
            <X className="w-4 h-4 text-slate-600 dark:text-slate-300" />
          </button>
        </div>
        
        <nav className="p-4 overflow-y-auto h-[calc(100%-140px)]">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => setSidebarOpen(false)}
              className={`
                flex items-center gap-3 px-4 py-3 rounded-xl mb-1 transition-all
                ${isActive(item.path) 
                  ? 'bg-azm-green text-white' 
                  : 'text-gray-600 hover:bg-gray-50'}
              `}
            >
              <item.icon className="w-5 h-5" />
              <span className="font-medium">{item.label}</span>
              {item.path === '/notifications' && unreadNotifications > 0 && (
                <span className="mr-auto bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {unreadNotifications}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        
        <div className="p-4 border-t border-gray-100">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-red-600 hover:bg-red-50 w-full"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium">تسجيل الخروج</span>
          </button>
        </div>
      </aside>

      {/* Desktop Sidebar */}
      <aside className="hidden md:block fixed right-0 top-0 h-full w-64 bg-white dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700 z-30">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-azm-green rounded-xl flex items-center justify-center overflow-hidden">
              {logoUrl ? (
                <img src={logoUrl} alt="شعار" className="w-full h-full object-contain" />
              ) : (
                <span className="text-white font-bold text-xl">ع</span>
              )}
            </div>
            <div>
              <h1 className="font-bold text-slate-800 dark:text-slate-100 text-lg">عزم</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">{user?.name}</p>
            </div>
          </div>
        </div>
        
        <nav className="p-3 overflow-y-auto h-[calc(100%-100px)] hide-scrollbar">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={`
                flex items-center gap-3 px-4 py-3 rounded-xl mb-1 transition-all
                ${isActive(item.path) 
                  ? 'bg-azm-green text-white' 
                  : 'text-gray-600 hover:bg-gray-50'}
              `}
            >
              <item.icon className="w-5 h-5" />
              <span className="font-medium">{item.label}</span>
              {item.path === '/notifications' && unreadNotifications > 0 && (
                <span className="mr-auto bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {unreadNotifications}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        
        <div className="p-3 border-t border-gray-100">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-red-600 hover:bg-red-50 w-full"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium">تسجيل الخروج</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="md:mr-64 pt-16 md:pt-0">
        <div className="page-container">
          <Outlet />
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden bottom-nav">
        <div className="flex items-center justify-around">
          {mainNavItems.slice(0, 5).map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={`
                flex flex-col items-center gap-1 px-3 py-2 rounded-xl min-w-[60px]
                ${isActive(item.path) 
                  ? 'text-azm-green' 
                  : 'text-gray-400'}
              `}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-xs font-medium">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}