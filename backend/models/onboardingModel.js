const mongoose = require('mongoose');

// Custom Error class for validation failures
class ValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ValidationError';
        Object.setPrototypeOf(this, ValidationError.prototype);
    }
}

// Define the schema for the user's full onboarding data
const onboardingSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    onboardingVersion: { type: String, required: true },
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
        cuoreScore: { type: Number, default: 0 }
    },
    o3Data: {
        q1: { type: Boolean },
        q2: { type: Boolean },
        q3: { type: Boolean },
        q4: { type: Boolean },
        q5: { type: Boolean },
        q6: { type: Boolean },
        other_conditions: { type: String },
        hasHypertension: { type: Boolean, default: false },
        hasDiabetes: { type: Boolean, default: false }
    },
    o4Data: {
        smoking: { type: String },
        alcohol: { type: String }
    },
    o5Data: {
        min_exercise_per_week: { type: Number },
        preferred_ex_time: { type: String },
        rest_day: { type: String },
        eating_preference: { type: String },
        fruits_veg: { type: String },
        processed_food: { type: String },
        high_fiber: { type: String }
    },
    o6Data: {
        sleep_hours: { type: Number },
        wake_time: { type: String },
        problems_overwhelming: { type: String },
        enjoyable: { type: String },
        felt_nervous: { type: String }
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
        auto_filled: { type: Boolean, default: false }
    },
    timestamp: { type: Date, default: Date.now },
});

// Define the Mongoose Model immediately after the schema.
const OnboardingModel = mongoose.model('Onboarding', onboardingSchema, 'onboardings');

// Mappings for O4 and O5 scoring
const SMOKING_SCORES = { "never": 0, "quit_gt_6m": 2, "occasionally": 6, "regularly": 10 };
const ALCOHOL_SCORES = { "never": 0, "1-2": 2, "2-3_twice_week": 4, ">3": 8 };
const FOODS_SCORE_MAP = { "rarely": 8, "sometimes": 6, "often": 2, "daily": 0 };

// O5 Constants and Scoring Functions
function score_exercise(min_ex_per_week) {
    if (min_ex_per_week < 90) return 8;
    if (min_ex_per_week <= 150) return 3;
    return -1;
}

function score_foods(fruits_veg, processed, high_fiber) {
    return FOODS_SCORE_MAP[fruits_veg] + FOODS_SCORE_MAP[processed] + FOODS_SCORE_MAP[high_fiber];
}

// O6 Constants and Scoring Functions
const SLEEP_MAP = { "<6": 8, "6-7": 4, "7-8": 0, "8-9": 1, ">9": 4 };
const STRESS_MAP = { "never": 0, "sometimes": 3, "often": 6, "always": 8 };

function score_o6(sleep_hours_str, problems_over, enjoyable, felt_nervous) {
    const lookupSleep = (hours) => {
        if (hours < 6) return SLEEP_MAP["<6"];
        if (hours <= 7) return SLEEP_MAP["6-7"];
        if (hours <= 8) return SLEEP_MAP["7-8"];
        if (hours <= 9) return SLEEP_MAP["8-9"];
        return SLEEP_MAP[">9"];
    };
    
    let sleepScore;
    if (typeof sleep_hours_str === 'number') {
        sleepScore = lookupSleep(sleep_hours_str);
    } else {
        sleepScore = SLEEP_MAP[sleep_hours_str] || 0;
    }

    const stress_avg = (STRESS_MAP[problems_over] + STRESS_MAP[enjoyable] + STRESS_MAP[felt_nervous]) / 3;
    return sleepScore + stress_avg;
}

// Constants for validation
const MIN_AGE = 18;
const MAX_AGE = 88;
const MIN_HEIGHT = 120;
const MAX_HEIGHT = 210;
const MIN_WEIGHT = 25;
const MAX_WEIGHT = 200;
const MIN_WAIST = 15;
const MAX_WAIST = 75;

/**
 * Validates and calculates scores for basic user information.
 * @param {object} data - The user's input data.
 * @returns {object} - The processed data.
 */
