// controllers/recipeController.js
const client = require('../utils/sanityClient');

exports.getRecipeById = async (req, res) => {
  try {
    const { recipeId } = req.params; // Get ID from URL path e.g., /api/recipes/recipe.poha
    if (!recipeId) {
      return res.status(400).json({ message: "Recipe ID is required." });
    }

    // --- Fetch specific recipe from Sanity ---
    const query = `*[_type == "recipe" && _id == $recipeId][0] {
      _id, name, image, fullRecipe, cuisine, mealTime, dietPreference
    }`;
    const params = { recipeId };
    const recipe = await client.fetch(query, params);
    // -----------------------------------------

    if (!recipe) {
      return res.status(404).json({ message: "Recipe not found." });
    }

    // Optionally process the image URL here if needed
    // const imageUrl = recipe.image ? client.urlFor(recipe.image).url() : null;
    // const responseRecipe = { ...recipe, imageUrl };

    res.status(200).json(recipe); // Or responseRecipe if you process image

  } catch (error) {
    console.error("Error fetching recipe:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};