import { createContext, useContext, useState, useEffect } from 'react';
import { loadData, saveData, users } from '../data/store';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const savedUser = localStorage.getItem('azm_current_user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
    setIsLoading(false);
  }, []);

  const login = (email, password) => {
    const foundUser = users.find(u => u.email === email && u.password === password);
    if (foundUser) {
      setUser(foundUser);
      localStorage.setItem('azm_current_user', JSON.stringify(foundUser));
      return { success: true, user: foundUser };
    }
    return { success: false, error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' };
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('azm_current_user');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function useData() {
  const [data, setData] = useState(loadData());
  
  const updateData = (newData) => {
    saveData(newData);
    setData(newData);
  };
  
  const refreshData = () => {
    setData(loadData());
  };
  
  return { data, updateData, refreshData, setData };
}