const validateAndCalculateScores = (data) => {
    // 1. Validation
    const { age, gender, height_cm, weight_kg, waist_cm } = data;

    const parsedAge = parseInt(age);
    if (isNaN(parsedAge) || parsedAge < MIN_AGE || parsedAge > MAX_AGE) {
        throw new ValidationError(`Age must be between ${MIN_AGE} and ${MAX_AGE}`);
    }

    const parsedGender = gender.toLowerCase();
    if (!["male", "female", "other"].includes(parsedGender)) {
        throw new ValidationError("Invalid gender. Must be 'male', 'female', or 'other'");
    }

    const parsedHeight = parseFloat(height_cm);
    if (isNaN(parsedHeight) || parsedHeight < MIN_HEIGHT || parsedHeight > MAX_HEIGHT) {
        throw new ValidationError(`Height must be between ${MIN_HEIGHT} and ${MAX_HEIGHT}`);
    }

    const parsedWeight = parseFloat(weight_kg);
    if (isNaN(parsedWeight) || parsedWeight < MIN_WEIGHT || parsedWeight > MAX_WEIGHT) {
        throw new ValidationError(`Weight must be between ${MIN_WEIGHT} and ${MAX_WEIGHT}`);
    }

    const parsedWaist = parseFloat(waist_cm);
    if (isNaN(parsedWaist) || parsedWaist < MIN_WAIST || parsedWaist > MAX_WAIST) {
        throw new ValidationError(`Waist must be between ${MIN_WAIST} and ${MAX_WAIST}`);
    }

    // 2. Derived Metrics & Scoring
    const roundTo = (val, decimals) => Math.round(val * Math.pow(10, decimals)) / Math.pow(10, decimals);
    const calculateBmi = (weight_kg, height_cm) => roundTo((weight_kg / Math.pow(height_cm, 2)) * 10000.0, 1);
    const scoreAge = (age, gender) => {
        if (gender === "male" || gender === "other") return age < 20 ? 0 : (age > 45 ? 4 : 2);
        if (gender === "female") return age < 30 ? 0 : (age > 55 ? 4 : 2);
        return 0;
    };
    const scoreGender = (gender) => (gender === "male" || gender === "other") ? 1 : 0;
    const scoreBmi = (bmi, gender) => {
        if (gender === "male" || gender === "other") return bmi < 22.5 ? -1 : (bmi > 25.5 ? 4 : 2);
        if (gender === "female") return bmi < 23.5 ? -1 : (bmi > 26.5 ? 4 : 2);
        return 0;
    };
    const scoreWthr = (waist_cm, height_cm) => {
        const wthr = roundTo(waist_cm / height_cm, 2);
        return wthr < 0.47 ? -1 : (wthr > 0.52 ? 4 : 2);
    };

    const bmi = calculateBmi(parsedWeight, parsedHeight);
    const wthr = roundTo(parsedWaist / parsedHeight, 2);

    const ageScore = scoreAge(parsedAge, parsedGender);
    const genderScore = scoreGender(parsedGender);
    const bmiScore = scoreBmi(bmi, parsedGender);
    const wthrScore = scoreWthr(parsedWaist, parsedHeight);

    // 3. Return the processed data
    return {
        onboardingVersion: "7",
        o2Data: {
            age: parsedAge,
            gender: parsedGender,
            height_cm: parsedHeight,
            weight_kg: parsedWeight,
            waist_cm: parsedWaist
        },
        derivedMetrics: {
            bmi,
            wthr
        },
        scores: {
            ageScore,
            genderScore,
            bmiScore,
            wthrScore
        }
    };
};

/**
 * Main model function to process and store O2 data in MongoDB.
 * @param {object} data - The request payload.
 */
exports.processAndStoreBasicInfo = async (data) => {
    const processedData = validateAndCalculateScores(data);
    const userId = new mongoose.Types.ObjectId().toString();

    const newOnboardingDoc = new OnboardingModel({
        userId,
        onboardingVersion: processedData.onboardingVersion,
        o2Data: processedData.o2Data,
        derivedMetrics: processedData.derivedMetrics,
        scores: processedData.scores
    });

    await newOnboardingDoc.save();

    return {
        userId,
        ...processedData
    };
};

/**
 * Processes and stores O3 data in an existing user document.
 * @param {string} userId - The user's unique ID.
 * @param {object} o3Data - The O3 data payload.
 */
