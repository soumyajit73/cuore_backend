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
    const minExercise = o5Data?.min_exercise_per_week;
    if (minExercise === "Less than 75 min") return 15;
    if (minExercise === "75 to 150 min") return 30;
    return 45; // "More than 150 min" or fallback
}

// Helper: Get next N days starting from restDay (returns array of day keys)
// restDay is expected as "Mon","Tue",...,"Sun" or full name like "Sat" (we use abbreviations)
function generateWeekDays(restDay, numDays = 6) {
    const daysOfWeek = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    // ensure restDay is in the same format (take first 3 letters, capitalized first)
    if (!restDay) return [];
    const normalized = String(restDay).slice(0,3).replace(/^[a-z]/, c => c.toUpperCase());
    const restIndex = daysOfWeek.indexOf(normalized);
    if (restIndex === -1) return [];
    const result = [];
    for (let i = 1; i <= numDays; i++) {
        result.push(daysOfWeek[(restIndex + i) % 7]);
    }
    return result;
}

// Color palette mapping for exercise types
const colorMap = {
    "Lung Expansion": "#A68DFF",
    "Cardio": "#FF6B81",
    "Strength": "#66CC99",
    "Flexibility": "#6699FF",
    "Yoga": "#FFD166",
    "Balance": "#FFB6C1",
    // fallback color
    "default": "#C0C0C0"
};

exports.getUserFitnessPlan = async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) return res.status(401).json({ message: "User not authenticated." });

        // 1️⃣ Fetch onboarding data
        const onboardingData = await Onboarding.findOne({ userId }).lean();
        if (!onboardingData) return res.status(404).json({ message: "Onboarding data not found." });

        // 2️⃣ Determine metrics, age & recommended exercise
        const metrics = calculateAllMetrics(onboardingData);
        const age = metrics.age;
        if (typeof age !== 'number' || age <= 0) {
            console.error("Invalid age calculated:", age, "raw onboarding:", onboardingData.o2Data);
            return res.status(400).json({ message: "Invalid age in onboarding data." });
        }

        const recommendedMinutes = calculateRecommendedExercise(onboardingData.o5Data || {});
        const ageGroupPrefix = getAgeGroup(age);
        if (!ageGroupPrefix) return res.status(400).json({ message: "Could not determine age group." });

        const restDayRaw = onboardingData.o5Data?.rest_day;
        if (!restDayRaw) return res.status(400).json({ message: "Rest day not set in onboarding." });

        const scheduleDays = generateWeekDays(restDayRaw, 6); // six days after rest day

        // 3️⃣ Build ageGroup key used in exercise documents (schema uses e.g., "OA-30")
        const ageGroupForQuery = `${ageGroupPrefix}-${recommendedMinutes}`; // e.g., "OA-30"
        console.log("Querying exercises for ageGroup:", ageGroupForQuery);

        // 4️⃣ Fetch all exercises for this age group from Sanity
        const exercises = await client.fetch(
            `*[_type=="exercise" && ageGroup == $ageGroup]{
                name, code, exerciseType, repsDuration, sets, videoUrl, instructions, _id
            }`,
            { ageGroup: ageGroupForQuery }
        );

        if (!exercises || exercises.length === 0) {
            console.warn(`No exercises found for ageGroup ${ageGroupForQuery}`);
            return res.status(404).json({ message: "No exercises found for your age group." });
        }

        // 5️⃣ Build schedule: place rest day on top of response, then 6 subsequent days
        const finalSchedule = {};
        // Add rest day first, empty array
        const restDayNormalized = String(restDayRaw).slice(0,3).replace(/^[a-z]/, c => c.toUpperCase());
        finalSchedule[restDayNormalized] = [];

        // Round-robin assign exercises across scheduleDays
        let exIndex = 0;
        const exercisesPerDay = Math.min(3, Math.max(1, Math.floor(exercises.length / Math.max(1, scheduleDays.length)) || 3));

        for (const day of scheduleDays) {
            const dayExercises = [];
            const numExercises = Math.min(3, exercises.length); // keep 2-3 per day as before
            for (let i = 0; i < numExercises; i++) {
                const ex = exercises[exIndex % exercises.length];

                // pick color based on exerciseType, fallback to default
                const color = colorMap[ex.exerciseType] || colorMap.default;

                // Build instructions wrapper
                const instructionsObj = {
                    duration: ex.repsDuration || "",
                    equipment: "None", // default, update later if you import equipment
                    sets: ex.sets != null ? ex.sets : 1,
                    steps: [], // no parsed steps currently; can be filled from doc imports
                    instructionsText: ex.instructions || ""
                };

                dayExercises.push({
                    title: ex.name,
                    code: ex.code,
                    type: ex.exerciseType,
                    reps: ex.repsDuration,
                    sets: ex.sets,
                    videoUrl: ex.videoUrl || null,
                    instructions: instructionsObj,
                    imageUrl: ex.imageUrl || 'https://via.placeholder.com/150',
                    color,
                    _id: ex._id
                });

                exIndex++;
            }
            finalSchedule[day] = dayExercises;
        }

        // 6️⃣ Return structured payload with preferred_ex_time, recommended minutes, rest_day and schedule
        const responsePayload = {
            preferred_ex_time: onboardingData.o5Data?.preferred_ex_time || null,
            recommended_minutes: recommendedMinutes,
            rest_day: restDayRaw,
            schedule: finalSchedule
        };

        return res.status(200).json(responsePayload);

    } catch (error) {
        console.error("Error fetching user fitness plan:", error);
        return res.status(500).json({ error: "Internal Server Error fetching fitness plan." });
    }
};


