// controllers/fitnessController.js
const client = require('../utils/sanityClient'); 
const { calculateAllMetrics } = require('../models/onboardingModel.js'); 
const Onboarding = require('../models/onboardingModel.js').Onboarding;

// Helper: Determine Age Group prefix
function getAgeGroup(age) {
    if (age < 40) return 'YA';
    if (age >= 40 && age < 60) return 'MA';
    if (age >= 60 && age < 70) return 'SA';
    if (age >= 70) return 'OA';
    return null;
}

// Helper: Map min_exercise_per_week string to duration
function calculateRecommendedExercise(o5Data) {
    const minExercise = o5Data.min_exercise_per_week;
    if (minExercise === "Less than 75 min") return 15;
    if (minExercise === "75 to 150 min") return 30;
    return 45; // "More than 150 min" or fallback
}

// Helper: Generate next N days after rest day
function generateWeekDays(restDay, numDays = 6) {
    const daysOfWeek = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const restIndex = daysOfWeek.indexOf(restDay);
    if (restIndex === -1) return daysOfWeek.slice(0, numDays); // fallback
    const result = [];
    for (let i = 1; i <= numDays; i++) {
        result.push(daysOfWeek[(restIndex + i) % 7]);
    }
    return result;
}

// Helper: Assign color based on exercise type
function getColorForType(type) {
    const colors = {
        "Cardio": "#FF6B81",
        "Strength": "#FFB86C",
        "Flexibility": "#6699FF",
        "Lung Expansion": "#A68DFF",
        "Yoga": "#66CC99",
        "Balance": "#FFDE59",
    };
    return colors[type] || "#CCCCCC";
}

exports.getUserFitnessPlan = async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ message: "User not authenticated." });

        // 1️⃣ Fetch onboarding data
        const onboardingData = await Onboarding.findOne({ userId }).lean();
        if (!onboardingData) return res.status(404).json({ message: "Onboarding data not found." });

        const metrics = calculateAllMetrics(onboardingData);
        const age = metrics.age;
        const recommendedMinutes = calculateRecommendedExercise(onboardingData);
        const ageGroupPrefix = getAgeGroup(age);

        if (!ageGroupPrefix) return res.status(400).json({ message: "Could not determine age group." });

        const restDay = onboardingData.o5Data?.rest_day;
        if (!restDay) return res.status(400).json({ message: "Rest day not set in onboarding." });

        const scheduleDays = generateWeekDays(restDay, 6);
        const ageGroupForQuery = `${ageGroupPrefix}-${recommendedMinutes}`; // e.g., "YA-30"

        // 2️⃣ Fetch all exercises for this age group
        const exercises = await client.fetch(
            `*[_type=="exercise" && ageGroup == $ageGroup]{
                name, exerciseType, repsDuration, sets, _id
            }`,
            { ageGroup: ageGroupForQuery }
        );

        if (!exercises || exercises.length === 0) {
            return res.status(404).json({ message: "No exercises found for your age group." });
        }

        // 3️⃣ Generate schedule in frontend-friendly format
        const tempSchedule = {};
        let exIndex = 0;

        for (const day of scheduleDays) {
            const dayExercises = [];
            const numExercises = Math.min(3, exercises.length);
            for (let i = 0; i < numExercises; i++) {
                const ex = exercises[exIndex % exercises.length];
                dayExercises.push({
                    title: ex.name,
                    reps: ex.repsDuration,
                    sets: ex.sets.toString(),
                    color: getColorForType(ex.exerciseType)
                });
                exIndex++;
            }
            tempSchedule[day] = dayExercises;
        }

        // Build final schedule with rest day on top
        const finalSchedule = { [restDay]: [] };
        for (const day of scheduleDays) {
            finalSchedule[day] = tempSchedule[day];
        }

        return res.status(200).json(finalSchedule);

    } catch (error) {
        console.error("Error fetching user fitness plan:", error);
        return res.status(500).json({ error: "Internal Server Error fetching fitness plan." });
    }
};
