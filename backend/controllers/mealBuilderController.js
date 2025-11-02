const client = require('../utils/sanityClient');
const { calculateAllMetrics, Onboarding } = require('../models/onboardingModel.js');

// --- Helper Functions ---
function parseServingSize(servingSizeString) {
  const defaults = { baseQuantity: 1, unit: 'unit(s)' };
  if (typeof servingSizeString === 'number' && !isNaN(servingSizeString)) {
    return { baseQuantity: servingSizeString, unit: defaults.unit };
  }
  if (!servingSizeString || typeof servingSizeString !== 'string') return defaults;

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
      if (!isNaN(parsedQty)) quantity = parsedQty;
    }

    if (!unit) unit = defaults.unit;
  } else {
    quantity = defaults.baseQuantity;
    unit = cleanedString || defaults.unit;
  }

  return { baseQuantity: quantity, unit };
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

function formatServingString(finalAdjustedQuantity, unit, itemName) {
  const qty = parseFloat(finalAdjustedQuantity);
  const unitLower = (unit || '').toLowerCase().trim();
  const nameLower = (itemName || '').toLowerCase().trim();

  // --- Convert decimals to nice fractions like ¼, ½, ¾
  const formatFraction = (n) => {
    const rounded = Math.round(n * 12) / 12;
    if (Math.abs(rounded - 0.25) < 0.01) return '¼';
    if (Math.abs(rounded - 0.33) < 0.02) return '⅓';
    if (Math.abs(rounded - 0.5) < 0.01) return '½';
    if (Math.abs(rounded - 0.66) < 0.02) return '⅔';
    if (Math.abs(rounded - 0.75) < 0.01) return '¾';
    return rounded % 1 === 0 ? `${rounded}` : rounded.toFixed(2);
  };

  // --- Identify unit type
  const measureUnits = [
    'cup', 'bowl', 'katori', 'spoon', 'glass', 'plate',
    'tbsp', 'tsp', 'ladle', 'slice', 'ml', 'g', 'gram', 'grams'
  ];
  const genericUnits = ['unit', 'units', 'pcs', 'piece', 'pieces', '', null, undefined];

  const isMeasureBased = measureUnits.some(u => unitLower.includes(u));
  const isCountBased = genericUnits.includes(unitLower);

  // --- Smart pluralization
  const pluralize = (word) => {
    if (!word) return word;
    const noPluralWords = [
      'milk', 'rice', 'dal', 'curd', 'water', 'juice', 'poha', 'upma', 'chutney', 'sambar'
    ];
    if (noPluralWords.some(w => word.includes(w))) return word;
    if (word.endsWith('y')) return word.slice(0, -1) + 'ies';
    if (word.endsWith('s')) return word;
    return word + 's';
  };

  const qtyText = formatFraction(qty);

  // --- Build final string
  if (isMeasureBased) {
    // e.g., ½ cup oats or 2 katoris dal
    const pluralUnit = qty > 1 && !unitLower.endsWith('s') ? `${unitLower}s` : unitLower;
    return `${qtyText} ${pluralUnit} ${itemName}`;
  }

  if (isCountBased) {
    // e.g., 5 boiled eggs or 1 apple
    const pluralName = qty > 1 ? pluralize(itemName) : itemName;
    return `${qtyText} ${pluralName}`;
  }

  // fallback (mixed / unknown unit)
  const pluralUnit = qty > 1 && !unitLower.endsWith('s') ? `${unitLower}s` : unitLower;
  return `${qtyText} ${pluralUnit} ${itemName}`;
}


// --- Constants ---
const MEAL_CALORIE_DISTRIBUTION = {
  Breakfast: 0.25,
  Lunch: 0.30,
  Dinner: 0.30
};

const SECTION_ORDER = {
  Indian: {
    Breakfast: [
      "Dalia, Poha & Flattened Rice Dishes",
      "Rotis & Parathas",
      "Pav, Chilla & Traditional Plates",
      "Idli, Dosa & Southern Favourites",
      "Upma, Pongal & Comfort Rice Bowls",
      "Vegetable Curries, Stews & Sambar",
      "Eggs, Cutlets, Rolls & Sandwiches",
      "Curd, Chutneys & Sides",
      "Beverages & Digestives"
    ],
    LunchDinner: [
      "Salads",
      "Soups",
      "South Indian Staples",
      "Rice, Pulao & Khichdi",
      "Dal & Legumes",
      "Vegetable & Curries",
      "Egg, Chicken & Fish Dishes",
      "Raita, Chutneys & Sides",
      "Snacks & Chaats"
    ]
  },
  Global: {
    Breakfast: [
      "Oats, Cereals & Muesli",
      "Sandwiches & Toasts",
      "Breads, Spreads & Bakery Items",
      "Eggs, Sausages & More",
      "Fruits & Sides",
      "Beverages & Smoothies"
    ],
    LunchDinner: [
      "Salads & Light Meals",
      "Soups & Broths",
      "Rice, Pasta & Noodle Bowls",
      "Vegetable Sides & Stir-Fries",
      "Egg, Chicken & Fish Dishes",
      "Burgers & Pizzas",
      "Street-Style Bites: Momos, Bao & Rolls"
    ]
  }
};

