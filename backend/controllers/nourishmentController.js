const Onboarding = require('../models/onboardingModel.js').Onboarding;
const NutritionPlanItem = require('../models/nutritionPlanItemModel');
const { calculateAllMetrics } = require('../models/onboardingModel.js');

/**
 * Gets a personalized meal plan for a SPECIFIC meal time (Breakfast or Lunch/Dinner).
 * The meal time is specified via a query parameter.
 */
exports.getNourishmentPlan = async (req, res) => {
    try {
        // ✅ 1. Get the meal_time from the URL's query parameter
        const { meal_time } = req.query;

        // ✅ 2. Validate the input
        if (!meal_time || !['Breakfast', 'Lunch/Dinner'].includes(meal_time)) {
            return res.status(400).json({ 
                message: "A valid 'meal_time' query parameter is required.",
                options: ['Breakfast', 'Lunch/Dinner']
            });
        }

        const userId = req.user.userId;
        const onboardingData = await Onboarding.findOne({ userId }).lean();
        if (!onboardingData) {
            return res.status(404).json({ message: "Onboarding data not found." });
        }

        const metrics = calculateAllMetrics(onboardingData);
        const recommendedCalories = metrics.recommendedCalories;
        const foodPreference = onboardingData.o5Data.eating_preference;

        // Determine calorie range
        let calorieRange;
        if (recommendedCalories < 1300) calorieRange = "<1300";
        else if (recommendedCalories <= 1499) calorieRange = "1300-1499";
        else if (recommendedCalories <= 1699) calorieRange = "1500-1699";
        else if (recommendedCalories <= 1899) calorieRange = "1700-1899";
        else if (recommendedCalories <= 2099) calorieRange = "1900-2099";
        else calorieRange = ">2099";
        
        // Define all possible diet tags
        const dietTagMaps = {
            Breakfast: {
                'Veg': ['V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9', 'V10', 'V11', 'V12'],
                'Eggetarian': ['V3', 'V4', 'V6', 'V7', 'V8', 'V9', 'V10', 'E1', 'E2', 'E3'],
                'Non-Veg': ['V3', 'V4', 'V6', 'V7', 'V8', 'V9', 'V10', 'E1', 'E2', 'E3', 'N1']
            },
            'Lunch/Dinner': {
                'Veg': ['V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9', 'V10'],
                'Eggetarian': ['V1', 'V2', 'V3', 'V5', 'V6', 'V7', 'V8', 'V9', 'V10','V11', 'V12', 'E4', 'E12'],

                'Non-Veg': ['N1', 'N2', 'V3', 'E4', 'V5', 'V6', 'V7', 'V8', 'V9', 'V10', 'V12', 'N11', 'E12']
            }
        };

        let userDietKey;
        if (foodPreference === 'Vegetarian') userDietKey = 'Veg';
        else if (foodPreference === 'Eggetarian') userDietKey = 'Eggetarian';
        else if (foodPreference === 'Non-vegetarian') userDietKey = 'Non-Veg';
        else userDietKey = 'Veg';

        // ✅ 3. Select the correct set of diet tags based on the requested meal_time
        const tagsForUser = dietTagMaps[meal_time][userDietKey];
        
        // ✅ 4. Build and execute the query for the requested meal_time
        const promises = tagsForUser.map(tag => {
            return NutritionPlanItem.aggregate([
                // The $match stage now filters by the meal_time from the query!
                { $match: { meal_time: meal_time, calorie_range: calorieRange, diet_tag: tag } },
                { $sample: { size: 1 } }
            ]);
        });

        const results = await Promise.all(promises);
        const mealPlan = results.flat().filter(Boolean);

        if (mealPlan.length === 0) {
            return res.status(404).json({ message: `No meal plan items found for your preferences.` });
        }

        res.status(200).json({
            calorie_range: calorieRange,
            meal_time: meal_time, // Return the requested meal time for clarity
            meal_plan: mealPlan
        });

    } catch (error) {
        console.error("Error fetching nourishment plan:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};