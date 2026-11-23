import { useEffect, useMemo, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import {
  Heart, LogOut, Stethoscope, CheckCircle, XCircle, Sun, Moon,
  Clock, Sparkles, UserRound, Users, Activity, Droplets, Coffee,
  Dumbbell, Flame, Scale, TrendingUp, Calendar, Pencil, X,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import { auth, dailyLogs, mlSnapshots, profiles, tipReviews, TipReview } from '../db/database';

interface Props {
  darkMode: boolean;
  toggleDark: () => void;
}

function riskLevel(score: number): 'Low' | 'Moderate' | 'High' | 'Critical' {
  if (score < 30) return 'Low';
  if (score < 50) return 'Moderate';
  if (score < 70) return 'High';
  return 'Critical';
}

function levelPill(level: string, dm: boolean): string {
  const map: Record<string, [string, string]> = {
    Low:      ['bg-green-100 text-green-700',   'bg-green-900/40 text-green-300'],
    Moderate: ['bg-yellow-100 text-yellow-700', 'bg-yellow-900/40 text-yellow-300'],
    High:     ['bg-orange-100 text-orange-700', 'bg-orange-900/40 text-orange-300'],
    Critical: ['bg-red-100 text-red-700',       'bg-red-900/40 text-red-300'],
  };
  return (map[level] || map.Low)[dm ? 1 : 0];
}

function barColor(level: string): string {
  return {
    Low: 'bg-green-500', Moderate: 'bg-yellow-500', High: 'bg-orange-500', Critical: 'bg-red-500',
  }[level] || 'bg-gray-400';
}

export default function DoctorDashboard({ darkMode, toggleDark }: Props) {
  const { user, logout, refreshUser } = useAuth();
  const { confirm } = useConfirm();
  const dm = darkMode;

  const [all, setAll] = useState<TipReview[]>(() => tipReviews.getAll());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ msg: string; kind: 'ok' | 'err' } | null>(null);
  const toastTimer = useRef<number | null>(null);
  const [selfModal, setSelfModal] = useState(false);
  const [selfName, setSelfName] = useState('');

  const refresh = () => setAll(tipReviews.getAll());

  useEffect(() => {
    void auth.syncUsers().then(() => refresh());
    void tipReviews.syncFromServer().then(revs => setAll(revs));
  }, []);

  const showToast = (msg: string, kind: 'ok' | 'err' = 'ok') => {
    setToast({ msg, kind });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  };

  const counts = useMemo(() => ({
    pending: all.filter(r => r.status === 'pending').length,
    approved: all.filter(r => r.status === 'approved').length,
    rejected: all.filter(r => r.status === 'rejected').length,
  }), [all]);

  const patients = useMemo(() => {
    const map = new Map<string, { pending: number; approved: number; rejected: number }>();
    for (const r of all) {
      const c = map.get(r.patientId) ?? { pending: 0, approved: 0, rejected: 0 };
      c[r.status]++;
      map.set(r.patientId, c);
    }
    return auth
      .getAll()
      .filter(u => u.role === 'patient')
      .map(u => {
        const c = map.get(u.id) ?? { pending: 0, approved: 0, rejected: 0 };
        const snaps = mlSnapshots.getAll(u.id);
        const last = snaps[snaps.length - 1];
        return { user: u, ...c, lastScore: last?.overallScore, lastDate: last?.date };
      })
      .sort((a, b) => b.pending - a.pending || a.user.name.localeCompare(b.user.name));
  }, [all]);

  const selected = patients.find(p => p.user.id === selectedId) ?? (patients[0] ?? null);
  const activeId = selected?.user.id ?? null;

  const profile = selected ? profiles.get(selected.user.id) : null;
  const logs = selected ? dailyLogs.getAll(selected.user.id) : [];
  const snaps = selected ? mlSnapshots.getAll(selected.user.id) : [];
  const latestSnap = snaps[snaps.length - 1];
  const reviews = selected ? all.filter(r => r.patientId === selected.user.id) : [];

  // Group tips by (patient, date, category) → one editable block per category
  interface TipGroup { key: string; category: string; date: string; rows: TipReview[]; }
  const groupKey = (r: TipReview) => r.key.split('|').slice(0, 3).join('|');
  const reviewsByDate = useMemo<[string, TipGroup[]][]>(() => {
    const byDate = new Map<string, Map<string, TipGroup>>();
    for (const r of reviews) {
      const gkey = groupKey(r);
      let day = byDate.get(r.date);
      if (!day) { day = new Map(); byDate.set(r.date, day); }
      let g = day.get(gkey);
      if (!g) { g = { key: gkey, category: r.category, date: r.date, rows: [] }; day.set(gkey, g); }
      g.rows.push(r);
    }
    const out: [string, TipGroup[]][] = [];
    for (const [date, day] of byDate) {
      out.push([date, [...day.values()]
        .map(g => ({ ...g, rows: [...g.rows].sort((a, b) => a.index - b.index) }))
        .sort((a, b) => a.category.localeCompare(b.category))]);
    }
    out.sort((a, b) => b[0].localeCompare(a[0]));
    return out;
  }, [reviews]);

  const bmi = profile && profile.height > 0 && profile.weight > 0
    ? (profile.weight / Math.pow(profile.height / 100, 2)).toFixed(1)
    : null;

  const recentLogs = logs.slice(-7).reverse();
  const trendData = snaps.slice(-14).map(s => ({ date: s.date, overallScore: s.overallScore }));

  // Compose the block shown in the textarea for a tip group
  const composeBlock = (g: TipGroup) => {
    const approved = g.rows.find(r => r.status === 'approved' && r.approvedText?.trim());
    if (approved) return approved.approvedText.trim();
    return g.rows.map(r => r.originalText).map(s => s.trim()).filter(Boolean).join('\n');
  };

  const groupStatus = (g: TipGroup) => {
    if (g.rows.some(r => r.status === 'pending')) return { label: 'Awaiting your decision', cls: 'text-amber-500' };
    if (g.rows.some(r => r.status === 'approved')) return {
      label: `Final — approved by ${g.rows.find(r => r.status === 'approved')?.reviewedBy || 'doctor'}`,
      cls: 'text-green-500',
    };
    return { label: 'Rejected', cls: 'text-red-500' };
  };

  const submitGroup = (g: TipGroup, status: 'approved' | 'rejected') => {
    const block = edits[g.key] ?? composeBlock(g);
    tipReviews.setGroup(g.key, status, block, user?.name || 'Doctor');
    setEdits(prev => {
      const next = { ...prev };
      delete next[g.key];
      return next;
    });
    refresh();
    showToast(
      status === 'approved'
        ? `Recommendations published to ${selected?.user.name ?? 'patient'}`
        : `Recommendations hidden for ${selected?.user.name ?? 'patient'}`,
      status === 'approved' ? 'ok' : 'err'
    );
  };

  const handleLogout = async () => {
    const ok = await confirm({
      title: 'Sign Out',
      message: 'Are you sure you want to sign out of the Doctor Portal?',
      confirmText: 'Sign Out',
      cancelText: 'Stay Logged In',
      variant: 'danger',
      iconType: 'logout',
    });
    if (ok) {
      logout();
    }
  };

  const handleGroupDecision = async (g: TipGroup, status: 'approved' | 'rejected') => {
    const isApproved = g.rows.some((r) => r.status === 'approved');
    if (status === 'rejected') {
      const ok = await confirm({
        title: isApproved ? 'Revoke Clinical Approval' : 'Reject Recommendations',
        message: isApproved
          ? `Are you sure you want to revoke the approved recommendations for ${selected?.user.name ?? 'this patient'}? This will remove them from the patient's view.`
          : `Are you sure you want to reject the AI recommendations for ${g.category}?`,
        confirmText: isApproved ? 'Revoke Approval' : 'Reject Tips',
        cancelText: 'Keep As Is',
        variant: 'danger',
        iconType: 'alert',
      });
      if (!ok) return;
    } else {
      const ok = await confirm({
        title: 'Approve & Publish Recommendations',
        message: `Publish your final clinical recommendations for "${g.category}" to ${selected?.user.name ?? 'this patient'}?`,
        confirmText: 'Publish Recommendation',
        cancelText: 'Review More',
        variant: 'primary',
        iconType: 'check',
      });
      if (!ok) return;
    }
    submitGroup(g, status);
  };

  const openSelfModal = () => {
    setSelfName(user?.name || '');
    setSelfModal(true);
  };

  const saveSelfProfile = async () => {
    if (!user || !selfName.trim()) return;
    const ok = await confirm({
      title: 'Update Doctor Name',
      message: `Are you sure you want to change your display name to "${selfName.trim()}"?`,
      confirmText: 'Update Name',
      cancelText: 'Cancel',
      variant: 'primary',
      iconType: 'check',
    });
    if (!ok) return;

    auth.updateUser(user.id, { name: selfName.trim() });
    refreshUser();
    setSelfModal(false);
    showToast('Your name has been updated.');
  };

  const inputCls = `w-full px-4 py-2.5 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 focus:ring-green-500 ${
    dm ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-500' : 'bg-white border-gray-200 text-gray-800'
  }`;
  const mutedCls = `text-sm ${dm ? 'text-gray-400' : 'text-gray-500'}`;

  return (
    <div className={`min-h-screen ${dm ? 'bg-gray-950' : 'bg-gray-50'}`}>
      <header className={`sticky top-0 z-20 backdrop-blur-md border-b ${dm ? 'bg-gray-900/95 border-gray-800' : 'bg-white/95 border-gray-100'}`}>
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-green-100 rounded-xl">
              <Heart className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <span className="text-base font-bold text-green-600">Med</span>
              <span className={`text-base font-bold ${dm ? 'text-gray-400' : 'text-gray-400'}`}>Alert</span>
              <span className={`ml-2 text-xs font-semibold px-2 py-0.5 rounded-full ${dm ? 'bg-green-900/40 text-green-300' : 'bg-green-50 text-green-700'}`}>
                Doctor
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={openSelfModal}
              className={`flex items-center gap-1.5 text-sm hidden sm:flex px-2.5 py-1.5 rounded-xl transition-colors ${
                dm ? 'text-gray-300 hover:bg-gray-800' : 'text-gray-600 hover:bg-gray-100'
              }`}
              title="Edit your name">
              <Pencil className="w-3.5 h-3.5" />
              {user?.name}
            </button>
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

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Global stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: 'Pending Approvals', value: counts.pending, icon: Clock, cls: 'bg-amber-100 text-amber-600' },
            { label: 'Approved (Final)', value: counts.approved, icon: CheckCircle, cls: 'bg-green-100 text-green-600' },
            { label: 'Rejected', value: counts.rejected, icon: XCircle, cls: 'bg-red-100 text-red-600' },
          ].map(({ label, value, icon: Icon, cls }) => (
            <div key={label} className={`rounded-2xl p-4 shadow-sm border ${dm ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-sm ${dm ? 'text-gray-400' : 'text-gray-500'}`}>{label}</p>
                  <p className={`text-2xl font-bold ${dm ? 'text-white' : 'text-gray-800'}`}>{value}</p>
                </div>
                <div className={`p-2.5 rounded-xl ${cls}`}>
                  <Icon className="w-5 h-5" />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6 items-start">
          {/* ── Patient list ── */}
          <div className={`rounded-2xl shadow-sm border overflow-hidden sticky top-32 ${dm ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'}`}>
            <div className={`flex items-center gap-2 px-4 py-3 border-b ${dm ? 'border-gray-800' : 'border-gray-100'}`}>
              <Users className="w-4 h-4 text-green-500" />
              <h2 className={`font-bold text-sm ${dm ? 'text-white' : 'text-gray-800'}`}>Patient List</h2>
              <span className={`ml-auto text-xs ${mutedCls}`}>{patients.length}</span>
            </div>
            <div className="max-h-[calc(100vh-220px)] overflow-y-auto">
              {patients.length === 0 ? (
                <p className={`text-sm p-4 ${mutedCls}`}>
                  No patients yet. Patients register through the app and log daily data.
                </p>
              ) : (
                patients.map(p => {
                  const active = p.user.id === activeId;
                  return (
                    <button
                      key={p.user.id}
                      type="button"
                      onClick={() => setSelectedId(p.user.id)}
                      className={`w-full text-left px-4 py-3 border-b transition-colors ${
                        active
                          ? 'bg-green-50 border-green-100'
                          : dm
                          ? 'bg-gray-900 border-gray-800 hover:bg-gray-800'
                          : 'bg-white border-gray-100 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                          active ? 'bg-green-500 text-white' : 'bg-gradient-to-br from-green-400 to-emerald-600 text-white'
                        }`}>
                          {p.user.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-semibold truncate ${dm ? 'text-white' : 'text-gray-800'}`}>
                            {p.user.name}
                          </p>
                          <p className={`text-xs truncate ${mutedCls}`}>{p.user.email}</p>
                          <p className={`text-xs mt-0.5 ${mutedCls}`}>
                            {p.lastScore != null ? `Score ${p.lastScore}` : 'No data yet'}
                          </p>
                        </div>
                        {p.pending > 0 && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 flex-shrink-0">
                            {p.pending}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* ── Patient detail ── */}
          {selected ? (
            <div className="space-y-5">
              {/* Patient header */}
              <div className={`rounded-2xl shadow-sm border p-5 ${dm ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'}`}>
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-white text-lg font-bold flex-shrink-0">
                    {selected.user.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className={`font-bold ${dm ? 'text-white' : 'text-gray-800'}`}>{selected.user.name}</h2>
                    <p className={mutedCls}>{selected.user.email}</p>
                  </div>
                  <div className="flex gap-2 text-xs">
                    <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 font-semibold">{selected.pending} pending</span>
                    <span className="px-2.5 py-1 rounded-full bg-green-100 text-green-700 font-semibold">{selected.approved} approved</span>
                    <span className="px-2.5 py-1 rounded-full bg-red-100 text-red-700 font-semibold">{selected.rejected} rejected</span>
                  </div>
                </div>
              </div>

              {/* Clinical summary */}
              <div className={`rounded-2xl shadow-sm border p-5 ${dm ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'}`}>
                <h3 className={`font-bold mb-4 flex items-center gap-2 ${dm ? 'text-white' : 'text-gray-800'}`}>
                  <Activity className="w-4 h-4 text-green-500" /> Patient Insights
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div className={`rounded-xl p-4 ${dm ? 'bg-gray-800' : 'bg-gray-50'}`}>
                    <p className={`text-xs mb-1 ${mutedCls}`}>Profile</p>
                    {profile ? (
                      <div className="space-y-1">
                        <p className={`text-sm ${dm ? 'text-gray-200' : 'text-gray-700'}`}>
                          {profile.age} yrs · {profile.gender} · {profile.activityLevel.replace('_', ' ')}
                        </p>
                        {bmi && (
                          <p className={`text-sm ${dm ? 'text-gray-200' : 'text-gray-700'}`}>
                            BMI <span className="font-bold text-green-500">{bmi}</span>
                          </p>
                        )}
                        <p className={`text-xs ${mutedCls}`}>
                          {profile.smoking} · {profile.alcohol} · {profile.dietType}
                        </p>
                      </div>
                    ) : (
                      <p className={`text-sm ${mutedCls}`}>No health profile on file.</p>
                    )}
                  </div>

                  <div className={`rounded-xl p-4 ${dm ? 'bg-gray-800' : 'bg-gray-50'}`}>
                    <p className={`text-xs mb-2 ${mutedCls}`}>Latest Risk Assessment{latestSnap ? ` · ${latestSnap.date}` : ''}</p>
                    {latestSnap ? (
                      <div className="space-y-2">
                        {[
                          { label: 'Overall', v: latestSnap.overallScore },
                          { label: 'Cardiovascular', v: latestSnap.cardiovascular },
                          { label: 'Metabolic', v: latestSnap.metabolic },
                          { label: 'Nutritional', v: latestSnap.nutritional },
                          { label: 'Sleep', v: latestSnap.sleep },
                        ].map(({ label, v }) => {
                          const lv = riskLevel(v);
                          return (
                            <div key={label} className="flex items-center gap-2">
                              <span className={`w-24 text-xs flex-shrink-0 ${mutedCls}`}>{label}</span>
                              <div className={`h-2 flex-1 rounded-full ${dm ? 'bg-gray-700' : 'bg-gray-100'}`}>
                                <div className={`h-full rounded-full ${barColor(lv)}`} style={{ width: `${v}%` }} />
                              </div>
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${levelPill(lv, dm)}`}>
                                {v} · {lv}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className={`text-sm ${mutedCls}`}>No ML assessment yet — patient hasn't logged enough data.</p>
                    )}
                  </div>
                </div>

                {trendData.length >= 2 && (
                  <div className="h-44">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={trendData}>
                        <defs>
                          <linearGradient id="doc-cg" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10B981" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={dm ? '#1f2937' : '#f3f4f6'} />
                        <XAxis dataKey="date" tick={{ fill: dm ? '#6B7280' : '#9CA3AF', fontSize: 11 }}
                          tickFormatter={v => { try { return format(parseISO(v), 'MMM d'); } catch { return v; } }} />
                        <YAxis domain={[0, 100]} tick={{ fill: dm ? '#6B7280' : '#9CA3AF', fontSize: 11 }} />
                        <Tooltip
                          contentStyle={{ backgroundColor: dm ? '#111827' : '#fff', border: 'none', borderRadius: 10 }}
                          labelFormatter={v => { try { return format(parseISO(v as string), 'MMMM d, yyyy'); } catch { return String(v); } }}
                        />
                        <Area type="monotone" dataKey="overallScore" stroke="#10B981" strokeWidth={2}
                          fillOpacity={1} fill="url(#doc-cg)" name="Overall Score" dot={{ fill: '#10B981', r: 3 }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Recent logs */}
              {recentLogs.length > 0 && (
                <div className={`rounded-2xl shadow-sm border p-5 ${dm ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'}`}>
                  <h3 className={`font-bold mb-4 flex items-center gap-2 ${dm ? 'text-white' : 'text-gray-800'}`}>
                    <Flame className="w-4 h-4 text-green-500" /> Recent Daily Logs (last {recentLogs.length})
                  </h3>
                  <div className="space-y-2">
                    {recentLogs.map(l => (
                      <div key={l.id} className={`rounded-xl border p-3 flex items-center justify-between gap-3 flex-wrap ${
                        dm ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-100'
                      }`}>
                        <span className={`text-sm font-medium ${dm ? 'text-white' : 'text-gray-800'}`}>
                          {format(parseISO(l.date), 'EEE, MMM d')}
                        </span>
                        <div className="flex gap-3 text-xs">
                          {[
                            { icon: Clock,    label: l.sleepHours !== undefined ? `${l.sleepHours}h` : '—' },
                            { icon: Dumbbell, label: l.exerciseMinutes !== undefined ? `${l.exerciseMinutes}m` : '—' },
                            { icon: Droplets, label: l.waterIntake !== undefined ? `${l.waterIntake} cups` : '—' },
                            { icon: Coffee,   label: l.caffeineIntake !== undefined ? `${l.caffeineIntake} cups` : '—' },
                            { icon: Scale,    label: l.weight ? `${l.weight}kg` : '—' },
                            { icon: Flame,    label: l.calories ? `${l.calories}k` : '—' },
                          ].map(({ icon: Icon, label }, i) => (
                            <span key={i} className={`flex items-center gap-1 ${dm ? 'text-white' : 'text-gray-800'}`}>
                              <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${dm ? 'text-gray-400' : 'text-gray-400'}`} />
                              {label}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tips review */}
              <div className={`rounded-2xl shadow-sm border p-5 ${dm ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'}`}>
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-xl bg-green-100 text-green-600">
                    <Stethoscope className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className={`font-bold ${dm ? 'text-white' : 'text-gray-800'}`}>
                      Recommendations — Your Final Say
                    </h3>
                    <p className={`text-sm ${mutedCls}`}>
                      One block per health category — type as many or as few recommendations as you want, each on its own line. Approve to publish to the patient, or reject to hide.
                    </p>
                  </div>
                </div>

                {reviewsByDate.length === 0 ? (
                  <div className={`rounded-2xl border-2 border-dashed p-10 text-center mt-2 ${dm ? 'border-gray-700' : 'border-gray-200'}`}>
                    <Sparkles className={`w-10 h-10 mx-auto mb-3 ${dm ? 'text-gray-600' : 'text-gray-300'}`} />
                    <p className={`${mutedCls}`}>
                      No generated tips yet. Ask the patient to log daily data — the ML engine will queue tips here.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-5">
                    {reviewsByDate.map(([date, groups]) => (
                      <div key={date}>
                        <p className={`text-xs font-bold uppercase tracking-widest mb-2 flex items-center gap-2 ${dm ? 'text-gray-500' : 'text-gray-400'}`}>
                          <Calendar className="w-3.5 h-3.5" />
                          {format(parseISO(date), 'EEEE, MMMM d, yyyy')}
                        </p>
                        <div className="space-y-3">
                          {groups.map(g => {
                            const st = groupStatus(g);
                            const block = edits[g.key] ?? composeBlock(g);
                            const lineCount = block.replace(/\s+$/, '').split('\n').filter(s => s.trim()).length;
                            const isApproved = g.rows.some(r => r.status === 'approved');
                            const allRejected = g.rows.every(r => r.status === 'rejected');
                            return (
                              <div key={g.key} className={`rounded-xl border p-3.5 ${dm ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'}`}>
                                <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${
                                    dm ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'
                                  }`}>
                                    {g.category}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <span className={`text-xs ${st.cls}`}>{st.label}</span>
                                    {lineCount > 0 && (
                                      <span className={`text-xs ${dm ? 'text-gray-500' : 'text-gray-400'}`}>
                                        {lineCount} recommendation{lineCount !== 1 ? 's' : ''}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <textarea
                                  value={block}
                                  onChange={e => setEdits(prev => ({ ...prev, [g.key]: e.target.value }))}
                                  rows={Math.max(2, Math.min(block.split('\n').length + 1, 8))}
                                  placeholder="Type each recommendation on its own line — one block per category."
                                  className={`${inputCls} resize-none leading-relaxed`}
                                />
                                {g.rows[0]?.reviewedAt && (
                                  <p className={`text-xs mt-1 ${dm ? 'text-gray-500' : 'text-gray-400'}`}>
                                    Last reviewed {format(parseISO(g.rows[0].reviewedAt), 'MMM d, h:mm a')}
                                  </p>
                                )}
                                <div className="flex gap-2 mt-2.5 justify-end">
                                  {!allRejected && (
                                    <button onClick={() => handleGroupDecision(g, 'rejected')}
                                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium border border-red-300 text-red-600 hover:bg-red-50 transition-colors">
                                      <XCircle className="w-4 h-4" /> {isApproved ? 'Revoke Final' : 'Reject'}
                                    </button>
                                  )}
                                  <button onClick={() => handleGroupDecision(g, 'approved')}
                                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-green-600 text-white hover:bg-green-700 transition-colors">
                                    <CheckCircle className="w-4 h-4" />
                                    {isApproved ? 'Update & Keep Final' : allRejected ? 'Re-approve' : 'Approve & Make Final'}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className={`rounded-2xl border-2 border-dashed p-16 text-center ${dm ? 'border-gray-700' : 'border-gray-200'}`}>
              <UserRound className={`w-12 h-12 mx-auto mb-3 ${dm ? 'text-gray-600' : 'text-gray-300'}`} />
              <h3 className={`text-lg font-semibold mb-1 ${dm ? 'text-gray-300' : 'text-gray-600'}`}>Select a patient</h3>
              <p className={mutedCls}>Open a patient to review their insights and recommendations.</p>
            </div>
          )}
        </div>

        <div className={`rounded-2xl border p-4 flex items-start gap-3 ${dm ? 'bg-green-900/10 border-green-800' : 'bg-green-50 border-green-100'}`}>
          <TrendingUp className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
          <p className={`text-sm ${dm ? 'text-green-300' : 'text-green-700'}`}>
            Only tips you approve become final — the patient sees exactly what you approve. You can revise or re-approve any tip at any time.
          </p>
        </div>
      </main>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-[toast-in_.25s_ease]">
          <div className={`flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl text-sm font-medium text-white ${
            toast.kind === 'ok' ? 'bg-green-600' : 'bg-red-600'
          }`}>
            {toast.kind === 'ok' ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {toast.msg}
          </div>
        </div>
      )}

      {/* Edit own profile modal */}
      {selfModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setSelfModal(false)}>
          <div
            className={`w-full max-w-md rounded-3xl shadow-2xl p-6 ${dm ? 'bg-gray-900 border border-gray-800' : 'bg-white'}`}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className={`font-bold text-lg ${dm ? 'text-white' : 'text-gray-800'}`}>
                  Edit Your Profile
                </h3>
                <p className={`text-sm ${mutedCls}`}>
                  Fix a misspelling or update how your name appears.
                </p>
              </div>
              <button onClick={() => setSelfModal(false)}
                className={`p-2 rounded-xl transition-colors ${dm ? 'bg-gray-800 text-gray-400 hover:bg-gray-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-1.5 ${dm ? 'text-gray-300' : 'text-gray-700'}`}>Full Name</label>
                <input
                  type="text"
                  value={selfName}
                  onChange={e => setSelfName(e.target.value)}
                  className={inputCls}
                  placeholder="Dr. Jane Smith"
                />
              </div>

              <button onClick={saveSelfProfile} disabled={!selfName.trim()}
                className="w-full py-3 rounded-xl font-semibold bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-600 hover:to-emerald-700 transition-all disabled:opacity-50 shadow-lg shadow-green-200/40 flex items-center justify-center gap-2">
                <CheckCircle className="w-5 h-5" /> Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}