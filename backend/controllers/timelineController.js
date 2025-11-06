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
    const isMedication = req.originalUrl.includes('/medications');
    const model = isMedication ? Medication : Reminder;
    const docId = isMedication ? req.params.medId : req.params.reminderId;
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
    const { age, gender, height_cm, weight_kg, waist_cm } = o2Data;
    const { bmi, wthr } = derivedMetrics;

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
    const bpUpperStatus = o7Data.bp_upper < 100 ? 'orange' : o7Data.bp_upper <= 130 ? 'green' : o7Data.bp_upper <= 145 ? 'orange' : 'red';
    const bpLowerStatus = o7Data.bp_lower < 64 ? 'orange' : o7Data.bp_lower <= 82 ? 'green' : o7Data.bp_lower <= 95 ? 'orange' : 'red';
    const bsFastingTarget = scores.o3Data?.hasDiabetes ? '<100' : '<100';
    const bsFastingStatus = scores.o3Data?.hasDiabetes ? (o7Data.bs_f < 100 ? 'red' : o7Data.bs_f <= 139 ? 'green' : o7Data.bs_f <= 170 ? 'orange' : 'red') : (o7Data.bs_f < 100 ? 'green' : o7Data.bs_f <= 125 ? 'orange' : 'red');
    const bsAfterMealTarget = scores.o3Data?.hasDiabetes ? '<160' : '<140';
    const bsAfterMealStatus = scores.o3Data?.hasDiabetes ? (o7Data.bs_am < 130 ? 'red' : o7Data.bs_am <= 169 ? 'green' : o7Data.bs_am <= 220 ? 'orange' : 'red') : (o7Data.bs_am < 140 ? 'green' : o7Data.bs_am <= 200 ? 'orange' : 'red');
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

// Alerts function
const getAlerts = async (userId) => {
  const alerts = [];
  const onboarding = await Onboarding.findOne({ userId }).lean();
  if (!onboarding) return [];

  const { scores, o3Data, o7Data } = onboarding;
  const now = dayjs();

  // --- Red Alerts (Critical) ---
  if (o3Data.q5) {
    alerts.push({ type: 'red', text: 'Consult your doctor promptly.', action: 'Consult' });
  }
  if (o7Data.bp_upper > 170 || o7Data.bp_upper < 90 || o7Data.bp_lower > 110 || o7Data.bp_lower < 60) {
    alerts.push({ type: 'red', text: 'Consult your doctor for BP.', action: 'Consult' });
  }
  if (o7Data.pulse < 50 || o7Data.pulse > 120) {
    alerts.push({ type: 'red', text: 'Consult your doctor for heart rate.', action: 'Consult' });
  }
  if (o7Data.o2_sat < 91) {
    alerts.push({ type: 'red', text: 'Consult your doctor for O2 Sat.', action: 'Consult' });
  }

  // --- Orange Alerts (Important) ---
  if (o3Data.q6) {
    alerts.push({ type: 'orange', text: 'Consult your doctor for diabetes.', action: 'Consult' });
  }
  if ((o7Data.bp_upper >= 150 && o7Data.bp_upper <= 170) || (o7Data.bp_upper >= 90 && o7Data.bp_upper <= 100) ||
      (o7Data.bp_lower >= 100 && o7Data.bp_lower <= 110) || (o7Data.bp_lower >= 60 && o7Data.bp_lower <= 66)) {
    alerts.push({ type: 'orange', text: 'Consult your doctor for BP.', action: 'Consult' });
  }
  if (o7Data.bs_f > 240 || o7Data.bs_f < 100 || o7Data.bs_am > 260 || o7Data.bs_am < 120) {
    alerts.push({ type: 'orange', text: 'Monitor sugar & consult your doctor.', action: 'Monitor' });
  }
  if (o7Data.HDL < 45 || o7Data.LDL > 180 || o7Data.Trig > 200) {
    alerts.push({ type: 'orange', text: 'Consult your doctor for Cholesterol.', action: 'Consult' });
  }

  // --- Yellow Alerts (Warning) ---
  if ((o7Data.bp_upper >= 140 && o7Data.bp_upper <= 150) || (o7Data.bp_upper >= 100 && o7Data.bp_upper <= 110) ||
      (o7Data.bp_lower >= 88 && o7Data.bp_lower <= 100) || (o7Data.bp_lower >= 66 && o7Data.bp_lower <= 74)) {
    alerts.push({ type: 'yellow', text: 'Monitor BP.', action: 'Monitor' });
  }
  if ((o7Data.bs_f >= 200 && o7Data.bs_f <= 240) || (o7Data.bs_f >= 100 && o7Data.bs_f <= 140) ||
      (o7Data.bs_am >= 220 && o7Data.bs_am <= 260) || (o7Data.bs_am >= 120 && o7Data.bs_am <= 160)) {
    alerts.push({ type: 'yellow', text: 'Monitor sugar.', action: 'Monitor' });
  }

  // 🟡 Exercise-Meal Timing Alert (within ±90 mins)
  try {
    const day = dayjs().startOf('day');

    // exercise time from onboarding
    const ex12 = onboarding?.o5Data?.preferred_ex_time;
    const wake12 = onboarding?.o6Data?.wake_time || "07:00 AM";

    const ex24 = ex12 ? convertTo24Hour(ex12) : null;
    const wake24 = convertTo24Hour(wake12);

    const exerciseTime = ex24 ? dayjs(`${day.format('YYYY-MM-DD')} ${ex24}`) : null;
    const wakeTime = dayjs(`${day.format('YYYY-MM-DD')} ${wake24}`);

    const breakfast = wakeTime.add(105, "minute");
    const lunch = wakeTime.add(390, "minute");
    const dinner = lunch.add(390, "minute");

    const within90 = (meal, exercise) =>
      Math.abs(meal.diff(exercise, "minute")) < 90;

    if (exerciseTime && (
        within90(breakfast, exerciseTime) ||
        within90(lunch, exerciseTime) ||
        within90(dinner, exerciseTime)
    )) {
      alerts.push({
        type: "yellow",
        text: "Avoid exercising within 90 minutes of a meal.",
        action: "Adjust Time"
      });
    }
  } catch (e) {
    console.error("Error checking exercise-meal alert:", e);
  }

  // --- Pale Yellow Alerts (Advisory) ---
  if (!onboarding.doctor_code) {
    alerts.push({ type: 'yellow', text: 'Connect to a doctor for alert monitoring.', action: 'Connect' });
  }

  // Sort & return highest severity first
  const severityOrder = { 'red': 1, 'orange': 2, 'yellow': 3 };
  if (alerts.length > 0) {
    alerts.sort((a, b) => severityOrder[a.type] - severityOrder[b.type]);
    return alerts;
  }

  return [];
};

