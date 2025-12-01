const PatientLink = require('../../models/PatientLink');
const Doctor = require('../../models/Doctor');
const User = require('../../models/User');
const { Onboarding } = require('../../models/onboardingModel');
const { calculateAllMetrics } = require('../../models/onboardingModel');
const Reminder = require('../../models/Reminder');
const bcrypt = require('bcryptjs');

// --- HELPER: Generate Random Doctor Code ---
function generateNewCode(name) {
    const namePart = name.replace(/[^a-zA-Z]/g, '').substring(0, 2).toUpperCase();
    const numPart = Math.floor(1000 + Math.random() * 9000);
    const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const alphaPart = alpha[Math.floor(Math.random() * alpha.length)] + alpha[Math.floor(Math.random() * alpha.length)];
    return `${namePart}-${numPart}-${alphaPart}`;
}

// --- HELPER: Determine Color Status ---
const getColorStatus = (val, type) => {
    if (val == null) return "normal"; // default

    const num = parseFloat(val);

    switch (type) {
        case "sbp": return (num <= 100 || num >= 150) ? "red" : "normal";
        case "dbp": return (num <= 66 || num >= 100) ? "red" : "normal";
        case "hr": return (num <= 60 || num >= 110) ? "red" : "normal";
        case "fbs": return (num <= 80 || num >= 200) ? "red" : "normal";
        case "bspp": return (num <= 110 || num >= 240) ? "red" : "normal";
        case "a1c": return (num >= 9.0) ? "red" : "normal";
        case "hscrp": return (num >= 0.3) ? "red" : "normal";
        case "tghdl": return (num >= 4.0) ? "red" : "normal";
        case "lifestyle": return (num <= 50) ? "red" : "normal";
        default: return "normal";
    }
};

