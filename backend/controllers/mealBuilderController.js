const client = require('../utils/sanityClient'); // Ensure this path points to your sanityClient.js file
const { calculateAllMetrics } = require('../models/onboardingModel.js'); // Ensure this path is correct
const Onboarding = require('../models/onboardingModel.js').Onboarding; // Ensure this path is correct

// --- Helper Functions (Added from our last discussion) ---

/**
 * Parses a serving size string (e.g., "0.5 cup") into its parts.
 * @param {string} servingSize - The string to parse.
 * @returns {{originalQuantity: number, unit: string}}
 */
function parseServingSize(servingSize) {
    if (typeof servingSize === 'number') {
        // Handle if it's already a number
        return { originalQuantity: servingSize, unit: 'unit' };
    }
    if (typeof servingSize !== 'string' || !servingSize) {
        // Fallback for missing or invalid data
        return { originalQuantity: 1, unit: 'unit' }; 
    }
    
    // Regex to find the first number and the rest of the string (e.g., "0.5 cup", "1 piece")
    const match = servingSize.match(/^([0-9.]+)\s*(.*)$/);
    
    if (match) {
        return { 
            originalQuantity: parseFloat(match[1]), 
            unit: match[2] || 'unit' // e.g., "cup", "g", "piece"
        };
    }
    
    // Fallback if no number is found (e.g., "piece")
    return { originalQuantity: 1, unit: servingSize };
}

/**
 * Implements the Excel MROUND function, as seen in the doc
 * @param {number} number - The number to round.
 * @param {number} multiple - The multiple to round to (e.g., 0.25).
 * @returns {number}
 */
function MROUND(number, multiple) {
    if (multiple === 0) {
        return 0;
    }
    // Ensure precision by rounding the result of the division
    return Math.round(number / multiple) * multiple;
}

// ---------------------------------------------------

