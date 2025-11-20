// controllers/fitnessController.js
const client = require('../utils/sanityClient');
const { calculateAllMetrics } = require('../models/onboardingModel.js');
const Onboarding = require('../models/onboardingModel.js').Onboarding;

/* ----------------- Helpers ----------------- */

// Determine Age Group
function getAgeGroup(age) {
  if (age < 40) return 'YA';
  if (age >= 40 && age < 60) return 'MA';
  if (age >= 60 && age < 70) return 'SA';
  if (age >= 70) return 'OA';
  return null;
}

// Recommended Exercise Minutes
function calculateRecommendedExercise(o5Data) {
  const minExercise = o5Data?.min_exercise_per_week;
  if (minExercise === "Less than 75 min") return 15;
  if (minExercise === "75 to 150 min") return 30;
  return 45;
}

// Color map for types
const colorMap = {
  "Lung Expansion": "#A68DFF",
  "Cardio": "#FF6B81",
  "Strength": "#66CC99",
  "Flexibility": "#6699FF",
  "Yoga": "#FFD166",
  "Balance": "#FFB6C1",
  "default": "#C0C0C0"
};

/* ----------------- Excel-based Exercise Schedules ----------------- */
// (same schedule mapping as before — shortened here for brevity)
const exerciseScheduleMap = { 
   "YA-15": {
    "Rest day +1": ["E1", "C1"],
    "Rest day +2": ["E1", "C3", "S1", "S3", "F2", "F3"],
    "Rest day +3": ["E1", "C2"],
    "Rest day +4": ["E1", "Y3", "Y4", "F3"],
    "Rest day +5": ["E1", "C5", "S7", "F1", "F2"],
    "Rest day +6": ["E1", "F1", "F2", "F3", "F4", "Y2"],
    "Monday": []
  },
  "YA-30": {
    "Rest day +1": ["E1", "C1"],
    "Rest day +2": ["E1", "C3", "S1", "S3", "S4", "S5", "F2", "F3"],
    "Rest day +3": ["E1", "C2"],
    "Rest day +4": ["E1", "Y1", "Y3", "Y4", "F3"],
    "Rest day +5": ["E1", "C4", "C5", "S2", "S7", "F1", "F2"],
    "Rest day +6": ["E1", "C6", "Y2", "Y4", "F2", "F4"],
    "Monday": []
  },
  "YA-45": {
    "Rest day +1": ["E1", "C1", "C3"],
    "Rest day +2": ["E1", "C4", "C6", "S1", "S3", "S4", "S5", "S6", "F2", "F3"],
    "Rest day +3": ["E1", "C2"],
    "Rest day +4": ["E1", "Y1", "Y2", "Y3", "Y4", "F3"],
    "Rest day +5": ["E1", "C4", "C5", "S2", "S7", "F1", "F2"],
    "Rest day +6": ["E1", "C6", "Y2", "Y4", "F2", "F3", "F4"],
    "Monday": []
  },
  "MA-15": {
    "Rest day +1": ["E1", "C1"],
    "Rest day +2": ["E1", "C5", "S1", "S3", "F1", "F3", "F4"],
    "Rest day +3": ["E1", "C2"],
    "Rest day +4": ["E1", "Y3", "Y4", "F3"],
    "Rest day +5": ["E1", "C1"],
    "Rest day +6": ["E1", "C4", "S2", "S4", "F1", "F2"],
    "Monday": []
  },
  "MA-30": {
    "Rest day +1": ["E1", "C1"],
    "Rest day +2": ["E1", "C5", "S1", "S3", "S5", "F1", "F4"],
    "Rest day +3": ["E1", "C2"],
    "Rest day +4": ["E1", "C6", "Y2", "Y3", "Y4", "F2", "F3"],
    "Rest day +5": ["E1", "C3", "C6", "S7", "Y1", "F1"],
    "Rest day +6": ["E1", "C4", "C6", "S2", "S4", "S6", "F2", "F3"],
    "Monday": []
  },
  "MA-45": {
    "Rest day +1": ["E1", "C1", "C3"],
    "Rest day +2": ["E1", "C6", "C5", "S1", "S3", "S5", "S7", "F1", "F4"],
    "Rest day +3": ["E1", "C2"],
    "Rest day +4": ["E1", "C4", "C6", "Y1", "Y2", "Y3", "Y4"],
    "Rest day +5": ["E1", "C3", "C4", "C5", "S7", "F1", "F4"],
    "Rest day +6": ["E1", "C6", "S2", "S4", "S6", "S7", "F2", "F3"],
    "Monday": []
  },
  "SA-15": {
    "Rest day +1": ["E1", "C1"],
    "Rest day +2": ["E1", "C5", "S1", "S3", "F1", "F4"],
    "Rest day +3": ["E1", "C2"],
    "Rest day +4": ["E1", "C6", "Y3", "Y4", "F3", "F4"],
    "Rest day +5": ["E1", "C1"],
    "Rest day +6": ["E1", "C4", "S2", "S4", "F2", "F3"],
    "Monday": []
  },
  "SA-30": {
    "Rest day +1": ["E1", "C1"],
    "Rest day +2": ["E1", "C5", "S1", "S3", "S5", "F1", "F4"],
    "Rest day +3": ["E1", "C2"],
    "Rest day +4": ["E1", "C4", "C6", "S7", "Y2", "Y3", "Y4", "F2"],
    "Rest day +5": ["E1", "C1"],
    "Rest day +6": ["E1", "S2", "S4", "S6", "F2", "F3"],
    "Monday": []
  },
  "SA-45": {
    "Rest day +1": ["E1", "C1"],
    "Rest day +2": ["E1", "C6", "S1", "S3", "S5", "S7", "F1", "F4"],
    "Rest day +3": ["E1", "C2"],
    "Rest day +4": ["E1", "C6", "C5", "S7", "Y2", "Y3", "Y4"],
    "Rest day +5": ["E1", "C1"],
    "Rest day +6": ["E1", "C4", "S2", "S4", "S6", "Y3", "F2", "F3"],
    "Monday": []
  },
  "OA-15": {
    "Rest day +1": ["E1", "C1"],
    "Rest day +2": ["E1", "C3", "C4", "C5", "C8", "Y3", "S3", "S5", "S6", "F4"],
    "Rest day +3": ["E1", "C1"],
    "Rest day +4": ["E1", "C2", "C6", "C7", "Y1", "S1", "S2", "S4", "F3"],
    "Rest day +5": ["E1", "C1"],
    "Rest day +6": ["E1", "C2", "C5", "Y2", "Y4", "S5", "S6", "S7", "F1", "F2"],
    "Monday": []
  },

  "OA-30": {
    "Rest day +1": ["E1", "C1"],
    "Rest day +2": ["E1", "C3", "C4", "C5", "C8", "Y3", "S3", "S5", "S6", "F4"],
    "Rest day +3": ["E1", "C1"],
    "Rest day +4": ["E1", "C2", "C6", "C7", "Y1", "S1", "S2", "S4", "F3"],
    "Rest day +5": ["E1", "C1"],
    "Rest day +6": ["E1", "C2", "C5", "Y2", "Y4", "S5", "S6", "S7", "F1", "F2"],
    "Monday": []
  },

  "OA-45": {
    "Rest day +1": ["E1", "C1"],
    "Rest day +2": ["E1", "C3", "C4", "C5", "C8", "Y3", "S3", "S5", "S6", "F4"],
    "Rest day +3": ["E1", "C1"],
    "Rest day +4": ["E1", "C2", "C6", "C7", "Y1", "S1", "S2", "S4", "F3"],
    "Rest day +5": ["E1", "C1"],
    "Rest day +6": ["E1", "C2", "C5", "Y2", "Y4", "S5", "S6", "S7", "F1", "F2"],
    "Monday": []
  }
};

