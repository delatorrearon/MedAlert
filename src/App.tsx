import { useState, useEffect, useCallback } from 'react';
import {
  Moon, Sun, Heart, Activity, Apple, Brain, Droplets, Scale,
  Clock, CheckCircle, TrendingUp, TrendingDown, User, Coffee,
  Dumbbell, Calendar, Plus, Sparkles, LogOut, BarChart2,
  ChevronDown, ChevronRight, Shield, Database, Flame, Beef, Wheat,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  Legend,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ConfirmProvider, useConfirm } from './context/ConfirmContext';
import AuthPage from './pages/AuthPage';
import OnboardingPage from './pages/OnboardingPage';
import DoctorDashboard from './pages/DoctorDashboard';
import {
  profiles, dailyLogs as dbLogs, mlSnapshots, tipReviews,
  UserProfile, DailyLog, MLSnapshot, MealEntry,
} from './db/database';
import { runMLAnalysis, MLResult, estimateMacrosFromCalories } from './utils/mlEngine';
import { macroTargetsForProfile, mealTotals } from './utils/foodEngine';
import DailyLogForm, { getDefaultLogForm } from './components/DailyLogForm';
import MacroCompare from './components/MacroCompare';

// ─── Types ────────────────────────────────────────────────────────────────────

type View = 'dashboard' | 'dailyLog' | 'profile' | 'insights' | 'history';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getRiskColor(level: string, dark: boolean) {
  const map: Record<string, [string, string]> = {
    low:      ['bg-green-100 text-green-800',   'bg-green-900/30 text-green-300'],
    moderate: ['bg-yellow-100 text-yellow-800', 'bg-yellow-900/30 text-yellow-300'],
    high:     ['bg-orange-100 text-orange-800', 'bg-orange-900/30 text-orange-300'],
    critical: ['bg-red-100 text-red-800',       'bg-red-900/30 text-red-300'],
  };
  return (map[level] || map.low)[dark ? 1 : 0];
}

function getRiskBorder(level: string) {
  return {
    low:      'border-l-4 border-l-green-500',
    moderate: 'border-l-4 border-l-yellow-500',
    high:     'border-l-4 border-l-orange-500',
    critical: 'border-l-4 border-l-red-500',
  }[level] || 'border-l-4 border-l-gray-400';
}

function getRiskBarColor(level: string) {
  return {
    low: 'bg-green-500', moderate: 'bg-yellow-500',
    high: 'bg-orange-500', critical: 'bg-red-500',
  }[level] || 'bg-gray-400';
}

function TrendIcon({ trend }: { trend: string }) {
  if (trend === 'improving') return <TrendingUp  className="w-4 h-4 text-green-500" />;
  if (trend === 'worsening') return <TrendingDown className="w-4 h-4 text-red-500" />;
  return <span className="inline-block w-4 h-1 rounded bg-yellow-400 my-auto" />;
}

function RiskIcon({ category }: { category: string }) {
  if (category.includes('Cardio'))     return <Heart   className="w-5 h-5" />;
  if (category.includes('Metabolic'))  return <Activity className="w-5 h-5" />;
  if (category.includes('Sleep'))      return <Clock   className="w-5 h-5" />;
  return <Apple className="w-5 h-5" />;
}

function MetricRow({
  label, value, target, status, dm, mutedCls,
}: {
  label: string;
  value: string;
  target?: string;
  status: 'good' | 'warn' | 'bad';
  dm: boolean;
  mutedCls: string;
}) {
  const dot = status === 'good' ? 'bg-green-500' : status === 'warn' ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="flex items-center gap-1.5 min-w-0">
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
        <span className={mutedCls}>{label}</span>
      </span>
      <span className="flex items-baseline gap-1 flex-shrink-0">
        <span className={`font-semibold ${dm ? 'text-white' : 'text-gray-800'}`}>{value}</span>
        {target && <span className={mutedCls}>({target})</span>}
      </span>
    </div>
  );
}

function getTimeGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

