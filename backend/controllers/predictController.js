const { Onboarding } = require('../models/onboardingModel.js');

// --- METRIC LIMITS (Unchanged) ---
const METRIC_LIMITS = {
  cuoreScore: 90, bpUpper: 122, bpLower: 80, bsFasting: 100, bsAfterMeals: 140,
  a1c: 5.7, weight: 70, bmi: 22.9, bodyFat: 20, hdl: 60, ldl: 100,
  triglyceride: 150, nutrition: 90, fitness: 90, sleep: 90, stress: 90, heartRate: 80,
};

// --- PREDICTION LOGIC (Rule 1 Added) ---
const momentumPredict = (B, A, direction, limit) => { // Limit added here as well for capping
  A = A || 0;
  B = B || 0;

  if (A === B) {
    // If flat, predict stays flat, but ensure it's not already past the limit
     if (direction === 'increase') return Math.min(B, limit); // Cap at limit if already above
     else return Math.max(B, limit); // Cap at limit if already below
  }

  let prediction;
  if (direction === 'increase') {
    prediction = B + ((B - A) * 0.8);
    // Cap prediction at the upper limit
    prediction = Math.min(prediction, limit);
  } else {
    prediction = B - ((A - B) * 0.8);
    // Cap prediction at the lower limit (goal)
    prediction = Math.max(prediction, limit);
  }

  // --- Rule 1: Ensure prediction is never below 0 (absolute floor) ---
  return Math.max(0, prediction);
};

// --- generatePredictionSeries (Rule 2 Added) ---
const generatePredictionSeries = (history, X, initialBFormula, direction, limit, isO7Metric = false) => {
  const points = new Array(6).fill(0);
  // Filter out any null/undefined/non-numeric values from history FOR CALCULATION
  const validHistory = history.filter(val => typeof val === 'number' && !isNaN(val));
  const n = validHistory.length;
  // Pass limit to predictNext
  const predictNext = (B, A) => momentumPredict(B, A, direction, limit);

  // --- Rule 2: Check for skipped O7 input ---
  // If it's an O7 metric AND the latest historical value (from original history) is missing/null/undefined, return all zeros.
  const latestRawValue = history.length > 0 ? history[history.length - 1] : undefined;
  if (isO7Metric && (latestRawValue === null || latestRawValue === undefined)) {
      console.log(`Skipped O7 metric detected (latestRawValue: ${latestRawValue}). Returning zeros.`); // Optional log
      return { series: points, historyCount: 0 }; // Treat as no history
  }
  // --- END NEW RULE 2 ---

  // Apply the 3 Scenarios
  if (n === 0) {
    // Scenario 0: No valid data.
    return { series: points, historyCount: 0 };
  } else if (n === 1) {
    // Scenario 1: "latest + 5 predicted"
    points[0] = validHistory[0];
    // Apply limit capping to initial B calculation
    let initialB = initialBFormula(points[0], X);
    if (direction === 'increase') initialB = Math.min(initialB, limit);
    else initialB = Math.max(initialB, limit);
    points[1] = Math.max(0, initialB); // Ensure >= 0

    points[2] = predictNext(points[1], points[0]);
    points[3] = predictNext(points[2], points[1]);
    points[4] = predictNext(points[3], points[2]);
    points[5] = predictNext(points[4], points[3]);
    // Apply Math.max(0, p) just in case, though momentumPredict should handle it
    return { series: points.map(p => Math.round(Math.max(0, p) * 100) / 100), historyCount: 1 };
  } else if (n === 2) {
    // Scenario 2: "1 previous + 1 latest + 4 predicted"
    points[0] = validHistory[0];
    points[1] = validHistory[1];
    points[2] = predictNext(points[1], points[0]);
    points[3] = predictNext(points[2], points[1]);
    points[4] = predictNext(points[3], points[2]);
    points[5] = predictNext(points[4], points[3]);
    return { series: points.map(p => Math.round(Math.max(0, p) * 100) / 100), historyCount: 2 };
  } else {
    // Scenario 3 (n >= 3): "2 previous + 1 latest + 3 predicted"
    points[0] = validHistory[n - 3];
    points[1] = validHistory[n - 2];
    points[2] = validHistory[n - 1];
    points[3] = predictNext(points[2], points[1]);
    points[4] = predictNext(points[3], points[2]);
    points[5] = predictNext(points[4], points[3]);
    return { series: points.map(p => Math.round(Math.max(0, p) * 100) / 100), historyCount: 3 };
  }
};

// ---------------- DATE HELPERS ------------------

// format "Jan 24", "Jul 25", etc.
const formatDateLabel = (date) => {
  const d = new Date(date);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
};

// add N months to a date
const addMonths = (date, months) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
};

