import { DailyLog, UserProfile, mlSnapshots } from '../db/database';
import { macroTargetsForProfile } from './foodEngine';
import trainedModelData from '../data/trainedModel.json';

export interface HealthMetric {
  label: string;
  value: string;
  target?: string;
  status: 'good' | 'warn' | 'bad';
}

export interface HealthRisk {
  category: string;
  riskLevel: 'low' | 'moderate' | 'high' | 'critical';
  score: number;
  trend: 'improving' | 'stable' | 'worsening';
  metrics: HealthMetric[];
  recommendations: string[];
}

export interface StandardMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
}

export interface ModelPerformance {
  logisticRegression: StandardMetrics;
  decisionTree: StandardMetrics;
  ensemble: StandardMetrics;
}

export interface MLResult {
  risks: HealthRisk[];
  overallScore: number;
  cardiovascular: number;
  metabolic: number;
  nutritional: number;
  sleep: number;
  dataPoints: number;
  confidence: number;
  activeModels: string[];
  modelPerformance: ModelPerformance;
  trainedOn?: string;
}

interface FeatureVector {
  sleep: number;
  exercise: number;
  water: number;
  caffeine: number;
  bmi: number;
  age: number;
  caloriesDeviation: number;
  protein: number;
  carbs: number;
  fats: number;
  smoking: number;
  alcohol: number;
  processedFood: number;
}

interface TrainedModelJson {
  feature_columns: string[];
  logistic_regression: {
    intercept: number;
    coefficients: Record<string, number>;
    scaler_mean: Record<string, number>;
    scaler_scale: Record<string, number>;
  };
  metrics: {
    logistic_regression: StandardMetrics;
    decision_tree: StandardMetrics;
    ensemble: StandardMetrics;
  };
  version?: string;
  trained_on?: string;
}

const TRAINED = trainedModelData as TrainedModelJson;
const USE_TRAINED_MODEL = Boolean(TRAINED?.logistic_regression?.coefficients);

function clamp(v: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(v)));
}

function avg(arr: number[]) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function getTrend(
  recent: number[],
  older: number[],
  lowerIsBetter = true
): 'improving' | 'stable' | 'worsening' {
  if (!recent.length || !older.length) return 'stable';
  const recentAvg = avg(recent);
  const olderAvg = avg(older);
  const diff = recentAvg - olderAvg;
  if (lowerIsBetter) {
    if (diff <= -3) return 'improving';
    if (diff >= 3) return 'worsening';
  } else {
    if (diff >= 3) return 'improving';
    if (diff <= -3) return 'worsening';
  }
  return 'stable';
}

function metricStatus(ok: boolean, warn: boolean): 'good' | 'warn' | 'bad' {
  return ok ? 'good' : warn ? 'warn' : 'bad';
}

function fmt(v: number, digits = 0): string {
  return v.toFixed(digits);
}

function sigmoid(x: number) {
  return 1 / (1 + Math.exp(-x));
}

/** Estimate macros from calories when user skips detailed tracking (25/50/25 split). */
export function estimateMacrosFromCalories(calories: number) {
  const cals = Math.max(calories, 500);
  return {
    protein: Math.round((cals * 0.25) / 4),
    carbs: Math.round((cals * 0.5) / 4),
    fats: Math.round((cals * 0.25) / 9),
  };
}

function resolveNutrition(log: DailyLog) {
  const calories = log.calories || 2000;
  const hasMacros =
    log.trackMacros &&
    ((log.protein ?? 0) > 0 || (log.carbs ?? 0) > 0 || (log.fats ?? 0) > 0);
  if (hasMacros) {
    return { calories, protein: log.protein, carbs: log.carbs, fats: log.fats };
  }
  const est = estimateMacrosFromCalories(calories);
  return { calories, ...est };
}

function resolveProcessedFood(log: DailyLog, profile: UserProfile | null): number {
  if (log.foodQuality === 'healthy') return 0.1;
  if (log.foodQuality === 'balanced') return 0.3;
  if (log.foodQuality === 'mixed') return 0.5;
  if (log.foodQuality === 'processed') return 1;
  if (profile?.processedFood === 'frequently') return 1;
  if (profile?.processedFood === 'sometimes') return 0.5;
  return 0.1;
}

