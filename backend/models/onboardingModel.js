const mongoose = require("mongoose");

// Custom Error class for validation failures
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

const onboardingSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  onboardingVersion: { type: String, required: true },
  nudgeLastRefresh: { type: Date },
  lastShownNudgeText: { type: String },
  lastNudgeWinner: { type: String },
  o2Data: {
    age: { type: Number, required: true },
    gender: { type: String, required: true },
    height_cm: { type: Number, required: true },
    weight_kg: { type: Number, required: true },
    waist_cm: { type: Number, required: true },
  },
  derivedMetrics: {
    bmi: { type: Number, required: true },
    wthr: { type: Number, required: true },
  },
  scores: {
    ageScore: { type: Number, required: true },
    genderScore: { type: Number, required: true },
    bmiScore: { type: Number, required: true },
    wthrScore: { type: Number, required: true },
    o3Score: { type: Number, default: 0 },
  
    o4Score: { type: Number, default: 0 },
    o5Score: { type: Number, default: 0 },
    o6Score: { type: Number, default: 0 },
    o7Score: { type: Number, default: 0 },
    cuoreScore: { type: Number, default: 0 },
  },
  o3Data: {
    q1: { type: String },
    q2: { type: String },
    q3: { type: String },
    q4: { type: String },
    q5: { type: String },
    q6: { type: String },
    other_conditions: { type: String },
    hasHypertension: { type: Boolean, default: false },
    hasDiabetes: { type: Boolean, default: false },
  },
  o4Data: {
    smoking: { type: String },
    alcohol: { type: String },
  },
  o5Data: {
    min_exercise_per_week: { type: String },
    preferred_ex_time: { type: String },
    rest_day: { type: String },
    eating_preference: { type: String },
    fruits_veg: { type: String },
    processed_food: { type: String },
    high_fiber: { type: String },
  },
  o6Data: {
    sleep_hours: { type: String },
    wake_time: { type: String },
    problems_overwhelming: { type: String },
    enjoyable: { type: String },
    felt_nervous: { type: String },
  },
  o7Data: {
    o2_sat: { type: Number },
    pulse: { type: Number },
    bp_upper: { type: Number },
    bp_lower: { type: Number },
    bs_f: { type: Number },
    bs_am: { type: Number },
    A1C: { type: Number },
    HDL: { type: Number },
    LDL: { type: Number },
    Trig: { type: Number },
    HsCRP: { type: Number },
    trig_hdl_ratio: { type: Number },
    auto_filled: { type: Boolean, default: false },
  },
  timestamp: { type: Date, default: Date.now },

  // --- START OF HISTORY FIELDS ---
  // (Your existing history field)
  o7History: [
    {
      data: { type: Object }, // Snapshot of o7Data
      timestamp: { type: Date, default: Date.now },
    },
  ],

  // --- NEWLY ADDED HISTORY FIELDS ---
  // History for Weight and BMI
  o2History: [
    {
      data: {
        weight_kg: { type: Number },
        bmi: { type: Number },
      },
      timestamp: { type: Date, default: Date.now },
    }
  ],
  // History for Nutrition & Fitness scores
 // History for Nutrition & Fitness scores
o5History: [
  {
    data: {
      o5Score: { type: Number },
      // --- ADD THESE ---
      foodScore: { type: Number },     // Use the key you provided
      exerciseScore: { type: Number }, // Use the key you provided
      // ---------------
    },
    timestamp: { type: Date, default: Date.now },
  }
],
// History for Sleep & Stress scores
o6History: [
  {
    data: {
      o6Score: { type: Number },
      // --- ADD THESE ---
      sleepScore: { type: Number },    // Use the key you provided
      stressScore: { type: Number },   // Use the key you provided
      // ---------------
    },
    timestamp: { type: Date, default: Date.now },
  }
],
  // History for the main Cuore Score
  scoreHistory: [
    {
      data: {
        cuoreScore: { type: Number }, // This is the 'cuoreScore' from the 'scores' object
      },
      timestamp: { type: Date, default: Date.now },
    }
  ],
  streakCount: { type: Number, default: 0 },
  lastStreakDate: { type: Date, default: null }

  // --- END OF HISTORY FIELDS ---
});

const OnboardingModel = mongoose.model(
  "Onboarding",
  onboardingSchema,
  "onboardings"
);

const SMOKING_SCORES = {
  Never: 0,
  "Quit >6 months ago": 2,
  Occasionally: 6,
  Daily: 10,
};
const ALCOHOL_SCORES = {
  Never: 0,
  "Quit >6 months ago": 2,
  "1-2 drinks occasionally": 4,
  "2 or more drinks at least twice per week": 8,
}; // Corrected alcohol scores from your document
const FOODS_SCORE_MAP = { Rarely: 8, Sometimes: 6, Often: 2, Daily: 0 };
const EXERCISE_SCORE_MAP = {
  "Less than 75 min": 8,
  "75 to 150 min": 3,
  "More than 150 min": -1,
};
const SLEEP_MAP = {
  "Less than 6 hours": 8,
  "Between 6 to 7 hours": 4,
  "Between 7 to 8 hours": 0,
  "Between 8 to 9 hours": 1,
  "More than 9 hours": 4,
};
const STRESS_MAP = { Never: 0, Sometimes: 3, Often: 6, Always: 8 };

