import { useState } from 'react';
import { Heart, Mail, Lock, User, Eye, EyeOff, Brain, ShieldCheck, TrendingUp, Stethoscope, Users, Sun, Moon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../db/database';

interface Props {
  darkMode: boolean;
  toggleDark: () => void;
}

export default function AuthPage({ darkMode, toggleDark }: Props) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [role, setRole] = useState<UserRole>('patient');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const dm = darkMode;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (mode === 'register') {
      if (!name.trim()) return setError('Please enter your full name.');
      if (password.length < 6) return setError('Password must be at least 6 characters.');
      if (password !== confirm) return setError('Passwords do not match.');
    }
    if (!email.includes('@')) return setError('Please enter a valid email address.');
    setLoading(true);
    await new Promise(r => setTimeout(r, 600));
    const result = await (mode === 'login'
      ? login(email, password)
      : register(name, email, password, role));
    setLoading(false);
    if (!result.success) setError(result.error || 'Something went wrong. Please try again.');
  }

  function switchMode() {
    setMode(m => m === 'login' ? 'register' : 'login');
    setError('');
    setName(''); setEmail(''); setPassword(''); setConfirm('');
    setRole('patient');
  }

  const inputCls = `w-full px-4 py-3 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 focus:ring-green-500 ${
    dm
      ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-500'
      : 'bg-white border-gray-200 text-gray-800 placeholder-gray-400'
  }`;

  return (
    <div className={`min-h-screen flex relative ${dm ? 'bg-gray-950' : 'bg-gradient-to-br from-green-50 via-white to-emerald-50'}`}>
      {/* Theme toggle */}
      <button
        onClick={toggleDark}
        title="Toggle dark mode"
        className={`absolute top-5 right-5 z-20 p-2.5 rounded-xl transition-colors ${
          dm
            ? 'bg-gray-800 text-yellow-400 hover:bg-gray-700'
            : 'bg-white text-gray-600 hover:bg-gray-100 shadow-md'
        }`}
      >
        {dm ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </button>
      {/* Left Panel — Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-green-600 to-emerald-700 flex-col justify-center px-16 text-white relative overflow-hidden">
        {/* Decorative rings */}
        <div className="absolute inset-0 opacity-10">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="absolute rounded-full border border-white"
              style={{
                width: `${(i + 1) * 130}px`,
                height: `${(i + 1) * 130}px`,
                top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
              }}
            />
          ))}
        </div>

        <div className="relative z-10">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-10">
            <div className="p-3 bg-white/20 rounded-2xl">
              <Heart className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                Med<span className="text-green-200">Alert</span>
              </h1>
              <p className="text-green-200 text-sm">Profile-Based Health Assessment System</p>
            </div>
          </div>

          <h2 className="text-4xl font-bold mb-4 leading-tight">
            Your personal<br />health companion
          </h2>
          <p className="text-green-100 text-lg mb-12 leading-relaxed">
            Track your daily habits to predict and prevent health risks before they happen using our machine-learning system.
          </p>

          <div className="space-y-6">
            {[
              { icon: Brain, title: 'Machine-Learning', desc: 'Our engine learns from your daily data to improve predictions over time.' },
              { icon: TrendingUp, title: 'Personal Tracking', desc: 'Visualize trends across sleep, exercise, stress, hydration and more.' },
              { icon: ShieldCheck, title: 'Private & Secure', desc: 'Your health data is stored securely on your device — never shared.' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-4">
                <div className="p-2 bg-white/20 rounded-xl flex-shrink-0">
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold">{title}</h3>
                  <p className="text-green-200 text-sm">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel — Form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex items-center justify-center gap-2 mb-8 lg:hidden">
            <div className="p-2 bg-green-100 rounded-xl">
              <Heart className="w-6 h-6 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold">
              <span className="text-green-600">Med</span>
              <span className={dm ? 'text-gray-300' : 'text-gray-500'}>Alert</span>
            </h1>
          </div>

          <div className={`rounded-3xl shadow-2xl p-8 ${dm ? 'bg-gray-900 border border-gray-800' : 'bg-white'}`}>
            <div className="mb-8">
              <h2 className={`text-2xl font-bold ${dm ? 'text-white' : 'text-gray-900'}`}>
                {mode === 'login' ? 'Welcome back!' : 'Create your account'}
              </h2>
              <p className={`mt-1 text-sm ${dm ? 'text-gray-400' : 'text-gray-500'}`}>
                {mode === 'login'
                  ? 'Sign in to continue your MedAlert health journey.'
                  : 'Start fresh — your health profile begins the moment you do.'}
              </p>
            </div>

            {mode === 'register' && (
              <div className={`mb-6 p-4 rounded-xl border text-sm flex items-start gap-3 ${
                dm
                  ? 'bg-green-900/20 border-green-800 text-green-300'
                  : 'bg-green-50 border-green-200 text-green-700'
              }`}>
                <ShieldCheck className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <p>
                  <strong>Fresh start guaranteed.</strong> Every new account begins with zero health data.
                  After signing up, you'll set up your Health Profile before accessing the dashboard.
                </p>
              </div>
            )}

            {mode === 'register' && (
              <div className="mb-6">
                <label className="block text-sm font-medium mb-2">
                  I am a...
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {([
                    { id: 'patient', icon: Users, title: 'Patient', desc: 'Track health & receive tips' },
                    { id: 'doctor', icon: Stethoscope, title: 'Doctor', desc: 'Review & approve patient tips' },
                  ] as { id: UserRole; icon: typeof Users; title: string; desc: string }[]).map(({ id, icon: Icon, title, desc }) => {
                    const active = role === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setRole(id)}
                        className={`text-left p-3.5 rounded-xl border transition-all ${
                          active
                            ? 'bg-green-500 text-white border-green-500 shadow-sm'
                            : dm
                            ? 'bg-gray-800 border-gray-700 text-gray-300 hover:border-green-500'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-green-400'
                        }`}
                      >
                        <Icon className={`w-5 h-5 mb-2 ${active ? 'text-white' : 'text-green-500'}`} />
                        <p className="text-sm font-semibold">{title}</p>
                        <p className={`text-xs mt-0.5 ${active ? 'text-green-100' : dm ? 'text-gray-400' : 'text-gray-500'}`}>{desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'register' && (
                <div className="relative">
                  <User className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${dm ? 'text-gray-500' : 'text-gray-400'}`} />
                  <input
                    type="text" placeholder="Full Name" value={name}
                    onChange={e => setName(e.target.value)}
                    className={`${inputCls} pl-10`} required
                  />
                </div>
              )}

              <div className="relative">
                <Mail className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${dm ? 'text-gray-500' : 'text-gray-400'}`} />
                <input
                  type="email" placeholder="Email Address" value={email}
                  onChange={e => setEmail(e.target.value)}
                  className={`${inputCls} pl-10`} required
                />
              </div>

              <div className="relative">
                <Lock className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${dm ? 'text-gray-500' : 'text-gray-400'}`} />
                <input
                  type={showPass ? 'text' : 'password'} placeholder="Password" value={password}
                  onChange={e => setPassword(e.target.value)}
                  className={`${inputCls} pl-10 pr-10`} required
                />
                <button
                  type="button" onClick={() => setShowPass(s => !s)}
                  className={`absolute right-3 top-1/2 -translate-y-1/2 ${dm ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {mode === 'register' && (
                <div className="relative">
                  <Lock className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${dm ? 'text-gray-500' : 'text-gray-400'}`} />
                  <input
                    type={showPass ? 'text' : 'password'} placeholder="Confirm Password" value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    className={`${inputCls} pl-10`} required
                  />
                </div>
              )}

              {error && (
                <div className={`p-3 rounded-xl border text-sm ${dm ? 'bg-red-900/20 border-red-800 text-red-300' : 'bg-red-50 border-red-200 text-red-600'}`}>
                  {error}
                </div>
              )}

              <button
                type="submit" disabled={loading}
                className="w-full py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-semibold hover:from-green-600 hover:to-emerald-700 transition-all disabled:opacity-60 flex items-center justify-center gap-2 shadow-lg shadow-green-200/30"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {mode === 'login' ? 'Signing in...' : 'Creating account...'}
                  </>
                ) : (
                  mode === 'login' ? 'Sign In' : 'Create Account'
                )}
              </button>
            </form>

            <div className="mt-6 text-center">
              <span className={`text-sm ${dm ? 'text-gray-400' : 'text-gray-500'}`}>
                {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
              </span>
              <button
                onClick={switchMode}
                className="text-sm font-semibold text-green-600 hover:text-green-700 transition-colors"
              >
                {mode === 'login' ? 'Sign up free' : 'Sign in'}
              </button>
            </div>
          </div>

          <p className={`text-center text-xs mt-5 ${dm ? 'text-gray-600' : 'text-gray-400'}`}>
            This project is strictly for IT Capstone Project 1. Made by students from OUR LADY OF FATIMA UNIVERSITY.
          </p>
        </div>
      </div>
    </div>
  );
}
