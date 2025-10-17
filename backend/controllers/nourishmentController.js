const Onboarding = require('../models/onboardingModel.js').Onboarding;
const NutritionPlanItem = require('../models/nutritionPlanItemModel');
const { calculateAllMetrics } = require('../models/onboardingModel.js');

/**
 * Gets a personalized, randomized 10-12 item meal plan for a user.
 */
exports.getNourishmentPlan = async (req, res) => {
    try {
        const userId = req.user.userId;

        const onboardingData = await Onboarding.findOne({ userId }).lean();
        if (!onboardingData) {
            return res.status(404).json({ message: "Onboarding data not found." });
        }

        const metrics = calculateAllMetrics(onboardingData);
        const recommendedCalories = metrics.recommendedCalories;
        const foodPreference = onboardingData.o5Data.eating_preference;

        // 1. Determine the calorie range from the user's metrics
        let calorieRange;
        if (recommendedCalories < 1300) calorieRange = "<1300";
        else if (recommendedCalories <= 1499) calorieRange = "1300-1499";
        else if (recommendedCalories <= 1699) calorieRange = "1500-1699";
        else if (recommendedCalories <= 1899) calorieRange = "1700-1899";
        else if (recommendedCalories <= 2099) calorieRange = "1900-2099";
        else calorieRange = ">2099";

        // ============================================================================
        // ## NEW LOGIC: Select diet tags based on user preference ##
        // ============================================================================
        const dietTagMap = {
            'Veg': ['V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9', 'V10'],
            'Eggetarian': ['V3', 'V4', 'V6', 'V7', 'V8', 'V9', 'V10', 'E1', 'E2', 'E3'],
            'Non-Veg': ['V3', 'V4', 'V6', 'V7', 'V8', 'V9', 'V10', 'E1', 'E2', 'E3', 'N1']
        };

        // Map the user's preference from onboarding to the keys in our map
        let userDietKey;
        if (foodPreference === 'Vegetarian') userDietKey = 'Veg';
        else if (foodPreference === 'Eggetarian') userDietKey = 'Eggetarian';
        else if (foodPreference === 'Non-vegetarian') userDietKey = 'Non-Veg';
        else userDietKey = 'Veg'; // Default to Veg if preference is not set

        const dietTagsForUser = dietTagMap[userDietKey];
        
        // ============================================================================
        // ## NEW LOGIC: Randomly select ONE item for each required diet tag ##
        // ============================================================================
        
        // Create a promise for each database query
        const promises = dietTagsForUser.map(tag => {
            return NutritionPlanItem.aggregate([
                // Stage 1: Find all items that match the user's calorie range and the specific diet tag
                { $match: { calorie_range: calorieRange, diet_tag: tag } },
                // Stage 2: Randomly select just ONE document from the matches
                { $sample: { size: 1 } }
            ]);
        });

        // Execute all the random selections concurrently
        const results = await Promise.all(promises);

        // The result is an array of arrays (e.g., [[itemV1], [itemV2], ...]), 
        // so we flatten it into a single list and remove any empty results.
        const mealPlan = results.flat().filter(Boolean);

        if (mealPlan.length === 0) {
            return res.status(404).json({ message: `No meal plan items found for the user's preferences in calorie range: ${calorieRange}` });
        }

        res.status(200).json({
            calorie_range: calorieRange,
            meal_plan: mealPlan
        });

    } catch (error) {
        console.error("Error fetching nourishment plan:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};