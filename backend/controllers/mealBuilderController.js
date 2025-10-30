const client = require('../utils/sanityClient');
const { calculateAllMetrics } = require('../models/onboardingModel.js');
const Onboarding = require('../models/onboardingModel.js').Onboarding;

// --- Helper Functions ---

function parseServingSize(servingSizeString) {
    const defaults = { baseQuantity: 1, unit: 'unit(s)' };
    if (typeof servingSizeString === 'number' && !isNaN(servingSizeString)) {
        return { baseQuantity: servingSizeString, unit: defaults.unit };
    }
    if (!servingSizeString || typeof servingSizeString !== 'string') {
        return defaults;
    }

    const cleanedString = servingSizeString.trim();
    const match = cleanedString.match(/^([\d.\/]+)?\s*(.*)?$/);

    let quantity = defaults.baseQuantity;
    let unit = cleanedString;

    if (match && match[1]) {
        const quantityPart = match[1];
        unit = match[2] ? match[2].trim() : defaults.unit;

        if (quantityPart.includes('/') && !quantityPart.startsWith('/')) {
            const fractionParts = quantityPart.split('/');
            if (fractionParts.length === 2 && fractionParts[0] && fractionParts[1]) {
                const num = parseFloat(fractionParts[0]);
                const den = parseFloat(fractionParts[1]);
                if (!isNaN(num) && !isNaN(den) && den !== 0) {
                    quantity = num / den;
                }
            }
        } else {
            const parsedQty = parseFloat(quantityPart);
            if (!isNaN(parsedQty)) {
                quantity = parsedQty;
            }
        }

        if (!unit) unit = defaults.unit;
    } else {
        quantity = defaults.baseQuantity;
        unit = cleanedString || defaults.unit;
    }

    if (!unit) {
        unit = defaults.unit;
    }

    return { baseQuantity: quantity, unit: unit };
}

function calculateTotalQuantity(servingSizeInput, numOfServings = 1) {
    const { baseQuantity, unit } = parseServingSize(servingSizeInput);
    const servings = typeof numOfServings === 'number' && numOfServings > 0 ? numOfServings : 1;
    const totalQuantity = parseFloat((baseQuantity * servings).toFixed(4));
    return { totalQuantity, unit };
}

function MROUND(number, multiple) {
    if (multiple === 0) return 0;
    if (isNaN(number) || isNaN(multiple)) return 0;
    const rounded = Math.round(number / multiple) * multiple;
    return parseFloat(rounded.toFixed(4));
}

// 🧩 NEW HELPER: Format Serving String
function formatServingString(finalAdjustedQuantity, unit, itemName) {
    const unspecifiedUnits = ['unit', 'units', 'unit(s)', '', null, undefined];
    const lowerUnit = (unit || '').toLowerCase().trim();

    // Detect if itemName already starts with a number like "1 egg roll"
    const nameHasLeadingNumber = /^\d/.test(itemName?.trim() || '');

    if (unspecifiedUnits.includes(lowerUnit)) {
        if (nameHasLeadingNumber) {
            return `${finalAdjustedQuantity} unit of ${itemName}`;
        } else {
            return `${finalAdjustedQuantity} unit of ${itemName}`;
        }
    }

    return `${finalAdjustedQuantity} ${unit}`;
}

// ---------------------------------------------------

const MEAL_CALORIE_DISTRIBUTION = {
    Breakfast: 0.25,
    Lunch: 0.30,
    Dinner: 0.30
};

