const client = require('../utils/sanityClient'); 
const { calculateAllMetrics } = require('../models/onboardingModel.js'); 
const Onboarding = require('../models/onboardingModel.js').Onboarding; 
// Import MROUND if it's in a separate helper file
// const { MROUND } = require('../utils/mathHelpers'); 

// --- Helper Functions (Include or import these) ---

/**
 * Parses a serving size string (e.g., "0.5 cup") into its parts. More robust.
 * Handles numbers, decimals, fractions like "1/2".
 * @param {string | number} servingSizeString - The string or number to parse.
 * @returns {{baseQuantity: number, unit: string}}
 */
function parseServingSize(servingSizeString) {
    const defaults = { baseQuantity: 1, unit: 'unit(s)' };
    
    // Handle if input is already a number
    if (typeof servingSizeString === 'number' && !isNaN(servingSizeString)) {
        return { baseQuantity: servingSizeString, unit: defaults.unit };
    }

    if (!servingSizeString || typeof servingSizeString !== 'string') {
        console.warn(`Invalid serving size input type: ${typeof servingSizeString}. Using defaults.`);
        return defaults;
    }

    const cleanedString = servingSizeString.trim();
    // Regex to capture optional quantity (number, decimal, fraction like x/y) and the rest as unit
    const match = cleanedString.match(/^([\d.\/]+)?\s*(.*)?$/);
    
    let quantity = defaults.baseQuantity; // Default quantity
    let unit = cleanedString; // Default unit is the whole string if no quantity found

    if (match && match[1]) { // If a numeric-like part was found at the beginning
        const quantityPart = match[1];
        unit = match[2] ? match[2].trim() : defaults.unit; // The rest is the unit, or default

        // Handle fractions like "1/2"
        if (quantityPart.includes('/') && !quantityPart.startsWith('/')) { // Ensure it's not just "/unit"
            const fractionParts = quantityPart.split('/');
            if (fractionParts.length === 2 && fractionParts[0] && fractionParts[1]) {
                const num = parseFloat(fractionParts[0]);
                const den = parseFloat(fractionParts[1]);
                if (!isNaN(num) && !isNaN(den) && den !== 0) {
                    quantity = num / den;
                } else {
                    console.warn(`Invalid fraction format in serving size: "${servingSizeString}". Using default quantity.`);
                    quantity = defaults.baseQuantity; // Invalid fraction
                }
            } else {
                 console.warn(`Invalid fraction format in serving size: "${servingSizeString}". Using default quantity.`);
                quantity = defaults.baseQuantity; // Invalid fraction format
            }
        }
        // Handle decimals or whole numbers
        else {
            const parsedQty = parseFloat(quantityPart);
            if (!isNaN(parsedQty)) {
                quantity = parsedQty;
            } else {
                 console.warn(`Invalid quantity format in serving size: "${servingSizeString}". Using default quantity.`);
                quantity = defaults.baseQuantity; // Invalid number
            }
        }
        // If unit was empty but quantity existed, use default unit
        if (!unit) unit = defaults.unit;

    } else {
        // If no numeric part found at the beginning, assume quantity is 1
        quantity = defaults.baseQuantity;
        unit = cleanedString || defaults.unit; // Use the whole string as unit or default
    }

    // Ensure unit is never empty if quantity is valid
    if (!unit) {
        unit = defaults.unit;
    }

    return { baseQuantity: quantity, unit: unit };
}


/**
 * Calculates the total quantity based on base serving size and number of servings.
 * @param {string | number} servingSizeInput - e.g., "0.5 Cup" or 0.5
 * @param {number} numOfServings - e.g., 2
 * @returns {{totalQuantity: number, unit: string}} - e.g., { totalQuantity: 1, unit: "Cup" }
 */
function calculateTotalQuantity(servingSizeInput, numOfServings = 1) {
    const { baseQuantity, unit } = parseServingSize(servingSizeInput);
    const servings = typeof numOfServings === 'number' && numOfServings > 0 ? numOfServings : 1;
    // Round total quantity slightly to avoid floating point issues
    const totalQuantity = parseFloat((baseQuantity * servings).toFixed(4)); 
    return { totalQuantity, unit };
}