const MIN_AGE = 18;
const MAX_AGE = 88;
const MIN_HEIGHT = 120;
const MAX_HEIGHT = 210;
const MIN_WEIGHT = 25;
const MAX_WEIGHT = 200;
const MIN_WAIST = 15;
const MAX_WAIST = 75;

const roundTo = (val, decimals) =>
  Math.round(val * Math.pow(10, decimals)) / Math.pow(10, decimals);

const validateAndCalculateScores = (data) => {
  const { age, gender, height_cm, weight_kg, waist_cm } = data;
  const parsedAge = parseInt(age);
  if (isNaN(parsedAge) || parsedAge < MIN_AGE || parsedAge > MAX_AGE)
    throw new ValidationError(`Age must be between ${MIN_AGE} and ${MAX_AGE}`);
  const parsedGender = gender.toLowerCase();
  if (!["male", "female", "other"].includes(parsedGender))
    throw new ValidationError(
      "Invalid gender. Must be 'male', 'female', or 'other'"
    );
  const parsedHeight = parseFloat(height_cm);
  if (
    isNaN(parsedHeight) ||
    parsedHeight < MIN_HEIGHT ||
    parsedHeight > MAX_HEIGHT
  )
    throw new ValidationError(
      `Height must be between ${MIN_HEIGHT} and ${MAX_HEIGHT} cm`
    );
  const parsedWeight = parseFloat(weight_kg);
  if (
    isNaN(parsedWeight) ||
    parsedWeight < MIN_WEIGHT ||
    parsedWeight > MAX_WEIGHT
  )
    throw new ValidationError(
      `Weight must be between ${MIN_WEIGHT} and ${MAX_WEIGHT}`
    );
  const parsedWaist = parseFloat(waist_cm);
  if (isNaN(parsedWaist) || parsedWaist < MIN_WAIST || parsedWaist > MAX_WAIST)
    throw new ValidationError(
      `Waist must be between ${MIN_WAIST} and ${MAX_WAIST} cm`
    );
  const calculateBmi = (weight_kg, height_cm) =>
    roundTo((weight_kg / Math.pow(height_cm, 2)) * 10000.0, 1);
  const scoreAge = (age, gender) => {
    if (gender === "male" || gender === "other")
      return age < 20 ? 0 : age > 45 ? 4 : 2;
    if (gender === "female") return age < 30 ? 0 : age > 55 ? 4 : 2;
    return 0;
  };
  const scoreGender = (gender) =>
    gender === "male" || gender === "other" ? 1 : 0;
  const scoreBmi = (bmi, gender) => {
    if (gender === "male" || gender === "other")
      return bmi < 22.5 ? -1 : bmi > 25.5 ? 4 : 2;
    if (gender === "female") return bmi < 23.5 ? -1 : bmi > 26.5 ? 4 : 2;
    return 0;
  };
  const scoreWthr = (waist_cm, height_cm) => {
    const wthr = roundTo(waist_cm / (height_cm * 0.393), 2);
    return wthr < 0.47 ? -1 : wthr > 0.52 ? 4 : 2;
  };
  const bmi = calculateBmi(parsedWeight, parsedHeight);
  const wthr = roundTo(parsedWaist / (parsedHeight * 0.393), 2);
  const ageScore = scoreAge(parsedAge, parsedGender);
  const genderScore = scoreGender(parsedGender);
  const bmiScore = scoreBmi(bmi, parsedGender);
  const wthrScore = scoreWthr(parsedWaist, parsedHeight);
  return {
    o2Data: {
      age: parsedAge,
      gender: parsedGender,
      height_cm: parsedHeight,
      weight_kg: parsedWeight,
      waist_cm: parsedWaist,
    },
    derivedMetrics: { bmi, wthr },
    scores: { ageScore, genderScore, bmiScore, wthrScore },
  };
};

const processO3Data = (o3Data) => {
  // Define the question strings to avoid repetition
  const Q1_TEXT =
    "One of my parents was diagnosed with diabetes before the age of 60";
  const Q2_TEXT = "One of my parents had a heart attack before the age of 60";
  const Q3_TEXT = "I have Hypertension (High blood pressure)";
  const Q4_TEXT = "I have Diabetes (High blood sugar)";
  const Q5_TEXT =
    "I feel short of breath or experience chest discomfort even during mild activity or at rest";
  const Q6_TEXT =
    "I've noticed an increase in hunger, thirst, or the need to urinate frequently";

  const selectedOptions = o3Data.selectedOptions || [];

  // Use boolean flags for score calculation and hasHypertension/hasDiabetes flags
  const q1_selected = selectedOptions.includes(Q1_TEXT);
  const q2_selected = selectedOptions.includes(Q2_TEXT);
  const q3_selected = selectedOptions.includes(Q3_TEXT);
  const q4_selected = selectedOptions.includes(Q4_TEXT);
  const q5_selected = selectedOptions.includes(Q5_TEXT);
  const q6_selected = selectedOptions.includes(Q6_TEXT);

  // The score calculation remains the same, as the boolean flags work perfectly
  const o3Score =
    (q1_selected ? 2 : 0) +
    (q2_selected ? 2 : 0) +
    (q3_selected ? 4 : 0) +
    (q4_selected ? 6 : 0) +
    (q5_selected ? 8 : 0) +
    (q6_selected ? 4 : 0);

  const originalOtherConditions = o3Data.other_conditions || "";
  const updatedFlags = {
    hasHypertension: q3_selected,
    hasDiabetes: q4_selected,
  };

  // This logic also remains unchanged
  const htnSynonyms = /hypertension|htn|high\sblood\spressure|bp/i;
  if (htnSynonyms.test(originalOtherConditions))
    updatedFlags.hasHypertension = true;
  const dmSynonyms = /diabetes|dm|high\sblood\ssugar|sugar/i;
  if (dmSynonyms.test(originalOtherConditions)) updatedFlags.hasDiabetes = true;

  // **NEW**: Create the final object with the full string for selected options, or `false` if not selected.
  const mappedO3Data = {
    q1: q1_selected ? Q1_TEXT : false,
    q2: q2_selected ? Q2_TEXT : false,
    q3: q3_selected ? Q3_TEXT : false,
    q4: q4_selected ? Q4_TEXT : false,
    q5: q5_selected ? Q5_TEXT : false,
    q6: q6_selected ? Q6_TEXT : false,
    other_conditions: originalOtherConditions,
    ...updatedFlags,
  };

  return { o3Data: mappedO3Data, o3Score };
};

