// controllers/mealBuilderController.js
const client = require('../utils/sanityClient');

exports.getBuilderItems = async (req, res) => {
  try {
    const { meal_time, cuisine } = req.query;
    if (!meal_time || !cuisine) {
      return res.status(400).json({ message: "meal_time and cuisine query parameters are required." });
    }
    if (!['Breakfast', 'Lunch/Dinner'].includes(meal_time)) {
       return res.status(400).json({ message: "Invalid meal_time parameter." });
    }
     if (!['Indian', 'Global'].includes(cuisine)) {
       return res.status(400).json({ message: "Invalid cuisine parameter." });
    }

    // --- Fetch from Sanity ---
    const query = `
      *[_type == "mealBuilderItem" &&
        mealTime == $meal_time &&
        cuisine == $cuisine] {
          _id, name, calories, servingSize, section, mealTime, cuisine,
          "recipeLink": recipeLink->{_id, name}
      } | order(section asc, name asc)
    `;
    const params = { meal_time, cuisine };
    const items = await client.fetch(query, params);
    // -------------------------

    // --- Group items by section ---
    const groupedItems = items.reduce((acc, item) => {
      const section = item.section || 'Uncategorized';
      if (!acc[section]) acc[section] = [];
      acc[section].push(item);
      return acc;
    }, {});
    // ----------------------------

    res.status(200).json(groupedItems);

  } catch (error) {
    console.error("Error fetching meal builder items:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};