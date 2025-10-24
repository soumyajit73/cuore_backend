const client = require('../utils/sanityClient'); // Your Sanity client
const { calculateAllMetrics } = require('../models/onboardingModel.js'); // User metrics calculation
const Onboarding = require('../models/onboardingModel.js').Onboarding; // User onboarding data model

// Helper function to determine Age Group
function getAgeGroup(age) {
    if (age < 40) return 'YA';
    if (age >= 40 && age < 60) return 'MA';
    if (age >= 60 && age < 70) return 'SA';
    if (age >= 70) return 'OA';
    return null; // Should not happen with valid age
}

// Helper function to determine Duration Category
function getDurationMinutes(minutesPerWeek) {
    if (minutesPerWeek < 75) return 15;
    if (minutesPerWeek >= 75 && minutesPerWeek <= 150) return 30;
    if (minutesPerWeek > 150) return 45;
    return 15; // Default to 15 if invalid
}

exports.getUserFitnessPlan = async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ message: "User not authenticated." });
        }

        // 1. Fetch User Onboarding Data
        const onboardingData = await Onboarding.findOne({ userId }).lean();
        if (!onboardingData) {
            return res.status(404).json({ message: "Onboarding data not found for user." });
        }

        // 2. Determine User's Age Group and Duration
        const metrics = calculateAllMetrics(onboardingData); // Assuming this calculates age correctly
        const age = metrics.age; // Make sure 'age' is available in metrics
        const minutesOfExercise = onboardingData.minutesOfExercise; // Get exercise minutes

        if (typeof age !== 'number' || age <= 0) {
             return res.status(400).json({ message: "Invalid age found in user data." });
        }
         if (typeof minutesOfExercise !== 'number' || minutesOfExercise < 0) {
             console.warn(`Invalid minutesOfExercise (${minutesOfExercise}) for user ${userId}. Defaulting duration.`);
             // Use a default or handle as error depending on requirements
        }

        const ageGroup = getAgeGroup(age);
        const durationMinutes = getDurationMinutes(minutesOfExercise ?? 0); // Use 0 if undefined

        if (!ageGroup) {
             return res.status(400).json({ message: "Could not determine age group." });
        }


        // 3. Construct the Plan Identifier
        const planIdentifier = `${ageGroup.toLowerCase()}-${durationMinutes}`;
        console.log(`Fetching fitness plan for user ${userId}: Identifier = ${planIdentifier}`);

        // 4. Fetch the Plan from Sanity using GROQ
        const query = `
            *[_type == "fitnessPlan" && planIdentifier.current == $planId][0] {
                planIdentifier,
                ageGroup,
                durationMinutes,
                // Fetch details for each exercise in the schedule
                // Use select() to rename fields for frontend payload
                "Mon": [], // Explicitly return empty array for Monday (Rest)
                "Tue": weeklySchedule.tuesdayPlan[]->{
                    "title": name,
                    "reps": repsDuration,
                    "sets": sets,
                    "videoUrl": videoUrl, // Include video URL
                    "instructions": instructions, // Include instructions
                     // Add _id if frontend needs it for keys
                     _id
                },
                "Wed": weeklySchedule.wednesdayPlan[]->{
                    "title": name, "reps": repsDuration, "sets": sets, "videoUrl": videoUrl, "instructions": instructions, _id
                },
                "Thu": weeklySchedule.thursdayPlan[]->{
                    "title": name, "reps": repsDuration, "sets": sets, "videoUrl": videoUrl, "instructions": instructions, _id
                },
                "Fri": weeklySchedule.fridayPlan[]->{
                    "title": name, "reps": repsDuration, "sets": sets, "videoUrl": videoUrl, "instructions": instructions, _id
                },
                "Sat": weeklySchedule.saturdayPlan[]->{
                    "title": name, "reps": repsDuration, "sets": sets, "videoUrl": videoUrl, "instructions": instructions, _id
                },
                "Sun": weeklySchedule.sundayPlan[]->{
                    "title": name, "reps": repsDuration, "sets": sets, "videoUrl": videoUrl, "instructions": instructions, _id
                }
            }
        `;
        const params = { planId: planIdentifier };
        const planData = await client.fetch(query, params);

        if (!planData) {
            console.error(`Fitness plan not found for identifier: ${planIdentifier}`);
            // Return empty schedule or default plan?
            return res.status(404).json({ message: `Fitness plan not found for your profile (${planIdentifier}).` });
        }

        // 5. Ensure all days exist in the response, even if empty
        const finalResponse = {
            Mon: planData.Mon || [],
            Tue: planData.Tue || [],
            Wed: planData.Wed || [],
            Thu: planData.Thu || [],
            Fri: planData.Fri || [],
            Sat: planData.Sat || [],
            Sun: planData.Sun || [],
        };

        // You could add color dynamically here if needed, but it's not in the Sanity data
        // Object.values(finalResponse).forEach(dayPlan => {
        //     dayPlan.forEach(ex => ex.color = '#SomeDefaultColor');
        // });


        // 6. Return the formatted plan
        res.status(200).json(finalResponse);

    } catch (error) {
        console.error("Error fetching user fitness plan:", error);
        res.status(500).json({ error: "Internal Server Error fetching fitness plan." });
    }
};
