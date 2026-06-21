import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider, useData } from './context/DataContext';
import { ThemeProvider } from './context/ThemeContext';
import { FeedbackProvider } from './context/FeedbackContext';
import Login from './screens/Login';
import Dashboard from './screens/Dashboard';
import TodayTasks from './screens/TodayTasks';
import Roadmap from './screens/Roadmap';
import Kanban from './screens/Kanban';
import TaskDetail from './screens/TaskDetail';
import Attendance from './screens/Attendance';
import Obstacles from './screens/Obstacles';
import Documents from './screens/Documents';
import Reports from './screens/Reports';
import Notes from './screens/Notes';
import Notifications from './screens/Notifications';
import Settings from './screens/Settings';
import Assistant from './screens/Assistant';
import Layout from './components/Layout';

function ProtectedRoute({ children }) {
  const { user, isLoading } = useAuth();
  
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="animate-pulse">
          <div className="w-12 h-12 bg-azm-green rounded-xl"></div>
        </div>
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
}

function AppRoutes() {
  const { user } = useAuth();
  
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="today" element={<TodayTasks />} />
        <Route path="roadmap" element={<Roadmap />} />
        <Route path="kanban" element={<Kanban />} />
        <Route path="task/:id" element={<TaskDetail />} />
        <Route path="attendance" element={<Attendance />} />
        <Route path="obstacles" element={<Obstacles />} />
        <Route path="documents" element={<Documents />} />
        <Route path="reports" element={<Reports />} />
        <Route path="notes" element={<Notes />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="settings" element={<Settings />} />
        <Route path="assistant" element={<Assistant />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <DataProvider>
            <FeedbackProvider>
              <AppRoutes />
            </FeedbackProvider>
          </DataProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}