const processO4Data = (o4Data) => {
  const { smoking, alcohol } = o4Data;
  if (
    !SMOKING_SCORES.hasOwnProperty(smoking) ||
    !ALCOHOL_SCORES.hasOwnProperty(alcohol)
  ) {
    throw new ValidationError(`Invalid value for smoking or alcohol.`);
  }
  const o4Score = SMOKING_SCORES[smoking] + ALCOHOL_SCORES[alcohol];
  return { o4Data: { smoking, alcohol }, o4Score };
};

const processO5Data = (o5Data) => {
  const { min_exercise_per_week, fruits_veg, processed_food, high_fiber } =
    o5Data;
  if (!EXERCISE_SCORE_MAP.hasOwnProperty(min_exercise_per_week)) {
    throw new ValidationError(
      `Invalid value for min_exercise_per_week: ${min_exercise_per_week}.`
    );
  }
  if (
    !FOODS_SCORE_MAP.hasOwnProperty(fruits_veg) ||
    !FOODS_SCORE_MAP.hasOwnProperty(processed_food) ||
    !FOODS_SCORE_MAP.hasOwnProperty(high_fiber)
  ) {
    throw new ValidationError(
      "Invalid value for one of the food-related fields."
    );
  }
  const exerciseScore = EXERCISE_SCORE_MAP[min_exercise_per_week];
  const foodsScore =
    FOODS_SCORE_MAP[fruits_veg] +
    FOODS_SCORE_MAP[processed_food] +
    FOODS_SCORE_MAP[high_fiber];
  const o5Score = exerciseScore + foodsScore;
  
  // --- START OF FIX ---
  return { 
    o5Data, 
    o5Score, 
    foodScore: foodsScore,     // Pass the sub-score out
    exerciseScore: exerciseScore // Pass the sub-score out
  };
  // --- END OF FIX ---
};

const processO6Data = (o6Data) => {
  const { sleep_hours, problems_overwhelming, enjoyable, felt_nervous } =
    o6Data;
  if (!SLEEP_MAP.hasOwnProperty(sleep_hours)) {
    throw new ValidationError(`Invalid sleep_hours value: ${sleep_hours}.`);
  }
  if (
    !STRESS_MAP.hasOwnProperty(problems_overwhelming) ||
    !STRESS_MAP.hasOwnProperty(enjoyable) ||
    !STRESS_MAP.hasOwnProperty(felt_nervous)
  ) {
    throw new ValidationError(
      "Invalid value for one of the stress-related fields."
    );
  }
  const sleepScore = SLEEP_MAP[sleep_hours];
  const stress_avg =
    (STRESS_MAP[problems_overwhelming] +
      STRESS_MAP[enjoyable] +
      STRESS_MAP[felt_nervous]) /
    3;
  const o6Score = sleepScore + stress_avg;

  // --- START OF FIX ---
  return { 
    o6Data, 
    o6Score,
    sleepScore: sleepScore,     // Pass the sub-score out
    stressScore: stress_avg     // Pass the sub-score out (we rename it stressScore)
  };
  // --- END OF FIX ---
};

const score_o2_sat = (value_pct) =>
  value_pct > 95 ? 0 : value_pct >= 93 ? 4 : value_pct >= 91 ? 6 : 10;
const score_hr = (hr) => (hr < 65 || hr > 95 ? 4 : 0);
const score_bp_upper = (val) =>
  val < 100 ? 2 : val <= 124 ? 0 : val <= 139 ? 3 : val <= 160 ? 6 : 8;
const score_bp_lower = (val) =>
  val < 70 ? 2 : val <= 84 ? 0 : val <= 99 ? 3 : val <= 110 ? 6 : 8;
const score_bs_f = (val) =>
  val < 80 ? 2 : val <= 100 ? 0 : val <= 130 ? 2 : val <= 160 ? 6 : 8;
const score_bs_am = (val) =>
  val < 110 ? 2 : val <= 140 ? 0 : val <= 190 ? 2 : val <= 240 ? 6 : 8;
const score_a1c = (val) => (val < 5.8 ? 0 : val <= 8.6 ? 4 : 8);
const score_hdl = (val) => (val < 50 ? 4 : val > 60 ? -1 : 2);
const score_ldl = (val) => (val < 71 ? 0 : val > 139 ? 4 : 2);
const score_trig = (val) => (val < 131 ? 0 : val > 159 ? 4 : 2);
const score_hscrp = (val) => (val < 1 ? 0 : val <= 3 ? 2 : 4);
const score_trig_hdl_ratio = (val) => (val < 2.5 ? 0 : val > 4.0 ? 8 : 3);

