const mongoose = require('mongoose');
const Medication = require('../models/Medication');
const Reminder = require('../models/Reminder');
const TimelineCard = require('../models/TimelineCard');
const User = require('../models/User');
const { Onboarding,calculateRecommendedExercise,calculateAllMetrics } = require('../models/onboardingModel.js');
const NudgeHistory = require('../models/NudgeHistory');
const { ensureSystemCardsExist } = require('../utils/ensureSystemCardsExist');


const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const isSameOrAfter = require('dayjs/plugin/isSameOrAfter');
const isSameOrBefore = require('dayjs/plugin/isSameOrBefore');
const customParseFormat = require('dayjs/plugin/customParseFormat');

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);
dayjs.extend(customParseFormat);

const TZ = 'Asia/Kolkata';

const NUDGES = {
    today: {
        smoking: [
            "Smoking increases loss of memory & thinking abilities by 30-50%.",
            "Smoking lowers testosterone, reducing libido, energy, and performance.",
            "Smoking damages blood vessels, increasing the risk of heart disease & erectile dysfunction.",
            "Smoking accelerates aging, leading to wrinkles and premature sagging.",
            "Every cigarette takes minutes from your life—quitting gives them back.",
            "An urge is just a thought, not a command. If you don’t act on it, it will pass.",
            "The hardest part is starting. Once you do, you’re already ahead.",
            "Don’t wait for motivation—take action, and motivation will follow.",
            "Every choice you make today sets you up for a healthier tomorrow.",
            "Your habits shape not only you but also your family’s future."
        ],
        medication_missed: [
            "Your medications work best when they’re on schedule—set the alarm",
            "Every missed dose is a missed opportunity for healing—stay on track",
            "Medication is a bridge to better health—don’t leave gaps in the path.",
            "Skipping your meds is like skipping steps on a ladder—sooner or later, you’ll fall.",
            "Medication only helps if it’s in you, not the bottle—set a reminder, stay healthy."
        ],
        sleep_less: [
            "Sleep is the foundation of your health.\" – Everything else rests on a good night’s sleep",
            "Go to bed and wake up at the same time every day. (Yes, even on weekends)",
            "Your body heals when you sleep.\" – Let sleep be the time when your body recovers and regenerates.",
            "Nap wisely — too long or too late in the day can disrupt sleep.",
            "Avoid distractions, keep phones and other devices out of the bedroom or in do not disturb mode",
            "Sleep improves the ability to learn, memorize, retain, recall, and use the knowledge to solve problems creatively",
            "Sleeping late or skipping sleep disrupts memory processing."
        ],
        stress: [
            "A positive mindset makes every goal more achievable.",
            "Take life one breath at a time—stress doesn’t control you, you control it.",
            "Inhale calm, exhale stress – Every breath is a chance to reset.",
            "Peace begins when you stop fighting your thoughts and start embracing the present.",
            "Release what you can’t control and focus on what you can.",
            "One step, one breath, one moment at a time—you are doing better than you think.",
            "Cultivate a positive mindset – Mental health is key to overall wellness.",
            "Deep breaths refresh the mind, just as sleep restores the body.",
            "A relaxed mind is a creative mind—clarity comes when stress fades.",
            "Your mind deserves the same care and rest as your body—nurture it."
        ],
        meditation_missed: [
            "Pair your meditation with a morning activity or while drifting off to sleep",
            "Meditation doesn’t require perfection; it just needs your presence.",
            "Even a minute of mindful breathing can reset your day—start small and watch it grow.",
            "Breathe in clarity, breathe out stress: a small daily ritual can spark a big change",
            "Begin each day with a gentle pause—just a few breaths can open the door to peace.",
            "Turn waiting time into mindful time—every quiet moment is a chance to reset.",
            "Inhale peace, exhale worry: let each breath be your anchor to the present moment"
        ],
        nutrition: [
            "You can’t outwork a bad diet—a healthy lifestyle starts in the kitchen.",
            "Small, smart choices in the kitchen lead to big results in your health.",
            "Healthy eating is about sustainable habits, not restrictions.",
            "Hydration is the foundation of good health—drink water, not sugar.",
            "Your gut health influences everything—choose foods that support digestion.",
            "Higher intake of vegetables, fiber, and fruits promotes better heart health.",
            "Maintain vigor & vitality through balanced nutrition and exercise.",
            "A high-fat, sugary diet may lead to long-lasting memory impairments.",
            "Healthy meals are linked to improved memory.",
            "Processed foods drain energy, while real foods sustain it."
        ],
        fitness: [
            "You are stronger than your excuses—push through!",
            "Just exercise – Every bit of movement counts, no matter how small.",
            "Movement is medicine – Every step strengthens your body and mind.",
            "Consistency beats intensity—small, daily efforts bring the best results.",
            "Strength training slows bone loss that comes with age.",
            "A combination of strength and cardio training is optimal for heart health.",
            "Moderate-intensity exercise improves thinking and memory.",
            "Physical activity is a natural stress reliever.",
            "The only bad workout is the one you didn’t do.",
            "Yoga supports a healthy circulatory and respiratory system.",
            "Active bodies age better—keep moving for longevity"
        ],
        breakfast_missed: [
            "When you skip breakfast, your body runs on stress, not strength.",
            "Eat well, feel well, do well—never underestimate the power of breakfast",
            "Skipping breakfast won’t save time—it’ll cost you energy, focus, and mood.",
            "A morning without breakfast leads to sluggish steps and scattered thoughts.",
            "Skipping breakfast is like hitting snooze on your metabolism—wake it up with real food.",
            "Ditching breakfast doesn’t mean eating less—it means craving more junk later.",
            "No breakfast, no balance—hunger now, cravings later, exhaustion all day.",
            "When you wake up, your brain is ready to go—don’t leave it starving at the start line.",
            "Your morning meal is the foundation of your day—skip it, and cracks will show.",
            "Skipping breakfast won’t make you lighter, just weaker."
        ],
        default: [
            "Children learn healthy choices by observing you.",
            "Small steps lead to big changes—keep moving forward.",
            "It’s not about being the best; it’s about being better than yesterday.",
            "Stay patient, stay committed, and the results will come.",
            "Progress isn’t about perfection—it’s about consistency.",
            "Every workout, every healthy meal, every mindful choice adds up.",
            "You don’t have to be perfect, just persistent.",
            "Success is built on daily choices—make today count!",
            "Believe in your journey, even when results take time to show."
        ],
    }
};

async function hasMissedTaskInPastDays(userId, taskTitle, days) {
    const thresholdDate = dayjs().tz(TZ).subtract(days, 'day').startOf('day').toDate();
    const missedTaskCount = await TimelineCard.countDocuments({
        userId,
        title: taskTitle,
        isCompleted: false,
        scheduleDate: { $gte: thresholdDate }
    });
    return missedTaskCount > 0;
}

