import { useState, useEffect, useCallback } from 'react';
import {
  Heart, Activity, Apple, Brain, Droplets, Scale,
  Clock, TrendingUp, TrendingDown, Coffee,
  Dumbbell, Calendar, Plus, Sparkles, BarChart2,
  ChevronDown, ChevronRight, Database, Flame, Beef, Wheat,
  AlertTriangle, Info,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  Legend,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ConfirmProvider, useConfirm } from './context/ConfirmContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import AuthPage from './pages/AuthPage';
import OnboardingPage from './pages/OnboardingPage';
import DoctorDashboard from './pages/DoctorDashboard';
import AccountPage from './pages/AccountPage';
import HeaderUserMenu from './components/HeaderUserMenu';
import {
  profiles, dailyLogs as dbLogs, mlSnapshots, tipReviews,
  syncAllFromServer,
  UserProfile, DailyLog, MLSnapshot, MealEntry,
} from './db/database';
import { runMLAnalysis, MLResult, estimateMacrosFromCalories } from './utils/mlEngine';
import {
  classifyMealQuality,
  foodQualityLabel,
  formatServingBreakdown,
  macroTargetsForProfile,
  mealTotals,
} from './utils/foodEngine';
import DailyLogForm, { getDefaultLogForm, getMissedLogDates } from './components/DailyLogForm';
import MacroCompare from './components/MacroCompare';

// ─── Types ────────────────────────────────────────────────────────────────────

type View = 'dashboard' | 'dailyLog' | 'insights' | 'history' | 'account';

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

function getOverallRiskLabel(score: number): { label: string; cls: (dm: boolean) => string } {
  if (score < 30) return { label: 'Low Risk', cls: (dm) => dm ? 'bg-green-900/30 text-green-300' : 'bg-green-100 text-green-800' };
  if (score < 50) return { label: 'Moderate Risk', cls: (dm) => dm ? 'bg-yellow-900/30 text-yellow-300' : 'bg-yellow-100 text-yellow-800' };
  if (score < 70) return { label: 'High Risk', cls: (dm) => dm ? 'bg-orange-900/30 text-orange-300' : 'bg-orange-100 text-orange-800' };
  return { label: 'Critical Risk', cls: (dm) => dm ? 'bg-red-900/30 text-red-300' : 'bg-red-100 text-red-800' };
}

function getBmiCategory(bmiVal: number): { label: string; cls: (dm: boolean) => string } {
  if (bmiVal < 18.5) return { label: 'Underweight', cls: (dm) => dm ? 'bg-blue-900/30 text-blue-300' : 'bg-blue-100 text-blue-700' };
  if (bmiVal < 25) return { label: 'Normal', cls: (dm) => dm ? 'bg-green-900/30 text-green-300' : 'bg-green-100 text-green-700' };
  if (bmiVal < 30) return { label: 'Overweight', cls: (dm) => dm ? 'bg-yellow-900/30 text-yellow-300' : 'bg-yellow-100 text-yellow-700' };
  return { label: 'Obese', cls: (dm) => dm ? 'bg-red-900/30 text-red-300' : 'bg-red-100 text-red-700' };
}

