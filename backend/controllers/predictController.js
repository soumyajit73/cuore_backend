const { Onboarding } = require('../models/onboardingModel.js');

// --- METRIC LIMITS (Unchanged) ---
const METRIC_LIMITS = {
  cuoreScore: 90, bpUpper: 122, bpLower: 80, bsFasting: 100, bsAfterMeals: 140,
  a1c: 5.7, weight: 70, bmi: 22.9, bodyFat: 20, hdl: 60, ldl: 100,
  triglyceride: 150, nutrition: 90, fitness: 90, sleep: 90, stress: 90, heartRate: 80,
};

// --- PREDICTION LOGIC (Unchanged) ---
const momentumPredict = (B, A, direction, limit) => { 
  A = A || 0;
  B = B || 0;

  if (A === B) {
      if (direction === 'increase') return Math.min(B, limit); 
      else return Math.max(B, limit); 
  }

  let prediction;
  if (direction === 'increase') {
    prediction = B + ((B - A) * 0.8);
    prediction = Math.min(prediction, limit);
  } else {
    prediction = B - ((A - B) * 0.8);
    prediction = Math.max(prediction, limit);
  }

  return Math.max(0, prediction);
};

// --- generatePredictionSeries (UPDATED) ---
const generatePredictionSeries = (history, X, initialBFormula, direction, limit, isO7Metric = false, preferFullHistory = false) => {
  // Filter valid numbers
  const validHistory = history.filter(val => typeof val === 'number' && !isNaN(val));
  const n = validHistory.length;
  const predictNext = (B, A) => momentumPredict(B, A, direction, limit);

  // Check for skipped O7 input
  const latestRawValue = history.length > 0 ? history[history.length - 1] : undefined;
  if (isO7Metric && (latestRawValue === null || latestRawValue === undefined)) {
      return { series: new Array(6).fill(0), historyCount: 0 };
  }

  // --- NEW LOGIC: Full History + Predictions ---
  if (preferFullHistory) {
    if (n === 0) return { series: new Array(6).fill(0), historyCount: 0 };

    // 1. Determine History: Take up to 6 latest points
    const historyCount = Math.min(n, 6);
    const historyPoints = validHistory.slice(n - historyCount);

    // 2. Determine Predictions: Ensure at least 3 predictions, or fill to 6 total
    // If we have 6 history, we add 3 preds -> Total 9
    // If we have 1 history, we add 5 preds -> Total 6
    const predictionCount = Math.max(3, 6 - historyCount);
    
    const series = [...historyPoints];

    // Generate predictions extending from the last history point
    for (let i = 0; i < predictionCount; i++) {
        const currentIdx = series.length;
        let nextVal;
        
        if (currentIdx === 1) {
            // Special case: Only 1 history point exists, use initialBFormula
            let initialB = initialBFormula(series[0], X);
            if (direction === 'increase') initialB = Math.min(initialB, limit);
            else initialB = Math.max(initialB, limit);
            nextVal = Math.max(0, initialB);
        } else {
            // Standard momentum: Predict based on last 2 points
            nextVal = predictNext(series[currentIdx - 1], series[currentIdx - 2]);
        }
        
        series.push(Math.round(Math.max(0, nextVal) * 100) / 100);
    }

    return { series, historyCount };
  }

  // --- Standard Logic (Fixed 6 points, Max 3 History) ---
  const points = new Array(6).fill(0);
  
  if (n === 0) {
    return { series: points, historyCount: 0 };
  } else if (n === 1) {
    points[0] = validHistory[0];
    let initialB = initialBFormula(points[0], X);
    if (direction === 'increase') initialB = Math.min(initialB, limit);
    else initialB = Math.max(initialB, limit);
    points[1] = Math.max(0, initialB); 

    points[2] = predictNext(points[1], points[0]);
    points[3] = predictNext(points[2], points[1]);
    points[4] = predictNext(points[3], points[2]);
    points[5] = predictNext(points[4], points[3]);
    return { series: points.map(p => Math.round(Math.max(0, p) * 100) / 100), historyCount: 1 };
  } else if (n === 2) {
    points[0] = validHistory[0];
    points[1] = validHistory[1];
    points[2] = predictNext(points[1], points[0]);
    points[3] = predictNext(points[2], points[1]);
    points[4] = predictNext(points[3], points[2]);
    points[5] = predictNext(points[4], points[3]);
    return { series: points.map(p => Math.round(Math.max(0, p) * 100) / 100), historyCount: 2 };
  } else {
    points[0] = validHistory[n - 3];
    points[1] = validHistory[n - 2];
    points[2] = validHistory[n - 1];
    points[3] = predictNext(points[2], points[1]);
    points[4] = predictNext(points[3], points[2]);
    points[5] = predictNext(points[4], points[3]);
    return { series: points.map(p => Math.round(Math.max(0, p) * 100) / 100), historyCount: 3 };
  }
};

