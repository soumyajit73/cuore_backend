// controllers/mealBuilderController.js
const client = require('../utils/sanityClient'); // Ensure this path points to your sanityClient.js file
const { calculateAllMetrics } = require('../models/onboardingModel.js'); // Ensure this path is correct
const Onboarding = require('../models/onboardingModel.js').Onboarding; // Ensure this path is correct
const { MROUND, parseServingSize } = require('../utils/mathHelpers');
// Make sure this function is exported correctly
const MEAL_CALORIE_DISTRIBUTION = {
    Breakfast: 0.25, // 30%
    Lunch: 0.30,     // 35%
    Dinner: 0.30      // 35%
};
exports.getBuilderItems = async (req, res) => {
  try {
    const { meal_time, cuisine } = req.query;

    // --- Input Validation (Now expects Breakfast, Lunch, or Dinner) ---
    if (!meal_time || !cuisine) {
      return res.status(400).json({ message: "meal_time and cuisine query parameters are required." });
    }
    // ✅ Updated validation for specific meal times
    if (!['Breakfast', 'Lunch', 'Dinner'].includes(meal_time)) {
       return res.status(400).json({ message: "Invalid meal_time parameter (Use 'Breakfast', 'Lunch', or 'Dinner')." });
    }
     if (!['Indian', 'Global'].includes(cuisine)) {
       return res.status(400).json({ message: "Invalid cuisine parameter." });
    }
    // -----------------------------------------------------------------

    // --- Get User Data & Calculate DAILY Recommended Calories ---
    const userId = req.user.userId;
    const onboardingData = await Onboarding.findOne({ userId }).lean();
    if (!onboardingData) {
      return res.status(404).json({ message: "Onboarding data not found to calculate recommended calories." });
    }
    const metrics = calculateAllMetrics(onboardingData);
    const dailyRecommendedCalories = metrics.recommendedCalories; // User's DAILY target
    // ----------------------------------------------------------

    // --- Calculate MEAL-SPECIFIC Recommended Calories ---
    const mealPercentage = MEAL_CALORIE_DISTRIBUTION[meal_time];
    if (typeof mealPercentage !== 'number') {
        // Fallback or error if meal_time isn't in our distribution map
        console.error(`Invalid meal_time "${meal_time}" for calorie distribution.`);
        return res.status(400).json({ message: "Invalid meal_time provided for calorie calculation." });
    }
    const mealSpecificRecommendedCalories = Math.round(dailyRecommendedCalories * mealPercentage);
    // --------------------------------------------------

    // --- Determine mealTime filter for Sanity ---
    // Sanity uses "Breakfast" or "Lunch/Dinner". Map Lunch/Dinner requests accordingly.
    const sanityMealTimeFilter = (meal_time === 'Lunch' || meal_time === 'Dinner') ? 'Lunch/Dinner' : 'Breakfast';
    // --------------------------------------------


    // --- Fetch Builder Items from Sanity ---
    const query = `
      *[_type == "mealBuilderItem" &&
        mealTime == $sanityMealTimeFilter && // Use the mapped value
        cuisine == $cuisine] {
          _id, name, calories, servingSize, section, mealTime, cuisine,
          adjustmentWeight, // Fetch the Column I value needed for the formula
          "recipeLink": recipeLink->{_id, name}
      } | order(section asc, name asc)
    `;
    const params = { sanityMealTimeFilter, cuisine }; // Pass correct parameters
    const items = await client.fetch(query, params);
    // ------------------------------------

    // --- Group items by section ---
    const groupedItems = items.reduce((acc, item) => {
      const section = item.section || 'Uncategorized';
      if (!acc[section]) acc[section] = [];
      acc[section].push(item);
      return acc;
    }, {});
    // ----------------------------

    // --- Send Response ---
    res.status(200).json({
      recommended_calories: mealSpecificRecommendedCalories, // ✅ Return MEAL target
      grouped_items: groupedItems
    });
    // ---------------------

  } catch (error) {
    console.error("Error fetching meal builder items:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

exports.adjustMealPortions = async (req, res) => {
     try {
        const { cartItems, recommendedCalories } = req.body;

        // --- Input Validation ---
        if (!Array.isArray(cartItems) || cartItems.length === 0) {
            return res.status(400).json({ message: "cartItems array required." });
        }
        if (typeof recommendedCalories !== 'number' || recommendedCalories <= 0) {
            return res.status(400).json({ message: "Valid recommendedCalories required." });
        }
        // ...existing validation code...

        const totalSelectedCalories = cartItems.reduce((sum, item) => sum + item.calories, 0);
        const totalAdjustmentWeight = cartItems.reduce((sum, item) => sum + item.adjustmentWeight, 0);

        // --- Handle Case: Below Target Calories ---
        if (totalSelectedCalories < recommendedCalories) {
            const originalItemsWithParsedQty = cartItems.map(item => {
                 const { originalQuantity, unit } = parseServingSize(item.servingSize);
                 return { ...item, adjustedQuantity: originalQuantity, unit: unit, adjustedCalories: item.calories };
            });
            return res.status(200).json({
                 status: "below_target",
                 alert: "Balance your meal by adding more dishes.",
                 adjustedItems: originalItemsWithParsedQty,
                 currentTotalCalories: totalSelectedCalories,
                 targetCalories: recommendedCalories
             });
        }
        // ----------------------------------------

        // --- Handle Edge Case: Total Weight is Zero ---
        if (totalAdjustmentWeight === 0 && totalSelectedCalories !== recommendedCalories) {
             console.warn("Total Adjustment Weight is zero. Cannot apply weighted formula. Performing simple proportional scaling.");
             const scalingFactor = recommendedCalories / totalSelectedCalories;
             const adjustedItemsSimple = [];
             for (const item of cartItems) {
                 const { originalQuantity, unit } = parseServingSize(item.servingSize);
                 const calculatedNewQuantity = originalQuantity * scalingFactor;
                 const adjustedQuantity = MROUND(calculatedNewQuantity, 0.25);
                 const finalAdjustedQuantity = (adjustedQuantity <= 0 && originalQuantity > 0) ? 0.25 : adjustedQuantity;
                 const quantityRatio = originalQuantity > 0 ? (finalAdjustedQuantity / originalQuantity) : 0;
                 const finalAdjustedCalories = Math.round(item.calories * quantityRatio);
                 adjustedItemsSimple.push({
                    ...item, originalQuantity, originalCalories: item.calories, unit,
                    adjustedQuantity: finalAdjustedQuantity, adjustedCalories: finalAdjustedCalories,
                 });
             }
             const newTotalCaloriesSimple = adjustedItemsSimple.reduce((sum, item) => sum + item.adjustedCalories, 0);
             return res.status(200).json({
                status: "adjusted_simple",
                message: "Portions adjusted proportionally (weights were zero).",
                originalTotalCalories: totalSelectedCalories,
                newTotalCalories: newTotalCaloriesSimple,
                targetCalories: recommendedCalories,
                adjustedItems: adjustedItemsSimple
            });
        }
        // ---------------------------------------------

        // --- Apply Weighted Formula ---
        const adjustedItemsWeighted = [];
        for (const item of cartItems) {
            const { originalQuantity, unit } = parseServingSize(item.servingSize);
            let calculatedNewQuantity;

            if (item.calories === 0) {
                calculatedNewQuantity = originalQuantity;
            } else {
                // Always apply the formula
                calculatedNewQuantity = (item.adjustmentWeight / totalAdjustmentWeight) * 
                    (recommendedCalories / item.calories) * originalQuantity;
            }

            const adjustedQuantity = MROUND(calculatedNewQuantity, 0.25);
            const finalAdjustedQuantity = (adjustedQuantity <= 0 && originalQuantity > 0) ? 0.25 : adjustedQuantity;
            const quantityRatio = originalQuantity > 0 ? (finalAdjustedQuantity / originalQuantity) : 0;
            const finalAdjustedCalories = Math.round(item.calories * quantityRatio);

            adjustedItemsWeighted.push({
                ...item,
                originalQuantity,
                originalCalories: item.calories,
                unit,
                adjustedQuantity: finalAdjustedQuantity,
                adjustedCalories: finalAdjustedCalories,
            });
        }

        const newTotalCaloriesWeighted = adjustedItemsWeighted.reduce((sum, item) => sum + item.adjustedCalories, 0);
        const totalPercentage = (totalAdjustmentWeight / 100);

        // Return response with adjustments and alert if needed
        res.status(200).json({
            status: "adjusted", // Always "adjusted" since we're always calculating
            message: "Portions calculated",
            alert: totalSelectedCalories < recommendedCalories ? "Balance your meal by adding more dishes." : undefined,
            originalTotalCalories: totalSelectedCalories,
            newTotalCalories: newTotalCaloriesWeighted,
            targetCalories: recommendedCalories,
            totalPercentage: totalPercentage * 100,
            adjustedItems: adjustedItemsWeighted,
            isBelowTarget: totalSelectedCalories < recommendedCalories // Added flag for frontend
        });

    } catch (error) {
        console.error("Error adjusting meal portions:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};