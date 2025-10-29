const { Onboarding } = require('../models/onboardingModel.js');

// --- METRIC LIMITS (Unchanged) ---
const METRIC_LIMITS = {
  cuoreScore: 90, bpUpper: 122, bpLower: 80, bsFasting: 100, bsAfterMeals: 140,
  a1c: 5.7, weight: 70, bmi: 22.9, bodyFat: 20, hdl: 60, ldl: 100,
  triglyceride: 150, nutrition: 90, fitness: 90, sleep: 90, stress: 90, heartRate: 80,
};

// --- PREDICTION LOGIC (Unchanged) ---
const momentumPredict = (B, A, direction) => {
  A = A || 0;
  B = B || 0;
  if (A === B) {
    return B; // Continue flat trend if no change
  }
  if (direction === 'increase') {
    return B + ((B - A) * 0.8);
  } else {
    return B - ((A - B) * 0.8);
  }
};

const generatePredictionSeries = (history, X, initialBFormula, direction) => {
  const points = new Array(6).fill(0);
  const validHistory = history.filter(val => typeof val === 'number' && !isNaN(val));
  const n = validHistory.length;
  const predictNext = (B, A) => momentumPredict(B, A, direction);

  if (n === 0) {
    return { series: points, historyCount: 0 };
  } else if (n === 1) {
    points[0] = validHistory[0];
    points[1] = initialBFormula(points[0], X);
    points[2] = predictNext(points[1], points[0]);
    points[3] = predictNext(points[2], points[1]);
    points[4] = predictNext(points[3], points[2]);
    points[5] = predictNext(points[4], points[3]);
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
    let historyArray = [];
    switch (metricKey) {
        case 'cuoreScore':
            historyArray = onboarding.scoreHistory || [];
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
            return historyArray.map(h => h.data ? h.data[metricKey] : undefined);
    }
};

// --- RESPONSE FORMATTING (Unchanged helpers) ---
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

    // --- Generate 6-point series for all metrics (Unchanged) ---
    const { series: csSeries, historyCount: csHist } = generatePredictionSeries(fetchHistory(onboarding, 'cuoreScore'), X, formulas.cuoreScore.initialB, formulas.cuoreScore.direction);
    const { series: bpUpperSeries, historyCount: bpUpperHist } = generatePredictionSeries(fetchHistory(onboarding, 'bp_upper'), X, formulas.bpUpper.initialB, formulas.bpUpper.direction);
    const { series: bpLowerSeries, historyCount: bpLowerHist } = generatePredictionSeries(fetchHistory(onboarding, 'bp_lower'), X, formulas.bpLower.initialB, formulas.bpLower.direction);
    const { series: hrSeries, historyCount: hrHist } = generatePredictionSeries(fetchHistory(onboarding, 'pulse'), X, formulas.heartRate.initialB, formulas.heartRate.direction);
    const { series: bsFastingSeries, historyCount: bsFastingHist } = generatePredictionSeries(fetchHistory(onboarding, 'bs_f'), X, formulas.bsFasting.initialB, formulas.bsFasting.direction);
    const { series: bsAfterMealsSeries, historyCount: bsAfterMealsHist } = generatePredictionSeries(fetchHistory(onboarding, 'bs_am'), X, formulas.bsAfterMeals.initialB, formulas.bsAfterMeals.direction);
    const a1cFormula = (sugar) => sugar > 0 ? (sugar + 46.7) / 28.7 : 0;
    const a1cSeries = bsFastingSeries.map(sugarVal => Math.round(a1cFormula(sugarVal) * 100) / 100);
    const a1cHist = bsFastingHist;
    const { series: weightSeries, historyCount: weightHist } = generatePredictionSeries(fetchHistory(onboarding, 'weight_kg'), X, formulas.weight.initialB, formulas.weight.direction);
    const heightM = (onboarding.o2Data?.height_cm || 1) / 100;
    const bmiFormula = (weight) => heightM > 0 ? weight / (heightM * heightM) : 0;
    const bmiSeries = weightSeries.map(weightVal => Math.round(bmiFormula(weightVal) * 100) / 100);
    const bmiHist = weightHist;
    const bodyFatSeries = bmiSeries.map(b => Math.round((b * 0.8) * 100) / 100); // Placeholder
    const bodyFatHist = bmiHist;
    const { series: hdlSeries, historyCount: hdlHist } = generatePredictionSeries(fetchHistory(onboarding, 'HDL'), X, formulas.hdl.initialB, formulas.hdl.direction);
    const { series: ldlSeries, historyCount: ldlHist } = generatePredictionSeries(fetchHistory(onboarding, 'LDL'), X, formulas.ldl.initialB, formulas.ldl.direction);
    const { series: trigSeries, historyCount: trigHist } = generatePredictionSeries(fetchHistory(onboarding, 'Trig'), X, formulas.triglyceride.initialB, formulas.triglyceride.direction);
    const { series: nutritionSeries, historyCount: nutritionHist } = generatePredictionSeries(fetchHistory(onboarding, 'o5Score'), X, formulas.nutrition.initialB, formulas.nutrition.direction);
    const { series: fitnessSeries, historyCount: fitnessHist } = generatePredictionSeries(fetchHistory(onboarding, 'o5Score'), X, formulas.fitness.initialB, formulas.fitness.direction);
    const { series: sleepSeries, historyCount: sleepHist } = generatePredictionSeries(fetchHistory(onboarding, 'o6Score'), X, formulas.sleep.initialB, formulas.sleep.direction);
    const { series: stressSeries, historyCount: stressHist } = generatePredictionSeries(fetchHistory(onboarding, 'o6Score'), X, formulas.stress.initialB, formulas.stress.direction);

    // --- NEW: Assemble the final response with LABELS ---
    const healthGraphs = [
      formatGraphData('Cuore Score', [
        { label: 'Cuore Score', ...splitData(csSeries, csHist), color: '#1E64AC', limit: METRIC_LIMITS.cuoreScore }
      ]),
      formatGraphData('Blood Pressure & Heart Rate', [
        { label: 'BP Upper', ...splitData(bpUpperSeries, bpUpperHist), color: '#ff4d4d', limit: METRIC_LIMITS.bpUpper },
        { label: 'BP Lower', ...splitData(bpLowerSeries, bpLowerHist), color: '#00b8a9', limit: METRIC_LIMITS.bpLower },
        { label: 'Heart Rate', ...splitData(hrSeries, hrHist), color: '#40c4ff', limit: METRIC_LIMITS.heartRate }
      ]),
      formatGraphData('Blood Sugar', [
        { label: 'Fasting', ...splitData(bsFastingSeries, bsFastingHist), color: '#f39c12', limit: METRIC_LIMITS.bsFasting },
        { label: 'After Meal', ...splitData(bsAfterMealsSeries, bsAfterMealsHist), color: '#d35400', limit: METRIC_LIMITS.bsAfterMeals }
      ]),
      formatGraphData('A1C', [
        { label: 'A1C', ...splitData(a1cSeries, a1cHist), color: '#9b59b6', limit: METRIC_LIMITS.a1c }
      ]),
      formatGraphData('Weight', [
        { label: 'Weight (kg)', ...splitData(weightSeries, weightHist), color: '#34495e', limit: METRIC_LIMITS.weight }
      ]),
      formatGraphData('BMI & Body Fat', [
        { label: 'BMI', ...splitData(bmiSeries, bmiHist), color: '#2ecc71', limit: METRIC_LIMITS.bmi },
        { label: 'Body Fat (%)', ...splitData(bodyFatSeries, bodyFatHist), color: '#1abc9c', limit: METRIC_LIMITS.bodyFat } // Using placeholder data
      ]),
      formatGraphData('Cholesterol', [
        { label: 'HDL', ...splitData(hdlSeries, hdlHist), color: '#3498db', limit: METRIC_LIMITS.hdl },
        { label: 'LDL', ...splitData(ldlSeries, ldlHist), color: '#e74c3c', limit: METRIC_LIMITS.ldl },
        { label: 'Triglycerides', ...splitData(trigSeries, trigHist), color: '#e67e22', limit: METRIC_LIMITS.triglyceride }
      ]),
      formatGraphData('Lifestyle Metrics', [
        { label: 'Nutrition', ...splitData(nutritionSeries, nutritionHist), color: '#f1c40f', limit: METRIC_LIMITS.nutrition },
        { label: 'Fitness', ...splitData(fitnessSeries, fitnessHist), color: '#2ecc71', limit: METRIC_LIMITS.fitness },
        { label: 'Sleep', ...splitData(sleepSeries, sleepHist), color: '#e74c3c', limit: METRIC_LIMITS.sleep }, // Note: Color reused
        { label: 'Stress', ...splitData(stressSeries, stressHist), color: '#2980b9', limit: METRIC_LIMITS.stress } // Note: Color reused
      ])
    ];
    // --- END NEW SECTION ---

    res.status(200).json({ status: 'success', data: healthGraphs });
  } catch (err) {
    console.error('Error in getPredictionData:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

module.exports = { getPredictionData };

