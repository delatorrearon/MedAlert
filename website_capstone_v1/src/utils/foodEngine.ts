import foods from '../data/foods.json';
import { FoodQuality, MealEntry, UserProfile } from '../db/database';

export interface FoodItem {
  name: string;
  serving: string;
  protein: number;
  carbs: number;
  fats: number;
  calories: number;
}

export interface MacroTargets {
  calories: number;
  protein: number; // g
  carbs: number;   // g
  fats: number;    // g
}

export interface FoodUnitOption {
  id: string;
  label: string;
  pluralLabel: string;
  /** Number of base `serving`s represented by 1 unit. */
  qtyPerUnit: number;
  step: number;
  min: number;
  /** Equivalent weight or volume per 1 unit, when known. */
  approxMeasure?: { amount: number; unit: 'g' | 'ml' };
}

const FOODS = foods as FoodItem[];

export const ACTIVITY_CALORIES: Record<string, number> = {
  sedentary: 1800,
  light: 2000,
  moderate: 2200,
  active: 2500,
  very_active: 2800,
};

const GOAL_ADJUSTMENT: Record<string, number> = {
  lose: -300,
  maintain: 0,
  gain: 300,
};

const PROTEIN_FACTOR: Record<string, number> = {
  sedentary: 1.2,
  light: 1.3,
  moderate: 1.5,
  active: 1.6,
  very_active: 1.8,
};

/** Search the embedded food list by name (substring, case-insensitive). */
export function searchFoods(query: string, limit = 8): FoodItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return FOODS.filter((f) => f.name.toLowerCase().includes(q)).slice(0, limit);
}

export function allFoods(): FoodItem[] {
  return FOODS;
}

/** Profile-based daily calorie + macro targets (protein/carbs/fat in grams). */
export function macroTargetsForProfile(profile: UserProfile | null): MacroTargets {
  const activity = profile?.activityLevel || 'moderate';
  const goal = profile?.goal || 'maintain';
  const rawWeight = profile?.weight || 70;
  const weight = rawWeight > 0 ? rawWeight : 70;

  const baseCalories = ACTIVITY_CALORIES[activity] ?? 2000;
  const calories = Math.max(1200, baseCalories + (GOAL_ADJUSTMENT[goal] ?? 0));

  const proteinFactor = PROTEIN_FACTOR[activity] ?? 1.5;
  const protein = Math.round(proteinFactor * weight);

  const fatCalories = calories * 0.25;
  const fats = Math.round(fatCalories / 9);

  const remainingCalories = calories - protein * 4 - fats * 9;
  const carbs = Math.max(20, Math.round(remainingCalories / 4));

  return { calories, protein, carbs, fats };
}

/** Macro totals for a meal list. */
export function mealTotals(meals: MealEntry[]) {
  return meals.reduce(
    (acc, m) => {
      acc.calories += Math.round(m.calories * m.qty);
      acc.protein += Math.round(m.protein * m.qty);
      acc.carbs += Math.round(m.carbs * m.qty);
      acc.fats += Math.round(m.fats * m.qty);
      return acc;
    },
    { calories: 0, protein: 0, carbs: 0, fats: 0 }
  );
}

// ─── Unit & Measurement Engine ───────────────────────────────────────────────

/** Household cup weights (in grams) for foods commonly measured by cup. */
const CUP_GRAMS_BY_FOOD: Record<string, number> = {
  'White rice (cooked)': 150,
  'Brown rice (cooked)': 150,
  'Oats (dry)': 80,
  'Oatmeal (cooked)': 230,
  'Rice noodles (cooked)': 175,
  'Pasta (cooked)': 140,
  'Quinoa (cooked)': 185,
  'Chickpeas (cooked)': 164,
  'Lentils (cooked)': 198,
  'Black beans (cooked)': 172,
  'Greek yogurt (plain, full fat)': 245,
  'Cottage cheese': 225,
  'Berries (mixed)': 145,
  'Broccoli (steamed)': 155,
  'Spinach (raw)': 30,
  'Green beans (cooked)': 125,
  'Ice cream (vanilla)': 132,
};

function parseBaseMeasure(serving: string): { amount: number; unit: 'g' | 'ml' } | null {
  const match = serving.match(/(\d+(?:\.\d+)?)\s*(g|ml)\b/i);
  if (!match) return null;
  const amount = parseFloat(match[1]);
  const unit = match[2].toLowerCase() as 'g' | 'ml';
  return Number.isFinite(amount) && amount > 0 ? { amount, unit } : null;
}

function pluralize(singular: string, plural?: string): { label: string; pluralLabel: string } {
  if (plural) return { label: singular, pluralLabel: plural };
  if (singular === 'g' || singular === 'ml' || singular === 'tbsp' || singular === 'pcs') {
    return { label: singular, pluralLabel: singular };
  }
  return { label: singular, pluralLabel: `${singular}s` };
}

