const PatientLink = require('../../models/PatientLink');
const Doctor = require('../../models/Doctor');
const User = require('../../models/User');
const { Onboarding } = require('../../models/onboardingModel'); // Ensure this path is correct
const { calculateAllMetrics } = require('../../models/onboardingModel'); 
const Reminder = require('../../models/Reminder');
const bcrypt = require('bcryptjs');

function generateNewCode(name) {
    // 1. Get initial 2 alphabets
    const namePart = name.replace(/[^a-zA-Z]/g, '').substring(0, 2).toUpperCase();
    
    // 2. Get 4 random numbers
    const numPart = Math.floor(1000 + Math.random() * 9000); // 1000-9999
    
    // 3. Get 2 random alphabets
    const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const alphaPart = alpha[Math.floor(Math.random() * alpha.length)] + alpha[Math.floor(Math.random() * alpha.length)];
    
    // 4. Combine: JR-7496-CD
    return `${namePart}-${numPart}-${alphaPart}`;
}


// --- HELPER FUNCTION (for getPatientList) ---
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
    } else {
        console.warn(`[formatPatientData] calculateAllMetrics function not found. Lifestyle/TGHDL may be null for user ${patientUser._id}.`);
    }
    const sobAlert = o3.q5 === true;
    const status = onboardingDoc.timestamp ? new Date(onboardingDoc.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : "No Date";
    const statusType = "date";
    return {
        _id: patientUser._id,
        sobAlert: sobAlert,
        name: patientUser.display_name,
        phone: patientUser.phone,
        sbp: o7.bp_upper || null, dbp: o7.bp_lower || null, hr: o7.pulse || null,
        fbs: o7.bs_f || null, bspp: o7.bs_am || null, a1c: o7.A1C || null,
        hscrp: o7.HsCRP || null, tghdl: metrics?.trigHDLRatio?.current || null, lifestyle: metrics?.lifestyle?.score || null,
        status: status, statusType: statusType,
    };
};
// --- END OF HELPER FUNCTION ---


/**
 * @desc    Get the list of patients for the logged-in doctor
 * @route   GET /api/web/dashboard/patients
 */
exports.getPatientList = async (req, res) => {
  try {
    console.log(`Fetching REAL patient list for Doctor: ${req.doctor.displayName}`);
    const doctor = await Doctor.findById(req.doctor._id)
                               .populate('patients'); 
    if (!doctor) {
        return res.status(404).json({ error: "Doctor not found." });
    }
    const patientDataPromises = doctor.patients.map(patientUser => formatPatientData(patientUser));
    const patientList = (await Promise.all(patientDataPromises)).filter(p => p !== null); 
    patientList.sort((a, b) => (b.sobAlert ? 1 : 0) - (a.sobAlert ? 1 : 0));
    res.status(200).json({
      doctorInfo: {
        displayName: req.doctor.displayName,
        doctorCode: req.doctor.doctorCode
      },
      count: patientList.length,
      patients: patientList,
    });
  } catch (error) {
    console.error("Error in getPatientList:", error);
    res.status(500).json({ error: "Server error fetching patient list." });
  }
};

/**
 * @desc    Doctor adds a new patient's mobile to link them
 * @route   POST /api/web/dashboard/add-patient
 */
