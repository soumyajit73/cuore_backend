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

const OnboardingModel = mongoose.model('Onboarding', onboardingSchema, 'onboardings');

// Mappings for O4 and O5 scoring
const SMOKING_SCORES = { "never": 0, "quit_gt_6m": 2, "occasionally": 6, "regularly": 10 };
const ALCOHOL_SCORES = { "never": 0, "1-2": 2, "2-3_twice_week": 4, ">3": 8 };
const FOODS_SCORE_MAP = { "rarely": 8, "sometimes": 6, "often": 2, "daily": 0 };
const MIN_AGE = 18;
const MAX_AGE = 88;
const MIN_HEIGHT = 120;
const MAX_HEIGHT = 210;
const MIN_WEIGHT = 25;
const MAX_WEIGHT = 200;
const MIN_WAIST = 15;
const MAX_WAIST = 75;
const SLEEP_MAP = { "<6": 8, "6-7": 4, "7-8": 0, "8-9": 1, ">9": 4 };
const STRESS_MAP = { "never": 0, "sometimes": 3, "often": 6, "always": 8 };

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

// Validation and Scoring Functions for O2
const roundTo = (val, decimals) => Math.round(val * Math.pow(10, decimals)) / Math.pow(10, decimals);
const validateAndCalculateScores = (data) => {
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
    return {
        o2Data: {
            age: parsedAge, gender: parsedGender, height_cm: parsedHeight, weight_kg: parsedWeight, waist_cm: parsedWaist
        },
        derivedMetrics: { bmi, wthr },
        scores: { ageScore, genderScore, bmiScore, wthrScore }
    };
};

// O3, O4, O5, O6 Processing Functions
const processO3Data = (o3Data) => {
    // New logic for mapping frontend's selectedOptions array to boolean flags
    const q1 = o3Data.selectedOptions ? o3Data.selectedOptions.includes("One of my parents was diagnosed with diabetes before the age of 60") : false;
    const q2 = o3Data.selectedOptions ? o3Data.selectedOptions.includes("One of my parents had a heart attack before the age of 60") : false;
    const q3 = o3Data.selectedOptions ? o3Data.selectedOptions.includes("I have Hypertension (High blood pressure)") : false;
    const q4 = o3Data.selectedOptions ? o3Data.selectedOptions.includes("I have Diabetes (High blood sugar)") : false;
    const q5 = o3Data.selectedOptions ? o3Data.selectedOptions.includes("I feel short of breath or experience chest discomfort even during mild activity or at rest") : false;
    const q6 = o3Data.selectedOptions ? o3Data.selectedOptions.includes("I've noticed an increase in hunger, thirst, or the need to urinate frequently") : false;

    const o3Score = (q1 ? 2 : 0) + (q2 ? 2 : 0) + (q3 ? 4 : 0) + (q4 ? 6 : 0) + (q5 ? 8 : 0) + (q6 ? 4 : 0);
    let otherConditionsString = o3Data.other_conditions || "";
    const updatedFlags = { hasHypertension: q3, hasDiabetes: q4 };
    const htnSynonyms = /hypertension|htn|high\sblood\spressure|bp/i;
    if (htnSynonyms.test(otherConditionsString)) updatedFlags.hasHypertension = true;
    const dmSynonyms = /diabetes|dm|high\sblood\ssugar|sugar/i;
    if (dmSynonyms.test(otherConditionsString)) updatedFlags.hasDiabetes = true;

    // Use the mapped booleans for the saved data
    const mappedO3Data = {
        q1, q2, q3, q4, q5, q6,
        other_conditions: otherConditionsString,
        ...updatedFlags
    };

    return { o3Data: mappedO3Data, o3Score };
};

const processO4Data = (o4Data) => {
    if (!SMOKING_SCORES.hasOwnProperty(o4Data.smoking) || !ALCOHOL_SCORES.hasOwnProperty(o4Data.alcohol)) {
        throw new ValidationError(`Invalid value for smoking or alcohol.`);
    }
    const o4Score = SMOKING_SCORES[o4Data.smoking] + ALCOHOL_SCORES[o4Data.alcohol];
    return { o4Data, o4Score };
};

