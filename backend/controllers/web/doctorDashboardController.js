const PatientLink = require('../../models/PatientLink');
const Doctor = require('../../models/Doctor');
const User = require('../../models/User');
const { Onboarding } = require('../../models/onboardingModel'); // Ensure this path is correct
const { calculateAllMetrics } = require('../../models/onboardingModel'); 
const Reminder = require('../../models/Reminder');// This is still needed for 'formatPatientData'


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
// --- Helper 1: Build the simple Profile object (NOW UPDATED) ---
function buildPatientProfile(user, onboardingDoc, allMeds) {
  const o2 = onboardingDoc.o2Data || {};
  const o3 = onboardingDoc.o3Data || {}; // This is o3Data
  const o4 = onboardingDoc.o4Data || {}; // This is o4Data

  // --- Logic copied from your getCuoreHealthData ---
  const minDuration = 15 * 24 * 60 * 60 * 1000; // 15 days
  const medications = allMeds
    .filter((med) => {
      if (med.endDate === null) return true; // Active med with no end date
      const duration =
        new Date(med.endDate).getTime() - new Date(med.startDate).getTime();
      return duration >= minDuration;
    })
    .map((med) => med.title);

  // This is the correct logic for Past History
  const historyItems = [
    o3.q1,
    o3.q2,
    o3.q3,
    o3.q4,
    o3.q5,
    o3.q6,
    o3.other_conditions,
  ];
  
  const pastHistory = historyItems
    .filter(item => item && typeof item === 'string' && item.trim().length > 0 && item.toLowerCase() !== "false")
    .join(", ");

  // This is the correct logic for Smoker Status
  const smokerStatus = o4.smoking || "N/A";
  
  return {
    name: user?.display_name || "User",
    age: o2.age || null,
    smoker: smokerStatus,
    pastHO: pastHistory.length > 0 ? pastHistory : "None",
    medications: medications.length > 0 ? medications.join(', ') : "None",
    lastConsulted: onboardingDoc.lastConsultedDate || null,
  };
}

// --- Helper 2: Build the "Prediction" Graphs (REWRITTEN) ---