/**
 * Implements the Excel MROUND function.
 * @param {number} number - The number to round.
 * @param {number} multiple - The multiple to round to (e.g., 0.25).
 * @returns {number}
 */
function MROUND(number, multiple) {
    if (multiple === 0) return 0;
    if (isNaN(number) || isNaN(multiple)) return 0; // Handle NaN inputs
    const rounded = Math.round(number / multiple) * multiple;
    // Use parseFloat and toFixed to handle potential floating point inaccuracies 
    // Adjust decimal places if needed (e.g., toFixed(2) for 2 decimal places)
    return parseFloat(rounded.toFixed(4)); 
}

// ---------------------------------------------------

const MEAL_CALORIE_DISTRIBUTION = {
    Breakfast: 0.25, 
    Lunch: 0.30,     
    Dinner: 0.30     
};

// --- Your getBuilderItems function (No changes needed here) ---
exports.getBuilderItems = async (req, res) => {
    try {
        const { meal_time, cuisine } = req.query;

        // --- Input Validation ---
        if (!meal_time || !cuisine) {
            return res.status(400).json({ message: "meal_time and cuisine query parameters are required." });
        }
        if (!['Breakfast', 'Lunch', 'Dinner'].includes(meal_time)) {
            return res.status(400).json({ message: "Invalid meal_time parameter (Use 'Breakfast', 'Lunch', or 'Dinner')." });
        }
        if (!['Indian', 'Global'].includes(cuisine)) {
            return res.status(400).json({ message: "Invalid cuisine parameter." });
        }

        // --- Get User Data & Calculate DAILY Recommended Calories ---
        const userId = req.user.userId; // Make sure req.user is populated by auth middleware
        const onboardingData = await Onboarding.findOne({ userId }).lean();
        if (!onboardingData) {
            return res.status(404).json({ message: "Onboarding data not found for user." });
        }
        const metrics = calculateAllMetrics(onboardingData);
        const dailyRecommendedCalories = metrics.recommendedCalories; 
        if (!dailyRecommendedCalories || dailyRecommendedCalories <= 0) {
             console.warn(`Calculated dailyRecommendedCalories is invalid (${dailyRecommendedCalories}) for userId: ${userId}`);
             // Depending on requirements, you might return an error or a default value
             // return res.status(500).json({ message: "Could not calculate valid daily recommended calories." });
        }


        // --- Calculate MEAL-SPECIFIC Recommended Calories ---
        const mealPercentage = MEAL_CALORIE_DISTRIBUTION[meal_time];
        if (typeof mealPercentage !== 'number') {
            console.error(`Invalid meal_time "${meal_time}" for calorie distribution.`);
            return res.status(400).json({ message: "Invalid meal_time provided for calorie calculation." });
        }
        // Ensure daily calories is a positive number before calculation
        const validDailyCalories = dailyRecommendedCalories > 0 ? dailyRecommendedCalories : 0;
        const mealSpecificRecommendedCalories = Math.round(validDailyCalories * mealPercentage);

        // --- Determine mealTime filter for Sanity ---
        const sanityMealTimeFilter = (meal_time === 'Lunch' || meal_time === 'Dinner') ? 'Lunch/Dinner' : 'Breakfast';

        // --- Fetch Builder Items from Sanity ---
        const query = `
          *[_type == "mealBuilderItem" &&
            mealTime == $sanityMealTimeFilter && 
            cuisine == $cuisine] {
              _id, name, calories, servingSize, section, mealTime, cuisine,
              adjustmentWeight, // This should be the 'name' of your schema field
              "recipeLink": recipeLink->{_id, name}
          } | order(section asc, name asc)
        `;
        const params = { sanityMealTimeFilter, cuisine };
        const items = await client.fetch(query, params);
       
        // --- Group items by section ---
        const groupedItems = items.reduce((acc, item) => {
            const section = item.section || 'Uncategorized';
            if (!acc[section]) acc[section] = [];
            acc[section].push(item);
            return acc;
        }, {});
        
        // --- Send Response ---
        res.status(200).json({
            recommended_calories: mealSpecificRecommendedCalories, 
            grouped_items: groupedItems
        });

    } catch (error) {
        console.error("Error fetching meal builder items:", error);
        // Provide more context in error logging if possible
        res.status(500).json({ error: "Internal Server Error fetching items." });
    }
};