exports.processAndStoreHealthHistory = async (userId, o3Data) => {
    // 1. Calculate O3 score based on the provided formula
    const o3Score = (o3Data.q1 ? 2 : 0) +
        (o3Data.q2 ? 2 : 0) +
        (o3Data.q3 ? 4 : 0) +
        (o3Data.q4 ? 6 : 0) +
        (o3Data.q5 ? 8 : 0) +
        (o3Data.q6 ? 4 : 0);

    // 2. De-duplicate other_conditions and set flags
    let otherConditionsString = o3Data.other_conditions || "";
    const updatedFlags = {
        hasHypertension: o3Data.q3,
        hasDiabetes: o3Data.q4
    };

    // Check for hypertension synonyms and update flags
    const htnSynonyms = /hypertension|htn|high\sblood\spressure|bp/i;
    if (htnSynonyms.test(otherConditionsString)) {
        updatedFlags.hasHypertension = true;
        otherConditionsString = otherConditionsString.replace(htnSynonyms, '').trim();
    }

    // Check for diabetes synonyms and update flags
    const dmSynonyms = /diabetes|dm|high\sblood\ssugar|sugar/i;
    if (dmSynonyms.test(otherConditionsString)) {
        updatedFlags.hasDiabetes = true;
        otherConditionsString = otherConditionsString.replace(dmSynonyms, '').trim();
    }

    // 3. Find the existing user document and update it
    const updatedDoc = await OnboardingModel.findOneAndUpdate(
        { userId: userId },
        {
            $set: {
                o3Data: {
                    ...o3Data,
                    other_conditions: otherConditionsString,
                    ...updatedFlags
                },
                'scores.o3Score': o3Score
            }
        },
        { new: true, runValidators: true }
    );

    if (!updatedDoc) {
        throw new ValidationError("User not found.");
    }

    return {
        userId: updatedDoc.userId,
        o3Data: updatedDoc.o3Data,
        scores: updatedDoc.scores
    };
};

/**
 * Processes and stores O4 lifestyle data in an existing user document.
 * @param {string} userId - The user's unique ID.
 * @param {object} o4Data - The O4 data payload.
 */
exports.processAndStoreLifestyle = async (userId, o4Data) => {
    // 1. Validate O4 data based on mapping tables
    if (!SMOKING_SCORES.hasOwnProperty(o4Data.smoking)) {
        throw new ValidationError(`Invalid smoking value: ${o4Data.smoking}.`);
    }
    if (!ALCOHOL_SCORES.hasOwnProperty(o4Data.alcohol)) {
        throw new ValidationError(`Invalid alcohol value: ${o4Data.alcohol}.`);
    }

    // 2. Calculate O4 score
    const o4Score = SMOKING_SCORES[o4Data.smoking] + ALCOHOL_SCORES[o4Data.alcohol];

    // 3. Find the existing user document and update it
    const updatedDoc = await OnboardingModel.findOneAndUpdate(
        { userId: userId },
        {
            $set: {
                o4Data: o4Data,
                'scores.o4Score': o4Score
            }
        },
        { new: true, runValidators: true }
    );

    if (!updatedDoc) {
        throw new ValidationError("User not found.");
    }

    return {
        userId: updatedDoc.userId,
        o4Data: updatedDoc.o4Data,
        scores: updatedDoc.scores
    };
};

/**
 * Processes and stores O5 exercise and eating data in an existing user document.
 * @param {string} userId - The user's unique ID.
 * @param {object} o5Data - The O5 data payload.
 */
exports.processAndStoreExerciseEating = async (userId, o5Data) => {
    // 1. Validate O5 data based on mapping tables
    if (!FOODS_SCORE_MAP.hasOwnProperty(o5Data.fruits_veg) ||
        !FOODS_SCORE_MAP.hasOwnProperty(o5Data.processed_food) ||
        !FOODS_SCORE_MAP.hasOwnProperty(o5Data.high_fiber)) {
            throw new ValidationError("Invalid value for one of the food-related fields.");
    }

    // 2. Calculate O5 scores
    const exerciseScore = score_exercise(o5Data.min_exercise_per_week);
    const foodsScore = score_foods(o5Data.fruits_veg, o5Data.processed_food, o5Data.high_fiber);
    const o5Score = exerciseScore + foodsScore;

    // 3. Find the existing user document and update it
    const updatedDoc = await OnboardingModel.findOneAndUpdate(
        { userId: userId },
        {
            $set: {
                o5Data: o5Data,
                'scores.o5Score': o5Score
            }
        },
        { new: true, runValidators: true }
    );

    if (!updatedDoc) {
        throw new ValidationError("User not found.");
    }

    return {
        userId: updatedDoc.userId,
        o5Data: updatedDoc.o5Data,
        scores: updatedDoc.scores
    };
};