// (These are the sub-helpers required for getPatientPredictionGraphs)
const METRIC_LIMITS = {
  bpUpper: 122, bpLower: 80, bsFasting: 100, bsAfterMeals: 140,
  a1c: 5.7, weight: 70, hdl: 60, ldl: 100,
  triglyceride: 150, heartRate: 80,
};
const momentumPredict = (B, A, direction, limit) => {
  A = A || 0; B = B || 0;
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
const generatePredictionSeries = (history, X, initialBFormula, direction, limit, isO7Metric = false) => {
  const points = new Array(6).fill(0);
  const validHistory = history.filter(val => typeof val === 'number' && !isNaN(val));
  const n = validHistory.length;
  const predictNext = (B, A) => momentumPredict(B, A, direction, limit);
  const latestRawValue = history.length > 0 ? history[history.length - 1] : undefined;
  if (isO7Metric && (latestRawValue === null || latestRawValue === undefined)) {
    return { series: points, historyCount: 0 };
  }
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
const fetchHistory = (onboarding, metricKey) => {
  let historyArray = [];
  switch (metricKey) {
    case 'weight_kg': historyArray = onboarding.o2History || []; return historyArray.map(h => h.data?.weight_kg);
    default:
        historyArray = onboarding.o7History || [];
        return historyArray.map(h => h.data ? h.data[metricKey] : undefined);
  }
};

// This is the main helper that runs all the prediction logic
async function getPatientPredictionGraphs(onboardingDoc) {
  if (!onboardingDoc) return { chartData: {}, metrics: [] };

  const onboarding = onboardingDoc;
  const cuoreScore = onboarding.scores?.cuoreScore || 0;
  let X;
  if (cuoreScore < 50) X = 0.9; else if (cuoreScore > 70) X = 0.3; else X = 0.6;

  const formulas = {
    bpUpper: { initialB: (A, X) => A - (4 * X), direction: 'decrease' },
    bpLower: { initialB: (A, X) => A - (2 * X), direction: 'decrease' },
    heartRate: { initialB: (A, X) => A - (2 * X), direction: 'decrease' },
    bsFasting: { initialB: (A, X) => A - (20 * X), direction: 'decrease' },
    bsAfterMeals: { initialB: (A, X) => A - (20 * X), direction: 'decrease' },
    weight: { initialB: (A, X) => A - (2 * X), direction: 'decrease' },
    hdl: { initialB: (A, X) => A + (2 * X), direction: 'increase' },
    ldl: { initialB: (A, X) => A - (5 * X), direction: 'decrease' },
    triglyceride: { initialB: (A, X) => A - (5 * X), direction: 'decrease' },
  };

  const generateArgs = (key, dbKey, isO7 = false) => [
      fetchHistory(onboarding, dbKey || key),
      X, formulas[key].initialB, formulas[key].direction, METRIC_LIMITS[key], isO7
  ];

  // Calculate only the series we need
  const { series: bpUpperSeries } = generatePredictionSeries(...generateArgs('bpUpper', 'bp_upper', true));
  const { series: bpLowerSeries } = generatePredictionSeries(...generateArgs('bpLower', 'bp_lower', true));
  const { series: hrSeries } = generatePredictionSeries(...generateArgs('heartRate', 'pulse', true));
  const { series: bsFastingSeries } = generatePredictionSeries(...generateArgs('bsFasting', 'bs_f', true));
  const { series: bsAfterMealsSeries } = generatePredictionSeries(...generateArgs('bsAfterMeals', 'bs_am', true));
  const { series: weightSeries } = generatePredictionSeries(...generateArgs('weight', 'weight_kg'));
  const { series: hdlSeries } = generatePredictionSeries(...generateArgs('hdl', 'HDL', true));
  const { series: ldlSeries } = generatePredictionSeries(...generateArgs('ldl', 'LDL', true));
  const { series: trigSeries } = generatePredictionSeries(...generateArgs('triglyceride', 'Trig', true));

  // --- Build the new chartData object ---
  const labels = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'];
  const chartData = {
    bp: labels.map((day, i) => ({
        day,
        sys: bpUpperSeries[i],
        dia: bpLowerSeries[i],
        hr: hrSeries[i]
    })),
    weight: labels.map((day, i) => ({
        day,
        weight: weightSeries[i]
    })),
    sugar: labels.map((day, i) => ({
        day,
        fasting: bsFastingSeries[i],
        pp: bsAfterMealsSeries[i]
    })),
    cholesterol: labels.map((day, i) => ({
        day,
        ldl: ldlSeries[i],
        hdl: hdlSeries[i],
        trig: trigSeries[i] // Using 'trig' key
    })),
  };

  // --- Build the new metrics array ---
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
        key: "cholesterol",
        title: "Cholesterol",
        dataKey: chartData.cholesterol,
        lines: [
            { key: "ldl", label: "LDL", stroke: "#FFA500" },
            { key: "hdl", label: "HDL", stroke: "#10B981" },
            { key: "trig", label: "Triglycerides", stroke: "#FF4D4D" } // Matched key 'trig'
        ],
        domain: [20, 300],
    }
  ];

  // Return the data in the new format
  return { chartData, metrics };
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
        // We also fetch active medications for the profile
        const [patientProfile, onboardingDoc, allMeds] = await Promise.all([
            User.findById(patientId).lean(),
            Onboarding.findOne({ userId: patientId }).lean(),
            Reminder.find({ userId: patientId, isMedication: true, isActive: true }).lean()
        ]);

        if (!patientProfile) {
            return res.status(404).json({ error: "Patient profile not found." });
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
        
        // This helper runs all your prediction logic and returns the new { chartData, metrics } object
        const predictDataPoints = await getPatientPredictionGraphs(onboardingDoc);
        
        // 4. --- COMBINE AND SEND ---
        res.status(200).json({
            doctorInfo,
            patientProfile: profileData,
            predictDataPoints // "patientHealthSummary" has been removed
        });

    } catch (err) {
        console.error("Error in getPatientDetails:", err);
        return res.status(500).json({ message: "Internal server error" });
    }
};