function HealthSymbolLegend({ dm, mutedCls }: { dm: boolean; mutedCls: string }) {
  return (
    <div className={`rounded-2xl border p-4 ${
      dm
        ? 'bg-gray-900 border-gray-800 shadow-sm'
        : 'bg-white border-gray-200 shadow-[0_2px_10px_rgba(15,23,42,0.06)]'
    }`}>
      <div className="flex items-center gap-2 mb-3">
        <Info className="w-4 h-4 accent-text flex-shrink-0" />
        <h4 className={`text-sm font-semibold ${dm ? 'text-white' : 'text-gray-900'}`}>
          Symbol &amp; Rating Legend
        </h4>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        {/* Trend indicators */}
        <div className={`rounded-xl p-3 space-y-2 border ${dm ? 'bg-gray-800/60 border-gray-700/60' : 'bg-slate-50 border-gray-200/80'}`}>
          <p className={`font-semibold ${dm ? 'text-gray-200' : 'text-gray-800'}`}>Trend Arrows (under title)</p>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-green-600 flex-shrink-0" />
            <span className={mutedCls}><strong className={dm ? 'text-gray-200' : 'text-gray-900'}>Improving:</strong> Better than your previous week</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block w-4 h-1 rounded bg-yellow-500 flex-shrink-0" />
            <span className={mutedCls}><strong className={dm ? 'text-gray-200' : 'text-gray-900'}>Stable:</strong> Steady, or under 8 days logged</span>
          </div>
          <div className="flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-red-600 flex-shrink-0" />
            <span className={mutedCls}><strong className={dm ? 'text-gray-200' : 'text-gray-900'}>Worsening:</strong> Declined from previous week</span>
          </div>
        </div>

        {/* Risk levels */}
        <div className={`rounded-xl p-3 space-y-2 border ${dm ? 'bg-gray-800/60 border-gray-700/60' : 'bg-slate-50 border-gray-200/80'}`}>
          <p className={`font-semibold ${dm ? 'text-gray-200' : 'text-gray-800'}`}>Risk Badges &amp; Bars (on right)</p>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded-full font-semibold ${getRiskColor('low', dm)}`}>Low</span>
            <span className={mutedCls}>0–29% · Healthy range</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded-full font-semibold ${getRiskColor('moderate', dm)}`}>Moderate</span>
            <span className={mutedCls}>30–49% · Room to improve</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded-full font-semibold ${getRiskColor('high', dm)}`}>High</span>
            <span className={mutedCls}>50–69% · Needs attention</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded-full font-semibold ${getRiskColor('critical', dm)}`}>Critical</span>
            <span className={mutedCls}>70–100% · Consult your doctor</span>
          </div>
        </div>

        {/* Metric status dots */}
        <div className={`rounded-xl p-3 space-y-2 border ${dm ? 'bg-gray-800/60 border-gray-700/60' : 'bg-slate-50 border-gray-200/80'}`}>
          <p className={`font-semibold ${dm ? 'text-gray-200' : 'text-gray-800'}`}>Habit Status Dots (inside card)</p>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0" />
            <span className={mutedCls}><strong className={dm ? 'text-gray-200' : 'text-gray-900'}>Green:</strong> Meeting daily target</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 flex-shrink-0" />
            <span className={mutedCls}><strong className={dm ? 'text-gray-200' : 'text-gray-900'}>Amber:</strong> Slightly off target</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0" />
            <span className={mutedCls}><strong className={dm ? 'text-gray-200' : 'text-gray-900'}>Red:</strong> Needs improvement</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main App Inner ───────────────────────────────────────────────────────────