/**
 * Processes and stores O6 sleep and stress data in an existing user document.
 * @param {string} userId - The user's unique ID.
 * @param {object} o6Data - The O6 data payload.
 */
exports.processAndStoreSleepStress = async (userId, o6Data) => {
    // 1. Validate O6 data based on mapping tables
    const { sleep_hours, problems_overwhelming, enjoyable, felt_nervous } = o6Data;
    
    if (typeof sleep_hours !== 'number' && !SLEEP_MAP.hasOwnProperty(sleep_hours)) {
        throw new ValidationError(`Invalid sleep_hours value: ${sleep_hours}.`);
    }
    
    if (!STRESS_MAP.hasOwnProperty(problems_overwhelming) ||
        !STRESS_MAP.hasOwnProperty(enjoyable) ||
        !STRESS_MAP.hasOwnProperty(felt_nervous)) {
            throw new ValidationError("Invalid value for one of the stress-related fields.");
    }
    
    // 2. Calculate O6 score
    const o6Score = score_o6(sleep_hours, problems_overwhelming, enjoyable, felt_nervous);

    // 3. Find the existing user document and update it
    const updatedDoc = await OnboardingModel.findOneAndUpdate(
        { userId: userId },
        {
            $set: {
                o6Data: o6Data,
                'scores.o6Score': o6Score
            }
        },
        { new: true, runValidators: true }
    );
    
    if (!updatedDoc) {
        throw new ValidationError("User not found.");
    }

    return {
        userId: updatedDoc.userId,
        o6Data: updatedDoc.o6Data,
        scores: updatedDoc.scores
    };
};

// O7 Constants and Scoring Functions
const roundTo = (val, decimals) => Math.round(val * Math.pow(10, decimals)) / Math.pow(10, decimals);
const SLEEP_SCORE_MAP = { "<6": 8, "6-7": 4, "7-8": 0, "8-9": 1, ">9": 4 };

// O7 Scoring Functions
const score_o2_sat = (value_pct) => {
    if (value_pct > 95) return 0;
    if (value_pct >= 93) return 4;
    if (value_pct >= 91) return 6;
    return 10;
};
const score_hr = (hr) => {
    if (hr < 65) return 4;
    if (hr > 95) return 4;
    return 0;
};
const score_bp_upper = (val) => {
    if (val < 100) return 2;
    if (val <= 124) return 0;
    if (val <= 139) return 3;
    if (val <= 160) return 6;
    return 8;
};
const score_bp_lower = (val) => {
    if (val < 70) return 2;
    if (val <= 84) return 0;
    if (val <= 99) return 3;
    if (val <= 110) return 6;
    return 8;
};
const score_bs_f = (val) => {
    if (val < 70) return 2;
    if (val <= 100) return 0;
    if (val <= 125) return 4;
    return 8;
};
const score_bs_am = (val) => {
    if (val < 70) return 2;
    if (val <= 140) return 0;
    if (val <= 160) return 4;
    return 8;
};
const score_a1c = (val) => {
    if (val < 5.7) return 0;
    if (val <= 6.4) return 4;
    return 8;
};
const score_hdl = (val) => {
    if (val >= 60) return 0;
    if (val >= 40) return 2;
    return 4;
};
const score_ldl = (val) => {
    if (val < 100) return 0;
    if (val <= 129) return 2;
    if (val <= 159) return 4;
    if (val <= 189) return 6;
    return 8;
};
const score_trig = (val) => {
    if (val < 150) return 0;
    if (val <= 199) return 2;
    if (val <= 499) return 4;
    return 8;
};
const score_hscrp = (val) => {
    if (val < 1) return 0;
    if (val <= 3) return 2;
    return 4;
};
const score_trig_hdl_ratio = (val) => {
    if (val < 2) return 0;
    if (val <= 4) return 2;
    return 4;
};

