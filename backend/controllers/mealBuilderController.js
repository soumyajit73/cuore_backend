// controllers/mealBuilderController.js
const client = require('../utils/sanityClient'); // Ensure this path points to your sanityClient.js file
const { calculateAllMetrics } = require('../models/onboardingModel.js'); // Ensure this path is correct
const Onboarding = require('../models/onboardingModel.js').Onboarding; // Ensure this path is correct

// Make sure this function is exported correctly
exports.getBuilderItems = async (req, res) => {
  try {
    // 1. Get filters from query parameters
    const { meal_time, cuisine } = req.query;

    // --- Basic Input Validation ---
    if (!meal_time || !cuisine) {
      return res.status(400).json({ message: "meal_time and cuisine query parameters are required." });
    }
    if (!['Breakfast', 'Lunch/Dinner'].includes(meal_time)) {
       return res.status(400).json({ message: "Invalid meal_time parameter (Use 'Breakfast' or 'Lunch/Dinner')." });
    }
     if (!['Indian', 'Global'].includes(cuisine)) { // Make sure 'Indian', 'Global' match your sheet names exactly
       return res.status(400).json({ message: "Invalid cuisine parameter (Use 'Indian' or 'Global')." });
    }
    // ----------------------------

    // 2. Get User Data & Recommended Calories
    const userId = req.user.userId; // Assuming req.user comes from your auth middleware
    const onboardingData = await Onboarding.findOne({ userId }).lean();
    if (!onboardingData) {
      // Decide how to handle missing onboarding: error or return items without recommended_calories
      return res.status(404).json({ message: "Onboarding data not found to calculate recommended calories." });
    }
    const metrics = calculateAllMetrics(onboardingData);
    const recommendedCalories = metrics.recommendedCalories; // Calculate user's target
    // ------------------------------------------------

    // 3. Fetch ALL matching items from Sanity
    const query = `
      *[_type == "mealBuilderItem" &&
        mealTime == $meal_time &&
        cuisine == $cuisine] {
          _id, name, calories, servingSize, section, mealTime, cuisine,
          "recipeLink": recipeLink->{_id, name} // Include linked recipe ID and Name if exists
      } | order(section asc, name asc) // Order results for consistency
    `;
    const params = { meal_time, cuisine };
    const items = await client.fetch(query, params);
    // ------------------------------------

    // 4. Group the items by section
    const groupedItems = items.reduce((acc, item) => {
      const section = item.section || 'Uncategorized'; // Assign a default section if missing
      if (!acc[section]) {
        acc[section] = []; // Create the section array if it doesn't exist
      }
      acc[section].push(item); // Add the item to its section
      return acc;
    }, {}); // Start with an empty object
    // ----------------------------

    // 5. Send the grouped object and recommended calories as the JSON response
    res.status(200).json({
      recommended_calories: recommendedCalories,
      grouped_items: groupedItems
    });

  } catch (error) {
    console.error("Error fetching meal builder items:", error);
    // Provide a generic error message to the client
    res.status(500).json({ error: "Internal Server Error" });
  }
};