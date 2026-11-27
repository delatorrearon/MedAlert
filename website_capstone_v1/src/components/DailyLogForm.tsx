import { Dispatch, SetStateAction, useState } from 'react';
import {
  Clock, Dumbbell, Droplets, Coffee, Scale, Flame, Beef, Wheat, Apple,
  CheckCircle, AlertCircle, AlertTriangle, Calendar, ChevronLeft, ChevronRight, Search, Plus, Trash2, Minus,
} from 'lucide-react';
import { format, parseISO, subDays } from 'date-fns';
import { DailyLog, MealEntry, UserProfile } from '../db/database';
import { estimateMacrosFromCalories } from '../utils/mlEngine';
import {
  FoodItem,
  amountToQty,
  classifyMealQuality,
  foodQualityLabel,
  formatServingBreakdown,
  getDefaultFoodUnit,
  getFoodUnits,
  macroTargetsForProfile,
  mealTotals,
  parseAmountInput,
  qtyToAmount,
  searchFoods,
} from '../utils/foodEngine';
import { useConfirm } from '../context/ConfirmContext';
import MacroCompare from './MacroCompare';

export interface DailyLogFormProps {
  form: Partial<DailyLog>;
  setForm: Dispatch<SetStateAction<Partial<DailyLog>>>;
  logDate: string;
  setLogDate: (date: string) => void;
  logs: DailyLog[];
  profile: UserProfile | null;
  existingForDate: DailyLog | undefined;
  logSaved: boolean;
  onSave: () => void;
  dm: boolean;
  labelCls: string;
  mutedCls: string;
  inputCls: string;
}

const getTodayStr = () => format(new Date(), 'yyyy-MM-dd');

function defaultCalories(profile: UserProfile | null): number {
  const map: Record<string, number> = {
    sedentary: 1800,
    light: 2000,
    moderate: 2200,
    active: 2500,
    very_active: 2800,
  };
  return map[profile?.activityLevel ?? 'moderate'] ?? 2000;
}

export function getDefaultLogForm(profile: UserProfile | null): Partial<DailyLog> {
  const calories = defaultCalories(profile);
  const macros = estimateMacrosFromCalories(calories);
  return {
    sleepHours: 7,
    exerciseMinutes: 30,
    waterIntake: 8,
    caffeineIntake: 2,
    calories,
    protein: macros.protein,
    carbs: macros.carbs,
    fats: macros.fats,
    foodQuality: 'balanced',
    trackMacros: false,
    weight: profile?.weight,
  };
}

export function getMissedLogDates(logs: DailyLog[], maxDays = 14): string[] {
  const logged = new Set(logs.map((l) => l.date));
  const missed: string[] = [];
  for (let i = 1; i <= maxDays; i++) {
    const d = format(subDays(new Date(), i), 'yyyy-MM-dd');
    if (!logged.has(d)) missed.push(d);
  }
  return missed.slice(0, 8);
}

