const mongoose = require('mongoose');

// Custom Error class for validation failures
class ValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ValidationError';
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
        cuoreScore: { type: Number, default: 0 }
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
        hasDiabetes: { type: Boolean, default: false }
    },
    o4Data: {
        smoking: { type: String },
        alcohol: { type: String }
    },
    o5Data: {
        min_exercise_per_week: { type: String },
        preferred_ex_time: { type: String },
        rest_day: { type: String },
        eating_preference: { type: String },
        fruits_veg: { type: String },
        processed_food: { type: String },
        high_fiber: { type: String }
    },
    o6Data: {
        sleep_hours: { type: String },
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
        auto_filled: { type: Boolean, default: false },
        
    },
    o7History: [{
    data: { type: Object }, // This will store a snapshot of the o7Data
    timestamp: { type: Date, default: Date.now }
}],
    timestamp: { type: Date, default: Date.now },
});

const OnboardingModel = mongoose.model('Onboarding', onboardingSchema, 'onboardings');

const SMOKING_SCORES = { "Never": 0, "Quit >6 months ago": 2, "Occasionally": 6, "Regularly": 10 };
const ALCOHOL_SCORES = { "Never": 0, "Quit >6 months ago": 2, "1-2 drinks occasionally": 4, "2 or more drinks at least twice per week": 8 };  // Corrected alcohol scores from your document
const FOODS_SCORE_MAP = { "Rarely": 8, "Sometimes": 6, "Often": 2, "Daily": 0 };
const EXERCISE_SCORE_MAP = { "Less than 75 min": 8, "75 to 150 min": 3, "More than 150 min": -1 };
const SLEEP_MAP = { "Less than 6 hours": 8, "Between 6 to 7 hours": 4, "Between 7 to 8 hours": 0, "Between 8 to 9 hours": 1, "More than 9 hours": 4 };
const STRESS_MAP = { "Never": 0, "Sometimes": 3, "Often": 6, "Always": 8 };

const MIN_AGE = 18;
const MAX_AGE = 88;
const MIN_HEIGHT = 120;
const MAX_HEIGHT = 210;
const MIN_WEIGHT = 25;
const MAX_WEIGHT = 200;
const MIN_WAIST = 15;
const MAX_WAIST = 75;

const roundTo = (val, decimals) => Math.round(val * Math.pow(10, decimals)) / Math.pow(10, decimals);

const validateAndCalculateScores = (data) => {
    const { age, gender, height_cm, weight_kg, waist_cm } = data;
    const parsedAge = parseInt(age);
    if (isNaN(parsedAge) || parsedAge < MIN_AGE || parsedAge > MAX_AGE) throw new ValidationError(`Age must be between ${MIN_AGE} and ${MAX_AGE}`);
    const parsedGender = gender.toLowerCase();
    if (!["male", "female", "other"].includes(parsedGender)) throw new ValidationError("Invalid gender. Must be 'male', 'female', or 'other'");
    const parsedHeight = parseFloat(height_cm);
    if (isNaN(parsedHeight) || parsedHeight < MIN_HEIGHT || parsedHeight > MAX_HEIGHT) throw new ValidationError(`Height must be between ${MIN_HEIGHT} and ${MAX_HEIGHT} cm`);
    const parsedWeight = parseFloat(weight_kg);
    if (isNaN(parsedWeight) || parsedWeight < MIN_WEIGHT || parsedWeight > MAX_WEIGHT) throw new ValidationError(`Weight must be between ${MIN_WEIGHT} and ${MAX_WEIGHT}`);
    const parsedWaist = parseFloat(waist_cm);
    if (isNaN(parsedWaist) || parsedWaist < MIN_WAIST || parsedWaist > MAX_WAIST) throw new ValidationError(`Waist must be between ${MIN_WAIST} and ${MAX_WAIST} cm`);
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
        const wthr = roundTo(waist_cm / (height_cm * 0.393), 2);
        return wthr < 0.47 ? -1 : (wthr > 0.52 ? 4 : 2);
    };
    const bmi = calculateBmi(parsedWeight, parsedHeight);
    const wthr = roundTo(parsedWaist / (parsedHeight * 0.393), 2);
    const ageScore = scoreAge(parsedAge, parsedGender);
    const genderScore = scoreGender(parsedGender);
    const bmiScore = scoreBmi(bmi, parsedGender);
    const wthrScore = scoreWthr(parsedWaist, parsedHeight);
    return {
        o2Data: { age: parsedAge, gender: parsedGender, height_cm: parsedHeight, weight_kg: parsedWeight, waist_cm: parsedWaist },
        derivedMetrics: { bmi, wthr },
        scores: { ageScore, genderScore, bmiScore, wthrScore }
    };
};

