const { Onboarding } = require('../models/onboardingModel.js');

const METRIC_LIMITS = {
  cuoreScore: 90, bpUpper: 122, bpLower: 80,
  bsFasting: 100, bsAfterMeals: 140,
  a1c: 5.7,
  weight: 200, bmi: 22.9, bodyFat: 20,
  hdl: 60, ldl: 100, triglyceride: 150,
  nutrition: 90, fitness: 90, sleep: 90, stress: 90,
  heartRate: 80,
};

/*
-----------------------------------------
  MOMENTUM PREDICT (corrected)
-----------------------------------------
Rules:
- If A === B → return B (flat)
- Increase metric: clamp only if > limit
- Decrease metric: clamp only if < limit
-----------------------------------------
*/
const momentumPredict = (B, A, direction, limit) => {
  A = Number(A) || 0;
  B = Number(B) || 0;

  if (A === B) return B;  // no jump

  let pred;
  if (direction === "increase") {
    pred = B + ((B - A) * 0.8);
    if (pred > limit) pred = limit;
  } else {
    pred = B - ((A - B) * 0.8);
    if (pred < limit) pred = limit;
  }

  return Math.max(0, pred);
};

/*
=====================================================
  CORE: generateSeries(history)
=====================================================
Implements your FINAL RULE:

Case 0: no history → all predicted  
Case 1: 1 history → A actual, B formula, C-F momentum  
Case 2: 2 history → A,B actual, C-F momentum  
Case 3+: A,B,C = last 3 actual, D-F = predicted  
=====================================================
*/
const generateSeries = (
  history,
  X,
  initialFormula,
  direction,
  limit
) => {
  const h = history.filter(v => typeof v === "number" && !isNaN(v));
  const n = h.length;

  const out = new Array(6).fill(0);

  // Case 0 → all predicted
  if (n === 0) {
    let A = 50; // fallback baseline
    let B = initialFormula(A, X);
    out[0] = A;
    out[1] = B;
    out[2] = momentumPredict(B, A, direction, limit);
    out[3] = momentumPredict(out[2], B, direction, limit);
    out[4] = momentumPredict(out[3], out[2], direction, limit);
    out[5] = momentumPredict(out[4], out[3], direction, limit);
    return { series: out, historyCount: 0 };
  }

  // Case 1 → A actual, B formula
  if (n === 1) {
    const A = h[0];
    const B = initialFormula(A, X);

    out[0] = A;
    out[1] = B;
    out[2] = momentumPredict(B, A, direction, limit);
    out[3] = momentumPredict(out[2], B, direction, limit);
    out[4] = momentumPredict(out[3], out[2], direction, limit);
    out[5] = momentumPredict(out[4], out[3], direction, limit);

    return { series: out, historyCount: 1 };
  }

  // Case 2 → A,B actual
  if (n === 2) {
    const A = h[0], B = h[1];

    out[0] = A;
    out[1] = B;
    out[2] = momentumPredict(B, A, direction, limit);
    out[3] = momentumPredict(out[2], B, direction, limit);
    out[4] = momentumPredict(out[3], out[2], direction, limit);
    out[5] = momentumPredict(out[4], out[3], direction, limit);

    return { series: out, historyCount: 2 };
  }

  // Case 3+ → last 3 actual
  const A = h[n - 3], B = h[n - 2], C = h[n - 1];

  out[0] = A;
  out[1] = B;
  out[2] = C;
  out[3] = momentumPredict(C, B, direction, limit);
  out[4] = momentumPredict(out[3], C, direction, limit);
  out[5] = momentumPredict(out[4], out[3], direction, limit);

  return { series: out, historyCount: 3 };
};

/*
-----------------------------------------
  Date Helpers 
-----------------------------------------
*/
const formatDateLabel = (date) => {
  const d = new Date(date);
  return isNaN(d) ? "" : d.toLocaleDateString("en-GB", {
    month: "short", year: "2-digit"
  });
};

const addMonths = (date, months) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
};

const buildLabels = (historyArray, historyCount) => {
  const labels = ["", "", "", "", "", ""];
  if (!historyArray.length) return labels;

  const dates = historyArray.map(h =>
    h.date || h.createdAt || h.timestamp || null
  ).filter(Boolean);

  if (!dates.length) return labels;

  for (let i = 0; i < historyCount; i++) {
    labels[i] = formatDateLabel(dates[dates.length - historyCount + i]);
  }

  let last = new Date(dates[dates.length - 1]);
  let m = 2;
  for (let i = historyCount; i < 6; i++) {
    labels[i] = formatDateLabel(addMonths(last, m));
    m += 2;
  }

  return labels;
};