exports.addPatientLink = async (req, res) => {
    const { patientMobile, planDuration } = req.body;
    const doctorCode = req.doctor.doctorCode;
    if (!patientMobile || !patientMobile.startsWith('+')) {
        return res.status(400).json({ error: 'A valid mobile number in international format is required.' });
    }
    try {
        const link = await PatientLink.findOneAndUpdate(
            { patientMobile: patientMobile },
            { 
                patientMobile: patientMobile,
                doctorCode: doctorCode,
                planDuration: planDuration,
                expiresAt: new Date(Date.now() + 30*24*60*60*1000) // Reset expiry
            },
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


// ====================================================================
// START: NEW FUNCTIONS FOR PATIENT DETAILS
// ====================================================================

// --- Helper 1: Build the simple Profile object ---
function buildPatientProfile(user, onboardingDoc, allMeds) { 
  const o2 = onboardingDoc.o2Data || {};
  const o3 = onboardingDoc.o3Data || {};
  const o4 = onboardingDoc.o4Data || {};

  // -------------------------
  // CORRECTED PAST HISTORY LOGIC
  // -------------------------
  const processedHistory = [];

  const isSelected = (val) =>
    val && typeof val === "string" && val.toLowerCase() !== "false" && val.trim().length > 0;

  // q1: Heart Attack
  if (isSelected(o3.q1)) processedHistory.push(o3.q1);

  // q2: Diabetes
  if (isSelected(o3.q2)) processedHistory.push(o3.q2);

  // q3: HTN
  if (isSelected(o3.q3)) processedHistory.push("HTN");

  // q4: Stroke → DM
  if (isSelected(o3.q4)) processedHistory.push("DM");

  // q5: SOB/Chest Discomfort → also used for red alert
  if (isSelected(o3.q5)) processedHistory.push("SOB/ Chest Discomfort");

  // q6: Kidney Disease
  if (isSelected(o3.q6)) processedHistory.push(o3.q6);

  // Other conditions
  if (isSelected(o3.other_conditions)) processedHistory.push(o3.other_conditions);

  const pastHistory = processedHistory.join(", ");
  // -------------------------

  // -------------------------
  // MEDICATION LOGIC
  // -------------------------
  const minDuration = 15 * 24 * 60 * 60 * 1000;
  const medications = allMeds
    .filter((med) => {
      if (med.endDate === null) return true;
      return (new Date(med.endDate) - new Date(med.startDate)) >= minDuration;
    })
    .map((med) => med.title);

  const smokerStatus = o4.smoking || "N/A";

  const presentDate = new Date().toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });

  // -------------------------
  // FINAL PROFILE OBJECT
  // -------------------------
  return {
    name: user?.display_name || "User",
    age: o2.age || null,
    smoker: smokerStatus,
    pastHO: pastHistory || "None",
    medications: medications.length > 0 ? medications.join(", ") : "None",
    lastConsulted: onboardingDoc.lastConsultedDate || presentDate,

    // RED FLAG INDICATOR FOR DOCTOR WEB APP
    sobChestDiscomfort: o3.q5 === true
  };
}


// --- Helper 2: Build the "Prediction" Graphs (REWRITTEN) ---

// (These are the sub-helpers required for getPatientPredictionGraphs)
const METRIC_LIMITS = {
  cuoreScore: 90, bpUpper: 122, bpLower: 80, bsFasting: 100, bsAfterMeals: 140,
  a1c: 5.7, weight: 70, bmi: 22.9, bodyFat: 20, hdl: 60, ldl: 100,
  triglyceride: 150, nutrition: 90, fitness: 90, sleep: 90, stress: 90, heartRate: 80,
};

// --- PREDICTION LOGIC (From your working file) ---
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

// --- generatePredictionSeries (From your working file) ---
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
      // console.log(`Skipped O7 metric detected (latestRawValue: ${latestRawValue}). Returning zeros.`); // Optional log
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

// ---------------- DATE HELPERS (From your working file) ------------------

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

  // extract all dates (This is the FIX: added h.timestamp)
  const dates = historyArray
    .map(h => h.date || h.createdAt || h.updatedAt || h.timestamp || null)
    .filter(Boolean);

  if (dates.length === 0) return labels;

  const lastDate = new Date(dates[dates.length - 1]);

  // --- actual readings (This is the FIX: new logic) ---
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


// --- DATA FETCHING (From your working file) ---
const fetchHistory = (onboarding, metricKey) => {
  let historyArray = [];

  // Helper: Treat both numbers and numeric strings as valid
  const allowNumericString = (val) => {
    if (val === null || val === undefined) return undefined;
    if (typeof val === 'number') return val;
    // Fix: Convert valid numeric strings to numbers for processing
    if (typeof val === 'string') {
        const num = parseFloat(val.trim());
        if (!isNaN(num)) return num;
    }
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

// --- REBUILT getPatientPredictionGraphs function ---
async function getPatientPredictionGraphs(onboardingDoc) {
  if (!onboardingDoc) return { chartData: {}, metrics: [] };

  const onboarding = onboardingDoc;
  const cuoreScore = onboarding.scores?.cuoreScore || 0;
  let X;
  if (cuoreScore < 50) X = 0.9; else if (cuoreScore > 70) X = 0.3; else X = 0.6;

  // Formulas (from your working file)
  const formulas = {
      bpUpper:    { initialB: (A, X) => A - (4 * X),  direction: 'decrease' },
      bpLower:    { initialB: (A, X) => A - (2 * X),  direction: 'decrease' },
      heartRate:  { initialB: (A, X) => A - (2 * X),  direction: 'decrease' },
      bsFasting:  { initialB: (A, X) => A - (20 * X), direction: 'decrease' },
      bsAfterMeals:{ initialB: (A, X) => A - (20 * X), direction: 'decrease' },
      weight:     { initialB: (A, X) => A - (2 * X),  direction: 'decrease' },
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

  const { series: bpUpperSeries, historyCount: bpUpperHist } = generatePredictionSeries(...generateArgs('bpUpper', 'bp_upper', true));
  const { series: bpLowerSeries, historyCount: bpLowerHist } = generatePredictionSeries(...generateArgs('bpLower', 'bp_lower', true));
  const { series: hrSeries, historyCount: hrHist } = generatePredictionSeries(...generateArgs('heartRate', 'pulse', true));
  const { series: bsFastingSeries, historyCount: bsFastingHist } = generatePredictionSeries(...generateArgs('bsFasting', 'bs_f', true));
  const { series: bsAfterMealsSeries, historyCount: bsAfterMealsHist } = generatePredictionSeries(...generateArgs('bsAfterMeals', 'bs_am', true));

  // A1C derived
  const a1cFormula = (sugar) => sugar > 0 ? (sugar + 46.7) / 28.7 : 0;
  // Apply limit to derived A1C values too
  const a1cSeries = bsFastingSeries.map(sugarVal => Math.round(Math.min(Math.max(0, a1cFormula(sugarVal)), METRIC_LIMITS.a1c) * 100) / 100);
  const a1cHist = bsFastingHist; // Use the same history count

  const { series: weightSeries, historyCount: weightHist } = generatePredictionSeries(...generateArgs('weight', 'weight_kg'));
  
  const { series: hdlSeries, historyCount: hdlHist } = generatePredictionSeries(...generateArgs('hdl', 'HDL', true));
  const { series: ldlSeries, historyCount: ldlHist } = generatePredictionSeries(...generateArgs('ldl', 'LDL', true));
  const { series: trigSeries, historyCount: trigHist } = generatePredictionSeries(...generateArgs('triglyceride', 'Trig', true));

  const { series: nutritionSeries, historyCount: nutritionHist } = generatePredictionSeries(...generateArgs('nutrition', 'nutrition'));
  const { series: fitnessSeries, historyCount: fitnessHist } = generatePredictionSeries(...generateArgs('fitness', 'fitness'));
  const { series: sleepSeries, historyCount: sleepHist } = generatePredictionSeries(...generateArgs('sleep', 'sleep'));
  const { series: stressSeries, historyCount: stressHist } = generatePredictionSeries(...generateArgs('stress', 'stress'));

  // --- BUILD DATE LABELS FOR EACH CATEGORY ---
  const o7HistoryRaw = onboarding.o7History || [];
  const o2HistoryRaw = onboarding.o2History || [];
  const o5HistoryRaw = onboarding.o5History || [];

  // Use the *correct* history counts returned from generatePredictionSeries
  const bpLabels        = buildDateLabels(o7HistoryRaw, bpUpperHist); // Use one hist count for all in this graph
  const sugarLabels     = buildDateLabels(o7HistoryRaw, bsFastingHist);
  const weightLabels    = buildDateLabels(o2HistoryRaw, weightHist);
  const cholesterolLabels = buildDateLabels(o7HistoryRaw, hdlHist);
  const lifestyleLabels = buildDateLabels(o5HistoryRaw, nutritionHist);
  
  // A1C shares the same timeline as sugar
  const a1cLabels = sugarLabels;

  // --- Build the new chartData object ---
  const chartData = {
      bp: bpLabels.map((day, i) => ({
        day, // <-- This will now have the correct date!
        sys: bpUpperSeries[i],
        dia: bpLowerSeries[i],
        hr: hrSeries[i]
      })),

      weight: weightLabels.map((day, i) => ({
        day,
        weight: weightSeries[i]
      })),

      sugar: sugarLabels.map((day, i) => ({
        day,
        fasting: bsFastingSeries[i],
        pp: bsAfterMealsSeries[i]
      })),

      cholesterol: cholesterolLabels.map((day, i) => ({
        day,
        ldl: ldlSeries[i],
        hdl: hdlSeries[i],
        trig: trigSeries[i]
      })),

      a1c: a1cLabels.map((day, i) => ({
        day,
        a1c: a1cSeries[i]
      })),

      lifestyle: lifestyleLabels.map((day, i) => ({
        day,
        nutrition: nutritionSeries[i],
        fitness: fitnessSeries[i],
        sleep: sleepSeries[i],
        stress: stressSeries[i]
      })),
  };

  // --- Build the new metrics array (Unchanged from your original file) ---
  const metrics = [
    {
        key: "bp",
        title: "Blood Pressure & Heart Rate",
        dataKey: chartData.bp,
        lines: [
            { key: "sys", label: "Systolic", stroke: "#FF4D4D" },
            { key: "dia", label: "Diastolic", stroke: "#4D79FF" },
            { key: "hr", label: "Heart Rate", stroke: "#10B981" },
        ],
        domain: [50, 160],
    },
    {
        key: "weight",
        title: "Weight",
        dataKey: chartData.weight,
        lines: [{ key: "weight", label: "Weight (kg)", stroke: "#FFA500" }],
        domain: [60, 100],
    },
    {
        key: "sugar",
        title: "Blood Sugar",
        dataKey: chartData.sugar,
        lines: [
            { key: "fasting", label: "Fasting", stroke: "#FF7F7F" },
            { key: "pp", label: "PP", stroke: "#1E90FF" },
        ],
        domain: [80, 250],
    },
    {
        key: "a1c",
        title: "A1C",
        dataKey: chartData.a1c,
        lines: [{ key: "a1c", label: "A1C %", stroke: "#9b59b6" }],
        domain: [4, 10],
    },
    {
        key: "cholesterol",
        title: "Cholesterol",
        dataKey: chartData.cholesterol,
        lines: [
            { key: "ldl", label: "LDL", stroke: "#FFA500" },
            { key: "hdl", label: "HDL", stroke: "#10B981" },
            { key: "trig", label: "Triglycerides", stroke: "#FF4D4D" }
        ],
        domain: [20, 300],
    },
    {
        key: "lifestyle",
        title: "Lifestyle Metrics",
        dataKey: chartData.lifestyle,
        lines: [
            { key: "nutrition", label: "Nutrition", stroke: "#f1c40f" },
            { key: "fitness", label: "Fitness", stroke: "#2ecc71" },
            { key: "sleep", label: "Sleep", stroke: "#e74c3c" },
            { key: "stress", label: "Stress", stroke: "#2980b9" },
        ],
        domain: [Math.min(0, ...nutritionSeries, ...fitnessSeries, ...sleepSeries, ...stressSeries) - 2, // Ensure domain starts at least at 0
                Math.max(100, ...nutritionSeries, ...fitnessSeries, ...sleepSeries, ...stressSeries) + 2], // Ensure domain goes at least to 100
    }
  ];

  // Return the data in the original format
  return { chartData, metrics };
}

function buildDummySummary() {
  // Get present date and format it, e.g., "Uploaded on November 16, 2025"
  const presentDate = new Date().toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
  const formattedDate = `Uploaded on ${presentDate}`;

  return {
    summary: {
      history: "Cholecystectomy (Gallbladder removal)\nLeft thigh fracture",
      medications: "Diabetes on metformin\nHypertension (HTN) on Cardace",
      labs: "RBS: 230"
    },
    diseaseProgressionRisk: "You have a 52% risk of developing a diabetes + kidney decline cluster within 4 years.",
    healthRecords: [
      {
        _id: "dummy_presc_1",
        type: "Prescription",
        date: formattedDate,
        url: "#" // Placeholder URL
      },
      {
        _id: "dummy_presc_2",
        type: "Prescription",
        date: formattedDate,
        url: "#"
      }
    ]
  };
}
// ====================================================================
// END: HELPERS
// ====================================================================



/**
 * @desc    Get full details for a single patient
 * @route   GET /api/web/dashboard/patient/:patientId
 * @access  Private (Doctor only)
 */
exports.getPatientDetails = async (req, res) => {
    try {
        const { patientId } = req.params;
        const doctor = req.doctor; // From auth middleware

        // 1. --- SECURITY CHECK ---
        const isPatientLinked = doctor.patients.some(id => id.toString() === patientId);
        if (!isPatientLinked) {
            return res.status(403).json({ error: "You are not authorized to view this patient." });
        }

        // 2. --- GET DATA (in parallel) ---
        const [patientProfile, onboardingDoc, allMeds] = await Promise.all([
            User.findById(patientId).lean(),
            Onboarding.findOne({ userId: patientId }).lean(),
            Reminder.find({ userId: patientId, isMedication: true, isActive: true }).lean()
        ]);

        if (!patientProfile) {
            return res.status(4404).json({ error: "Patient profile not found." });
        }
        if (!onboardingDoc) {
             return res.status(404).json({ error: "Patient has not completed onboarding." });
        }

        // 3. --- RUN ALL HELPERS ---
        
        const doctorInfo = {
             displayName: doctor.displayName,
             doctorCode: doctor.doctorCode
        };
        
        // This helper builds the simple { name, age, smoker, ... } object
        const profileData = buildPatientProfile(patientProfile, onboardingDoc, allMeds);
        
        // This helper runs all your prediction logic
        const predictDataPoints = await getPatientPredictionGraphs(onboardingDoc);
        
        // --- START: MODIFICATION ---
        // This helper builds the new dummy data object
        const summaryOfRecords = buildDummySummary();
        // --- END: MODIFICATION ---
        
        // 4. --- COMBINE AND SEND ---
        res.status(200).json({
            doctorInfo,
            patientProfile: profileData,
            predictDataPoints,
            summaryOfRecords: summaryOfRecords // <-- ADDED THIS NEW KEY
        });

    } catch (err) {
        console.error("Error in getPatientDetails:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
};

exports.sendProfileEditOtp = async (req, res) => {
    try {
        // 1. Get the logged-in doctor
        const doctor = await Doctor.findById(req.doctor._id);
        if (!doctor) {
            return res.status(404).json({ error: 'Doctor not found.' });
        }

        // 2. Generate OTP and hash it
        const otp = Math.floor(1000 + Math.random() * 9000).toString(); // 4-digit
        const otpHash = await bcrypt.hash(otp, 10);
        
        // 3. Save the OTP and expiry *directly to the Doctor model*
        doctor.otp = otpHash;
        doctor.otpExpires = Date.now() + 5 * 60 * 1000; // 5 minutes
        await doctor.save();
        
        // 4. --- TODO: Send the *real* OTP via your SMS service ---
        console.log(`Sending EDIT OTP to ${doctor.mobileNumber}: ${otp}`); // For testing
        
        res.status(200).json({
            message: 'OTP sent successfully to your registered mobile number.',
            test_otp: otp // For easy testing
        });

    } catch (error) {
        console.error("Error in sendProfileEditOtp:", error);
        res.status(500).json({ error: 'Server error sending OTP.' });
    }
};

exports.updateDoctorProfile = async (req, res) => {
    try {
        // 1. Get all potential data from the body
        const { 
            displayName, 
            address, 
            fees, 
            newPassword, 
            otp 
        } = req.body;

        if (!otp) {
            return res.status(400).json({ error: 'OTP is required to submit changes.' });
        }

        // 2. Get the doctor and their saved OTP
        const doctor = await Doctor.findById(req.doctor._id).select('+otp +otpExpires');
        if (!doctor) {
            return res.status(404).json({ error: 'Doctor not found.' });
        }

        // 3. --- VERIFY THE OTP ---
        if (!doctor.otp || doctor.otpExpires < Date.now()) {
            return res.status(400).json({ error: 'OTP is invalid or has expired.' });
        }
        
        const isMatch = await bcrypt.compare(otp, doctor.otp);
        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid OTP.' });
        }

        // 4. --- OTP IS VALID - UPDATE THE DATA ---
        
        // Update non-sensitive fields
        if (address) doctor.address = address;
        if (fees) doctor.fees = fees;

        // --- START: MODIFIED LOGIC ---
        // Check if displayName is being sent AND is different from the old one
        if (displayName && displayName !== doctor.displayName) {
            doctor.displayName = displayName;
            // RE-GENERATE DOCTOR CODE
            doctor.doctorCode = generateNewCode(displayName); 
            console.log(`[Update] New Doctor Code generated: ${doctor.doctorCode}`);
        }
        // --- END: MODIFIED LOGIC ---

        // Update password (if provided)
        if (newPassword && newPassword.length >= 6) {
            doctor.password = newPassword; // The 'pre-save' hook will auto-hash this
        }

        // Clear the OTP
        doctor.otp = undefined;
        doctor.otpExpires = undefined;

        // Save all changes
        await doctor.save();
        
        // 5. Send back the updated profile (without password)
        const updatedProfile = await Doctor.findById(doctor._id); // Re-fetch to get clean data

        res.status(200).json({
            message: 'Profile updated successfully.',
            doctor: updatedProfile
        });

    } catch (error) {
        console.error("Error in updateDoctorProfile:", error);
        res.status(500).json({ error: 'Server error updating profile.' });
    }
};

exports.getDoctorProfile = async (req, res) => {
    try {
        // The 'protect' middleware already fetched the doctor for us.
        // req.doctor is the full document.
        res.status(200).json(req.doctor);
    } catch (error) {
        console.error("Error in getDoctorProfile:", error);
        res.status(500).json({ error: 'Server error fetching profile.' });
    }
};