const processO5Data = (o5Data) => {
    if (!FOODS_SCORE_MAP.hasOwnProperty(o5Data.fruits_veg) || !FOODS_SCORE_MAP.hasOwnProperty(o5Data.processed_food) || !FOODS_SCORE_MAP.hasOwnProperty(o5Data.high_fiber)) {
        throw new ValidationError("Invalid value for one of the food-related fields.");
    }
    const exerciseScore = score_exercise(o5Data.min_exercise_per_week);
    const foodsScore = score_foods(o5Data.fruits_veg, o5Data.processed_food, o5Data.high_fiber);
    const o5Score = exerciseScore + foodsScore;
    return { o5Data, o5Score };
};

const processO6Data = (o6Data) => {
    const { sleep_hours, problems_overwhelming, enjoyable, felt_nervous } = o6Data;
    if (typeof sleep_hours !== 'number' && !SLEEP_MAP.hasOwnProperty(sleep_hours)) {
        throw new ValidationError(`Invalid sleep_hours value: ${sleep_hours}.`);
    }
    if (!STRESS_MAP.hasOwnProperty(problems_overwhelming) || !STRESS_MAP.hasOwnProperty(enjoyable) || !STRESS_MAP.hasOwnProperty(felt_nervous)) {
        throw new ValidationError("Invalid value for one of the stress-related fields.");
    }
    const o6Score = score_o6(sleep_hours, problems_overwhelming, enjoyable, felt_nervous);
    return { o6Data, o6Score };
};

// O7 Scoring Functions
const score_o2_sat = (value_pct) => value_pct > 95 ? 0 : value_pct >= 93 ? 4 : value_pct >= 91 ? 6 : 10;
const score_hr = (hr) => hr < 65 || hr > 95 ? 4 : 0;
const score_bp_upper = (val) => val < 100 ? 2 : val <= 124 ? 0 : val <= 139 ? 3 : val <= 160 ? 6 : 8;
const score_bp_lower = (val) => val < 70 ? 2 : val <= 84 ? 0 : val <= 99 ? 3 : val <= 110 ? 6 : 8;
const score_bs_f = (val) => val < 70 ? 2 : val <= 100 ? 0 : val <= 125 ? 4 : 8;
const score_bs_am = (val) => val < 70 ? 2 : val <= 140 ? 0 : val <= 160 ? 4 : 8;
const score_a1c = (val) => val < 5.7 ? 0 : val <= 6.4 ? 4 : 8;
const score_hdl = (val) => val >= 60 ? 0 : val >= 40 ? 2 : 4;
const score_ldl = (val) => val < 100 ? 0 : val <= 129 ? 2 : val <= 159 ? 4 : val <= 189 ? 6 : 8;
const score_trig = (val) => val < 150 ? 0 : val <= 199 ? 2 : val <= 499 ? 4 : 8;
const score_hscrp = (val) => val < 1 ? 0 : val <= 3 ? 2 : 4;
const score_trig_hdl_ratio = (val) => val < 2 ? 0 : val <= 4 ? 2 : 4;

// Autofill logic
const getAutofillData = (totalScore) => {
    const round2 = (val) => roundTo(val, 2);
    let data = totalScore <= 15 ? { o2_sat: 97, pulse: 78, bp_upper: 122, bp_lower: 80, bs_f: 90, bs_am: 118, HDL: 60, LDL: 120, Trig: 130, HsCRP: 0.1 }
               : totalScore < 30 ? { o2_sat: 95, pulse: 84, bp_upper: 134, bp_lower: 86, bs_f: 120, bs_am: 160, HDL: 50, LDL: 150, Trig: 160, HsCRP: 0.2 }
               : { o2_sat: 93, pulse: 92, bp_upper: 146, bp_lower: 92, bs_f: 180, bs_am: 200, HDL: 40, LDL: 180, Trig: 180, HsCRP: 0.3 };
    data.A1C = round2(((data.bs_f + data.bs_am) / 2 + 46.7) / 28.7);
    data.trig_hdl_ratio = round2(data.Trig / data.HDL);
    data.auto_filled = true;
    return data;
};

