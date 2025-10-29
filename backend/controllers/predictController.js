const { Onboarding } = require('../models/onboardingModel.js');

// --- METRIC LIMITS (Now used in calculation) ---
const METRIC_LIMITS = {
  cuoreScore: 90, bpUpper: 122, bpLower: 80, bsFasting: 100, bsAfterMeals: 140,
  a1c: 5.7, weight: 70, bmi: 22.9, bodyFat: 20, hdl: 60, ldl: 100,
  triglyceride: 150, nutrition: 90, fitness: 90, sleep: 90, stress: 90, heartRate: 80,
};

// --- PREDICTION LOGIC (Limit Capping Added) ---
/**
 * Applies 80% momentum, capped by lower (0) and upper/goal limits.
 * @param {number} B - Latest point
 * @param {number} A - Previous point
 * @param {string} direction - 'increase' (goal is higher) or 'decrease' (goal is lower)
 * @param {number} limit - The target goal for this metric
 * @returns {number} The next predicted point, capped by limits
 */
const momentumPredict = (B, A, direction, limit) => {
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
    // --- NEW: Cap prediction at the upper limit ---
    prediction = Math.min(prediction, limit);
  } else {
    prediction = B - ((A - B) * 0.8);
    // --- NEW: Cap prediction at the lower limit ---
    prediction = Math.max(prediction, limit);
  }

  // Ensure prediction is never below 0 (absolute floor)
  return Math.max(0, prediction);
};

// generatePredictionSeries (Passes Limit, Applies Limit to Initial B)
const generatePredictionSeries = (history, X, initialBFormula, direction, limit, isO7Metric = false) => {
  const points = new Array(6).fill(0);
  const validHistory = history.filter(val => typeof val === 'number' && !isNaN(val));
  const n = validHistory.length;
  // --- MODIFIED: Pass limit to predictNext ---
  const predictNext = (B, A) => momentumPredict(B, A, direction, limit);

  // Rule 2: Check for skipped O7 input (Unchanged)
  const latestRawValue = history.length > 0 ? history[history.length - 1] : undefined;
  if (isO7Metric && (latestRawValue === null || latestRawValue === undefined)) {
      return { series: points, historyCount: 0 };
  }

  // Apply the 3 Scenarios
  if (n === 0) {
    return { series: points, historyCount: 0 };
  } else if (n === 1) {
    points[0] = validHistory[0];
    // --- MODIFIED: Apply limit capping to initial B calculation ---
    let initialB = initialBFormula(points[0], X);
    if (direction === 'increase') initialB = Math.min(initialB, limit);
    else initialB = Math.max(initialB, limit);
    points[1] = Math.max(0, initialB); // Ensure >= 0
    // --- END MODIFIED ---
    points[2] = predictNext(points[1], points[0]);
    points[3] = predictNext(points[2], points[1]);
    points[4] = predictNext(points[3], points[2]);
    points[5] = predictNext(points[4], points[3]);
    // Final check for >= 0 (already handled in momentumPredict now)
    return { series: points.map(p => Math.round(p * 100) / 100), historyCount: 1 };
  } else if (n === 2) {
    points[0] = validHistory[0];
    points[1] = validHistory[1];
    points[2] = predictNext(points[1], points[0]);
    points[3] = predictNext(points[2], points[1]);
    points[4] = predictNext(points[3], points[2]);
    points[5] = predictNext(points[4], points[3]);
    return { series: points.map(p => Math.round(p * 100) / 100), historyCount: 2 };
  } else {
    points[0] = validHistory[n - 3];
    points[1] = validHistory[n - 2];
    points[2] = validHistory[n - 1];
    points[3] = predictNext(points[2], points[1]);
    points[4] = predictNext(points[3], points[2]);
    points[5] = predictNext(points[4], points[3]);
    return { series: points.map(p => Math.round(p * 100) / 100), historyCount: 3 };
  }
};


