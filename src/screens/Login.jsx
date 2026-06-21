import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Lock, Mail, AlertCircle } from 'lucide-react';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    const result = login(email, password);
    
    if (!result.success) {
      setError(result.error);
    }
    
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-azm-green-dark via-azm-green to-azm-green-light flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-white rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-lg">
            <span className="text-azm-green font-bold text-4xl">ع</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">عزم</h1>
          <p className="text-green-100">برنامج الإنجاز والتشغيل</p>
        </div>

        {/* Login Form */}
        <div className="bg-white rounded-3xl p-6 shadow-2xl">
          <h2 className="text-xl font-semibold text-gray-800 mb-6 text-center">تسجيل الدخول</h2>
          
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">البريد الإلكتروني</label>
              <div className="relative">
                <Mail className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field pr-12"
                  placeholder="أدخل بريدك الإلكتروني"
                  required
                  dir="rtl"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">كلمة المرور</label>
              <div className="relative">
                <Lock className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field pr-12"
                  placeholder="أدخل كلمة المرور"
                  required
                  dir="rtl"
                />
              </div>
            </div>
            
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                'دخول'
              )}
            </button>
          </form>
          
          {/* Demo Accounts Info */}
          <div className="mt-6 p-4 bg-gray-50 rounded-xl">
            <p className="text-sm font-medium text-gray-700 mb-3">بيانات الدخول التجريبية:</p>
            <div className="space-y-2 text-sm text-gray-600">
              <div className="flex justify-between">
                <span>الأستاذ سلطان (مدير عام):</span>
                <code className="bg-gray-100 px-2 py-1 rounded">sultan@azm.sa</code>
              </div>
              <div className="flex justify-between">
                <span>عبدالرحمن (مدير عمليات):</span>
                <code className="bg-gray-100 px-2 py-1 rounded">abdulrahman@azm.sa</code>
              </div>
              <p className="text-xs text-gray-400 mt-2">كلمة المرور: azm2026</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}