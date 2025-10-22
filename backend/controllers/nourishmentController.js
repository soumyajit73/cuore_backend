// controllers/nourishController.js
const client = require('../utils/sanityClient'); // Ensure path is correct
const { calculateAllMetrics } = require('../models/onboardingModel.js'); // Ensure path is correct
const Onboarding = require('../models/onboardingModel.js').Onboarding; // Ensure path is correct
const MEAL_CALORIE_DISTRIBUTION = {
    Breakfast: 0.25, 
    Lunch: 0.30,     
    Dinner: 0.30     
    // Add Lunch/Dinner mapping if needed, or handle it below
};
// Your dietTagMaps (ensure these are complete and correct)
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
    const userId = req.user.userId;
    const onboardingData = await Onboarding.findOne({ userId }).lean();
    if (!onboardingData) return res.status(404).json({ message: "Onboarding data not found." });

    const metrics = calculateAllMetrics(onboardingData);
    const dailyRecommendedCalories = metrics.recommendedCalories;
    const recommendedCalories = metrics.recommendedCalories; // User's target
    const foodPreference = onboardingData.o5Data.eating_preference;

    let distributionKey = meal_time;
    if (meal_time === 'Lunch/Dinner') {
        // Decide how to handle Lunch/Dinner for this specific plan.
        // Option 1: Use an average (e.g., 35%)
        distributionKey = 'Lunch'; // Or 'Dinner', assuming they have the same %
        // Option 2: Calculate based on time of day (more complex)
        // Option 3: Return daily goal if meal target isn't applicable here?
        // Let's assume Lunch/Dinner maps to 35% for now
        if (!MEAL_CALORIE_DISTRIBUTION[distributionKey]) distributionKey = 'Lunch'; // Default if Lunch/Dinner key missing
    }

    const mealPercentage = MEAL_CALORIE_DISTRIBUTION[distributionKey];
     if (typeof mealPercentage !== 'number') {
        console.error(`Invalid distributionKey "${distributionKey}" derived from meal_time "${meal_time}"`);
        // Fallback: use daily calories or a default meal calorie value? Let's use daily for now.
        // It might be better to return an error if the key is invalid.
        // For simplicity, let's calculate based on a default if key is bad, but log error.
         console.warn(`Using default meal percentage as key "${distributionKey}" was invalid.`);
         // Assign a default percentage or handle error appropriately
         // For now, let's proceed but this might need refinement based on business logic.
         // Perhaps return the daily target? Or a fixed default like 500?
         // Let's return the calculated meal target for 'Lunch' as a fallback
          mealSpecificRecommendedCalories = Math.round(dailyRecommendedCalories * (MEAL_CALORIE_DISTRIBUTION['Lunch'] || 0.35));

    } else {
         mealSpecificRecommendedCalories = Math.round(dailyRecommendedCalories * mealPercentage);
    }
    // Determine calorie range for fetching items
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
    else userDietKey = 'Non-Veg';
    if (!dietTagMaps[meal_time] || !dietTagMaps[meal_time][userDietKey]) {
        console.warn(`Diet key ${userDietKey} for ${meal_time} not found, defaulting to Veg.`);
        userDietKey = 'Veg';
    }
    const tagsForUser = dietTagMaps[meal_time][userDietKey];
    // ----------------------

    // --- Fetch from Sanity ---
    const query = `
      *[_type == "nourishPlanItem" &&
        mealTime == $meal_time &&
        calorieRange == $calorie_range &&
        dietTag in $tags_for_user] {
          _id, name, calories, dietTag,
          components[]{ // Fetch components array
             _key, // Include the key Sanity adds automatically
             _type, // Should be 'string'
             value // Assuming Sanity stores simple strings like this, adjust if needed
          },
          mealTime, calorieRange,
          "recipeLink": recipeLink->{_id, name}
      }
    `;
     // Refined query to directly fetch array of strings
     const queryRefined = `
      *[_type == "nourishPlanItem" &&
        mealTime == $meal_time &&
        calorieRange == $calorie_range &&
        dietTag in $tags_for_user] {
          _id, name, calories, dietTag,
          components, // Directly fetch the array of strings
          mealTime, calorieRange,
          "recipeLink": recipeLink->{_id, name}
      }
    `;
    const params = { meal_time, calorie_range: calorieRange, tags_for_user: tagsForUser };
    const allMatchingItems = await client.fetch(queryRefined, params); // Use refined query
    // -------------------------

    // --- Apply Randomization Logic ---
    const grouped = {};
    allMatchingItems.forEach(item => {
      const tag = item.dietTag;
      if (!grouped[tag]) grouped[tag] = [];
      grouped[tag].push(item);
    });
    const mealPlan = [{"custom_plate": mealSpecificRecommendedCalories}];
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

    // --- Send Response ---
    res.status(200).json({
      recommended_calories: recommendedCalories, // Include user's target
      calorie_range: calorieRange, // The range used for fetching
      meal_time: meal_time,
      meal_plan: mealPlan,
      "custom_plate": mealSpecificRecommendedCalories
    });
    // ---------------------

  } catch (error) {
    console.error("Error fetching nourishment plan:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};