function targetCaloriesForProfile(profile: UserProfile | null): number {
  const map: Record<string, number> = {
    sedentary: 1800,
    light: 2000,
    moderate: 2200,
    active: 2500,
    very_active: 2800,
  };
  return map[profile?.activityLevel ?? 'moderate'] ?? 2000;
}

function toFeatureVector(log: DailyLog, profile: UserProfile | null): FeatureVector {
  const age = profile?.age || 30;
  const weight = log.weight || profile?.weight || 70;
  const height = profile?.height || 170;
  const bmi = weight / Math.pow(height / 100, 2);

  const smoking = profile?.smoking === 'current' ? 1 : profile?.smoking === 'former' ? 0.5 : 0;
  const alcohol = profile?.alcohol === 'frequently' ? 1 : profile?.alcohol === 'moderately' ? 0.6 : 0.2;
  const processedFood = resolveProcessedFood(log, profile);

  const nutrition = resolveNutrition(log);
  const targetCalories = targetCaloriesForProfile(profile);
  const caloriesDeviation =
    Math.abs(nutrition.calories - targetCalories) / targetCalories;

  return {
    sleep: log.sleepHours,
    exercise: log.exerciseMinutes,
    water: log.waterIntake,
    caffeine: log.caffeineIntake,
    bmi,
    age,
    caloriesDeviation,
    protein: nutrition.protein,
    carbs: nutrition.carbs,
    fats: nutrition.fats,
    smoking,
    alcohol,
    processedFood,
  };
}

/** Map app feature vector to training pipeline column names */
function featureToTrainingRecord(f: FeatureVector): Record<string, number> {
  return {
    sleep: f.sleep,
    exercise: f.exercise,
    water: f.water,
    caffeine: f.caffeine,
    bmi: f.bmi,
    age: f.age,
    calories_deviation: f.caloriesDeviation,
    protein: f.protein,
    carbs: f.carbs,
    fats: f.fats,
    smoking: f.smoking,
    alcohol: f.alcohol,
    processed_food: f.processedFood,
  };
}

/** Trained logistic regression (StandardScaler + LR from Python pipeline) */
function trainedLogisticRegressionPredict(f: FeatureVector): number {
  const { logistic_regression: lr, feature_columns } = TRAINED;
  const record = featureToTrainingRecord(f);
  let z = lr.intercept;

  for (const col of feature_columns) {
    const raw = record[col] ?? 0;
    const mean = lr.scaler_mean[col] ?? 0;
    const scale = lr.scaler_scale[col] ?? 1;
    const scaled = Math.abs(scale) < 1e-8 ? raw - mean : (raw - mean) / scale;
    z += (lr.coefficients[col] ?? 0) * scaled;
  }

  return sigmoid(z);
}

/** Legacy hand-tuned model (fallback if trainedModel.json is missing) */
function legacyLogisticRegressionPredict(f: FeatureVector): number {
  const z =
    -1.7 +
    0.08 * (f.age / 10) +
    0.12 * Math.max(0, f.bmi - 24) +
    0.3 * f.smoking +
    0.2 * f.alcohol +
    0.2 * f.processedFood +
    0.25 * f.caloriesDeviation +
    0.09 * Math.max(0, 7 - f.sleep) +
    0.08 * Math.max(0, 30 - f.exercise) / 10 +
    0.08 * Math.max(0, 8 - f.water) / 2 +
    0.06 * Math.max(0, f.caffeine - 3) +
    0.05 * Math.max(0, 40 - f.protein) / 10 +
    0.03 * Math.max(0, f.carbs - 320) / 40 +
    0.04 * Math.max(0, f.fats - 80) / 20;

  return sigmoid(z);
}

function logisticRegressionPredict(f: FeatureVector): number {
  return USE_TRAINED_MODEL ? trainedLogisticRegressionPredict(f) : legacyLogisticRegressionPredict(f);
}