// --- DATA FETCHING (Unchanged) ---
const fetchHistory = (onboarding, metricKey) => {
    // ... (same as before)
    let historyArray = [];
    switch (metricKey) {
        case 'cuoreScore': historyArray = onboarding.scoreHistory || []; return historyArray.map(h => h.data?.cuoreScore);
        case 'weight_kg': historyArray = onboarding.o2History || []; return historyArray.map(h => h.data?.weight_kg);
        case 'bmi': historyArray = onboarding.o2History || []; return historyArray.map(h => h.data?.bmi);
        case 'o5Score': historyArray = onboarding.o5History || []; return historyArray.map(h => h.data?.o5Score);
        case 'o6Score': historyArray = onboarding.o6History || []; return historyArray.map(h => h.data?.o6Score);
        default: historyArray = onboarding.o7History || []; return historyArray.map(h => h.data ? h.data[metricKey] : undefined);
    }
};

// --- RESPONSE FORMATTING (Unchanged) ---
const getLabels = () => ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'];
const splitData = (series, historyCount) => { /* ... same ... */
    let actualData = [], predictedData = [];
    if (historyCount === 0) { predictedData = series; }
    else if (historyCount === 1) { actualData = [series[0]]; predictedData = series.slice(1); }
    else if (historyCount === 2) { actualData = [series[0], series[1]]; predictedData = series.slice(2); }
    else { actualData = [series[0], series[1], series[2]]; predictedData = series.slice(3); }
    return { actualData, predictedData };
};
const formatGraphData = (title, datasets) => ({ title: title, data: { labels: getLabels(), datasets: datasets } });


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
    const formulas = { /* ... same ... */
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

    // --- Generate series (Pass Limit from METRIC_LIMITS) ---
    const generateArgs = (key, isO7 = false) => [
        fetchHistory(onboarding, key === 'heartRate' ? 'pulse' : key === 'triglyceride' ? 'Trig' : key), // Use correct DB keys
        X, formulas[key].initialB, formulas[key].direction, METRIC_LIMITS[key], isO7
    ];

    const { series: csSeries, historyCount: csHist } = generatePredictionSeries(...generateArgs('cuoreScore'));
    const { series: bpUpperSeries, historyCount: bpUpperHist } = generatePredictionSeries(...generateArgs('bpUpper', true));
    const { series: bpLowerSeries, historyCount: bpLowerHist } = generatePredictionSeries(...generateArgs('bpLower', true));
    const { series: hrSeries, historyCount: hrHist } = generatePredictionSeries(...generateArgs('heartRate', true)); // 'pulse' handled in generateArgs
    const { series: bsFastingSeries, historyCount: bsFastingHist } = generatePredictionSeries(...generateArgs('bsFasting', true)); // DB key is 'bs_f'
    const { series: bsAfterMealsSeries, historyCount: bsAfterMealsHist } = generatePredictionSeries(...generateArgs('bsAfterMeals', true)); // DB key is 'bs_am'

    // A1C derived (Apply limit capping here too)
    const a1cFormula = (sugar) => sugar > 0 ? (sugar + 46.7) / 28.7 : 0;
    const a1cSeries = bsFastingSeries.map(sugarVal => Math.round(Math.min(Math.max(0, a1cFormula(sugarVal)), METRIC_LIMITS.a1c * 1.5) * 100) / 100); // Allow slight overshoot for A1C calc? Cap at limit or slightly above
    const a1cHist = bsFastingHist;

    const { series: weightSeries, historyCount: weightHist } = generatePredictionSeries(...generateArgs('weight', false)); // DB key 'weight_kg'
    const heightM = (onboarding.o2Data?.height_cm || 1) / 100;
    const bmiFormula = (weight) => heightM > 0 ? weight / (heightM * heightM) : 0;
    const bmiSeries = weightSeries.map(weightVal => Math.round(Math.max(0, bmiFormula(weightVal)) * 100) / 100);
    const bmiHist = weightHist;
    const bodyFatSeries = bmiSeries.map(b => Math.round(Math.max(0, b * 0.8) * 100) / 100); // Placeholder
    const bodyFatHist = bmiHist;

    const { series: hdlSeries, historyCount: hdlHist } = generatePredictionSeries(...generateArgs('hdl', true)); // DB key 'HDL'
    const { series: ldlSeries, historyCount: ldlHist } = generatePredictionSeries(...generateArgs('ldl', true)); // DB key 'LDL'
    const { series: trigSeries, historyCount: trigHist } = generatePredictionSeries(...generateArgs('triglyceride', true)); // DB key 'Trig'

    const { series: nutritionSeries, historyCount: nutritionHist } = generatePredictionSeries(...generateArgs('nutrition', false)); // Uses 'o5Score'
    const { series: fitnessSeries, historyCount: fitnessHist } = generatePredictionSeries(...generateArgs('fitness', false)); // Uses 'o5Score'
    const { series: sleepSeries, historyCount: sleepHist } = generatePredictionSeries(...generateArgs('sleep', false)); // Uses 'o6Score'
    const { series: stressSeries, historyCount: stressHist } = generatePredictionSeries(...generateArgs('stress', false)); // Uses 'o6Score'


    // --- Assemble final response (Added labels) ---
    const healthGraphs = [
        formatGraphData('Cuore Score', [{ label: 'Cuore Score', ...splitData(csSeries, csHist), color: '#1E64AC', limit: METRIC_LIMITS.cuoreScore }]),
        formatGraphData('Blood Pressure & Heart Rate', [
            { label: 'BP Upper', ...splitData(bpUpperSeries, bpUpperHist), color: '#ff4d4d', limit: METRIC_LIMITS.bpUpper },
            { label: 'BP Lower', ...splitData(bpLowerSeries, bpLowerHist), color: '#00b8a9', limit: METRIC_LIMITS.bpLower },
            { label: 'Heart Rate', ...splitData(hrSeries, hrHist), color: '#40c4ff', limit: METRIC_LIMITS.heartRate }
        ]),
        formatGraphData('Blood Sugar', [
            { label: 'Fasting', ...splitData(bsFastingSeries, bsFastingHist), color: '#f39c12', limit: METRIC_LIMITS.bsFasting },
            { label: 'After Meal', ...splitData(bsAfterMealsSeries, bsAfterMealsHist), color: '#d35400', limit: METRIC_LIMITS.bsAfterMeals }
        ]),
        formatGraphData('A1C', [{ label: 'A1C', ...splitData(a1cSeries, a1cHist), color: '#9b59b6', limit: METRIC_LIMITS.a1c }]),
        formatGraphData('Weight', [{ label: 'Weight (kg)', ...splitData(weightSeries, weightHist), color: '#34495e', limit: METRIC_LIMITS.weight }]),
        formatGraphData('BMI & Body Fat', [
            { label: 'BMI', ...splitData(bmiSeries, bmiHist), color: '#2ecc71', limit: METRIC_LIMITS.bmi },
            { label: 'Body Fat (%)', ...splitData(bodyFatSeries, bodyFatHist), color: '#1abc9c', limit: METRIC_LIMITS.bodyFat }
        ]),
        formatGraphData('Cholesterol', [
            { label: 'HDL', ...splitData(hdlSeries, hdlHist), color: '#3498db', limit: METRIC_LIMITS.hdl },
            { label: 'LDL', ...splitData(ldlSeries, ldlHist), color: '#e74c3c', limit: METRIC_LIMITS.ldl },
            { label: 'Triglycerides', ...splitData(trigSeries, trigHist), color: '#e67e22', limit: METRIC_LIMITS.triglyceride }
        ]),
        formatGraphData('Lifestyle Metrics', [
            { label: 'Nutrition', ...splitData(nutritionSeries, nutritionHist), color: '#f1c40f', limit: METRIC_LIMITS.nutrition },
            { label: 'Fitness', ...splitData(fitnessSeries, fitnessHist), color: '#2ecc71', limit: METRIC_LIMITS.fitness },
            { label: 'Sleep', ...splitData(sleepSeries, sleepHist), color: '#e74c3c', limit: METRIC_LIMITS.sleep },
            { label: 'Stress', ...splitData(stressSeries, stressHist), color: '#2980b9', limit: METRIC_LIMITS.stress }
        ])
    ];

    res.status(200).json({ status: 'success', data: healthGraphs });
  } catch (err) {
    console.error('Error in getPredictionData:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

module.exports = { getPredictionData };