const processO3Data = (o3Data) => {
    // Define the question strings to avoid repetition
    const Q1_TEXT = "One of my parents was diagnosed with diabetes before the age of 60";
    const Q2_TEXT = "One of my parents had a heart attack before the age of 60";
    const Q3_TEXT = "I have Hypertension (High blood pressure)";
    const Q4_TEXT = "I have Diabetes (High blood sugar)";
    const Q5_TEXT = "I feel short of breath or experience chest discomfort even during mild activity or at rest";
    const Q6_TEXT = "I've noticed an increase in hunger, thirst, or the need to urinate frequently";

    const selectedOptions = o3Data.selectedOptions || [];

    // Use boolean flags for score calculation and hasHypertension/hasDiabetes flags
    const q1_selected = selectedOptions.includes(Q1_TEXT);
    const q2_selected = selectedOptions.includes(Q2_TEXT);
    const q3_selected = selectedOptions.includes(Q3_TEXT);
    const q4_selected = selectedOptions.includes(Q4_TEXT);
    const q5_selected = selectedOptions.includes(Q5_TEXT);
    const q6_selected = selectedOptions.includes(Q6_TEXT);

    // The score calculation remains the same, as the boolean flags work perfectly
    const o3Score = (q1_selected ? 2 : 0) + (q2_selected ? 2 : 0) + (q3_selected ? 4 : 0) + (q4_selected ? 6 : 0) + (q5_selected ? 8 : 0) + (q6_selected ? 4 : 0);
    
    const originalOtherConditions = o3Data.other_conditions || "";
    const updatedFlags = { hasHypertension: q3_selected, hasDiabetes: q4_selected };

    // This logic also remains unchanged
    const htnSynonyms = /hypertension|htn|high\sblood\spressure|bp/i;
    if (htnSynonyms.test(originalOtherConditions)) updatedFlags.hasHypertension = true;
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
        ...updatedFlags
    };

    return { o3Data: mappedO3Data, o3Score };
};

const processO4Data = (o4Data) => {
    const { smoking, alcohol } = o4Data;
    if (!SMOKING_SCORES.hasOwnProperty(smoking) || !ALCOHOL_SCORES.hasOwnProperty(alcohol)) {
        throw new ValidationError(`Invalid value for smoking or alcohol.`);
    }
    const o4Score = SMOKING_SCORES[smoking] + ALCOHOL_SCORES[alcohol];
    return { o4Data: { smoking, alcohol }, o4Score };
};

const processO5Data = (o5Data) => {
    const { min_exercise_per_week, fruits_veg, processed_food, high_fiber } = o5Data;
    if (!EXERCISE_SCORE_MAP.hasOwnProperty(min_exercise_per_week)) {
        throw new ValidationError(`Invalid value for min_exercise_per_week: ${min_exercise_per_week}.`);
    }
    if (!FOODS_SCORE_MAP.hasOwnProperty(fruits_veg) || !FOODS_SCORE_MAP.hasOwnProperty(processed_food) || !FOODS_SCORE_MAP.hasOwnProperty(high_fiber)) {
        throw new ValidationError("Invalid value for one of the food-related fields.");
    }
    const exerciseScore = EXERCISE_SCORE_MAP[min_exercise_per_week];
    const foodsScore = FOODS_SCORE_MAP[fruits_veg] + FOODS_SCORE_MAP[processed_food] + FOODS_SCORE_MAP[high_fiber];
    const o5Score = exerciseScore + foodsScore;
    return { o5Data, o5Score };
};

const processO6Data = (o6Data) => {
    const { sleep_hours, problems_overwhelming, enjoyable, felt_nervous } = o6Data;
    if (!SLEEP_MAP.hasOwnProperty(sleep_hours)) {
        throw new ValidationError(`Invalid sleep_hours value: ${sleep_hours}.`);
    }
    if (!STRESS_MAP.hasOwnProperty(problems_overwhelming) || !STRESS_MAP.hasOwnProperty(enjoyable) || !STRESS_MAP.hasOwnProperty(felt_nervous)) {
        throw new ValidationError("Invalid value for one of the stress-related fields.");
    }
    const sleepScore = SLEEP_MAP[sleep_hours];
    const stress_avg = (STRESS_MAP[problems_overwhelming] + STRESS_MAP[enjoyable] + STRESS_MAP[felt_nervous]) / 3;
    const o6Score = sleepScore + stress_avg;
    return { o6Data, o6Score };
};