// --- UPDATED adjustMealPortions FUNCTION (Handles numOfServings) ---
exports.adjustMealPortions = async (req, res) => {
    try {
        const { cartItems: inputCartItems, recommendedCalories } = req.body;

        // --- Input Validation ---
        if (!Array.isArray(inputCartItems) || inputCartItems.length === 0) {
            return res.status(400).json({ message: "cartItems array required." });
        }
        if (typeof recommendedCalories !== 'number' || recommendedCalories <= 0) {
            // It might be valid to have a target of 0 if calculated that way, adjust if needed
            return res.status(400).json({ message: "Valid positive recommendedCalories required." });
        }
        
        // --- Process Input Cart Items to Calculate Totals ---
        const processedCartItems = inputCartItems.map(item => {
            // Validate and sanitize numOfServings
            const servings = (typeof item.numOfServings === 'number' && item.numOfServings > 0) ? item.numOfServings : 1;
            // Validate and sanitize base calories
            const baseCalories = (typeof item.calories === 'number' && item.calories >= 0) ? item.calories : 0;
            // Calculate total quantity and get unit
            const { totalQuantity, unit } = calculateTotalQuantity(item.servingSize, servings);
            // Validate and sanitize adjustmentWeight
            const weight = (typeof item.adjustmentWeight === 'number' && item.adjustmentWeight >= 0) ? item.adjustmentWeight : 0;
            
            return {
                // Keep original input fields for reference in response
                _id: item._id, 
                name: item.name, 
                originalServingSize: item.servingSize, // Base serving size string
                baseCalories: baseCalories, // Base calories per serving
                numOfServings: servings, // Validated number of servings
                recipeLink: item.recipeLink, 
                section: item.section,
                cuisine: item.cuisine,
                mealTime: item.mealTime,

                // Calculated total values used for adjustments
                totalCalories: baseCalories * servings, 
                totalQuantity: totalQuantity, 
                unit: unit, 
                adjustmentWeight: weight // Use validated weight
            };
        });
        // --------------------------------------------------

        // --- Calculate Totals using Processed Data ---
        const totalSelectedCalories = processedCartItems.reduce((sum, item) => sum + item.totalCalories, 0);
        // Use the base adjustmentWeight from the items for the sum
        const totalAdjustmentWeight = processedCartItems.reduce((sum, item) => sum + item.adjustmentWeight, 0); 
        
        // --- Apply Rules ---
        const alertMessage = (totalAdjustmentWeight < 100 && totalAdjustmentWeight > 0) ? "Balance your meal by adding more dishes." : undefined; // Only alert if > 0 and < 100
        // Use 100 if sum is less than 100, but allow 0 if all items have 0 weight
        const effectiveTotalAdjustmentWeight = (totalAdjustmentWeight < 100 && totalAdjustmentWeight > 0) ? 100 : totalAdjustmentWeight; 
        
        // --- Case 1: AT Target Calories ---
        if (totalSelectedCalories === recommendedCalories) {
            const adjustedItemsNoChange = processedCartItems.map(item => ({ 
                _id: item._id, name: item.name, 
                originalCalories: item.totalCalories, // Reflects total selected
                originalQuantity: item.totalQuantity, // Reflects total selected
                originalServingSize: item.originalServingSize, // Base serving size
                numOfServings: item.numOfServings, // Number selected
                unit: item.unit,
                adjustedQuantity: item.totalQuantity, // No change
                adjustedCalories: item.totalCalories, // No change
                servingSizeChange: 0,
                newServingSizeString: `${item.totalQuantity} ${item.unit}`,
                recipeLink: item.recipeLink, section: item.section,
                cuisine: item.cuisine, mealTime: item.mealTime,
            }));
             return res.status(200).json({
                status: "no_change", message: "Total calories already match target.", alert: alertMessage, 
                originalTotalCalories: totalSelectedCalories, newTotalCalories: totalSelectedCalories,
                targetCalories: recommendedCalories, totalPercentage: totalAdjustmentWeight,
                adjustedItems: adjustedItemsNoChange, isBelowTarget: false
            });
        }

        // --- Case 2: BELOW Target Calories (Scale UP) ---
        if (totalSelectedCalories < recommendedCalories) {
            console.log("Total calories BELOW target. Performing simple proportional scaling UP.");
            // Avoid division by zero
            const scalingFactor = totalSelectedCalories > 0 ? (recommendedCalories / totalSelectedCalories) : 0;
            const adjustedItemsSimple = [];

            for (const item of processedCartItems) { 
                const originalQuantity = item.totalQuantity; 
                const originalCalories = item.totalCalories; 
                const unit = item.unit;

                const calculatedNewQuantity = originalQuantity * scalingFactor;
                const adjustedQuantity = MROUND(calculatedNewQuantity, 0.25);
                // Ensure minimum is based on base quantity, not just 0.25 absolute
                const baseParsed = parseServingSize(item.originalServingSize);
                const minQuantity = baseParsed.baseQuantity > 0 ? 0.25 : 0; // Min is 0.25 only if base > 0
                const finalAdjustedQuantity = (adjustedQuantity <= 0 && originalQuantity > 0) ? minQuantity : adjustedQuantity;
                
                const quantityRatio = originalQuantity > 0 ? (finalAdjustedQuantity / originalQuantity) : 0;
                const finalAdjustedCalories = Math.round(originalCalories * quantityRatio); 
                const servingSizeChange = finalAdjustedQuantity - originalQuantity;

                adjustedItemsSimple.push({
                    _id: item._id, name: item.name, 
                    originalCalories: originalCalories, originalQuantity: originalQuantity, 
                    originalServingSize: item.originalServingSize, numOfServings: item.numOfServings, 
                    unit: unit, adjustedQuantity: finalAdjustedQuantity, 
                    adjustedCalories: finalAdjustedCalories, servingSizeChange: parseFloat(servingSizeChange.toFixed(2)), 
                    newServingSizeString: `${finalAdjustedQuantity} ${unit}`,
                    recipeLink: item.recipeLink, section: item.section,
                    cuisine: item.cuisine, mealTime: item.mealTime,
                });
            }
            const newTotalCaloriesSimple = adjustedItemsSimple.reduce((sum, item) => sum + item.adjustedCalories, 0);
            return res.status(200).json({
                status: "adjusted_up", message: "Portions scaled up to meet calorie target.", alert: alertMessage,
                originalTotalCalories: totalSelectedCalories, newTotalCalories: newTotalCaloriesSimple,
                targetCalories: recommendedCalories, totalPercentage: totalAdjustmentWeight,
                adjustedItems: adjustedItemsSimple, isBelowTarget: true
            });
        }

        // --- Case 3: ABOVE Target Calories (Scale DOWN) ---
        
        // Edge Case: Total Weight is Zero or less (Should use simple scaling down)
        if (effectiveTotalAdjustmentWeight <= 0) {
             console.warn(`Total Adjustment Weight is ${totalAdjustmentWeight}. Performing simple proportional scaling DOWN.`);
            // Avoid division by zero
            const scalingFactor = totalSelectedCalories > 0 ? (recommendedCalories / totalSelectedCalories) : 0;
            const adjustedItemsSimple = [];
             for (const item of processedCartItems) { 
                 const originalQuantity = item.totalQuantity;
                 const originalCalories = item.totalCalories;
                 const unit = item.unit;
                 
                 const calculatedNewQuantity = originalQuantity * scalingFactor;
                 const adjustedQuantity = MROUND(calculatedNewQuantity, 0.25);
                 const baseParsed = parseServingSize(item.originalServingSize);
                 const minQuantity = baseParsed.baseQuantity > 0 ? 0.25 : 0; 
                 const finalAdjustedQuantity = (adjustedQuantity <= 0 && originalQuantity > 0) ? minQuantity : adjustedQuantity;
                 
                 const quantityRatio = originalQuantity > 0 ? (finalAdjustedQuantity / originalQuantity) : 0;
                 const finalAdjustedCalories = Math.round(originalCalories * quantityRatio);
                 const servingSizeChange = finalAdjustedQuantity - originalQuantity;

                 adjustedItemsSimple.push({
                     _id: item._id, name: item.name, 
                     originalCalories: originalCalories, originalQuantity: originalQuantity, 
                     originalServingSize: item.originalServingSize, numOfServings: item.numOfServings, 
                     unit: unit, adjustedQuantity: finalAdjustedQuantity, 
                     adjustedCalories: finalAdjustedCalories, servingSizeChange: parseFloat(servingSizeChange.toFixed(2)), 
                     newServingSizeString: `${finalAdjustedQuantity} ${unit}`,
                     recipeLink: item.recipeLink, section: item.section,
                     cuisine: item.cuisine, mealTime: item.mealTime,
                 });
            }
             const newTotalCaloriesSimple = adjustedItemsSimple.reduce((sum, item) => sum + item.adjustedCalories, 0);
             return res.status(200).json({
                 status: "adjusted_simple_down", message: "Portions adjusted proportionally (weights were zero or invalid).", alert: alertMessage,
                 originalTotalCalories: totalSelectedCalories, newTotalCalories: newTotalCaloriesSimple,
                 targetCalories: recommendedCalories, totalPercentage: totalAdjustmentWeight,
                 adjustedItems: adjustedItemsSimple, isBelowTarget: false
            });
        }
        
        // Apply Weighted Formula (Only for scaling DOWN and when weight > 0)
        const adjustedItemsWeighted = [];
        for (const item of processedCartItems) { 
            const originalQuantity = item.totalQuantity;
            const originalCalories = item.totalCalories; 
            const unit = item.unit;
            let calculatedNewQuantity;

            // Use item.adjustmentWeight (base weight) and originalCalories (total calories)
            // Skip adjustment if base weight is 0 or calories are 0
            if (originalCalories === 0 || item.adjustmentWeight <= 0) {
                calculatedNewQuantity = originalQuantity; 
            } else {
                // Formula uses base adjustmentWeight, target calories, total calories, total quantity
                calculatedNewQuantity = (item.adjustmentWeight / effectiveTotalAdjustmentWeight) * (recommendedCalories / originalCalories) * originalQuantity;
            }

            const adjustedQuantity = MROUND(calculatedNewQuantity, 0.25);
            const baseParsed = parseServingSize(item.originalServingSize);
            const minQuantity = baseParsed.baseQuantity > 0 ? 0.25 : 0; 
            const finalAdjustedQuantity = (adjustedQuantity <= 0 && originalQuantity > 0) ? minQuantity : adjustedQuantity;
            
            const quantityRatio = originalQuantity > 0 ? (finalAdjustedQuantity / originalQuantity) : 0;
            const finalAdjustedCalories = Math.round(originalCalories * quantityRatio); 
            const servingSizeChange = finalAdjustedQuantity - originalQuantity;

            adjustedItemsWeighted.push({
                  _id: item._id, name: item.name, 
                  originalCalories: originalCalories, originalQuantity: originalQuantity, 
                  originalServingSize: item.originalServingSize, numOfServings: item.numOfServings, 
                  unit: unit, adjustedQuantity: finalAdjustedQuantity, 
                  adjustedCalories: finalAdjustedCalories, servingSizeChange: parseFloat(servingSizeChange.toFixed(2)), 
                  newServingSizeString: `${finalAdjustedQuantity} ${unit}`,
                  recipeLink: item.recipeLink, section: item.section,
                  cuisine: item.cuisine, mealTime: item.mealTime,
            });
        }
        
        const newTotalCaloriesWeighted = adjustedItemsWeighted.reduce((sum, item) => sum + item.adjustedCalories, 0);
        return res.status(200).json({
            status: "adjusted_down", message: "Portions adjusted down to meet calorie target.", alert: alertMessage, 
            originalTotalCalories: totalSelectedCalories, newTotalCalories: newTotalCaloriesWeighted,
            targetCalories: recommendedCalories, totalPercentage: totalAdjustmentWeight, 
            adjustedItems: adjustedItemsWeighted, isBelowTarget: false 
        });

    } catch (error) {
        console.error("Error adjusting meal portions:", error);
        res.status(500).json({ error: "Internal Server Error during adjustment." });
    }
};