/* ----------------- Get User Fitness Plan ----------------- */
exports.getUserFitnessPlan = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId)
      return res.status(401).json({ message: "User not authenticated." });

    // 1️⃣ Fetch onboarding data
    const onboardingData = await Onboarding.findOne({ userId }).lean();
    if (!onboardingData)
      return res.status(404).json({ message: "Onboarding data not found." });

    // 2️⃣ Calculate metrics and derive age + recommended time
    // ... (all your existing metric calculations) ...
    const metrics = calculateAllMetrics(onboardingData);
    const age = metrics.age;
    if (typeof age !== "number" || age <= 0)
      return res.status(400).json({ message: "Invalid age in onboarding data." });

    const recommendedMinutes = calculateRecommendedExercise(
      onboardingData.o5Data || {}
    );
    const ageGroupPrefix = getAgeGroup(age);
    if (!ageGroupPrefix)
      return res.status(400).json({ message: "Could not determine age group." });

    const restDayRaw = onboardingData.o5Data?.rest_day;
    if (!restDayRaw)
      return res.status(400).json({ message: "Rest day not set in onboarding." });

    const ageGroupForQuery = `${ageGroupPrefix}-${recommendedMinutes}`;
    const userScheduleTemplate = exerciseScheduleMap[ageGroupForQuery];

    if (!userScheduleTemplate)
      return res
        .status(404)
        .json({
          message: "No predefined exercise schedule found for your age group.",
        });

    // 3️⃣ Fetch all exercises from Sanity
    const exercises = await client.fetch(
      `*[_type=="exercise" && ageGroup == $ageGroup]{
        name,
        "code": code.current,
        exerciseType,
        repsDuration,
        sets,
        "videoUrl": video.asset->url,
        _id,
       "instructions": coalesce(instructions, "")
      }`,
      { ageGroup: ageGroupForQuery }
    );

    if (!exercises || exercises.length === 0)
      return res
        .status(404)
        .json({ message: "No exercises found for your age group." });

    // 4️⃣ Create a lookup map
    // ... (your existing lookup map logic) ...
    const exerciseMap = {};
    exercises.forEach((ex) => {
      const codeKey =
        ex.code?.current?.toUpperCase?.() || ex.code?.toUpperCase?.();
      if (codeKey) exerciseMap[codeKey] = ex;
    });

    // 5️⃣ Build weekly plan
    // ... (your existing schedule/day logic) ...
    const restDayNormalized = String(restDayRaw)
      .slice(0, 3)
      .replace(/^[a-z]/, (c) => c.toUpperCase());
    const daysOfWeek = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const restIndex = daysOfWeek.indexOf(restDayNormalized);
    const scheduleDays = [];
    for (let i = 1; i <= 6; i++) {
      scheduleDays.push(daysOfWeek[(restIndex + i) % 7]);
    }

    const finalSchedule = {};
    finalSchedule[restDayNormalized] = []; 

    // 6️⃣ Assign exercises per day
    let dayIndex = 0;
    for (const [templateDay, codes] of Object.entries(userScheduleTemplate)) {
      if (dayIndex >= scheduleDays.length) break;

      const currentDay = scheduleDays[dayIndex];
      const dayExercises = [];

      for (const code of codes) {
        const ex = Object.values(exerciseMap).find(
          (e) =>
            e.code?.current?.toUpperCase?.().includes(code.toUpperCase()) ||
            e.code?.toUpperCase?.().includes(code.toUpperCase())
        );
        if (!ex) continue;

        // --- START: UPDATED LOGIC ---

        let instructionsText = ex.instructions || "";
        let equipment = "None"; // Default
        let steps = [];

        if (instructionsText) {
          
          // --- 1. Extract Equipment (NEW, HTML-BASED FIX) ---
          // This regex looks for "Equipment" (with or without <strong>)
          // and captures everything after the colon until the next HTML tag (like </p>)
          const eqMatch = instructionsText.match(/(?:<strong>)?Equipment(?:<\/strong>)?:\s*([^<]+)/i);
          // --------------------------------------------------

          if (eqMatch && eqMatch[1]) {
            let foundEquipment = eqMatch[1].trim();
            // Make sure it's not "None" or an empty string
            if (foundEquipment && foundEquipment.toLowerCase() !== 'none' && foundEquipment.length > 0) {
              equipment = foundEquipment; // This will set it to "Dumbbell"
            }
          }
          
          // --- 2. Extract Steps (Same logic as before) ---
          // This splits the HTML at the "Instructions:" heading
          const splitHtml = instructionsText.split(
            /<p><strong>Instructions:<\/strong><\/p>/i
          );

          let instructionHtml = "";
          if (splitHtml.length > 1) {
            instructionHtml = splitHtml[1];
          } else {
            instructionHtml = instructionsText;
          }

          // This finds all <li> tags, (which works for <ol> and <ul>)
          const listMatches = [...instructionHtml.matchAll(/<li>(.*?)<\/li>/g)];
          if (listMatches.length > 0) {
            steps = listMatches.map((m) =>
              m[1].replace(/<\/?[^>]+(>|$)/g, "").trim()
            ).filter(s => s.length > 0); // Filter out empty steps
          } else {
            // Fallback just in case
            const paragraphs = [
              ...instructionHtml.matchAll(/<p>(.*?)<\/p>/g),
            ];
            steps = paragraphs.map((p) =>
              p[1].replace(/<\/?[^>]+(>|$)/g, "").trim()
            ).filter(s => s.length > 0);
          }
        }
        
        // --- END: UPDATED LOGIC ---

        const color = colorMap[ex.exerciseType] || colorMap.default;

        dayExercises.push({
          title: ex.name,
          code: ex.code?.current || ex.code,
          type: ex.exerciseType,
          reps: ex.repsDuration,
          sets: ex.sets,
          videoUrl: ex.videoUrl || null,
          color,
          instructions: {
            duration: ex.repsDuration || "",
            equipment, // <-- This will now be "Dumbbell"
            sets: ex.sets || 1,
            steps,
            instructionsText, 
          },
          _id: ex._id,
        });
      }

      finalSchedule[currentDay] = dayExercises;
      dayIndex++;
    }

    // 7️⃣ Response payload
    const responsePayload = {
      preferred_ex_time: onboardingData.o5Data?.preferred_ex_time || null,
      recommended_minutes: recommendedMinutes,
      rest_day: restDayRaw,
      schedule: finalSchedule,
    };

    return res.status(200).json(responsePayload);
  } catch (error) {
    console.error("Error fetching user fitness plan:", error);
    return res
      .status(500)
      .json({ error: "Internal Server Error fetching fitness plan." });
  }
};

