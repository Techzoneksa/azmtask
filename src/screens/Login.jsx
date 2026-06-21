import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { isConfigured } from '../lib/supabase';
import { Lock, Mail, AlertCircle, Database } from 'lucide-react';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isConfigured) {
      setError('إعدادات الاتصال بقاعدة البيانات غير مكتملة. يرجى ضبط متغيرات Supabase في Hostinger.');
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!isConfigured) {
      setError('إعدادات الاتصال بقاعدة البيانات غير مكتملة. يرجى ضبط متغيرات Supabase في Hostinger.');
      return;
    }
    
    setLoading(true);
    
    try {
      const result = await login(email, password);
      
      if (!result.success) {
        setError(result.error);
      }
    } catch (err) {
      setError('حدث خطأ في الاتصال. تأكد من إعدادات Supabase.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-azm-green-dark via-azm-green to-azm-green-light flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-white rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-lg">
            <span className="text-azm-green font-bold text-4xl">ع</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">شركة عزم للخدمات اللوجستية</h1>
          <p className="text-green-100">برنامج الإنجاز والتشغيل</p>
        </div>

        {/* Login Form */}
        <div className="bg-white rounded-3xl p-6 shadow-2xl">
          {!isConfigured && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 flex items-start gap-3">
              <Database className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-red-600 text-sm font-medium">خطأ في الاتصال بقاعدة البيانات</p>
                <p className="text-red-500 text-xs mt-1">
                  إعدادات Supabase غير موجودة. يرجى إضافة:
                </p>
                <ul className="text-red-400 text-xs mt-1 list-disc list-inside">
                  <li>VITE_SUPABASE_URL</li>
                  <li>VITE_SUPABASE_ANON_KEY</li>
                </ul>
              </div>
            </div>
          )}
          
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
                  disabled={!isConfigured}
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
                  disabled={!isConfigured}
                />
              </div>
            </div>
            
            <button
              type="submit"
              disabled={loading || !isConfigured}
              className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                'دخول'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}