const getAutofillData = (totalScore) => {
  const round2 = (val) => roundTo(val, 2);
  let data =
    totalScore <= 15
      ? {
          o2_sat: 97,
          pulse: 78,
          bp_upper: 122,
          bp_lower: 80,
          bs_f: 90,
          bs_am: 118,
          HDL: 60,
          LDL: 120,
          Trig: 130,
          HsCRP: 0.1,
        }
      : totalScore < 30
      ? {
          o2_sat: 95,
          pulse: 84,
          bp_upper: 134,
          bp_lower: 86,
          bs_f: 120,
          bs_am: 160,
          HDL: 50,
          LDL: 150,
          Trig: 160,
          HsCRP: 0.2,
        }
      : {
          o2_sat: 93,
          pulse: 92,
          bp_upper: 146,
          bp_lower: 92,
          bs_f: 180,
          bs_am: 200,
          HDL: 40,
          LDL: 180,
          Trig: 180,
          HsCRP: 0.3,
        };
  data.A1C = round2(((data.bs_f + data.bs_am) / 2 + 46.7) / 28.7);
  data.trig_hdl_ratio = round2(data.Trig / data.HDL);
  data.auto_filled = true;
  return data;
};

const calculateCuoreScore = (allData, allScores) => {
  const safeGet = (obj, prop) => (obj && obj[prop] != null ? obj[prop] : 0);
  const safeGetScore = (prop) => safeGet(allScores, prop);
  const ageGenderAvg =
    (safeGetScore("ageScore") + safeGetScore("genderScore")) / 2;
  const bmiScore = safeGetScore("bmiScore");
  const wthrScore = safeGetScore("wthrScore");
  const o3Score = safeGetScore("o3Score");
  const o4Score = safeGetScore("o4Score");
  const minExerciseScore =
    EXERCISE_SCORE_MAP[safeGet(allData.o5Data, "min_exercise_per_week")];
  const foodsScore =
    FOODS_SCORE_MAP[safeGet(allData.o5Data, "fruits_veg")] +
    FOODS_SCORE_MAP[safeGet(allData.o5Data, "processed_food")] +
    FOODS_SCORE_MAP[safeGet(allData.o5Data, "high_fiber")];
  const sleepScore = SLEEP_MAP[safeGet(allData.o6Data, "sleep_hours")];
  const stressScore =
    ((STRESS_MAP[safeGet(allData.o6Data, "problems_overwhelming")] || 0) +
      (STRESS_MAP[safeGet(allData.o6Data, "enjoyable")] || 0) +
      (STRESS_MAP[safeGet(allData.o6Data, "felt_nervous")] || 0)) /
    3;
  const o2SatScore = score_o2_sat(safeGet(allData.o7Data, "o2_sat"));
  const hrScore = score_hr(safeGet(allData.o7Data, "pulse"));
  const bpScore =
    (score_bp_upper(safeGet(allData.o7Data, "bp_upper")) +
      score_bp_lower(safeGet(allData.o7Data, "bp_lower"))) /
    2;
  const ldlScore = score_ldl(safeGet(allData.o7Data, "LDL"));
  const hscrpScore = score_hscrp(safeGet(allData.o7Data, "HsCRP"));
  const bsScore =
    (score_bs_am(safeGet(allData.o7Data, "bs_am")) +
      score_bs_f(safeGet(allData.o7Data, "bs_f")) +
      score_a1c(safeGet(allData.o7Data, "A1C"))) /
    3;
  const trigHdlRatioScore = score_trig_hdl_ratio(
    safeGet(allData.o7Data, "trig_hdl_ratio")
  );
  const totalScore =
    ageGenderAvg +
    bmiScore +
    wthrScore +
    o3Score +
    o4Score +
    minExerciseScore +
    foodsScore +
    sleepScore +
    stressScore +
    o2SatScore +
    hrScore +
    bpScore +
    ldlScore +
    hscrpScore +
    bsScore +
    trigHdlRatioScore;
  const MAX_POSSIBLE_SCORE = 132;
  let cuoreScore = 100 - (totalScore / MAX_POSSIBLE_SCORE) * 100;
  cuoreScore = roundTo(Math.min(Math.max(cuoreScore, 5), 95), 1);
  return cuoreScore;
};

// --- NEW FUNCTION: The single point of entry for final onboarding submission ---
// --- The single point of entry for all onboarding submissions ---
// --- onboardingModel.js ---

// ... (your existing imports, ValidationError, helper functions like validateAndCalculateScores, etc.) ...
// ... (Make sure OnboardingModel is imported/defined)