/**
 * Returns intuitive measurement units for a food item.
 * The first unit in the array is the default unit when adding the food.
 */
export function getFoodUnits(food: Pick<FoodItem, 'name' | 'serving'>): FoodUnitOption[] {
  const base = parseBaseMeasure(food.serving);
  const s = food.serving.toLowerCase();
  const units: FoodUnitOption[] = [];

  const cupGrams = CUP_GRAMS_BY_FOOD[food.name];
  if (cupGrams && base && base.unit === 'g') {
    units.push({
      id: 'cup',
      label: 'cup',
      pluralLabel: 'cups',
      qtyPerUnit: cupGrams / base.amount,
      step: 0.5,
      min: 0.25,
      approxMeasure: { amount: cupGrams, unit: 'g' },
    });
  }

  // Natural count / household units parsed from the serving label
  const naturalMatch = s.match(/^(\d+(?:\.\d+)?)\s*(egg|eggs|slice|slices|cup|cups|tbsp|can|cans|pack|packs|plate|plates|burger|burgers|scoop|scoops|pancake|pancakes|pcs|medium)\b/);
  if (naturalMatch) {
    const baseCount = parseFloat(naturalMatch[1]) || 1;
    const rawUnit = naturalMatch[2];
    const normalizedId =
      rawUnit === 'medium' ? 'piece'
      : rawUnit === 'pcs' ? 'piece'
      : rawUnit.replace(/s$/, '');
    const names = pluralize(
      normalizedId,
      normalizedId === 'tbsp' ? 'tbsp' : undefined
    );

    if (!units.some((u) => u.id === normalizedId)) {
      units.push({
        id: normalizedId,
        label: names.label,
        pluralLabel: names.pluralLabel,
        qtyPerUnit: 1 / baseCount,
        step: baseCount >= 2 || normalizedId === 'cup' || normalizedId === 'slice' || normalizedId === 'tbsp' ? 0.5 : 0.5,
        min: 0.25,
        approxMeasure: base ? { amount: Math.round((base.amount / baseCount) * 10) / 10, unit: base.unit } : undefined,
      });
    }
  }

  // Exact gram / ml unit
  if (base) {
    units.push({
      id: base.unit,
      label: base.unit,
      pluralLabel: base.unit,
      qtyPerUnit: 1 / base.amount,
      step: base.unit === 'ml' ? 50 : base.amount <= 40 ? 10 : 25,
      min: 1,
      approxMeasure: { amount: 1, unit: base.unit },
    });
  }

  // Base serving fallback (always valid)
  if (!units.some((u) => u.id === 'serving')) {
    units.push({
      id: 'serving',
      label: `serving (${food.serving})`,
      pluralLabel: `servings (${food.serving})`,
      qtyPerUnit: 1,
      step: 0.5,
      min: 0.25,
      approxMeasure: base ?? undefined,
    });
  }

  return units;
}

export function getDefaultFoodUnit(food: Pick<FoodItem, 'name' | 'serving'>): FoodUnitOption {
  return getFoodUnits(food)[0];
}

export function formatUnitLabel(unit: FoodUnitOption, amount: number): string {
  return Math.abs(amount - 1) < 1e-6 ? unit.label : unit.pluralLabel;
}

export function amountToQty(amount: number, unit: FoodUnitOption): number {
  return Math.max(0.05, amount * unit.qtyPerUnit);
}

export function qtyToAmount(qty: number, unit: FoodUnitOption): number {
  const raw = qty / unit.qtyPerUnit;
  return unit.id === 'g' || unit.id === 'ml'
    ? Math.round(raw)
    : Math.round(raw * 100) / 100;
}

/**
 * Parses decimals ("1.5"), simple fractions ("1/2"), or mixed fractions ("1 1/2", "1-1/2").
 */