// Autofill logic
const getAutofillData = (totalScore) => {
    const round2 = (val) => roundTo(val, 2);
    const lowRisk = {
        o2_sat: 97, pulse: 78, bp_upper: 122, bp_lower: 80,
        bs_f: 90, bs_am: 118, HDL: 60, LDL: 120, Trig: 130, HsCRP: 0.1
    };
    const mediumRisk = {
        o2_sat: 95, pulse: 84, bp_upper: 134, bp_lower: 86,
        bs_f: 120, bs_am: 160, HDL: 50, LDL: 150, Trig: 160, HsCRP: 0.2
    };
    const highRisk = {
        o2_sat: 93, pulse: 92, bp_upper: 146, bp_lower: 92,
        bs_f: 180, bs_am: 200, HDL: 40, LDL: 180, Trig: 180, HsCRP: 0.3
    };

    let data;
    if (totalScore <= 15) {
        data = lowRisk;
    } else if (totalScore < 30) {
        data = mediumRisk;
    } else {
        data = highRisk;
    }

    // A1C Formula
    data.A1C = round2(( (data.bs_f + data.bs_am) / 2 + 46.7) / 28.7);
    data.trig_hdl_ratio = round2(data.Trig / data.HDL);
    data.auto_filled = true;

    return data;
};

/**
 * Calculates the final Cuore score based on the user-provided formula.
 * @param {object} userDoc - The full user document with all data and scores.
 * @returns {number} The calculated and clamped Cuore score.
 */
function calculateCuoreScore(userDoc) {
    const { o5Data, o6Data, o7Data } = userDoc;

    // Helper to safely get a value or default to 0
    const safeGet = (obj, prop) => (obj && obj[prop] != null ? obj[prop] : 0);
    const safeGetScore = (prop) => safeGet(userDoc.scores, prop);
    
    // --- Components from your formula, using data from the document ---
    const ageGenderAvg = (safeGetScore('ageScore') + safeGetScore('genderScore')) / 2;
    const bmiScore = safeGetScore('bmiScore');
    const wthrScore = safeGetScore('wthrScore');
    const o3Score = safeGetScore('o3Score');
    const o4Score = safeGetScore('o4Score');
    const minExerciseScore = score_exercise(safeGet(o5Data, 'min_exercise_per_week'));

    const foodsScore = (
        score_foods(safeGet(o5Data, 'fruits_veg'), safeGet(o5Data, 'processed_food'), safeGet(o5Data, 'high_fiber')) / 3
    );

    const sleepScore = (safeGet(o6Data, 'sleep_hours') != null) ? (SLEEP_MAP[safeGet(o6Data, 'sleep_hours')] || 0) : 0;
    const stressScore = (
        (STRESS_MAP[safeGet(o6Data, 'problems_overwhelming')] || 0) +
        (STRESS_MAP[safeGet(o6Data, 'enjoyable')] || 0) +
        (STRESS_MAP[safeGet(o6Data, 'felt_nervous')] || 0)
    ) / 3;

    const o2SatScore = score_o2_sat(safeGet(o7Data, 'o2_sat'));
    const hrScore = score_hr(safeGet(o7Data, 'pulse'));
    const bpScore = (
        score_bp_upper(safeGet(o7Data, 'bp_upper')) + 
        score_bp_lower(safeGet(o7Data, 'bp_lower'))
    ) / 2;
    const ldlScore = score_ldl(safeGet(o7Data, 'LDL'));
    const hscrpScore = score_hscrp(safeGet(o7Data, 'HsCRP'));
    const bsScore = (
        score_bs_am(safeGet(o7Data, 'bs_am')) + 
        score_bs_f(safeGet(o7Data, 'bs_f')) + 
        score_a1c(safeGet(o7Data, 'A1C'))
    ) / 3;
    const trigHdlRatioScore = score_trig_hdl_ratio(safeGet(o7Data, 'trig_hdl_ratio'));

    // --- FINAL SUMMATION BASED ON YOUR PROVIDED FORMULA ---
   // Calculate the totalScore as you are now
const totalScore = (
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
    trigHdlRatioScore
);

// Define the maximum possible total score
const MAX_POSSIBLE_SCORE = 132; 

// Normalize the total score and calculate the final Cuore score
let cuoreScore = 100 - ((totalScore / MAX_POSSIBLE_SCORE) * 100);

// Clamp the score between 5 and 95
cuoreScore = roundTo(Math.min(Math.max(cuoreScore, 5), 95), 1);

return cuoreScore;
}