// -----------------------------------------------------
// Generate Timeline Cards
// -----------------------------------------------------
const generateTimelineCardsForDay = async (userId, targetDate) => {
  try {
    const localDay = dayjs(targetDate).tz(TZ).startOf("day");

    // --- START: THE FIX ---
    // 1. Fetch ALL active reminders (meds and normal) for the user in ONE query
    // We no longer query the 'Medication' model at all.
    const allEntries = await Reminder.find({
      userId,
      isActive: true,
      startDate: { $lte: localDay.endOf("day").toDate() },
      $or: [{ endDate: null }, { endDate: { $gte: localDay.startOf("day").toDate() } }],
    }).lean();

    // 2. 🧱 Collect cards using an if/else loop
    const newCards = [];

    allEntries.forEach((entry) => {
      const timeStr = convertTo24Hour(entry.time) || "00:00";

      // This 'if/else' block is the entire fix.
      // It ensures ONLY ONE card is created for each database entry.
      if (entry.isMedication === true) {
        // It's a medication, so ONLY create a USER_MEDICATION card
        newCards.push({
          userId,
          scheduleDate: entry.startDate,
          scheduledTime: timeStr,
          title: "Medication", // Use the generic "Medication" title
          description: entry.title, // Use the user's title (e.g., "Meds 2") as the description
          type: "USER_MEDICATION",
          sourceId: entry._id,
        });
      } else {
        // It's a normal reminder, so ONLY create a USER_REMINDER card
        newCards.push({
          userId,
          scheduleDate: entry.startDate,
          scheduledTime: timeStr,
          title: entry.title,
          description: entry.description || null,
          type: "USER_REMINDER",
          sourceId: entry._id,
        });
      }
    });
    // --- END: THE FIX ---

    // 3. Upsert the new cards
    for (const card of newCards) {
      await TimelineCard.findOneAndUpdate(
        {
          userId,
          sourceId: card.sourceId,
         // We query by sourceId only. This way, if a reminder
          // is changed to a medication (or vice-versa),
          // the $set below will just update its type.
        },
        { $set: card },
        { upsert: true, new: true }
      );
    }

    // 4. Delete orphaned cards (this logic is correct)
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
exports.getHomeScreenData = async (req, res) => {
    const userId = req.user.userId;
    const dateString = req.query.date || dayjs().tz(TZ).format('YYYY-MM-DD');
    const todayDate = dayjs.tz(dateString, TZ).toDate();

    try {
        await generateTimelineCardsForDay(userId, todayDate);
        

        // **MODIFIED**: Added getNudge back into the Promise.all
        const [userData, timelineData, cuoreScoreData, alerts, motivationalMessage] = await Promise.all([
            User.findById(userId).select('display_name profileImage').lean(),
            getTimelineData(userId, dateString),
            getCuoreScoreData(userId),
            getAlerts(userId),
            getNudge(userId) // Now gets the dynamic nudge
        ]);

        if (!userData) return res.status(404).json({ message: 'User data not found.' });

        const payload = {
    user: {
        id: userId,
        name: userData.display_name,
        profileImage: userData.profileImage || 'https://example.com/images/mjohnson.png'
    },
    date: dateString,

    summary: {
        missedTasks: timelineData.missed,
        totalTasks: timelineData.totalTasks,                               // ✅ total tasks
        display: `${timelineData.missed}/${timelineData.totalTasks}`,      // ✅ UI friendly "missed/total"
        message: `${timelineData.missed} ${timelineData.missed === 1 ? 'task' : 'tasks'} missed`,
    },

    progress: {
        periods: cuoreScoreData.history.map((score, i, arr) => ({
            month: dayjs(score.date).format("MMM 'YY"),
            value: score.cuoreScore,
            userImage: i === arr.length - 1
                ? (userData.profileImage || 'https://example.com/images/mjohnson.png')
                : undefined
        })),
        goal: '>75%',
        buttonText: 'Update Biomarkers'
    },

    motivationalMessage: motivationalMessage,
    alerts: alerts,

    dailySchedule: timelineData.dailySchedule,

    streak: timelineData.streak   // ✅ streak stays
};


        res.status(200).json(payload);
    } catch (error) {
        console.error('Error fetching home screen data:', error);
        res.status(500).json({ error: 'Internal server error.' });
    }
};

// -----------------------------------------------------
// Timeline Helper
// -----------------------------------------------------
const getTimelineData = async (userId, dateString) => {
  let localDay = dayjs.tz(dateString, TZ);
  if (!localDay.isValid()) {
    console.warn(`Invalid dateString in getTimelineData: "${dateString}". Falling back to today.`);
    localDay = dayjs().tz(TZ);
  }
  localDay = localDay.startOf("day");

  const utcStart = localDay.utc().toDate();
  const utcEnd = localDay.endOf("day").utc().toDate();

  // --- Fetch latest onboarding data ---
  const onboarding = await Onboarding.findOne({ userId })
    .select("o4Data.smoking o5Data.preferred_ex_time o6Data.wake_time streakCount lastStreakDate")
    .lean();

  if (!onboarding) return { dailySchedule: [], missed: 0, alerts: [], streak: 0 };

  // ✅ Ensure system cards exist
  await ensureSystemCardsExist(userId, onboarding, localDay);

  // ✅ Recalculate system cards dynamically (wake-based)
  const currentWakeTime = convertTo24Hour(onboarding?.o6Data?.wake_time) || "07:00";
  await updateSystemCardsAfterWakeChange(userId, currentWakeTime, localDay);

  // ✅ Extract latest exercise time (user-customized)
  const preferredExTime =
    onboarding?.o5Data?.preferred_ex_time &&
    convertTo24Hour(onboarding.o5Data.preferred_ex_time);

  // --- STREAK LOGIC ---
  const today = dayjs().startOf("day");
  const lastStreakDate = onboarding.lastStreakDate
    ? dayjs(onboarding.lastStreakDate).startOf("day")
    : null;
  let streakCount = onboarding.streakCount || 0;

  if (!lastStreakDate) streakCount = 1;
  else if (today.diff(lastStreakDate, "day") === 1) streakCount += 1;
  else if (today.diff(lastStreakDate, "day") > 1) streakCount = 1;

  if (!lastStreakDate || today.isAfter(lastStreakDate)) {
    await Onboarding.updateOne({ userId }, { streakCount, lastStreakDate: new Date() });
  }

  // --- Fetch all cards (SYSTEM + USER) ---
  const rawCards = await TimelineCard.find({
    userId,
    scheduleDate: { $gte: utcStart, $lte: utcEnd },
  }).lean();

  // --- USER CARDS ---
  const userCards = rawCards
    .filter((card) => card.type !== "SYSTEM")
    .map((card) => {
      const parsedTime = dayjs.tz(
        `${localDay.format("YYYY-MM-DD")} ${convertTo24Hour(card.scheduledTime)}`,
        "YYYY-MM-DD HH:mm",
        TZ
      );
      if (!parsedTime.isValid()) return null;

      return {
        time: parsedTime,
        icon: card.type === "USER_MEDICATION" ? "💊" : "🔔",
        title: card.title,
        description: card.description,
        completed: card.isCompleted,
        reminder: true,
        editable: true,
        type: card.type,
        id: card._id.toString(),
        sourceId: card.sourceId?.toString(),
      };
    })
    .filter(Boolean);

  // --- SYSTEM CARDS ---
  const systemCardsFromDb = rawCards
    .filter((card) => card.type === "SYSTEM")
    .map((card) => {
      let scheduledTime = convertTo24Hour(card.scheduledTime);

      // 🧠 Override the fitness card’s time with user’s latest preference
      if (card.title.toLowerCase().includes("fitness") && preferredExTime) {
        scheduledTime = preferredExTime;
      }

      const parsedTime = dayjs.tz(
        `${localDay.format("YYYY-MM-DD")} ${scheduledTime}`,
        "YYYY-MM-DD HH:mm",
        TZ
      );
      if (!parsedTime.isValid()) return null;

      // 🎯 Icon mapping
      const title = card.title.toLowerCase();
      let icon = "🔔";
      if (title.includes("wake")) icon = "🌞";
      else if (title.includes("tobacco") || title.includes("health win")) icon = "🚭";
      else if (title.includes("calorie") || title.includes("ignite")) icon = "🔥";
      else if (title.includes("fitness")) icon = "🏃";
      else if (title.includes("breakfast")) icon = "🍳";
      else if (title.includes("boost") || title.includes("mid-morning")) icon = "🥤";
      else if (title.includes("hydration")) icon = "💧";
      else if (title.includes("lunch")) icon = "🍽️";
      else if (title.includes("nap") || title.includes("rest")) icon = "😴";
      else if (title.includes("refresh") || title.includes("refuel")) icon = "🥗";
      else if (title.includes("dinner")) icon = "🌙";
      else if (title.includes("walk")) icon = "🚶";
      else if (title.includes("snack")) icon = "🥛";
      else if (title.includes("sleep")) icon = "🛌";

      return {
        time: parsedTime,
        icon,
        title: card.title,
        description: card.description,
        completed: card.isCompleted,
        reminder: true,
        editable: title.includes("wake"), // Only “Wake Up” editable
        type: card.type,
        id: card._id.toString(),
      };
    })
    .filter(Boolean);

  // --- Combine and Sort ---
  const allCards = [...systemCardsFromDb, ...userCards]
    .sort((a, b) => a.time.valueOf() - b.time.valueOf())
    .map((card) => ({
      ...card,
      time: dayjs(card.time).tz(TZ).format("h:mm A"),
    }));

  // --- Missed Tasks ---
  const missedTasks = allCards.filter(
    (task) =>
      !task.completed &&
      dayjs
        .tz(`${localDay.format("YYYY-MM-DD")} ${task.time}`, "YYYY-MM-DD h:mm A", TZ)
        .isBefore(dayjs().tz(TZ))
  ).length;

  // --- Alerts ---
  const alerts = [];
  if (missedTasks > 0) {
    alerts.push({
      type: "warning",
      text: "Reassess to keep your plan aligned",
      action: "Check Plan",
    });
  }

  // ✅ Return Final
  return {
    dailySchedule: allCards,
    missed: missedTasks,
    totalTasks: allCards.length,
    missedDisplay: `${missedTasks}/${allCards.length}`,
    alerts,
    streak: streakCount,
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

    return res.status(201).json({
      message: `${isMedication ? "Medication" : "Reminder"} added successfully.`,
      type: isMedication ? "medication" : "reminder",
      data: newEntry,
    });
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
  const { reminderId } = req.params;

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized. User ID not found." });
  }

  if (!reminderId) {
    return res.status(400).json({ error: "Reminder ID is required in the URL." });
  }

  try {
    // 1️⃣ Delete from Reminder collection
    const deletedReminder = await Reminder.findOneAndDelete({
      _id: reminderId,
      userId: userId,
    });

    if (!deletedReminder) {
      return res.status(404).json({ error: "Reminder not found or access denied." });
    }

    // 2️⃣ Delete linked timeline card(s)
    await TimelineCard.deleteMany({
      userId: userId,
      sourceId: reminderId,
      type: "USER_REMINDER",
    });

    console.log(`✅ Deleted reminder ${reminderId} and its linked timeline cards.`);

    // ✅ 3️⃣ Regenerate timeline — but SAFELY (idempotent)
    await generateTimelineCardsForDay(userId, dayjs().tz(TZ).toDate());

    return res.status(200).json({
      message: "Reminder deleted successfully and timeline refreshed safely.",
      data: { id: reminderId },
    });
  } catch (error) {
    console.error(`❌ Error deleting reminder ${reminderId}:`, error);
    if (error.name === "CastError") {
      return res.status(400).json({ error: "Invalid Reminder ID format." });
    }
    return res.status(500).json({ error: "Internal server error during deletion." });
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
  const { model, docId } = getModelAndId(req);
  const { title, startDate, endDate, time, repeatFrequency, name, dosage } = req.body;

  try {
    // 1️⃣ Try fetching entry from Reminder/Medication
    let existingEntry = await model.findOne({ _id: docId, userId }).lean();

    // ✅ If not found, check if it's a "Wake Up" system card
    if (!existingEntry && model.modelName === "Reminder") {
      const systemCard = await TimelineCard.findOne({
        _id: docId,
        userId,
        type: "SYSTEM",
        title: /wake up/i
      });

      if (systemCard) {
        // Only allow time update
        if (!time) {
          return res.status(400).json({
            error: "Only time updates are allowed for Wake Up system cards."
          });
        }

        const newTime = convertTo24Hour(time);
        const updatedSystemCard = await TimelineCard.findOneAndUpdate(
          { _id: docId, userId },
          { $set: { scheduledTime: newTime } },
          { new: true }
        );

        // 🔥 Adjust dependent system cards dynamically
        const localDay = dayjs().tz(TZ).startOf("day");
        await updateSystemCardsAfterWakeChange(userId, newTime, localDay);

        // 🔥 Persist new wake time in onboarding for future days
        await Onboarding.updateOne(
          { userId },
          { "o6Data.wake_time": time },
          { upsert: false }
        );

        return res.status(200).json({
          message: "Wake Up time updated and system schedule adjusted.",
          previousData: systemCard,
          updatedData: updatedSystemCard
        });
      }
    }

    // ❌ If not found at all
    if (!existingEntry) {
      return res.status(404).json({ error: `${model.modelName} not found or access denied.` });
    }

    // 2️⃣ Prepare update object dynamically
    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (startDate !== undefined) updateData.startDate = parseDate(startDate);
    if (endDate !== undefined) updateData.endDate = parseDate(endDate);
    if (time !== undefined) updateData.time = convertTo24Hour(time);
    if (repeatFrequency !== undefined) updateData.repeatFrequency = repeatFrequency;

    if (model.modelName === "Medication") {
      if (name !== undefined) updateData.name = name;
      if (dosage !== undefined) updateData.dosage = dosage;
    }

    // 3️⃣ Update Reminder/Medication entry
    const updatedEntry = await model.findOneAndUpdate(
      { _id: docId, userId },
      { $set: updateData },
      { new: true, runValidators: true }
    );

    // 4️⃣ Regenerate today's timeline (to sync)
    await generateTimelineCardsForDay(userId, dayjs().toDate());

    return res.status(200).json({
      message: `${model.modelName} updated successfully.`,
      previousData: existingEntry,
      updatedData: updatedEntry
    });
  } catch (error) {
    console.error(`❌ Error updating ${model.modelName}:`, error);
    return res.status(500).json({ error: "Internal server error during update." });
  }
};


// ✅ Do NOT re-import dayjs here; it's already imported above

async function updateSystemCardsAfterWakeChange(userId, newWakeTime, localDay) {
  const wakeUpAnchor = dayjs.tz(`${localDay.format("YYYY-MM-DD")} ${newWakeTime}`, "YYYY-MM-DD HH:mm", TZ);

  // ✅ Offsets relative to wake-up (in minutes)
  const systemCardOffsets = [
    { key: /tobacco|health win/i, offset: 10 },       // 🚭 New line added
    { key: /calorie ignite/i, offset: 15 },           // 🔥
    { key: /fitness/i, offset: 30 },                  // 🏃
    { key: /breakfast/i, offset: 105 },               // 🍳
    { key: /mid-morning|boost/i, offset: 255 },       // 🥤
    { key: /hydration.*3-4/i, offset: 375 },          // 💧 Morning hydration
    { key: /lunch/i, offset: 390 },                   // 🍽️
    { key: /nap|walk/i, offset: 450 },                // 😴
    { key: /refresh|refuel/i, offset: 570 },          // 🥗
    { key: /hydration.*7-8/i, offset: 750 },          // 💧 Evening hydration
    { key: /dinner/i, offset: 780 },                  // 🌙
    { key: /after-dinner/i, offset: 810 },            // 🚶
    { key: /optional snack/i, offset: 930 },          // 🥛
    { key: /sleep/i, offset: 960 },                   // 🛌
  ];

  for (const entry of systemCardOffsets) {
    const newTime = wakeUpAnchor.add(entry.offset, "minute").tz(TZ).format("HH:mm");
    await TimelineCard.updateOne(
      { userId, type: "SYSTEM", title: entry.key },
      { $set: { scheduledTime: newTime } }
    );
  }

  console.log(`✅ System cards rescheduled for ${userId} after wake time: ${newWakeTime}`);
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

    const recommendedExercise =
      typeof calculateRecommendedExercise === "function"
        ? calculateRecommendedExercise(onboardingDoc.o5Data || {})
        : 15;

    const o7 = onboardingDoc.o7Data || {};

    // 🩺 Prefer manual values from o7Data if available
    const bp_upper = safeNum(o7.bp_upper ?? metrics?.bloodPressure?.upper?.current);
    const bp_lower = safeNum(o7.bp_lower ?? metrics?.bloodPressure?.lower?.current);
    const bs_f = safeNum(o7.bs_f ?? metrics?.bloodSugar?.fasting?.current);
    const bs_am = safeNum(o7.bs_am ?? metrics?.bloodSugar?.afterMeal?.current);
    const A1C = safeNum(o7.A1C ?? metrics?.bloodSugar?.A1C?.current);
    const tg_hdl_ratio = safeNum(metrics?.trigHDLRatio?.current);
    const body_fat = safeNum(o7.body_fat ?? metrics?.bodyFat?.current);

    // 🧠 BP Status logic
    const upperStatus =
      bp_upper == null
        ? "unknown"
        : bp_upper < 100
        ? "orange"
        : bp_upper <= 130
        ? "green"
        : bp_upper <= 145
        ? "orange"
        : "red";

    const lowerStatus =
      bp_lower == null
        ? "unknown"
        : bp_lower < 64
        ? "orange"
        : bp_lower <= 82
        ? "green"
        : bp_lower <= 95
        ? "orange"
        : "red";

    // 🧠 FIXED: Correct Trig/HDL logic (Target <2.6; <2.8 green; 2.8–4.0 orange; >4.0 red)
    let tgStatus = "unknown";
    const tgTarget = 2.6;
    if (tg_hdl_ratio != null && !isNaN(tg_hdl_ratio)) {
      if (tg_hdl_ratio > 4.0) tgStatus = "red";
      else if (tg_hdl_ratio >= 2.8) tgStatus = "orange";
      else tgStatus = "green";
    }

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
            value: recommendedExercise,
            unit: "min",
          },
        },
      vitals: {
  blood_pressure: {
    current:
      bp_upper != null && bp_lower != null
        ? `${bp_upper}/${bp_lower}`
        : null,
    target: "120/80",
    status: {
      upper: upperStatus,
      lower: lowerStatus,
    },
  },
  blood_sugar: {
    fasting: {
      value: bs_f,
      target: 100,
      status: bs_f == null ? "unknown" : bs_f <= 100 ? "green" : "red",
    },
    after_meal: {
      value: bs_am,
      target: 140,
      status: bs_am == null ? "unknown" : bs_am <= 140 ? "green" : "red",
    },
    A1C: {
      value: A1C,
      target: 5.6,
      status: A1C == null ? "unknown" : A1C <= 5.6 ? "green" : "red",
    },
  },

  // 👇 Conditionally include cholesterol (tgl/hdl)
  ...(o7.Trig != null &&
  o7.HDL != null &&
  o7.Trig !== "" &&
  o7.HDL !== ""
    ? {
        cholesterol: {
          tg_hdl_ratio: {
            value: tg_hdl_ratio,
            target: tgTarget,
            status: tgStatus,
          },
        },
      }
    : {}),


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

    return res.status(200).json(responseBody);
  } catch (err) {
    console.error("Error in getCuoreScoreDetails:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};