const calculateCuoreScore = (allData, allScores) => {
    const safeGet = (obj, prop) => (obj && obj[prop] != null ? obj[prop] : 0);
    const safeGetScore = (prop) => safeGet(allScores, prop);
    const ageGenderAvg = (safeGetScore('ageScore') + safeGetScore('genderScore')) / 2;
    const bmiScore = safeGetScore('bmiScore');
    const wthrScore = safeGetScore('wthrScore');
    const o3Score = safeGetScore('o3Score');
    const o4Score = safeGetScore('o4Score');
    const minExerciseScore = score_exercise(safeGet(allData.o5Data, 'min_exercise_per_week'));
    const foodsScore = (score_foods(safeGet(allData.o5Data, 'fruits_veg'), safeGet(allData.o5Data, 'processed_food'), safeGet(allData.o5Data, 'high_fiber')) / 3);
    const sleepScore = (safeGet(allData.o6Data, 'sleep_hours') != null) ? (SLEEP_MAP[safeGet(allData.o6Data, 'sleep_hours')] || 0) : 0;
    const stressScore = ((STRESS_MAP[safeGet(allData.o6Data, 'problems_overwhelming')] || 0) + (STRESS_MAP[safeGet(allData.o6Data, 'enjoyable')] || 0) + (STRESS_MAP[safeGet(allData.o6Data, 'felt_nervous')] || 0)) / 3;
    const o2SatScore = score_o2_sat(safeGet(allData.o7Data, 'o2_sat'));
    const hrScore = score_hr(safeGet(allData.o7Data, 'pulse'));
    const bpScore = (score_bp_upper(safeGet(allData.o7Data, 'bp_upper')) + score_bp_lower(safeGet(allData.o7Data, 'bp_lower'))) / 2;
    const ldlScore = score_ldl(safeGet(allData.o7Data, 'LDL'));
    const hscrpScore = score_hscrp(safeGet(allData.o7Data, 'HsCRP'));
    const bsScore = (score_bs_am(safeGet(allData.o7Data, 'bs_am')) + score_bs_f(safeGet(allData.o7Data, 'bs_f')) + score_a1c(safeGet(allData.o7Data, 'A1C'))) / 3;
    const trigHdlRatioScore = score_trig_hdl_ratio(safeGet(allData.o7Data, 'trig_hdl_ratio'));
    const totalScore = (ageGenderAvg + bmiScore + wthrScore + o3Score + o4Score + minExerciseScore + foodsScore + sleepScore + stressScore + o2SatScore + hrScore + bpScore + ldlScore + hscrpScore + bsScore + trigHdlRatioScore);
    const MAX_POSSIBLE_SCORE = 132; 
    let cuoreScore = 100 - ((totalScore / MAX_POSSIBLE_SCORE) * 100);
    cuoreScore = roundTo(Math.min(Math.max(cuoreScore, 5), 95), 1);
    return cuoreScore;
};