// --- HELPER: Format Patient List Data (Updated with Colors) ---
const formatPatientData = async (patientUser) => {
    if (!patientUser) return null;
    const onboardingDoc = await Onboarding.findOne({ userId: patientUser._id }).lean();
    if (!onboardingDoc) {
        return {
            _id: patientUser._id,
            sobAlert: false,
            name: patientUser.display_name,
            phone: patientUser.phone,
            sbp: null, dbp: null, hr: null, fbs: null, bspp: null, a1c: null, hscrp: null, tghdl: null, lifestyle: null,
            
            // Default colors for pending onboarding
            sbpColor: "normal", dbpColor: "normal", hrColor: "normal", fbsColor: "normal", 
            bsppColor: "normal", a1cColor: "normal", hscrpColor: "normal", tghdlColor: "normal", 
            lifestyleColor: "normal",

            status: "Pending Onboarding",
            statusType: "inactive",
        };
    }
    const o7 = onboardingDoc.o7Data || {};
    const o3 = onboardingDoc.o3Data || {};
    let metrics = {};
    if (typeof calculateAllMetrics === "function") {
         metrics = calculateAllMetrics(onboardingDoc);
    }

    const isSelected = (val) => val && typeof val === "string" && val.trim() !== "" && val.toLowerCase() !== "false";
    const sobAlert = isSelected(o3.q5);

    const status = onboardingDoc.timestamp ? new Date(onboardingDoc.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : "No Date";
    
    return {
        _id: patientUser._id,
        sobAlert: sobAlert,
        name: patientUser.display_name,
        phone: patientUser.phone,
        
        // Metrics
        sbp: o7.bp_upper || null, 
        dbp: o7.bp_lower || null, 
        hr: o7.pulse || null,
        fbs: o7.bs_f || null, 
        bspp: o7.bs_am || null, 
        a1c: o7.A1C || null,
        hscrp: o7.HsCRP || null, 
        tghdl: metrics?.trigHDLRatio?.current || null, 
        lifestyle: metrics?.lifestyle?.score || null,

        // --- Colors Added Here ---
        sbpColor: getColorStatus(o7.bp_upper, 'sbp'),
        dbpColor: getColorStatus(o7.bp_lower, 'dbp'),
        hrColor: getColorStatus(o7.pulse, 'hr'),
        fbsColor: getColorStatus(o7.bs_f, 'fbs'),
        bsppColor: getColorStatus(o7.bs_am, 'bspp'),
        a1cColor: getColorStatus(o7.A1C, 'a1c'),
        hscrpColor: getColorStatus(o7.HsCRP, 'hscrp'),
        tghdlColor: getColorStatus(metrics?.trigHDLRatio?.current, 'tghdl'),
        lifestyleColor: getColorStatus(metrics?.lifestyle?.score, 'lifestyle'),

        status: status, 
        statusType: "date",
    };
};

// ====================================================================
// PREDICTION LOGIC (Synced with predictController.js)
// ====================================================================

// --- CEILINGS (Upper Limits for 'increase' metrics) ---
const METRIC_LIMITS = {
  cuoreScore: 90,
  hdl: 58,
  nutrition: 90,
  fitness: 90,
  sleep: 90,
  stress: 90
};

// --- FLOORS (Lower Limits for 'decrease' metrics) ---
const METRIC_FLOORS = {
  bpUpper: 122,
  bpLower: 80,
  heartRate: 82,
  bsFasting: 100,
  bsAfterMeals: 140,
  a1c: 5.6,
  weight: null,    // user-specific — keep null
  bmi: 22.5,
  bodyFat: null,   // handled separately using gender formula
  ldl: 130,
  triglyceride: 130
};

// --- Momentum Predict (Robust Logic) ---
const momentumPredict = (B, A, direction, limit) => {
  A = Number(A) || 0;
  B = Number(B) || 0;

  if (A === B) return B; 

  let pred;
  if (direction === "increase") {
    pred = B + ((B - A) * 0.8);
    // Clamp MAX
    if (pred > limit) pred = limit;
  } else {
    pred = B - ((A - B) * 0.8);
    // Clamp MIN
    if (pred < limit) pred = limit; 
  }

  return Math.max(0, pred);
};

// --- Generate Series Core ---
const generateSeries = (history, X, initialFormula, direction, limit) => {
  const h = history.filter(v => typeof v === "number" && !isNaN(v));
  const n = h.length;
  const out = new Array(6).fill(0);

  // Case 0: No data
  if (n === 0) return { series: out, historyCount: 0 };

  // Case 1: 1 Actual
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

  // Case 2: 2 Actual
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

  // Case 3+: Last 3 Actual
  let A = h[n - 3];
let B_raw = h[n - 2];
let C_raw = h[n - 1];

// Apply formula to B and C
let B = initialFormula(B_raw, X);
let C = initialFormula(C_raw, X);

// Clamp to limits
if (direction === "decrease") {
  if (B < limit) B = limit;
  if (C < limit) C = limit;
} else {
  if (B > limit) B = limit;
  if (C > limit) C = limit;
}

out[0] = A;
out[1] = B;
out[2] = C;

// Apply momentum
out[3] = momentumPredict(C, B, direction, limit);
out[4] = momentumPredict(out[3], C, direction, limit);
out[5] = momentumPredict(out[4], out[3], direction, limit);

return { series: out, historyCount: 3 };

};

// --- Date Helpers ---
const formatDateLabel = (date) => {
  const d = new Date(date);
  return isNaN(d) ? "" : d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
};

const addMonths = (date, months) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
};