// ---------------- DATE HELPERS (UPDATED) ------------------

const formatDateLabel = (date) => {
  const d = new Date(date);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
};

const addMonths = (date, months) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
};

// Updated to handle dynamic series length (up to 9 points)
const buildDateLabels = (historyArray, historyCount, totalPoints) => {
  // Default to 6 if totalPoints not provided, but logic allows growth
  const finalLength = totalPoints || 6;
  const labels = new Array(finalLength).fill("");

  if (!historyArray || historyArray.length === 0) return labels;

  const dates = historyArray
    .map(h => h.date || h.createdAt || h.updatedAt || h.timestamp || null)
    .filter(Boolean);

  if (dates.length === 0) return labels;

  // 1. Actual Readings Labels
  for (let i = 0; i < historyCount; i++) {
    const dateIndex = dates.length - historyCount + i;
    if (dateIndex >= 0) {
        labels[i] = formatDateLabel(dates[dateIndex]);
    }
  }

  // 2. Predicted Readings Labels (+2 months increments)
  const lastDate = new Date(dates[dates.length - 1]);
  let monthsToAdd = 2;
  
  for (let i = historyCount; i < finalLength; i++) {
    labels[i] = formatDateLabel(addMonths(lastDate, monthsToAdd));
    monthsToAdd += 2;
  }

  return labels;
};

// ---------------- END DATE HELPERS ------------------


// --- DATA FETCHING (Unchanged) ---
const fetchHistory = (onboarding, metricKey) => {
  let historyArray = [];

 const allowNumericString = (val) => {
  if (val === null || val === undefined) return undefined;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const num = parseFloat(val.trim());
    if (!isNaN(num)) return num;
  }
  return undefined;
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
    default:
      historyArray = onboarding.o7History || [];
      return historyArray.map(h => {
        const val = h.data ? h.data[metricKey] : undefined;
        return allowNumericString(val);
      });
  }
};

// --- RESPONSE FORMATTING (UPDATED) ---
const getLabels = () => ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'];

const splitData = (series, historyCount) => {
    const actualData = series.slice(0, historyCount);
    const predictedData = series.slice(historyCount);
    return { actualData, predictedData };
};