function decisionTreePredict(f: FeatureVector): number {
  if (f.smoking > 0.8 && f.exercise < 20) return 0.9;
  if (f.bmi >= 32 && f.caloriesDeviation > 0.35) return 0.88;
  if (f.sleep < 5.5 && f.caffeine > 4) return 0.82;
  if (f.exercise < 15 && f.water < 5) return 0.78;
  if (f.processedFood > 0.8 && f.protein < 45) return 0.74;
  if (f.bmi > 28 && f.exercise < 25) return 0.7;
  if (f.caloriesDeviation > 0.45) return 0.69;
  if (f.sleep >= 7 && f.exercise >= 35 && f.water >= 8 && f.caloriesDeviation < 0.18) return 0.15;
  if (f.bmi < 25 && f.exercise >= 30 && f.protein >= 60 && f.water >= 8) return 0.18;
  return 0.45;
}

function getOfflineModelPerformance(): ModelPerformance {
  if (USE_TRAINED_MODEL && TRAINED.metrics) {
    return {
      logisticRegression: TRAINED.metrics.logistic_regression,
      decisionTree: TRAINED.metrics.decision_tree,
      ensemble: TRAINED.metrics.ensemble,
    };
  }
  return {
    logisticRegression: { accuracy: 0, precision: 0, recall: 0, f1Score: 0 },
    decisionTree: { accuracy: 0, precision: 0, recall: 0, f1Score: 0 },
    ensemble: { accuracy: 0, precision: 0, recall: 0, f1Score: 0 },
  };
}

function level(score: number): 'low' | 'moderate' | 'high' | 'critical' {
  if (score < 30) return 'low';
  if (score < 50) return 'moderate';
  if (score < 70) return 'high';
  return 'critical';
}

function cardioTreeBoost(f: FeatureVector) {
  return decisionTreePredict({ ...f, processedFood: f.processedFood + 0.1 });
}

function metabolicTreeBoost(f: FeatureVector) {
  return decisionTreePredict({ ...f, caloriesDeviation: f.caloriesDeviation + 0.1 });
}

function nutritionalTreeBoost(f: FeatureVector) {
  return decisionTreePredict({ ...f, protein: f.protein - 10, carbs: f.carbs + 25 });
}

function sleepTreeBoost(f: FeatureVector) {
  return decisionTreePredict({ ...f, sleep: f.sleep - 0.8, caffeine: f.caffeine + 0.5 });
}

