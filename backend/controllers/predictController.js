const { Onboarding } = require('../models/onboardingModel.js');

// --- METRIC LIMITS (Unchanged, except weight widened to 200) ---
const METRIC_LIMITS = {
  cuoreScore: 90, bpUpper: 122, bpLower: 80, bsFasting: 100, bsAfterMeals: 140,
  a1c: 5.7, weight: 200, bmi: 22.9, bodyFat: 20, hdl: 60, ldl: 100,
  triglyceride: 150, nutrition: 90, fitness: 90, sleep: 90, stress: 90, heartRate: 80,
};


// ------------------------ NEW WEIGHT LOGIC -------------------------

// 1. Calculate Target Weight
const getTargetWeight = (gender, height_cm) => {
  if (!gender || !height_cm) return null;

  if (gender.toLowerCase() === "male") {
    return 52 + 1.9 * ((height_cm - 152.4) / 2.4);
  } else {
    return 50 + 1.7 * ((height_cm - 152.4) / 2.4);
  }
};

// 2. Determine direction (increase / decrease / maintain)
const getWeightDirection = (currentWeight, targetWeight) => {
  if (!targetWeight || !currentWeight) return "maintain";

  if (currentWeight > targetWeight + 0.5) return "decrease";
  if (currentWeight < targetWeight - 0.5) return "increase";
  return "maintain";
};


// 3. NEW weight prediction formula (smooth move toward target)
const predictWeightTowardsTarget = (current, target) => {
  // smooth movement: 30% towards target
  let next = current + (target - current) * 0.3;

  // prevent overshoot
  if (current > target && next < target) next = target;
  if (current < target && next > target) next = target;

  return Math.round(next * 100) / 100;
};


// ------------------------------------------------------------------


// --- General Momentum Prediction (unchanged) ---
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


