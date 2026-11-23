import { Beef, Wheat, Apple, Flame } from 'lucide-react';

export interface MacroValues {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
}

export interface MacroCompareProps {
  label?: string;
  actual: MacroValues;
  target: MacroValues;
  dm: boolean;
  mutedCls: string;
}

function status(actual: number, target: number, lowIsBad: boolean): 'good' | 'warn' | 'bad' {
  if (lowIsBad) {
    if (actual >= target * 0.9) return 'good';
    if (actual >= target * 0.7) return 'warn';
    return 'bad';
  }
  if (actual <= target) return 'good';
  if (actual <= target * 1.15) return 'warn';
  return 'bad';
}

function statusColor(status: 'good' | 'warn' | 'bad'): string {
  return status === 'good' ? 'bg-green-500' : status === 'warn' ? 'bg-amber-500' : 'bg-red-500';
}

function statusText(status: 'good' | 'warn' | 'bad'): string {
  return status === 'good' ? 'On target' : status === 'warn' ? 'Slightly off' : 'Off target';
}

function Row({
  icon: Icon, label, actual, target, unit, lowIsBad, dm, mutedCls,
}: {
  icon: typeof Beef;
  label: string;
  actual: number;
  target: number;
  unit: string;
  lowIsBad: boolean;
  dm: boolean;
  mutedCls: string;
}) {
  const s = status(actual, target, lowIsBad);
  const pct = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className={`flex items-center gap-1.5 text-sm font-medium ${dm ? 'text-gray-300' : 'text-gray-700'}`}>
          <Icon className="w-4 h-4 text-green-500" />
          {label}
        </span>
        <span className={`text-sm font-semibold ${dm ? 'text-white' : 'text-gray-800'}`}>
          {actual}{unit}
          <span className={`text-xs font-normal ml-1 ${mutedCls}`}>/ {target}{unit}</span>
        </span>
      </div>
      <div className={`h-2 w-full rounded-full ${dm ? 'bg-gray-800' : 'bg-gray-100'}`}>
        <div
          className={`h-full rounded-full transition-all duration-700 ${statusColor(s)}`}
          style={{ width: `${actual > target ? 100 : pct}%` }}
        />
      </div>
      <p className={`text-xs mt-1 ${s === 'good' ? 'text-green-500' : s === 'warn' ? 'text-amber-500' : 'text-red-500'}`}>
        {pct}% of target — {statusText(s)}
      </p>
    </div>
  );
}

export default function MacroCompare({ label, actual, target, dm, mutedCls }: MacroCompareProps) {
  const s = status(actual.protein, target.protein, true);
  const sCarbs = status(actual.carbs, target.carbs, false);
  const sFats = status(actual.fats, target.fats, false);
  const worst = [s, sCarbs, sFats].find(x => x === 'bad') || [s, sCarbs, sFats].find(x => x === 'warn') || 'good';

  return (
    <div>
      {label && (
        <div className="flex items-center justify-between mb-4">
          <h3 className={`font-semibold ${dm ? 'text-white' : 'text-gray-800'}`}>{label}</h3>
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
            worst === 'good' ? 'bg-green-100 text-green-700' : worst === 'warn' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
          }`}>
            {worst === 'good' ? 'Within targets' : worst === 'warn' ? 'Watch macro balance' : 'Macro targets missed'}
          </span>
        </div>
      )}
      <div className="space-y-4">
        <Row icon={Flame} label="Calories" actual={actual.calories} target={target.calories}
          unit=" kcal" lowIsBad={false} dm={dm} mutedCls={mutedCls} />
        <Row icon={Beef} label="Protein" actual={actual.protein} target={target.protein} unit="g" lowIsBad dm={dm} mutedCls={mutedCls} />
        <Row icon={Wheat} label="Carbs" actual={actual.carbs} target={target.carbs} unit="g" lowIsBad={false} dm={dm} mutedCls={mutedCls} />
        <Row icon={Apple} label="Fats" actual={actual.fats} target={target.fats} unit="g" lowIsBad={false} dm={dm} mutedCls={mutedCls} />
      </div>
    </div>
  );
}