// --- getBuilderItems ---
exports.getBuilderItems = async (req, res) => {
    try {
        const { meal_time, cuisine } = req.query;
        if (!meal_time || !cuisine) {
            return res.status(400).json({ message: "meal_time and cuisine query parameters are required." });
        }
        if (!['Breakfast', 'Lunch', 'Dinner'].includes(meal_time)) {
            return res.status(400).json({ message: "Invalid meal_time parameter (Use 'Breakfast', 'Lunch', or 'Dinner')." });
        }
        if (!['Indian', 'Global'].includes(cuisine)) {
            return res.status(400).json({ message: "Invalid cuisine parameter." });
        }

        const userId = req.user.userId;
        const onboardingData = await Onboarding.findOne({ userId }).lean();
        if (!onboardingData) {
            return res.status(404).json({ message: "Onboarding data not found for user." });
        }

        const metrics = calculateAllMetrics(onboardingData);
        const dailyRecommendedCalories = metrics.recommendedCalories;
        const mealPercentage = MEAL_CALORIE_DISTRIBUTION[meal_time];
        const mealSpecificRecommendedCalories = Math.round(dailyRecommendedCalories * mealPercentage);

        const sanityMealTimeFilter = (meal_time === 'Lunch' || meal_time === 'Dinner') ? 'Lunch/Dinner' : 'Breakfast';

        const query = `
          *[_type == "mealBuilderItem" &&
            mealTime == $sanityMealTimeFilter &&
            cuisine == $cuisine] {
              _id, name, calories, servingSize, section, mealTime, cuisine,
              adjustmentWeight,
              "recipeLink": recipeLink->{_id, name}
          } | order(section asc, name asc)
        `;
        const params = { sanityMealTimeFilter, cuisine };
        const items = await client.fetch(query, params);

        const groupedItems = items.reduce((acc, item) => {
            const section = item.section || 'Uncategorized';
            if (!acc[section]) acc[section] = [];
            acc[section].push(item);
            return acc;
        }, {});

        res.status(200).json({
            recommended_calories: mealSpecificRecommendedCalories,
            grouped_items: groupedItems
        });

    } catch (error) {
        console.error("Error fetching meal builder items:", error);
        res.status(500).json({ error: "Internal Server Error fetching items." });
    }
};