const buildLabels = (historyArray, historyCount) => {
  const labels = ["", "", "", "", "", ""];
  if (!historyArray.length) return labels;

  const dates = historyArray.map(h => h.date || h.createdAt || h.timestamp || null).filter(Boolean);
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

// --- Fetch History Helper ---
const fetchHistory = (onboarding, key) => {
  const clean = v => typeof v === "number" ? v : (typeof v === "string" ? parseFloat(v) : undefined);
  let arr = [];
  switch (key) {
    case "cuoreScore": arr = onboarding.scoreHistory || []; return arr.map(h => clean(h.data?.cuoreScore));
    case "weight_kg": arr = onboarding.o2History || []; return arr.map(h => clean(h.data?.weight_kg));
    case "bmi": arr = onboarding.o2History || []; return arr.map(h => clean(h.data?.bmi));
    case "nutrition": arr = onboarding.o5History || []; return arr.map(h => clean(h.data?.foodScore));
    case "fitness": arr = onboarding.o5History || []; return arr.map(h => clean(h.data?.exerciseScore));
    case "sleep": arr = onboarding.o6History || []; return arr.map(h => clean(h.data?.sleepScore));
    case "stress": arr = onboarding.o6History || []; return arr.map(h => clean(h.data?.stressScore));
    default: arr = onboarding.o7History || []; return arr.map(h => clean(h.data?.[key]));
  }
};

// --- Formulas ---
const formulas = {
  cuoreScore:    { B: (A, X) => (A > 88 ? A : A + (10 * X)), direction: "increase" },

  bpUpper:       { B: (A, X) => (A < 110 ? A : A - (5 * X)), direction: "decrease" },
  bpLower:       { B: (A, X) => (A < 80  ? A : A - (3 * X)), direction: "decrease" },

  heartRate:     { B: (A, X) => (A < 82 ? A : A - (2 * X)), direction: "decrease" },

  bsFasting:     { B: (A, X) => (A < 105 ? A : A - (15 * X)), direction: "decrease" },
  bsAfterMeals:  { B: (A, X) => (A < 150 ? A : A - (20 * X)), direction: "decrease" },

  a1c:           { B: (A, X) => (A < 6 ? A : A - (0.9 * X)), direction: "decrease" },

  weight:        { B: (A, X) => A - (2 * X),  direction: "decrease" },
  bmi:           { B: (A, X) => A - (0.2 * X), direction: "decrease" },
  bodyFat:       { B: (A, X) => A - (0.2 * X), direction: "decrease" },

  hdl:           { B: (A, X) => (A > 56 ? A : A + (2 * X)), direction: "increase" },
  ldl:           { B: (A, X) => (A < 130 ? A : A - (8 * X)), direction: "decrease" },
  triglyceride:  { B: (A, X) => (A < 130 ? A : A - (9 * X)), direction: "decrease" },

  nutrition:     { B: (A, X) => (A > 80 ? A : A + (5 * X)), direction: "increase" },
  fitness:       { B: (A, X) => (A > 80 ? A : A + (4 * X)), direction: "increase" },
  sleep:         { B: (A, X) => (A > 80 ? A : A + (3 * X)), direction: "increase" },
  stress:        { B: (A, X) => (A > 80 ? A : A + (3 * X)), direction: "increase" }
};


// --- Main Prediction Generator (Replaces old logic) ---
async function getPatientPredictionGraphs(onboardingDoc) {
  if (!onboardingDoc) return { chartData: {}, metrics: [] };

  const cs = onboardingDoc.scores?.cuoreScore || 0;
  let X = cs < 50 ? 0.9 : cs > 70 ? 0.3 : 0.6;

  const heightM = (onboardingDoc.o2Data?.height_cm || 1) / 100;
  const age = onboardingDoc.o2Data?.age || 30;
  const gender = (onboardingDoc.o2Data?.gender || "").toLowerCase();

  // Helper to build series
  const build = (metric, dbKey) => {
    const hist = fetchHistory(onboardingDoc, dbKey || metric);
    const f = formulas[metric];
    
    // Crucial: Select Floor vs Ceiling based on direction
    const boundary = f.direction === "increase" 
      ? (METRIC_LIMITS[metric] || 100) 
      : (METRIC_FLOORS[metric] || 0);

    const { series, historyCount } = generateSeries(hist, X, f.B, f.direction, boundary);
    
    const roundedSeries = series.map(v => Math.round(v * 100) / 100);
    
    const labels = buildLabels(
      onboardingDoc.o7History || onboardingDoc.scoreHistory || onboardingDoc.o2History || [],
      historyCount
    );

    return { series: roundedSeries, labels, historyCount };
  };

  // 1. Generate Series
  const cuore = build("cuoreScore", "cuoreScore");
  const bpU = build("bpUpper", "bp_upper");
  const bpL = build("bpLower", "bp_lower");
  const hr  = build("heartRate", "pulse");
  const bsF = build("bsFasting", "bs_f");
  const bsA = build("bsAfterMeals", "bs_am");
  const w   = build("weight", "weight_kg");
  const hdl = build("hdl", "HDL");
  const ldl = build("ldl", "LDL");
  const trig = build("triglyceride", "Trig");
  const nut = build("nutrition", "nutrition");
  const fit = build("fitness", "fitness");
  const slp = build("sleep", "sleep");
  const str = build("stress", "stress");

  // 2. Derived Series
  const bmiSeries = w.series.map(wv => Math.round((wv / (heightM * heightM)) * 100) / 100);
  const a1cSeries = bsF.series.map(v => Math.round(((v + 46.7) / 28.7) * 100) / 100);

  // 3. Package for Dashboard (ChartData format)
  // Note: The dashboard expects a specific structure for 'metrics' and 'chartData' objects
  const chartData = {
    bp: bpU.labels.map((day, i) => ({ day, sys: bpU.series[i], dia: bpL.series[i], hr: hr.series[i] })),
    weight: w.labels.map((day, i) => ({ day, weight: w.series[i] })),
    sugar: bsF.labels.map((day, i) => ({ day, fasting: bsF.series[i], pp: bsA.series[i] })),
    cholesterol: hdl.labels.map((day, i) => ({ day, ldl: ldl.series[i], hdl: hdl.series[i], trig: trig.series[i] })),
    a1c: bsF.labels.map((day, i) => ({ day, a1c: a1cSeries[i] })),
    lifestyle: nut.labels.map((day, i) => ({ day, nutrition: nut.series[i], fitness: fit.series[i], sleep: slp.series[i], stress: str.series[i] })),
    bmi: w.labels.map((day, i) => ({ day, bmi: bmiSeries[i] }))
  };

  // 4. Metrics Metadata
  const metricsData = [
    { key: "bp", title: "Blood Pressure & Heart Rate", dataKey: chartData.bp, lines: [{ key: "sys", label: "Systolic", stroke: "#FF4D4D" }, { key: "dia", label: "Diastolic", stroke: "#4D79FF" }, { key: "hr", label: "Heart Rate", stroke: "#10B981" }], domain: [50, 160] }, 
    { key: "weight", title: "Weight", dataKey: chartData.weight, lines: [{ key: "weight", label: "Weight (kg)", stroke: "#FFA500" }], domain: [40, 150] }, 
    { key: "sugar", title: "Blood Sugar", dataKey: chartData.sugar, lines: [{ key: "fasting", label: "Fasting", stroke: "#FF7F7F" }, { key: "pp", label: "PP", stroke: "#1E90FF" }], domain: [60, 250] }, 
    { key: "a1c", title: "A1C", dataKey: chartData.a1c, lines: [{ key: "a1c", label: "A1C %", stroke: "#9b59b6" }], domain: [4, 12] }, 
    { key: "cholesterol", title: "Cholesterol", dataKey: chartData.cholesterol, lines: [{ key: "ldl", label: "LDL", stroke: "#FFA500" }, { key: "hdl", label: "HDL", stroke: "#10B981" }, { key: "trig", label: "Triglycerides", stroke: "#FF4D4D" }], domain: [20, 300] }, 
    { key: "lifestyle", title: "Lifestyle Metrics", dataKey: chartData.lifestyle, lines: [{ key: "nutrition", label: "Nutrition", stroke: "#f1c40f" }, { key: "fitness", label: "Fitness", stroke: "#2ecc71" }, { key: "sleep", label: "Sleep", stroke: "#e74c3c" }, { key: "stress", label: "Stress", stroke: "#2980b9" }], domain: [0, 100] }
  ];

  return { chartData, metrics: metricsData };
}

// ====================================================================
// ALERT LOGIC HELPER (Updated with CuoreMD Colors)
// ====================================================================
const generateMedicalAlerts = (onboarding, lastConsultDate, metrics) => {
  const alertMap = {};
  const today = new Date();

  // Helper: addAlert(Level, Message, Label)
  // If Label exists, we only upgrade Orange -> Red. 
  const addAlert = (level, message, label) => {
    const existing = alertMap[label];

    if (!existing) {
      alertMap[label] = { level, message, label, timestamp: new Date() };
      return;
    }

    if (existing.level === 'Orange' && level === 'Red') {
      alertMap[label] = { level, message, label, timestamp: new Date() };
    }
  };

  const getDaysDiff = (dateString) => {
    if (!dateString) return 999; 
    const date = new Date(dateString);
    const diffTime = Math.abs(today - date);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const scores = onboarding.scores || {};
  const o3 = onboarding.o3Data || {};
  const o7 = onboarding.o7Data || {};
  const isSelected = (val) => val && typeof val === "string" && val.trim() !== "" && val.toLowerCase() !== "false";

  // --- 2. Stale Cuore Score ---
  const daysSinceConsult = getDaysDiff(lastConsultDate);
  if ((scores.cuoreScore || 0) < 55 && daysSinceConsult > 100) {
    addAlert('Orange', ">100 days since last consult", ">100 days since last consult");
  }

  // --- 3. Reassessment Due ---
  const daysSinceAssessment = getDaysDiff(onboarding.timestamp);
  if (daysSinceAssessment > 55) {
    addAlert('Orange', "Reassessment due", "Plan not updated – Reassessment due");
  }

  // --- 4. Shortness of Breath ---
  if (isSelected(o3.q5) || (o3.selectedOptions && o3.selectedOptions.includes("I feel short of breath"))) {
     addAlert('Red', "SOB or chest discomfort", "SOB or chest discomfort");
  }

  // --- 5. Diabetes Symptoms ---
  if (isSelected(o3.q6) || (o3.selectedOptions && o3.selectedOptions.includes("increase in hunger"))) {
     addAlert('Orange', "Increased hunger, thirst & urination", "Increased hunger, thirst & urination");
  }

  // ======================================================
  // GROUP 1: BLOOD PRESSURE (Label: Abnormal BP)
  // ======================================================
  const bpUpper = o7.bp_upper;
  if (bpUpper) {
    if (bpUpper >= 150 || bpUpper <= 100) {
      addAlert('Red', "Abnormal BP", "Abnormal BP");
    } else if (bpUpper >= 130 || bpUpper <= 110) {
      addAlert('Orange', "Abnormal BP", "Abnormal BP");
    }
  }

  const bpLower = o7.bp_lower;
  if (bpLower) {
    if (bpLower >= 100 || bpLower <= 66) {
      addAlert('Red', "Abnormal BP", "Abnormal BP");
    } else if (bpLower >= 85 || bpLower <= 70) {
      addAlert('Orange', "Abnormal BP", "Abnormal BP");
    }
  }

  // --- 8. Pulse Rate (Label: Abnormal HR) ---
  const pulse = o7.pulse;
  if (pulse) {
    if (pulse <= 60 || pulse >= 110) {
      addAlert('Red', "Abnormal HR", "Abnormal HR");
    } else if (pulse >= 100 || pulse <= 65) {
      addAlert('Orange', "Abnormal HR", "Abnormal HR");
    }
  }

  // ============================================================
  // GROUP 2: GLUCOSE (Label: Abnormal glucose)
  // ============================================================
  const bsF = o7.bs_f;
  if (bsF) {
    if (bsF <= 80 || bsF >= 200) {
       addAlert('Red', "Abnormal glucose", "Abnormal glucose");
    } else if (bsF >= 110) {
       addAlert('Orange', "Abnormal glucose", "Abnormal glucose");
    }
  }

  const bsAm = o7.bs_am;
  if (bsAm) {
    if (bsAm <= 110 || bsAm >= 240) {
      addAlert('Red', "Abnormal glucose", "Abnormal glucose");
    } else if (bsAm >= 160) {
      addAlert('Orange', "Abnormal glucose", "Abnormal glucose");
    }
  }

  // --- A1C (Label: High A1C) ---
  const a1c = o7.A1C;
  if (a1c) {
    if (a1c >= 9.0) {
        addAlert('Red', "High A1C", "High A1C");
    } else if (a1c >= 6.5) {
        addAlert('Orange', "High A1C", "High A1C");
    }
  }

  // ============================================================
  // OTHER VITALS
  // ============================================================

  // --- 12. O2 Saturation (Label: O2 Saturation) ---
  const o2 = o7.o2_sat;
  if (o2) {
    if (o2 < 91) {
      addAlert('Red', "O2 sat <91%", "O2 Saturation");
    } else if (o2 >= 91 && o2 <= 94) {
      addAlert('Orange', "Low O2 sat%", "O2 Saturation");
    }
  }

  // --- 13. HsCRP (Label: High HsCRP) ---
  const hscrp = o7.HsCRP;
  if (hscrp && hscrp >= 0.3) { 
    addAlert('Red', "High HsCRP", "High HsCRP");
  }

  // --- 14. TG/HDL Ratio (Label: Hyperlipidaemia) ---
  const tgHdl = metrics?.trigHDLRatio?.current;
  if (tgHdl) {
     if (tgHdl >= 4.0) {
        addAlert('Red', "Hyperlipidaemia", "Hyperlipidaemia");
     } else if (tgHdl >= 3.0) {
        addAlert('Orange', "Hyperlipidaemia", "Hyperlipidaemia");
     }
  }

  // --- 15. Lifestyle Score (Label: Lifestyle) ---
  const lifestyle = metrics?.lifestyle?.score;
  if (lifestyle !== undefined && lifestyle !== null) {
      if (lifestyle <= 50) {
          // Message: "Poor Lifestyle", Label: "Lifestyle" (Avoids duplication)
          addAlert('Red', "Poor Lifestyle", "Lifestyle"); 
      } else if (lifestyle <= 70) {
          addAlert('Orange', "Poor Lifestyle", "Lifestyle");
      }
  }

  return Object.values(alertMap);
};
// ====================================================================
// END: NEW ALERT LOGIC HELPER
// ====================================================================


// --- HELPER: Build Patient Profile (Updated with Color Statuses) ---
function buildPatientProfile(user, onboardingDoc, allMeds) {
  const o2 = onboardingDoc.o2Data || {};
  const o3 = onboardingDoc.o3Data || {};
  const o4 = onboardingDoc.o4Data || {};
  const o7 = onboardingDoc.o7Data || {};
  const metrics = calculateAllMetrics(onboardingDoc);

  const minDuration = 15 * 24 * 60 * 60 * 1000;
  const medications = allMeds
    .filter((med) => {
      if (med.endDate === null) return true;
      const duration = new Date(med.endDate).getTime() - new Date(med.startDate).getTime();
      return duration >= minDuration;
    })
    .map((med) => med.title);

  const processedHistory = [];
  const isSelected = (val) => val && typeof val === "string" && val.trim() !== "" && val.toLowerCase() !== "false";

  if (isSelected(o3.q1)) processedHistory.push(o3.q1);
  if (isSelected(o3.q2)) processedHistory.push("o2.q2");
  if (isSelected(o3.q3)) processedHistory.push("HTN");
  if (isSelected(o3.q4)) processedHistory.push("DM");
  if (isSelected(o3.q5)) processedHistory.push("SOB/ Chest Discomfort");
  if (isSelected(o3.q6)) processedHistory.push(o3.q6);
  if (isSelected(o3.other_conditions)) processedHistory.push(o3.other_conditions);

  const pastHistory = processedHistory.length > 0 ? processedHistory.join(", ") : "None";

  // --- Determine Colors ---
  const sbpColor = getColorStatus(o7.bp_upper, 'sbp');
  const dbpColor = getColorStatus(o7.bp_lower, 'dbp');
  const hrColor = getColorStatus(o7.pulse, 'hr');
  const fbsColor = getColorStatus(o7.bs_f, 'fbs');
  const bsppColor = getColorStatus(o7.bs_am, 'bspp');
  const a1cColor = getColorStatus(o7.A1C, 'a1c');
  const hscrpColor = getColorStatus(o7.HsCRP, 'hscrp');
  const tghdlColor = getColorStatus(metrics?.trigHDLRatio?.current, 'tghdl');
  const lifestyleColor = getColorStatus(metrics?.lifestyle?.score, 'lifestyle');

  return {
    name: user?.display_name || "User",
    age: o2.age || null,
    smoker: o4.smoking || "N/A",
    pastHO: pastHistory,
    medications: medications.length > 0 ? medications.join(", ") : "None",
    lastConsulted: onboardingDoc.lastConsultedDate 
        ? new Date(onboardingDoc.lastConsultedDate).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })
        : null,
    
    // --- Metric Values ---
    sbp: o7.bp_upper || null,
    dbp: o7.bp_lower || null,
    hr: o7.pulse || null,
    fbs: o7.bs_f || null,
    bspp: o7.bs_am || null,
    a1c: o7.A1C || null,
    hscrp: o7.HsCRP || null,
    tghdl: metrics?.trigHDLRatio?.current || null,
    lifestyle: metrics?.lifestyle?.score || null,

    // --- Color Statuses ---
    sbpColor,
    dbpColor,
    hrColor,
    fbsColor,
    bsppColor,
    a1cColor,
    hscrpColor,
    tghdlColor,
    lifestyleColor
  };
}