/*
-----------------------------------------
  Fetch history
-----------------------------------------
*/
const fetchHistory = (onboarding, key) => {
  const clean = v =>
    typeof v === "number"
      ? v
      : (typeof v === "string" ? parseFloat(v) : undefined);

  let arr = [];
  switch (key) {
    case "cuoreScore":
      arr = onboarding.scoreHistory || [];
      return arr.map(h => clean(h.data?.cuoreScore));

    case "weight_kg":
      arr = onboarding.o2History || [];
      return arr.map(h => clean(h.data?.weight_kg));

    case "bmi":
      arr = onboarding.o2History || [];
      return arr.map(h => clean(h.data?.bmi));

    case "nutrition":
      arr = onboarding.o5History || [];
      return arr.map(h => clean(h.data?.foodScore));

    case "fitness":
      arr = onboarding.o5History || [];
      return arr.map(h => clean(h.data?.exerciseScore));

    case "sleep":
      arr = onboarding.o6History || [];
      return arr.map(h => clean(h.data?.sleepScore));

    case "stress":
      arr = onboarding.o6History || [];
      return arr.map(h => clean(h.data?.stressScore));

    default:
      arr = onboarding.o7History || [];
      return arr.map(h => clean(h.data?.[key]));
  }
};
/*
----------------------------------------------------
  FORMULAS FOR B (from document)
  Used ONLY when historyCount = 1
----------------------------------------------------
*/
const formulas = {
  cuoreScore:    { B: (A, X) => A + (10 * X), direction: "increase" },

  bpUpper:       { B: (A, X) => A - (5 * X),  direction: "decrease" },
  bpLower:       { B: (A, X) => A - (3 * X),  direction: "decrease" },
  heartRate:     { B: (A, X) => A - (2 * X),  direction: "decrease" },

  bsFasting:     { B: (A, X) => A - (20 * X), direction: "decrease" },
  bsAfterMeals:  { B: (A, X) => A - (20 * X), direction: "decrease" },

  weight:        { B: (A, X) => A - (2 * X), direction: "decrease" },

  hdl:           { B: (A, X) => A + (5 * X),  direction: "increase" },
  ldl:           { B: (A, X) => A - (8 * X),  direction: "decrease" },
  triglyceride:  { B: (A, X) => A - (9 * X),  direction: "decrease" },

  nutrition:     { B: (A, X) => A + (5 * X),  direction: "increase" },
  fitness:       { B: (A, X) => A + (5 * X),  direction: "increase" },
  sleep:         { B: (A, X) => A + (5 * X),  direction: "increase" },
  stress:        { B: (A, X) => A + (5 * X),  direction: "increase" },
};

/*
----------------------------------------------------
  HELPERS FOR GRAPH PACKAGING (unchanged)
----------------------------------------------------
*/
const splitData = (series, historyCount) => ({
  actualData: series.slice(0, historyCount),
  predictedData: series.slice(historyCount)
});

const graph = (title, datasets, labels) => ({
  title,
  data: { labels, datasets }
});

