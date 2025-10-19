// controllers/mealBuilderController.js
const client = require('../utils/sanityClient'); // Ensure this path is correct

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
     if (!['Indian', 'Global'].includes(cuisine)) { // Make sure 'Indian', 'Global' match your sheet names
       return res.status(400).json({ message: "Invalid cuisine parameter (Use 'Indian' or 'Global')." });
    }
    // ----------------------------

    // 2. Fetch ALL matching items from Sanity
    const query = `
      *[_type == "mealBuilderItem" &&
        mealTime == $meal_time &&
        cuisine == $cuisine] {
          _id, name, calories, servingSize, section, mealTime, cuisine,
          "recipeLink": recipeLink->{_id, name}
      } | order(section asc, name asc) // Order for consistency
    `;
    const params = { meal_time, cuisine };
    const items = await client.fetch(query, params);

    // --- 3. GROUP THE ITEMS BY SECTION ---
    // This 'reduce' function transforms the flat array 'items'
    // into an object where keys are section names.
    const groupedItems = items.reduce((acc, item) => {
      // Get the section name, defaulting if it's missing
      const section = item.section || 'Uncategorized';
      // If this section isn't a key in our accumulator object yet, create it with an empty array
      if (!acc[section]) {
        acc[section] = [];
      }
      // Push the current item into the array for its section
      acc[section].push(item);
      // Return the updated accumulator for the next iteration
      return acc;
    }, {}); // Start with an empty object {}
    // ------------------------------------

    // 4. Send the grouped object as the JSON response
    res.status(200).json(groupedItems);

  } catch (error) {
    console.error("Error fetching meal builder items:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};