/**
 * Build date labels for actual + predicted points
 * historyArray → full history array (o2History, o7History etc)
 * historyCount → how many actual points appear in P1..P6
 */
const buildDateLabels = (historyArray, historyCount) => {
  const labels = new Array(6).fill("");
  if (!historyArray || historyArray.length === 0) return labels;

  // extract all dates
  const dates = historyArray
    .map(h => h.date || h.createdAt || h.updatedAt || h.timestamp || null)
    .filter(Boolean);

  if (dates.length === 0) return labels;

  const lastDate = new Date(dates[dates.length - 1]);

  // --- actual readings ---
  if (historyCount === 1) {
    labels[0] = formatDateLabel(dates[dates.length - 1]);
  } else if (historyCount === 2) {
    labels[0] = formatDateLabel(dates[dates.length - 2]);
    labels[1] = formatDateLabel(dates[dates.length - 1]);
  } else if (historyCount >= 3) {
    labels[0] = formatDateLabel(dates[dates.length - 3]);
    labels[1] = formatDateLabel(dates[dates.length - 2]);
    labels[2] = formatDateLabel(dates[dates.length - 1]);
  }

  // --- predicted readings (+2 months increments) ---
  let monthsToAdd = 2;
  for (let i = historyCount; i < 6; i++) {
    labels[i] = formatDateLabel(addMonths(lastDate, monthsToAdd));
    monthsToAdd += 2;
  }

  return labels;
};

// ---------------- END DATE HELPERS ------------------


// --- DATA FETCHING (Unchanged) ---
const fetchHistory = (onboarding, metricKey) => {
  let historyArray = [];

  // Helper: Treat both numbers and numeric strings as valid
  const allowNumericString = (val) => {
    if (val === null || val === undefined) return undefined;
    if (typeof val === 'number') return val;
    if (typeof val === 'string' && !isNaN(val.trim())) return val; // keep string
    return undefined; // invalid (non-numeric)
  };

  switch (metricKey) {

    case 'cuoreScore':
      historyArray = onboarding.scoreHistory || [];
      return historyArray.map(h => allowNumericString(h.data?.cuoreScore));

    case 'weight_kg':
      historyArray = onboarding.o2History || [];
      return historyArray.map(h => allowNumericString(h.data?.weight_kg));

    case 'bmi':
      historyArray = onboarding.o2History || [];
      return historyArray.map(h => allowNumericString(h.data?.bmi));

    case 'nutrition':
      historyArray = onboarding.o5History || [];
      return historyArray.map(h => allowNumericString(h.data?.foodScore));

    case 'fitness':
      historyArray = onboarding.o5History || [];
      return historyArray.map(h => allowNumericString(h.data?.exerciseScore));

    case 'sleep':
      historyArray = onboarding.o6History || [];
      return historyArray.map(h => allowNumericString(h.data?.sleepScore));

    case 'stress':
      historyArray = onboarding.o6History || [];
      return historyArray.map(h => allowNumericString(h.data?.stressScore));

    // --- All O7 metrics ---
    default:
      historyArray = onboarding.o7History || [];
      return historyArray.map(h => {
        const val = h.data ? h.data[metricKey] : undefined;
        return allowNumericString(val);
      });
  }
};

// --- RESPONSE FORMATTING (Unchanged) ---
const getLabels = () => ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'];
const splitData = (series, historyCount) => {
    let actualData = [], predictedData = [];
    if (historyCount === 0) { predictedData = series; }
    else if (historyCount === 1) { actualData = [series[0]]; predictedData = series.slice(1); }
    else if (historyCount === 2) { actualData = [series[0], series[1]]; predictedData = series.slice(2); }
    else { actualData = [series[0], series[1], series[2]]; predictedData = series.slice(3); }
    return { actualData, predictedData };
};
// UPDATED formatGraphData TO ALLOW CUSTOM LABELS
const formatGraphData = (title, datasets, labels) => ({
  title,
  data: {
    labels: labels || getLabels(), // fallback to P1..P6 if no labels given
    datasets
  }
});