function ChipRow({
  label,
  icon: Icon,
  chips,
  value,
  onSelect,
  unit,
  dm,
  labelCls,
}: {
  label: string;
  icon: typeof Clock;
  chips: { label: string; value: number | string }[];
  value: number | string | undefined;
  onSelect: (v: number | string) => void;
  unit?: string;
  dm: boolean;
  labelCls: string;
}) {
  return (
    <div>
      <label className={labelCls}>
        <Icon className="w-4 h-4 inline mr-1.5 -mt-0.5" />
        {label}
        {unit && <span className={`ml-1 text-xs font-normal ${dm ? 'text-gray-400' : 'text-gray-600'}`}>({unit})</span>}
      </label>
      <div className="flex flex-wrap gap-2 mt-2">
        {chips.map((c) => {
          const active = value === c.value;
          return (
            <button
              key={String(c.value)}
              type="button"
              onClick={() => onSelect(c.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                active
                  ? 'accent-bg accent-border shadow-xs'
                  : dm
                    ? 'bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-700'
                    : 'bg-slate-50 border-gray-200 text-gray-800 hover:bg-white hover:border-gray-300'
              }`}
            >
              {c.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NumberInput({
  label,
  icon: Icon,
  min,
  max,
  step = 1,
  unit,
  placeholder,
  value,
  onChange,
  fallback,
  dm: _dm,
  labelCls,
  mutedCls,
  inputCls,
}: {
  label: string;
  icon: typeof Clock;
  min: number;
  max: number;
  step?: number;
  unit: string;
  placeholder?: string;
  value: number | undefined;
  onChange: (val: number | undefined) => void;
  fallback?: number;
  dm: boolean;
  labelCls: string;
  mutedCls: string;
  inputCls: string;
}) {
  return (
    <div>
      <label className={labelCls}>
        <Icon className="w-4 h-4 inline mr-1.5 -mt-0.5" />
        {label}
        <span className={`ml-1 text-xs font-normal ${mutedCls}`}>({unit})</span>
      </label>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value === undefined ? '' : String(value)}
        placeholder={placeholder}
        onChange={(e) => {
          const raw = e.target.value.trim();
          if (raw === '') return onChange(undefined);
          const n = parseFloat(raw);
          onChange(Number.isFinite(n) ? n : undefined);
        }}
        onBlur={() => {
          if (value === undefined && fallback !== undefined) onChange(fallback);
        }}
        className={`${inputCls} mt-1.5`}
      />
    </div>
  );
}

export default function DailyLogForm({
  form,
  setForm,
  logDate,
  setLogDate,
  logs,
  profile,
  existingForDate,
  logSaved,
  onSave,
  dm,
  labelCls,
  mutedCls,
  inputCls,
}: DailyLogFormProps) {
  const TODAY = getTodayStr();
  const set = (k: keyof DailyLog, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const missedDates = getMissedLogDates(logs);
  const trackMacros = form.trackMacros ?? false;
  const logWeight = form.trackWeight ?? (form.weight != null && form.weight > 0);

  // Most recent weight from an earlier log, else the profile weight
  const priorLogsWithWeight = logs.filter(l => l.date !== logDate && l.weight != null && l.weight > 0);
  const recentWeight = priorLogsWithWeight.length
    ? priorLogsWithWeight[priorLogsWithWeight.length - 1].weight!
    : (profile?.weight ?? 70);
  const meals = form.meals ?? [];

  // Food picker state
  const [foodQuery, setFoodQuery] = useState('');
  const [foodResults, setFoodResults] = useState<FoodItem[]>([]);
  const [amountDrafts, setAmountDrafts] = useState<Record<number, string>>({});

  const macroTargets = macroTargetsForProfile(profile);
  const hasLoggedFoods = meals.length > 0;
  const calculatedFromFoods = hasLoggedFoods ? mealTotals(meals) : null;
  const autoMealQuality = classifyMealQuality(meals, profile);
  const currentCalories = calculatedFromFoods ? calculatedFromFoods.calories : (form.calories ?? 0);
  const calorieOverage = currentCalories - macroTargets.calories;
  const isOverCalories = currentCalories > 0 && calorieOverage > 0;
  const isHighCalorieOverage = currentCalories > macroTargets.calories * 1.15;

  const applyMealTotals = (next: MealEntry[]) => {
    const derivedQuality = classifyMealQuality(next, profile);
    set('foodQuality', derivedQuality);
    if (next.length === 0) {
      const fallbackCals = defaultCalories(profile);
      const fallbackMacros = estimateMacrosFromCalories(fallbackCals);
      set('meals', []);
      set('calories', fallbackCals);
      set('protein', fallbackMacros.protein);
      set('carbs', fallbackMacros.carbs);
      set('fats', fallbackMacros.fats);
      set('trackMacros', false);
      setAmountDrafts({});
      return;
    }
    const t = mealTotals(next);
    set('meals', next);
    set('calories', t.calories);
    set('protein', t.protein);
    set('carbs', t.carbs);
    set('fats', t.fats);
    set('trackMacros', true);
  };

  const addMeal = (food: FoodItem) => {
    const defaultUnit = getDefaultFoodUnit(food);
    const defaultAmount = defaultUnit.id === 'g' || defaultUnit.id === 'ml'
      ? Math.round(1 / defaultUnit.qtyPerUnit)
      : 1;
    const qty = amountToQty(defaultAmount, defaultUnit);
    applyMealTotals([...meals, { ...food, qty, unit: defaultUnit.id }]);
    setFoodQuery('');
    setFoodResults([]);
  };

  const { confirm } = useConfirm();

  const removeMeal = (i: number) => {
    setAmountDrafts({});
    applyMealTotals(meals.filter((_, idx) => idx !== i));
  };

  const handleRemoveMeal = async (i: number) => {
    const meal = meals[i];
    const ok = await confirm({
      title: 'Remove Food Item',
      message: `Are you sure you want to remove "${meal?.name || 'this food item'}" from today's log?`,
      confirmText: 'Remove',
      cancelText: 'Keep',
      variant: 'danger',
      iconType: 'trash',
    });
    if (ok) {
      removeMeal(i);
    }
  };

  const updateMealAmount = (i: number, amount: number, unitId?: string) => {
    const meal = meals[i];
    if (!meal) return;
    const units = getFoodUnits(meal);
    const targetUnit = units.find((u) => u.id === (unitId ?? meal.unit)) ?? units[0];
    const clampedAmount = Math.max(targetUnit.min, amount);
    const nextQty = amountToQty(clampedAmount, targetUnit);
    setAmountDrafts((prev) => {
      const next = { ...prev };
      delete next[i];
      return next;
    });
    applyMealTotals(
      meals.map((m, idx) => (idx === i ? { ...m, qty: nextQty, unit: targetUnit.id } : m))
    );
  };

  const changeMealUnit = (i: number, newUnitId: string) => {
    const meal = meals[i];
    if (!meal) return;
    const units = getFoodUnits(meal);
    const newUnit = units.find((u) => u.id === newUnitId) ?? units[0];
    setAmountDrafts((prev) => {
      const next = { ...prev };
      delete next[i];
      return next;
    });
    applyMealTotals(
      meals.map((m, idx) => (idx === i ? { ...m, unit: newUnit.id } : m))
    );
  };

  const onSearch = (q: string) => {
    setFoodQuery(q);
    setFoodResults(q.trim() ? searchFoods(q) : []);
  };

  const shiftDate = (delta: number) => {
    const d = new Date(logDate + 'T12:00:00');
    d.setDate(d.getDate() + delta);
    const next = format(d, 'yyyy-MM-dd');
    if (next <= TODAY) setLogDate(next);
  };

  return (
    <>
      {/* Date picker */}
      <div className={`p-4 rounded-xl border mb-5 ${dm ? 'bg-gray-800 border-gray-700' : 'bg-slate-50 border-gray-200'}`}>
        <label className={labelCls}>
          <Calendar className="w-4 h-4 inline mr-1.5 -mt-0.5" />
          Log date
        </label>
        <div className="flex items-center gap-2 mt-2">
          <button
            type="button"
            onClick={() => shiftDate(-1)}
            className={`p-2 rounded-lg ${dm ? 'bg-gray-700 hover:bg-gray-600' : 'bg-white border border-gray-200 hover:bg-gray-100'}`}
            aria-label="Previous day"
          >
            <ChevronLeft className={`w-5 h-5 ${dm ? 'text-gray-100' : 'text-gray-600'}`} />
          </button>
          <input
            type="date"
            value={logDate}
            max={TODAY}
            onChange={(e) => e.target.value && setLogDate(e.target.value)}
            className={`flex-1 ${inputCls}`}
          />
          <button
            type="button"
            onClick={() => shiftDate(1)}
            disabled={logDate >= TODAY}
            className={`p-2 rounded-lg disabled:opacity-40 ${
              dm ? 'bg-gray-700 hover:bg-gray-600' : 'bg-white border border-gray-200 hover:bg-gray-100'
            }`}
            aria-label="Next day"
          >
            <ChevronRight className={`w-5 h-5 ${dm ? 'text-gray-100' : 'text-gray-600'}`} />
          </button>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          <button
            type="button"
            onClick={() => setLogDate(TODAY)}
            className={`text-xs px-2.5 py-1 rounded-full font-medium border ${
              logDate === TODAY ? 'accent-bg accent-border' : dm ? 'bg-gray-700 border-gray-600 text-gray-200' : 'bg-white border-gray-300 text-gray-700'
            }`}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setLogDate(format(subDays(new Date(), 1), 'yyyy-MM-dd'))}
            className={`text-xs px-2.5 py-1 rounded-full font-medium border ${
              dm ? 'bg-gray-700 border-gray-600 text-gray-200' : 'bg-white border-gray-300 text-gray-700'
            }`}
          >
            Yesterday
          </button>
        </div>
        {missedDates.length > 0 && (
          <div className="mt-3">
            <p className={`text-xs mb-1.5 ${mutedCls}`}>Catch up on missed days:</p>
            <div className="flex flex-wrap gap-1.5">
              {missedDates.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setLogDate(d)}
                  className={`text-xs px-2 py-1 rounded-lg ${
                    logDate === d
                      ? 'bg-amber-500 text-white'
                      : dm
                        ? 'bg-amber-900/30 text-amber-300 hover:bg-amber-900/50'
                        : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
                  }`}
                >
                  {format(parseISO(d), 'MMM d')}
                </button>
              ))}
            </div>
          </div>
        )}
        <p className={`text-sm mt-2 font-medium ${dm ? 'text-white' : 'text-gray-800'}`}>
          {format(parseISO(logDate), 'EEEE, MMMM d, yyyy')}
          {existingForDate && (
            <span className="ml-2 text-xs font-semibold px-2 py-0.5 bg-green-100 text-green-700 rounded-full">
              editing saved log
            </span>
          )}
        </p>
      </div>

      {logs.length === 0 && (
        <div
          className={`mb-5 p-4 rounded-xl flex items-start gap-3 text-sm ${
            dm ? 'bg-blue-900/20 border border-blue-800 text-blue-300' : 'bg-blue-50 border border-blue-200 text-blue-700'
          }`}
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <p>Log your first day below to start seeing your personalized health scores and insights — quick taps are all you need.</p>
        </div>
      )}

      <div className="space-y-6">
        <div>
          <h3 className={`text-xs font-bold uppercase tracking-widest mb-4 ${dm ? 'text-gray-400' : 'text-gray-600'}`}>
            Physical
          </h3>
          <div className="space-y-5">
            <ChipRow
              label="Sleep last night"
              icon={Clock}
              value={form.sleepHours}
              onSelect={(v) => set('sleepHours', v as number)}
              chips={[
                { label: '4h', value: 4 },
                { label: '5h', value: 5 },
                { label: '6h', value: 6 },
                { label: '7h', value: 7 },
                { label: '8h', value: 8 },
                { label: '9h+', value: 9 },
              ]}
              dm={dm}
              labelCls={labelCls}
            />
            <NumberInput label="Sleep (fine-tune)" icon={Clock} min={0} max={14} step={0.5} unit="hours"
              value={form.sleepHours} onChange={(v) => set('sleepHours', v)}
              dm={dm} labelCls={labelCls} mutedCls={mutedCls} inputCls={inputCls}
            />

            <ChipRow
              label="Exercise"
              icon={Dumbbell}
              value={form.exerciseMinutes}
              onSelect={(v) => set('exerciseMinutes', v as number)}
              chips={[
                { label: 'None', value: 0 },
                { label: '15 min', value: 15 },
                { label: '30 min', value: 30 },
                { label: '60 min', value: 60 },
                { label: '90+ min', value: 90 },
              ]}
              dm={dm}
              labelCls={labelCls}
            />
            <NumberInput label="Exercise (fine-tune)" icon={Dumbbell} min={0} max={300} step={5} unit="min"
              value={form.exerciseMinutes} onChange={(v) => set('exerciseMinutes', v)}
              dm={dm} labelCls={labelCls} mutedCls={mutedCls} inputCls={inputCls}
            />

            <ChipRow
              label="Water"
              icon={Droplets}
              value={form.waterIntake}
              unit="cups"
              onSelect={(v) => set('waterIntake', v as number)}
              chips={[
                { label: '2', value: 2 },
                { label: '4', value: 4 },
                { label: '6', value: 6 },
                { label: '8', value: 8 },
                { label: '10+', value: 10 },
              ]}
              dm={dm}
              labelCls={labelCls}
            />

            <ChipRow
              label="Caffeine"
              icon={Coffee}
              value={form.caffeineIntake}
              unit="cups"
              onSelect={(v) => set('caffeineIntake', v as number)}
              chips={[
                { label: 'None', value: 0 },
                { label: '1', value: 1 },
                { label: '2', value: 2 },
                { label: '3', value: 3 },
                { label: '4+', value: 4 },
              ]}
              dm={dm}
              labelCls={labelCls}
            />

            <label className={`flex items-center gap-2 text-sm cursor-pointer ${dm ? 'text-gray-300' : 'text-gray-700'}`}>
              <input
                type="checkbox"
                checked={logWeight}
                onChange={(e) => {
                  if (e.target.checked) {
                    set('trackWeight', true);
                    set('weight', recentWeight);
                  } else {
                    set('trackWeight', false);
                    set('weight', undefined);
                  }
                }}
                className="rounded accent-green-600"
              />
              Log today&apos;s weight (optional)
            </label>
            {logWeight && (
              <NumberInput label="Weight" icon={Scale} min={20} max={300} step={0.1} unit="kg"
                value={form.weight} onChange={(v) => set('weight', v)} fallback={recentWeight}
                dm={dm} labelCls={labelCls} mutedCls={mutedCls} inputCls={inputCls}
              />
            )}
          </div>
        </div>

        <div>
          <h3 className={`text-xs font-bold uppercase tracking-widest mb-1 ${dm ? 'text-gray-400' : 'text-gray-600'}`}>
            Nutrition
          </h3>
          <p className={`text-xs mb-4 ${mutedCls}`}>Add your foods below to calculate calories, nutrition, and meal quality automatically.</p>

          <div className="space-y-5">
            <div>
              <label className={labelCls}>
                <Apple className="w-4 h-4 inline mr-1.5 -mt-0.5" />
                What did you eat today?
              </label>
              <div className="relative mt-2">
                <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${dm ? 'text-gray-400' : 'text-gray-600'}`} />
                <input
                  type="text"
                  value={foodQuery}
                  onChange={(e) => onSearch(e.target.value)}
                  placeholder="Search foods e.g. chicken, rice, banana"
                  className={`${inputCls} pl-10`}
                />
                {foodResults.length > 0 && (
                  <div className={`absolute z-10 mt-2 w-full rounded-xl border shadow-lg overflow-hidden ${
                    dm ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
                  }`}>
                    {foodResults.map((f, i) => (
                      <button
                        key={f.name}
                        type="button"
                        onClick={() => addMeal(f)}
                        className={`w-full flex items-center justify-between px-4 py-2.5 text-sm transition-colors ${
                          i !== foodResults.length - 1 ? `border-b ${dm ? 'border-gray-700' : 'border-gray-100'}` : ''
                        } ${dm ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}`}
                      >
                        <span className={dm ? 'text-gray-200' : 'text-gray-700'}>
                          {f.name}<span className={`text-xs ml-1.5 ${mutedCls}`}>({f.serving})</span>
                        </span>
                        <span className={`text-xs ${mutedCls}`}>{f.calories} kcal</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {meals.length > 0 && (
                <div className="space-y-2.5 mt-3">
                  {meals.map((m, i) => {
                    const units = getFoodUnits(m);
                    const activeUnit = units.find((u) => u.id === m.unit) ?? units[0];
                    const displayAmount = qtyToAmount(m.qty, activeUnit);
                    const draftValue = amountDrafts[i] !== undefined ? amountDrafts[i] : String(displayAmount);
                    const showFractions = activeUnit.id !== 'g' && activeUnit.id !== 'ml';

                    return (
                      <div key={i} className={`rounded-xl border p-3 space-y-2.5 ${
                        dm ? 'bg-gray-800 border-gray-700' : 'bg-slate-50 border-gray-200'
                      }`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className={`text-sm font-semibold truncate ${dm ? 'text-white' : 'text-gray-800'}`}>{m.name}</p>
                            <p className={`text-xs mt-0.5 ${mutedCls}`}>
                              <span className={`font-medium ${dm ? 'text-gray-200' : 'text-gray-700'}`}>{formatServingBreakdown(m)}</span>
                              {' · '}
                              <span className={`font-semibold ${dm ? 'text-orange-300' : 'text-orange-600'}`}>{Math.round(m.calories * m.qty)} kcal</span>
                              {' · '}
                              {Math.round(m.protein * m.qty)}g P · {Math.round(m.carbs * m.qty)}g C · {Math.round(m.fats * m.qty)}g F
                            </p>
                          </div>
                          <button type="button" onClick={() => handleRemoveMeal(i)}
                            className={`p-1.5 rounded-lg text-red-500 transition-colors flex-shrink-0 ${dm ? 'hover:bg-red-950/40' : 'hover:bg-red-50'}`}
                            aria-label="Remove food">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2">
                          {/* Direct amount + unit measurement controls */}
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => updateMealAmount(i, displayAmount - activeUnit.step, activeUnit.id)}
                              className={`p-1.5 rounded-lg ${dm ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
                              aria-label="Decrease amount"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={draftValue}
                              onChange={(e) => {
                                const raw = e.target.value;
                                setAmountDrafts((prev) => ({ ...prev, [i]: raw }));
                                const parsed = parseAmountInput(raw);
                                if (parsed !== null) {
                                  const nextQty = amountToQty(Math.max(activeUnit.min, parsed), activeUnit);
                                  applyMealTotals(
                                    meals.map((item, idx) => (idx === i ? { ...item, qty: nextQty, unit: activeUnit.id } : item))
                                  );
                                }
                              }}
                              onBlur={() => {
                                const parsed = parseAmountInput(draftValue);
                                if (parsed !== null) {
                                  updateMealAmount(i, parsed, activeUnit.id);
                                } else {
                                  setAmountDrafts((prev) => {
                                    const next = { ...prev };
                                    delete next[i];
                                    return next;
                                  });
                                }
                              }}
                              aria-label="Food amount"
                              title="Enter decimals (e.g. 1.5) or fractions (e.g. 1/2 or 1 1/2)"
                              className={`w-16 px-2 py-1 text-center text-sm font-semibold rounded-lg border focus:outline-none focus:ring-2 focus:ring-green-500 ${
                                dm ? 'bg-gray-900 border-gray-600 text-white' : 'bg-gray-50 border-gray-200 text-gray-800'
                              }`}
                            />
                            <button
                              type="button"
                              onClick={() => updateMealAmount(i, displayAmount + activeUnit.step, activeUnit.id)}
                              className={`p-1.5 rounded-lg ${dm ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
                              aria-label="Increase amount"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                            <select
                              value={activeUnit.id}
                              onChange={(e) => changeMealUnit(i, e.target.value)}
                              aria-label="Measurement unit"
                              className={`px-2.5 py-1 text-xs font-medium rounded-lg border focus:outline-none focus:ring-2 focus:ring-green-500 ${
                                dm ? 'bg-gray-900 border-gray-600 text-gray-200' : 'bg-gray-50 border-gray-200 text-gray-700'
                              }`}
                            >
                              {units.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.pluralLabel}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Quick common portion taps */}
                          {showFractions && (
                            <div className="flex items-center gap-1">
                              {[
                                { label: '½', val: 0.5 },
                                { label: '1', val: 1 },
                                { label: '1½', val: 1.5 },
                                { label: '2', val: 2 },
                              ].map((preset) => {
                                const isActive = Math.abs(displayAmount - preset.val) < 0.01;
                                return (
                                  <button
                                    key={preset.label}
                                    type="button"
                                    onClick={() => updateMealAmount(i, preset.val, activeUnit.id)}
                                    className={`px-2 py-0.5 text-xs font-medium rounded-md transition-colors ${
                                      isActive
                                        ? 'bg-green-600 text-white'
                                        : dm
                                          ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                                  >
                                    {preset.label}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <p className={`text-xs ${mutedCls}`}>
                    Tip: You can switch units (e.g. cups, grams, slices) or type fractions like <code className="font-semibold">1/2</code> or <code className="font-semibold">1 1/2</code>.
                  </p>
                </div>
              )}
            </div>

            {hasLoggedFoods && calculatedFromFoods ? (
              <div className={`rounded-xl border p-4 ${dm ? 'bg-gray-800/70 border-gray-700' : 'bg-green-50/70 border-green-200'}`}>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className={`flex items-center gap-1.5 text-sm font-semibold ${dm ? 'text-white' : 'text-gray-800'}`}>
                    <Flame className="w-4 h-4 text-orange-500" />
                    Calculated Calories
                  </span>
                  <span className={`text-lg font-bold ${
                    isHighCalorieOverage
                      ? 'text-red-500'
                      : isOverCalories
                        ? 'text-amber-500'
                        : dm ? 'text-green-400' : 'text-green-700'
                  }`}>
                    {calculatedFromFoods.calories.toLocaleString()} kcal
                    <span className={`text-xs font-normal ml-1 ${mutedCls}`}>/ {macroTargets.calories.toLocaleString()} kcal target</span>
                  </span>
                </div>
                <div className={`h-2 w-full rounded-full overflow-hidden mb-2 ${dm ? 'bg-gray-700' : 'bg-white'}`}>
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      isHighCalorieOverage ? 'bg-red-500' : isOverCalories ? 'bg-amber-500' : 'bg-green-500'
                    }`}
                    style={{ width: `${Math.min(100, Math.round((calculatedFromFoods.calories / Math.max(1, macroTargets.calories)) * 100))}%` }}
                  />
                </div>
                <p className={`text-xs ${mutedCls}`}>
                  Automatically calculated from the {meals.length} food item{meals.length !== 1 ? 's' : ''} you added above. Remove all foods if you want to enter calories manually.
                </p>
                <div className="flex items-center justify-between gap-2 mt-2.5 pt-2.5 border-t border-black/5 dark:border-white/10 text-xs">
                  <span className={mutedCls}>Auto-detected meal quality:</span>
                  <span className={`font-semibold px-2.5 py-0.5 rounded-full ${
                    autoMealQuality === 'healthy'
                      ? dm ? 'bg-green-900/40 text-green-300' : 'bg-green-100 text-green-700'
                      : autoMealQuality === 'balanced'
                        ? dm ? 'bg-emerald-900/40 text-emerald-300' : 'bg-emerald-100 text-emerald-700'
                        : autoMealQuality === 'mixed'
                          ? dm ? 'bg-amber-900/40 text-amber-300' : 'bg-amber-100 text-amber-700'
                          : dm ? 'bg-orange-900/40 text-orange-300' : 'bg-orange-100 text-orange-700'
                  }`}>
                    {foodQualityLabel(autoMealQuality)}
                  </span>
                </div>
              </div>
            ) : (
              <>
                <ChipRow
                  label="Daily calories"
                  icon={Flame}
                  value={form.calories}
                  onSelect={(v) => {
                    const cals = v as number;
                    set('calories', cals);
                    if (!trackMacros) {
                      const m = estimateMacrosFromCalories(cals);
                      set('protein', m.protein);
                      set('carbs', m.carbs);
                      set('fats', m.fats);
                    }
                  }}
                  chips={[
                    { label: '1,500', value: 1500 },
                    { label: '1,800', value: 1800 },
                    { label: '2,000', value: 2000 },
                    { label: '2,200', value: 2200 },
                    { label: '2,500', value: 2500 },
                  ]}
                  dm={dm}
                  labelCls={labelCls}
                />
                <NumberInput
                  label="Custom daily calories"
                  icon={Flame}
                  min={0}
                  max={10000}
                  unit="kcal"
                  placeholder={`e.g. ${defaultCalories(profile)}`}
                  value={form.calories}
                  onChange={(v) => set('calories', v)}
                  dm={dm}
                  labelCls={labelCls}
                  mutedCls={mutedCls}
                  inputCls={inputCls}
                />
                <p className={`text-xs -mt-2 ${mutedCls}`}>
                  Tip: Adding foods above automatically calculates your daily calories and nutrition totals.
                </p>
              </>
            )}

            {isOverCalories && (
              <div
                role="alert"
                className={`p-3.5 rounded-xl border flex items-start gap-2.5 text-sm ${
                  isHighCalorieOverage
                    ? dm
                      ? 'bg-red-950/40 border-red-800 text-red-200'
                      : 'bg-red-50 border-red-200 text-red-800'
                    : dm
                      ? 'bg-amber-950/40 border-amber-800 text-amber-200'
                      : 'bg-amber-50 border-amber-200 text-amber-800'
                }`}
              >
                <AlertTriangle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${isHighCalorieOverage ? 'text-red-500' : 'text-amber-500'}`} />
                <div>
                  <p className="font-semibold">
                    Recommended Daily Calories Exceeded
                  </p>
                  <p className="text-xs mt-0.5 opacity-90">
                    Your logged intake ({currentCalories.toLocaleString()} kcal) is {calorieOverage.toLocaleString()} kcal above your recommended daily target of {macroTargets.calories.toLocaleString()} kcal.
                  </p>
                </div>
              </div>
            )}

            <label className={`flex items-center gap-2 text-sm cursor-pointer ${dm ? 'text-gray-300' : 'text-gray-700'}`}>
              <input
                type="checkbox"
                checked={trackMacros}
                onChange={(e) => {
                  const on = e.target.checked;
                  set('trackMacros', on);
                  if (!on && form.calories) {
                    const m = estimateMacrosFromCalories(form.calories);
                    set('protein', m.protein);
                    set('carbs', m.carbs);
                    set('fats', m.fats);
                  }
                }}
                className="rounded accent-green-600"
              />
              Enter protein, carbs & fats manually (optional)
            </label>

            {trackMacros && (
              <div className="grid grid-cols-3 gap-3">
                <NumberInput label="Protein" icon={Beef} min={0} max={500} unit="g"
                  value={form.protein} onChange={(v) => set('protein', v)}
                  dm={dm} labelCls={labelCls} mutedCls={mutedCls} inputCls={inputCls}
                />
                <NumberInput label="Carbs" icon={Wheat} min={0} max={900} unit="g"
                  value={form.carbs} onChange={(v) => set('carbs', v)}
                  dm={dm} labelCls={labelCls} mutedCls={mutedCls} inputCls={inputCls}
                />
                <NumberInput label="Fats" icon={Apple} min={0} max={300} unit="g"
                  value={form.fats} onChange={(v) => set('fats', v)}
                  dm={dm} labelCls={labelCls} mutedCls={mutedCls} inputCls={inputCls}
                />
              </div>
            )}

            {!trackMacros && (form.calories ?? 0) > 0 && (
              <p className={`text-xs p-3 rounded-xl border ${dm ? 'bg-gray-800 border-gray-700 text-gray-300' : 'bg-slate-50 border-gray-200 text-gray-700'}`}>
                Protein, carbs, and fats are automatically estimated from your calories (~25% protein, ~50% carbs, ~25% fats).
              </p>
            )}

            <div className={`rounded-xl border p-4 ${dm ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200 shadow-xs'}`}>
              <MacroCompare
                label="Daily Nutrition Balance"
                actual={{
                  calories: form.calories ?? 0,
                  protein: form.protein ?? 0,
                  carbs: form.carbs ?? 0,
                  fats: form.fats ?? 0,
                }}
                target={macroTargets}
                dm={dm}
                mutedCls={mutedCls}
              />
            </div>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onSave}
        className="mt-6 w-full py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all accent-gradient shadow-md"
      >
        {logSaved ? (
          <>
            <CheckCircle className="w-5 h-5" /> Log saved — updating your health summary…
          </>
        ) : (
          <>
            <CheckCircle className="w-5 h-5" /> {existingForDate ? 'Update' : 'Save'} log for{' '}
            {logDate === TODAY ? 'today' : format(parseISO(logDate), 'MMM d')}
          </>
        )}
      </button>
    </>
  );
}