// --- generatePredictionSeries (UPDATED TO HANDLE WEIGHT, but 6 points total for all) ---
const generatePredictionSeries = (
  history,
  X,
  initialBFormula,
  direction,
  limit,
  isO7Metric = false,
  preferFullHistory = false,
  isWeight = false,
  targetWeight = null
) => {

  const validHistory = history.filter(v => typeof v === "number" && !isNaN(v));
  const n = validHistory.length;

  // ---------- SPECIAL HANDLING FOR WEIGHT (ALWAYS 6 POINTS) ----------
  if (isWeight) {
    if (n === 0) {
      return { series: new Array(6).fill(0), historyCount: 0 };
    }

    // We follow the same 0/1/2/3 history rule like other metrics:
    // max 3 history points, remaining are predictions towards target
    const points = new Array(6).fill(0);
    let historyCount;

    if (n === 1) {
      // H: [A], P: [B,C,D,E,F] toward target
      points[0] = validHistory[0];
      historyCount = 1;
      let current = points[0];
      for (let i = 1; i < 6; i++) {
        current = predictWeightTowardsTarget(current, targetWeight);
        points[i] = current;
      }
    } else if (n === 2) {
      // H: [A,B], P: [C,D,E,F] toward target (starting from latest)
      points[0] = validHistory[0];
      points[1] = validHistory[1];
      historyCount = 2;
      let current = points[1];
      for (let i = 2; i < 6; i++) {
        current = predictWeightTowardsTarget(current, targetWeight);
        points[i] = current;
      }
    } else {
      // n >= 3 -> Take last 3 as history: [A,B,C], then 3 preds [D,E,F]
      points[0] = validHistory[n - 3];
      points[1] = validHistory[n - 2];
      points[2] = validHistory[n - 1];
      historyCount = 3;
      let current = points[2];
      for (let i = 3; i < 6; i++) {
        current = predictWeightTowardsTarget(current, targetWeight);
        points[i] = current;
      }
    }

    // Round all
    const rounded = points.map(p => Math.round(p * 100) / 100);
    return { series: rounded, historyCount };
  }

  // ---------- NON-WEIGHT METRICS ----------
  const predictNext = (B, A) => momentumPredict(B, A, direction, limit);

  const latestRawValue = history.length > 0 ? history[history.length - 1] : undefined;
  if (isO7Metric && (latestRawValue === null || latestRawValue === undefined)) {
      return { series: new Array(6).fill(0), historyCount: 0 };
  }

  // NOTE: we now IGNORE preferFullHistory for BP/HR/BS usage in this file,
  // because you want always 6 points in normal view.
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


// ------------- Date Helpers & fetchHistory & formatting --------------
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

const buildDateLabels = (historyArray, historyCount, totalPoints) => {
  const finalLength = totalPoints || 6;
  const labels = new Array(finalLength).fill("");

  if (!historyArray || historyArray.length === 0) return labels;

  const dates = historyArray
    .map(h => h.date || h.createdAt || h.updatedAt || h.timestamp || null)
    .filter(Boolean);

  if (dates.length === 0) return labels;

  for (let i = 0; i < historyCount; i++) {
    const dateIndex = dates.length - historyCount + i;
    if (dateIndex >= 0) {
        labels[i] = formatDateLabel(dates[dateIndex]);
    }
  }

  const lastDate = new Date(dates[dates.length - 1]);
  let monthsToAdd = 2;
  
  for (let i = historyCount; i < finalLength; i++) {
    labels[i] = formatDateLabel(addMonths(lastDate, monthsToAdd));
    monthsToAdd += 2;
  }

  return labels;
};


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

const getLabels = () => ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'];

const splitData = (series, historyCount) => {
    const actualData = series.slice(0, historyCount);
    const predictedData = series.slice(historyCount);
    return { actualData, predictedData };
};

const formatGraphData = (title, datasets, labels) => ({
  title,
  data: {
    labels: labels || getLabels(),
    datasets
  }
});


// ---------------- MAIN CONTROLLER ----------------
const getPredictionData = async (req, res) => {
  const { userId } = req.params;
  
  try {
    const onboarding = await Onboarding.findOne({ userId }).lean();
    if (!onboarding) {
      return res.status(404).json({ status: 'error', message: 'User onboarding data not found.' });
    }

    const gender = onboarding.o2Data?.gender;
    const height = onboarding.o2Data?.height_cm;
    const weightHistoryArr = fetchHistory(onboarding, "weight_kg");

    const currentWeight = weightHistoryArr.length > 0 ? weightHistoryArr[weightHistoryArr.length - 1] : null;
    const targetWeight = getTargetWeight(gender, height);
    const weightDirection = getWeightDirection(currentWeight, targetWeight);

    const cuoreScore = onboarding.scores?.cuoreScore || 0;
    let X;
    if (cuoreScore < 50) X = 0.9; 
    else if (cuoreScore > 70) X = 0.3; 
    else X = 0.6;

    const formulas = {
        cuoreScore: { initialB: (A, X) => A + (10 * X), direction: 'increase' },
        bpUpper:    { initialB: (A, X) => A - (4 * X),  direction: 'decrease' },
        bpLower:    { initialB: (A, X) => A - (2 * X),  direction: 'decrease' },
        heartRate:  { initialB: (A, X) => A - (2 * X),  direction: 'decrease' },
        bsFasting:  { initialB: (A, X) => A - (20 * X), direction: 'decrease' },
        bsAfterMeals:{ initialB: (A, X) => A - (20 * X), direction: 'decrease' },

        // NEW WEIGHT CONFIG (custom formula & direction)
        weight: {
          initialB: () => currentWeight,
          direction: weightDirection
        },

        bmi:        { initialB: (A, X) => A - (1 * X),  direction: 'decrease' },
        hdl:        { initialB: (A, X) => A + (2 * X),  direction: 'increase' },
        ldl:        { initialB: (A, X) => A - (5 * X),  direction: 'decrease' },
        triglyceride:{ initialB: (A, X) => A - (5 * X),  direction: 'decrease' },
        nutrition:  { initialB: (A, X) => A + (5 * X),  direction: 'increase' },
        fitness:    { initialB: (A, X) => A + (5 * X),  direction: 'increase' },
        sleep:      { initialB: (A, X) => A + (5 * X),  direction: 'increase' },
        stress:     { initialB: (A, X) => A + (5 * X),  direction: 'increase' },
    };

    const generateArgs = (key, dbKey, isO7 = false, _preferFullHistory = false, isWeightFlag = false) => [
        fetchHistory(onboarding, dbKey || key), 
        X, 
        formulas[key].initialB, 
        formulas[key].direction, 
        METRIC_LIMITS[key], 
        isO7, 
        false,              // <--- preferFullHistory: forced false to always keep 6 points
        isWeightFlag,
        targetWeight
    ];

    const { series: csSeries, historyCount: csHist } = generatePredictionSeries(...generateArgs('cuoreScore', 'cuoreScore'));
    const { series: weightSeries, historyCount: weightHist } = generatePredictionSeries(...generateArgs('weight', 'weight_kg', false, false, true));

    const { series: bpUpperSeries, historyCount: bpUpperHist } = generatePredictionSeries(...generateArgs('bpUpper', 'bp_upper', true));
    const { series: bpLowerSeries, historyCount: bpLowerHist } = generatePredictionSeries(...generateArgs('bpLower', 'bp_lower', true));
    const { series: hrSeries, historyCount: hrHist } = generatePredictionSeries(...generateArgs('heartRate', 'pulse', true));

    const { series: bsFastingSeries, historyCount: bsFastingHist } = generatePredictionSeries(...generateArgs('bsFasting', 'bs_f', true));
    const { series: bsAfterMealsSeries, historyCount: bsAfterMealsHist } = generatePredictionSeries(...generateArgs('bsAfterMeals', 'bs_am', true));

    const a1cFormula = (sugar) => sugar > 0 ? (sugar + 46.7) / 28.7 : 0;
    const a1cSeries = bsFastingSeries.map(sugarVal => Math.round(Math.min(Math.max(0, a1cFormula(sugarVal)), METRIC_LIMITS.a1c) * 100) / 100);
    const a1cHist = bsFastingHist; 

    const heightM = (onboarding.o2Data?.height_cm || 1) / 100;
    const bmiFormula = weight => heightM > 0 ? weight / (heightM * heightM) : 0;
    const bmiSeries = weightSeries.map(weightVal => Math.round(Math.min(Math.max(0, bmiFormula(weightVal)), METRIC_LIMITS.bmi) * 100) / 100);
    const bmiHist = weightHist; 
    
    const bodyFatSeries = bmiSeries.map(b => Math.round(Math.min(Math.max(0, b * 0.8), METRIC_LIMITS.bodyFat) * 100) / 100);
    const bodyFatHist = bmiHist;

    const { series: hdlSeries, historyCount: hdlHist } = generatePredictionSeries(...generateArgs('hdl', 'HDL', true));
    const { series: ldlSeries, historyCount: ldlHist } = generatePredictionSeries(...generateArgs('ldl', 'LDL', true));
    const { series: trigSeries, historyCount: trigHist } = generatePredictionSeries(...generateArgs('triglyceride', 'Trig', true));

    const { series: nutritionSeries, historyCount: nutritionHist } = generatePredictionSeries(...generateArgs('nutrition', 'nutrition'));
    const { series: fitnessSeries, historyCount: fitnessHist } = generatePredictionSeries(...generateArgs('fitness', 'fitness'));
    const { series: sleepSeries, historyCount: sleepHist } = generatePredictionSeries(...generateArgs('sleep', 'sleep'));
    const { series: stressSeries, historyCount: stressHist } = generatePredictionSeries(...generateArgs('stress', 'stress'));

    const o7HistoryRaw = onboarding.o7History || [];
    const o2HistoryRaw = onboarding.o2History || [];
    const scoreHistoryRaw = onboarding.scoreHistory || [];
    const o5HistoryRaw = onboarding.o5History || [];

    const cuoreLabels   = buildDateLabels(scoreHistoryRaw, csHist, csSeries.length);
    const bpLabels      = buildDateLabels(o7HistoryRaw, bpUpperHist, bpUpperSeries.length);
    const bsLabels      = buildDateLabels(o7HistoryRaw, bsFastingHist, bsFastingSeries.length);
    const cholLabels    = buildDateLabels(o7HistoryRaw, hdlHist, hdlSeries.length);
    const weightLabels  = buildDateLabels(o2HistoryRaw, weightHist, weightSeries.length);
    const lifestyleLabels = buildDateLabels(o5HistoryRaw, nutritionHist, nutritionSeries.length);

    // ---------- BUILD EXTRA HISTORY ARRAY FOR BP / HR / BS (last 6 readings) ----------
    const o7HistSorted = [...o7HistoryRaw].sort((a, b) => {
      const ta = new Date(a.timestamp || a.createdAt || a.updatedAt || 0).getTime();
      const tb = new Date(b.timestamp || b.createdAt || b.updatedAt || 0).getTime();
      return ta - tb;
    });

    const last6 = o7HistSorted.slice(-6);

    const metricHistory = last6.map(entry => ({
      date: entry.timestamp || entry.createdAt || entry.updatedAt || null,
      bp_upper: entry.data?.bp_upper ?? null,
      bp_lower: entry.data?.bp_lower ?? null,
      pulse: entry.data?.pulse ?? null,
      bs_f: entry.data?.bs_f ?? null,
      bs_am: entry.data?.bs_am ?? null,
    }));

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

    // final payload now includes metricHistory for the history screen
    res.status(200).json({ 
      status: 'success', 
      data: {
        graphs: healthGraphs,
        history: metricHistory
      } 
    });

  } catch (err) {
    console.error('Error in getPredictionData:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

module.exports = { getPredictionData };