function AppInner() {
  const { user, logout } = useAuth();
  const { darkMode: dm, activePalette } = useTheme();
  const { confirm } = useConfirm();

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
  const today = format(new Date(), 'yyyy-MM-dd');
  const [logDate, setLogDate] = useState(today);
  const existingForDate = logs.find(l => l.date === logDate);
  const [logForm, setLogForm] = useState<Partial<DailyLog>>({});
  const [logSaved, setLogSaved] = useState(false);

  // Load user data & refresh after remote sync completes
  useEffect(() => {
    if (!user) return;
    const loadFromStore = () => {
      const p = profiles.get(user.id);
      setProfile(p || profiles.defaultProfile(user.id));
      setLogs(dbLogs.getAll(user.id));
      setSnapshots(mlSnapshots.getAll(user.id));
    };
    loadFromStore();

    let active = true;
    void syncAllFromServer().then(() => {
      if (!active) return;
      loadFromStore();
    }).catch(() => {});

    return () => {
      active = false;
    };
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
      message: 'Save changes to your health profile? Your daily calorie and nutrition targets will be updated to match.',
      confirmText: 'Save Profile',
      cancelText: 'Keep Editing',
      variant: 'primary',
      iconType: 'check',
    });
    if (!ok) return;

    const cleanedConditions = (profile.medicalConditions || []).filter(c => c !== 'obesity');
    const normalizedDiet = ['balanced', 'vegan', 'unspecified'].includes(profile.dietType)
      ? profile.dietType
      : 'unspecified';
    await profiles.saveAsync({
      ...profile,
      userId: user.id,
      dietType: normalizedDiet,
      medicalConditions: cleanedConditions,
    });
    setProfile(p => p ? { ...p, dietType: normalizedDiet, medicalConditions: cleanedConditions } : p);
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
        ? `Update your health log for ${formattedDate}? Your daily summary and health scores will be refreshed with these new numbers.`
        : `Save your health log for ${formattedDate}? Your daily health scores and insights will be updated based on these entries.`,
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
      foodQuality: classifyMealQuality(meals, profile),
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

  const latestLoggedWeight = [...logs]
    .reverse()
    .find((l) => l.weight != null && l.weight > 0)?.weight;
  const effectiveWeight =
    latestLoggedWeight && latestLoggedWeight > 0
      ? latestLoggedWeight
      : (profile?.weight ?? 0);
  const bmiValue =
    profile && profile.height > 0 && effectiveWeight > 0
      ? effectiveWeight / Math.pow(profile.height / 100, 2)
      : null;
  const bmi = bmiValue !== null ? bmiValue.toFixed(1) : '—';
  const bmiCat = bmiValue !== null ? getBmiCategory(bmiValue) : null;

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
    <div className={`rounded-2xl border p-5 ${
      dm
        ? 'bg-gray-900 border-gray-800 shadow-sm'
        : 'bg-white border-gray-200 shadow-[0_2px_10px_rgba(15,23,42,0.06)]'
    } ${extra}`}>
      {children}
    </div>
  );

  const inputCls = `w-full px-4 py-2.5 rounded-xl border text-sm transition-all accent-focus ${
    dm
      ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-500'
      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
  }`;
  const labelCls = `block text-sm font-medium mb-1.5 ${dm ? 'text-gray-200' : 'text-gray-800'}`;
  const mutedCls = `text-sm ${dm ? 'text-gray-400' : 'text-gray-600'}`;

  const navItems: { id: View; label: string; icon: typeof Activity }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: Activity },
    { id: 'dailyLog',  label: 'Daily Log',  icon: Plus },
    { id: 'insights',  label: 'Insights',   icon: Sparkles },
    { id: 'history',   label: 'History',    icon: BarChart2 },
  ];

  // ── Dashboard ──────────────────────────────────────────────────────────────
  const renderDashboard = () => {
    const snapshotData = snapshots.slice(-14);
    const noData = logs.length === 0;
    const hasLoggedToday = logs.some(l => l.date === today);
    const missedPastDays = logs.length > 0 ? getMissedLogDates(logs, 7) : [];
    const todayLog = logs.find(l => l.date === today);
    const recommendedCalories = macroTargetsForProfile(profile).calories;
    const todayCalorieOverage = todayLog ? todayLog.calories - recommendedCalories : 0;
    const highRisks = mlResult
      ? mlResult.risks.filter(r => r.riskLevel === 'high' || r.riskLevel === 'critical')
      : [];
    const hasCriticalRisk = highRisks.some(r => r.riskLevel === 'critical');
    const overallRiskMeta = mlResult ? getOverallRiskLabel(mlResult.overallScore) : null;

    return (
      <div className="space-y-6">
        {/* Top Dashboard Alerts */}
        {(highRisks.length > 0 || todayCalorieOverage > 0 || !hasLoggedToday || missedPastDays.length > 0) && (
          <div className="space-y-3">
            {/* High / Critical Risk Alert */}
            {highRisks.length > 0 && (
              <div
                role="alert"
                className={`rounded-2xl border p-4 flex items-start justify-between gap-3 flex-wrap ${
                  hasCriticalRisk
                    ? dm ? 'bg-red-950/40 border-red-800 text-red-200' : 'bg-red-50 border-red-200 text-red-900'
                    : dm ? 'bg-orange-950/40 border-orange-800 text-orange-200' : 'bg-orange-50 border-orange-200 text-orange-900'
                }`}
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${hasCriticalRisk ? 'text-red-500' : 'text-orange-500'}`} />
                  <div>
                    <p className="text-sm font-bold">
                      {hasCriticalRisk ? 'Critical Health Risk Alert' : 'High Health Risk Alert'}
                    </p>
                    <p className="text-xs mt-0.5 opacity-90">
                      Attention needed in:{' '}
                      {highRisks
                        .map(r => `${r.category} (${r.score}% · ${r.riskLevel.charAt(0).toUpperCase() + r.riskLevel.slice(1)})`)
                        .join(', ')}
                      .
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setView('insights')}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-xl transition-colors ${
                    hasCriticalRisk
                      ? 'bg-red-600 text-white hover:bg-red-700'
                      : 'bg-orange-500 text-white hover:bg-orange-600'
                  }`}
                >
                  Review Insights
                </button>
              </div>
            )}

            {/* Calorie Exceeded Alert */}
            {todayLog && todayCalorieOverage > 0 && (
              <div
                role="alert"
                className={`rounded-2xl border p-4 flex items-start justify-between gap-3 flex-wrap ${
                  dm ? 'bg-amber-950/40 border-amber-800 text-amber-200' : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}
              >
                <div className="flex items-start gap-3">
                  <Flame className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold">Calorie Target Exceeded Today</p>
                    <p className="text-xs mt-0.5 opacity-90">
                      Your logged food today ({todayLog.calories.toLocaleString()} kcal) is {todayCalorieOverage.toLocaleString()} kcal above your recommended daily goal of {recommendedCalories.toLocaleString()} kcal.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setLogDate(today); setView('dailyLog'); }}
                  className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-amber-500 text-white hover:bg-amber-600 transition-colors"
                >
                  Edit Today&apos;s Log
                </button>
              </div>
            )}

            {/* Missing Daily Log Alert */}
            {(!hasLoggedToday || missedPastDays.length > 0) && (
              <div
                role="status"
                className={`rounded-2xl border p-4 flex items-start justify-between gap-3 flex-wrap ${
                  dm ? 'bg-blue-950/30 border-blue-800 text-blue-200' : 'bg-blue-50 border-blue-200 text-blue-900'
                }`}
              >
                <div className="flex items-start gap-3">
                  <Calendar className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-bold">
                      {!hasLoggedToday ? "Today's Health Log Not Recorded Yet" : 'Missed Check-In Reminder'}
                    </p>
                    <p className="text-xs mt-0.5 opacity-90">
                      {!hasLoggedToday
                        ? 'Log your sleep, activity, water, and meals for today to keep your health summary accurate.'
                        : 'Catch up on unlogged days from the past week to keep your trend complete.'}
                    </p>
                    {missedPastDays.length > 0 && (
                      <div className="flex items-center flex-wrap gap-1.5 mt-2">
                        <span className="text-xs font-medium opacity-80">Missed days:</span>
                        {missedPastDays.slice(0, 5).map(d => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => { setLogDate(d); setView('dailyLog'); }}
                            className={`text-xs px-2 py-0.5 rounded-lg font-medium transition-colors ${
                              dm ? 'bg-blue-900/60 text-blue-200 hover:bg-blue-800' : 'bg-white text-blue-700 border border-blue-200 hover:bg-blue-100'
                            }`}
                          >
                            {format(parseISO(d), 'MMM d')}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {!hasLoggedToday && (
                  <button
                    type="button"
                    onClick={() => { setLogDate(today); setView('dailyLog'); }}
                    className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                  >
                    Log Today
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Welcome Banner */}
        <div className="rounded-2xl p-6 accent-gradient shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.2)' }}>
                Good {getTimeGreeting()}, {user?.name?.split(' ')[0]}! 👋
              </h2>
              <p className="text-white/90 text-sm mt-1">
                {noData
                  ? 'Log your first day to start tracking your personalized health scores.'
                  : `${logs.length} day${logs.length !== 1 ? 's' : ''} of health check-ins recorded — your summary is up to date.`}
              </p>
            </div>
          </div>
          {noData && (
            <button
              onClick={() => setView('dailyLog')}
              className="mt-4 flex items-center gap-2 bg-white/20 hover:bg-white/30 transition-colors px-4 py-2 rounded-xl text-sm font-medium text-white"
            >
              <Plus className="w-4 h-4" /> Log your first entry <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {
              label: 'Overall Score',
              value: mlResult ? `${mlResult.overallScore}` : '—',
              unit: mlResult ? '/100' : '',
              badge: overallRiskMeta ? { text: overallRiskMeta.label, cls: overallRiskMeta.cls(dm) } : null,
              desc: 'Combined daily health risk rating (0–100), where lower scores mean lower overall risk.',
              icon: Heart,
              bg: 'bg-green-100',
              icoCls: 'text-green-600',
            },
            {
              label: 'Day Streak',
              value: `${streak}`,
              unit: streak === 1 ? ' day' : ' days',
              badge: null,
              desc: 'Consecutive days you have saved a daily health check-in up through today.',
              icon: Sparkles,
              bg: 'bg-yellow-100',
              icoCls: 'text-yellow-700',
            },
            {
              label: 'BMI',
              value: bmi,
              unit: '',
              badge: bmiCat ? { text: bmiCat.label, cls: bmiCat.cls(dm) } : null,
              desc: 'Body Mass Index from your height and weight (healthy range: 18.5–24.9).',
              icon: Scale,
              bg: 'bg-blue-100',
              icoCls: 'text-blue-700',
            },
            {
              label: 'Logs Recorded',
              value: `${logs.length}`,
              unit: '',
              badge: null,
              desc: 'Total number of daily health logs you have saved to your account so far.',
              icon: Database,
              bg: 'bg-purple-100',
              icoCls: 'text-purple-700',
            },
          ].map(({ label, value, unit, badge, desc, icon: Icon, bg, icoCls }) => (
            <div key={label} className={`rounded-2xl p-4 border flex flex-col justify-between ${
              dm
                ? 'bg-gray-900 border-gray-800 shadow-sm'
                : 'bg-white border-gray-200 shadow-[0_2px_10px_rgba(15,23,42,0.06)]'
            }`}>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className={`text-sm font-semibold ${dm ? 'text-gray-200' : 'text-gray-700'}`}>{label}</p>
                  <div className={`p-1.5 rounded-lg ${bg}`}>
                    <Icon className={`w-4 h-4 ${icoCls}`} />
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className={`text-2xl font-bold ${dm ? 'text-white' : 'text-gray-900'}`}>
                    {value}<span className={`text-base font-normal ${mutedCls}`}>{unit}</span>
                  </p>
                  {badge && (
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${badge.cls}`}>
                      {badge.text}
                    </span>
                  )}
                </div>
              </div>
              <p className={`text-xs mt-2.5 leading-relaxed ${mutedCls}`}>
                {desc}
              </p>
            </div>
          ))}
        </div>

        {/* No data */}
        {noData && (
          <div className={`rounded-2xl border-2 border-dashed p-12 text-center ${dm ? 'border-gray-700 bg-gray-900/40' : 'border-gray-300 bg-white'}`}>
            <Brain className={`w-12 h-12 mx-auto mb-3 ${dm ? 'text-gray-600' : 'text-gray-400'}`} />
            <h3 className={`text-lg font-semibold mb-1 ${dm ? 'text-gray-200' : 'text-gray-800'}`}>No health logs yet</h3>
            <p className={`${mutedCls} mb-4`}>Save your first daily check-in to start seeing your personalized health scores and trends.</p>
            <button
              onClick={() => setView('dailyLog')}
              className="inline-flex items-center gap-2 px-5 py-2.5 accent-bg rounded-xl font-medium transition-colors"
            >
              <Plus className="w-4 h-4" /> Start Logging
            </button>
          </div>
        )}

        {/* Updating summary */}
        {isAnalyzing && (
          <div className={`rounded-2xl p-4 flex items-center gap-3 border ${dm ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200 shadow-xs'}`}>
            <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin flex-shrink-0 accent-text" />
            <span className="text-sm font-medium accent-text">
              Updating your health insights...
            </span>
          </div>
        )}

        {/* Health Score Trend */}
        {snapshotData.length > 0 && card(
          <>
            <div className="mb-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className={`text-base font-semibold ${dm ? 'text-white' : 'text-gray-900'}`}>Health Score Trend</h3>
                <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${dm ? 'bg-gray-800 text-gray-300' : 'bg-slate-100 text-gray-700 border border-gray-200'}`}>
                  Lower = Lower Health Risk
                </span>
              </div>
              <p className={`text-xs mt-1 ${mutedCls}`}>
                Shows your daily overall health risk score (0–100) across your last 14 logged days. Keeping this line low or trending downward means your daily habits are reducing your health risk.
              </p>
              {snapshotData.length === 1 && (
                <p className="text-xs mt-1 font-medium accent-text">
                  Log more days to see your trend line develop over time.
                </p>
              )}
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={snapshotData}>
                <defs>
                  <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={activePalette.primaryHex} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={activePalette.primaryHex} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={dm ? '#1f2937' : '#e5e7eb'} />
                <XAxis dataKey="date" tick={{ fill: dm ? '#9CA3AF' : '#4B5563', fontSize: 11 }}
                  tickFormatter={v => { try { return format(parseISO(v), 'MMM d'); } catch { return v; } }} />
                <YAxis domain={[0, 100]} tick={{ fill: dm ? '#9CA3AF' : '#4B5563', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: dm ? '#111827' : '#fff', border: dm ? '1px solid #374151' : '1px solid #e5e7eb', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                  labelFormatter={v => { try { return format(parseISO(v as string), 'MMMM d, yyyy'); } catch { return String(v); } }}
                />
                <Legend />
                <Area type="monotone" dataKey="overallScore" stroke={activePalette.primaryHex} strokeWidth={2.5}
                  fillOpacity={1} fill="url(#cg)" name="Overall Risk Score (0–100)" dot={{ fill: activePalette.primaryHex, r: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
          </>
        )}

        {/* Health Categories + Complete Legend */}
        {mlResult && mlResult.risks.length > 0 && (
          <div className="space-y-4">
            <HealthSymbolLegend dm={dm} mutedCls={mutedCls} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {mlResult.risks.map((risk, i) => (
              <div key={i} className={`rounded-2xl border p-5 ${
                dm
                  ? 'bg-gray-900 border-gray-800 shadow-sm'
                  : 'bg-white border-gray-200 shadow-[0_2px_10px_rgba(15,23,42,0.06)]'
              } ${getRiskBorder(risk.riskLevel)}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-xl border ${dm ? 'bg-gray-800 border-gray-700' : 'bg-slate-50 border-gray-200'} accent-text`}>
                      <RiskIcon category={risk.category} />
                    </div>
                    <div>
                      <h4 className={`font-semibold text-sm ${dm ? 'text-white' : 'text-gray-900'}`}>{risk.category}</h4>
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
                <div className={`h-2 w-full rounded-full mb-3 ${dm ? 'bg-gray-800' : 'bg-gray-200'}`}>
                  <div className={`h-full rounded-full transition-all duration-700 ${getRiskBarColor(risk.riskLevel)}`}
                    style={{ width: `${risk.score}%` }} />
                </div>
                <div className="flex justify-between text-xs mb-3">
                  <span className={mutedCls}>Risk Score</span>
                  <span className={`font-semibold ${dm ? 'text-white' : 'text-gray-900'}`}>{risk.score}%</span>
                </div>

                {/* Metrics behind the rating */}
                <div className={`rounded-xl p-3 space-y-1.5 mb-3 border ${dm ? 'bg-gray-800/60 border-gray-700/60' : 'bg-slate-50 border-gray-200/80'}`}>
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
        {mlResult && mlResult.risks.length > 0 && (
          <HealthSymbolLegend dm={dm} mutedCls={mutedCls} />
        )}

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
              <h4 className={`text-xs font-bold uppercase tracking-widest mb-2 ${dm ? 'text-gray-400' : 'text-gray-600'}`}>
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
            label="Nutrition vs. Daily Targets (last 7 days)"
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
            <h3 className={`font-semibold mb-1 ${dm ? 'text-white' : 'text-gray-800'}`}>Risk Trends Over Time</h3>
            <p className={`text-xs mb-4 ${mutedCls}`}>
              Compares your four health risk areas across recent logged days (lower percentages mean lower health risk).
            </p>
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
            <h3 className={`font-semibold mb-1 ${dm ? 'text-white' : 'text-gray-800'}`}>Weekly Activity Summary</h3>
            <p className={`text-xs mb-4 ${mutedCls}`}>
              Your daily sleep hours, exercise minutes, and water intake over your last 7 logged days.
            </p>
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

        {/* Nutrition overview bar chart */}
        {recentLogs.length > 0 && card(
          <>
            <h3 className={`font-semibold mb-1 ${dm ? 'text-white' : 'text-gray-800'}`}>Weekly Nutrition Overview</h3>
            <p className={`text-xs mb-4 ${mutedCls}`}>
              Daily protein, carbohydrate, and fat totals (in grams) across your last 7 logged days.
            </p>
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
        <div className={`rounded-2xl border overflow-hidden ${
          dm ? 'bg-gray-900 border-gray-800 shadow-sm' : 'bg-white border-gray-200 shadow-[0_2px_10px_rgba(15,23,42,0.06)]'
        }`}>
          <button
            onClick={() => setInsightsAdvancedOpen(!insightsAdvancedOpen)}
            className="w-full flex items-center justify-between p-4 text-left"
          >
            <span className={`font-semibold text-sm ${dm ? 'text-gray-300' : 'text-gray-700'}`}>
              System Performance Details (Optional)
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
                    <h2 className={`text-lg font-bold ${dm ? 'text-white' : 'text-gray-800'}`}>Assessment Confidence</h2>
                    <p className={mutedCls}>
                      {logs.length < 3
                        ? `Log ${3 - logs.length} more day${3 - logs.length !== 1 ? 's' : ''} to unlock full insights.`
                        : `Based on ${logs.length} days of data — ${mlResult?.confidence ?? 0}% confidence.`}
                    </p>
                    {mlResult?.trainedOn && (
                      <p className={`text-xs mt-1 ${dm ? 'text-green-400' : 'text-green-600'}`}>
                        Last calibrated: {mlResult.trainedOn}
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
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className={`text-lg font-bold mb-1 ${dm ? 'text-white' : 'text-gray-800'}`}>Full Log History</h2>
            <p className={mutedCls}>{logs.length} entries recorded since account creation</p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
              <span className={mutedCls}>Daily goal met</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-400" />
              <span className={mutedCls}>Below goal / high caffeine</span>
            </span>
          </div>
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
            <div key={i} className={`rounded-2xl border p-4 ${
              dm
                ? 'bg-gray-900 border-gray-800 shadow-sm'
                : 'bg-white border-gray-200 shadow-[0_2px_10px_rgba(15,23,42,0.06)]'
            }`}>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 accent-text" />
                  <span className={`font-semibold text-sm ${dm ? 'text-white' : 'text-gray-900'}`}>
                    {format(parseISO(log.date), 'EEEE, MMMM d, yyyy')}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {log.calories > 0 && (
                    <span className="text-xs px-2.5 py-1 rounded-full font-medium bg-orange-100 text-orange-800">
                      {log.calories} kcal
                    </span>
                  )}
                  {log.foodQuality && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${dm ? 'bg-gray-800 text-gray-300' : 'bg-slate-100 text-gray-700 border border-gray-200'}`}>
                      {foodQualityLabel(log.foodQuality)}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => { setLogDate(log.date); setView('dailyLog'); }}
                    className="text-xs font-medium px-2.5 py-1 rounded-lg accent-bg transition-colors"
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
                  {log.meals.map((m, idx) => (
                    <span key={`${m.name}-${idx}`} className={`text-xs px-2 py-0.5 rounded-full ${dm ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                      {m.name} · {formatServingBreakdown(m)}
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

  // ── Layout ────────────────────────────────────────────────────────────────
  return (
    <div className={`min-h-screen ${dm ? 'bg-gray-950' : 'bg-slate-100/75'}`}>
      {/* Header */}
      <header className={`sticky top-0 z-20 backdrop-blur-md border-b ${
        dm ? 'bg-gray-900/95 border-gray-800' : 'bg-white/95 border-gray-200 shadow-xs'
      }`}>
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setView('dashboard')}
            className="flex items-center gap-2.5 text-left"
          >
            <div className="p-1.5 rounded-xl accent-soft">
              <Heart className="w-5 h-5" />
            </div>
            <div>
              <span className="text-base font-bold accent-text">Med</span>
              <span className={`text-base font-bold ${dm ? 'text-gray-300' : 'text-gray-800'}`}>Alert</span>
            </div>
          </button>
          <HeaderUserMenu
            userName={user?.name}
            userEmail={user?.email}
            roleLabel="Patient"
            accountActive={view === 'account'}
            onOpenAccount={() => setView('account')}
            onLogout={handleLogout}
          />
        </div>
      </header>

      {/* Nav */}
      <nav className={`sticky top-14 z-10 backdrop-blur-md border-b ${
        dm ? 'bg-gray-900/95 border-gray-800' : 'bg-white/95 border-gray-200'
      }`}>
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex gap-0 overflow-x-auto">
            {navItems.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setView(id)}
                className={`flex items-center gap-1.5 px-4 py-3 border-b-2 text-sm font-medium transition-all whitespace-nowrap ${
                  view === id
                    ? 'accent-tab-active font-semibold'
                    : `border-transparent ${dm ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 hover:text-gray-900'}`
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
        {view === 'account'   && (
          <AccountPage
            onBack={() => setView('dashboard')}
            backLabel="Back to Dashboard"
            profile={profile}
            setProfile={setProfile}
            onSaveProfile={saveProfile}
            profileSaved={profileSaved}
            logsCount={logs.length}
            snapshotsCount={snapshots.length}
          />
        )}
      </main>

      {/* Footer */}
      <footer className={`border-t mt-10 py-5 ${dm ? 'border-gray-800' : 'border-gray-200 bg-white/60'}`}>
        <div className="max-w-5xl mx-auto px-4 text-center">
          <p className={`text-xs ${dm ? 'text-gray-500' : 'text-gray-600'}`}>
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
  const { darkMode, toggleDark } = useTheme();

  return (
    <ConfirmProvider darkMode={darkMode}>
      {!isAuthenticated ? (
        <AuthPage darkMode={darkMode} toggleDark={toggleDark} />
      ) : user?.role === 'doctor' ? (
        <DoctorDashboard />
      ) : !user?.profileComplete ? (
        <OnboardingPage darkMode={darkMode} />
      ) : (
        <AppInner />
      )}
    </ConfirmProvider>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </ThemeProvider>
  );
}