exports.processAndSaveFinalSubmission = async (userId, payload) => {
  try {
    const existingDoc = await OnboardingModel.findOne({ userId });

    if (!existingDoc && !payload.o2Data) {
      throw new ValidationError(
        "A full submission (starting with o2Data) is required for the first onboarding."
      );
    }

    // --- 1️⃣ DEFINE SAFE MERGE HELPER ---
    const safeMerge = (existing = {}, incoming = {}) => {
      const result = { ...existing };
      for (const [key, value] of Object.entries(incoming)) {
        if (
          value === undefined ||
          value === null ||
          value === "" ||
          (typeof value === "boolean" && value === false)
        ) {
          continue;
        }
        result[key] = value;
      }
      return result;
    };

    // --- 2️⃣ FETCH EXISTING DATA ---
    const existingData = existingDoc ? existingDoc.toObject() : {};

    // --- 3️⃣ SMART MERGE FOR O3 DATA (PERSISTENCE FIX) ---
    const existingO3 = existingData.o3Data || {};
    const incomingO3 = payload.o3Data || {};
    const mergedO3 = { ...existingO3 };

    ["q1", "q2", "q3", "q4", "q5", "q6", "other_conditions", "hasHypertension", "hasDiabetes"].forEach(
      (field) => {
        if (incomingO3[field] !== undefined && incomingO3[field] !== null) {
          mergedO3[field] = incomingO3[field];
        }
      }
    );

    if (Array.isArray(incomingO3.selectedOptions)) {
      mergedO3.selectedOptions = incomingO3.selectedOptions;
    }

    // --- 4️⃣ BUILD MERGED DATA SAFELY ---
    const mergedData = {
      ...existingData,
      ...payload,
      o2Data: safeMerge(existingData.o2Data, payload.o2Data),
      o3Data: mergedO3,
      o4Data: safeMerge(existingData.o4Data, payload.o4Data),
      o5Data: safeMerge(existingData.o5Data, payload.o5Data),
      o6Data: safeMerge(existingData.o6Data, payload.o6Data),
      o7Data: { ...existingData.o7Data },
    };

    // ✅ Overwrite all O7 fields: clear old data if missing or blank
    const allO7Keys = [
      "o2_sat",
      "pulse",
      "bp_upper",
      "bp_lower",
      "bs_f",
      "bs_am",
      "A1C",
      "HDL",
      "LDL",
      "Trig",
      "HsCRP",
      "trig_hdl_ratio",
    ];

    for (const key of allO7Keys) {
      if (payload.o7Data && key in payload.o7Data) {
        mergedData.o7Data[key] =
          payload.o7Data[key] === "" ? null : payload.o7Data[key];
      } else {
        mergedData.o7Data[key] = null;
      }
    }

    // --- 5️⃣ CALCULATE METRICS & SCORES ---
    // These objects (o5Metrics, o6Metrics) now contain the sub-scores
    const o2Metrics = validateAndCalculateScores(mergedData.o2Data);
    const o3Metrics = processO3Data(mergedData.o3Data);
    const o4Metrics = processO4Data(mergedData.o4Data);
    const o5Metrics = processO5Data(mergedData.o5Data);
    const o6Metrics = processO6Data(mergedData.o6Data);

    let processedO7Data;
    const o7Payload = mergedData.o7Data || {};
    const manuallyEnteredFields = Object.keys(o7Payload).filter(
      (key) =>
        o7Payload[key] !== null &&
        o7Payload[key] !== undefined &&
        key !== "auto_filled"
    );

    if (manuallyEnteredFields.length > 0) {
      processedO7Data = {
        ...getAutofillData(0),
        ...Object.fromEntries(
          manuallyEnteredFields.map((field) => [field, o7Payload[field]])
        ),
        manual_fields: manuallyEnteredFields,
        auto_filled: false,
      };

      if (processedO7Data.bs_f && processedO7Data.bs_am && !processedO7Data.A1C) {
        processedO7Data.A1C = roundTo(
          ((processedO7Data.bs_f + processedO7Data.bs_am) / 2 + 46.7) / 28.7,
          2
        );
      }
      if (processedO7Data.Trig && processedO7Data.HDL && !processedO7Data.trig_hdl_ratio) {
        processedO7Data.trig_hdl_ratio = roundTo(
          processedO7Data.Trig / processedO7Data.HDL,
          2
        );
      }
    } else {
      const tempScores = {
        ...o2Metrics.scores,
        o3Score: o3Metrics.o3Score,
        o4Score: o4Metrics.o4Score,
        o5Score: o5Metrics.o5Score,
        o6Score: o6Metrics.o6Score,
      };

      const totalScoreBeforeO7 = Object.values(tempScores)
        .filter((s) => typeof s === "number")
        .reduce((a, b) => a + b, 0);

      processedO7Data = {
        ...getAutofillData(totalScoreBeforeO7),
        manual_fields: [],
        auto_filled: true,
      };
    }

    // --- 6️⃣ O7 SCORE CALCULATION ---
    const o7Score =
      score_o2_sat(processedO7Data.o2_sat) +
      score_hr(processedO7Data.pulse) +
      (score_bp_upper(processedO7Data.bp_upper) +
        score_bp_lower(processedO7Data.bp_lower)) /
        2 +
      (score_bs_f(processedO7Data.bs_f) +
        score_bs_am(processedO7Data.bs_am) +
        score_a1c(processedO7Data.A1C)) /
        3 +
      score_hdl(processedO7Data.HDL) +
      score_ldl(processedO7Data.LDL) +
      score_trig(processedO7Data.Trig) +
      score_hscrp(processedO7Data.HsCRP) +
      score_trig_hdl_ratio(processedO7Data.trig_hdl_ratio);

    const allScores = {
      ...o2Metrics.scores,
      o3Score: o3Metrics.o3Score,
      o4Score: o4Metrics.o4Score,
      o5Score: o5Metrics.o5Score,
      o6Score: o6Metrics.o6Score,
      o7Score,
    };

    // --- 7️⃣ BUILD FINAL DATA TO SAVE ---
    const finalDataToSave = {
      userId,
      onboardingVersion: "7",
      o2Data: o2Metrics.o2Data,
      derivedMetrics: o2Metrics.derivedMetrics,
      o3Data: o3Metrics.o3Data,
      o4Data: o4Metrics.o4Data,
      o5Data: o5Metrics.o5Data,
      o6Data: o6Metrics.o6Data,
      timestamp: new Date(),
    };

    const { manual_fields } = processedO7Data;
    finalDataToSave.o7Data = {};
    for (const key of allO7Keys) {
      finalDataToSave.o7Data[key] = manual_fields.includes(key)
        ? processedO7Data[key] ?? null
        : null;
    }
    finalDataToSave.o7Data.manual_fields = manual_fields;
    finalDataToSave.o7Data.auto_filled = false;

    // --- 8️⃣ CUORE SCORE ---
    allScores.cuoreScore = calculateCuoreScore(finalDataToSave, allScores);
     finalDataToSave.scores = allScores;

    // --- 9️⃣ HISTORY SNAPSHOTS ---
    const submissionTimestamp = finalDataToSave.timestamp;
    const o2Snapshot = {
      data: {
        weight_kg: finalDataToSave.o2Data.weight_kg,
        bmi: finalDataToSave.derivedMetrics.bmi,
      },
      timestamp: submissionTimestamp,
    };

    // --- START OF FIX ---
    // We now add the individual sub-scores to the snapshot
    const o5Snapshot = {
      data: { 
        o5Score: finalDataToSave.scores.o5Score,
        foodScore: o5Metrics.foodScore,         // Assumes o5Metrics has foodScore
        exerciseScore: o5Metrics.exerciseScore  // Assumes o5Metrics has exerciseScore
     },
      timestamp: submissionTimestamp,
    };
    const o6Snapshot = {
      data: { 
        o6Score: finalDataToSave.scores.o6Score,
        sleepScore: o6Metrics.sleepScore,       // Assumes o6Metrics has sleepScore
        stressScore: o6Metrics.stressScore      // Assumes o6Metrics has stressScore
      },
      timestamp: submissionTimestamp,
    };
    // --- END OF FIX ---

    const o7Snapshot = {
      data: { ...finalDataToSave.o7Data },
      timestamp: submissionTimestamp,
    };
    const scoreSnapshot = {
      data: { cuoreScore: finalDataToSave.scores.cuoreScore },
      timestamp: submissionTimestamp,
    };

    // --- 🔟 UPDATE DB ---
    const updateOperation = { $set: finalDataToSave };
    const pushOperations = {};

    if (payload.o2Data && Object.keys(payload.o2Data).length > 0)
     pushOperations.o2History = o2Snapshot;
    if (payload.o5Data && Object.keys(payload.o5Data).length > 0)
      pushOperations.o5History = o5Snapshot;
    if (payload.o6Data && Object.keys(payload.o6Data).length > 0)
      pushOperations.o6History = o6Snapshot;
    if (payload.o7Data && Object.keys(payload.o7Data).length > 0)
      pushOperations.o7History = o7Snapshot;

    pushOperations.scoreHistory = scoreSnapshot;
    if (Object.keys(pushOperations).length > 0)
      updateOperation.$push = pushOperations;

    const finalOnboardingDoc = await OnboardingModel.findOneAndUpdate(
      { userId },
      updateOperation,
      { new: true, upsert: true, runValidators: true }
   );

    if (!finalOnboardingDoc)
      throw new ValidationError("Failed to save onboarding data.");

    return finalOnboardingDoc;
  } catch (error) {
    console.error(
      "Error in processAndSaveFinalSubmission:",
      error.name,
      error.message
    );
    if (error.name === "ValidationError") throw error;
   throw new Error("Internal Server Error");
  }
};




