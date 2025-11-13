const PatientLink = require('../../models/PatientLink');

// --- ADDED IMPORTS FOR REAL DATA ---
const Doctor = require('../../models/Doctor');
const User = require('../../models/User');
const { Onboarding } = require('../../models/onboardingModel'); // Ensure this path is correct
const { calculateAllMetrics } = require('../../models/onboardingModel'); // Ensure this is exported and path is correct
// --- END OF IMPORTS ---


// --- HELPER FUNCTION ---
// This function gets all data for ONE patient and formats it for the dashboard
const formatPatientData = async (patientUser) => {
    if (!patientUser) return null;

    // 1. Find the patient's Onboarding data
    const onboardingDoc = await Onboarding.findOne({ userId: patientUser._id }).lean();
    if (!onboardingDoc) {
        // This patient has signed up but not completed onboarding
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

    // 2. We have onboarding data, so get biometrics
    const o7 = onboardingDoc.o7Data || {};
    const o3 = onboardingDoc.o3Data || {};
    
    // 3. Calculate metrics to get Lifestyle Score and TG/HDL
    let metrics = {};
    if (typeof calculateAllMetrics === "function") {
         metrics = calculateAllMetrics(onboardingDoc);
    } else {
        console.warn(`[formatPatientData] calculateAllMetrics function not found. Lifestyle/TGHDL may be null for user ${patientUser._id}.`);
    }
    
    // 4. Check for SOB/Chest Discomfort Alert
    const sobAlert = o3.q5 === true; // From your UI doc

    // 5. Determine Status (Simplified for now)
    // TODO: Add logic for 'Accept', 'Renewal', 'Lapsed' based on your rules
    const status = onboardingDoc.timestamp ? new Date(onboardingDoc.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : "No Date";
    const statusType = "date"; // Default

    // 6. Build the final flat object for the UI
    return {
        _id: patientUser._id,
        sobAlert: sobAlert,
        name: patientUser.display_name,
        phone: patientUser.phone,
        sbp: o7.bp_upper || null,
        dbp: o7.bp_lower || null,
        hr: o7.pulse || null,
        fbs: o7.bs_f || null,
        bspp: o7.bs_am || null,
        a1c: o7.A1C || null,
        hscrp: o7.HsCRP || null,
        tghdl: metrics?.trigHDLRatio?.current || null,
        lifestyle: metrics?.lifestyle?.score || null,
        status: status,
        statusType: statusType,
    };
};
// --- END OF HELPER FUNCTION ---


/**
 * @desc    Get the list of patients for the logged-in doctor
 * @route   GET /api/web/dashboard/patients
 * @access  Private (Doctor only)
 */
exports.getPatientList = async (req, res) => {
  try {
    // req.doctor is available here from the 'protect' middleware
    console.log(`Fetching REAL patient list for Doctor: ${req.doctor.displayName}`);

    // --- THIS IS THE NEW LOGIC ---
    
    // 1. Find the doctor and use .populate() to get all linked patient User documents
    const doctor = await Doctor.findById(req.doctor._id)
                               .populate('patients'); // 'patients' is the field in your Doctor model
    
    if (!doctor) {
        return res.status(404).json({ error: "Doctor not found." });
    }

    // 2. Now doctor.patients is an array of full User objects
    // We loop through them and fetch their onboarding data
    const patientDataPromises = doctor.patients.map(patientUser => formatPatientData(patientUser));
    const patientList = (await Promise.all(patientDataPromises)).filter(p => p !== null); // Filter out any nulls

    // 3. Sort by SOB/Chest Discomfort alert first
    patientList.sort((a, b) => (b.sobAlert ? 1 : 0) - (a.sobAlert ? 1 : 0));
    // --- END OF NEW LOGIC ---

    res.status(200).json({
      doctorInfo: {
        displayName: req.doctor.displayName,
        doctorCode: req.doctor.doctorCode
      },
      count: patientList.length,
      patients: patientList, // This is now REAL data
    });

  } catch (error) {
    console.error("Error in getPatientList:", error);
    res.status(500).json({ error: "Server error fetching patient list." });
  }
};

exports.addPatientLink = async (req, res) => {
    const { patientMobile, planDuration } = req.body;
    
    // Get the logged-in doctor's code from the middleware
    const doctorCode = req.doctor.doctorCode;

    if (!patientMobile || !patientMobile.startsWith('+')) {
        return res.status(400).json({ error: 'A valid mobile number in international format is required.' });
    }

    try {
        // Use findOneAndUpdate with "upsert"
        // This will create a new link OR update the doctor code if one already exists
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
            // This is the "SMS" data for testing
            simulated_sms: `Patient at ${patientMobile} is now linked to ${doctorCode}. Please ask them to download the Cuore app.`
        });

    } catch (error) {
        console.error("Error creating patient link:", error);
        res.status(500).json({ error: 'Server error creating link.' });
    }
};

