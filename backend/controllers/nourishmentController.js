const Onboarding = require('../models/onboardingModel.js').Onboarding;
const NutritionPlanItem = require('../models/nutritionPlanItemModel');
const { calculateAllMetrics } = require('../models/onboardingModel.js'); // Make sure this is exported

/**
 * Gets the full meal plan for a user based on their calorie range.
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

        // Determine the calorie range from the user's metrics
        let calorieRange;
        if (recommendedCalories < 1300) calorieRange = "<1300";
        else if (recommendedCalories <= 1499) calorieRange = "1300-1499";
        else if (recommendedCalories <= 1699) calorieRange = "1500-1699";
        else if (recommendedCalories <= 1899) calorieRange = "1700-1899";
        else if (recommendedCalories <= 2099) calorieRange = "1900-2099";
        else calorieRange = ">2099";

        // Fetch all meal plan items for that specific range
        const mealPlan = await NutritionPlanItem.find({ calorie_range: calorieRange }).lean();

        if (!mealPlan || mealPlan.length === 0) {
            return res.status(404).json({ message: `No meal plan found for the calorie range: ${calorieRange}` });
        }

        res.status(200).json({
            calorie_range: calorieRange,
            meal_plan: mealPlan
        });

    } catch (error) {
        console.error("Error fetching nourishment plan:", error);
        res.status(500).json({ error: "Internal server error." });
    }
};