function avg(nums: number[]) {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

// ─── Main App Inner ───────────────────────────────────────────────────────────

function AppInner({ darkMode, toggleDark }: { darkMode: boolean; toggleDark: () => void }) {
  const { user, logout } = useAuth();
  const { confirm } = useConfirm();
  const dm = darkMode;

  const [view, setView]             = useState<View>('dashboard');
  const [profile, setProfile]       = useState<UserProfile | null>(null);
  const [logs, setLogs]             = useState<DailyLog[]>([]);
  const [snapshots, setSnapshots]   = useState<MLSnapshot[]>([]);
  const [mlResult, setMlResult]     = useState<MLResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [insightsAdvancedOpen, setInsightsAdvancedOpen] = useState(false);

  const handleLogout = async () => {
    const ok = await confirm({
      title: 'Sign Out',
      message: 'Are you sure you want to sign out of your account?',
      confirmText: 'Sign Out',
      cancelText: 'Stay Logged In',
      variant: 'danger',
      iconType: 'logout',
    });
    if (ok) {
      logout();
    }
  };

  const handleDeleteLog = async (logId: string, logDateStr: string) => {
    if (!user) return;
    const ok = await confirm({
      title: 'Delete Daily Log',
      message: `Are you sure you want to permanently delete your health log for ${format(parseISO(logDateStr), 'MMMM d, yyyy')}? This cannot be undone.`,
      confirmText: 'Delete Log',
      cancelText: 'Keep Log',
      variant: 'danger',
      iconType: 'trash',
    });
    if (ok) {
      dbLogs.delete(user.id, logId);
      setLogs((prev) => prev.filter((l) => l.id !== logId));
    }
  };

  // Daily log form (any date)
  const today = new Date().toISOString().split('T')[0];
  const [logDate, setLogDate] = useState(today);
  const existingForDate = logs.find(l => l.date === logDate);
  const [logForm, setLogForm] = useState<Partial<DailyLog>>({});
  const [logSaved, setLogSaved] = useState(false);

  // Load user data
  useEffect(() => {
    if (!user) return;
    const p = profiles.get(user.id);
    setProfile(p || profiles.defaultProfile(user.id));
    const l = dbLogs.getAll(user.id);
    setLogs(l);
    const s = mlSnapshots.getAll(user.id);
    setSnapshots(s);
  }, [user]);

  // Run ML when logs / profile change
  const runAnalysis = useCallback(() => {
    if (!user) return;
    setIsAnalyzing(true);
    setTimeout(() => {
      const result = runMLAnalysis(logs, profile, user.id);
      setMlResult(result);
      setSnapshots(mlSnapshots.getAll(user.id));
      // Queue generated tips for the doctor's final say
      tipReviews.sync(
        { id: user.id, name: user.name, email: user.email },
        today,
        result.risks.map(r => ({ category: r.category, texts: r.recommendations }))
      );
      setIsAnalyzing(false);
    }, 1000);
  }, [logs, profile, user]);

  useEffect(() => {
    if (logs.length > 0 || profile) runAnalysis();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs, profile]);

  // Load form when selected date or profile changes
  useEffect(() => {
    if (existingForDate) {
      setLogForm({ ...existingForDate });
    } else {
      setLogForm(getDefaultLogForm(profile));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logDate, existingForDate?.id, profile?.weight, profile?.activityLevel]);

  const saveProfile = async () => {
    if (!user || !profile) return;
    const ok = await confirm({
      title: 'Update Health Profile',
      message: 'Are you sure you want to save changes to your health profile? This will recalibrate your baseline daily macro and calorie targets.',
      confirmText: 'Save Profile',
      cancelText: 'Keep Editing',
      variant: 'primary',
      iconType: 'check',
    });
    if (!ok) return;

    profiles.save({ ...profile, userId: user.id });
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2500);
  };

  const saveLog = async () => {
    if (!user) return;
    const isUpdating = Boolean(existingForDate);
    const formattedDate = logDate === today ? 'today' : format(parseISO(logDate), 'MMMM d, yyyy');

    const ok = await confirm({
      title: isUpdating ? 'Update Daily Log' : 'Save Daily Log',
      message: isUpdating
        ? `Are you sure you want to update your health log for ${formattedDate}? Your daily metrics and ML risk engine predictions will be recalculated with these new values.`
        : `Submit your health log for ${formattedDate}? The ML risk engine will calculate your health scores based on these metrics.`,
      confirmText: isUpdating ? 'Update Log' : 'Save Log',
      cancelText: 'Keep Editing',
      variant: 'primary',
      iconType: 'check',
    });
    if (!ok) return;

    const calories = logForm.calories ?? getDefaultLogForm(profile).calories ?? 2000;
    const trackMacros = logForm.trackMacros ?? false;
    const meals: MealEntry[] = logForm.meals ?? [];
    const macros = meals.length > 0
      ? mealTotals(meals)
      : trackMacros
        ? { protein: logForm.protein ?? 0, carbs: logForm.carbs ?? 0, fats: logForm.fats ?? 0 }
        : estimateMacrosFromCalories(calories);
    dbLogs.save({
      id: existingForDate?.id,
      userId: user.id,
      date: logDate,
      sleepHours: logForm.sleepHours ?? 7,
      exerciseMinutes: logForm.exerciseMinutes ?? 30,
      waterIntake: logForm.waterIntake ?? 8,
      caffeineIntake: logForm.caffeineIntake ?? 2,
      calories,
      protein: macros.protein,
      carbs: macros.carbs,
      fats: macros.fats,
      foodQuality: logForm.foodQuality ?? 'balanced',
      meals,
      trackMacros,
      trackWeight: logForm.trackWeight ?? false,
      weight: logForm.weight,
    });
    setLogs(dbLogs.getAll(user.id));
    setLogSaved(true);
    setTimeout(() => setLogSaved(false), 2500);
  };

  const streak = user ? dbLogs.getStreak(user.id) : 0;

  const bmi = profile && profile.height > 0
    ? (profile.weight / Math.pow(profile.height / 100, 2)).toFixed(1)
    : '—';

  // Doctor-approved tips visible to the patient (only these are "final")
  const approvedTips = user ? tipReviews.getApprovedForDate(user.id, today) : [];
  const tipTextsFor = (category: string) =>
    approvedTips
      .filter(t => t.category === category)
      .flatMap(t => (t.approvedText || '').split('\n'))
      .map(s => s.trim())
      .filter(Boolean);
  const hasPendingTipsFor = (category: string) =>
    user
      ? tipReviews.getForDate(user.id, today).some(t => t.category === category && t.status === 'pending')
      : false;

  // Shared styling
  const card = (children: React.ReactNode, extra = '') => (
    <div className={`rounded-2xl shadow-sm border p-5 ${dm ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'} ${extra}`}>
      {children}
    </div>
  );

  const inputCls = `w-full px-4 py-2.5 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 focus:ring-green-500 ${
    dm ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-500' : 'bg-white border-gray-200 text-gray-800'
  }`;
  const labelCls = `block text-sm font-medium mb-1.5 ${dm ? 'text-gray-300' : 'text-gray-700'}`;
  const mutedCls = `text-sm ${dm ? 'text-gray-400' : 'text-gray-500'}`;

  const navItems: { id: View; label: string; icon: typeof Activity }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: Activity },
    { id: 'dailyLog',  label: 'Daily Log',  icon: Plus },
    { id: 'insights',  label: 'Insights',   icon: Sparkles },
    { id: 'history',   label: 'History',    icon: BarChart2 },
    { id: 'profile',   label: 'Profile',    icon: User },
  ];

  // ── Dashboard ──────────────────────────────────────────────────────────────
  const renderDashboard = () => {
    const snapshotData = snapshots.slice(-14);
    const noData = logs.length === 0;

    return (
      <div className="space-y-6">
        {/* Welcome Banner */}
        <div className="rounded-2xl p-6 bg-gradient-to-r from-green-500 to-emerald-600 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.25)' }}>
                Good {getTimeGreeting()}, {user?.name?.split(' ')[0]}! 👋
              </h2>
              <p className="text-green-100 text-sm mt-1">
                {/* {noData
                  ? 'Start your first daily log to activate ML predictions.'
                  : `${logs.length} day${logs.length !== 1 ? 's' : ''} of data recorded — ML engine is active.`} */}
              </p>
            </div>

          </div>
          {noData && (
            <button
              onClick={() => setView('dailyLog')}
              className="mt-4 flex items-center gap-2 bg-white/20 hover:bg-white/30 transition-colors px-4 py-2 rounded-xl text-sm font-medium"
            >
              <Plus className="w-4 h-4" /> Log your first entry <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>

        Stats Row
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Overall Score', value: mlResult ? `${mlResult.overallScore}` : '—', unit: mlResult ? '/100' : '', icon: Heart,    bg: 'bg-green-100', icoCls: 'text-green-600' },
            { label: 'Day Streak',    value: `${streak}`,        unit: ' days',             icon: Sparkles, bg: 'bg-yellow-100', icoCls: 'text-yellow-600' },
            { label: 'BMI',           value: bmi,                unit: '',                  icon: Scale,    bg: 'bg-blue-100',   icoCls: 'text-blue-600' },
            { label: 'Logs Recorded', value: `${logs.length}`,   unit: '',                  icon: Database, bg: 'bg-purple-100', icoCls: 'text-purple-600' },
          ].map(({ label, value, unit, icon: Icon, bg, icoCls }) => (
            <div key={label} className={`rounded-2xl p-4 shadow-sm border ${dm ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'}`}>
              <div className="flex items-center justify-between mb-2">
                <p className={mutedCls}>{label}</p>
                <div className={`p-1.5 rounded-lg ${bg}`}>
                  <Icon className={`w-4 h-4 ${icoCls}`} />
                </div>
              </div>
              <p className={`text-2xl font-bold ${dm ? 'text-white' : 'text-gray-800'}`}>
                {value}<span className={`text-base font-normal ${mutedCls}`}>{unit}</span>
              </p>
            </div>
          ))}
        </div>

        {/* No data */}
        {noData && (
          <div className={`rounded-2xl border-2 border-dashed p-12 text-center ${dm ? 'border-gray-700' : 'border-gray-200'}`}>
            <Brain className={`w-12 h-12 mx-auto mb-3 ${dm ? 'text-gray-600' : 'text-gray-300'}`} />
            <h3 className={`text-lg font-semibold mb-1 ${dm ? 'text-gray-300' : 'text-gray-600'}`}>No data yet</h3>
            <p className={`${mutedCls} mb-4`}>The ML engine needs your daily logs to start making predictions.</p>
            <button
              onClick={() => setView('dailyLog')}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors"
            >
              <Plus className="w-4 h-4" /> Start Logging
            </button>
          </div>
        )}

        {/* ML analyzing */}
        {isAnalyzing && (
          <div className={`rounded-2xl p-4 flex items-center gap-3 ${dm ? 'bg-green-900/20 border border-green-800' : 'bg-green-50 border border-green-200'}`}>
            <div className="w-5 h-5 border-2 border-green-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            <span className={`text-sm font-medium ${dm ? 'text-green-300' : 'text-green-700'}`}>
              ML engine is analyzing your health patterns...
            </span>
          </div>
        )}

        {/* Health Score Trend */}
        {snapshotData.length > 0 && card(
          <>
            <h3 className={`text-base font-semibold mb-4 ${dm ? 'text-white' : 'text-gray-800'}`}>Health Score Trend</h3>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={snapshotData}>
                <defs>
                  <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#10B981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={dm ? '#1f2937' : '#f3f4f6'} />
                <XAxis dataKey="date" tick={{ fill: dm ? '#6B7280' : '#9CA3AF', fontSize: 11 }}
                  tickFormatter={v => { try { return format(parseISO(v), 'MMM d'); } catch { return v; } }} />
                <YAxis domain={[0, 100]} tick={{ fill: dm ? '#6B7280' : '#9CA3AF', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: dm ? '#111827' : '#fff', border: 'none', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                  labelFormatter={v => { try { return format(parseISO(v as string), 'MMMM d, yyyy'); } catch { return String(v); } }}
                />
                <Area type="monotone" dataKey="overallScore" stroke="#10B981" strokeWidth={2.5}
                  fillOpacity={1} fill="url(#cg)" name="Overall Score" dot={{ fill: '#10B981', r: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
          </>
        )}

        {/* Risk Cards */}
        {mlResult && mlResult.risks.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {mlResult.risks.map((risk, i) => (
              <div key={i} className={`rounded-2xl shadow-sm border p-5 ${dm ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'} ${getRiskBorder(risk.riskLevel)}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-xl ${dm ? 'bg-gray-800' : 'bg-gray-50'} text-green-600`}>
                      <RiskIcon category={risk.category} />
                    </div>
                    <div>
                      <h4 className={`font-semibold text-sm ${dm ? 'text-white' : 'text-gray-800'}`}>{risk.category}</h4>
                      <div className="flex items-center gap-1 mt-0.5">
                        <TrendIcon trend={risk.trend} />
                        <span className={`text-xs capitalize ${mutedCls}`}>{risk.trend}</span>
                      </div>
                    </div>
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${getRiskColor(risk.riskLevel, dm)}`}>
                    {risk.riskLevel.charAt(0).toUpperCase() + risk.riskLevel.slice(1)}
                  </span>
                </div>
                <div className={`h-2 w-full rounded-full mb-3 ${dm ? 'bg-gray-800' : 'bg-gray-100'}`}>
                  <div className={`h-full rounded-full transition-all duration-700 ${getRiskBarColor(risk.riskLevel)}`}
                    style={{ width: `${risk.score}%` }} />
                </div>
                <div className="flex justify-between text-xs mb-3">
                  <span className={mutedCls}>Risk Score</span>
                  <span className={`font-semibold ${dm ? 'text-white' : 'text-gray-800'}`}>{risk.score}%</span>
                </div>

                {/* Metrics behind the rating */}
                <div className={`rounded-xl p-3 space-y-1.5 mb-3 ${dm ? 'bg-gray-800/60' : 'bg-gray-50'}`}>
                  {risk.metrics.map((m, k) => (
                    <MetricRow key={k} label={m.label} value={m.value} target={m.target} status={m.status} dm={dm} mutedCls={mutedCls} />
                  ))}
                </div>

                {/* Doctor-approved tips only */}
                {(() => {
                  const tips = tipTextsFor(risk.category);
                  if (tips.length > 0) {
                    return (
                      <ul className="space-y-1">
                        {tips.slice(0, 2).map((r, j) => (
                          <li key={j} className={`flex items-start gap-2 text-xs ${mutedCls}`}>
                            <span className="text-green-500 mt-0.5 flex-shrink-0">•</span>{r}
                          </li>
                        ))}
                      </ul>
                    );
                  }
                  return (
                    <p className={`flex items-center gap-1.5 text-xs ${mutedCls}`}>
                      <Clock className="w-3.5 h-3.5 text-amber-500" />
                      {hasPendingTipsFor(risk.category)
                        ? 'Tips pending doctor review…'
                        : 'No tips yet — save a log to generate them.'}
                    </p>
                  );
                })()}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // ── Daily Log ─────────────────────────────────────────────────────────────
  const renderDailyLog = () => (
    <div className="max-w-xl mx-auto space-y-5">
      {card(
        <>
          <h2 className={`text-lg font-bold mb-1 ${dm ? 'text-white' : 'text-gray-800'}`}>Daily Health Log</h2>
          <DailyLogForm
            form={logForm}
            setForm={setLogForm}
            logDate={logDate}
            setLogDate={setLogDate}
            logs={logs}
            profile={profile}
            existingForDate={existingForDate}
            logSaved={logSaved}
            onSave={saveLog}
            dm={dm}
            labelCls={labelCls}
            mutedCls={mutedCls}
            inputCls={inputCls}
          />
        </>
      )}
    </div>
  );

  // ── Insights ──────────────────────────────────────────────────────────────
  const renderInsights = () => {
    const recentLogs = logs.slice(-7);
    const snaps = snapshots.slice(-14);

    return (
      <div className="space-y-5">
        {/* All risk recs */}
        {mlResult && mlResult.risks.map((risk, i) => (
          <div key={i} className={`rounded-2xl shadow-sm border p-5 ${dm ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'}`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${dm ? 'bg-gray-800' : 'bg-gray-50'} text-green-600`}>
                  <RiskIcon category={risk.category} />
                </div>
                <div>
                  <h3 className={`font-bold ${dm ? 'text-white' : 'text-gray-800'}`}>{risk.category}</h3>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <TrendIcon trend={risk.trend} />
                    <span className={`text-xs capitalize ${mutedCls}`}>{risk.trend}</span>
                  </div>
                </div>
              </div>
              <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${getRiskColor(risk.riskLevel, dm)}`}>
                {risk.riskLevel.charAt(0).toUpperCase() + risk.riskLevel.slice(1)} Risk
              </span>
            </div>
            <div className={`h-2.5 w-full rounded-full mb-3 ${dm ? 'bg-gray-800' : 'bg-gray-100'}`}>
              <div className={`h-full rounded-full ${getRiskBarColor(risk.riskLevel)}`} style={{ width: `${risk.score}%` }} />
            </div>
            <div className={`rounded-xl p-3 space-y-1.5 mb-4 ${dm ? 'bg-gray-800/60' : 'bg-gray-50'}`}>
                {risk.metrics.map((m, k) => (
                  <MetricRow key={k} label={m.label} value={m.value} target={m.target} status={m.status} dm={dm} mutedCls={mutedCls} />
                ))}
              </div>
              <h4 className={`text-xs font-bold uppercase tracking-widest mb-2 ${dm ? 'text-gray-500' : 'text-gray-400'}`}>
                Doctor-Approved Recommendations
              </h4>
              {(() => {
                const tips = tipTextsFor(risk.category);
                if (tips.length > 0) {
                  return (
                    <ul className="space-y-2">
                      {tips.map((r, j) => (
                        <li key={j} className={`flex items-start gap-2 text-sm p-2.5 rounded-lg ${dm ? 'bg-gray-800' : 'bg-gray-50'}`}>
                          <span className="text-green-500 flex-shrink-0 mt-0.5">•</span>
                          <span className={dm ? 'text-gray-300' : 'text-gray-700'}>{r}</span>
                        </li>
                      ))}
                    </ul>
                  );
                }
                return (
                  <p className={`flex items-center gap-2 text-sm p-2.5 rounded-lg ${dm ? 'bg-amber-900/20' : 'bg-amber-50'}`}>
                    <Clock className={`w-4 h-4 flex-shrink-0 ${dm ? 'text-amber-400' : 'text-amber-600'}`} />
                    <span className={dm ? 'text-amber-200' : 'text-amber-700'}>
                      {hasPendingTipsFor(risk.category)
                        ? 'Recommendations are awaiting doctor approval and will appear here once final.'
                        : 'Save a daily log to generate recommendations for doctor review.'}
                    </span>
                  </p>
                );
              })()}
          </div>
        ))}

        {/* Macro targets */}
        {recentLogs.length > 0 && card(
          <MacroCompare
            label="Macros vs Your Targets (last 7 days)"
            actual={{
              calories: Math.round(avg(recentLogs.map(l => l.calories || 0))),
              protein: Math.round(avg(recentLogs.map(l => l.protein || 0))),
              carbs: Math.round(avg(recentLogs.map(l => l.carbs || 0))),
              fats: Math.round(avg(recentLogs.map(l => l.fats || 0))),
            }}
            target={macroTargetsForProfile(profile)}
            dm={dm}
            mutedCls={mutedCls}
          />
        )}

        {/* Risk trend lines */}
        {snaps.length >= 2 && card(
          <>
            <h3 className={`font-semibold mb-4 ${dm ? 'text-white' : 'text-gray-800'}`}>Risk Trends Over Time</h3>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={snaps}>
                <CartesianGrid strokeDasharray="3 3" stroke={dm ? '#1f2937' : '#f3f4f6'} />
                <XAxis dataKey="date" tick={{ fill: dm ? '#6B7280' : '#9CA3AF', fontSize: 11 }}
                  tickFormatter={v => { try { return format(parseISO(v), 'MMM d'); } catch { return v; } }} />
                <YAxis domain={[0, 100]} tick={{ fill: dm ? '#6B7280' : '#9CA3AF', fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: dm ? '#111827' : '#fff', border: 'none', borderRadius: 10 }} />
                <Legend />
                <Line type="monotone" dataKey="cardiovascular" stroke="#EF4444" strokeWidth={2} dot={false} name="Cardiovascular" />
                <Line type="monotone" dataKey="metabolic"      stroke="#F59E0B" strokeWidth={2} dot={false} name="Metabolic" />
                <Line type="monotone" dataKey="nutritional"    stroke="#10B981" strokeWidth={2} dot={false} name="Nutritional" />
                <Line type="monotone" dataKey="sleep"          stroke="#8B5CF6" strokeWidth={2} dot={false} name="Sleep" />
              </LineChart>
            </ResponsiveContainer>
          </>
        )}

        {/* Weekly activity */}
        {recentLogs.length > 0 && card(
          <>
            <h3 className={`font-semibold mb-4 ${dm ? 'text-white' : 'text-gray-800'}`}>Weekly Activity Summary</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={recentLogs}>
                <CartesianGrid strokeDasharray="3 3" stroke={dm ? '#1f2937' : '#f3f4f6'} />
                <XAxis dataKey="date" tick={{ fill: dm ? '#6B7280' : '#9CA3AF', fontSize: 11 }}
                  tickFormatter={v => { try { return format(parseISO(v), 'EEE'); } catch { return v; } }} />
                <YAxis tick={{ fill: dm ? '#6B7280' : '#9CA3AF', fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: dm ? '#111827' : '#fff', border: 'none', borderRadius: 10 }} />
                <Legend />
                <Bar dataKey="sleepHours"      fill="#3B82F6" name="Sleep (hrs)"     radius={[4,4,0,0]} />
                <Bar dataKey="exerciseMinutes" fill="#10B981" name="Exercise (min)"  radius={[4,4,0,0]} />
                <Bar dataKey="waterIntake"     fill="#06B6D4" name="Water (cups)"  radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </>
        )}

        {/* Nutrition macros bar chart */}
        {recentLogs.length > 0 && card(
          <>
            <h3 className={`font-semibold mb-4 ${dm ? 'text-white' : 'text-gray-800'}`}>Weekly Nutrition Overview</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={recentLogs}>
                <CartesianGrid strokeDasharray="3 3" stroke={dm ? '#1f2937' : '#f3f4f6'} />
                <XAxis dataKey="date" tick={{ fill: dm ? '#6B7280' : '#9CA3AF', fontSize: 11 }}
                  tickFormatter={v => { try { return format(parseISO(v), 'EEE'); } catch { return v; } }} />
                <YAxis tick={{ fill: dm ? '#6B7280' : '#9CA3AF', fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: dm ? '#111827' : '#fff', border: 'none', borderRadius: 10 }} />
                <Legend />
                <Bar dataKey="protein" fill="#3B82F6" name="Protein (g)" radius={[4,4,0,0]} />
                <Bar dataKey="carbs"   fill="#F59E0B" name="Carbs (g)"   radius={[4,4,0,0]} />
                <Bar dataKey="fats"    fill="#F97316" name="Fats (g)"    radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </>
        )}

        {/* Advanced Details */}
        <div className={`rounded-2xl shadow-sm border overflow-hidden ${dm ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'}`}>
          <button
            onClick={() => setInsightsAdvancedOpen(!insightsAdvancedOpen)}
            className="w-full flex items-center justify-between p-4 text-left"
          >
            <span className={`font-semibold text-sm ${dm ? 'text-gray-300' : 'text-gray-600'}`}>
              Advanced Details (Programmers Only)
            </span>
            <ChevronDown className={`w-4 h-4 transition-transform ${insightsAdvancedOpen ? 'rotate-180' : ''} ${dm ? 'text-gray-400' : 'text-gray-500'}`} />
          </button>
          {insightsAdvancedOpen && (
            <div className="border-t px-4 py-3 space-y-4">
              {card(
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-green-100 rounded-xl">
                    <Sparkles className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <h2 className={`text-lg font-bold ${dm ? 'text-white' : 'text-gray-800'}`}>ML Insights</h2>
                    <p className={mutedCls}>
                      {logs.length < 3
                        ? `Log ${3 - logs.length} more day${3 - logs.length !== 1 ? 's' : ''} to unlock full insights.`
                        : `Based on ${logs.length} days of data — ${mlResult?.confidence ?? 0}% confidence.`}
                    </p>
                    {mlResult?.trainedOn && (
                      <p className={`text-xs mt-1 ${dm ? 'text-green-400' : 'text-green-600'}`}>
                        Trained model: {mlResult.trainedOn}
                      </p>
                    )}
                  </div>
                </div>
              )}
              {mlResult && mlResult.modelPerformance.logisticRegression.accuracy > 0 && card(
                <>
                  <h3 className={`font-semibold mb-3 ${dm ? 'text-white' : 'text-gray-800'}`}>Model Performance (validation set)</h3>
                  <p className={`text-xs mb-4 ${mutedCls}`}>
                    Active: {mlResult.activeModels.join(' · ')}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      { name: 'Logistic Regression', m: mlResult.modelPerformance.logisticRegression },
                      { name: 'Decision Tree', m: mlResult.modelPerformance.decisionTree },
                      { name: 'Ensemble', m: mlResult.modelPerformance.ensemble },
                    ].map(({ name, m }) => (
                      <div key={name} className={`rounded-xl p-3 ${dm ? 'bg-gray-800' : 'bg-gray-50'}`}>
                        <p className={`text-xs font-semibold mb-2 ${dm ? 'text-gray-300' : 'text-gray-600'}`}>{name}</p>
                        <div className="grid grid-cols-2 gap-1 text-xs">
                          <span className={mutedCls}>Accuracy</span><span className={dm ? 'text-white' : 'text-gray-800'}>{m.accuracy}%</span>
                          <span className={mutedCls}>Precision</span><span className={dm ? 'text-white' : 'text-gray-800'}>{m.precision}%</span>
                          <span className={mutedCls}>Recall</span><span className={dm ? 'text-white' : 'text-gray-800'}>{m.recall}%</span>
                          <span className={mutedCls}>F1</span><span className={dm ? 'text-white' : 'text-gray-800'}>{m.f1Score}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── History ───────────────────────────────────────────────────────────────
  const renderHistory = () => (
    <div className="space-y-5">
      {card(
        <div>
          <h2 className={`text-lg font-bold mb-1 ${dm ? 'text-white' : 'text-gray-800'}`}>Full Log History</h2>
          <p className={mutedCls}>{logs.length} entries recorded since account creation</p>
        </div>
      )}

      {logs.length === 0 ? (
        <div className={`rounded-2xl border-2 border-dashed p-12 text-center ${dm ? 'border-gray-700' : 'border-gray-200'}`}>
          <Calendar className={`w-12 h-12 mx-auto mb-3 ${dm ? 'text-gray-600' : 'text-gray-300'}`} />
          <p className={mutedCls}>No logs yet. Start tracking your health today!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {[...logs].reverse().map((log, i) => (
            <div key={i} className={`rounded-2xl border p-4 ${dm ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'}`}>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-green-500" />
                  <span className={`font-semibold text-sm ${dm ? 'text-white' : 'text-gray-800'}`}>
                    {format(parseISO(log.date), 'EEEE, MMMM d, yyyy')}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {log.calories > 0 && (
                    <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-orange-100 text-orange-700">
                      {log.calories} kcal
                    </span>
                  )}
                  {log.foodQuality && (
                    <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${dm ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                      {log.foodQuality.replace('_', ' ')}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => { setLogDate(log.date); setView('dailyLog'); }}
                    className="text-xs font-medium px-2.5 py-1 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteLog(log.id, log.date)}
                    className={`text-xs font-medium px-2.5 py-1 rounded-lg transition-colors ${
                      dm ? 'bg-gray-800 text-red-400 hover:bg-red-950/40' : 'bg-red-50 text-red-600 hover:bg-red-100'
                    }`}
                    title="Delete log entry"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {/* Physical metrics */}
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-xs mb-3">
                {[
                  { icon: Clock,    label: 'Sleep',    val: `${log.sleepHours}h`,         good: log.sleepHours >= 7 },
                  { icon: Dumbbell, label: 'Exercise', val: `${log.exerciseMinutes}m`,     good: log.exerciseMinutes >= 30 },
                  { icon: Droplets, label: 'Water',    val: `${log.waterIntake} cups`,     good: log.waterIntake >= 8 },
                  { icon: Coffee,   label: 'Caffeine', val: `${log.caffeineIntake} cups`,  good: log.caffeineIntake <= 3 },
                  { icon: Scale,    label: 'Weight',   val: log.weight ? `${log.weight}kg` : '—', good: true },
                ].map(({ icon: Icon, label, val, good }) => (
                  <div key={label} className={`p-2 rounded-xl text-center ${dm ? 'bg-gray-800' : 'bg-gray-50'}`}>
                    <Icon className={`w-3.5 h-3.5 mx-auto mb-1 ${good ? 'text-green-500' : 'text-orange-400'}`} />
                    <p className={mutedCls}>{label}</p>
                    <p className={`font-bold ${dm ? 'text-white' : 'text-gray-700'}`}>{val}</p>
                  </div>
                ))}
              </div>

              {/* Macro metrics */}
              {(log.calories > 0 || log.protein > 0 || log.carbs > 0 || log.fats > 0) && (
                <div className={`grid grid-cols-4 gap-2 text-xs pt-2 border-t ${dm ? 'border-gray-800' : 'border-gray-100'}`}>
                  {[
                    { icon: Flame, label: 'Calories', val: `${log.calories} kcal`, color: 'text-red-400' },
                    { icon: Beef,  label: 'Protein',  val: `${log.protein}g`,      color: 'text-blue-400' },
                    { icon: Wheat, label: 'Carbs',    val: `${log.carbs}g`,        color: 'text-yellow-500' },
                    { icon: Apple, label: 'Fats',     val: `${log.fats}g`,         color: 'text-orange-400' },
                  ].map(({ icon: Icon, label, val, color }) => (
                    <div key={label} className={`p-2 rounded-xl text-center ${dm ? 'bg-gray-800' : 'bg-gray-50'}`}>
                      <Icon className={`w-3.5 h-3.5 mx-auto mb-1 ${color}`} />
                      <p className={mutedCls}>{label}</p>
                      <p className={`font-bold text-xs ${dm ? 'text-white' : 'text-gray-700'}`}>{val}</p>
                    </div>
                  ))}
                </div>
              )}

            {log.meals && log.meals.length > 0 && (
                <div className={`flex flex-wrap gap-1.5 pt-2 border-t mt-2 ${dm ? 'border-gray-800' : 'border-gray-100'}`}>
                  {log.meals.map((m) => (
                    <span key={m.name} className={`text-xs px-2 py-0.5 rounded-full ${dm ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                      {m.name} ×{m.qty}
                    </span>
                  ))}
                </div>
              )}

            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ── Profile ───────────────────────────────────────────────────────────────
  const renderProfile = () => {
    if (!profile) return null;
    const set = (k: keyof UserProfile, v: string | number | string[]) =>
      setProfile(p => p ? ({ ...p, [k]: v } as UserProfile) : p);

    const CONDITIONS = [
      { id: 'diabetes',       label: 'Diabetes' },
      { id: 'hypertension',   label: 'Hypertension' },
      { id: 'heart_disease',  label: 'Heart Disease' },
      { id: 'asthma',         label: 'Asthma' },
      { id: 'sleep_apnea',    label: 'Sleep Apnea' },
      { id: 'hypothyroidism', label: 'Hypothyroidism' },
      { id: 'obesity',        label: 'Obesity' },
    ];

    const toggleCond = (id: string) => {
      const curr = profile.medicalConditions || [];
      set('medicalConditions', curr.includes(id) ? curr.filter(c => c !== id) : [...curr, id]);
    };

    return (
      <div className="max-w-xl mx-auto space-y-5">
        {/* Account info */}
        {card(
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1">
              <h2 className={`text-lg font-bold ${dm ? 'text-white' : 'text-gray-800'}`}>{user?.name}</h2>
              <p className={mutedCls}>{user?.email}</p>
              <p className={`text-xs ${mutedCls}`}>
                Member since {user?.createdAt ? format(parseISO(user.createdAt), 'MMMM d, yyyy') : '—'}
              </p>
            </div>
          </div>
        )}

        {/* Data isolation */}
        {card(
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-green-500 flex-shrink-0" />
            <div>
              <p className={`text-sm font-semibold ${dm ? 'text-white' : 'text-gray-800'}`}>Data Isolation Active</p>
              <p className={`text-xs ${mutedCls}`}>
                Your health data is completely isolated to your account. {logs.length} logs · {snapshots.length} ML snapshots stored.
              </p>
            </div>
          </div>
        )}

        {/* Health Profile */}
        {card(
          <>
            <h3 className={`font-bold mb-4 ${dm ? 'text-white' : 'text-gray-800'}`}>Health Profile</h3>
            <div className="space-y-5">
              {/* Basic */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Age</label>
                  <input type="number" value={profile.age || ''} min={1} max={120}
                    onChange={e => set('age', parseInt(e.target.value) || 0)}
                    className={inputCls} placeholder="e.g. 28" />
                </div>
                <div>
                  <label className={labelCls}>Biological Sex</label>
                  <select value={profile.gender} onChange={e => set('gender', e.target.value)} className={inputCls}>
                    <option value="">Select</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other / Prefer not to say</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Height (cm)</label>
                  <input type="number" value={profile.height || ''} min={50} max={300}
                    onChange={e => set('height', parseInt(e.target.value) || 0)}
                    className={inputCls} placeholder="e.g. 170" />
                </div>
                <div>
                  <label className={labelCls}>Weight (kg)</label>
                  <input type="number" value={profile.weight || ''} min={20} max={500}
                    onChange={e => set('weight', parseFloat(e.target.value) || 0)}
                    className={inputCls} placeholder="e.g. 70" />
                </div>
              </div>

              {profile.height > 0 && profile.weight > 0 && (
                <div className={`p-3 rounded-xl ${dm ? 'bg-gray-800' : 'bg-green-50'}`}>
                  <p className={`text-sm ${dm ? 'text-gray-300' : 'text-gray-700'}`}>
                    BMI: <span className="font-bold text-green-600">{bmi}</span>
                    <span className={`ml-2 text-xs ${mutedCls}`}>(Normal: 18.5–24.9)</span>
                  </p>
                </div>
              )}

              {/* Activity Level */}
              <div>
                <label className={labelCls}>Activity Level</label>
                <select value={profile.activityLevel} onChange={e => set('activityLevel', e.target.value)} className={inputCls}>
                  <option value="sedentary">Sedentary (little/no exercise)</option>
                  <option value="light">Lightly Active (1–3 days/week)</option>
                  <option value="moderate">Moderately Active (3–5 days/week)</option>
                  <option value="active">Very Active (6–7 days/week)</option>
                  <option value="very_active">Extremely Active (physical job / 2×/day)</option>
                </select>
              </div>

              {/* Weight goal */}
              <div>
                <label className={labelCls}>Weight Goal</label>
                <div className="flex flex-wrap gap-2">
                  {([
                    { id: 'lose',     label: '🔻 Lose weight' },
                    { id: 'maintain', label: '➖ Maintain weight' },
                    { id: 'gain',     label: '🔺 Gain weight / muscle' },
                  ] as { id: 'lose' | 'maintain' | 'gain'; label: string }[]).map(o => {
                    const active = (profile.goal || 'maintain') === o.id;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => set('goal', o.id)}
                        className={`px-3.5 py-2 rounded-xl text-sm font-medium border transition-all ${
                          active
                            ? 'bg-green-600 text-white border-green-600'
                            : dm
                            ? 'bg-gray-800 border-gray-700 text-gray-300 hover:border-green-500'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-green-400'
                        }`}
                      >
                        {o.label}
                      </button>
                    );
                  })}
                </div>
                <p className={`text-xs mt-1.5 ${mutedCls}`}>
                  Adjusted with your activity level to set calorie and macro targets.
                </p>
              </div>

              {/* Lifestyle */}
              <h4 className={`font-semibold text-sm pt-1 ${dm ? 'text-gray-200' : 'text-gray-700'}`}>Lifestyle Habits</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Smoking</label>
                  <select value={profile.smoking} onChange={e => set('smoking', e.target.value)} className={inputCls}>
                    <option value="never">Never smoked</option>
                    <option value="former">Former smoker</option>
                    <option value="current">Currently smoke</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Alcohol</label>
                  <select value={profile.alcohol} onChange={e => set('alcohol', e.target.value)} className={inputCls}>
                    <option value="never">Never</option>
                    <option value="rarely">Rarely</option>
                    <option value="moderately">Moderately</option>
                    <option value="frequently">Frequently</option>
                  </select>
                </div>
              </div>

              {/* Diet */}
              <h4 className={`font-semibold text-sm pt-1 ${dm ? 'text-gray-200' : 'text-gray-700'}`}>Dietary Preferences</h4>
              <div>
                <label className={labelCls}>Diet Type</label>
                <select value={profile.dietType} onChange={e => set('dietType', e.target.value)} className={inputCls}>
                  {['balanced','vegetarian','vegan','keto','paleo','mediterranean','unhealthy'].map(o => (
                    <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {([
                  { label: 'Vegetables',      field: 'vegetableIntake' as keyof UserProfile },
                  { label: 'Fruits',          field: 'fruitIntake'     as keyof UserProfile },
                  { label: 'Processed Food',  field: 'processedFood'   as keyof UserProfile },
                ] as { label: string; field: keyof UserProfile }[]).map(({ label, field }) => (
                  <div key={String(field)}>
                    <label className={labelCls}>{label}</label>
                    <select value={String(profile[field])} onChange={e => set(field, e.target.value)} className={inputCls}>
                      {['daily','often','sometimes','rarely'].map(o => (
                        <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {/* Medical */}
              <h4 className={`font-semibold text-sm pt-1 ${dm ? 'text-gray-200' : 'text-gray-700'}`}>Medical Conditions</h4>
              <div className="grid grid-cols-2 gap-2">
                {CONDITIONS.map(c => {
                  const active = (profile.medicalConditions || []).includes(c.id);
                  return (
                    <button key={c.id} type="button" onClick={() => toggleCond(c.id)}
                      className={`px-3 py-2.5 rounded-xl text-sm font-medium border text-left transition-all ${
                        active
                          ? 'bg-green-500 text-white border-green-500'
                          : dm
                          ? 'bg-gray-800 border-gray-700 text-gray-300 hover:border-green-500'
                          : 'bg-white border-gray-200 text-gray-600 hover:border-green-400'
                      }`}
                    >
                      {active && <CheckCircle className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />}
                      {c.label}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={saveProfile}
                className={`w-full py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all ${
                  profileSaved
                    ? 'bg-green-500 text-white'
                    : 'bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-600 hover:to-emerald-700 shadow-lg shadow-green-200/40'
                }`}
              >
                {profileSaved
                  ? <><CheckCircle className="w-5 h-5" /> Profile Saved!</>
                  : <><CheckCircle className="w-5 h-5" /> Save Profile</>
                }
              </button>
            </div>
          </>
        )}
      </div>
    );
  };

  // ── Layout ────────────────────────────────────────────────────────────────
  return (
    <div className={`min-h-screen ${dm ? 'bg-gray-950' : 'bg-gray-50'}`}>
      {/* Header */}
      <header className={`sticky top-0 z-20 backdrop-blur-md border-b ${dm ? 'bg-gray-900/95 border-gray-800' : 'bg-white/95 border-gray-100'}`}>
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-green-100 rounded-xl">
              <Heart className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <span className="text-base font-bold text-green-600">Med</span>
              <span className={`text-base font-bold ${dm ? 'text-gray-400' : 'text-gray-400'}`}>Alert</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={toggleDark}
              className={`p-2 rounded-xl transition-colors ${dm ? 'bg-gray-800 text-yellow-400 hover:bg-gray-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {dm ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button onClick={handleLogout}
              className={`p-2 rounded-xl transition-colors ${dm ? 'bg-gray-800 text-red-400 hover:bg-gray-700' : 'bg-gray-100 text-red-500 hover:bg-red-50'}`}
              title="Sign out">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Nav */}
      <nav className={`sticky top-14 z-10 backdrop-blur-md border-b ${dm ? 'bg-gray-900/95 border-gray-800' : 'bg-white/95 border-gray-100'}`}>
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex gap-0 overflow-x-auto">
            {navItems.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setView(id)}
                className={`flex items-center gap-1.5 px-4 py-3 border-b-2 text-sm font-medium transition-all whitespace-nowrap ${
                  view === id
                    ? 'border-green-500 text-green-600'
                    : `border-transparent ${dm ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-800'}`
                }`}>
                <Icon className="w-4 h-4" />{label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 py-6">
        {view === 'dashboard' && renderDashboard()}
        {view === 'dailyLog'  && renderDailyLog()}
        {view === 'insights'  && renderInsights()}
        {view === 'history'   && renderHistory()}
        {view === 'profile'   && renderProfile()}
      </main>

      {/* Footer */}
      <footer className={`border-t mt-10 py-5 ${dm ? 'border-gray-800' : 'border-gray-100'}`}>
        <div className="max-w-5xl mx-auto px-4 text-center">
          <p className={`text-xs ${dm ? 'text-gray-600' : 'text-gray-400'}`}>
            This project is strictly for IT Capstone Project 1. Made by students from OUR LADY OF FATIMA UNIVERSITY.
          </p>
        </div>
      </footer>
    </div>
  );
}

// ─── Auth Gate ────────────────────────────────────────────────────────────────

function AuthGate() {
  const { isAuthenticated, user } = useAuth();

  const [darkMode, setDarkMode] = useState(() =>
    localStorage.getItem('med_dark') === 'true' ||
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  const toggleDark = () => {
    setDarkMode(d => {
      localStorage.setItem('med_dark', String(!d));
      return !d;
    });
  };

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  return (
    <ConfirmProvider darkMode={darkMode}>
      {!isAuthenticated ? (
        <AuthPage darkMode={darkMode} toggleDark={toggleDark} />
      ) : user?.role === 'doctor' ? (
        <DoctorDashboard darkMode={darkMode} toggleDark={toggleDark} />
      ) : !user?.profileComplete ? (
        <OnboardingPage darkMode={darkMode} />
      ) : (
        <AppInner darkMode={darkMode} toggleDark={toggleDark} />
      )}
    </ConfirmProvider>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}