function buildDummySummary() { const presentDate = new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' }); const formattedDate = `Uploaded on ${presentDate}`; return { summary: { history: "Cholecystectomy (Gallbladder removal)\nLeft thigh fracture", medications: "Diabetes on metformin\nHypertension (HTN) on Cardace", labs: "RBS: 230" }, diseaseProgressionRisk: "You have a 52% risk of developing a diabetes + kidney decline cluster within 4 years.", healthRecords: [{ _id: "dummy_presc_1", type: "Prescription", date: formattedDate, url: "#" }, { _id: "dummy_presc_2", type: "Prescription", date: formattedDate, url: "#" }] }; }

// --- EXPORTS ---

exports.getPatientList = async (req, res) => {
  try {
    console.log(`Fetching REAL patient list for Doctor: ${req.doctor.displayName}`);
    const doctor = await Doctor.findById(req.doctor._id).populate('patients'); 
    if (!doctor) return res.status(404).json({ error: "Doctor not found." });

    const patientDataPromises = doctor.patients.map(patientUser => formatPatientData(patientUser));
    const patientList = (await Promise.all(patientDataPromises)).filter(p => p !== null);

    patientList.sort((a, b) => (b.sobAlert ? 1 : 0) - (a.sobAlert ? 1 : 0));

    const currentDate = new Date().toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" });

    res.status(200).json({
      doctorInfo: { displayName: req.doctor.displayName, doctorCode: req.doctor.doctorCode },
      count: patientList.length,
      patients: patientList,
      currentDate
    });
  } catch (error) {
    console.error("Error in getPatientList:", error);
    res.status(500).json({ error: "Server error fetching patient list." });
  }
};

exports.addPatientLink = async (req, res) => {
    const { patientMobile, planDuration } = req.body;
    const doctorCode = req.doctor.doctorCode;
    if (!patientMobile || !patientMobile.startsWith('+')) {
        return res.status(400).json({ error: 'A valid mobile number in international format is required.' });
    }
    try {
        const link = await PatientLink.findOneAndUpdate(
            { patientMobile: patientMobile },
            { patientMobile: patientMobile, doctorCode: doctorCode, planDuration: planDuration, expiresAt: new Date(Date.now() + 30*24*60*60*1000) },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        res.status(201).json({
            message: 'Patient link created successfully.',
            link: link,
            simulated_sms: `Patient at ${patientMobile} is now linked to ${doctorCode}. Please ask them to download the Cuore app.`
        });
    } catch (error) {
        console.error("Error creating patient link:", error);
        res.status(500).json({ error: 'Server error creating link.' });
    }
};

/**
 * @desc    Get full details for a single patient (INCLUDES ALERTS)
 * @route   GET /api/web/dashboard/patient/:patientId
 */
exports.getPatientDetails = async (req, res) => {
    try {
        const { patientId } = req.params;
        const doctorUser = req.doctor || req.user;

        if (!doctorUser || !doctorUser._id) {
             return res.status(401).json({ error: "Unauthorized: Doctor not identified." });
        }

        const doctor = await Doctor.findById(doctorUser._id);
        if (!doctor) {
            return res.status(404).json({ error: "Doctor profile not found." });
        }

        const patientList = doctor.patients || [];
        const isPatientLinked = patientList.some(id => id.toString() === patientId);
        if (!isPatientLinked) {
            return res.status(403).json({ error: "You are not authorized to view this patient." });
        }

        const [patientProfile, onboardingDoc, allMeds] = await Promise.all([
            User.findById(patientId).lean(),
            Onboarding.findOne({ userId: patientId }).lean(),
            Reminder.find({ userId: patientId, isMedication: true, isActive: true }).lean()
        ]);

        if (!patientProfile) return res.status(404).json({ error: "Patient profile not found." });
        if (!onboardingDoc) return res.status(404).json({ error: "Patient has not completed onboarding." });

        const doctorInfo = { displayName: doctor.displayName, doctorCode: doctor.doctorCode };
        
        // 5. --- BUILD DATA (UPDATED) ---
        // Now returns flat structure with colors as requested
        const profileData = buildPatientProfile(patientProfile, onboardingDoc, allMeds);
        
        const predictDataPoints = await getPatientPredictionGraphs(onboardingDoc);
        const summaryOfRecords = buildDummySummary();

        const lastConsultDate = onboardingDoc.lastConsultedDate || null; 
        const metrics = calculateAllMetrics(onboardingDoc);
        const medicalAlerts = generateMedicalAlerts(onboardingDoc, lastConsultDate, metrics);

        res.status(200).json({
            doctorInfo,
            patientProfile: profileData,
            predictDataPoints,
            alerts: medicalAlerts,
            summaryOfRecords
        });

    } catch (err) {
        console.error("Error in getPatientDetails:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

exports.sendProfileEditOtp = async (req, res) => {
    try {
        const doctor = await Doctor.findById(req.doctor._id);
        if (!doctor) return res.status(404).json({ error: 'Doctor not found.' });
        const otp = Math.floor(1000 + Math.random() * 9000).toString(); 
        const otpHash = await bcrypt.hash(otp, 10);
        doctor.otp = otpHash;
        doctor.otpExpires = Date.now() + 5 * 60 * 1000; 
        await doctor.save();
        console.log(`Sending EDIT OTP to ${doctor.mobileNumber}: ${otp}`); 
        res.status(200).json({ message: 'OTP sent successfully to your registered mobile number.', test_otp: otp });
    } catch (error) {
        console.error("Error in sendProfileEditOtp:", error);
        res.status(500).json({ error: 'Server error sending OTP.' });
    }
};

exports.updateDoctorProfile = async (req, res) => {
    try {
        const { displayName, address, fees, newPassword, otp } = req.body;
        if (!otp) return res.status(400).json({ error: 'OTP is required to submit changes.' });
        const doctor = await Doctor.findById(req.doctor._id).select('+otp +otpExpires');
        if (!doctor) return res.status(404).json({ error: 'Doctor not found.' });
        if (!doctor.otp || doctor.otpExpires < Date.now()) return res.status(400).json({ error: 'OTP is invalid or has expired.' });
        const isMatch = await bcrypt.compare(otp, doctor.otp);
        if (!isMatch) return res.status(400).json({ error: 'Invalid OTP.' });
        
        if (address) doctor.address = address;
        if (fees) doctor.fees = fees;
        if (displayName && displayName !== doctor.displayName) {
            doctor.displayName = displayName;
            doctor.doctorCode = generateNewCode(displayName); 
        }
        if (newPassword && newPassword.length >= 6) doctor.password = newPassword; 

        doctor.otp = undefined;
        doctor.otpExpires = undefined;
        await doctor.save();
        const updatedProfile = await Doctor.findById(doctor._id); 

        res.status(200).json({ message: 'Profile updated successfully.', doctor: updatedProfile });
    } catch (error) {
        console.error("Error in updateDoctorProfile:", error);
        res.status(500).json({ error: 'Server error updating profile.' });
    }
};

exports.getDoctorProfile = async (req, res) => {
    try {
        res.status(200).json(req.doctor);
    } catch (error) {
        console.error("Error in getDoctorProfile:", error);
        res.status(500).json({ error: 'Server error fetching profile.' });
    }
};

// --- SEARCH DOCTORS FOR MOBILE APP ---
exports.getAllDoctors = async (req, res) => {
  try {
    const searchQuery = req.query.q || "";
    let query = {};

    // If a search term is provided, filter by name (case-insensitive)
    if (searchQuery) {
      query = {
        displayName: { $regex: searchQuery, $options: "i" }
      };
    }

    // 1. Fetch doctors from the DB
    // We only select the fields we need for the list view.
    // We lean() for performance as we don't need Mongoose document methods.
    const doctors = await Doctor.find(query)
      .select("displayName address fees patients")
      .lean();

    // 2. Format the data for the frontend
    const formattedDoctors = doctors.map((doc) => {
      // Calculate number of linked patients
      const linkedPatientsCount = doc.patients ? doc.patients.length : 0;

      // Format fees. Assuming 'fees' is a string like "₹500 for 6 months, ₹800 for 12 months"
      // You might need to adjust this based on how you store 'fees'.
      // If fees is an object { sixMonths: 500, twelveMonths: 800 }, you'd format it here.
      let formattedFees = "Fees not specified";
      if (doc.fees) {
        // Example: If doc.fees is a simple string from your previous code
        formattedFees = doc.fees;
        
        // Example: If doc.fees was an object (a better approach for the future):
        // if (typeof doc.fees === 'object') {
        //   formattedFees = `6 months: ₹${doc.fees.sixMonths}, 12 months: ₹${doc.fees.twelveMonths}`;
        // }
      }

      return {
        _id: doc._id,
        name: doc.displayName,
        address: doc.address || "No address provided",
        linkedPatients: linkedPatientsCount,
        feeString: formattedFees,
      };
    });

    res.status(200).json({
      count: formattedDoctors.length,
      doctors: formattedDoctors,
    });
  } catch (error) {
    console.error("Error in getAllDoctors:", error);
    res.status(500).json({ error: "Server error fetching doctor list." });
  }
};

// --- DOCTOR REQUEST CHECKIN (Restored) ---
exports.doctorRequestCheckin = async (req, res) => {
  try {
    const { userId, message } = req.body;

    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }

    const onboarding = await Onboarding.findOne({ userId });
    if (!onboarding) {
      return res.status(404).json({ message: "Patient not found" });
    }

    onboarding.doctorRequestedCheckin = true;
    onboarding.doctorRequestedAt = new Date();
    onboarding.doctorMessage = message || "Check-in requested by doctor.";
    
    await onboarding.save();

    res.status(200).json({ 
      status: "success", 
      message: "Check-in request sent to user." 
    });

  } catch (err) {
    console.error("Error in doctorRequestCheckin:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};