// --- Helper 1: Build the simple Profile object ---
function buildPatientProfile(user, onboardingDoc) {
  const o2 = onboardingDoc.o2Data || {};
  const o3 = onboardingDoc.o3Data || {};
  const o4 = onboardingDoc.o4Data || {};

  // Re-create the logic from your snippets
  const smokerStatus = o4.tobacco_user === true ? "Smoker" : (o4.tobacco_user === false ? "Non-Smoker" : "N/A");
  const pastHistory = o3.conditions?.length > 0 ? o3.conditions.join(', ') : "None";
  const medications = o3.medications?.length > 0 ? o3.medications.join(', ') : "None";
  
  return {
    name: user?.display_name || "User",
    age: o2.age || null,
    smoker: smokerStatus,
    pastHO: pastHistory,
    medications: medications,
    lastConsulted: onboardingDoc.lastConsultedDate || null,
  };
}

// --- Helper 2: Build the "Prediction" Graphs (Logic from your getPredictionData) ---

const METRIC_LIMITS = {
  cuoreScore: 90, bpUpper: 122, bpLower: 80, bsFasting: 100, bsAfterMeals: 140,
  a1c: 5.7, weight: 70, bmi: 22.9, bodyFat: 20, hdl: 60, ldl: 100,
  triglyceride: 150, nutrition: 90, fitness: 90, sleep: 90, stress: 90, heartRate: 80,
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
    case 'cuoreScore': historyArray = onboarding.scoreHistory || []; return historyArray.map(h => h.data?.cuoreScore);
    case 'weight_kg': historyArray = onboarding.o2History || []; return historyArray.map(h => h.data?.weight_kg);
    case 'bmi': historyArray = onboarding.o2History || []; return historyArray.map(h => h.data?.bmi);
    case 'nutrition': historyArray = onboarding.o5History || []; return historyArray.map(h => h.data?.foodScore);
    case 'fitness': historyArray = onboarding.o5History || []; return historyArray.map(h => h.data?.exerciseScore);
    case 'sleep': historyArray = onboarding.o6History || []; return historyArray.map(h => h.data?.sleepScore);
    case 'stress': historyArray = onboarding.o6History || []; return historyArray.map(h => h.data?.stressScore);
    default:
        historyArray = onboarding.o7History || [];
        return historyArray.map(h => h.data ? h.data[metricKey] : undefined);
  }
};

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

