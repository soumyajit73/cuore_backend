const { Onboarding } = require('../models/onboardingModel.js');

// --- METRIC LIMITS (Unchanged) ---
const METRIC_LIMITS = {
  cuoreScore: 90, bpUpper: 122, bpLower: 80, bsFasting: 100, bsAfterMeals: 140,
  a1c: 5.7, weight: 70, bmi: 22.9, bodyFat: 20, hdl: 60, ldl: 100,
  triglyceride: 150, nutrition: 90, fitness: 90, sleep: 90, stress: 90, heartRate: 80,
};

// --- PREDICTION LOGIC (Rule 1 Added) ---
const momentumPredict = (B, A, direction) => {
  A = A || 0;
  B = B || 0;

  if (A === B) {
    return B; // Continue flat trend
  }

  let prediction;
  if (direction === 'increase') {
    prediction = B + ((B - A) * 0.8);
  } else {
    prediction = B - ((A - B) * 0.8);
  }

  // --- NEW: Rule 1 - Ensure prediction is never below 0 ---
  return Math.max(0, prediction);
  // --- END NEW RULE 1 ---
};

// generatePredictionSeries (Rule 2 Added)
const generatePredictionSeries = (history, X, initialBFormula, direction, isO7Metric = false) => {
  const points = new Array(6).fill(0);
  const validHistory = history.filter(val => typeof val === 'number' && !isNaN(val));
  const n = validHistory.length;
  const predictNext = (B, A) => momentumPredict(B, A, direction); // Uses the updated momentumPredict

  // --- NEW: Rule 2 - Check for skipped O7 input ---
  // If it's an O7 metric AND the latest historical value is missing/null/undefined, return all zeros.
  // We check the *original* history array, not just validHistory.
  const latestRawValue = history.length > 0 ? history[history.length - 1] : undefined;
  if (isO7Metric && (latestRawValue === null || latestRawValue === undefined)) {
      console.log(`Skipped O7 metric detected. Returning zeros.`); // Optional log
      return { series: points, historyCount: 0 }; // Treat as no history
  }
  // --- END NEW RULE 2 ---


  // Apply the 3 Scenarios (Logic unchanged, but uses updated predictNext)
  if (n === 0) {
    // Scenario 0: No valid data.
    return { series: points, historyCount: 0 };
  } else if (n === 1) {
    // Scenario 1: "latest + 5 predicted"
    points[0] = validHistory[0];
    points[1] = initialBFormula(points[0], X);
    points[2] = predictNext(points[1], points[0]);
    points[3] = predictNext(points[2], points[1]);
    points[4] = predictNext(points[3], points[2]);
    points[5] = predictNext(points[4], points[3]);
    // Ensure all points are >= 0 after final calculation
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


// --- DATA FETCHING (Unchanged) ---
const fetchHistory = (onboarding, metricKey) => {
    let historyArray = [];
    switch (metricKey) {
        case 'cuoreScore':
            historyArray = onboarding.scoreHistory || [];
            // Return raw values, filtering happens in generatePredictionSeries
            return historyArray.map(h => h.data?.cuoreScore);
        case 'weight_kg':
            historyArray = onboarding.o2History || [];
            return historyArray.map(h => h.data?.weight_kg);
        case 'bmi':
            historyArray = onboarding.o2History || [];
            return historyArray.map(h => h.data?.bmi);
        case 'o5Score':
            historyArray = onboarding.o5History || [];
            return historyArray.map(h => h.data?.o5Score);
        case 'o6Score':
            historyArray = onboarding.o6History || [];
            return historyArray.map(h => h.data?.o6Score);
        default: // o7 keys
            historyArray = onboarding.o7History || [];
            // Return raw values including null/undefined for skipped inputs
            return historyArray.map(h => h.data ? h.data[metricKey] : undefined);
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

    // --- Generate series (Pass isO7Metric flag) ---
    // Note: Set the last argument to 'true' for all O7 metrics

    // Graph 1: Cuore Score (Not O7)
    const { series: csSeries, historyCount: csHist } = generatePredictionSeries(fetchHistory(onboarding, 'cuoreScore'), X, formulas.cuoreScore.initialB, formulas.cuoreScore.direction, false);

    // Graph 2: BP & HR (All O7)
    const { series: bpUpperSeries, historyCount: bpUpperHist } = generatePredictionSeries(fetchHistory(onboarding, 'bp_upper'), X, formulas.bpUpper.initialB, formulas.bpUpper.direction, true);
    const { series: bpLowerSeries, historyCount: bpLowerHist } = generatePredictionSeries(fetchHistory(onboarding, 'bp_lower'), X, formulas.bpLower.initialB, formulas.bpLower.direction, true);
    const { series: hrSeries, historyCount: hrHist } = generatePredictionSeries(fetchHistory(onboarding, 'pulse'), X, formulas.heartRate.initialB, formulas.heartRate.direction, true);

    // Graph 3 & 4: Blood Sugar & A1C (O7 drivers)
    const { series: bsFastingSeries, historyCount: bsFastingHist } = generatePredictionSeries(fetchHistory(onboarding, 'bs_f'), X, formulas.bsFasting.initialB, formulas.bsFasting.direction, true);
    const { series: bsAfterMealsSeries, historyCount: bsAfterMealsHist } = generatePredictionSeries(fetchHistory(onboarding, 'bs_am'), X, formulas.bsAfterMeals.initialB, formulas.bsAfterMeals.direction, true);
    const a1cFormula = (sugar) => sugar > 0 ? (sugar + 46.7) / 28.7 : 0;
    const a1cSeries = bsFastingSeries.map(sugarVal => Math.round(Math.max(0, a1cFormula(sugarVal)) * 100) / 100); // Ensure A1C >= 0
    const a1cHist = bsFastingHist; // History count matches its driver

    // Graph 5 & 6: Weight & BMI (Not O7)
    const { series: weightSeries, historyCount: weightHist } = generatePredictionSeries(fetchHistory(onboarding, 'weight_kg'), X, formulas.weight.initialB, formulas.weight.direction, false);
    const heightM = (onboarding.o2Data?.height_cm || 1) / 100;
    const bmiFormula = (weight) => heightM > 0 ? weight / (heightM * heightM) : 0;
    const bmiSeries = weightSeries.map(weightVal => Math.round(Math.max(0, bmiFormula(weightVal)) * 100) / 100); // Ensure BMI >= 0
    const bmiHist = weightHist;
    const bodyFatSeries = bmiSeries.map(b => Math.round(Math.max(0, b * 0.8) * 100) / 100); // Placeholder, ensure >= 0
    const bodyFatHist = bmiHist;

    // Graph 7: Cholesterol (All O7)
    const { series: hdlSeries, historyCount: hdlHist } = generatePredictionSeries(fetchHistory(onboarding, 'HDL'), X, formulas.hdl.initialB, formulas.hdl.direction, true);
    const { series: ldlSeries, historyCount: ldlHist } = generatePredictionSeries(fetchHistory(onboarding, 'LDL'), X, formulas.ldl.initialB, formulas.ldl.direction, true);
    const { series: trigSeries, historyCount: trigHist } = generatePredictionSeries(fetchHistory(onboarding, 'Trig'), X, formulas.triglyceride.initialB, formulas.triglyceride.direction, true);

    // Graph 8: Lifestyle (Not O7)
    const { series: nutritionSeries, historyCount: nutritionHist } = generatePredictionSeries(fetchHistory(onboarding, 'o5Score'), X, formulas.nutrition.initialB, formulas.nutrition.direction, false);
    const { series: fitnessSeries, historyCount: fitnessHist } = generatePredictionSeries(fetchHistory(onboarding, 'o5Score'), X, formulas.fitness.initialB, formulas.fitness.direction, false);
    const { series: sleepSeries, historyCount: sleepHist } = generatePredictionSeries(fetchHistory(onboarding, 'o6Score'), X, formulas.sleep.initialB, formulas.sleep.direction, false);
    const { series: stressSeries, historyCount: stressHist } = generatePredictionSeries(fetchHistory(onboarding, 'o6Score'), X, formulas.stress.initialB, formulas.stress.direction, false);


    // --- Assemble final response (Unchanged structure, but uses updated series) ---
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