const score_o2_sat = (value_pct) => value_pct > 95 ? 0 : value_pct >= 93 ? 4 : value_pct >= 91 ? 6 : 10;
const score_hr = (hr) => hr < 65 || hr > 95 ? 4 : 0;
const score_bp_upper = (val) => val < 100 ? 2 : val <= 124 ? 0 : val <= 139 ? 3 : val <= 160 ? 6 : 8;
const score_bp_lower = (val) => val < 70 ? 2 : val <= 84 ? 0 : val <= 99 ? 3 : val <= 110 ? 6 : 8;
const score_bs_f = (val) => val < 80 ? 2 : val <= 100 ? 0 : val <= 130 ? 2 : val <= 160 ? 6 : 8;
const score_bs_am = (val) => val < 110 ? 2 : val <= 140 ? 0 : val <= 190 ? 2 : val <= 240 ? 6 : 8;
const score_a1c = (val) => val < 5.8 ? 0 : val <= 8.6 ? 4 : 8;
const score_hdl = (val) => val < 50 ? 4 : val > 60 ? -1 : 2;
const score_ldl = (val) => val < 71 ? 0 : val > 139 ? 4 : 2;
const score_trig = (val) => val < 131 ? 0 : val > 159 ? 4 : 2;
const score_hscrp = (val) => val < 1 ? 0 : val <= 3 ? 2 : 4;
const score_trig_hdl_ratio = (val) => val < 2.5 ? 0 : val > 4.0 ? 8 : 3;

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
    const minExerciseScore = EXERCISE_SCORE_MAP[safeGet(allData.o5Data, 'min_exercise_per_week')];
    const foodsScore = (FOODS_SCORE_MAP[safeGet(allData.o5Data, 'fruits_veg')] + FOODS_SCORE_MAP[safeGet(allData.o5Data, 'processed_food')] + FOODS_SCORE_MAP[safeGet(allData.o5Data, 'high_fiber')]);
    const sleepScore = SLEEP_MAP[safeGet(allData.o6Data, 'sleep_hours')];
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
        const existingDoc = await OnboardingModel.findOne({ userId });

        if (!existingDoc && !payload.o2Data) {
            throw new ValidationError("A full submission (starting with o2Data) is required for the first onboarding.");
        }

        // ============================================================================
        // ## NEW UNIFIED LOGIC: MERGE INCOMING PAYLOAD WITH EXISTING DATA ##
        // ============================================================================
        // Start with the existing data (if it exists), then intelligently merge the new payload on top.
        // The spread operator (...) handles this perfectly. Any new values in the payload
        // will overwrite old ones, and empty objects will have no effect.
        const mergedData = {
            ...(existingDoc ? existingDoc.toObject() : {}),
            ...payload,
            o2Data: { ...(existingDoc ? existingDoc.o2Data : {}), ...payload.o2Data },
            o3Data: { ...(existingDoc ? existingDoc.o3Data : {}), ...payload.o3Data },
            o4Data: { ...(existingDoc ? existingDoc.o4Data : {}), ...payload.o4Data },
            o5Data: { ...(existingDoc ? existingDoc.o5Data : {}), ...payload.o5Data },
            o6Data: { ...(existingDoc ? existingDoc.o6Data : {}), ...payload.o6Data },
            o7Data: { ...(existingDoc ? existingDoc.o7Data : {}), ...payload.o7Data },
        };

        // --- ALWAYS PROCESS THE FINAL, MERGED DATA ---
        const o2Metrics = validateAndCalculateScores(mergedData.o2Data);
        const o3Metrics = processO3Data(mergedData.o3Data);
        const o4Metrics = processO4Data(mergedData.o4Data);
        const o5Metrics = processO5Data(mergedData.o5Data);
        const o6Metrics = processO6Data(mergedData.o6Data);

        // --- O7 PROCESSING (INCLUDES AUTO-FILL LOGIC IF NEEDED) ---
        let processedO7Data;
        const isO7Empty = !mergedData.o7Data || Object.keys(mergedData.o7Data).length === 0;

        if (isO7Empty) {
            const tempScores = { ...o2Metrics.scores, o3Score: o3Metrics.o3Score, o4Score: o4Metrics.o4Score, o5Score: o5Metrics.o5Score, o6Score: o6Metrics.o6Score };
            const totalScoreBeforeO7 = Object.values(tempScores).filter(s => typeof s === 'number').reduce((a, b) => a + b, 0);
            processedO7Data = getAutofillData(totalScoreBeforeO7);
        } else {
            const { o7Data } = mergedData;
            const { o2_sat, pulse, bp_upper, bp_lower, bs_f, bs_am, A1C, HDL, LDL, Trig, HsCRP } = o7Data;
            if ([o2_sat, pulse, bp_upper, bp_lower, bs_f, bs_am, HDL, LDL, Trig, HsCRP].some(v => v == null)) {
                throw new ValidationError("Missing required biomarker fields for manual entry.");
            }
            const normalizedHsCRP = (o7Data.hscrp_unit && o7Data.hscrp_unit.toLowerCase() === "mg/l") ? HsCRP : HsCRP / 10;
            const calculatedA1C = A1C || roundTo(((bs_f + bs_am) / 2 + 46.7) / 28.7, 2);
            const trig_hdl_ratio = roundTo(Trig / HDL, 2);
            processedO7Data = { ...o7Data, HsCRP: normalizedHsCRP, A1C: calculatedA1C, trig_hdl_ratio, auto_filled: false };
        }

        // --- ALWAYS RECALCULATE ALL SCORES ---
        const o7Score = score_o2_sat(processedO7Data.o2_sat) + score_hr(processedO7Data.pulse) + (score_bp_upper(processedO7Data.bp_upper) + score_bp_lower(processedO7Data.bp_lower)) / 2 + (score_bs_f(processedO7Data.bs_f) + score_bs_am(processedO7Data.bs_am) + score_a1c(processedO7Data.A1C)) / 3 + score_hdl(processedO7Data.HDL) + score_ldl(processedO7Data.LDL) + score_trig(processedO7Data.Trig) + score_hscrp(processedO7Data.HsCRP) + score_trig_hdl_ratio(processedO7Data.trig_hdl_ratio);
        const allScores = { ...o2Metrics.scores, o3Score: o3Metrics.o3Score, o4Score: o4Metrics.o4Score, o5Score: o5Metrics.o5Score, o6Score: o6Metrics.o6Score, o7Score };
        
        const finalDataToSave = {
            userId,
            onboardingVersion: "7",
            o2Data: o2Metrics.o2Data,
            derivedMetrics: o2Metrics.derivedMetrics,
            o3Data: o3Metrics.o3Data,
            o4Data: o4Metrics.o4Data,
            o5Data: o5Metrics.o5Data,
            o6Data: o6Metrics.o6Data,
            o7Data: processedO7Data,
            timestamp: new Date(),
        };

        allScores.cuoreScore = calculateCuoreScore(finalDataToSave, allScores);
        finalDataToSave.scores = allScores;

        // --- DATABASE UPDATE ---
        const updateOperation = {
            $set: finalDataToSave
        };

        // Only add to history if the user actually submitted new O7 data
        if (payload.o7Data && Object.keys(payload.o7Data).length > 0) {
            updateOperation.$push = {
                o7History: {
                    data: processedO7Data,
                    timestamp: finalDataToSave.timestamp
                }
            };
        }
        
        const finalOnboardingDoc = await OnboardingModel.findOneAndUpdate(
            { userId },
            updateOperation,
            { new: true, upsert: true, runValidators: true }
        );

        if (!finalOnboardingDoc) {
            throw new ValidationError("Failed to save onboarding data.");
        }

        return finalOnboardingDoc;

    } catch (error) {
        console.error('Error:', error.name, error.message);
        if (error.name === 'ValidationError') {
            throw error;
        }
        throw new Error("Internal Server Error");
    }
};

