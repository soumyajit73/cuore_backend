// controllers/fitnessController.js
const client = require('../utils/sanityClient');
const { calculateAllMetrics } = require('../models/onboardingModel.js');
const Onboarding = require('../models/onboardingModel.js').Onboarding;

/**
 * Helper: Determine Age Group prefix
 */
function getAgeGroup(age) {
  if (age < 40) return 'YA';
  if (age >= 40 && age < 60) return 'MA';
  if (age >= 60 && age < 70) return 'SA';
  if (age >= 70) return 'OA';
  return null;
}

/**
 * Helper: Map min_exercise_per_week string to duration minutes
 */
function calculateRecommendedExercise(o5Data) {
  const minExercise = o5Data?.min_exercise_per_week;
  if (minExercise === "Less than 75 min") return 15;
  if (minExercise === "75 to 150 min") return 30;
  if (minExercise === "More than 150 min") return 45;
  // fallback default
  return 15;
}

/**
 * Normalize a rest day string to 3-letter code used by our week array.
 * Accepts "Sat", "Saturday", "sat", "saturday", etc.
 */
function normalizeDayToShort(dayStr) {
  if (!dayStr || typeof dayStr !== 'string') return null;
  const m = dayStr.trim().toLowerCase();
  if (m.startsWith('mon')) return 'Mon';
  if (m.startsWith('tue')) return 'Tue';
  if (m.startsWith('wed')) return 'Wed';
  if (m.startsWith('thu')) return 'Thu';
  if (m.startsWith('fri')) return 'Fri';
  if (m.startsWith('sat')) return 'Sat';
  if (m.startsWith('sun')) return 'Sun';
  return null;
}

/**
 * Get next N days (short names) starting *after* restDay.
 * E.g., restDay = 'Sat' => returns ['Sun','Mon','Tue',...]
 */
function generateWeekDaysAfterRest(restDayShort, numDays = 6) {
  const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const restIndex = daysOfWeek.indexOf(restDayShort);
  if (restIndex === -1) {
    // fallback to Mon..Sat if invalid
    return daysOfWeek.slice(0, numDays);
  }
  const result = [];
  for (let i = 1; i <= numDays; i++) {
    result.push(daysOfWeek[(restIndex + i) % 7]);
  }
  return result;
}

/**
 * Parse the exercise.instructions text to produce structured instruction data:
 * - equipment (look for "Equipment: <value>" or fallback "None")
 * - steps: array of step strings extracted from the Instructions: section (strips numbers & bullets)
 * - instructionsText: original raw text
 */
function parseInstructionText(rawText) {
  const result = {
    equipment: null,
    steps: [],
    instructionsText: rawText || ''
  };

  if (!rawText || typeof rawText !== 'string') {
    result.equipment = 'None';
    return result;
  }

  const txt = rawText.replace(/\r/g, ''); // normalize
  // Try to find Equipment:
  const equipMatch = txt.match(/Equipment:\s*(.+)/i);
  if (equipMatch && equipMatch[1]) {
    // equipment may be the rest of that line
    result.equipment = equipMatch[1].split('\n')[0].trim();
  } else {
    result.equipment = 'None';
  }

  // Find "Instructions:" section
  const instrIndex = txt.search(/Instructions:/i);
  let instrBody = '';
  if (instrIndex !== -1) {
    instrBody = txt.slice(instrIndex + 'Instructions:'.length).trim();
  } else {
    // if no explicit "Instructions:", take everything except Equipment line
    instrBody = txt.replace(/Equipment:.*$/im, '').trim();
  }

  if (!instrBody) {
    result.steps = [];
    return result;
  }

  // Split into candidate lines, strip empty lines
  const lines = instrBody.split('\n').map(l => l.trim()).filter(Boolean);

  // Convert numbered/bulleted lines to clean steps. We will merge lines that are part of the same step when they don't start with a marker.
  const steps = [];
  let current = null;

  const isStepStart = (line) => {
    // Recognize numbered list "1.", "1)", "•", "-" or lines starting with a capital word and ended by ':' (heading) treated as step too
    return /^(\d+[\.\)]|\u2022|-|\*|\+)\s*/.test(line) || /^[A-Z][\w\s]{0,40}:$/.test(line) || /^\d+\s+/.test(line);
  };

  for (const line of lines) {
    if (isStepStart(line)) {
      // remove prefix numbers/bullets then push as new step
      const cleaned = line.replace(/^(\d+[\.\)]|\u2022|-|\*|\+)\s*/, '').trim();
      // split if line contains "•" in the middle or " - " separators
      current = cleaned;
      steps.push(current);
    } else {
      // continuation of previous step or new short step
      if (steps.length === 0) {
        steps.push(line);
      } else {
        // append continuation to last step with a space
        steps[steps.length - 1] = `${steps[steps.length - 1]} ${line}`;
      }
    }
  }

  // final cleanup: remove trailing colons from headings
  result.steps = steps.map(s => s.replace(/:$/, '').trim());

  return result;
}