// Main O7 processing function
exports.processAndStoreBiomarkers = async (userId, o7Data = {}) => {
    try {
        const userDoc = await OnboardingModel.findOne({ userId });

        if (!userDoc) {
            throw new ValidationError("User not found.");
        }

        if (!userDoc.o2Data || !userDoc.derivedMetrics || !userDoc.o3Data || !userDoc.o4Data || !userDoc.o5Data || !userDoc.o6Data) {
            throw new ValidationError("Previous onboarding data is missing. Please complete all prior steps.");
        }

        let processedO7Data = {};
        const isAutofill = Object.keys(o7Data).length === 0;
        let calculatedA1C;

        if (isAutofill) {
            const totalScoreBeforeO7 = userDoc.scores.ageScore + userDoc.scores.genderScore + userDoc.scores.bmiScore + userDoc.scores.wthrScore +
                                         userDoc.scores.o3Score + userDoc.scores.o4Score + userDoc.scores.o5Score + userDoc.scores.o6Score;
            processedO7Data = getAutofillData(totalScoreBeforeO7);
        } else {
            const { o2_sat, pulse, bp_upper, bp_lower, bs_f, bs_am, A1C, HDL, LDL, Trig, HsCRP } = o7Data;
            
            if (o2_sat == null || pulse == null || bp_upper == null || bp_lower == null || bs_f == null || bs_am == null || HDL == null || LDL == null || Trig == null || HsCRP == null) {
                throw new ValidationError("Missing required biomarker fields for manual entry.");
            }
            const normalizedHsCRP = (o7Data.HsCRP_unit && o7Data.HsCRP_unit.toLowerCase() === "mg/l") ? HsCRP : HsCRP / 10;
            
            calculatedA1C = A1C || roundTo(((bs_f + bs_am) / 2 + 46.7) / 28.7, 2);
            
            const trig_hdl_ratio = roundTo(Trig / HDL, 2);

            processedO7Data = {
                o2_sat, pulse, bp_upper, bp_lower, bs_f, bs_am,
                A1C: calculatedA1C,
                HDL, LDL, Trig,
                HsCRP: normalizedHsCRP,
                trig_hdl_ratio,
                auto_filled: false
            };
        }
        
        if (!processedO7Data.A1C) {
             processedO7Data.A1C = calculatedA1C;
        }

        const o7Score =
            score_o2_sat(processedO7Data.o2_sat) +
            score_hr(processedO7Data.pulse) +
            (score_bp_upper(processedO7Data.bp_upper) + score_bp_lower(processedO7Data.bp_lower)) / 2 +
            (score_bs_f(processedO7Data.bs_f) + score_bs_am(processedO7Data.bs_am) + score_a1c(processedO7Data.A1C)) / 3 +
            score_hdl(processedO7Data.HDL) +
            score_ldl(processedO7Data.LDL) +
            score_trig(processedO7Data.Trig) +
            score_hscrp(processedO7Data.HsCRP) +
            score_trig_hdl_ratio(processedO7Data.trig_hdl_ratio);

        userDoc.o7Data = processedO7Data;
        userDoc.scores.o7Score = o7Score;

        const cuoreScore = calculateCuoreScore(userDoc);

        const updatedDoc = await OnboardingModel.findOneAndUpdate(
            { userId },
            {
                $set: {
                    o7Data: processedO7Data,
                    'scores.o7Score': o7Score,
                    'scores.cuoreScore': cuoreScore
                }
            },
            { new: true, runValidators: true }
        );

        if (!updatedDoc) {
            throw new ValidationError("User not found during update.");
        }

        return {
            userId: updatedDoc.userId,
            o7Data: updatedDoc.o7Data,
            scores: updatedDoc.scores
        };
    } catch (error) {
        console.error('Error:', error.name, error.message);
        if (error.name === 'ValidationError') {
            throw error;
        }
        throw new Error("Internal Server Error");
    }
};

module.exports = {
    Onboarding: OnboardingModel,
    ValidationError,
    processAndStoreBiomarkers: exports.processAndStoreBiomarkers,
    processAndStoreBasicInfo: exports.processAndStoreBasicInfo,
    processAndStoreHealthHistory: exports.processAndStoreHealthHistory,
    processAndStoreLifestyle: exports.processAndStoreLifestyle,
    processAndStoreExerciseEating: exports.processAndStoreExerciseEating,
    processAndStoreSleepStress: exports.processAndStoreSleepStress
};