const MEAL_CALORIE_DISTRIBUTION = {
    Breakfast: 0.25, 
    Lunch: 0.30,     
    Dinner: 0.30     
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

// --- THIS IS THE FIXED VERSION ---
// --- (Make sure MROUND and parseServingSize are imported from your helpers) ---

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
        
        const totalSelectedCalories = cartItems.reduce((sum, item) => sum + item.calories, 0);
        
        // This is the "sum of % of recommended calories"
        const totalAdjustmentWeight = cartItems.reduce((sum, item) => sum + (item.adjustmentWeight || 0), 0);


        // --- CORRECTED LOGIC FOR CONDITIONS 1 & 2 ---
        
        // Condition 2: "If <100% add alert..." (Based on sum of %)
        const alertMessage = (totalAdjustmentWeight < 100) ? "Balance your meal by adding more dishes." : undefined;
        
        // Condition 1: "if sum of ... <100%, use 100%..." (Based on sum of %)
        const effectiveTotalAdjustmentWeight = Math.max(totalAdjustmentWeight, 100);

        // --- End of Corrected Logic ---


        // --- Case 1: AT Target Calories ---
        if (totalSelectedCalories === recommendedCalories) {
            const originalItemsWithParsedQty = cartItems.map(item => {
                const { originalQuantity, unit } = parseServingSize(item.servingSize);
                return { 
                    ...item, 
                    originalQuantity, // Added for consistency
                    originalCalories: item.calories, // Added for consistency
                    unit,
                    adjustedQuantity: originalQuantity, 
                    adjustedCalories: item.calories 
                };
            });
            return res.status(200).json({
                status: "no_change",
                message: "Total calories already match target.",
                alert: alertMessage, // Correctly applies alert
                originalTotalCalories: totalSelectedCalories,
                newTotalCalories: totalSelectedCalories,
                targetCalories: recommendedCalories,
                totalPercentage: totalAdjustmentWeight,
                adjustedItems: originalItemsWithParsedQty,
                isBelowTarget: false
            });
        }

        // --- Case 2: BELOW Target Calories (Scale UP) ---
        if (totalSelectedCalories < recommendedCalories) {
            console.log("Total calories BELOW target. Performing simple proportional scaling UP.");
            
            const scalingFactor = totalSelectedCalories > 0 ? (recommendedCalories / totalSelectedCalories) : 0;
            const adjustedItemsSimple = [];

            for (const item of cartItems) {
                const { originalQuantity, unit } = parseServingSize(item.servingSize);
                const calculatedNewQuantity = originalQuantity * scalingFactor;
                const adjustedQuantity = MROUND(calculatedNewQuantity, 0.25);
                const finalAdjustedQuantity = (adjustedQuantity <= 0 && originalQuantity > 0) ? 0.25 : adjustedQuantity;
                const quantityRatio = originalQuantity > 0 ? (finalAdjustedQuantity / originalQuantity) : 0;
                const finalAdjustedCalories = Math.round(item.calories * quantityRatio);

                adjustedItemsSimple.push({
                    ...item, 
                    originalQuantity, 
                    originalCalories: item.calories, 
                    unit,
                    adjustedQuantity: finalAdjustedQuantity, 
                    adjustedCalories: finalAdjustedCalories,
                });
            }
            const newTotalCaloriesSimple = adjustedItemsSimple.reduce((sum, item) => sum + item.adjustedCalories, 0);
            
            return res.status(200).json({
                status: "adjusted_up",
                message: "Portions scaled up to meet calorie target.",
                alert: alertMessage, // Correctly applies alert
                originalTotalCalories: totalSelectedCalories,
                newTotalCalories: newTotalCaloriesSimple,
                targetCalories: recommendedCalories,
                totalPercentage: totalAdjustmentWeight,
                adjustedItems: adjustedItemsSimple,
                isBelowTarget: true
            });
        }

        // --- Case 3: ABOVE Target Calories (Scale DOWN) ---
        
        // --- Handle Edge Case: Total Weight is Zero (for down-scaling) ---
        if (effectiveTotalAdjustmentWeight === 0) {
            console.warn("Total Adjustment Weight is zero. Performing simple proportional scaling DOWN.");
            const scalingFactor = totalSelectedCalories > 0 ? (recommendedCalories / totalSelectedCalories) : 0;
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
                status: "adjusted_simple_down",
                message: "Portions adjusted proportionally (weights were zero).",
                alert: alertMessage, // Correctly applies alert
                originalTotalCalories: totalSelectedCalories,
                newTotalCalories: newTotalCaloriesSimple,
                targetCalories: recommendedCalories,
                totalPercentage: totalAdjustmentWeight,
                adjustedItems: adjustedItemsSimple,
                isBelowTarget: false
            });
        }
        
        // --- Apply Weighted Formula (Only for scaling DOWN) ---
        const adjustedItemsWeighted = [];
        for (const item of cartItems) {
            const { originalQuantity, unit } = parseServingSize(item.servingSize);
            let calculatedNewQuantity;

            if (item.calories === 0 || (item.adjustmentWeight || 0) === 0) {
                calculatedNewQuantity = originalQuantity; // Don't adjust
            } else {
                // Formula from your doc, using effectiveTotalAdjustmentWeight
                calculatedNewQuantity = (item.adjustmentWeight / effectiveTotalAdjustmentWeight) * (recommendedCalories / item.calories) * originalQuantity;
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

        // --- Final Response (for weighted down-scaling) ---
        res.status(200).json({
            status: "adjusted_down",
            message: "Portions adjusted down to meet calorie target.",
            alert: alertMessage, // Correctly applies alert
            originalTotalCalories: totalSelectedCalories,
            newTotalCalories: newTotalCaloriesWeighted,
            targetCalories: recommendedCalories,
            totalPercentage: totalAdjustmentWeight, // Send the original sum
            adjustedItems: adjustedItemsWeighted,
            isBelowTarget: false 
        });

    } catch (error) {
        console.error("Error adjusting meal portions:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
};