// ... (Your other model functions: calculateAllMetrics, getOnboardingDataByUserId, helpers, etc.) ...
// ... (Make sure OnboardingModel is defined/imported)
// --- Fetches user data, hiding auto-filled O7 values from the frontend ---
exports.getOnboardingDataByUserId = async (userId) => {
    try {
        const onboardingData = await OnboardingModel.findOne({ userId }).lean(); // Use .lean() for a plain object

        if (!onboardingData) {
            return null;
        }

        // ============================================================================
        // ## NEW LOGIC: Hide Auto-Calculated Data from Frontend ##
        // ============================================================================
        // If the stored O7 data was auto-filled, replace it with an empty object
        // before sending it. This ensures the user sees blank fields on the screen.
        if (onboardingData.o7Data && onboardingData.o7Data.auto_filled === true) {
  // keep only manually filled fields (if any)
  const manualKeys = onboardingData.o7Data.manual_fields || [];
  onboardingData.o7Data = Object.fromEntries(
    Object.entries(onboardingData.o7Data).filter(([key]) =>
      manualKeys.includes(key)
    )
  );
}


        return onboardingData;

    } catch (error) {
        console.error('Error in getOnboardingDataByUserId:', error);
        throw error;
    }
};

// Calculates "Time to Reach Target" in months
const calculateTimeToTarget = (userData, totalScore = 0) => {
  const { o2Data = {}, o7Data = {} } = userData;
  const { height_cm, weight_kg, gender } = o2Data;

  // --- 1. Compute Target Weight ---
  const heightInInches = (height_cm - 152.4) / 2.4;
  const targetWeight =
    gender === "male"
      ? 52 + 1.9 * heightInInches
      : 50 + 1.7 * heightInInches;

  // --- 2. Get missing BP/BS values from autofill logic ---
  // (Uses same logic you provided earlier)
  const autoData = getAutofillData(totalScore);
  const bp_upper = o7Data.bp_upper ?? autoData.bp_upper;
  const bs_am = o7Data.bs_am ?? autoData.bs_am;

  // --- 3. Calculate differences ---
  const weightDiff =
    Math.abs(weight_kg - targetWeight) / 1.2;
  const bpDiff = Math.abs(bp_upper - 120) / 2;
  const bsDiff = Math.abs(bs_am - 160) / 10;

  // --- 4. Pick highest + 1 month buffer ---
  let months = Math.max(weightDiff, bpDiff, bsDiff) + 1;

  // if(months>=18) return 18;
   months = Math.min(Math.round(months), 18);

  return months;

  // Optional rounding
  // return Math.round(months);
};