/*
====================================================
  MAIN CONTROLLER
====================================================
*/
const getPredictionData = async (req, res) => {
  try {
    const { userId } = req.params;
    const onboarding = await Onboarding.findOne({ userId }).lean();

    if (!onboarding) {
      return res.status(404).json({ status: "error", message: "User not found" });
    }

    // X based on cuoreScore
    const cs = onboarding.scores?.cuoreScore || 0;
    let X = cs < 50 ? 0.9 : cs > 70 ? 0.3 : 0.6;

    const heightM = (onboarding.o2Data?.height_cm || 1) / 100;
    const age = onboarding.o2Data?.age || 30;
    const gender = (onboarding.o2Data?.gender || "").toLowerCase();

    /*
    ---------------- Compute Series ----------------
    */

    const build = (metric, dbKey) => {
      const hist = fetchHistory(onboarding, dbKey || metric);
      const f = formulas[metric];

      const { series, historyCount } =
        generateSeries(hist, X, f.B, f.direction, METRIC_LIMITS[metric]);

      const labels = buildLabels(
        onboarding.o7History || onboarding.scoreHistory || onboarding.o2History || [],
        historyCount
      );

      return { series, labels, historyCount };
    };

    // Main metrics
    const cuore = build("cuoreScore", "cuoreScore");

    const bpU = build("bpUpper", "bp_upper");
    const bpL = build("bpLower", "bp_lower");
    const hr  = build("heartRate", "pulse");

    const bsF = build("bsFasting", "bs_f");
    const bsA = build("bsAfterMeals", "bs_am");

    const w = build("weight", "weight_kg");

    // BMI
    const bmiSeries = w.series.map(wv =>
      Math.round((wv / (heightM * heightM)) * 100) / 100
    );
    const bmiHistoryCount = w.historyCount;
    const BMIlabels = w.labels;

    // BodyFat
    const bodyFatSeries = bmiSeries.map(b => {
      return gender === "male"
        ? Math.round((1.2 * b + 0.23 * age - 16.2) * 100) / 100
        : Math.round((1.2 * b + 0.23 * age - 5.4) * 100) / 100;
    });

    const hdl = build("hdl", "HDL");
    const ldl = build("ldl", "LDL");
    const trig = build("triglyceride", "Trig");

    const nut = build("nutrition", "nutrition");
    const fit = build("fitness", "fitness");
    const slp = build("sleep", "sleep");
    const str = build("stress", "stress");

    // A1C derived from BS F
    const a1cSeries = bsF.series.map(v =>
      Math.round(((v + 46.7) / 28.7) * 100) / 100
    );

    /*
    ---------------- Build Graph Data ----------------
    */
    const graphs = [
      graph("Cuore Score", [
        { label: "Cuore Score", ...splitData(cuore.series, cuore.historyCount), color: "#1E64AC", limit: METRIC_LIMITS.cuoreScore }
      ], cuore.labels),

      graph("Blood Pressure & Heart Rate", [
        { label: "BP Upper", ...splitData(bpU.series, bpU.historyCount), color: "#ff4d4d" },
        { label: "BP Lower", ...splitData(bpL.series, bpL.historyCount), color: "#00b8a9" },
        { label: "Heart Rate", ...splitData(hr.series, hr.historyCount), color: "#40c4ff" },
      ], bpU.labels),

      graph("Blood Sugar", [
        { label: "Fasting", ...splitData(bsF.series, bsF.historyCount), color: "#f39c12" },
        { label: "After Meal", ...splitData(bsA.series, bsA.historyCount), color: "#d35400" },
      ], bsF.labels),

      graph("A1C", [
        { label: "A1C", ...splitData(a1cSeries, bsF.historyCount), color: "#9b59b6" }
      ], bsF.labels),

      graph("Weight", [
        { label: "Weight", ...splitData(w.series, w.historyCount), color: "#34495e" }
      ], w.labels),

      graph("BMI & Body Fat", [
        { label: "BMI", actualData: bmiSeries.slice(0, bmiHistoryCount), predictedData: bmiSeries.slice(bmiHistoryCount), color: "#2ecc71" },
        { label: "Body Fat (%)", actualData: bodyFatSeries.slice(0, bmiHistoryCount), predictedData: bodyFatSeries.slice(bmiHistoryCount), color: "#ff0000" }
      ], BMIlabels),

      graph("Cholesterol", [
        { label: "HDL", ...splitData(hdl.series, hdl.historyCount), color: "#3498db" },
        { label: "LDL", ...splitData(ldl.series, ldl.historyCount), color: "#e74c3c" },
        { label: "Triglycerides", ...splitData(trig.series, trig.historyCount), color: "#8C00FF" }
      ], hdl.labels),

      graph("Lifestyle Metrics", [
        { label: "Nutrition", ...splitData(nut.series, nut.historyCount), color: "#f1c40f" },
        { label: "Fitness", ...splitData(fit.series, fit.historyCount), color: "#2ecc71" },
        { label: "Sleep", ...splitData(slp.series, slp.historyCount), color: "#e74c3c" },
        { label: "Stress", ...splitData(str.series, str.historyCount), color: "#2980b9" }
      ], nut.labels),
    ];

    /*
    ---------------- Build Last 6 Actual History ----------------
    */
    const o7 = onboarding.o7History || [];
    const sorted = [...o7].sort((a,b) =>
      new Date(a.timestamp || a.createdAt) - new Date(b.timestamp || b.createdAt)
    );

    const metricHistory = sorted.slice(-6).map(h => ({
      date: h.timestamp || h.createdAt,
      bp_upper: h.data?.bp_upper ?? null,
      bp_lower: h.data?.bp_lower ?? null,
      pulse: h.data?.pulse ?? null,
      bs_f: h.data?.bs_f ?? null,
      bs_am: h.data?.bs_am ?? null,
    }));

    return res.json({
      status: "success",
      data: { graphs, history: metricHistory }
    });

  } catch (err) {
    console.log(err);
    return res.status(500).json({ status: "error", message: err.message });
  }
};

module.exports = { getPredictionData };