async function getNudge(userId) {
    const now = dayjs().tz(TZ);
    const onboarding = await Onboarding.findOne({ userId }).lean();
    if (!onboarding) return NUDGES.today.default[0];

    // -- REMOVED --
    // The following block of code that checks if the nudge has already been refreshed today has been removed.
    /*
    if (onboarding.nudgeLastRefresh && dayjs(onboarding.nudgeLastRefresh).tz(TZ).isSame(now, 'day')) {
        return onboarding.lastShownNudgeText || NUDGES.today.default[0];
    }
    */
    // By removing the check above, the logic below will now run on every API call.

    // --- Calculate scores for all "Today" conditions based on the document ---
    const scores = {
        smoking: onboarding.scores?.o2Score || 0,
        medication_missed: await hasMissedTaskInPastDays(userId, 'Medication', 1) ? 8 : 0,
        sleep_less: (onboarding.scores?.o6Score || 0) > 3 ? (onboarding.scores.o6Score) : 0,
        stress: 0, // Calculated below
        meditation_missed: await hasMissedTaskInPastDays(userId, 'Short Nap or Walk', 3) ? 4 : 0,
        nutrition: (onboarding.scores?.nutrition_score || 0) > 3 ? (onboarding.scores.nutrition_score) : 0,
        fitness: await hasMissedTaskInPastDays(userId, 'Fitness', 3) ? 4 : 0,
        breakfast_missed: await hasMissedTaskInPastDays(userId, 'Breakfast', 2) ? 4 : 0,
    };

    // Calculate average stress score
    const stressScores = onboarding.scores?.stressScores || {};
    const stressValues = Object.values(stressScores);
    if (stressValues.length > 0) {
        const avgStress = stressValues.reduce((a, b) => a + b, 0) / stressValues.length;
        if (avgStress > 3) {
            scores.stress = avgStress;
        }
    }

    // --- Determine the winning segment based on the highest score ---
    let highestScore = 0;
    Object.values(scores).forEach(score => {
        if (score > highestScore) highestScore = score;
    });

    let winningSegments = [];
    if (highestScore > 0) {
        Object.entries(scores).forEach(([segment, score]) => {
            if (score === highestScore) winningSegments.push(segment);
        });
    }

    let selectedSegment = 'default';
    if (winningSegments.length > 0) {
        if (winningSegments.length > 1) { // Handle ties by alternating
            const lastWinner = onboarding.lastNudgeWinner || '';
            const lastWinnerIndex = winningSegments.indexOf(lastWinner);
            const nextIndex = (lastWinnerIndex + 1) % winningSegments.length;
            selectedSegment = winningSegments[nextIndex];
        } else { // Only one winner
            selectedSegment = winningSegments[0];
        }
    }
    
    // --- Get the next nudge from the selected segment, ensuring no repeats ---
    const nudgeHistory = await NudgeHistory.findOneAndUpdate(
        { userId, segment: `today_${selectedSegment}` },
        { $inc: { lastShownIndex: 1 } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    
    const nudgeArray = NUDGES.today[selectedSegment];
    const nextIndex = nudgeHistory.lastShownIndex % nudgeArray.length;
    const nudgeText = nudgeArray[nextIndex];

    // --- Save state for next time ---
    // We only need to save the last winner for the tie-breaking logic.
    await Onboarding.updateOne(
        { userId },
        {
            $set: {
                lastNudgeWinner: selectedSegment
            }
        }
    );

    return nudgeText;
}

// -----------------------------------------------------
// Utility Functions
// -----------------------------------------------------
function convertTo24Hour(timeStr) {
    if (!timeStr) return null;
    const match12 = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (match12) {
        let [_, hour, minute, period] = match12;
        hour = parseInt(hour);
        minute = parseInt(minute);
        if (period.toUpperCase() === 'PM' && hour !== 12) hour += 12;
        if (period.toUpperCase() === 'AM' && hour === 12) hour = 0;
        return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    }
    const match24 = timeStr.match(/(\d{1,2}):(\d{2})/);
    if (match24) {
        let [_, hour, minute] = match24;
        hour = parseInt(hour);
        minute = parseInt(minute);
        if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
            return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        }
    }
    return null;
}

const parseDate = (dateString) => {
    if (!dateString || dateString.toLowerCase() === 'never') return null;
    return new Date(dateString);
};

function calculateScheduledTime(baseTime, minutesToAdd) {
    return dayjs(baseTime).add(minutesToAdd, 'minute');
}

function getModelAndId(req) {
  const { reminderId, medicationId, id } = req.params;

  // Pick whichever exists in params
  const docId = reminderId || medicationId || id;

  // Infer model from URL path
  let model;
  if (req.originalUrl.includes('reminders')) model = Reminder;
  else if (req.originalUrl.includes('medications')) model = Medication;
  else model = Reminder; // fallback default

  return { model, docId };
}


function getColorStatus(value, greenThreshold, yellowThreshold, redThreshold) {
    if (value > greenThreshold) return 'green';
    if (value >= yellowThreshold) return 'yellow';
    if (value >= redThreshold) return 'red';
    return 'deep red'; // Or an appropriate default
}

const calculateHealthMetrics = (onboardingDoc) => {
    const { o2Data, o7Data, derivedMetrics, scores } = onboardingDoc;
    let hsCrpValue = o7Data.HsCRP;
    let hsCrpUnit = "mg/L"; // default
    
    if (hsCrpValue != null && hsCrpValue >= 1) {
      hsCrpValue = Number((hsCrpValue / 10).toFixed(2));
      hsCrpUnit = "mg/dL";
    }
    const { age, gender, height_cm, weight_kg, waist_cm } = o2Data;
    const { bmi, wthr } = derivedMetrics;
    // --- HsCRP normalization (unit correction) ---


    // --- Cuore Score ---
    const health_score = scores.cuoreScore;

    // --- Metabolic Age ---
    const metabolicAgeFactor = health_score >= 75 ? 0.95 : health_score <= 50 ? 1.2 : 1.1;
    const metabolicAge = Math.round(age * metabolicAgeFactor);
    const metabolicAgeGap = metabolicAge - age;

    // --- Time to Target ---
    const diffWeight = Math.abs(weight_kg - (gender === 'male' ? 52 + 1.9 * ((height_cm - 152.4) / 2.4) : 50 + 1.7 * ((height_cm - 152.4) / 2.4)));
    const diffBP = Math.abs(o7Data.bp_upper - 120);
    const diffBS = Math.abs(o7Data.bs_am - 160);
    const timeToTarget = Math.max(Math.ceil(diffWeight / 1.2), Math.ceil(diffBP / 2), Math.ceil(diffBS / 10)) + 1;

    // --- Weight ---
    const targetWeight = gender === 'male' ? 52 + 1.9 * ((height_cm - 152.4) / 2.4) : 50 + 1.7 * ((height_cm - 152.4) / 2.4);
    const weightDiffPercent = Math.abs(weight_kg - targetWeight) / targetWeight * 100;
    const weightStatus = weightDiffPercent < 5 ? 'green' : weightDiffPercent <= 15 ? 'orange' : 'red';

    // --- BMI ---
    const targetBMI = gender === 'male' ? 22.5 : 23.5;
    const bmiDiffPercent = Math.abs(bmi - targetBMI) / targetBMI * 100;
    const bmiStatus = bmiDiffPercent < 5 ? 'green' : bmiDiffPercent <= 15 ? 'orange' : 'red';
    
    // --- Recommended Calories ---
    let recommendedCalories;
    if (bmi < 21) {
        recommendedCalories = (gender === 'male' ? (66.47 + 13.75 * weight_kg + 5 * height_cm - 6.75 * age) * 1.15 : (665.1 + 9.563 * weight_kg + 1.85 * height_cm - 4.67 * age) * 1.15);
    } else if (bmi >= 21 && bmi <= 24) {
        recommendedCalories = (gender === 'male' ? (66.47 + 13.75 * weight_kg + 5 * height_cm - 6.75 * age) : (665.1 + 9.563 * weight_kg + 1.85 * height_cm - 4.67 * age));
    } else {
        recommendedCalories = (gender === 'male' ? (66.47 + 13.75 * weight_kg + 5 * height_cm - 6.75 * age) * 0.8 : (665.1 + 9.563 * weight_kg + 1.85 * height_cm - 4.67 * age) * 0.8);
    }
    recommendedCalories = Math.round(recommendedCalories / 100) * 100;

    // --- Recommended Exercise ---
    const recommendedExercise = scores.o5Score < 75 ? 15 : scores.o5Score <= 150 ? 30 : 45;

    // --- Lifestyle Score ---
    const lifestyleScore = 100 - (scores.o5Score / 100); // This is a placeholder, as the formula is complex
    const lifestyleStatus = lifestyleScore > 70 ? 'green' : lifestyleScore >= 55 ? 'orange' : 'red';

    // --- Vitals ---
   const bpUpperStatus =
  o7Data.bp_upper < 100 || o7Data.bp_upper > 145
    ? "red"
    : o7Data.bp_upper >= 116 && o7Data.bp_upper <= 126
    ? "green"
    : "orange";

const bpLowerStatus =
  o7Data.bp_lower < 68 || o7Data.bp_lower > 95
    ? "red"
    : o7Data.bp_lower >= 76 && o7Data.bp_lower <= 82
    ? "green"
    : "orange";

    const bsFastingTarget = scores.o3Data?.hasDiabetes ? '<100' : '<100';
    const bsFastingStatus = scores.o3Data?.hasDiabetes ? (o7Data.bs_f < 100 ? 'red' : o7Data.bs_f <= 139 ? 'green' : o7Data.bs_f <= 170 ? 'orange' : 'red') : (o7Data.bs_f < 100 ? 'green' : o7Data.bs_f <= 125 ? 'orange' : 'red');
    const bsAfterMealTarget = scores.o3Data?.hasDiabetes ? '<160' : '<140';
    const bsAfterMealStatus = scores.o3Data?.hasDiabetes
  ? (
      o7Data.bs_am < 130 ? 'red' :
      o7Data.bs_am <= 180 ? 'green' :
      o7Data.bs_am <= 220 ? 'orange' :
      'red'
    )
  : (
      o7Data.bs_am < 140 ? 'green' :
      o7Data.bs_am <= 200 ? 'orange' :
      'red'
    );

    const trigHDLRatioStatus = o7Data.trig_hdl_ratio < 2.8 ? 'green' : o7Data.trig_hdl_ratio <= 4.0 ? 'orange' : 'red';
    const targetBodyFat = gender === 'male' ? 23 : 30;
    const bodyFat = gender === 'male' ? (1.2 * bmi) + (0.23 * age) - 16.2 : (1.2 * bmi) + (0.23 * age) - 5.4;
    const bodyFatDiffPercent = Math.abs(bodyFat - targetBodyFat) / targetBodyFat * 100;
    const bodyFatStatus = bodyFatDiffPercent < 5 ? 'green' : bodyFatDiffPercent <= 15 ? 'orange' : 'red';
    
    // --- Main Focus ---
    // Placeholder logic for Main Focus
    const mainFocus = ["Nutrition", "Fitness"]; // This would be dynamic

    return {
        health_score,
        estimated_time_to_target: { value: timeToTarget, unit: "months" },
        metabolic_age: { value: metabolicAge, unit: "years", gap: metabolicAgeGap },
        weight: { current: weight_kg, target: targetWeight, unit: "kg", status: weightStatus },
        bmi: { value: bmi, target: targetBMI, status: bmiStatus },
        lifestyle_score: { value: lifestyleScore, target: 75, unit: "%", status: lifestyleStatus },
        recommended: {
            calories: { value: recommendedCalories, unit: "kcal" },
            exercise: { value: recommendedExercise, unit: "min" }
        },
        vitals: {
            blood_pressure: {
                current: `${o7Data.bp_upper}/${o7Data.bp_lower}`,
                target: "120/80",
                status: { upper: bpUpperStatus, lower: bpLowerStatus }
            },
            blood_sugar: {
                fasting: { value: o7Data.bs_f, target: bsFastingTarget, status: bsFastingStatus },
                after_meal: { value: o7Data.bs_am, target: bsAfterMealTarget, status: bsAfterMealStatus }
            },
            cholesterol: {
                tg_hdl_ratio: {
                    value: o7Data.trig_hdl_ratio,
                    target: "<2.6",
                    status: trigHDLRatioStatus
                }
            },
            body_fat: {
                value: Math.round(bodyFat * 100) / 100,
                target: targetBodyFat,
                unit: "%",
                status: bodyFatStatus
            }
        },
        main_focus: mainFocus
    };
};

// Helper: consider a question "answered" only when it's not
// the literal "false" (string), not boolean false, not null/undefined, and not an empty string.
const isAnswered = (v) => {
  if (v === null || v === undefined) return false;
  const s = String(v).trim().toLowerCase();
  if (s === "" || s === "false") return false;
  return true;
};

// Helper: strict affirmative (if your data uses explicit "Yes"/"No" or "true"/"false")
// You probably don't need this for q5 since UI stores descriptive text.
const isAffirmative = (v) => {
  if (!isAnswered(v)) return false;
  const s = String(v).trim().toLowerCase();
  return s === "yes" || s === "true" || s.startsWith("yes");
};


// Alerts function
// Replace existing getAlerts implementation with this
// -------------------------------------------------------------------------
// ⭐ FIXED getAlerts FUNCTION (FULL VERSION)
// -------------------------------------------------------------------------
const getAlerts = async (userId) => {
  const alerts = [];
  const onboarding = await Onboarding.findOne({ userId }).lean();
  if (!onboarding) return [];

  const { o3Data = {}, o7Data = {}, scores = {} } = onboarding;

  const n = (v) => {
    if (v === null || v === undefined || v === "") return null;
    const x = parseFloat(v);
    return isNaN(x) ? null : x;
  };

  const worst = (a, b) => {
    const rank = { red: 3, orange: 2, yellow: 1, none: 0 };
    const ra = a ? rank[a] : 0;
    const rb = b ? rank[b] : 0;
    const maxRank = Math.max(ra, rb);
    return Object.keys(rank).find((k) => rank[k] === maxRank);
  };

  // Helper functions already defined globally:
  // isAnswered(), isAffirmative()

  // ---------------------------------------------------------------------
  // 0️⃣ Doctor Check-in Alert
  // ---------------------------------------------------------------------
  if (onboarding.doctorRequestedCheckin) {
    alerts.push({
      type: "red",
      text: "Check-in requested by doctor.",
      action: "Check-in",
    });
  }

  // ---------------------------------------------------------------------
  // 1️⃣ SOB Alert (O3 q5)
  // ---------------------------------------------------------------------
  if (isAnswered(o3Data.q5) && isAffirmative(o3Data.q5)) {
    alerts.push({
      type: "red",
      text: "Consult your doctor promptly for SOB.",
      action: "Consult",
    });
  }

  // ---------------------------------------------------------------------
  // 2️⃣ Diabetes Symptom (O3 q6)
  // ---------------------------------------------------------------------
  if (isAnswered(o3Data.q6) && isAffirmative(o3Data.q6)) {
    alerts.push({
      type: "orange",
      text: "Consult your doctor for diabetes.",
      action: "Consult",
    });
  }

  // ---------------------------------------------------------------------
  // 3️⃣ Blood Pressure (Worst-case rule)
  // ---------------------------------------------------------------------
  const sys = n(o7Data.bp_upper);
  const dia = n(o7Data.bp_lower);

  const sysStatus = (() => {
    if (sys == null) return null;
    if (sys > 170 || sys < 90) return "red";
    if ((sys >= 150 && sys <= 170) || (sys >= 90 && sys <= 100)) return "orange";
    if ((sys >= 140 && sys <= 150) || (sys >= 100 && sys <= 110)) return "yellow";
    return null;
  })();

  const diaStatus = (() => {
    if (dia == null) return null;
    if (dia > 110 || dia < 60) return "red";
    if ((dia >= 100 && dia <= 110) || (dia >= 60 && dia <= 66)) return "orange";
    if ((dia >= 88 && dia <= 100) || (dia >= 66 && dia <= 74)) return "yellow";
    return null;
  })();

  const bpWorst = worst(sysStatus, diaStatus);

  if (bpWorst === "red") {
    alerts.push({
      type: "red",
      text: "Consult your doctor for BP.",
      action: "Consult",
    });
  } else if (bpWorst === "orange") {
    alerts.push({
      type: "orange",
      text: "Consult your doctor for BP.",
      action: "Consult",
    });
  } else if (bpWorst === "yellow") {
    alerts.push({
      type: "yellow",
      text: "Monitor BP.",
      action: "Monitor",
    });
  }

  // ---------------------------------------------------------------------
  // 4️⃣ Heart Rate
  // ---------------------------------------------------------------------
  const pulse = n(o7Data.pulse);
  if (pulse != null) {
    if (pulse < 50 || pulse > 120) {
      alerts.push({
        type: "red",
        text: "Consult your doctor for heart rate.",
        action: "Consult",
      });
    } else if ((pulse >= 50 && pulse <= 60) || (pulse >= 110 && pulse <= 120)) {
      alerts.push({
        type: "orange",
        text: "Monitor heart rate.",
        action: "Monitor",
      });
    }
  }

  // ---------------------------------------------------------------------
  // 5️⃣ BLOOD SUGAR (Corrected Rules — Final Verified Logic)
  // ---------------------------------------------------------------------

 // -------------------------
// BLOOD SUGAR (robust, uses hasDiabetes)
// -------------------------
const bsF = n(o7Data.bs_f);
const bsA = n(o7Data.bs_am);

// Debug info (temporary)
console.log("[DBG] o3Data.q4:", o3Data.q4, "o3Data.hasDiabetes:", o3Data.hasDiabetes);
console.log("[DBG] parsed bsF:", bsF, "bsA:", bsA);

// Diabetes decision
const hasDiabetes = o3Data.hasDiabetes === true;
// IMPORTANT: NO + UNANSWERED are treated the SAME
const noDiabetes = !hasDiabetes;

let bsWorst = null;

if (hasDiabetes) {
  // -------------------------
  // RULE 6: HAS DIABETES
  // -------------------------
  const bsFStatus = (() => {
    if (bsF == null) return null;
    if (bsF > 240 || bsF < 100) return "orange";
    if ((bsF >= 200 && bsF <= 240) || (bsF >= 100 && bsF <= 140)) return "yellow";
    return null;
  })();

  const bsAStatus = (() => {
    if (bsA == null) return null;
    if (bsA > 260 || bsA < 120) return "orange";
    if ((bsA >= 220 && bsA <= 260) || (bsA >= 120 && bsA <= 160)) return "yellow";
    return null;
  })();

  bsWorst = worst(bsFStatus, bsAStatus);
  console.log(
    "[DBG] hasDiabetes path -> bsFStatus:",
    bsFStatus,
    "bsAStatus:",
    bsAStatus,
    "bsWorst:",
    bsWorst
  );

} else {
  // -------------------------
  // RULE 7: NO OR UNANSWERED
  // -------------------------
  if ((bsF != null && bsF > 120) || (bsA != null && bsA > 160)) {
    bsWorst = "orange";
  } else {
    bsWorst = null;
  }

  console.log("[DBG] noDiabetes (NO + UNANSWERED) path -> bsWorst:", bsWorst);
}

// -------------------------
// PUSH ALERT
// -------------------------
if (bsWorst === "orange") {
  alerts.push({
    type: "orange",
    text: "Monitor sugar & consult your doctor.",
    action: "Monitor",
  });
} else if (bsWorst === "yellow") {
  alerts.push({
    type: "yellow",
    text: "Monitor sugar.",
    action: "Monitor",
  });
}


  // ---------------------------------------------------------------------
  // 6️⃣ O2 Saturation
  // ---------------------------------------------------------------------
  const o2 = n(o7Data.o2_sat);
  if (o2 != null) {
    if (o2 < 91) {
      alerts.push({
        type: "red",
        text: "Consult your doctor for O2 Sat.",
        action: "Consult",
      });
    } else if (o2 >= 91 && o2 <= 94) {
      alerts.push({
        type: "orange",
        text: "Monitor your O2 saturation.",
        action: "Monitor",
      });
    }
  }

  // ---------------------------------------------------------------------
  // 7️⃣ HsCRP
  // ---------------------------------------------------------------------
  const hs = n(o7Data.HsCRP);
  if (hs != null && hs > 0.3) {
    alerts.push({
      type: "orange",
      text: "Consult your doctor for high HsCRP.",
      action: "Consult",
    });
  }

  // ---------------------------------------------------------------------
  // 8️⃣ Cholesterol
  // ---------------------------------------------------------------------
  const hdl = n(o7Data.HDL);
  const ldl = n(o7Data.LDL);
  const tri = n(o7Data.Trig);

  if ((hdl != null && hdl < 45) || (ldl != null && ldl > 180) || (tri != null && tri > 200)) {
    alerts.push({
      type: "orange",
      text: "Consult your doctor for Cholesterol.",
      action: "Consult",
    });
  }

  
  

  // ---------------------------------------------------------------------
  // 🔟 Consultation reminder based on Cuore Score <55%
  // ---------------------------------------------------------------------
  const cuoreScore =
    parseFloat(scores?.cuoreScore ?? scores?.cuore ?? scores?.cuore_score ?? 0);

  const lastConsult = onboarding.lastConsultedDate
    ? new Date(onboarding.lastConsultedDate)
    : null;

  if (!isNaN(cuoreScore) && cuoreScore < 55 && lastConsult) {
    const daysSince =
      (Date.now() - lastConsult.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSince > 100) {
      alerts.push({
        type: "orange",
        text: "It's time to check in with your doctor.",
        action: "Consult",
      });
    }
  }
  
  // ---------------------------------------------------------------------
// 🔟 Exercise Timing Alert (Fitness within 60 mins after meal)
// ---------------------------------------------------------------------

const todayStr = dayjs().tz(TZ).format("YYYY-MM-DD");
const timeline = await getTimelineData(userId, todayStr);

let fitnessMins = null;
const mealMins = [];

// Convert "h:mm A" → minutes
const toMinutes = (t) => {
  const d = dayjs(t, "h:mm A");
  return d.hour() * 60 + d.minute();
};

for (const card of timeline.dailySchedule) {
  const title = card.title.toLowerCase();
  const mins = toMinutes(card.time);

  if (title.includes("fitness")) {
    fitnessMins = mins;
  }

  if (
    title.includes("breakfast") ||
    title.includes("lunch") ||
    title.includes("dinner")
  ) {
    mealMins.push(mins);
  }
}

// Check rule
if (fitnessMins != null && mealMins.length) {
  for (const m of mealMins) {
    const diff = fitnessMins - m;
    if (diff > 0 && diff <= 60) {
      alerts.push({
        type: "yellow",
        text: "Avoid exercising within 60 minutes of eating.",
        action: "Avoid"
      });
      break;
    }
  }
}

  

  // ---------------------------------------------------------------------
  // FINAL: SORT & DEDUPE
  // ---------------------------------------------------------------------
  const severityOrder = { red: 1, orange: 2, yellow: 3 };

  alerts.sort((a, b) => severityOrder[a.type] - severityOrder[b.type]);

  const unique = [];
  const seen = new Set();

  for (const a of alerts) {
    const key = `${a.type}-${a.text}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(a);
    }
  }

  return unique;
};





// -----------------------------------------------------
// Generate Timeline Cards
// -----------------------------------------------------
const generateTimelineCardsForDay = async (userId, targetDate) => {
  try {
    const localDay = dayjs(targetDate).tz(TZ).startOf("day");

    // 1. Fetch all active reminders
    const allEntries = await Reminder.find({
      userId,
      isActive: true,
      startDate: { $lte: localDay.endOf("day").toDate() },
      $or: [
        { endDate: null },
        { endDate: { $gte: localDay.startOf("day").toDate() } }
      ]
    }).lean();

    const newCards = [];

    allEntries.forEach((entry) => {
      const timeStr = convertTo24Hour(entry.time) || "00:00";

      // 🕒 FIX: Build scheduleDate using updated time
      const [hh, mm] = timeStr.split(":");
      const scheduleDate = dayjs(entry.startDate)
        .hour(Number(hh))
        .minute(Number(mm))
        .second(0)
        .toDate();

      if (entry.isMedication === true) {
        newCards.push({
          userId,
          scheduleDate,                // <-- FIXED TIME APPLIED
          scheduledTime: timeStr,
          title: "Medication",
          description: entry.title,
          type: "USER_MEDICATION",
          sourceId: entry._id,
        });
      } else {
        newCards.push({
          userId,
          scheduleDate,               // <-- FIXED TIME APPLIED
          scheduledTime: timeStr,
          title: entry.title,
          description: entry.description || null,
          type: "USER_REMINDER",
          sourceId: entry._id,
        });
      }
    });

 await TimelineCard.findOneAndUpdate(
  {
    userId,
    sourceId: card.sourceId,
  },
  {
    $set: {
      userId: card.userId,
      sourceId: card.sourceId,
      title: card.title,
      description: card.description,
      scheduledTime: card.scheduledTime,
      scheduleDate: card.scheduleDate,
      type: card.type
    }
  },
  { upsert: true, new: true }
);



    // 4. Clean up orphaned cards
    const validSourceIds = newCards.map((c) => c.sourceId.toString());
    await TimelineCard.deleteMany({
      userId,
      type: { $in: ["USER_REMINDER", "USER_MEDICATION"] },
      sourceId: { $nin: validSourceIds },
    });

    console.log(`✅ Timeline regenerated safely for user ${userId}.`);
  } catch (error) {
    console.error(`❌ Error generating timeline for ${userId}:`, error);
  }
};





// -----------------------------------------------------
// Home Screen Controller
// -----------------------------------------------------
// const { calculateAllMetrics } = require("./timelineController");  // adjust path IF needed

exports.getHomeScreenData = async (req, res) => {
    const userId = req.user.userId;
    const dateString = req.query.date || dayjs().tz(TZ).format("YYYY-MM-DD");

    try {
        // ⭐ Fetch everything you need (cuoreScoreData was missing earlier)
        const [
            userData,
            timelineData,
            cuoreScoreData,
            alerts,
            motivationalMessage,
            onboarding
        ] = await Promise.all([
            User.findById(userId).select("display_name profileImage").lean(),
            getTimelineData(userId, dateString),
            getCuoreScoreData(userId),          // ← FIXED
            getAlerts(userId),
            getNudge(userId),
            Onboarding.findOne({ userId }).lean()
        ]);

        const today = dayjs().tz(TZ).startOf("day");

let streakCount = onboarding?.streakCount || 0;
const lastStreakDate = onboarding?.lastStreakDate
  ? dayjs(onboarding.lastStreakDate).tz(TZ).startOf("day")
  : null;

// If user is visiting on a NEW day
if (!lastStreakDate || today.isAfter(lastStreakDate)) {
  streakCount += 1;

  await Onboarding.updateOne(
    { userId },
    {
      $set: {
        streakCount,
        lastStreakDate: today.toDate()
      }
    }
  );
}

        if (!userData) {
            return res.status(404).json({ message: "User data not found." });
        }

        // ⭐ Set Onboarding date
        let onboardedAt = onboarding?.onboardedAt
            ? dayjs(onboarding.onboardedAt)
            : dayjs(); // fallback for old users

        // ⭐ Calculate using SAME LOGIC as CuoreScore Screen
        const metrics = calculateAllMetrics(onboarding);

        let cuoreMonths = metrics?.timeToTarget ?? 0;

        // ⭐ Clamp to 18 months max
        const clampedMonths = Math.min(cuoreMonths, 18);

        // ⭐ Target date
        const targetDate = onboardedAt.add(clampedMonths, "month");

        const programTimeline = {
            startMonth: onboardedAt.format("MMM 'YY"),
            targetMonth: targetDate.format("MMM 'YY"),
            monthsToGo: clampedMonths
        };

          if (timelineData.dailySchedule && Array.isArray(timelineData.dailySchedule)) {
            timelineData.dailySchedule = timelineData.dailySchedule.map(card => ({
                ...card,
                notified: card.alarm_notified === true
            }));
        }

        // ⭐ Build response
        const payload = {
            user: {
                id: userId,
                name: `Hi,${userData.display_name}`,
                profileImage: userData.profileImage || "https://example.com/images/mjohnson.png",
            },

            date: dateString,

            summary: {
                missedTasks: timelineData.missed,
                totalTasks: timelineData.totalTasks,
                display: `${timelineData.missed}/${timelineData.totalTasks}`,
                message: `${timelineData.missed} ${timelineData.missed === 1 ? "task" : "tasks"} missed`,
            },

            // ⭐ PROGRESS FIX (cuoreScoreData now exists safely)
            progress: {
                periods: cuoreScoreData.history.map((score, i, arr) => ({
                    month: dayjs(score.date).format("MMM 'YY"),
                    programTimeline,
                    value: score.cuoreScore,
                    userImage:
                        i === arr.length - 1
                            ? userData.profileImage || "https://example.com/images/mjohnson.png"
                            : undefined
                })),
                goal: ">75%",
                buttonText: "Update Biomarkers"
            },

            motivationalMessage,
            alerts,
            dailySchedule: timelineData.dailySchedule,
            streak: timelineData.streak

            
        };

        return res.status(200).json(payload);

    } catch (error) {
        console.error("Error fetching home screen data:", error);
        res.status(500).json({ error: "Internal server error." });
    }
};








// -----------------------------------------------------
// Timeline Helper
// -----------------------------------------------------
const getTimelineData = async (userId, dateString) => {
  let localDay = dayjs.tz(dateString, TZ);
  if (!localDay.isValid()) {
    localDay = dayjs().tz(TZ);
  }
  localDay = localDay.startOf("day");

  const utcStart = localDay.utc().toDate();
  const utcEnd = localDay.endOf("day").utc().toDate();

  // --------------------------------------------------
  // Fetch onboarding
  // --------------------------------------------------
  const onboarding = await Onboarding.findOne({ userId })
    .select("o4Data.smoking o5Data.preferred_ex_time o6Data.wake_time streakCount lastStreakDate")
    .lean();

  if (!onboarding) {
    return { dailySchedule: [], missed: 0, alerts: [], streak: 0 };
  }

  await ensureSystemCardsExist(userId, onboarding, localDay);
  // --------------------------------------------------
  // Fetch ALL cards for the day
  // --------------------------------------------------
  const rawCards = await TimelineCard.find({
  userId,
  scheduleDate: {
  $gte: localDay.startOf("day").toDate(),
  $lte: localDay.endOf("day").toDate()
}
})
.select("scheduledTime title description type systemKey updatedAt isCompleted alarm_notified alarm_notified_time alarm_notified_at")
.lean();


  // --------------------------------------------------
  // 1️⃣ DEDUPE SYSTEM CARDS (BY systemKey/Title) - Enhanced Logic
  // --------------------------------------------------
// --------------------------------------------------
// 1️⃣ DEDUPE SYSTEM CARDS (FINAL & SAFE)
// --------------------------------------------------
const systemMap = new Map();

const systemCardsRaw = rawCards.filter(c => c.type === "SYSTEM");

for (const card of systemCardsRaw) {
  const key = card.title?.trim().toLowerCase();
  if (!key) continue;

  // Special handling for FITNESS
  if (key.includes("fitness")) {
    const existing = systemMap.get(key);

    if (!existing) {
      systemMap.set(key, card);
    } else {
      // pick the one with later scheduledTime
      const a = convertTo24Hour(existing.scheduledTime || "00:00");
      const b = convertTo24Hour(card.scheduledTime || "00:00");

      if (b > a) {
        systemMap.set(key, card);
      }
    }
    continue;
  }

  // Normal cards → first one wins
  if (!systemMap.has(key)) {
    systemMap.set(key, card);
  }
}

const dedupedSystemCards = Array.from(systemMap.values());


  // --------------------------------------------------
  // 2️⃣ USER CARDS (NO CHANGE)
  // --------------------------------------------------
  const userCards = rawCards
    .filter(card => card.type !== "SYSTEM")
    .map(card => {
      const scheduled = convertTo24Hour(card.scheduledTime || "00:00");
      const time = dayjs.tz(
        `${localDay.format("YYYY-MM-DD")} ${scheduled}`,
        "YYYY-MM-DD HH:mm",
        TZ
      );

      if (!time.isValid()) return null;

      return {
        time,
        icon: card.type === "USER_MEDICATION" ? "💊" : "🔔",
        title: card.title,
        description: card.description || null,
        completed: !!card.isCompleted,
        reminder: true,
        editable: true,
        type: card.type,
        id: card._id.toString(),
        notified: card.alarm_notified === true,
        alarm_notified: card.alarm_notified || false,
        alarm_notified_time: card.alarm_notified_time || null,
        alarm_notified_at: card.alarm_notified_at || null,
      };
    })
    .filter(Boolean);

  // --------------------------------------------------
  // 3️⃣ SYSTEM CARDS → UI FORMAT (DB TIME ONLY) - FIX APPLIED HERE
  // --------------------------------------------------
  const systemCards = dedupedSystemCards
    .map(card => {
      const scheduled = convertTo24Hour(card.scheduledTime || "00:00");
      const time = dayjs.tz(
        `${localDay.format("YYYY-MM-DD")} ${scheduled}`,
        "YYYY-MM-DD HH:mm",
        TZ
      );

      if (!time.isValid()) return null;

      const t = (card.title || "").toLowerCase();
      let icon = "🔔";
      if (t.includes("wake")) icon = "🌞";
      else if (t.includes("tobacco") || t.includes("health win")) icon = "🚭";
      else if (t.includes("calorie")) icon = "🔥";
      else if (t.includes("fitness")) icon = "🏃";
      else if (t.includes("breakfast")) icon = "🍳";
      else if (t.includes("boost")) icon = "🥤";
      else if (t.includes("lunch")) icon = "🍽️";
      else if (t.includes("nap")) icon = "😴";
      else if (t.includes("refresh")) icon = "🥗";
      else if (t.includes("dinner")) icon = "🌙";
      else if (t.includes("walk")) icon = "🚶";
      else if (t.includes("snack")) icon = "🥛";
      else if (t.includes("sleep")) icon = "🛌";

      return {
        time,
        icon,
        title: card.title,
        description: card.description || null,
        completed: !!card.isCompleted,
        reminder: true,
        editable: t.includes("wake"),
        type: card.type,
        id: card._id.toString(),
        notified: card.alarm_notified === true,
        alarm_notified: card.alarm_notified || false,
        alarm_notified_time: card.alarm_notified_time || null,
        alarm_notified_at: card.alarm_notified_at || null,
        systemKey: card.systemKey || null, // <-- ADDED FOR ROBUSTNESS
      };
    })
    .filter(Boolean);

  // --------------------------------------------------
  // 4️⃣ FINAL SORT — PURE CLOCK ORDER
  // --------------------------------------------------
 // --------------------------------------------------
// 4️⃣ FINAL SORT — WAKE FIRST, SLEEP LAST, OTHERS BY TIME
// --------------------------------------------------
const allCards = [...systemCards, ...userCards]
  .sort((a, b) => {
    // 1️⃣ Wake Up ALWAYS first
    if (a.systemKey === "SYSTEM_WAKEUP") return -1;
    if (b.systemKey === "SYSTEM_WAKEUP") return 1;

    // 2️⃣ Sleep ALWAYS last
    if (a.systemKey === "SYSTEM_SLEEP") return 1;
    if (b.systemKey === "SYSTEM_SLEEP") return -1;

    // 3️⃣ Everything else sorted by actual time
    const aMin = a.time.hour() * 60 + a.time.minute();
    const bMin = b.time.hour() * 60 + b.time.minute();
    return aMin - bMin;
  })
  .map(card => ({
    ...card,
    time: card.time.format("h:mm A"),
  }));


  // --------------------------------------------------
  // 5️⃣ MISSED TASKS (SIMPLE & SAFE)
  // --------------------------------------------------
  const now = dayjs().tz(TZ);
  const missedTasks = allCards.filter(card => {
    if (card.completed) return false;
    const t = dayjs.tz(
      `${localDay.format("YYYY-MM-DD")} ${card.time}`,
      "YYYY-MM-DD h:mm A",
      TZ
    );
    return t.isBefore(now);
  }).length;

  // --------------------------------------------------
  // 6️⃣ ALERTS
  // --------------------------------------------------
  const alerts = [];
  if (missedTasks > 0) {
    alerts.push({
      type: "warning",
      text: "Reassess to keep your plan aligned",
      action: "Check Plan",
    });
  }

  return {
    dailySchedule: allCards,
    missed: missedTasks,
    totalTasks: allCards.length,
    missedDisplay: `${missedTasks}/${allCards.length}`,
    alerts,
    streak: onboarding.streakCount,
  };
};







// -----------------------------------------------------
// Cuore Score Helper
// -----------------------------------------------------
const getCuoreScoreData = async (userId) => {
    const scoreHistory = await Onboarding.find({ userId, 'scores.cuoreScore': { $exists: true, $ne: 0 } })
        .select('scores.cuoreScore timestamp')
        .sort({ timestamp: 1 })
        .lean();

    if (scoreHistory.length === 0) return { latestScore: 0, colorStatus: 'deep red', history: [] };

    const latest = scoreHistory.at(-1);
    const latestScore = latest.scores.cuoreScore;
    let colorStatus = latestScore > 75 ? 'green' : latestScore >= 50 ? 'yellow' : latestScore >= 25 ? 'light red' : 'deep red';

    return {
        latestScore,
        colorStatus,
        history: scoreHistory.map(doc => ({ date: doc.timestamp, cuoreScore: doc.scores.cuoreScore }))
    };
};

// -----------------------------------------------------
// Add Entry
// -----------------------------------------------------
exports.addEntry = async (req, res) => {
  const userId = req.user.userId;
  const { title, startDate, endDate, time, repeatFrequency, isMedication } = req.body;

  if (!title || !time || !repeatFrequency)
    return res.status(400).json({ error: "Missing required scheduling fields." });

  try {
    const startDay = dayjs.tz(startDate || new Date(), TZ);
    const endDay =
      endDate && endDate.toLowerCase() !== "never"
        ? dayjs.tz(endDate, TZ).endOf("day")
        : null;

    const standardizedTime = convertTo24Hour(time);
    if (!standardizedTime)
      return res.status(400).json({ error: "Invalid time format." });

    // 🧩 Check if an identical reminder/medication already exists
    const duplicateCheck = await TimelineCard.findOne({
      userId,
      title,
      scheduledTime: standardizedTime,
      type: isMedication ? "USER_MEDICATION" : "USER_REMINDER",
    });

    if (duplicateCheck) {
      return res.status(409).json({
        error: "A similar entry already exists at this time.",
        existingEntry: duplicateCheck,
      });
    }

    let newEntry;

    if (isMedication) {
      // 🩺 Handle “Flag as Medication” — store as Reminder but with med flag
      newEntry = await Reminder.create({
        userId,
        title,
        startDate: startDay.toDate(),
        endDate: endDay ? endDay.toDate() : null,
        time: standardizedTime,
        repeatFrequency,
        isActive: true,
        isMedication: true, // ✅ store medication flag for display
      });
    } else {
      newEntry = await Reminder.create({
        userId,
        title,
        startDate: startDay.toDate(),
        endDate: endDay ? endDay.toDate() : null,
        time: standardizedTime,
        repeatFrequency,
        isActive: true,
        isMedication: false,
      });
    }

    // 🧱 Create/Update timeline card directly for immediate feedback
    const cardType = isMedication ? "USER_MEDICATION" : "USER_REMINDER";
    const icon = isMedication ? "💊" : "🔔";

    await TimelineCard.findOneAndUpdate(
      {
        userId,
        sourceId: newEntry._id,
        type: cardType,
      },
      {
        $set: {
          userId,
          sourceId: newEntry._id,
          title: newEntry.title,
          description: null,
          type: cardType,
          scheduledTime: standardizedTime,
          scheduleDate: startDay.toDate(),
          icon,
          reminder: true,
          editable: true,
          completed: false,
        },
      },
      { upsert: true, new: true }
    );

    // --- ✅ MODIFICATION ---
    // The newEntry object is returned in 'data', but we also add
    // newEntry._id as a top-level 'sourceId' for easy access.
    return res.status(201).json({
      message: `${isMedication ? "Medication" : "Reminder"} added successfully.`,
      type: isMedication ? "medication" : "reminder",
      data: newEntry,
      sourceId: newEntry._id // <-- Here is the added field
    });
    // --- END MODIFICATION ---

  } catch (error) {
    console.error("❌ Error adding new timeline entry:", error);
    return res.status(500).json({ error: "Internal server error." });
  }
};


// -----------------------------------------------------
// Update Wake Up Time
// -----------------------------------------------------
exports.updateWakeUpTime = async (req, res) => {
    const userId = req.user.userId;
    const { newWakeUpTime } = req.body;

    if (!newWakeUpTime) {
        return res.status(400).json({ error: "Missing newWakeUpTime in request body." });
    }

    try {
        const standardizedTime = convertTo24Hour(newWakeUpTime);
        if (!standardizedTime) {
            return res.status(400).json({ error: "Invalid time format provided." });
        }
        
        const updatedOnboarding = await Onboarding.findOneAndUpdate(
            { userId },
            { $set: { 'o6Data.wake_time': standardizedTime } },
            { new: true, runValidators: true }
        );

        if (!updatedOnboarding) {
            return res.status(404).json({ error: "User onboarding data not found." });
        }

        const today = dayjs().tz(TZ).toDate();
        await generateTimelineCardsForDay(userId, today);
        
        const [userData, timelineData, cuoreScoreData] = await Promise.all([
            User.findById(userId).select('name profileImage').lean(),
            getTimelineData(userId, dayjs(today).format('YYYY-MM-DD')),
            getCuoreScoreData(userId)
        ]);
        
        const homeScreenPayload = {
            user: {
                id: userId,
                name: userData.name,
                profileImage: userData.profileImage || 'https://example.com/images/mjohnson.png'
            },
            date: dayjs(today).format('YYYY-MM-DD'),
            summary: {
                missedTasks: timelineData.missed,
                message: `${timelineData.missed} ${timelineData.missed === 1 ? 'task' : 'tasks'} missed`,
            },
            progress: {
                periods: cuoreScoreData.history.map((score, i, arr) => ({
                    month: dayjs(score.date).format("MMM 'YY"),
                    value: score.cuoreScore,
                    userImage: i === arr.length - 1 ? (userData.profileImage || 'https://example.com/images/mjohnson.png') : undefined
                })),
                goal: '>75%',
                buttonText: 'Update Biomarkers'
            },
            motivationalMessage: 'Every choice you make today sets you up for a healthier tomorrow.',
            alerts: timelineData.alerts,
            dailySchedule: timelineData.dailySchedule
        };
        
        res.status(200).json({ 
            message: "Wake-up time updated successfully. Timeline adjusted.",
            updatedData: homeScreenPayload
        });

    } catch (error) {
        console.error("Error updating wake-up time:", error);
        res.status(500).json({ error: "Internal server error." });
    }
};

// -----------------------------------------------------
// Existing APIs (kept as-is)
// -----------------------------------------------------

// delete reminder API
// -----------------------------------------------------
// DELETE REMINDER (Final Fixed Version)
// -----------------------------------------------------
exports.deleteReminder = async (req, res) => {
  const userId = req.user?.userId;
  const { reminderId } = req.params; // this is actually TimelineCard._id

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized." });
  }

  if (!reminderId) {
    return res.status(400).json({ error: "ID is required in URL." });
  }

  try {
    // 🔹 STEP 1: Find TimelineCard first
    const card = await TimelineCard.findOne({
      _id: reminderId,
      userId,
      type: "USER_REMINDER"
    });

    if (!card) {
      return res.status(404).json({ error: "Timeline card not found." });
    }

    // 🔹 STEP 2: Get real Reminder ID
    const actualReminderId = card.sourceId;

    // 🔹 STEP 3: Delete Reminder
    const deletedReminder = await Reminder.findOneAndDelete({
      _id: actualReminderId,
      userId
    });

    if (!deletedReminder) {
      return res.status(404).json({ error: "Reminder not found." });
    }

    // 🔹 STEP 4: Delete TimelineCard(s)
    await TimelineCard.deleteMany({
      userId,
      sourceId: actualReminderId,
      type: "USER_REMINDER"
    });

    return res.status(200).json({
      message: "Reminder deleted successfully.",
      data: { id: actualReminderId }
    });

  } catch (error) {
    console.error("❌ Delete error:", error);

    if (error.name === "CastError") {
      return res.status(400).json({ error: "Invalid ID format." });
    }

    return res.status(500).json({ error: "Internal server error." });
  }
};





exports.getEntries = async (req, res) => {
    const userId = req.user.userId;
    const isMedicationPath = req.originalUrl.includes('/medications');

    try {
        let entries;
        if (isMedicationPath) {
            // --- FIX 1 ---
            // Query the Reminder model for items flagged as medication
            entries = await Reminder.find({ 
                userId, 
                isActive: true, 
                isMedication: true 
            }).select('-__v -userId');
            
            return res.status(200).json({ type: 'medications', data: entries });
        } else {
            // --- FIX 2 ---
            // Query the Reminder model and EXCLUDE items flagged as medication
            entries = await Reminder.find({ 
                userId, 
                isActive: true, 
                isMedication: { $ne: true } // $ne: true means "not equal to true"
            }).select('-__v -userId');
            
            return res.status(200).json({ type: 'reminders', data: entries });
        }
    } catch (error) {
        console.error('Error getting user entries:', error);
        return res.status(500).json({ error: "Internal server error: Could not fetch entries." });
    }
};










// 🔹 Main update function
exports.updateEntry = async (req, res) => {
  const userId = req.user.userId;
  const { reminderId:docId } = req.params; // TimelineCard ID
  const { title, startDate, endDate, time, repeatFrequency } = req.body;

  if (!docId) {
    return res.status(400).json({ error: "ID is required in URL." });
  }

  try {
    // 🔹 STEP 1: Find TimelineCard
    const card = await TimelineCard.findOne({
      _id: docId,
      userId,
      type: "USER_REMINDER"
    });

    if (!card) {
      return res.status(404).json({ error: "Timeline card not found." });
    }

    // 🔹 STEP 2: Extract real Reminder ID
    const reminderId = card.sourceId;

    // 🔹 STEP 3: Fetch Reminder
    const existingEntry = await Reminder.findOne({
      _id: reminderId,
      userId
    }).lean();

    if (!existingEntry) {
      return res.status(404).json({ error: "Reminder not found." });
    }

    // 🔹 STEP 4: Build update object
    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (startDate !== undefined) updateData.startDate = parseDate(startDate);
    if (endDate !== undefined) updateData.endDate = parseDate(endDate);
    if (time !== undefined) updateData.time = convertTo24Hour(time);
    if (repeatFrequency !== undefined) updateData.repeatFrequency = repeatFrequency;

    // 🔹 STEP 5: Update Reminder
    const updatedEntry = await Reminder.findOneAndUpdate(
      { _id: reminderId, userId },
      { $set: updateData },
      { new: true, runValidators: true }
    );

    // 🔹 STEP 6: Sync TimelineCard
    const cardUpdates = {};

    if (updatedEntry.title) {
      cardUpdates.title = updatedEntry.title;
    }

    if (updatedEntry.time && updatedEntry.startDate) {
      const [hh, mm] = updatedEntry.time.split(":");

      const newScheduleDate = dayjs(updatedEntry.startDate)
        .tz(TZ)
        .hour(Number(hh))
        .minute(Number(mm))
        .second(0)
        .toDate();

      cardUpdates.scheduledTime = updatedEntry.time;
      cardUpdates.scheduleDate = newScheduleDate;
    }

    await TimelineCard.updateMany(
      { userId, sourceId: reminderId },
      { $set: cardUpdates }
    );

    // 🔹 STEP 7: Return updated timeline
    const targetDateStr = dayjs(updatedEntry.startDate)
      .tz(TZ)
      .format("YYYY-MM-DD");

    const updatedTimeline = await getTimelineData(userId, targetDateStr);

    return res.status(200).json({
      message: "Reminder updated successfully.",
      previousData: existingEntry,
      updatedData: updatedEntry,
      updatedTimeline
    });

  } catch (error) {
    console.error("❌ Error updating reminder:", error);

    if (error.name === "CastError") {
      return res.status(400).json({ error: "Invalid ID format." });
    }

    return res.status(500).json({ error: "Internal server error." });
  }
};





// ✅ Do NOT re-import dayjs here; it's already imported above

async function updateSystemCardsAfterWakeChange(userId, newWakeTime, localDay, onboarding) {
  // The Fitness card is intentionally NOT shifted by this function, regardless of preferred_ex_time setting.
  // Other cards (e.g., Breakfast, Lunch) WILL shift based on the new wake-up time.
  
  const wakeUpAnchor = dayjs.tz(
    `${localDay.format("YYYY-MM-DD")} ${newWakeTime}`,
    "YYYY-MM-DD HH:mm",
    TZ
  );

  const systemCardOffsets = [
    { key: /tobacco|health win/i, offset: 10 },
    { key: /calorie ignite/i, offset: 15 },
    // 🛑 REMOVED: { key: /fitness/i, offset: 30 } - Fitness is now a fixed card that doesn't shift
    { key: /breakfast/i, offset: 105 },
    { key: /mid-morning|boost/i, offset: 255 },
    { key: /hydration.*3-4/i, offset: 375 },
    { key: /lunch/i, offset: 390 },
    { key: /nap|walk/i, offset: 450 },
    { key: /refresh|refuel/i, offset: 570 },
    { key: /hydration.*7-8/i, offset: 750 },
    { key: /dinner/i, offset: 780 },
    { key: /after-dinner/i, offset: 810 },
    { key: /optional snack/i, offset: 930 },
    { key: /sleep/i, offset: 960 },
  ];

  // --- Define the date range for the query (Keep existing fix)
  const utcStart = localDay.startOf("day").utc().toDate();
  const utcEnd = localDay.endOf("day").utc().toDate();
  // --- END FIX ---

  for (const entry of systemCardOffsets) {
    const newTime = wakeUpAnchor
      .add(entry.offset, "minute")
      .tz(TZ)
      .format("HH:mm");

    // We no longer need the 'title: {$not: /fitness/i}' check here 
    // because fitness is not in the systemCardOffsets array.

    
 // 🔒 FINAL FIX: Force Fitness time from preferred_ex_time (DB is source of truth)
// if (onboarding?.o5Data?.preferred_ex_time) {
//   const exTime24 = convertTo24Hour(onboarding.o5Data.preferred_ex_time);

//   await TimelineCard.findOneAndUpdate(
//     {
//       userId,
//       systemKey: "SYSTEM_FITNESS",
//       scheduleDate: localDay.toDate()
//     },
//     {
//       $set: {
//         title: "Fitness",
//         type: "SYSTEM",
//         scheduledTime: exTime24,
//         scheduleDate: localDay.toDate()
//       }
//     },
//     { upsert: true }
//   );
// }



  }
  
  console.log("📅 Shifted cards:");
  for (const entry of systemCardOffsets) {
    const newTime = wakeUpAnchor.add(entry.offset, "minute").tz(TZ).format("HH:mm");
    console.log(`${entry.key} → ${newTime}`);
  }

  console.log(`✅ SYSTEM cards shifted according to new wake-up time: ${newWakeTime}`);
}




exports.getCuoreScore = async (req, res) => {
    try {
        const userId = req.user.userId;
        const scoreData = await getCuoreScoreData(userId);
        res.status(200).json(scoreData);
    } catch (error) {
        console.error('Error in getCuoreScore:', error);
        res.status(500).json({ error: "Internal server error." });
    }
};

exports.getTimeline = async (req, res) => {
    try {
        const userId = req.user.userId;
        const dateString = req.query.date;
        if (!dateString) {
            return res.status(400).json({ error: "Date query parameter is required." });
        }
        const timelineData = await getTimelineData(userId, dateString);
        res.status(200).json({ date: dateString, timeline: timelineData.dailySchedule });
    } catch (error) {
        console.error('Error in getTimeline:', error);
        res.status(500).json({ error: "Internal server error." });
    }
};

exports.completeCard = async (req, res) => {
  try {
    req.body = req.body || {};

    const userId = req.params.userId;
    const cardId = req.params.reminderId;
    const completeAll = req.body.completeAll || false;
    const markComplete = req.body.complete !== false; // ✅ default true, false = undo

    if (!userId) return res.status(400).json({ message: "User ID missing" });

    const { ObjectId } = mongoose.Types;

    /** ✅ If complete all tasks */
    if (completeAll) {
      await TimelineCard.updateMany(
        { userId },
        { 
          $set: { 
            isCompleted: true, 
            isMissed: false,
            completionTime: new Date() 
          } 
        }
      );

      return res.status(200).json({
        status: "success",
        message: "All tasks completed",
        missedTasks: 0
      });
    }

    if (!cardId)
      return res.status(400).json({ message: "Card ID required" });

    // ✅ Attempt timeline card match first
    let timelineCard = await TimelineCard.findOneAndUpdate(
      { _id: new ObjectId(cardId), userId },
      { 
        $set: { 
          isCompleted: markComplete,
          isMissed: false,
          completionTime: markComplete ? new Date() : null 
        } 
      },
      { new: true }
    );

    // ✅ If not timeline id, try sourceId (reminder id)
    if (!timelineCard) {
      timelineCard = await TimelineCard.findOneAndUpdate(
        { userId, sourceId: new ObjectId(cardId) },
        { 
          $set: { 
            isCompleted: markComplete,
            isMissed: false,
            completionTime: markComplete ? new Date() : null 
          } 
        },
        { new: true }
      );
    }

    if (!timelineCard) {
      return res.status(404).json({
        status: "error",
        message: "No matching card found"
      });
    }

    /** ✅ Recalculate missed tasks now */
    const now = dayjs().tz(TZ);
    const todayStart = now.startOf("day").toDate();
    const todayEnd = now.endOf("day").toDate();

    const allCards = await TimelineCard.find({
      userId,
      scheduleDate: { $gte: todayStart, $lte: todayEnd }
    });

    const missed = allCards.filter(card =>
      !card.isCompleted &&
      dayjs(card.scheduleDate).tz(TZ).isBefore(now)
    ).length;

    return res.status(200).json({
      status: "success",
      message: markComplete ? "Task marked completed" : "Task marked incomplete",
      card: {
        id: timelineCard._id,
        sourceId: timelineCard.sourceId,
        completed: timelineCard.isCompleted
      },
      missedTasks: missed
    });

  } catch (err) {
    console.error("Complete card error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// -----------------------------------------------------
// Mark Notification / Alarm as Checked
// -----------------------------------------------------
exports.markAlarmNotified = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { reminderId } = req.params;
    const { time, systemKey } = req.body;

    const todayStart = dayjs().tz(TZ).startOf("day").toDate();
    const todayEnd = dayjs().tz(TZ).endOf("day").toDate();

    let card;

    // ✅ SYSTEM CARD
    if (systemKey) {
      card = await TimelineCard.findOne({
        userId,
        systemKey,
        scheduleDate: { $gte: todayStart, $lte: todayEnd }
      });
    }
    // ✅ USER CARD
    else {
      card = await TimelineCard.findOne({
        userId,
        $or: [{ _id: reminderId }, { sourceId: reminderId }],
        scheduleDate: { $gte: todayStart, $lte: todayEnd }
      });
    }

    if (!card) {
      return res.status(404).json({ error: "Card not found for today" });
    }

    const newStatus = !card.alarm_notified;

    card.alarm_notified = newStatus;
    card.alarm_notified_at = newStatus ? new Date() : null;
    card.alarm_notified_time = newStatus ? time : null;

    await card.save();

    return res.json({
      success: true,
      alarm_notified: newStatus
    });

  } catch (err) {
    console.error("Error toggling alarm:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};



const safeNum = (v) =>
  typeof v === "number" && !Number.isNaN(v) && v !== 0 ? v : null;

exports.getCuoreScoreDetails = async (req, res) => {
  const userId = req.user && req.user.userId;
  if (!userId)
    return res.status(401).json({ message: "Unauthorized / userId missing" });

  try {
    const onboardingDoc = await Onboarding.findOne({ userId }).lean();
    if (!onboardingDoc)
      return res
        .status(404)
        .json({ message: "Onboarding data not found for this user." });

    const metrics =
      typeof calculateAllMetrics === "function"
        ? calculateAllMetrics(onboardingDoc)
        : {};

    const o7 = onboardingDoc.o7Data || {};
    // ✅ DEFINE HERE (MANDATORY)
let hsCrpValue = o7.HsCRP ?? null;
let hsCrpUnit = "mg/L";

if (hsCrpValue != null && hsCrpValue >= 1) {
  hsCrpValue = Number((hsCrpValue / 10).toFixed(2));
  hsCrpUnit = "mg/dL";
}

     const o3 = onboardingDoc.o3Data || {};

    // ------------------------------
    // ⭐ UNIFIED COLOR LOGIC STARTS
    // ------------------------------

   // ------------------------------
// ⭐ UPDATED COLOR LOGIC (Cuore Rules)
// ------------------------------

const getStatus = (val, type, o3Data = {}) => {
      if (val == null || val === "") return "unknown";
      const num = parseFloat(val);

      switch (type) {

        case "bs_f":
          if (o3Data.hasDiabetes) {
            if (num < 100 || num > 170) return "red";
            if (num >= 100 && num <= 139) return "green";
            return "orange";
          } else {
            if (num < 100) return "green";
            if (num <= 125) return "orange";
            return "red";
          }

        case "bs_pp":
          case "bs_am":
    case "after_meal":
          if (o3Data.hasDiabetes) {
            if (num < 130 || num > 220) return "red";
            if (num >= 180 && num <= 220) return "orange";
            return "green";
          } else {
            if (num < 140) return "green";
            if (num <= 200) return "orange";
            return "red";
          }

        case "a1c":
          if (num < 5.8) return "green";
          if (num <= 9.0) return "orange";
          return "red";

        case "tg_hdl":
          if (num < 2.8) return "green";
          if (num <= 3.9) return "orange";
          return "red";

        case "hscrp":
          if (num <= 1.0) return "green";
          else if(num >=1.1 && num <=2.9) return "orange";
          return "red";

        default:
          return "unknown";
      }
    };

    const getHrStatus = (val) => {
      if (val == null || val === "") return "unknown";
      const num = parseFloat(val);

      if (num >= 66 && num <= 92) return "green";
      if ((num >= 61 && num <= 65) || (num >= 93 && num <= 109)) return "orange";
      return "red";
    };

    // ------------------------------
    // ⭐ BP Combined Logic
    // ------------------------------

   let bpString = null;
let bpStatus = "unknown";

if (o7.bp_upper != null && o7.bp_lower != null) {
  const sys = parseFloat(o7.bp_upper);
  const dia = parseFloat(o7.bp_lower);

  bpString = `${sys}/${dia}`;

  // --------------------
  // SYSTOLIC (UPPER)
  // --------------------
  let sysStatus;
  if (sys < 100 || sys > 145) sysStatus = "red";
  else if (sys >= 116 && sys <= 126) sysStatus = "green";
  else sysStatus = "orange"; // 100–115 OR 127–145

  // --------------------
  // DIASTOLIC (LOWER)
  // --------------------
  let diaStatus;
  if (dia < 68 || dia > 95) diaStatus = "red";
  else if (dia >= 76 && dia <= 82) diaStatus = "green";
  else diaStatus = "orange"; // 68–75 OR 83–95

  // --------------------
  // FINAL BP STATUS (Worst-case rule)
  // --------------------
  if (sysStatus === "red" || diaStatus === "red") {
    bpStatus = "red";
  } else if (sysStatus === "orange" || diaStatus === "orange") {
    bpStatus = "orange";
  } else {
    bpStatus = "green";
  }
}


    // ⭐ FIX: ADD MISSING TG/HDL VARIABLES
    const tg_hdl_ratio = metrics?.trigHDLRatio?.current ?? null;
    const tgStatus = getStatus(tg_hdl_ratio, "tg_hdl", o3);


    // ------------------------------
    // ⭐ UNIFIED COLOR LOGIC ENDS
    // ------------------------------

    const bp_upper = safeNum(o7.bp_upper ?? metrics?.bloodPressure?.upper?.current);
    const bp_lower = safeNum(o7.bp_lower ?? metrics?.bloodPressure?.lower?.current);
    const bs_f = safeNum(o7.bs_f ?? metrics?.bloodSugar?.fasting?.current);
    const bs_am = safeNum(o7.bs_am ?? metrics?.bloodSugar?.afterMeal?.current);
    const A1C = safeNum(o7.A1C ?? metrics?.bloodSugar?.A1C?.current);
    const body_fat = safeNum(o7.body_fat ?? metrics?.bodyFat?.current);

    const responseBody = {
      health_metrics: {
        health_score:
          onboardingDoc?.scores?.cuoreScore ??
          metrics?.cuoreScore ??
          metrics?.scores?.cuoreScore ??
          0,

        estimated_time_to_target: {
          value: metrics?.timeToTarget ?? 0,
          unit: "months",
        },

        metabolic_age: {
          value: metrics?.metabolicAge?.metabolicAge ?? 0,
          unit: "years",
          gap: metrics?.metabolicAge?.gap ?? 0,
        },

        weight: {
          current: metrics?.weight?.current ?? null,
          target: metrics?.weight?.target ?? null,
          unit: "kg",
          status: metrics?.weight?.status ?? "unknown",
        },

        bmi: {
          value: metrics?.bmi?.current ?? null,
          target: metrics?.bmi?.target ?? null,
          status: metrics?.bmi?.status ?? "unknown",
        },

        lifestyle_score: {
          value: metrics?.lifestyle?.score ?? null,
          target: 75,
          unit: "%",
          status: metrics?.lifestyle?.status ?? "unknown",
        },

        recommended: {
          calories: {
            value: metrics?.recommendedCalories ?? null,
            unit: "kcal",
          },
          exercise: {
            value: metrics?.recommendedExercise ?? 15,
            unit: "min",
          },
        },

        vitals: {
          heartRate: {
            value: o7.pulse || null,
            status: getHrStatus(o7.pulse),
          },

          blood_pressure: {
            current: bpString,
            target: "120/80",
            status: {
              upper: bpStatus,
              lower: bpStatus,
            },
          },

          blood_sugar: {
            fasting: {
  value: bs_f,
  target: 100,
  status: getStatus(bs_f, "bs_f", o3),
},

            after_meal: {
  value: bs_am,
  target: o3.hasDiabetes ? 160 : 140,
  status: getStatus(bs_am, "bs_am", o3),
},

            A1C: {
              value: A1C,
              target: 5.6,
              status: getStatus(A1C, "a1c"),
            },
          },

          ...(
            o7.Trig != null &&
            o7.HDL != null &&
            o7.Trig !== "" &&
            o7.HDL !== ""
              ? {
                  cholesterol: {
                    tg_hdl_ratio: {
                      value: tg_hdl_ratio,
                      target: 2.6,
                      status: tgStatus,
                    },
                  },
                }
              : {}
          ),

         HsCRP: {
  value: hsCrpValue,
  unit: hsCrpUnit,
  status: getStatus(o7.HsCRP, "hscrp"), // ⚠️ raw value for logic
},


          body_fat: {
            value: body_fat,
            target: metrics?.bodyFat?.target ?? 23,
            unit: "%",
            status: metrics?.bodyFat?.status ?? "unknown",
          },
        },

        main_focus: metrics?.mainFocus ?? [],
      },
    };
    const formattedDate = new Date().toLocaleDateString("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

responseBody.current_date = formattedDate;


    return res.status(200).json(responseBody);

  } catch (err) {
    console.error("Error in getCuoreScoreDetails:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// 🔹 INTERNAL FUNCTION FOR SHARE (SAFE WRAPPER)
async function getCuoreScoreDetailsInternal(userId) {
  return new Promise(async (resolve, reject) => {
    try {
      const fakeReq = {
        user: { userId },
        params: { userId },
      };

      const fakeRes = {
        status: function () {
          return this;
        },
        json: function (payload) {
          resolve(payload);
        },
      };

      await exports.getCuoreScoreDetails(fakeReq, fakeRes);
    } catch (err) {
      reject(err);
    }
  });
}

exports.getCuoreScoreDetailsInternal = getCuoreScoreDetailsInternal;