// --- getBuilderItems ---
async function getBuilderItems(req, res) {
  try {
    const { meal_time, cuisine } = req.query;
    if (!meal_time || !cuisine) {
      return res.status(400).json({ message: "meal_time and cuisine query parameters are required." });
    }

    if (!['Breakfast', 'Lunch', 'Dinner'].includes(meal_time)) {
      return res.status(400).json({ message: "Invalid meal_time parameter." });
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
          healthColor,
          adjustmentWeight,
          "recipeLink": recipeLink->{_id, name}
      }
    `;
    const params = { sanityMealTimeFilter, cuisine };
    const items = await client.fetch(query, params);

    // Group by section
    const groupedItems = items.reduce((acc, item) => {
      const section = item.section || 'Uncategorized';
      if (!acc[section]) acc[section] = [];
      acc[section].push(item);
      return acc;
    }, {});

    // Sort sections according to Excel order
    const orderKey = (meal_time === 'Breakfast') ? 'Breakfast' : 'LunchDinner';
    const orderedSections = SECTION_ORDER[cuisine][orderKey];
    const orderedGroupedItems = {};

    orderedSections.forEach(sectionName => {
      if (groupedItems[sectionName]) {
        orderedGroupedItems[sectionName] = groupedItems[sectionName];
      }
    });

    // Include any leftover sections
    Object.keys(groupedItems).forEach(section => {
      if (!orderedGroupedItems[section]) {
        orderedGroupedItems[section] = groupedItems[section];
      }
    });

    res.status(200).json({
      recommended_calories: mealSpecificRecommendedCalories,
      grouped_items: orderedGroupedItems
    });

  } catch (error) {
    console.error("Error fetching meal builder items:", error);
    res.status(500).json({ error: "Internal Server Error fetching items." });
  }
}

// --- adjustMealPortions ---
async function adjustMealPortions(req, res) {
  try {
    const { cartItems: inputCartItems, recommendedCalories } = req.body;

    if (!Array.isArray(inputCartItems) || inputCartItems.length === 0) {
      return res.status(400).json({ message: "cartItems array required." });
    }
    if (typeof recommendedCalories !== 'number' || recommendedCalories <= 0) {
      return res.status(400).json({ message: "Valid positive recommendedCalories required." });
    }

    // 🧾 Preprocess items
    const processedCartItems = inputCartItems.map(item => {
      const servings = typeof item.numOfServings === 'number' && item.numOfServings > 0 ? item.numOfServings : 1;
      const baseCalories = typeof item.calories === 'number' && item.calories >= 0 ? item.calories : 0;
      const { totalQuantity, unit } = calculateTotalQuantity(item.servingSize, servings);
      const weight = typeof item.adjustmentWeight === 'number' && item.adjustmentWeight >= 0 ? item.adjustmentWeight : 0;

      return {
        _id: item._id,
        name: item.name,
        baseCalories,
        numOfServings: servings,
        recipeLink: item.recipeLink,
        section: item.section,
        cuisine: item.cuisine,
        mealTime: item.mealTime,
        healthColor: item.healthColor,
        totalCalories: baseCalories * servings,
        totalQuantity,
        unit,
        adjustmentWeight: weight
      };
    });

    // ⚙️ Step 1: Compute totals
    const totalAdjustmentWeight = processedCartItems.reduce((sum, i) => sum + i.adjustmentWeight, 0);
    const effectiveTotalWeight = totalAdjustmentWeight < 100 && totalAdjustmentWeight > 0 ? 100 : totalAdjustmentWeight;

    const alertMessage =
      totalAdjustmentWeight < 100 && totalAdjustmentWeight > 0
        ? "⚠️ Balance your meal by adding more dishes (total <100%)."
        : "✅ Total OK";

    // ⚙️ Step 2: Apply Excel formula for each item
    const adjustedItems = processedCartItems.map(item => {
      const calcRaw =
        (item.adjustmentWeight / effectiveTotalWeight) *
        (recommendedCalories / item.baseCalories) *
        item.totalQuantity;

      const adjustedQuantity = MROUND(calcRaw, 0.25);
      const quantityRatio = item.totalQuantity > 0 ? adjustedQuantity / item.totalQuantity : 0;
      const adjustedCalories = Math.round(item.totalCalories * quantityRatio);

      return {
        ...item,
        adjustedQuantity,
        adjustedCalories,
        newServingSizeString: formatServingString(adjustedQuantity, item.unit, item.name),
        calcRaw
      };
    });

    // ⚙️ Step 3: Calculate totals
    const totalAdjustedCalories = adjustedItems.reduce((sum, i) => sum + i.adjustedCalories, 0);

    return res.status(200).json({
      status: "adjusted_custom_plate",
      message: "Meal portions adjusted according to custom plate logic.",
      alert: alertMessage,
      totalPercentage: totalAdjustmentWeight,
      effectiveTotalWeight,
      recommendedCalories,
      newTotalCalories: totalAdjustedCalories,
      adjustedItems
    });

  } catch (error) {
    console.error("Error adjusting meal portions:", error);
    res.status(500).json({ error: "Internal Server Error during adjustment." });
  }
}

// ✅ Export as object containing functions (so Express can use them directly)
module.exports = {
  getBuilderItems,
  adjustMealPortions
};
