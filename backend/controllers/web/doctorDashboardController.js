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


// --- HELPER: Format Patient List Data ---
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

    sbp: o7.bp_upper || null,
    sbpColor: getColorStatus(o7.bp_upper, "sbp"),

    dbp: o7.bp_lower || null,
    dbpColor: getColorStatus(o7.bp_lower, "dbp"),

    hr: o7.pulse || null,
    hrColor: getColorStatus(o7.pulse, "hr"),

    fbs: o7.bs_f || null,
    fbsColor: getColorStatus(o7.bs_f, "fbs"),

    bspp: o7.bs_am || null,
    bsppColor: getColorStatus(o7.bs_am, "bspp"),

    a1c: o7.A1C || null,
    a1cColor: getColorStatus(o7.A1C, "a1c"),

    hscrp: o7.HsCRP || null,
    hscrpColor: getColorStatus(o7.HsCRP, "hscrp"),

    tghdl: metrics?.trigHDLRatio?.current || null,
    tghdlColor: getColorStatus(metrics?.trigHDLRatio?.current, "tghdl"),

    lifestyle: metrics?.lifestyle?.score || null,
    lifestyleColor: getColorStatus(metrics?.lifestyle?.score, "lifestyle"),

    status: status,
    statusType: "date",
};

};


// ====================================================================
// START: NEW ALERT LOGIC HELPER (Message Removed from Output)
// ====================================================================
// ====================================================================
// START: NEW ALERT LOGIC HELPER (With Message & CuoreMD Colors)
// ====================================================================
const generateMedicalAlerts = (onboarding, lastConsultDate, metrics) => {
  const alertMap = {};
  const today = new Date();

  // Helper: Includes 'message' in the saved object now
  const addAlert = (level, message, label) => {
    const existing = alertMap[label];

    if (!existing) {
      alertMap[label] = { level, message, label, timestamp: new Date() };
      return;
    }

    // Upgrade to Red if existing was Orange
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
  // GROUP 1: BLOOD PRESSURE 
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

  // --- 8. Pulse Rate (HR) ---
  const pulse = o7.pulse;
  if (pulse) {
    if (pulse <= 60 || pulse >= 110) {
      addAlert('Red', "Abnormal HR", "Abnormal HR");
    } else if (pulse >= 100 || pulse <= 65) {
      addAlert('Orange', "Abnormal HR", "Abnormal HR");
    }
  }

  // ============================================================
  // GROUP 2: GLUCOSE 
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

  // --- A1C ---
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

  // --- 12. O2 Saturation ---
  const o2 = o7.o2_sat;
  if (o2) {
    if (o2 < 91) {
      addAlert('Red', "O2 sat <91%", "O2 sat <91%");
    } else if (o2 >= 91 && o2 <= 94) {
      addAlert('Orange', "Low O2 sat%", "Low O2 sat%");
    }
  }

  // --- 13. HsCRP ---
  const hscrp = o7.HsCRP;
  if (hscrp && hscrp >= 0.3) { 
    addAlert('Red', "High HsCRP", "High HsCRP");
  }

  // --- 14. TG/HDL Ratio ---
  const tgHdl = metrics?.trigHDLRatio?.current;
  if (tgHdl) {
     if (tgHdl >= 4.0) {
        addAlert('Red', "Hyperlipidaemia", "Hyperlipidaemia");
     } else if (tgHdl >= 3.0) {
        addAlert('Orange', "Hyperlipidaemia", "Hyperlipidaemia");
     }
  }

  // --- 15. Lifestyle Score ---
  const lifestyle = metrics?.lifestyle?.score;
  if (lifestyle !== undefined && lifestyle !== null) {
      if (lifestyle <= 50) {
          addAlert('Red', "Poor Lifestyle", "Poor Lifestyle");
      } else if (lifestyle <= 70) {
          addAlert('Orange', "Poor Lifestyle", "Poor Lifestyle");
      }
  }

  return Object.values(alertMap);
};
// ====================================================================
// END: NEW ALERT LOGIC HELPER
// ====================================================================
// ====================================================================
// END: NEW ALERT LOGIC HELPER
// ====================================================================



// --- HELPER: Build Patient Profile ---
function buildPatientProfile(user, onboardingDoc, allMeds) {
  const o2 = onboardingDoc.o2Data || {};
  const o3 = onboardingDoc.o3Data || {};
  const o4 = onboardingDoc.o4Data || {};

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

  return {
    name: user?.display_name || "User",
    id: user?._id || null,
    age: o2.age || null,
    smoker: o4.smoking || "N/A",
    pastHO: pastHistory,
    medications: medications.length > 0 ? medications.join(", ") : "None",
    lastConsulted: onboardingDoc.lastConsultedDate || new Date().toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" }),
  };
}

// --- PREDICTION GRAPH HELPERS (UNCHANGED) ---
const METRIC_LIMITS = { cuoreScore: 90, bpUpper: 122, bpLower: 80, bsFasting: 100, bsAfterMeals: 140, a1c: 5.7, weight: 70, bmi: 22.9, bodyFat: 20, hdl: 60, ldl: 100, triglyceride: 150, nutrition: 90, fitness: 90, sleep: 90, stress: 90, heartRate: 80 };
const momentumPredict = (B, A, direction, limit) => { A = A || 0; B = B || 0; if (A === B) { if (direction === 'increase') return Math.min(B, limit); else return Math.max(B, limit); } let prediction; if (direction === 'increase') { prediction = B + ((B - A) * 0.8); prediction = Math.min(prediction, limit); } else { prediction = B - ((A - B) * 0.8); prediction = Math.max(prediction, limit); } return Math.max(0, prediction); };
const generatePredictionSeries = (history, X, initialBFormula, direction, limit, isO7Metric = false) => { const points = new Array(6).fill(0); const validHistory = history.filter(val => typeof val === 'number' && !isNaN(val)); const n = validHistory.length; const predictNext = (B, A) => momentumPredict(B, A, direction, limit); const latestRawValue = history.length > 0 ? history[history.length - 1] : undefined; if (isO7Metric && (latestRawValue === null || latestRawValue === undefined)) return { series: points, historyCount: 0 }; if (n === 0) return { series: points, historyCount: 0 }; else if (n === 1) { points[0] = validHistory[0]; let initialB = initialBFormula(points[0], X); if (direction === 'increase') initialB = Math.min(initialB, limit); else initialB = Math.max(initialB, limit); points[1] = Math.max(0, initialB); points[2] = predictNext(points[1], points[0]); points[3] = predictNext(points[2], points[1]); points[4] = predictNext(points[3], points[2]); points[5] = predictNext(points[4], points[3]); return { series: points.map(p => Math.round(Math.max(0, p) * 100) / 100), historyCount: 1 }; } else if (n === 2) { points[0] = validHistory[0]; points[1] = validHistory[1]; points[2] = predictNext(points[1], points[0]); points[3] = predictNext(points[2], points[1]); points[4] = predictNext(points[3], points[2]); points[5] = predictNext(points[4], points[3]); return { series: points.map(p => Math.round(Math.max(0, p) * 100) / 100), historyCount: 2 }; } else { points[0] = validHistory[n - 3]; points[1] = validHistory[n - 2]; points[2] = validHistory[n - 1]; points[3] = predictNext(points[2], points[1]); points[4] = predictNext(points[3], points[2]); points[5] = predictNext(points[4], points[3]); return { series: points.map(p => Math.round(Math.max(0, p) * 100) / 100), historyCount: 3 }; } };
const formatDateLabel = (date) => { const d = new Date(date); if (isNaN(d)) return ""; return d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }); };
const addMonths = (date, months) => { const d = new Date(date); d.setMonth(d.getMonth() + months); return d; };
const buildDateLabels = (historyArray, historyCount) => { const labels = new Array(6).fill(""); if (!historyArray || historyArray.length === 0) return labels; const dates = historyArray.map(h => h.date || h.createdAt || h.updatedAt || h.timestamp || null).filter(Boolean); if (dates.length === 0) return labels; const lastDate = new Date(dates[dates.length - 1]); if (historyCount === 1) labels[0] = formatDateLabel(dates[dates.length - 1]); else if (historyCount === 2) { labels[0] = formatDateLabel(dates[dates.length - 2]); labels[1] = formatDateLabel(dates[dates.length - 1]); } else if (historyCount >= 3) { labels[0] = formatDateLabel(dates[dates.length - 3]); labels[1] = formatDateLabel(dates[dates.length - 2]); labels[2] = formatDateLabel(dates[dates.length - 1]); } let monthsToAdd = 2; for (let i = historyCount; i < 6; i++) { labels[i] = formatDateLabel(addMonths(lastDate, monthsToAdd)); monthsToAdd += 2; } return labels; };
const fetchHistory = (onboarding, metricKey) => { let historyArray = []; const allowNumericString = (val) => { if (val === null || val === undefined) return undefined; if (typeof val === 'number') return val; if (typeof val === 'string') { const num = parseFloat(val.trim()); if (!isNaN(num)) return num; } return undefined; }; switch (metricKey) { case 'cuoreScore': historyArray = onboarding.scoreHistory || []; return historyArray.map(h => allowNumericString(h.data?.cuoreScore)); case 'weight_kg': historyArray = onboarding.o2History || []; return historyArray.map(h => allowNumericString(h.data?.weight_kg)); case 'bmi': historyArray = onboarding.o2History || []; return historyArray.map(h => allowNumericString(h.data?.bmi)); case 'nutrition': historyArray = onboarding.o5History || []; return historyArray.map(h => allowNumericString(h.data?.foodScore)); case 'fitness': historyArray = onboarding.o5History || []; return historyArray.map(h => allowNumericString(h.data?.exerciseScore)); case 'sleep': historyArray = onboarding.o6History || []; return historyArray.map(h => allowNumericString(h.data?.sleepScore)); case 'stress': historyArray = onboarding.o6History || []; return historyArray.map(h => allowNumericString(h.data?.stressScore)); default: historyArray = onboarding.o7History || []; return historyArray.map(h => { const val = h.data ? h.data[metricKey] : undefined; return allowNumericString(val); }); } };
async function getPatientPredictionGraphs(onboardingDoc) { if (!onboardingDoc) return { chartData: {}, metrics: [] }; const onboarding = onboardingDoc; const cuoreScore = onboarding.scores?.cuoreScore || 0; let X; if (cuoreScore < 50) X = 0.9; else if (cuoreScore > 70) X = 0.3; else X = 0.6; const formulas = { bpUpper: { initialB: (A, X) => A - (4 * X), direction: 'decrease' }, bpLower: { initialB: (A, X) => A - (2 * X), direction: 'decrease' }, heartRate: { initialB: (A, X) => A - (2 * X), direction: 'decrease' }, bsFasting: { initialB: (A, X) => A - (20 * X), direction: 'decrease' }, bsAfterMeals: { initialB: (A, X) => A - (20 * X), direction: 'decrease' }, weight: { initialB: (A, X) => A - (2 * X), direction: 'decrease' }, hdl: { initialB: (A, X) => A + (2 * X), direction: 'increase' }, ldl: { initialB: (A, X) => A - (5 * X), direction: 'decrease' }, triglyceride: { initialB: (A, X) => A - (5 * X), direction: 'decrease' }, nutrition: { initialB: (A, X) => A + (5 * X), direction: 'increase' }, fitness: { initialB: (A, X) => A + (5 * X), direction: 'increase' }, sleep: { initialB: (A, X) => A + (5 * X), direction: 'increase' }, stress: { initialB: (A, X) => A + (5 * X), direction: 'increase' } }; const generateArgs = (key, dbKey, isO7 = false) => [fetchHistory(onboarding, dbKey || key), X, formulas[key].initialB, formulas[key].direction, METRIC_LIMITS[key], isO7]; const { series: bpUpperSeries, historyCount: bpUpperHist } = generatePredictionSeries(...generateArgs('bpUpper', 'bp_upper', true)); const { series: bpLowerSeries, historyCount: bpLowerHist } = generatePredictionSeries(...generateArgs('bpLower', 'bp_lower', true)); const { series: hrSeries, historyCount: hrHist } = generatePredictionSeries(...generateArgs('heartRate', 'pulse', true)); const { series: bsFastingSeries, historyCount: bsFastingHist } = generatePredictionSeries(...generateArgs('bsFasting', 'bs_f', true)); const { series: bsAfterMealsSeries, historyCount: bsAfterMealsHist } = generatePredictionSeries(...generateArgs('bsAfterMeals', 'bs_am', true)); const a1cFormula = (sugar) => sugar > 0 ? (sugar + 46.7) / 28.7 : 0; const a1cSeries = bsFastingSeries.map(sugarVal => Math.round(Math.min(Math.max(0, a1cFormula(sugarVal)), METRIC_LIMITS.a1c) * 100) / 100); const { series: weightSeries, historyCount: weightHist } = generatePredictionSeries(...generateArgs('weight', 'weight_kg')); const { series: hdlSeries, historyCount: hdlHist } = generatePredictionSeries(...generateArgs('hdl', 'HDL', true)); const { series: ldlSeries, historyCount: ldlHist } = generatePredictionSeries(...generateArgs('ldl', 'LDL', true)); const { series: trigSeries, historyCount: trigHist } = generatePredictionSeries(...generateArgs('triglyceride', 'Trig', true)); const { series: nutritionSeries, historyCount: nutritionHist } = generatePredictionSeries(...generateArgs('nutrition', 'nutrition')); const { series: fitnessSeries, historyCount: fitnessHist } = generatePredictionSeries(...generateArgs('fitness', 'fitness')); const { series: sleepSeries, historyCount: sleepHist } = generatePredictionSeries(...generateArgs('sleep', 'sleep')); const { series: stressSeries, historyCount: stressHist } = generatePredictionSeries(...generateArgs('stress', 'stress')); const o7HistoryRaw = onboarding.o7History || []; const o2HistoryRaw = onboarding.o2History || []; const o5HistoryRaw = onboarding.o5History || []; const bpLabels = buildDateLabels(o7HistoryRaw, bpUpperHist); const sugarLabels = buildDateLabels(o7HistoryRaw, bsFastingHist); const weightLabels = buildDateLabels(o2HistoryRaw, weightHist); const cholesterolLabels = buildDateLabels(o7HistoryRaw, hdlHist); const lifestyleLabels = buildDateLabels(o5HistoryRaw, nutritionHist); const a1cLabels = sugarLabels; const chartData = { bp: bpLabels.map((day, i) => ({ day, sys: bpUpperSeries[i], dia: bpLowerSeries[i], hr: hrSeries[i] })), weight: weightLabels.map((day, i) => ({ day, weight: weightSeries[i] })), sugar: sugarLabels.map((day, i) => ({ day, fasting: bsFastingSeries[i], pp: bsAfterMealsSeries[i] })), cholesterol: cholesterolLabels.map((day, i) => ({ day, ldl: ldlSeries[i], hdl: hdlSeries[i], trig: trigSeries[i] })), a1c: a1cLabels.map((day, i) => ({ day, a1c: a1cSeries[i] })), lifestyle: lifestyleLabels.map((day, i) => ({ day, nutrition: nutritionSeries[i], fitness: fitnessSeries[i], sleep: sleepSeries[i], stress: stressSeries[i] })) }; const metrics = [{ key: "bp", title: "Blood Pressure & Heart Rate", dataKey: chartData.bp, lines: [{ key: "sys", label: "Systolic", stroke: "#FF4D4D" }, { key: "dia", label: "Diastolic", stroke: "#4D79FF" }, { key: "hr", label: "Heart Rate", stroke: "#10B981" }], domain: [50, 160] }, { key: "weight", title: "Weight", dataKey: chartData.weight, lines: [{ key: "weight", label: "Weight (kg)", stroke: "#FFA500" }], domain: [60, 100] }, { key: "sugar", title: "Blood Sugar", dataKey: chartData.sugar, lines: [{ key: "fasting", label: "Fasting", stroke: "#FF7F7F" }, { key: "pp", label: "PP", stroke: "#1E90FF" }], domain: [80, 250] }, { key: "a1c", title: "A1C", dataKey: chartData.a1c, lines: [{ key: "a1c", label: "A1C %", stroke: "#9b59b6" }], domain: [4, 10] }, { key: "cholesterol", title: "Cholesterol", dataKey: chartData.cholesterol, lines: [{ key: "ldl", label: "LDL", stroke: "#FFA500" }, { key: "hdl", label: "HDL", stroke: "#10B981" }, { key: "trig", label: "Triglycerides", stroke: "#FF4D4D" }], domain: [20, 300] }, { key: "lifestyle", title: "Lifestyle Metrics", dataKey: chartData.lifestyle, lines: [{ key: "nutrition", label: "Nutrition", stroke: "#f1c40f" }, { key: "fitness", label: "Fitness", stroke: "#2ecc71" }, { key: "sleep", label: "Sleep", stroke: "#e74c3c" }, { key: "stress", label: "Stress", stroke: "#2980b9" }], domain: [0, Math.max(100, ...nutritionSeries, ...fitnessSeries, ...sleepSeries, ...stressSeries) + 2] }]; return { chartData, metrics }; }
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
        const doctor = req.doctor;

        // 1. Security Check
        const isPatientLinked = doctor.patients.some(id => id.toString() === patientId);
        if (!isPatientLinked) {
            return res.status(403).json({ error: "You are not authorized to view this patient." });
        }

        // 2. Fetch Data
        const [patientProfile, onboardingDoc, allMeds] = await Promise.all([
            User.findById(patientId).lean(),
            Onboarding.findOne({ userId: patientId }).lean(),
            Reminder.find({ userId: patientId, isMedication: true, isActive: true }).lean()
        ]);

        if (!patientProfile) return res.status(404).json({ error: "Patient profile not found." });
        if (!onboardingDoc) return res.status(404).json({ error: "Patient has not completed onboarding." });

        const doctorInfo = { displayName: doctor.displayName, doctorCode: doctor.doctorCode };
        
        // 3. Build Data
        const profileData = buildPatientProfile(patientProfile, onboardingDoc, allMeds);
        const predictDataPoints = await getPatientPredictionGraphs(onboardingDoc);
        const summaryOfRecords = buildDummySummary();

        // 4. --- NEW ALERT GENERATION ---
        const lastConsultDate = onboardingDoc.lastConsultedDate || null; 
        const medicalAlerts = generateMedicalAlerts(onboardingDoc, lastConsultDate);

        // 5. Add Raw Values to Profile
        const o7 = onboardingDoc.o7Data || {};
        const metrics = calculateAllMetrics(onboardingDoc);
        const TG_HDL = metrics.trigHDLRatio?.current;
        const lifestyleScore = metrics.lifestyle?.score;

        profileData.sbp = o7.bp_upper || null;
        profileData.dbp = o7.bp_lower || null;
        profileData.hr = o7.pulse || null;
        profileData.fbs = o7.bs_f || null;
        profileData.bspp = o7.bs_am || null;
        profileData.a1c = o7.A1C || null;
        profileData.hscrp = o7.HsCRP || null;
        profileData.tghdl = TG_HDL || null;
        profileData.lifestyle = lifestyleScore || null;

        profileData.sbpColor = getColorStatus(o7.bp_upper, "sbp");