// --- NEW FUNCTION: The single point of entry for final onboarding submission ---
exports.processAndSaveFinalSubmission = async (userId, payload) => {
    try {
        // Check for existing document to prevent duplicate submissions
        const existingDoc = await OnboardingModel.findOne({ userId });
        if (existingDoc) {
            throw new ValidationError("Onboarding data for this user already exists. Cannot submit again.");
        }

        // 1. Map frontend payload keys to backend keys, using default empty objects for safety
        const { 
            o2Data, 
            o4Data, 
            o5Data, 
            o6Data,
            onboarding3 = {}, 
            onboarding7 = {}
        } = payload;
        
        // --- Mapping for O3 data ---
        const mappedO3Data = {
            q1: onboarding3.selectedOptions ? onboarding3.selectedOptions.includes("One of my parents was diagnosed with diabetes before the age of 60") : false,
            q2: onboarding3.selectedOptions ? onboarding3.selectedOptions.includes("One of my parents had a heart attack before the age of 60") : false,
            q3: onboarding3.selectedOptions ? onboarding3.selectedOptions.includes("I have Hypertension (High blood pressure)") : false,
            q4: onboarding3.selectedOptions ? onboarding3.selectedOptions.includes("I have Diabetes (High blood sugar)") : false,
            q5: onboarding3.selectedOptions ? onboarding3.selectedOptions.includes("I feel short of breath or experience chest discomfort even during mild activity or at rest") : false,
            q6: onboarding3.selectedOptions ? onboarding3.selectedOptions.includes("I've noticed an increase in hunger, thirst, or the need to urinate frequently") : false,
            other_conditions: onboarding3.other_conditions || ""
        };
        
        // --- Mapping for O7 data ---
        const mappedO7Data = {
            o2_sat: onboarding7.oxygen,
            pulse: onboarding7.pulse,
            bp_upper: onboarding7.bpUpper,
            bp_lower: onboarding7.bpLower,
            bs_f: onboarding7.fastingSugar,
            bs_am: onboarding7.afterMealSugar,
            A1C: onboarding7.hba1c,
            HDL: onboarding7.hdl,
            LDL: onboarding7.ldl,
            Trig: onboarding7.triglycerides,
            HsCRP: onboarding7.hscrp
        };


        // 2. Validate required top-level modules
        if (!o2Data || !onboarding3 || !o4Data || !o5Data || !o6Data) {
            throw new ValidationError("Missing required modules. Please submit all data.");
        }

        // 3. Process and calculate scores for each module
        const o2Metrics = validateAndCalculateScores(o2Data);
        const o3Metrics = processO3Data(onboarding3);
        const o4Metrics = processO4Data(o4Data);
        const o5Metrics = processO5Data(o5Data);
        const o6Metrics = processO6Data(o6Data);

        // 4. Handle O7 data and calculate its scores
        let processedO7Data;
        let o7Score;
        const isAutofill = Object.keys(onboarding7).length === 0;
        
        if (isAutofill) {
            const totalScoreBeforeO7 = o2Metrics.scores.ageScore + o2Metrics.scores.genderScore + o2Metrics.scores.bmiScore + o2Metrics.scores.wthrScore + o3Metrics.o3Score + o4Metrics.o4Score + o5Metrics.o5Score + o6Metrics.o6Score;
            processedO7Data = getAutofillData(totalScoreBeforeO7);
        } else {
            const { o2_sat, pulse, bp_upper, bp_lower, bs_f, bs_am, A1C, HDL, LDL, Trig, HsCRP } = mappedO7Data;
            if (o2_sat == null || pulse == null || bp_upper == null || bp_lower == null || bs_f == null || bs_am == null || HDL == null || LDL == null || Trig == null || HsCRP == null) {
                throw new ValidationError("Missing required biomarker fields for manual entry.");
            }
            const normalizedHsCRP = (onboarding7.hscrp_unit && onboarding7.hscrp_unit.toLowerCase() === "mg/l") ? HsCRP : HsCRP / 10;
            const calculatedA1C = A1C || roundTo(((bs_f + bs_am) / 2 + 46.7) / 28.7, 2);
            const trig_hdl_ratio = roundTo(Trig / HDL, 2);
            processedO7Data = { ...mappedO7Data, HsCRP: normalizedHsCRP, A1C: calculatedA1C, trig_hdl_ratio, auto_filled: false };
        }

        // Calculate O7 score
        o7Score = score_o2_sat(processedO7Data.o2_sat) +
                  score_hr(processedO7Data.pulse) +
                  (score_bp_upper(processedO7Data.bp_upper) + score_bp_lower(processedO7Data.bp_lower)) / 2 +
                  (score_bs_f(processedO7Data.bs_f) + score_bs_am(processedO7Data.bs_am) + score_a1c(processedO7Data.A1C)) / 3 +
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
            o7Score: o7Score
        };

        const finalCuoreScore = calculateCuoreScore(payload, allScores);
        allScores.cuoreScore = finalCuoreScore;
        
        // 5. Create and save the final, complete document
        const newOnboardingDoc = await OnboardingModel.create({
            userId,
            onboardingVersion: "7",
            o2Data: o2Metrics.o2Data,
            derivedMetrics: o2Metrics.derivedMetrics,
            o3Data: o3Metrics.o3Data,
            o4Data: o4Metrics.o4Data,
            o5Data: o5Metrics.o5Data,
            o6Data: o6Metrics.o6Data,
            o7Data: processedO7Data,
            scores: allScores,
        });

        return newOnboardingDoc;
    } catch (error) {
        console.error('Error:', error.name, error.message);
        if (error.name === 'ValidationError') {
            throw error;
        }
        throw new Error("Internal Server Error");
    }
};

// --- UPDATED EXPORTS: Only the new function and necessary constants are exported ---
module.exports = {
    Onboarding: OnboardingModel,
    ValidationError,
    processAndSaveFinalSubmission: exports.processAndSaveFinalSubmission,
};