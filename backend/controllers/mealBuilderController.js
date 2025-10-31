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
      const [num, den] = quantityPart.split('/').map(parseFloat);
      if (!isNaN(num) && !isNaN(den) && den !== 0) {
        quantity = num / den;
      }
    } else {
      const parsedQty = parseFloat(quantityPart);
      if (!isNaN(parsedQty)) quantity = parsedQty;
    }

    if (!unit) unit = defaults.unit;
  } else {
    quantity = defaults.baseQuantity;
    unit = cleanedString || defaults.unit;
  }

  if (!unit) unit = defaults.unit;
  return { baseQuantity: quantity, unit: unit };
}

function calculateTotalQuantity(servingSizeInput, numOfServings = 1) {
  const { baseQuantity, unit } = parseServingSize(servingSizeInput);
  const servings = numOfServings > 0 ? numOfServings : 1;
  return { totalQuantity: parseFloat((baseQuantity * servings).toFixed(4)), unit };
}

function MROUND(number, multiple) {
  if (multiple === 0) return 0;
  const rounded = Math.round(number / multiple) * multiple;
  return parseFloat(rounded.toFixed(4));
}

function formatServingString(finalAdjustedQuantity, unit, itemName) {
  const unspecifiedUnits = ['unit', 'units', 'unit(s)', '', null, undefined];
  const lowerUnit = (unit || '').toLowerCase().trim();
  if (unspecifiedUnits.includes(lowerUnit)) return `${finalAdjustedQuantity} unit of ${itemName}`;
  return `${finalAdjustedQuantity} ${unit}`;
}

// ---------------------------------------------------
const MEAL_CALORIE_DISTRIBUTION = {
  Breakfast: 0.25,
  Lunch: 0.3,
  Dinner: 0.3,
};

// ✅ Menu section sequences from Excel
const SECTION_ORDER_MAP = {
  Breakfast: {
    Indian: [
      'Dalia, Poha & Flattened Rice Dishes',
      'Rotis & Parathas',
      'Pav, Chilla & Traditional Plates',
      'Idli, Dosa & Southern Favourites',
      'Upma, Pongal & Comfort Rice Bowls',
      'Vegetable Curries, Stews & Sambar',
      'Eggs, Cutlets, Rolls & Sandwiches',
      'Curd, Chutneys & Sides',
      'Beverages & Digestives',
    ],
    Global: [
      'Oats, Cereals & Muesli',
      'Sandwiches & Toasts',
      'Breads, Spreads & Bakery Items',
      'Eggs, Sausages & More',
      'Fruits & Sides',
      'Beverages & Smoothies',
    ],
  },
  LunchDinner: {
    Indian: [
      'Salads',
      'Soups',
      'South Indian Staples',
      'Rice, Pulao & Khichdi',
      'Dal & Legumes',
      'Vegetable & Curries',
      'Egg, Chicken & Fish Dishes',
      'Raita, Chutneys & Sides',
      'Snacks & Chaats',
    ],
    Global: [
      'Salads & Light Meals',
      'Soups & Broths',
      'Rice, Pasta & Noodle Bowls',
      'Vegetable Sides & Stir-Fries',
      'Egg, Chicken & Fish Dishes',
      'Burgers & Pizzas',
      'Street-Style Bites: Momos, Bao & Rolls',
    ],
  },
};

// --- getBuilderItems ---
exports.getBuilderItems = async (req, res) => {
  try {
    const { meal_time, cuisine } = req.query;
    if (!meal_time || !cuisine)
      return res.status(400).json({ message: 'meal_time and cuisine are required.' });

    if (!['Breakfast', 'Lunch', 'Dinner'].includes(meal_time))
      return res.status(400).json({ message: 'Invalid meal_time.' });

    if (!['Indian', 'Global'].includes(cuisine))
      return res.status(400).json({ message: 'Invalid cuisine.' });

    const userId = req.user.userId;
    const onboardingData = await Onboarding.findOne({ userId }).lean();
    if (!onboardingData)
      return res.status(404).json({ message: 'Onboarding data not found for user.' });

    const metrics = calculateAllMetrics(onboardingData);
    const dailyRecommendedCalories = metrics.recommendedCalories;
    const mealPercentage = MEAL_CALORIE_DISTRIBUTION[meal_time];
    const mealSpecificRecommendedCalories = Math.round(dailyRecommendedCalories * mealPercentage);

    const sanityMealTimeFilter =
      meal_time === 'Lunch' || meal_time === 'Dinner' ? 'Lunch/Dinner' : 'Breakfast';

    const query = `
      *[_type == "mealBuilderItem" &&
        mealTime == $sanityMealTimeFilter &&
        cuisine == $cuisine] {
          _id, name, calories, servingSize, section, mealTime, cuisine,
          healthColor, adjustmentWeight,
          "recipeLink": recipeLink->{_id, name}
      }
    `;
    const params = { sanityMealTimeFilter, cuisine };
    const items = await client.fetch(query, params);

    // Group items by section
    const groupedItems = items.reduce((acc, item) => {
      const section = item.section || 'Uncategorized';
      if (!acc[section]) acc[section] = [];
      acc[section].push(item);
      return acc;
    }, {});

    // ✅ Select section order dynamically
    const isLunchDinner = meal_time === 'Lunch' || meal_time === 'Dinner';
    const sectionOrder = isLunchDinner
      ? SECTION_ORDER_MAP.LunchDinner[cuisine]
      : SECTION_ORDER_MAP.Breakfast[cuisine];

    const orderedGroupedItems = {};
    sectionOrder.forEach((section) => {
      if (groupedItems[section]) orderedGroupedItems[section] = groupedItems[section];
    });

    // Add any leftover sections (future-proof)
    Object.keys(groupedItems).forEach((section) => {
      if (!orderedGroupedItems[section]) orderedGroupedItems[section] = groupedItems[section];
    });

    res.status(200).json({
      recommended_calories: mealSpecificRecommendedCalories,
      grouped_items: orderedGroupedItems,
    });
  } catch (error) {
    console.error('Error fetching meal builder items:', error);
    res.status(500).json({ error: 'Internal Server Error fetching items.' });
  }
};

// --- adjustMealPortions (same as last fixed version with calorie <100% fix) ---