exports.getOnboardingDataByUserId = async (userId) => {
    try {
        const onboardingData = await OnboardingModel.findOne({ userId });
        if (!onboardingData) {
            return null;
        }
        return onboardingData;
    } catch (error) {
        console.error('Error in getOnboardingDataByUserId:', error);
        throw error;
    }
};

const calculateTimeToTarget = (userData) => {
    const { o2Data, o7Data, o3Data } = userData;
    const { height_cm, weight_kg, gender } = o2Data;
    const { bp_upper, bs_am } = o7Data;

    // Calculate target weight based on gender
    const heightInInches = (height_cm - 152.4) / 2.4;
    const targetWeight = gender === 'male' ? 
        52 + (1.9 * heightInInches) : 
        50 + (1.7 * heightInInches);

    // Calculate differences
    const weightDiff = Math.abs(weight_kg - targetWeight) / 1.2;
    const bpDiff = Math.abs(bp_upper - 120) / 2;
    const bsDiff = Math.abs(bs_am - 160) / 10;

    // Return highest value + 1
    return Math.max(weightDiff, bpDiff, bsDiff) + 1;
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
        gap: Math.round(metabolicAge - age)
    };
};

const calculateWeightMetrics = (userData) => {
    const { o2Data } = userData;
    const { height_cm, weight_kg, gender } = o2Data;
    
    const heightInInches = (height_cm - 152.4) / 2.4;
    const targetWeight = gender === 'male' ? 
        52 + (1.9 * heightInInches) : 
        50 + (1.7 * heightInInches);

    const difference = ((weight_kg - targetWeight) / targetWeight) * 100;
    
    return {
        current: weight_kg,
        target: Math.round(targetWeight * 10) / 10,
        difference: Math.round(difference * 10) / 10,
        status: difference < 5 ? 'green' : 
               difference < 15 ? 'orange' : 'red'
    };
};