/* ----------------- Update Preferred Exercise Time ----------------- */
exports.updateUserPreferredExerciseTime = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId)
      return res.status(401).json({ status: 'error', message: "User not authenticated." });

    const { preferred_ex_time } = req.body;
    const timeRegex = /^(0?[1-9]|1[0-2]):[0-5][0-9]\s?(AM|PM|am|pm)$/;

    if (!preferred_ex_time || !timeRegex.test(preferred_ex_time)) {
      return res.status(400).json({
        status: 'error',
        message: "Invalid time format. Use hh:mm AM/PM (e.g., 09:30 AM)."
      });
    }

    const [time, meridiem] = preferred_ex_time.toUpperCase().split(/\s+/);
    const [hours, minutes] = time.split(':');
    let hour24 = parseInt(hours);
    if (meridiem === 'PM' && hour24 !== 12) hour24 += 12;
    else if (meridiem === 'AM' && hour24 === 12) hour24 = 0;

    const formattedTime = `${hour24.toString().padStart(2, '0')}:${minutes}`;

    const updated = await Onboarding.findOneAndUpdate(
      { userId },
      {
        'o5Data.preferred_ex_time': preferred_ex_time,
        'o5Data.preferred_ex_time_24': formattedTime,
        lastUpdated: Date.now(),
      },
      { new: true, runValidators: true }
    );

    if (!updated)
      return res.status(404).json({ status: 'error', message: "Onboarding data not found." });

    return res.status(200).json({
      status: 'success',
      message: "Preferred exercise time updated successfully.",
      data: {
        preferred_ex_time: updated.o5Data.preferred_ex_time,
        preferred_ex_time_24: updated.o5Data.preferred_ex_time_24,
        lastUpdated: updated.lastUpdated
      }
    });
  } catch (error) {
    console.error("Error updating preferred exercise time:", error);
    res.status(500).json({ status: 'error', message: "Internal Server Error." });
  }
};
