import { useState } from 'react';
import {
  Heart, ChevronRight, ChevronLeft, CheckCircle,
  User, Ruler, Scale, Activity, Utensils, Cigarette,
  Wine, AlertCircle, Sparkles,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { profiles, UserProfile } from '../db/database';

interface Props {
  darkMode: boolean;
}

const STEPS = [
  { id: 'basics',     label: 'Basic Info',   icon: User },
  { id: 'body',       label: 'Body Metrics', icon: Scale },
  { id: 'activity',   label: 'Activity',     icon: Activity },
  { id: 'diet',       label: 'Diet',         icon: Utensils },
  { id: 'habits',     label: 'Habits',       icon: Cigarette },
  { id: 'medical',    label: 'Medical',      icon: AlertCircle },
];

const CONDITIONS = [
  { id: 'diabetes',       label: 'Diabetes' },
  { id: 'hypertension',   label: 'Hypertension' },
  { id: 'heart_disease',  label: 'Heart Disease' },
  { id: 'asthma',         label: 'Asthma' },
  { id: 'sleep_apnea',    label: 'Sleep Apnea' },
  { id: 'hypothyroidism', label: 'Hypothyroidism' },
  { id: 'obesity',        label: 'Obesity' },
  { id: 'none',           label: 'None of the above' },
];

export default function OnboardingPage({ darkMode }: Props) {
  const { user, completeProfile } = useAuth();
  const dm = darkMode;

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  // Form state
  const [age,       setAge]       = useState('');
  const [gender,    setGender]    = useState('');
  const [weight,    setWeight]    = useState('');
  const [height,    setHeight]    = useState('');
  const [goal,      setGoal]      = useState<'lose' | 'maintain' | 'gain'>('maintain');
  const [activityLevel, setActivityLevel] = useState('moderate');
  const [dietType,  setDietType]  = useState('balanced');
  const [vegIntake, setVegIntake] = useState('daily');
  const [fruitIntake, setFruitIntake] = useState('daily');
  const [processedFood, setProcessedFood] = useState('sometimes');
  const [smoking,   setSmoking]   = useState('never');
  const [alcohol,   setAlcohol]   = useState('rarely');
  const [conditions, setConditions] = useState<string[]>([]);

  const totalSteps = STEPS.length;
  const pct = ((step + 1) / totalSteps) * 100;

  const bmi = weight && height
    ? (parseFloat(weight) / Math.pow(parseFloat(height) / 100, 2)).toFixed(1)
    : null;

  const bmiCategory = bmi
    ? parseFloat(bmi) < 18.5 ? { label: 'Underweight', color: 'text-blue-500' }
    : parseFloat(bmi) < 25   ? { label: 'Normal',      color: 'text-green-500' }
    : parseFloat(bmi) < 30   ? { label: 'Overweight',  color: 'text-yellow-500' }
    :                          { label: 'Obese',        color: 'text-red-500' }
    : null;

  function toggleCondition(id: string) {
    if (id === 'none') {
      setConditions(['none']);
      return;
    }
    setConditions(prev => {
      const without = prev.filter(c => c !== 'none');
      return without.includes(id) ? without.filter(c => c !== id) : [...without, id];
    });
  }

  function validate(): string[] {
    const errs: string[] = [];
    if (step === 0) {
      if (!age || parseInt(age) < 1 || parseInt(age) > 120) errs.push('Please enter a valid age (1–120).');
      if (!gender) errs.push('Please select your biological sex.');
    }
    if (step === 1) {
      if (!weight || parseFloat(weight) < 20 || parseFloat(weight) > 500) errs.push('Please enter a valid weight (20–500 kg).');
      if (!height || parseFloat(height) < 50 || parseFloat(height) > 300) errs.push('Please enter a valid height (50–300 cm).');
    }
    return errs;
  }

  function next() {
    const errs = validate();
    if (errs.length) { setErrors(errs); return; }
    setErrors([]);
    setStep(s => Math.min(s + 1, totalSteps - 1));
  }

  function back() {
    setErrors([]);
    setStep(s => Math.max(s - 1, 0));
  }

  async function finish() {
    if (!user) return;
    setSaving(true);

    const profile: Omit<UserProfile, 'updatedAt'> = {
      userId: user.id,
      age: parseInt(age),
      gender,
      weight: parseFloat(weight),
      height: parseFloat(height),
      activityLevel,
      goal,
      dietType,
      vegetableIntake: vegIntake,
      fruitIntake,
      processedFood,
      smoking,
      alcohol,
      medicalConditions: conditions.filter(c => c !== 'none'),
    };

    profiles.save(profile);
    await new Promise(r => setTimeout(r, 800)); // brief visual delay
    completeProfile();
    setSaving(false);
  }

  const inputCls = `w-full px-4 py-3 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 focus:ring-green-500 ${
    dm
      ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-500'
      : 'bg-white border-gray-200 text-gray-800 placeholder-gray-400'
  }`;

  const labelCls = `block text-sm font-medium mb-2 ${dm ? 'text-gray-300' : 'text-gray-700'}`;
  const mutedCls = `text-sm ${dm ? 'text-gray-400' : 'text-gray-500'}`;

  // ── Option pill ───────────────────────────────────────────────────────────
  function Pill({
    value, current, onChange, children,
  }: { value: string; current: string; onChange: (v: string) => void; children: React.ReactNode }) {
    const active = value === current;
    return (
      <button
        type="button"
        onClick={() => onChange(value)}
        className={`px-4 py-2.5 rounded-xl text-sm font-medium border transition-all ${
          active
            ? 'bg-green-500 text-white border-green-500 shadow-sm'
            : dm
            ? 'bg-gray-800 text-gray-300 border-gray-700 hover:border-green-500'
            : 'bg-white text-gray-600 border-gray-200 hover:border-green-400'
        }`}
      >
        {children}
      </button>
    );
  }

  // ── Step content ──────────────────────────────────────────────────────────
  const renderStep = () => {
    switch (step) {
      // Step 0 — Basic Info
      case 0:
        return (
          <div className="space-y-6">
            <div>
              <label className={labelCls}>How old are you?</label>
              <input
                type="number" placeholder="e.g. 28" value={age} min={1} max={120}
                onChange={e => setAge(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Biological Sex</label>
              <div className="flex gap-3 flex-wrap">
                {['male', 'female', 'other'].map(g => (
                  <Pill key={g} value={g} current={gender} onChange={setGender}>
                    {g === 'male' ? '♂ Male' : g === 'female' ? '♀ Female' : '⊕ Other / Prefer not to say'}
                  </Pill>
                ))}
              </div>
              <p className={`text-xs mt-2 ${mutedCls}`}>
                Used only for BMR/calorie target calculations. Never shared.
              </p>
            </div>
          </div>
        );

      // Step 1 — Body Metrics
      case 1:
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>
                  <Ruler className="w-4 h-4 inline mr-1" />Height (cm)
                </label>
                <input
                  type="number" placeholder="e.g. 170" value={height} min={50} max={300}
                  onChange={e => setHeight(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>
                  <Scale className="w-4 h-4 inline mr-1" />Weight (kg)
                </label>
                <input
                  type="number" placeholder="e.g. 70" value={weight} min={20} max={500}
                  onChange={e => setWeight(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>
            {bmi && bmiCategory && (
              <div className={`p-4 rounded-xl flex items-center justify-between ${dm ? 'bg-gray-800' : 'bg-green-50 border border-green-100'}`}>
                <div>
                  <p className={`text-xs ${mutedCls}`}>Your BMI</p>
                  <p className={`text-3xl font-bold ${dm ? 'text-white' : 'text-gray-800'}`}>{bmi}</p>
                </div>
                <div className="text-right">
                  <p className={`text-xs ${mutedCls}`}>Category</p>
                  <p className={`text-base font-bold ${bmiCategory.color}`}>{bmiCategory.label}</p>
                </div>
                <div className="text-right">
                  <p className={`text-xs ${mutedCls}`}>Normal range</p>
                  <p className={`text-sm font-medium ${dm ? 'text-gray-300' : 'text-gray-600'}`}>18.5 – 24.9</p>
                </div>
              </div>
            )}
            <div>
              <label className={labelCls}>Weight Goal</label>
              <div className="flex flex-wrap gap-2">
                {([
                  { id: 'lose',     label: '🔻 Lose weight' },
                  { id: 'maintain', label: '➖ Maintain weight' },
                  { id: 'gain',     label: '🔺 Gain weight / muscle' },
                ] as { id: 'lose' | 'maintain' | 'gain'; label: string }[]).map(o => (
                  <Pill key={o.id} value={o.id} current={goal} onChange={(v) => setGoal(v as typeof goal)}>
                    {o.label}
                  </Pill>
                ))}
              </div>
              <p className={`text-xs mt-2 ${mutedCls}`}>
                Used to set your daily calorie and protein/carb/fat targets.
              </p>
            </div>
          </div>
        );

      // Step 2 — Activity Level
      case 2:
        return (
          <div className="space-y-4">
            <p className={mutedCls}>Choose the level that best describes your typical week:</p>
            {[
              { id: 'sedentary',   label: 'Sedentary',    desc: 'Little to no exercise, desk job' },
              { id: 'light',       label: 'Lightly Active', desc: 'Light exercise 1–3 days/week' },
              { id: 'moderate',    label: 'Moderately Active', desc: 'Moderate exercise 3–5 days/week' },
              { id: 'active',      label: 'Very Active',  desc: 'Hard exercise 6–7 days/week' },
              { id: 'very_active', label: 'Extremely Active', desc: 'Physical job or 2× daily training' },
            ].map(opt => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setActivityLevel(opt.id)}
                className={`w-full text-left px-4 py-3.5 rounded-xl border transition-all ${
                  activityLevel === opt.id
                    ? 'bg-green-500 text-white border-green-500'
                    : dm
                    ? 'bg-gray-800 border-gray-700 text-gray-200 hover:border-green-500'
                    : 'bg-white border-gray-200 text-gray-700 hover:border-green-400'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm">{opt.label}</span>
                  {activityLevel === opt.id && <CheckCircle className="w-4 h-4" />}
                </div>
                <p className={`text-xs mt-0.5 ${activityLevel === opt.id ? 'text-green-100' : mutedCls}`}>{opt.desc}</p>
              </button>
            ))}
          </div>
        );

      // Step 3 — Diet
      case 3:
        return (
          <div className="space-y-6">
            <div>
              <label className={labelCls}>Diet Type</label>
              <div className="flex flex-wrap gap-2">
                {['balanced','vegetarian','vegan','keto','paleo','mediterranean','unhealthy'].map(d => (
                  <Pill key={d} value={d} current={dietType} onChange={setDietType}>
                    {d.charAt(0).toUpperCase() + d.slice(1)}
                  </Pill>
                ))}
              </div>
            </div>
            <div>
              <label className={labelCls}>Vegetable Intake</label>
              <div className="flex flex-wrap gap-2">
                {['daily','often','sometimes','rarely'].map(o => (
                  <Pill key={o} value={o} current={vegIntake} onChange={setVegIntake}>
                    {o.charAt(0).toUpperCase() + o.slice(1)}
                  </Pill>
                ))}
              </div>
            </div>
            <div>
              <label className={labelCls}>Fruit Intake</label>
              <div className="flex flex-wrap gap-2">
                {['daily','often','sometimes','rarely'].map(o => (
                  <Pill key={o} value={o} current={fruitIntake} onChange={setFruitIntake}>
                    {o.charAt(0).toUpperCase() + o.slice(1)}
                  </Pill>
                ))}
              </div>
            </div>
            <div>
              <label className={labelCls}>Processed / Fast Food Consumption</label>
              <div className="flex flex-wrap gap-2">
                {['rarely','sometimes','frequently'].map(o => (
                  <Pill key={o} value={o} current={processedFood} onChange={setProcessedFood}>
                    {o.charAt(0).toUpperCase() + o.slice(1)}
                  </Pill>
                ))}
              </div>
            </div>
          </div>
        );

      // Step 4 — Habits
      case 4:
        return (
          <div className="space-y-6">
            <div>
              <label className={labelCls}>
                <Cigarette className="w-4 h-4 inline mr-1" />Smoking
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'never',   label: '🚭 Never smoked' },
                  { id: 'former',  label: '✅ Former smoker' },
                  { id: 'current', label: '🚬 Currently smoke' },
                ].map(o => (
                  <Pill key={o.id} value={o.id} current={smoking} onChange={setSmoking}>{o.label}</Pill>
                ))}
              </div>
            </div>
            <div>
              <label className={labelCls}>
                <Wine className="w-4 h-4 inline mr-1" />Alcohol Consumption
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'never',       label: '🚫 Never' },
                  { id: 'rarely',      label: '🍷 Rarely' },
                  { id: 'moderately',  label: '🥂 Moderately' },
                  { id: 'frequently',  label: '🍺 Frequently' },
                ].map(o => (
                  <Pill key={o.id} value={o.id} current={alcohol} onChange={setAlcohol}>{o.label}</Pill>
                ))}
              </div>
            </div>
          </div>
        );

      // Step 5 — Medical
      case 5:
        return (
          <div className="space-y-4">
            <p className={mutedCls}>
              Select any pre-existing conditions (select all that apply). This helps MedAlert calibrate risk predictions accurately.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {CONDITIONS.map(c => {
                const isSelected = conditions.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleCondition(c.id)}
                    className={`px-3 py-2.5 rounded-xl text-sm font-medium border text-left transition-all ${
                      isSelected
                        ? 'bg-green-500 text-white border-green-500'
                        : dm
                        ? 'bg-gray-800 border-gray-700 text-gray-300 hover:border-green-500'
                        : 'bg-white border-gray-200 text-gray-600 hover:border-green-400'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {isSelected && <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />}
                      {c.label}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className={`text-xs mt-2 ${mutedCls}`}>
              This information is stored locally on your device and is never transmitted.
            </p>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className={`min-h-screen flex items-center justify-center px-4 py-10 ${dm ? 'bg-gray-950' : 'bg-gradient-to-br from-green-50 via-white to-emerald-50'}`}>
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2.5 mb-4">
            <div className="p-2.5 bg-green-100 rounded-2xl">
              <Heart className="w-7 h-7 text-green-600" />
            </div>
            <div className="text-left">
              <span className="text-2xl font-bold text-green-600">Med</span>
              <span className="text-2xl font-bold text-gray-400">Alert</span>
            </div>
          </div>
          <h1 className={`text-2xl font-bold ${dm ? 'text-white' : 'text-gray-900'}`}>
            Welcome, {user?.name?.split(' ')[0]}! 👋
          </h1>
          <p className={`mt-1 text-sm ${dm ? 'text-gray-400' : 'text-gray-500'}`}>
            Let's set up your Health Profile first. This takes about 2 minutes.
          </p>
        </div>

        {/* Card */}
        <div className={`rounded-3xl shadow-xl border p-8 ${dm ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'}`}>
          {/* Step indicator */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {(() => {
                  const Icon = STEPS[step].icon;
                  return <Icon className="w-4 h-4 text-green-500" />;
                })()}
                <span className={`text-sm font-semibold ${dm ? 'text-white' : 'text-gray-800'}`}>
                  {STEPS[step].label}
                </span>
              </div>
              <span className={`text-xs font-medium ${dm ? 'text-gray-400' : 'text-gray-500'}`}>
                Step {step + 1} of {totalSteps}
              </span>
            </div>
            <div className={`h-2 w-full rounded-full ${dm ? 'bg-gray-800' : 'bg-gray-100'}`}>
              <div
                className="h-full bg-gradient-to-r from-green-500 to-emerald-400 rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            {/* Step dots */}
            <div className="flex gap-1 mt-2 justify-center">
              {STEPS.map((s, i) => (
                <div
                  key={s.id}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === step
                      ? 'w-6 bg-green-500'
                      : i < step
                      ? 'w-3 bg-green-300'
                      : `w-3 ${dm ? 'bg-gray-700' : 'bg-gray-200'}`
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Errors */}
          {errors.length > 0 && (
            <div className={`mb-4 p-3 rounded-xl border text-sm ${dm ? 'bg-red-900/20 border-red-800 text-red-300' : 'bg-red-50 border-red-200 text-red-600'}`}>
              {errors.map((e, i) => <p key={i}>• {e}</p>)}
            </div>
          )}

          {/* Step content */}
          <div className="min-h-[260px]">
            {renderStep()}
          </div>

          {/* Navigation */}
          <div className="flex gap-3 mt-8">
            {step > 0 && (
              <button
                onClick={back}
                className={`flex items-center gap-2 px-5 py-3 rounded-xl font-medium text-sm border transition-all ${
                  dm
                    ? 'border-gray-700 text-gray-300 hover:bg-gray-800'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
            )}
            <button
              onClick={step === totalSteps - 1 ? finish : next}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-semibold text-sm hover:from-green-600 hover:to-emerald-700 transition-all disabled:opacity-60 shadow-lg shadow-green-200/40"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving your profile...
                </>
              ) : step === totalSteps - 1 ? (
                <>
                  <Sparkles className="w-4 h-4" /> Complete & Go to Dashboard
                </>
              ) : (
                <>
                  Continue <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>

        <p className={`text-center text-xs mt-4 ${dm ? 'text-gray-600' : 'text-gray-400'}`}>
          You can update any of this information at any time from your Profile page.
        </p>
      </div>
    </div>
  );
}