const calculateBMIMetrics = (userData) => {
    const { o2Data, derivedMetrics } = userData;
    const { gender } = o2Data;
    const { bmi } = derivedMetrics;
    
    const targetBMI = gender === 'male' ? 22.5 : 23.5;
    const difference = ((bmi - targetBMI) / targetBMI) * 100;

    return {
        current: bmi,
        target: targetBMI,
        difference: Math.round(difference * 10) / 10,
        status: difference < 5 ? 'green' : 
               difference < 15 ? 'orange' : 'red'
    };
};

const calculateLifestyleScore = (userData) => {
    const { o5Data, o6Data } = userData;
    
    // Calculate food score
    const foodScore = (
        FOODS_SCORE_MAP[o5Data.fruits_veg] + 
        FOODS_SCORE_MAP[o5Data.processed_food] + 
        FOODS_SCORE_MAP[o5Data.high_fiber]
    ) / 3;

    // Calculate exercise score
    const exerciseScore = EXERCISE_SCORE_MAP[o5Data.min_exercise_per_week];

    // Calculate sleep score
    const sleepScore = SLEEP_MAP[o6Data.sleep_hours];

    // Calculate stress score
    const stressScore = (
        STRESS_MAP[o6Data.problems_overwhelming] + 
        STRESS_MAP[o6Data.enjoyable] + 
        STRESS_MAP[o6Data.felt_nervous]
    ) / 3;

    // Calculate final lifestyle score
    const lifestyleScore = (
        (100 - foodScore * 12) +
        (100 - exerciseScore * 12) +
        (100 - sleepScore * 12) +
        (100 - stressScore * 12)
    ) / 4;

    return {
        score: Math.round(lifestyleScore),
        status: lifestyleScore > 70 ? 'green' : 
               lifestyleScore > 55 ? 'orange' : 'red'
    };
};
const calculateRecommendedCalories = (userData) => {
    const { o2Data, derivedMetrics } = userData;
    const { age, gender, weight_kg, height_cm } = o2Data;
    const { bmi } = derivedMetrics;

    let baseCalories;
    if (gender === 'male') {
        baseCalories = 66.47 + (13.75 * weight_kg) + (5 * height_cm) - (6.75 * age);
    } else {
        baseCalories = 665.1 + (9.563 * weight_kg) + (1.85 * height_cm) - (4.67 * age);
    }

    // Apply multiplier based on BMI
    if (bmi < 21) {
        baseCalories *= 1.15;
    } else if (bmi > 24) {
        baseCalories *= 0.80;
    }

    // Round to nearest 100
    return Math.round(baseCalories / 100) * 100;
};

const calculateRecommendedExercise = (o5Data) => {
    const minExercise = o5Data.min_exercise_per_week;
    if (minExercise === "Less than 75 min") return 15;
    if (minExercise === "75 to 150 min") return 30;
    return 45; // for "More than 150 min"
};