export function runMLAnalysis(
  logs: DailyLog[],
  profile: UserProfile | null,
  userId: string
): MLResult {
  const hasProfile = profile && profile.age > 0;
  const recent7 = logs.slice(-7);
  const older7 = logs.slice(-14, -7);

  const avgSleep = recent7.length ? avg(recent7.map((l) => l.sleepHours)) : 7;
  const avgExercise = recent7.length ? avg(recent7.map((l) => l.exerciseMinutes)) : 30;
  const avgWater = recent7.length ? avg(recent7.map((l) => l.waterIntake)) : 8;
  const avgCaffeine = recent7.length ? avg(recent7.map((l) => l.caffeineIntake)) : 2;
  const avgCalories = recent7.length ? avg(recent7.map((l) => l.calories)) : 2000;
  const avgProtein = recent7.length ? avg(recent7.map((l) => l.protein)) : 60;
  const avgCarbs = recent7.length ? avg(recent7.map((l) => l.carbs)) : 250;
  const avgFats = recent7.length ? avg(recent7.map((l) => l.fats)) : 65;

  const syntheticLog: DailyLog = {
    id: 'recent',
    userId,
    date: new Date().toISOString().split('T')[0],
    sleepHours: avgSleep,
    exerciseMinutes: avgExercise,
    waterIntake: avgWater,
    caffeineIntake: avgCaffeine,
    calories: avgCalories,
    protein: avgProtein,
    carbs: avgCarbs,
    fats: avgFats,
    weight: profile?.weight,
    createdAt: new Date().toISOString(),
  };

  const f = toFeatureVector(syntheticLog, profile);
  const lr = logisticRegressionPredict(f);
  const dt = decisionTreePredict(f);
  const ensemble = (lr + dt) / 2;

  const cardiovascular = clamp((ensemble * 100) * 0.55 + cardioTreeBoost(f) * 100 * 0.45);
  const metabolic = clamp((ensemble * 100) * 0.45 + metabolicTreeBoost(f) * 100 * 0.55);
  const nutritional = clamp((ensemble * 100) * 0.35 + nutritionalTreeBoost(f) * 100 * 0.65);
  const sleep = clamp((ensemble * 100) * 0.4 + sleepTreeBoost(f) * 100 * 0.6);

  const overall = clamp((cardiovascular * 0.3) + (metabolic * 0.25) + (nutritional * 0.25) + (sleep * 0.2));

  const cardioTrend = getTrend(
    recent7.map((l) => l.exerciseMinutes),
    older7.map((l) => l.exerciseMinutes),
    false
  );
  const metabolicTrend = getTrend(
    recent7.map((l) => l.sleepHours + l.waterIntake),
    older7.map((l) => l.sleepHours + l.waterIntake),
    false
  );
  const nutritionTrend = getTrend(
    recent7.map((l) => l.protein - l.carbs * 0.2),
    older7.map((l) => l.protein - l.carbs * 0.2),
    false
  );
  const sleepTrend = getTrend(
    recent7.map((l) => l.sleepHours),
    older7.map((l) => l.sleepHours),
    false
  );

  // ── Metric breakdowns (numbers behind each risk rating) ────────────────────
  const targets = macroTargetsForProfile(profile);
  const bmiVal = f.bmi;
  const targetCal = targetCaloriesForProfile(profile);
  const calDeviationPct = recent7.length
    ? avg(recent7.map((l) => (Math.abs((l.calories || targetCal) - targetCal) / targetCal) * 100))
    : 0;
  const smokingLabel =
    profile?.smoking === 'current' ? 'Current smoker'
    : profile?.smoking === 'former' ? 'Former smoker'
    : 'Non-smoker';

  const cardioMetrics: HealthMetric[] = [
    {
      label: 'Exercise', value: `${fmt(avgExercise)} min/day`, target: '≥ 30 min/day',
      status: metricStatus(avgExercise >= 30, avgExercise >= 15),
    },
    {
      label: 'Fats', value: `${fmt(avgFats)} g`, target: '≤ 80 g',
      status: metricStatus(avgFats <= 80, avgFats <= 95),
    },
    {
      label: 'Smoking', value: smokingLabel,
      status: profile?.smoking === 'current' ? 'bad' : profile?.smoking === 'former' ? 'warn' : 'good',
    },
  ];

  const metabolicMetrics: HealthMetric[] = [
    {
      label: 'BMI', value: fmt(bmiVal, 1), target: '18.5 – 24.9',
      status: metricStatus(bmiVal >= 18.5 && bmiVal <= 24.9, bmiVal >= 17 && bmiVal <= 29.9),
    },
    {
      label: 'Water', value: `${fmt(avgWater)} cups`, target: '≥ 8 cups',
      status: metricStatus(avgWater >= 8, avgWater >= 5),
    },
    {
      label: 'Calorie variance', value: `${fmt(calDeviationPct)}%`, target: 'within ±15%',
      status: metricStatus(calDeviationPct <= 15, calDeviationPct <= 30),
    },
  ];

  const nutritionalMetrics: HealthMetric[] = [
    {
      label: 'Protein', value: `${fmt(avgProtein)} g`, target: `≈ ${targets.protein} g`,
      status: metricStatus(avgProtein >= targets.protein * 0.9, avgProtein >= targets.protein * 0.7),
    },
    {
      label: 'Carbs', value: `${fmt(avgCarbs)} g`, target: `≤ ${targets.carbs} g`,
      status: metricStatus(avgCarbs <= targets.carbs, avgCarbs <= targets.carbs * 1.15),
    },
    {
      label: 'Fats', value: `${fmt(avgFats)} g`, target: `≤ ${targets.fats} g`,
      status: metricStatus(avgFats <= targets.fats, avgFats <= targets.fats * 1.15),
    },
  ];

  const sleepMetrics: HealthMetric[] = [
    {
      label: 'Sleep', value: `${fmt(avgSleep, 1)} h`, target: '7 – 9 h',
      status: metricStatus(avgSleep >= 7, avgSleep >= 6),
    },
    {
      label: 'Caffeine', value: `${fmt(avgCaffeine)} cups`, target: '≤ 3 cups',
      status: metricStatus(avgCaffeine <= 3, avgCaffeine <= 4),
    },
    {
      label: 'Exercise', value: `${fmt(avgExercise)} min/day`, target: '≥ 25 min/day',
      status: metricStatus(avgExercise >= 25, avgExercise >= 15),
    },
  ];

  const cardioRecs = [
    cardiovascular > 55 ? 'Increase moderate cardio to at least 30 minutes daily.' : 'Keep your cardio routine consistent to maintain low risk.',
    hasProfile && profile?.smoking === 'current' ? 'Smoking is a strong predictor in both models. Consider a quit plan.' : 'Remaining smoke-free helps keep model risk outputs lower.',
    avgFats > 80 ? 'Reduce saturated fats and replace with unsaturated sources.' : 'Current fat intake looks balanced for heart health.',
  ];

  const metabolicRecs = [
    avgSleep < 7 ? 'Increase sleep toward 7-9 hours to lower metabolic strain.' : 'Sleep is in a supportive range for metabolic regulation.',
    avgWater < 8 ? 'Hydration is below target. Aim for 8-10 cups per day.' : 'Hydration target is being met consistently.',
    Math.abs(avgCalories - 2000) > 500 ? 'Calorie intake variance is high. Stabilize intake for better metabolic predictions.' : 'Calorie intake is relatively stable and helps model consistency.',
  ];

  const nutritionRecs = [
    avgProtein < 60 ? 'Increase protein intake to support satiety and metabolic health.' : 'Protein intake is adequate in recent logs.',
    avgCarbs > 320 ? 'Lower refined carbohydrates and increase fiber sources.' : 'Carbohydrate intake is in a manageable range.',
    avgFats > 85 ? 'Review fat quality and reduce fried or highly processed foods.' : 'Fat intake levels are currently acceptable.',
  ];

  const sleepRecs = [
    avgSleep < 7 ? `Average sleep is ${avgSleep.toFixed(1)}h. Add a fixed bedtime routine.` : `Average sleep is ${avgSleep.toFixed(1)}h, within recommended range.`,
    avgCaffeine > 3 ? 'Reduce late-day caffeine to improve sleep architecture.' : 'Caffeine pattern is unlikely to significantly disrupt sleep.',
    avgExercise < 25 ? 'Low activity contributes to poorer sleep predictions. Increase movement daily.' : 'Activity level supports better sleep quality.',
  ];

  const risks: HealthRisk[] = [
    {
      category: 'Cardiovascular Health',
      riskLevel: level(cardiovascular),
      score: cardiovascular,
      trend: cardioTrend,
      metrics: cardioMetrics,
      recommendations: cardioRecs,
    },
    {
      category: 'Metabolic Health',
      riskLevel: level(metabolic),
      score: metabolic,
      trend: metabolicTrend,
      metrics: metabolicMetrics,
      recommendations: metabolicRecs,
    },
    {
      category: 'Nutritional Status',
      riskLevel: level(nutritional),
      score: nutritional,
      trend: nutritionTrend,
      metrics: nutritionalMetrics,
      recommendations: nutritionRecs,
    },
    {
      category: 'Sleep Health',
      riskLevel: level(sleep),
      score: sleep,
      trend: sleepTrend,
      metrics: sleepMetrics,
      recommendations: sleepRecs,
    },
  ];

  const today = new Date().toISOString().split('T')[0];
  mlSnapshots.save({
    userId,
    date: today,
    overallScore: overall,
    cardiovascular,
    metabolic,
    nutritional,
    sleep,
  });

  const confidence = Math.min(100, Math.round((logs.length / 30) * 100));

  const activeModels = USE_TRAINED_MODEL
    ? ['Trained Logistic Regression', 'Decision Tree (rules)', 'Ensemble']
    : ['Logistic Regression', 'Decision Tree', 'Ensemble'];

  return {
    risks,
    overallScore: overall,
    cardiovascular,
    metabolic,
    nutritional,
    sleep,
    dataPoints: logs.length,
    confidence,
    activeModels,
    modelPerformance: getOfflineModelPerformance(),
    trainedOn: USE_TRAINED_MODEL ? TRAINED.trained_on : undefined,
  };
}
