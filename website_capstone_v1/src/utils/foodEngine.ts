import foods from '../data/foods.json';
import { MealEntry, UserProfile } from '../db/database';

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

/** Search the embedded food database by name (substring, case-insensitive). */
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