export function parseAmountInput(raw: string): number | null {
  const clean = raw.trim();
  if (!clean) return null;

  // Mixed fraction e.g. "1 1/2" or "1-1/2"
  const mixed = clean.match(/^(\d+)\s*[-\s]\s*(\d+)\s*\/\s*(\d+)$/);
  if (mixed) {
    const whole = parseInt(mixed[1], 10);
    const num = parseInt(mixed[2], 10);
    const den = parseInt(mixed[3], 10);
    if (den > 0) return whole + num / den;
    return null;
  }

  // Simple fraction e.g. "1/2"
  const frac = clean.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (frac) {
    const num = parseFloat(frac[1]);
    const den = parseFloat(frac[2]);
    if (Number.isFinite(num) && Number.isFinite(den) && den > 0) return num / den;
    return null;
  }

  // Standard decimal / integer
  const n = Number(clean);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function formatServingBreakdown(meal: MealEntry): string {
  const units = getFoodUnits(meal);
  const activeUnit = units.find((u) => u.id === meal.unit) ?? units[0];
  const amount = qtyToAmount(meal.qty, activeUnit);
  const unitText = formatUnitLabel(activeUnit, amount);

  if (activeUnit.id === 'g' || activeUnit.id === 'ml') {
    return `${amount} ${unitText}`;
  }
  if (activeUnit.approxMeasure) {
    const totalMeasure = Math.round(amount * activeUnit.approxMeasure.amount);
    return `${amount} ${unitText} (≈ ${totalMeasure}${activeUnit.approxMeasure.unit})`;
  }
  return `${amount} ${unitText}`;
}

// ─── Automated Food Quality Classification ───────────────────────────────────

/** Processing score per food item: 0.1 = whole, 0.35 = refined staple, 0.6 = moderate, 1.0 = ultra-processed. */
const FOOD_PROCESSING_SCORE: Record<string, number> = {
  'Chicken breast (grilled)': 0.1,
  'Chicken thigh (roasted)': 0.1,
  'Ground beef (80/20, cooked)': 0.15,
  'Lean beef steak (sirloin)': 0.1,
  'Salmon (baked)': 0.1,
  'Tuna (canned in water)': 0.15,
  'Shrimp (cooked)': 0.1,
  'Pork chop (lean, cooked)': 0.15,
  'Egg (large)': 0.1,
  'Scrambled eggs (2 eggs)': 0.15,
  'Tofu (firm)': 0.15,
  'Chickpeas (cooked)': 0.1,
  'Lentils (cooked)': 0.1,
  'Black beans (cooked)': 0.1,
  'Greek yogurt (plain, full fat)': 0.15,
  'Cottage cheese': 0.2,
  'Cheddar cheese': 0.35,
  'Whey protein shake': 0.35,
  'White rice (cooked)': 0.35,
  'Brown rice (cooked)': 0.1,
  'Oats (dry)': 0.1,
  'Oatmeal (cooked)': 0.1,
  'Rice noodles (cooked)': 0.4,
  'Whole wheat bread': 0.3,
  'White bread': 0.6,
  'Pasta (cooked)': 0.4,
  'Baked potato': 0.1,
  'Sweet potato (baked)': 0.1,
  'Quinoa (cooked)': 0.1,
  'Banana': 0.1,
  'Apple': 0.1,
  'Orange': 0.1,
  'Berries (mixed)': 0.1,
  'Avocado': 0.1,
  'Broccoli (steamed)': 0.1,
  'Spinach (raw)': 0.1,
  'Carrot (raw)': 0.1,
  'Cucumber': 0.1,
  'Tomato': 0.1,
  'Green beans (cooked)': 0.1,
  'Milk (whole)': 0.15,
  'Almonds': 0.1,
  'Peanuts': 0.15,
  'Peanut butter': 0.3,
  'Olive oil': 0.25,
  'Butter': 0.35,
  'Pizza (cheese, slice)': 0.95,
  'Cheeseburger (fast food)': 1.0,
  'French fries': 1.0,
  'Fried chicken (breaded)': 0.9,
  'White rice + chicken stir-fry': 0.35,
  'Sushi rolls (6 pcs)': 0.35,
  'Instant noodles (packet)': 1.0,
  'Canned soda (sweetened)': 1.0,
  'Orange juice': 0.45,
  'Chocolate bar (milk)': 0.95,
  'Ice cream (vanilla)': 0.9,
  'Pancakes with syrup': 0.85,
};

/**
 * Automatically derives overall daily meal quality from the user's logged foods
 * (calorie-weighted processing score), or falls back to profile habits when no foods are listed.
 */
export function classifyMealQuality(meals: MealEntry[], profile: UserProfile | null): FoodQuality {
  if (meals.length > 0) {
    let weightedSum = 0;
    let totalCalories = 0;
    for (const m of meals) {
      const cals = Math.max(1, m.calories * m.qty);
      const score = FOOD_PROCESSING_SCORE[m.name] ?? 0.35;
      weightedSum += cals * score;
      totalCalories += cals;
    }
    const avgScore = totalCalories > 0 ? weightedSum / totalCalories : 0.35;
    if (avgScore < 0.22) return 'healthy';
    if (avgScore < 0.42) return 'balanced';
    if (avgScore < 0.68) return 'mixed';
    return 'processed';
  }

  if (profile?.processedFood === 'rarely') return 'healthy';
  if (profile?.processedFood === 'frequently') return 'processed';
  return 'balanced';
}

export function foodQualityLabel(quality: FoodQuality): string {
  const map: Record<FoodQuality, string> = {
    healthy: 'Mostly whole foods',
    balanced: 'Balanced',
    mixed: 'Mixed whole & processed',
    processed: 'High processed intake',
  };
  return map[quality] ?? 'Balanced';
}
