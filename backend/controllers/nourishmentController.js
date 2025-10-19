// controllers/nourishController.js
const client = require('../utils/sanityClient');
const { calculateAllMetrics } = require('../models/onboardingModel.js'); // Make sure path is correct
const Onboarding = require('../models/onboardingModel.js').Onboarding; // Make sure path is correct

// Ensure your dietTagMaps are complete and accurate here
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

exports.getNourishmentPlan = async (req, res) => {
  try {
    const { meal_time } = req.query;
    if (!meal_time || !['Breakfast', 'Lunch/Dinner'].includes(meal_time)) {
      return res.status(400).json({ message: "Valid 'meal_time' query parameter required (Breakfast or Lunch/Dinner)." });
    }

    // --- Get User Data ---
    const userId = req.user.userId; // Assuming req.user comes from your auth middleware
    const onboardingData = await Onboarding.findOne({ userId }).lean();
    if (!onboardingData) return res.status(404).json({ message: "Onboarding data not found." });

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

    // Determine user diet key
    let userDietKey;
    if (foodPreference === 'Vegetarian') userDietKey = 'Veg';
    else if (foodPreference === 'Eggetarian') userDietKey = 'Eggetarian';
    else userDietKey = 'Non-Veg'; // Default or map Non-vegetarian
    if (!dietTagMaps[meal_time] || !dietTagMaps[meal_time][userDietKey]) {
        console.warn(`Diet key ${userDietKey} for ${meal_time} not found, defaulting to Veg.`);
        userDietKey = 'Veg'; // Safety default
    }
    const tagsForUser = dietTagMaps[meal_time][userDietKey];
    // ----------------------

    // --- Fetch from Sanity ---
    const query = `
      *[_type == "nourishPlanItem" &&
        mealTime == $meal_time &&
        calorieRange == $calorie_range &&
        dietTag in $tags_for_user] {
          _id, name, calories, dietTag, components, mealTime, calorieRange,
          "recipeLink": recipeLink->{_id, name}
      }
    `;
    const params = { meal_time, calorie_range: calorieRange, tags_for_user: tagsForUser };
    const allMatchingItems = await client.fetch(query, params);
    // -------------------------

    // --- Apply Randomization Logic ---
    const grouped = {};
    allMatchingItems.forEach(item => {
      const tag = item.dietTag;
      if (!grouped[tag]) grouped[tag] = [];
      grouped[tag].push(item);
    });

    const mealPlan = [];
    const baseTags = tagsForUser.map(tag => tag.match(/^[A-Z]+\d+/)[0]).filter((v, i, a) => a.indexOf(v) === i);

    for (const baseTag of baseTags) {
        let possibleItems = [];
        tagsForUser.forEach(fullTag => {
            if (fullTag.startsWith(baseTag) && grouped[fullTag]) {
                possibleItems = possibleItems.concat(grouped[fullTag]);
            }
        });
        if (possibleItems.length > 0) {
            const randomItem = possibleItems[Math.floor(Math.random() * possibleItems.length)];
            mealPlan.push(randomItem);
        }
    }
    // ------------------------------------

    if (mealPlan.length === 0) {
      return res.status(404).json({ message: `No meal plan items found.` });
    }

    res.status(200).json({
      calorie_range: calorieRange,
      meal_time: meal_time,
      meal_plan: mealPlan,
    });

  } catch (error) {
    console.error("Error fetching nourishment plan:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};