const formatGraphData = (title, datasets, labels) => ({
  title,
  data: {
    // Fallback to getLabels() only if labels is missing, but labels usually provided now
    labels: labels || getLabels(),
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

    // --- Generate series ---
    const generateArgs = (key, dbKey, isO7 = false, preferFullHistory = false) => [
        fetchHistory(onboarding, dbKey || key), 
        X, formulas[key].initialB, formulas[key].direction, METRIC_LIMITS[key], isO7, preferFullHistory
    ];

    // 1. Scores & Weight (Standard logic)
    const { series: csSeries, historyCount: csHist } = generatePredictionSeries(...generateArgs('cuoreScore', 'cuoreScore'));
    const { series: weightSeries, historyCount: weightHist } = generatePredictionSeries(...generateArgs('weight', 'weight_kg'));
    
    // 2. O7 Metrics - Pass true for preferFullHistory
    // These will now return arrays of length > 6 if enough history exists (e.g. 6 hist + 3 pred = 9)
    const { series: bpUpperSeries, historyCount: bpUpperHist } = generatePredictionSeries(...generateArgs('bpUpper', 'bp_upper', true, true));
    const { series: bpLowerSeries, historyCount: bpLowerHist } = generatePredictionSeries(...generateArgs('bpLower', 'bp_lower', true, true));
    const { series: hrSeries, historyCount: hrHist } = generatePredictionSeries(...generateArgs('heartRate', 'pulse', true, true));
    
    const { series: bsFastingSeries, historyCount: bsFastingHist } = generatePredictionSeries(...generateArgs('bsFasting', 'bs_f', true, true));
    const { series: bsAfterMealsSeries, historyCount: bsAfterMealsHist } = generatePredictionSeries(...generateArgs('bsAfterMeals', 'bs_am', true, true));

    // 3. Derived Metrics (A1C, BMI, BodyFat)
    // A1C (Derived from Fasting Sugar - so it inherits the 9-point structure)
    const a1cFormula = (sugar) => sugar > 0 ? (sugar + 46.7) / 28.7 : 0;
    const a1cSeries = bsFastingSeries.map(sugarVal => Math.round(Math.min(Math.max(0, a1cFormula(sugarVal)), METRIC_LIMITS.a1c) * 100) / 100);
    const a1cHist = bsFastingHist; 

    // BMI & BodyFat (Inherits from Weight - Standard logic)
    const heightM = (onboarding.o2Data?.height_cm || 1) / 100;
    const bmiFormula = (weight) => heightM > 0 ? weight / (heightM * heightM) : 0;
    const bmiSeries = weightSeries.map(weightVal => Math.round(Math.min(Math.max(0, bmiFormula(weightVal)), METRIC_LIMITS.bmi) * 100) / 100);
    const bmiHist = weightHist; 
    
    const bodyFatSeries = bmiSeries.map(b => Math.round(Math.min(Math.max(0, b * 0.8), METRIC_LIMITS.bodyFat) * 100) / 100);
    const bodyFatHist = bmiHist;

    // 4. Cholesterol (Standard logic)
    const { series: hdlSeries, historyCount: hdlHist } = generatePredictionSeries(...generateArgs('hdl', 'HDL', true));
    const { series: ldlSeries, historyCount: ldlHist } = generatePredictionSeries(...generateArgs('ldl', 'LDL', true));
    const { series: trigSeries, historyCount: trigHist } = generatePredictionSeries(...generateArgs('triglyceride', 'Trig', true));

    // 5. Lifestyle (Standard logic)
    const { series: nutritionSeries, historyCount: nutritionHist } = generatePredictionSeries(...generateArgs('nutrition', 'nutrition'));
    const { series: fitnessSeries, historyCount: fitnessHist } = generatePredictionSeries(...generateArgs('fitness', 'fitness'));
    const { series: sleepSeries, historyCount: sleepHist } = generatePredictionSeries(...generateArgs('sleep', 'sleep'));
    const { series: stressSeries, historyCount: stressHist } = generatePredictionSeries(...generateArgs('stress', 'stress'));

    // --- Assemble final response ---
    // --- BUILD DATE LABELS ---
    const o7HistoryRaw = onboarding.o7History || [];
    const o2HistoryRaw = onboarding.o2History || [];
    const scoreHistoryRaw = onboarding.scoreHistory || [];
    const o5HistoryRaw = onboarding.o5History || [];

    // NOTE: We pass the TOTAL series length to buildDateLabels now
    const cuoreLabels   = buildDateLabels(scoreHistoryRaw, csHist, csSeries.length);
    const bpLabels      = buildDateLabels(o7HistoryRaw, bpUpperHist, bpUpperSeries.length); // e.g., 9 labels
    const bsLabels      = buildDateLabels(o7HistoryRaw, bsFastingHist, bsFastingSeries.length); // e.g., 9 labels
    const cholLabels    = buildDateLabels(o7HistoryRaw, hdlHist, hdlSeries.length);
    const weightLabels  = buildDateLabels(o2HistoryRaw, weightHist, weightSeries.length);
    const lifestyleLabels = buildDateLabels(o5HistoryRaw, nutritionHist, nutritionSeries.length);

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