// This is the main helper that runs all the prediction logic
async function getPatientPredictionGraphs(onboardingDoc) {
  if (!onboardingDoc) return [];

  const onboarding = onboardingDoc; // Use the doc we already fetched
  const cuoreScore = onboarding.scores?.cuoreScore || 0;
  let X;
  if (cuoreScore < 50) X = 0.9; else if (cuoreScore > 70) X = 0.3; else X = 0.6;

  const formulas = {
    cuoreScore: { initialB: (A, X) => A + (10 * X), direction: 'increase' },
    bpUpper: { initialB: (A, X) => A - (4 * X), direction: 'decrease' },
    bpLower: { initialB: (A, X) => A - (2 * X), direction: 'decrease' },
    heartRate: { initialB: (A, X) => A - (2 * X), direction: 'decrease' },
    bsFasting: { initialB: (A, X) => A - (20 * X), direction: 'decrease' },
    bsAfterMeals: { initialB: (A, X) => A - (20 * X), direction: 'decrease' },
    weight: { initialB: (A, X) => A - (2 * X), direction: 'decrease' },
    bmi: { initialB: (A, X) => A - (1 * X), direction: 'decrease' },
    hdl: { initialB: (A, X) => A + (2 * X), direction: 'increase' },
    ldl: { initialB: (A, X) => A - (5 * X), direction: 'decrease' },
    triglyceride: { initialB: (A, X) => A - (5 * X), direction: 'decrease' },
    nutrition: { initialB: (A, X) => A + (5 * X), direction: 'increase' },
    fitness: { initialB: (A, X) => A + (5 * X), direction: 'increase' },
    sleep: { initialB: (A, X) => A + (5 * X), direction: 'increase' },
    stress: { initialB: (A, X) => A + (5 * X), direction: 'increase' },
  };

  const generateArgs = (key, dbKey, isO7 = false) => [
      fetchHistory(onboarding, dbKey || key),
      X, formulas[key].initialB, formulas[key].direction, METRIC_LIMITS[key], isO7
  ];

  const { series: csSeries, historyCount: csHist } = generatePredictionSeries(...generateArgs('cuoreScore', 'cuoreScore'));
  const { series: bpUpperSeries, historyCount: bpUpperHist } = generatePredictionSeries(...generateArgs('bpUpper', 'bp_upper', true));
  const { series: bpLowerSeries, historyCount: bpLowerHist } = generatePredictionSeries(...generateArgs('bpLower', 'bp_lower', true));
  const { series: hrSeries, historyCount: hrHist } = generatePredictionSeries(...generateArgs('heartRate', 'pulse', true));
  const { series: bsFastingSeries, historyCount: bsFastingHist } = generatePredictionSeries(...generateArgs('bsFasting', 'bs_f', true));
  const { series: bsAfterMealsSeries, historyCount: bsAfterMealsHist } = generatePredictionSeries(...generateArgs('bsAfterMeals', 'bs_am', true));

  const a1cFormula = (sugar) => sugar > 0 ? (sugar + 46.7) / 28.7 : 0;
  const a1cSeries = bsFastingSeries.map(sugarVal => Math.round(Math.min(Math.max(0, a1cFormula(sugarVal)), METRIC_LIMITS.a1c) * 100) / 100);
  const a1cHist = bsFastingHist;

  const { series: weightSeries, historyCount: weightHist } = generatePredictionSeries(...generateArgs('weight', 'weight_kg'));
  const heightM = (onboarding.o2Data?.height_cm || 1) / 100;
  const bmiFormula = (weight) => heightM > 0 ? weight / (heightM * heightM) : 0;
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
        { label: 'Body Fat (%)', ...splitData(bodyFatSeries, bodyFatHist), color: '#ff0000', limit: METRIC_LIMITS.bodyFat }
    ]),
    formatGraphData('Cholesterol', [
        { label: 'HDL', ...splitData(hdlSeries, hdlHist), color: '#3498db', limit: METRIC_LIMITS.hdl },
        { label: 'LDL', ...splitData(ldlSeries, ldlHist), color: '#e74c3c', limit: METRIC_LIMITS.ldl },
        { label: 'Triglycerides', ...splitData(trigSeries, trigHist), color: '#8C00FF', limit: METRIC_LIMITS.triglyceride }
    ]),
    formatGraphData('Lifestyle Metrics', [
        { label: 'Nutrition', ...splitData(nutritionSeries, nutritionHist), color: '#f1c40f', limit: METRIC_LIMITS.nutrition },
        { label: 'Fitness', ...splitData(fitnessSeries, fitnessHist), color: '#2ecc71', limit: METRIC_LIMITS.fitness },
        { label: 'Sleep', ...splitData(sleepSeries, sleepHist), color: '#e74c3c', limit: METRIC_LIMITS.sleep },
        { label: 'Stress', ...splitData(stressSeries, stressHist), color: '#2980b9', limit: METRIC_LIMITS.stress }
    ])
  ];

  return healthGraphs;
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
        // Check if this patient ID is in the doctor's 'patients' list
        const isPatientLinked = doctor.patients.some(id => id.toString() === patientId);
        
        if (!isPatientLinked) {
            return res.status(403).json({ error: "You are not authorized to view this patient." });
        }

        // 2. --- GET DATA (in parallel) ---
        const [patientProfile, onboardingDoc] = await Promise.all([
            User.findById(patientId).lean(),
            Onboarding.findOne({ userId: patientId }).lean()
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
        const profileData = buildPatientProfile(patientProfile, onboardingDoc);
        
        // This helper runs all your prediction logic and returns the graph array
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