exports.updateUserPreferredExerciseTime = async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ 
                status: 'error',
                message: "User not authenticated." 
            });
        }

        const { preferred_ex_time } = req.body;
        
        // Validate time format (hh:mm AM/PM)
        const timeRegex = /^(0?[1-9]|1[0-2]):[0-5][0-9]\s?(AM|PM|am|pm)$/;
        if (!preferred_ex_time || !timeRegex.test(preferred_ex_time)) {
            return res.status(400).json({ 
                status: 'error',
                message: "Invalid time format. Please use hh:mm AM/PM format (e.g., 09:30 AM)." 
            });
        }

        // Convert 12-hour format to 24-hour format for storage
        const [time, meridiem] = preferred_ex_time.toUpperCase().split(/\s+/);
        const [hours, minutes] = time.split(':');
        let hour24 = parseInt(hours);

        // Convert to 24-hour format
        if (meridiem === 'PM' && hour24 !== 12) {
            hour24 += 12;
        } else if (meridiem === 'AM' && hour24 === 12) {
            hour24 = 0;
        }

        // Format time in 24-hour format
        const formattedTime = `${hour24.toString().padStart(2, '0')}:${minutes}`;

        // Update onboarding document
        const updatedOnboarding = await Onboarding.findOneAndUpdate(
            { userId },
            { 
                'o5Data.preferred_ex_time': preferred_ex_time, // Store original format
                'o5Data.preferred_ex_time_24': formattedTime,  // Store 24-hour format
                lastUpdated: Date.now()
            },
            { 
                new: true,
                runValidators: true
            }
        );

        if (!updatedOnboarding) {
            return res.status(404).json({ 
                status: 'error',
                message: "Onboarding data not found for user." 
            });
        }

        return res.status(200).json({ 
            status: 'success',
            message: "Preferred exercise time updated successfully.",
            data: {
                preferred_ex_time: updatedOnboarding.o5Data.preferred_ex_time,
                preferred_ex_time_24: updatedOnboarding.o5Data.preferred_ex_time_24,
                lastUpdated: updatedOnboarding.lastUpdated
            }
        });

    } catch (error) {
        console.error("Error updating preferred exercise time:", error);
        return res.status(500).json({ 
            status: 'error',
            message: "Internal Server Error updating preferred exercise time.",
            error: error.message 
        });
    }
};