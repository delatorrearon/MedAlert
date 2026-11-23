import { Dispatch, SetStateAction, useState } from 'react';
import {
  Clock, Dumbbell, Droplets, Coffee, Scale, Flame, Beef, Wheat, Apple,
  CheckCircle, AlertCircle, Calendar, ChevronLeft, ChevronRight, Search, Plus, Trash2, Minus,
} from 'lucide-react';
import { format, parseISO, subDays } from 'date-fns';
import { DailyLog, FoodQuality, MealEntry, UserProfile } from '../db/database';
import { estimateMacrosFromCalories } from '../utils/mlEngine';
import { FoodItem, macroTargetsForProfile, mealTotals, searchFoods } from '../utils/foodEngine';
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

const TODAY = new Date().toISOString().split('T')[0];

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
        {unit && <span className={`ml-1 text-xs font-normal ${dm ? 'text-gray-500' : 'text-gray-400'}`}>({unit})</span>}
      </label>
      <div className="flex flex-wrap gap-2 mt-2">
        {chips.map((c) => {
          const active = value === c.value;
          return (
            <button
              key={String(c.value)}
              type="button"
              onClick={() => onSelect(c.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-green-600 text-white shadow-sm'
                  : dm
                    ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
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

  const macroTargets = macroTargetsForProfile(profile);

  const applyMealTotals = (next: MealEntry[]) => {
    const t = mealTotals(next);
    set('meals', next);
    set('calories', t.calories);
    set('protein', t.protein);
    set('carbs', t.carbs);
    set('fats', t.fats);
    set('trackMacros', true);
  };

  const addMeal = (food: FoodItem) => {
    applyMealTotals([...meals, { ...food, qty: 1 }]);
    setFoodQuery('');
    setFoodResults([]);
  };

  const { confirm } = useConfirm();

  const removeMeal = (i: number) => applyMealTotals(meals.filter((_, idx) => idx !== i));

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

  const changeQty = (i: number, qty: number) =>
    applyMealTotals(meals.map((m, idx) => (idx === i ? { ...m, qty: Math.max(0.5, qty) } : m)));

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

  const foodQualityChips: { label: string; value: FoodQuality }[] = [
    { label: 'Mostly healthy', value: 'healthy' },
    { label: 'Balanced', value: 'balanced' },
    { label: 'Mixed', value: 'mixed' },
    { label: 'Mostly processed', value: 'processed' },
  ];

  return (
    <>
      {/* Date picker */}
      <div className={`p-4 rounded-xl mb-5 ${dm ? 'bg-gray-800' : 'bg-gray-50'}`}>
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
            className={`text-xs px-2.5 py-1 rounded-full font-medium ${
              logDate === TODAY ? 'bg-green-600 text-white' : dm ? 'bg-gray-700 text-gray-300' : 'bg-white border text-gray-600'
            }`}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setLogDate(format(subDays(new Date(), 1), 'yyyy-MM-dd'))}
            className={`text-xs px-2.5 py-1 rounded-full font-medium ${
              dm ? 'bg-gray-700 text-gray-300' : 'bg-white border text-gray-600'
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
          <p>Your first log starts ML predictions. Quick taps below — no need to track every macro.</p>
        </div>
      )}

      <div className="space-y-6">
        <div>
          <h3 className={`text-xs font-bold uppercase tracking-widest mb-4 ${dm ? 'text-gray-500' : 'text-gray-400'}`}>
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
              Log body weight today (optional, improves BMI accuracy)
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
          <h3 className={`text-xs font-bold uppercase tracking-widest mb-1 ${dm ? 'text-gray-500' : 'text-gray-400'}`}>
            Nutrition
          </h3>
          <p className={`text-xs mb-4 ${mutedCls}`}>Calories and eating quality are enough for most people.</p>

          <div className="space-y-5">
            <div>
              <label className={labelCls}>
                <Apple className="w-4 h-4 inline mr-1.5 -mt-0.5" />
                What did you eat today? (Food database)
              </label>
              <div className="relative mt-2">
                <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${dm ? 'text-gray-500' : 'text-gray-400'}`} />
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
                <div className="space-y-2 mt-3">
                  {meals.map((m, i) => (
                    <div key={i} className={`flex items-center justify-between gap-3 rounded-xl border p-2.5 ${
                      dm ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-100'
                    }`}>
                      <div className="min-w-0">
                        <p className={`text-sm font-medium truncate ${dm ? 'text-white' : 'text-gray-800'}`}>{m.name}</p>
                        <p className={`text-xs ${mutedCls}`}>
                          {m.serving} · {m.protein}g P · {m.carbs}g C · {m.fats}g F
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button type="button" onClick={() => changeQty(i, m.qty - 0.5)}
                          className={`p-1.5 rounded-lg ${dm ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'}`}
                          aria-label="Decrease servings">
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className={`text-sm font-semibold w-6 text-center ${dm ? 'text-white' : 'text-gray-800'}`}>
                          {m.qty}
                        </span>
                        <button type="button" onClick={() => changeQty(i, m.qty + 0.5)}
                          className={`p-1.5 rounded-lg ${dm ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'}`}
                          aria-label="Increase servings">
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" onClick={() => handleRemoveMeal(i)}
                          className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                          aria-label="Remove food">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <ChipRow
              label="Estimated calories today"
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
                { label: '~1500', value: 1500 },
                { label: '~1800', value: 1800 },
                { label: '~2000', value: 2000 },
                { label: '~2200', value: 2200 },
                { label: '~2500', value: 2500 },
              ]}
              dm={dm}
              labelCls={labelCls}
            />
            <NumberInput
              label="Calories (exact)"
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

            <div>
              <label className={labelCls}>How did you eat today?</label>
              <div className="flex flex-wrap gap-2 mt-2">
                {foodQualityChips.map((c) => {
                  const active = form.foodQuality === c.value;
                  return (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => set('foodQuality', c.value)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        active
                          ? 'bg-green-600 text-white'
                          : dm
                            ? 'bg-gray-800 text-gray-300'
                            : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>

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
              I track protein, carbs & fats (optional)
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
              <p className={`text-xs p-3 rounded-xl ${dm ? 'bg-gray-800 text-gray-400' : 'bg-gray-50 text-gray-500'}`}>
                Macros estimated from calories for ML analysis (~25% protein, ~50% carbs, ~25% fats).
              </p>
            )}

            <div className={`rounded-xl border p-4 ${dm ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-100'}`}>
              <MacroCompare
                label="Auto macro comparison"
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
        className={`mt-6 w-full py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all ${
          logSaved
            ? 'bg-green-500 text-white'
            : 'bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-600 hover:to-emerald-700 shadow-lg shadow-green-200/40'
        }`}
      >
        {logSaved ? (
          <>
            <CheckCircle className="w-5 h-5" /> Log saved — ML updating…
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