profileData.dbpColor = getColorStatus(o7.bp_lower, "dbp");
profileData.hrColor = getColorStatus(o7.pulse, "hr");
profileData.fbsColor = getColorStatus(o7.bs_f, "fbs");
profileData.bsppColor = getColorStatus(o7.bs_am, "bspp");
profileData.a1cColor = getColorStatus(o7.A1C, "a1c");
profileData.hscrpColor = getColorStatus(o7.HsCRP, "hscrp");
profileData.tghdlColor = getColorStatus(TG_HDL, "tghdl");
profileData.lifestyleColor = getColorStatus(lifestyleScore, "lifestyle");


        res.status(200).json({
            doctorInfo,
            patientProfile: profileData,
            predictDataPoints,
            // alerts: medicalAlerts,
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


// exports.clearDoctorCheckin = async (req, res) => {
//   try {
//     const userId = req.user.userId;

//     const onboarding = await Onboarding.findOne({ userId });
//     if (!onboarding) return res.status(404).json({ message: "User not found" });

//     onboarding.doctorRequestedCheckin = false;
//     onboarding.doctorRequestedAt = null;
//     onboarding.doctorMessage = null;

//     await onboarding.save();

//     res.status(200).json({ status: "cleared" });
//   } catch (error) {
//     console.error("Error clearing doctor check-in:", error);
//     res.status(500).json({ error: "Internal server error" });
//   }
// };