// --- MAIN CONTROLLER ---
const getPredictionData = async (req, res) => {
  const { userId } = req.params;
  try {
    const onboarding = await Onboarding.findOne({ userId }).lean();
    if (!onboarding) {
      return res.status(404).json({ status: 'error', message: 'User onboarding data not found.' });
    }

    const cuoreScore = onboarding.scores?.cuoreScore || 0;
    let X;
    if (cuoreScore < 50) X = 0.9; else if (cuoreScore > 70) X = 0.3; else X = 0.6;

    // Formulas (Unchanged)
    const formulas = {
        cuoreScore: { initialB: (A, X) => A + (10 * X), direction: 'increase' },
        bpUpper:    { initialB: (A, X) => A - (4 * X),  direction: 'decrease' },
        bpLower:    { initialB: (A, X) => A - (2 * X),  direction: 'decrease' },
        heartRate:  { initialB: (A, X) => A - (2 * X),  direction: 'decrease' },
        bsFasting:  { initialB: (A, X) => A - (20 * X), direction: 'decrease' },
        bsAfterMeals:{ initialB: (A, X) => A - (20 * X), direction: 'decrease' },
        weight:     { initialB: (A, X) => A - (2 * X),  direction: 'decrease' },
        bmi:        { initialB: (A, X) => A - (1 * X),  direction: 'decrease' },
        hdl:        { initialB: (A, X) => A + (2 * X),  direction: 'increase' },
        ldl:        { initialB: (A, X) => A - (5 * X),  direction: 'decrease' },
        triglyceride:{ initialB: (A, X) => A - (5 * X),  direction: 'decrease' },
        nutrition:  { initialB: (A, X) => A + (5 * X),  direction: 'increase' },
        fitness:    { initialB: (A, X) => A + (5 * X),  direction: 'increase' },
        sleep:      { initialB: (A, X) => A + (5 * X),  direction: 'increase' },
        stress:     { initialB: (A, X) => A + (5 * X),  direction: 'increase' },
    };

    // --- Generate series (Pass isO7Metric flag and Limit) ---
    // Helper to avoid repetition
    const generateArgs = (key, dbKey, isO7 = false) => [
        fetchHistory(onboarding, dbKey || key), // Use specific DB key if provided
        X, formulas[key].initialB, formulas[key].direction, METRIC_LIMITS[key], isO7
    ];

    const { series: csSeries, historyCount: csHist } = generatePredictionSeries(...generateArgs('cuoreScore', 'cuoreScore')); // dbKey matches key
    const { series: bpUpperSeries, historyCount: bpUpperHist } = generatePredictionSeries(...generateArgs('bpUpper', 'bp_upper', true));
    const { series: bpLowerSeries, historyCount: bpLowerHist } = generatePredictionSeries(...generateArgs('bpLower', 'bp_lower', true));
    const { series: hrSeries, historyCount: hrHist } = generatePredictionSeries(...generateArgs('heartRate', 'pulse', true));
    const { series: bsFastingSeries, historyCount: bsFastingHist } = generatePredictionSeries(...generateArgs('bsFasting', 'bs_f', true));
    const { series: bsAfterMealsSeries, historyCount: bsAfterMealsHist } = generatePredictionSeries(...generateArgs('bsAfterMeals', 'bs_am', true));

    // A1C derived
    const a1cFormula = (sugar) => sugar > 0 ? (sugar + 46.7) / 28.7 : 0;
    // Apply limit to derived A1C values too
    const a1cSeries = bsFastingSeries.map(sugarVal => Math.round(Math.min(Math.max(0, a1cFormula(sugarVal)), METRIC_LIMITS.a1c) * 100) / 100);
    const a1cHist = bsFastingHist;

    const { series: weightSeries, historyCount: weightHist } = generatePredictionSeries(...generateArgs('weight', 'weight_kg'));
    const heightM = (onboarding.o2Data?.height_cm || 1) / 100;
    const bmiFormula = (weight) => heightM > 0 ? weight / (heightM * heightM) : 0;
    // Apply limit to derived BMI values
    const bmiSeries = weightSeries.map(weightVal => Math.round(Math.min(Math.max(0, bmiFormula(weightVal)), METRIC_LIMITS.bmi) * 100) / 100);
    const bmiHist = weightHist;
    // Apply limit to derived BodyFat values
    const bodyFatSeries = bmiSeries.map(b => Math.round(Math.min(Math.max(0, b * 0.8), METRIC_LIMITS.bodyFat) * 100) / 100); // Placeholder
    const bodyFatHist = bmiHist;

    const { series: hdlSeries, historyCount: hdlHist } = generatePredictionSeries(...generateArgs('hdl', 'HDL', true));
    const { series: ldlSeries, historyCount: ldlHist } = generatePredictionSeries(...generateArgs('ldl', 'LDL', true));
    const { series: trigSeries, historyCount: trigHist } = generatePredictionSeries(...generateArgs('triglyceride', 'Trig', true));

    const { series: nutritionSeries, historyCount: nutritionHist } = generatePredictionSeries(...generateArgs('nutrition', 'nutrition'));
const { series: fitnessSeries, historyCount: fitnessHist } = generatePredictionSeries(...generateArgs('fitness', 'fitness'));
const { series: sleepSeries, historyCount: sleepHist } = generatePredictionSeries(...generateArgs('sleep', 'sleep'));
const { series: stressSeries, historyCount: stressHist } = generatePredictionSeries(...generateArgs('stress', 'stress'));

    // --- Assemble final response (Added labels) ---
    // --- BUILD DATE LABELS FOR EACH CATEGORY ---
const o7HistoryRaw = onboarding.o7History || [];
const o2HistoryRaw = onboarding.o2History || [];
const scoreHistoryRaw = onboarding.scoreHistory || [];
const o5HistoryRaw = onboarding.o5History || [];

// date labels
const cuoreLabels   = buildDateLabels(scoreHistoryRaw, csHist);
const bpLabels      = buildDateLabels(o7HistoryRaw, bpUpperHist);
const bsLabels      = buildDateLabels(o7HistoryRaw, bsFastingHist);
const cholLabels    = buildDateLabels(o7HistoryRaw, hdlHist);
const weightLabels  = buildDateLabels(o2HistoryRaw, weightHist);
const lifestyleLabels = buildDateLabels(o5HistoryRaw, nutritionHist);

// --- Assemble final response WITH LABELS ---
const healthGraphs = [
  formatGraphData(
    'Cuore Score',
    [{ label: 'Cuore Score', ...splitData(csSeries, csHist), color: '#1E64AC', limit: METRIC_LIMITS.cuoreScore }],
    cuoreLabels
  ),
  formatGraphData(
    'Blood Pressure & Heart Rate',
    [
      { label: 'BP Upper', ...splitData(bpUpperSeries, bpUpperHist), color: '#ff4d4d', limit: METRIC_LIMITS.bpUpper },
      { label: 'BP Lower', ...splitData(bpLowerSeries, bpLowerHist), color: '#00b8a9', limit: METRIC_LIMITS.bpLower },
      { label: 'Heart Rate', ...splitData(hrSeries, hrHist), color: '#40c4ff', limit: METRIC_LIMITS.heartRate }
    ],
    bpLabels
  ),
  formatGraphData(
    'Blood Sugar',
    [
      { label: 'Fasting', ...splitData(bsFastingSeries, bsFastingHist), color: '#f39c12', limit: METRIC_LIMITS.bsFasting },
      { label: 'After Meal', ...splitData(bsAfterMealsSeries, bsAfterMealsHist), color: '#d35400', limit: METRIC_LIMITS.bsAfterMeals }
    ],
    bsLabels
  ),
  formatGraphData(
    'A1C',
    [{ label: 'A1C', ...splitData(a1cSeries, a1cHist), color: '#9b59b6', limit: METRIC_LIMITS.a1c }],
    bsLabels
  ),
  formatGraphData(
    'Weight',
    [{ label: 'Weight (kg)', ...splitData(weightSeries, weightHist), color: '#34495e', limit: METRIC_LIMITS.weight }],
    weightLabels
  ),
  formatGraphData(
    'BMI & Body Fat',
    [
      { label: 'BMI', ...splitData(bmiSeries, bmiHist), color: '#2ecc71', limit: METRIC_LIMITS.bmi },
      { label: 'Body Fat (%)', ...splitData(bodyFatSeries, bodyFatHist), color: '#ff0000', limit: METRIC_LIMITS.bodyFat }
    ],
    weightLabels
  ),
  formatGraphData(
    'Cholesterol',
    [
      { label: 'HDL', ...splitData(hdlSeries, hdlHist), color: '#3498db', limit: METRIC_LIMITS.hdl },
      { label: 'LDL', ...splitData(ldlSeries, ldlHist), color: '#e74c3c', limit: METRIC_LIMITS.ldl },
      { label: 'Triglycerides', ...splitData(trigSeries, trigHist), color: '#8C00FF', limit: METRIC_LIMITS.triglyceride }
    ],
    cholLabels
  ),
  formatGraphData(
    'Lifestyle Metrics',
    [
      { label: 'Nutrition', ...splitData(nutritionSeries, nutritionHist), color: '#f1c40f', limit: METRIC_LIMITS.nutrition },
      { label: 'Fitness', ...splitData(fitnessSeries, fitnessHist), color: '#2ecc71', limit: METRIC_LIMITS.fitness },
      { label: 'Sleep', ...splitData(sleepSeries, sleepHist), color: '#e74c3c', limit: METRIC_LIMITS.sleep },
      { label: 'Stress', ...splitData(stressSeries, stressHist), color: '#2980b9', limit: METRIC_LIMITS.stress }
    ],
    lifestyleLabels
  )
];


    res.status(200).json({ status: 'success', data: healthGraphs });
  } catch (err) {
    console.error('Error in getPredictionData:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

module.exports = { getPredictionData };