/**
 * Main controller
 */
exports.getUserFitnessPlan = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ message: 'User not authenticated.' });

    // 1) onboarding data
    const onboardingData = await Onboarding.findOne({ userId }).lean();
    if (!onboardingData) return res.status(404).json({ message: 'Onboarding data not found.' });

    // 2) metrics & age
    const metrics = calculateAllMetrics(onboardingData);
    const age = metrics.age;
    if (typeof age !== 'number' || age <= 0) {
      console.warn('Invalid age from metrics:', age);
      return res.status(400).json({ message: 'Invalid age in onboarding data.' });
    }

    // 3) preferred_ex_time (string from onboarding) — include in response
    const preferredExTime = onboardingData.o5Data?.preferred_ex_time || null;

    // 4) recommended minutes and age group prefix
    const recommendedMinutes = calculateRecommendedExercise(onboardingData.o5Data || {});
    const ageGroupPrefix = getAgeGroup(age);
    if (!ageGroupPrefix) return res.status(400).json({ message: 'Could not determine age group.' });

    // 5) rest day normalization and schedule days
    const rawRest = onboardingData.o5Data?.rest_day;
    const restShort = normalizeDayToShort(rawRest);
    if (!restShort) return res.status(400).json({ message: 'Rest day not set in onboarding.' });

    const scheduleDays = generateWeekDaysAfterRest(restShort, 6); // 6 days after rest
    // Make sure rest day is on top of the returned object (per your request)
    const orderedDays = [restShort, ...scheduleDays];

    // 6) fetch exercises for the ageGroup+duration (this is how you stored ageGroup on exercise documents)
    const ageGroupForQuery = `${ageGroupPrefix}-${recommendedMinutes}`; // e.g., "OA-45"
    console.log(`Querying exercises for ageGroup: ${ageGroupForQuery}`);

    const exercises = await client.fetch(
      `*[_type=="exercise" && ageGroup == $ageGroup]{
        name, code, exerciseType, repsDuration, sets, videoUrl, instructions, _id
      }`,
      { ageGroup: ageGroupForQuery }
    );

    if (!exercises || exercises.length === 0) {
      console.warn('No exercises found for:', ageGroupForQuery);
      return res.status(404).json({ message: 'No exercises found for your age group.' });
    }

    // 7) Build final schedule object with rest day first, then the next 6 days
    // We'll do a simple round-robin assignment across days — you can adjust allocation logic.
    const finalSchedule = {};
    // Put rest day entry as empty array (or you could put a 'Rest' placeholder)
    finalSchedule[restShort] = []; // rest day on top

    // Now assign exercises to following days
    let exIndex = 0;
    const exercisesCountPerDay = 3; // adjust if needed (2-3)
    for (const day of scheduleDays) {
      const dayExercises = [];
      const numToAssign = Math.min(exercisesCountPerDay, exercises.length);
      for (let i = 0; i < numToAssign; i++) {
        const ex = exercises[exIndex % exercises.length];

        // parse instruction text for JSON structure
        const parsedInstr = parseInstructionText(ex.instructions || '');

        dayExercises.push({
          title: ex.name,
          code: ex.code,
          type: ex.exerciseType,
          reps: ex.repsDuration,
          sets: ex.sets,
          videoUrl: ex.videoUrl || null,
          // instructions wrapper: duration, equipment, sets, steps, raw text
          instructions: {
            duration: ex.repsDuration || null,
            equipment: parsedInstr.equipment || 'None',
            sets: ex.sets || null,
            steps: parsedInstr.steps || [],
            instructionsText: parsedInstr.instructionsText || ''
          },
          _id: ex._id
        });

        exIndex++;
      }
      finalSchedule[day] = dayExercises;
    }

    // 8) Prepare final response: include preferred_ex_time in top-level payload
    const responsePayload = {
      preferred_ex_time: preferredExTime,
      recommended_minutes: recommendedMinutes,
      rest_day: restShort,
      schedule: finalSchedule
    };

    return res.status(200).json(responsePayload);

  } catch (error) {
    console.error('Error fetching user fitness plan:', error);
    return res.status(500).json({ error: 'Internal Server Error fetching fitness plan.' });
  }
};