const calculateMetabolicAge = (userData) => {
  const { o2Data, scores } = userData;
  const { age } = o2Data;
  const { cuoreScore } = scores;

  let multiplier = 1.2; // default for <= 50%
  if (cuoreScore >= 75) {
    multiplier = 0.95;
  } else if (cuoreScore > 50 && cuoreScore < 75) {
    multiplier = 1.1;
  }

  const metabolicAge = age * multiplier;
  return {
    metabolicAge: Math.round(metabolicAge),
    gap: Math.round(metabolicAge - age),
  };
};

const calculateWeightMetrics = (userData) => {
  const { o2Data } = userData;
  const { height_cm, weight_kg, gender } = o2Data;

  const heightInInches = (height_cm - 152.4) / 2.4;
  const targetWeight =
    gender === "male" ? 52 + 1.9 * heightInInches : 50 + 1.7 * heightInInches;

  const difference = ((weight_kg - targetWeight) / targetWeight) * 100;

  return {
    current: weight_kg,
    target: Math.round(targetWeight * 10) / 10,
    difference: Math.round(difference * 10) / 10,
    status: difference < 5 ? "green" : difference < 15 ? "orange" : "red",
  };
};

const calculateBMIMetrics = (userData) => {
  const { o2Data, derivedMetrics } = userData;
  const { gender } = o2Data;
  const { bmi } = derivedMetrics;

  const targetBMI = gender === "male" ? 22.5 : 23.5;
  const difference = ((bmi - targetBMI) / targetBMI) * 100;

  return {
    current: bmi,
    target: targetBMI,
    difference: Math.round(difference * 10) / 10,
    status: difference < 5 ? "green" : difference < 15 ? "orange" : "red",
  };
};

const calculateLifestyleScore = (userData) => {
  const { o5Data, o6Data } = userData;

  // --- NUTRITION ---
  const nutritionAvg =
    (FOODS_SCORE_MAP[o5Data.fruits_veg] +
      FOODS_SCORE_MAP[o5Data.processed_food] +
      FOODS_SCORE_MAP[o5Data.high_fiber]) / 3;

  const nutrition = 100 - ((nutritionAvg + 2) * 8);

  // --- FITNESS ---
  const fitnessRaw = EXERCISE_SCORE_MAP[o5Data.min_exercise_per_week];
  const fitness = 100 - ((fitnessRaw + 2) * 8);

  // --- SLEEP ---
  const sleepRaw = SLEEP_MAP[o6Data.sleep_hours];
  const sleep = 100 - ((sleepRaw + 2) * 8);

  // --- STRESS ---
  const stressAvg =
    (STRESS_MAP[o6Data.problems_overwhelming] +
      STRESS_MAP[o6Data.enjoyable] +
      STRESS_MAP[o6Data.felt_nervous]) / 3;

  const stress = 100 - ((stressAvg + 2) * 8);

  // --- FINAL LIFESTYLE SCORE ---
  const lifestyleScore = Math.round((nutrition + fitness + sleep + stress) / 4);

  // --- COLOR LOGIC ---
  const status =
    lifestyleScore > 70 ? "green" :
    lifestyleScore > 55 ? "orange" :
    "red";

  return { score: lifestyleScore, status };
};


const calculateRecommendedCalories = (userData) => {
  const { o2Data, derivedMetrics } = userData;
  const { age, gender, weight_kg, height_cm } = o2Data;
  const { bmi } = derivedMetrics;

  let baseCalories;
  if (gender === "male") {
    baseCalories = 66.47 + 13.75 * weight_kg + 5 * height_cm - 6.75 * age;
  } else {
    baseCalories = 665.1 + 9.563 * weight_kg + 1.85 * height_cm - 4.67 * age;
  }

  // Apply multiplier based on BMI
  if (bmi < 21) {
    baseCalories *= 1.15;
  } else if (bmi > 24) {
    baseCalories *= 0.8;
  }

  // Round to nearest 100
  return Math.round(baseCalories / 100) * 100;
};

const calculateRecommendedExercise = (o5Data) => {
    // Log the incoming value for debugging
    console.log('Exercise Input:', o5Data.min_exercise_per_week);

    // Match the exact strings from EXERCISE_SCORE_MAP
    switch(o5Data.min_exercise_per_week) {
        case "Less than 75 min":
            return 15;
        case "75 to 150 min":
            return 30;
        case "More than 150 min":
            return 45;
        default:
            console.warn('Unmatched exercise value:', o5Data.min_exercise_per_week);
            return 15; // Default fallback
    }
};

