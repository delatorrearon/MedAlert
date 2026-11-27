import { Dispatch, SetStateAction, useState } from 'react';
import { format, parseISO } from 'date-fns';
import {
  ArrowLeft, CheckCircle, Moon, Palette, Shield, Sun, User as UserIcon, Heart,
} from 'lucide-react';
import { COLOR_PALETTES, useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import { auth, UserProfile } from '../db/database';

interface AccountPageProps {
  onBack: () => void;
  backLabel?: string;
  // Patient-only health profile props
  profile?: UserProfile | null;
  setProfile?: Dispatch<SetStateAction<UserProfile | null>>;
  onSaveProfile?: () => Promise<void> | void;
  profileSaved?: boolean;
  logsCount?: number;
  snapshotsCount?: number;
}

const CONDITIONS = [
  { id: 'diabetes', label: 'Diabetes' },
  { id: 'hypertension', label: 'Hypertension' },
  { id: 'heart_disease', label: 'Heart Disease' },
  { id: 'asthma', label: 'Asthma' },
  { id: 'sleep_apnea', label: 'Sleep Apnea' },
  { id: 'hypothyroidism', label: 'Hypothyroidism' },
];

export default function AccountPage({
  onBack,
  backLabel = 'Back to Dashboard',
  profile,
  setProfile,
  onSaveProfile,
  profileSaved = false,
  logsCount = 0,
  snapshotsCount = 0,
}: AccountPageProps) {
  const { user, refreshUser } = useAuth();
  const { darkMode: dm, setDarkMode, palette, setPalette } = useTheme();
  const { confirm } = useConfirm();

  const [displayName, setDisplayName] = useState(user?.name ?? '');
  const [nameSaved, setNameSaved] = useState(false);

  const cardCls = `rounded-2xl border p-5 ${
    dm
      ? 'bg-gray-900 border-gray-800 shadow-sm'
      : 'bg-white border-gray-200 shadow-[0_2px_10px_rgba(15,23,42,0.06)]'
  }`;
  const inputCls = `w-full px-4 py-2.5 rounded-xl border text-sm transition-all accent-focus ${
    dm
      ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-500'
      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
  }`;
  const labelCls = `block text-sm font-medium mb-1.5 ${dm ? 'text-gray-200' : 'text-gray-800'}`;
  const mutedCls = `text-sm ${dm ? 'text-gray-400' : 'text-gray-600'}`;

  const handleSaveName = async () => {
    if (!user || !displayName.trim() || displayName.trim() === user.name) return;
    const ok = await confirm({
      title: 'Update Display Name',
      message: `Change your account display name to "${displayName.trim()}"?`,
      confirmText: 'Update Name',
      cancelText: 'Cancel',
      variant: 'primary',
      iconType: 'check',
    });
    if (!ok) return;

    auth.updateUser(user.id, { name: displayName.trim() });
    refreshUser();
    setNameSaved(true);
    setTimeout(() => setNameSaved(false), 2500);
  };

  const setProfileField = (k: keyof UserProfile, v: string | number | string[]) => {
    if (!setProfile) return;
    setProfile((p) => (p ? ({ ...p, [k]: v } as UserProfile) : p));
  };

  const toggleCond = (id: string) => {
    if (!profile) return;
    const curr = profile.medicalConditions || [];
    setProfileField(
      'medicalConditions',
      curr.includes(id) ? curr.filter((c) => c !== id) : [...curr, id]
    );
  };

  const isPatient = user?.role !== 'doctor' && Boolean(profile && setProfile && onSaveProfile);

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Top Bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button
          type="button"
          onClick={onBack}
          className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border text-sm font-medium transition-colors ${
            dm
              ? 'bg-gray-900 border-gray-700 text-gray-200 hover:bg-gray-800'
              : 'bg-white border-gray-300 text-gray-800 hover:bg-slate-50 shadow-xs'
          }`}
        >
          <ArrowLeft className="w-4 h-4" />
          {backLabel}
        </button>
        <span className={`text-xs font-medium ${mutedCls}`}>
          Account, Appearance &amp; Profile Settings
        </span>
      </div>

      {/* 1. Account Settings */}
      <div className={cardCls}>
        <div className="flex items-center gap-2.5 mb-4">
          <div className="p-2 rounded-xl accent-soft">
            <UserIcon className="w-4 h-4" />
          </div>
          <div>
            <h2 className={`text-base font-bold ${dm ? 'text-white' : 'text-gray-900'}`}>
              Account Settings
            </h2>
            <p className={`text-xs ${mutedCls}`}>
              Manage your personal account details and display name.
            </p>
          </div>
        </div>

        <div className={`flex items-center gap-4 p-4 rounded-xl border mb-4 ${
          dm ? 'bg-gray-800/60 border-gray-700' : 'bg-slate-50 border-gray-200'
        }`}>
          <div className="w-12 h-12 rounded-2xl accent-gradient flex items-center justify-center text-white text-lg font-bold flex-shrink-0">
            {user?.name?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className={`font-bold truncate ${dm ? 'text-white' : 'text-gray-900'}`}>{user?.name}</p>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full accent-soft capitalize">
                {user?.role || 'patient'}
              </span>
            </div>
            <p className={`text-xs truncate ${mutedCls}`}>{user?.email}</p>
            <p className={`text-xs mt-0.5 ${mutedCls}`}>
              Member since {user?.createdAt ? format(parseISO(user.createdAt), 'MMMM d, yyyy') : '—'}
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-end">
          <div className="flex-1">
            <label className={labelCls}>Full Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={inputCls}
              placeholder="Your full name"
            />
          </div>
          <button
            type="button"
            onClick={handleSaveName}
            disabled={!displayName.trim() || displayName.trim() === user?.name}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold accent-bg transition-colors disabled:opacity-45 whitespace-nowrap flex items-center justify-center gap-1.5"
          >
            <CheckCircle className="w-4 h-4" />
            {nameSaved ? 'Name Updated!' : 'Update Name'}
          </button>
        </div>

        {user?.role !== 'doctor' && (
          <div className={`mt-4 pt-4 border-t flex items-center gap-3 ${dm ? 'border-gray-800' : 'border-gray-200'}`}>
            <Shield className="w-4 h-4 accent-text flex-shrink-0" />
            <p className={`text-xs ${mutedCls}`}>
              Private Account Storage active — {logsCount} daily logs · {snapshotsCount} daily health summaries saved to your account.
            </p>
          </div>
        )}
      </div>

      {/* 2. Appearance & Color Palette */}
      <div className={cardCls}>
        <div className="flex items-center gap-2.5 mb-4">
          <div className="p-2 rounded-xl accent-soft">
            <Palette className="w-4 h-4" />
          </div>
          <div>
            <h2 className={`text-base font-bold ${dm ? 'text-white' : 'text-gray-900'}`}>
              Appearance &amp; Color Palette
            </h2>
            <p className={`text-xs ${mutedCls}`}>
              Choose light or dark theme and an accessible color palette. Health risk indicators stay green, amber, and red for clarity.
            </p>
          </div>
        </div>

        {/* Theme Mode */}
        <div className="mb-5">
          <label className={labelCls}>Display Theme</label>
          <div className="grid grid-cols-2 gap-3">
            {[
              { id: false, title: 'Light Mode', desc: 'Crisp bright surface', icon: Sun },
              { id: true, title: 'Dark Mode', desc: 'Easy on eyes at night', icon: Moon },
            ].map(({ id, title, desc, icon: Icon }) => {
              const active = dm === id;
              return (
                <button
                  key={title}
                  type="button"
                  onClick={() => setDarkMode(id)}
                  className={`flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all ${
                    active
                      ? 'accent-border accent-soft'
                      : dm
                        ? 'bg-gray-800/70 border-gray-700 text-gray-200 hover:border-gray-600'
                        : 'bg-slate-50 border-gray-200 text-gray-800 hover:border-gray-300'
                  }`}
                >
                  <div className={`p-2 rounded-lg ${active ? 'accent-bg' : dm ? 'bg-gray-700 text-gray-200' : 'bg-white border border-gray-200 text-gray-700'}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{title}</p>
                    <p className={`text-xs ${active ? 'opacity-90' : mutedCls}`}>{desc}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Accessible Color Palettes */}
        <div>
          <label className={labelCls}>Accent Color Palette</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {COLOR_PALETTES.map((p) => {
              const active = palette === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPalette(p.id)}
                  className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                    active
                      ? dm
                        ? 'bg-gray-800 border-white/60 ring-1 ring-white/40'
                        : 'bg-white border-gray-900 ring-1 ring-gray-900 shadow-sm'
                      : dm
                        ? 'bg-gray-800/50 border-gray-700 hover:border-gray-600'
                        : 'bg-slate-50 border-gray-200 hover:bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="flex flex-col gap-1 flex-shrink-0 mt-0.5">
                    <span
                      className="w-7 h-7 rounded-lg shadow-xs border border-black/10 flex items-center justify-center"
                      style={{ background: `linear-gradient(135deg, ${p.primaryHex}, ${p.secondaryHex})` }}
                    >
                      {active && <CheckCircle className="w-4 h-4 text-white" />}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold ${dm ? 'text-white' : 'text-gray-900'}`}>
                      {p.name}
                    </p>
                    <p className={`text-xs leading-snug mt-0.5 ${mutedCls}`}>
                      {p.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 3. Health Profile (Patients only) */}
      {isPatient && profile && (
        <div className={cardCls}>
          <div className="flex items-center gap-2.5 mb-4">
            <div className="p-2 rounded-xl accent-soft">
              <Heart className="w-4 h-4" />
            </div>
            <div>
              <h2 className={`text-base font-bold ${dm ? 'text-white' : 'text-gray-900'}`}>
                Health Profile
              </h2>
              <p className={`text-xs ${mutedCls}`}>
                Used to calculate your BMI, daily calorie target, and health risk baseline.
              </p>
            </div>
          </div>

          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Age</label>
                <input
                  type="number"
                  value={profile.age || ''}
                  min={1}
                  max={120}
                  onChange={(e) => setProfileField('age', parseInt(e.target.value, 10) || 0)}
                  className={inputCls}
                  placeholder="e.g. 28"
                />
              </div>
              <div>
                <label className={labelCls}>Biological Sex</label>
                <select
                  value={profile.gender}
                  onChange={(e) => setProfileField('gender', e.target.value)}
                  className={inputCls}
                >
                  <option value="">Select</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other / Prefer not to say</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Height (cm)</label>
                <input
                  type="number"
                  value={profile.height || ''}
                  min={50}
                  max={300}
                  onChange={(e) => setProfileField('height', parseInt(e.target.value, 10) || 0)}
                  className={inputCls}
                  placeholder="e.g. 170"
                />
              </div>
              <div>
                <label className={labelCls}>Weight (kg)</label>
                <input
                  type="number"
                  value={profile.weight || ''}
                  min={20}
                  max={500}
                  onChange={(e) => setProfileField('weight', parseFloat(e.target.value) || 0)}
                  className={inputCls}
                  placeholder="e.g. 70"
                />
              </div>
            </div>

            {profile.height > 0 && profile.weight > 0 && (
              <div className={`p-3 rounded-xl border ${dm ? 'bg-gray-800 border-gray-700' : 'bg-slate-50 border-gray-200'}`}>
                <p className={`text-sm ${dm ? 'text-gray-200' : 'text-gray-800'}`}>
                  BMI:{' '}
                  <span className="font-bold accent-text">
                    {(profile.weight / Math.pow(profile.height / 100, 2)).toFixed(1)}
                  </span>
                  <span className={`ml-2 text-xs ${mutedCls}`}>(Normal: 18.5–24.9)</span>
                </p>
              </div>
            )}

            <div>
              <label className={labelCls}>Activity Level</label>
              <select
                value={profile.activityLevel}
                onChange={(e) => setProfileField('activityLevel', e.target.value)}
                className={inputCls}
              >
                <option value="sedentary">Sedentary (little/no exercise)</option>
                <option value="light">Lightly Active (1–3 days/week)</option>
                <option value="moderate">Moderately Active (3–5 days/week)</option>
                <option value="active">Very Active (6–7 days/week)</option>
                <option value="very_active">Extremely Active (physical job / 2×/day)</option>
              </select>
            </div>

            <div>
              <label className={labelCls}>Weight Goal</label>
              <div className="flex flex-wrap gap-2">
                {([
                  { id: 'lose', label: '🔻 Lose weight' },
                  { id: 'maintain', label: '➖ Maintain weight' },
                  { id: 'gain', label: '🔺 Gain weight / muscle' },
                ] as { id: 'lose' | 'maintain' | 'gain'; label: string }[]).map((o) => {
                  const active = (profile.goal || 'maintain') === o.id;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setProfileField('goal', o.id)}
                      className={`px-3.5 py-2 rounded-xl text-sm font-medium border transition-all ${
                        active
                          ? 'accent-bg accent-border'
                          : dm
                            ? 'bg-gray-800 border-gray-700 text-gray-200 hover:border-gray-500'
                            : 'bg-white border-gray-300 text-gray-700 hover:border-gray-400'
                      }`}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
              <p className={`text-xs mt-1.5 ${mutedCls}`}>
                Combined with your activity level to set your daily calorie and nutrition targets.
              </p>
            </div>

            <h4 className={`font-semibold text-sm pt-1 ${dm ? 'text-gray-200' : 'text-gray-800'}`}>
              Lifestyle Habits
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Smoking</label>
                <select
                  value={profile.smoking}
                  onChange={(e) => setProfileField('smoking', e.target.value)}
                  className={inputCls}
                >
                  <option value="never">Never smoked</option>
                  <option value="former">Former smoker</option>
                  <option value="current">Currently smoke</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Alcohol</label>
                <select
                  value={profile.alcohol}
                  onChange={(e) => setProfileField('alcohol', e.target.value)}
                  className={inputCls}
                >
                  <option value="never">Never</option>
                  <option value="rarely">Rarely</option>
                  <option value="moderately">Moderately</option>
                  <option value="frequently">Frequently</option>
                </select>
              </div>
            </div>

            <h4 className={`font-semibold text-sm pt-1 ${dm ? 'text-gray-200' : 'text-gray-800'}`}>
              Dietary Preferences
            </h4>
            <div>
              <label className={labelCls}>Diet Type</label>
              <select
                value={['balanced', 'vegan', 'unspecified'].includes(profile.dietType) ? profile.dietType : 'unspecified'}
                onChange={(e) => setProfileField('dietType', e.target.value)}
                className={inputCls}
              >
                {['balanced', 'vegan', 'unspecified'].map((o) => (
                  <option key={o} value={o}>
                    {o.charAt(0).toUpperCase() + o.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {([
                { label: 'Vegetables', field: 'vegetableIntake' as keyof UserProfile },
                { label: 'Fruits', field: 'fruitIntake' as keyof UserProfile },
                { label: 'Processed Food', field: 'processedFood' as keyof UserProfile },
              ]).map(({ label, field }) => (
                <div key={String(field)}>
                  <label className={labelCls}>{label}</label>
                  <select
                    value={String(profile[field])}
                    onChange={(e) => setProfileField(field, e.target.value)}
                    className={inputCls}
                  >
                    {['daily', 'often', 'sometimes', 'rarely'].map((o) => (
                      <option key={o} value={o}>
                        {o.charAt(0).toUpperCase() + o.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <h4 className={`font-semibold text-sm pt-1 ${dm ? 'text-gray-200' : 'text-gray-800'}`}>
              Medical Conditions
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {CONDITIONS.map((c) => {
                const active = (profile.medicalConditions || []).includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleCond(c.id)}
                    className={`px-3 py-2.5 rounded-xl text-sm font-medium border text-left transition-all ${
                      active
                        ? 'accent-bg accent-border'
                        : dm
                          ? 'bg-gray-800 border-gray-700 text-gray-200 hover:border-gray-500'
                          : 'bg-white border-gray-300 text-gray-700 hover:border-gray-400'
                    }`}
                  >
                    {active && <CheckCircle className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />}
                    {c.label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={onSaveProfile}
              className="w-full py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all accent-gradient shadow-md"
            >
              <CheckCircle className="w-5 h-5" />
              {profileSaved ? 'Profile Saved!' : 'Save Profile'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