const calculateBPStatus = (userData) => {
    const { bp_upper, bp_lower } = userData.o7Data;
    
    return {
        upper: {
            current: bp_upper,
            target: 120,
            status: bp_upper < 100 ? 'orange' :
                    bp_upper <= 130 ? 'green' :
                    bp_upper <= 145 ? 'orange' : 'red'
        },
        lower: {
            current: bp_lower,
            target: 80,
            status: bp_lower < 64 ? 'orange' :
                    bp_lower <= 82 ? 'green' :
                    bp_lower <= 95 ? 'orange' : 'red'
        }
    };
};

const calculateBloodSugar = (userData) => {
    const { bs_f, bs_am } = userData.o7Data;
    const hasDiabetes = userData.o3Data.hasDiabetes;

    return {
        fasting: {
            current: bs_f,
            target: 100,
            status: hasDiabetes ? 
                (bs_f < 100 ? 'red' :
                bs_f <= 139 ? 'green' :
                bs_f <= 170 ? 'orange' : 'red') :
                (bs_f < 100 ? 'green' :
                bs_f <= 125 ? 'orange' : 'red')
        },
        afterMeal: {
            current: bs_am,
            target: hasDiabetes ? 160 : 140,
            status: hasDiabetes ?
                (bs_am < 130 ? 'red' :
                bs_am <= 169 ? 'green' :
                bs_am <= 220 ? 'orange' : 'red') :
                (bs_am < 140 ? 'green' :
                bs_am <= 200 ? 'orange' : 'red')
        }
    };
};

const calculateTrigHDLRatio = (userData) => {
    const ratio = userData.o7Data.trig_hdl_ratio;
    return {
        current: ratio,
        target: 2.6,
        status: ratio < 2.8 ? 'green' :
                ratio <= 4.0 ? 'orange' : 'red'
    };
};

const calculateBodyFat = (userData) => {
    const { age, gender } = userData.o2Data;
    const { bmi } = userData.derivedMetrics;

    const bodyFat = gender === 'male' ?
        (1.2 * bmi) + (0.23 * age) - 16.2 :
        (1.2 * bmi) + (0.23 * age) - 5.4;

    const target = gender === 'male' ? 23 : 30;
    const difference = ((bodyFat - target) / target) * 100;

    return {
        current: Math.round(bodyFat * 10) / 10,
        target,
        difference: Math.round(difference * 10) / 10,
        status: difference < 5 ? 'green' :
                difference < 15 ? 'orange' : 'red'
    };
};

const calculateMainFocus = (userData) => {
    const scores = [
        { type: "Tobacco Cessation", score: SMOKING_SCORES[userData.o4Data.smoking] },
        { type: "Nutrition", score: (FOODS_SCORE_MAP[userData.o5Data.fruits_veg] + 
            FOODS_SCORE_MAP[userData.o5Data.processed_food] + 
            FOODS_SCORE_MAP[userData.o5Data.high_fiber]) / 3 },
        { type: "Fitness", score: EXERCISE_SCORE_MAP[userData.o5Data.min_exercise_per_week] },
        { type: "Sleep", score: SLEEP_MAP[userData.o6Data.sleep_hours] },
        { type: "Meditation", score: (STRESS_MAP[userData.o6Data.problems_overwhelming] + 
            STRESS_MAP[userData.o6Data.enjoyable] + 
            STRESS_MAP[userData.o6Data.felt_nervous]) / 3 }
    ];

    return scores
        .sort((a, b) => b.score - a.score)
        .slice(0, 2)
        .map(item => item.type);
};
// const metrics = calculateAllMetrics(userData);
// Update your existing exports to include these new calculations
const calculateAllMetrics = (userData) => ({
    timeToTarget: calculateTimeToTarget(userData),
    metabolicAge: calculateMetabolicAge(userData),
    weight: calculateWeightMetrics(userData),
    bmi: calculateBMIMetrics(userData),
    lifestyle: calculateLifestyleScore(userData),
    recommendedCalories: calculateRecommendedCalories(userData),
    recommendedExercise: calculateRecommendedExercise(userData.o5Data),
    bloodPressure: calculateBPStatus(userData),
    bloodSugar: calculateBloodSugar(userData),
    trigHDLRatio: calculateTrigHDLRatio(userData),
    bodyFat: calculateBodyFat(userData),
    mainFocus: calculateMainFocus(userData)
});


module.exports = {
    Onboarding: OnboardingModel,
    ValidationError,
    processAndSaveFinalSubmission: exports.processAndSaveFinalSubmission,
    getOnboardingDataByUserId: exports.getOnboardingDataByUserId,
     calculateAllMetrics,
      calculateMetrics: calculateAllMetrics 
};