const calculateBPStatus = (userData) => {
  const o7 = userData.o7Data || {};

  const bp_upper = o7.bp_upper ?? null;
  const bp_lower = o7.bp_lower ?? null;

  const getStatus = (val, low, high) => {
    if (val == null) return "unknown";
    if (val < low) return "orange";
    if (val <= high) return "green";
    return "red";
  };

  return {
    upper: {
      current: bp_upper,
      target: 120,
      status: getStatus(bp_upper, 100, 130),
    },
    lower: {
      current: bp_lower,
      target: 80,
      status: getStatus(bp_lower, 64, 82),
    },
  };
};


const calculateBloodSugar = (userData) => {
  const o7 = userData.o7Data || {};
  const o3 = userData.o3Data || {};
  const hasDiabetes = o3.hasDiabetes || false;

  const bs_f = o7.bs_f ?? null;
  const bs_am = o7.bs_am ?? null;
  const A1C = o7.A1C ?? null;

  const getStatus = (val, low, high) => {
    if (val == null) return "unknown";
    if (val < low) return "orange";
    if (val <= high) return "green";
    return "red";
  };

  return {
    fasting: {
      value: bs_f,
      target: hasDiabetes ? 130 : 100,
      status: getStatus(bs_f, 70, hasDiabetes ? 130 : 100),
    },
    afterMeal: {
      value: bs_am,
      target: hasDiabetes ? 180 : 140,
      status: getStatus(bs_am, 90, hasDiabetes ? 180 : 140),
    },
    A1C: {
      value: A1C,
      target: 5.6,
      status: getStatus(A1C, 4.5, 5.6),
    },
  };
};

const calculateBodyFat = (userData) => {
  const { age, gender } = userData.o2Data;
  const { bmi } = userData.derivedMetrics;

  const bodyFat =
    gender === "male"
      ? 1.2 * bmi + 0.23 * age - 16.2
      : 1.2 * bmi + 0.23 * age - 5.4;

  const target = gender === "male" ? 23 : 30;
  const difference = ((bodyFat - target) / target) * 100;

  return {
    current: Math.round(bodyFat * 10) / 10,
    target,
    difference: Math.round(difference * 10) / 10,
    status: difference < 5 ? "green" : difference < 15 ? "orange" : "red",
  };
};
function calculateTrigHDLRatio(userData) {
  const o7 = userData.o7Data || {};
  const trig = parseFloat(o7.Trig ?? o7.trig ?? o7.triglyceride ?? null);
  const hdl = parseFloat(o7.HDL ?? o7.hdl ?? null);

  if (isNaN(trig) || isNaN(hdl) || hdl === 0) {
    return {
      current: null,
      target: 2.6,
      status: "unknown",
    };
  }

  const ratio = parseFloat((trig / hdl).toFixed(1));

  let status = "green";
  if (ratio > 4.0) status = "red";
  else if (ratio >= 2.8) status = "orange";

  return {
    current: ratio,
    target: 2.6,
    status,
  };
}



const calculateMainFocus = (userData) => {
  const scores = [
    {
      type: "Tobacco Cessation",
      score: SMOKING_SCORES[userData.o4Data.smoking],
    },
    {
      type: "Nutrition",
      score:
        (FOODS_SCORE_MAP[userData.o5Data.fruits_veg] +
          FOODS_SCORE_MAP[userData.o5Data.processed_food] +
          FOODS_SCORE_MAP[userData.o5Data.high_fiber]) /
        3,
    },
    {
      type: "Fitness",
      score: EXERCISE_SCORE_MAP[userData.o5Data.min_exercise_per_week],
    },
    { type: "Sleep", score: SLEEP_MAP[userData.o6Data.sleep_hours] },
    {
      type: "Meditation",
      score:
        (STRESS_MAP[userData.o6Data.problems_overwhelming] +
          STRESS_MAP[userData.o6Data.enjoyable] +
          STRESS_MAP[userData.o6Data.felt_nervous]) /
        3,
    },
  ];

  return scores
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map((item) => item.type);
};
// const metrics = calculateAllMetrics(userData);
// Update your existing exports to include these new calculations
const calculateAllMetrics = (userData) => {
  const { o2Data } = userData;
  const { age } = o2Data;

  return {
    age,
    timeToTarget: calculateTimeToTarget(userData),
    metabolicAge: calculateMetabolicAge(userData),
    weight: calculateWeightMetrics(userData),
    bmi: calculateBMIMetrics(userData),
    lifestyle: calculateLifestyleScore(userData),
    recommendedCalories: calculateRecommendedCalories(userData),
    recommendedExercise: calculateRecommendedExercise(userData.o5Data),
    bpStatus: calculateBPStatus(userData),
    bloodSugar: calculateBloodSugar(userData),
    trigHDLRatio: calculateTrigHDLRatio(userData),
    bodyFat: calculateBodyFat(userData),
    mainFocus: calculateMainFocus(userData),
  };
};


module.exports = {
    Onboarding: OnboardingModel,
    ValidationError,
    processAndSaveFinalSubmission: async (userId, payload) => {
        try {
            return await exports.processAndSaveFinalSubmission(userId, payload);
        } catch (error) {
            throw error;
        }
    },
    getOnboardingDataByUserId: async (userId) => {
        try {
            return await exports.getOnboardingDataByUserId(userId);
        } catch (error) {
            throw error;
        }
    },
    calculateAllMetrics,
     calculateRecommendedExercise,
    calculateMetrics: calculateAllMetrics
};