// --- adjustMealPortions ---
exports.adjustMealPortions = async (req, res) => {
    try {
        const { cartItems: inputCartItems, recommendedCalories } = req.body;

        if (!Array.isArray(inputCartItems) || inputCartItems.length === 0) {
            return res.status(400).json({ message: "cartItems array required." });
        }
        if (typeof recommendedCalories !== 'number' || recommendedCalories <= 0) {
            return res.status(400).json({ message: "Valid positive recommendedCalories required." });
        }

        const processedCartItems = inputCartItems.map(item => {
            const servings = (typeof item.numOfServings === 'number' && item.numOfServings > 0) ? item.numOfServings : 1;
            const baseCalories = (typeof item.calories === 'number' && item.calories >= 0) ? item.calories : 0;
            const { totalQuantity, unit } = calculateTotalQuantity(item.servingSize, servings);
            const weight = (typeof item.adjustmentWeight === 'number' && item.adjustmentWeight >= 0) ? item.adjustmentWeight : 0;

            return {
                _id: item._id,
                name: item.name,
                originalServingSize: item.servingSize,
                baseCalories,
                numOfServings: servings,
                recipeLink: item.recipeLink,
                section: item.section,
                cuisine: item.cuisine,
                mealTime: item.mealTime,
                totalCalories: baseCalories * servings,
                totalQuantity,
                unit,
                adjustmentWeight: weight
            };
        });

        const totalSelectedCalories = processedCartItems.reduce((sum, item) => sum + item.totalCalories, 0);
        const totalAdjustmentWeight = processedCartItems.reduce((sum, item) => sum + item.adjustmentWeight, 0);
        const alertMessage = (totalAdjustmentWeight < 100 && totalAdjustmentWeight > 0)
            ? "Balance your meal by adding more dishes."
            : undefined;
        const effectiveTotalAdjustmentWeight = (totalAdjustmentWeight < 100 && totalAdjustmentWeight > 0)
            ? 100
            : totalAdjustmentWeight;

        // --- CASE 1: At Target Calories ---
        if (totalSelectedCalories === recommendedCalories) {
            const adjustedItemsNoChange = processedCartItems.map(item => ({
                _id: item._id,
                name: item.name,
                originalCalories: item.totalCalories,
                originalQuantity: item.totalQuantity,
                originalServingSize: item.originalServingSize,
                numOfServings: item.numOfServings,
                unit: item.unit,
                adjustedQuantity: item.totalQuantity,
                adjustedCalories: item.totalCalories,
                servingSizeChange: 0,
                newServingSizeString: formatServingString(item.totalQuantity, item.unit, item.name),
                recipeLink: item.recipeLink,
                section: item.section,
                cuisine: item.cuisine,
                mealTime: item.mealTime,
            }));

            return res.status(200).json({
                status: "no_change",
                message: "Total calories already match target.",
                alert: alertMessage,
                originalTotalCalories: totalSelectedCalories,
                newTotalCalories: totalSelectedCalories,
                targetCalories: recommendedCalories,
                totalPercentage: totalAdjustmentWeight,
                adjustedItems: adjustedItemsNoChange,
                isBelowTarget: false
            });
        }

        // --- CASE 2: BELOW Target (Scale Up) ---
        if (totalSelectedCalories < recommendedCalories) {
            const scalingFactor = totalSelectedCalories > 0 ? (recommendedCalories / totalSelectedCalories) : 0;
            const adjustedItemsSimple = [];

            for (const item of processedCartItems) {
                const originalQuantity = item.totalQuantity;
                const originalCalories = item.totalCalories;
                const unit = item.unit;
                const calculatedNewQuantity = originalQuantity * scalingFactor;
                const adjustedQuantity = MROUND(calculatedNewQuantity, 0.25);
                const finalAdjustedQuantity = adjustedQuantity <= 0 && originalQuantity > 0 ? 0.25 : adjustedQuantity;
                const quantityRatio = originalQuantity > 0 ? (finalAdjustedQuantity / originalQuantity) : 0;
                const finalAdjustedCalories = Math.round(originalCalories * quantityRatio);
                const servingSizeChange = finalAdjustedQuantity - originalQuantity;

                adjustedItemsSimple.push({
                    _id: item._id,
                    name: item.name,
                    originalCalories,
                    originalQuantity,
                    originalServingSize: item.originalServingSize,
                    numOfServings: item.numOfServings,
                    unit,
                    adjustedQuantity: finalAdjustedQuantity,
                    adjustedCalories: finalAdjustedCalories,
                    servingSizeChange: parseFloat(servingSizeChange.toFixed(2)),
                    newServingSizeString: formatServingString(finalAdjustedQuantity, unit, item.name),
                    recipeLink: item.recipeLink,
                    section: item.section,
                    cuisine: item.cuisine,
                    mealTime: item.mealTime,
                });
            }

            const newTotalCaloriesSimple = adjustedItemsSimple.reduce((sum, item) => sum + item.adjustedCalories, 0);
            return res.status(200).json({
                status: "adjusted_up",
                message: "Portions scaled up to meet calorie target.",
                alert: alertMessage,
                originalTotalCalories: totalSelectedCalories,
                newTotalCalories: newTotalCaloriesSimple,
                targetCalories: recommendedCalories,
                totalPercentage: totalAdjustmentWeight,
                adjustedItems: adjustedItemsSimple,
                isBelowTarget: true
            });
        }

        // --- CASE 3: ABOVE Target (Scale Down Weighted) ---
        const adjustedItemsWeighted = [];
        for (const item of processedCartItems) {
            const originalQuantity = item.totalQuantity;
            const originalCalories = item.totalCalories;
            const unit = item.unit;

            let calculatedNewQuantity;
            if (originalCalories === 0 || item.adjustmentWeight <= 0) {
                calculatedNewQuantity = originalQuantity;
            } else {
                calculatedNewQuantity = (item.adjustmentWeight / effectiveTotalAdjustmentWeight) *
                    (recommendedCalories / originalCalories) * originalQuantity;
            }

            const adjustedQuantity = MROUND(calculatedNewQuantity, 0.25);
            const finalAdjustedQuantity = adjustedQuantity <= 0 && originalQuantity > 0 ? 0.25 : adjustedQuantity;
            const quantityRatio = originalQuantity > 0 ? (finalAdjustedQuantity / originalQuantity) : 0;
            const finalAdjustedCalories = Math.round(originalCalories * quantityRatio);
            const servingSizeChange = finalAdjustedQuantity - originalQuantity;

            adjustedItemsWeighted.push({
                _id: item._id,
                name: item.name,
                originalCalories,
                originalQuantity,
                originalServingSize: item.originalServingSize,
                numOfServings: item.numOfServings,
                unit,
                adjustedQuantity: finalAdjustedQuantity,
                adjustedCalories: finalAdjustedCalories,
                servingSizeChange: parseFloat(servingSizeChange.toFixed(2)),
                newServingSizeString: formatServingString(finalAdjustedQuantity, unit, item.name),
                recipeLink: item.recipeLink,
                section: item.section,
                cuisine: item.cuisine,
                mealTime: item.mealTime,
            });
        }

        const newTotalCaloriesWeighted = adjustedItemsWeighted.reduce((sum, item) => sum + item.adjustedCalories, 0);
        return res.status(200).json({
            status: "adjusted_down",
            message: "Portions adjusted down to meet calorie target.",
            alert: alertMessage,
            originalTotalCalories: totalSelectedCalories,
            newTotalCalories: newTotalCaloriesWeighted,
            targetCalories: recommendedCalories,
            totalPercentage: totalAdjustmentWeight,
            adjustedItems: adjustedItemsWeighted,
            isBelowTarget: false
        });

    } catch (error) {
        console.error("Error adjusting meal portions:", error);
        res.status(500).json({ error: "Internal Server Error during adjustment." });
    }
};
