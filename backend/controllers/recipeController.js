// controllers/recipeController.js
const client = require('../utils/sanityClient'); // Ensure path is correct

exports.getRecipeById = async (req, res) => {
  try {
    const { recipeId } = req.params; // Get ID from URL path e.g., /api/recipes/recipe.poha
    if (!recipeId) {
      return res.status(400).json({ message: "Recipe ID is required." });
    }

    // ✅ --- THIS IS THE CORRECTED QUERY ---
    // It fetches all the new structured fields
    const query = `*[_type == "recipe" && _id == $recipeId][0] {
      _id,
      name,
      image,
      prepTime,
      cookTime,
      // Fetch the array of ingredient objects
      ingredients[]{
        _key, // Good practice to include the key
        quantity,
        unit,
        name,
        notes
      },
      // Fetch the array of instruction objects
      instructions[]{
        _key, // Good practice to include the key
        heading,
        steps // This is an array of strings
      },
      cuisine,
      mealTime,
      dietPreference
    }`;
    // ------------------------------------

    const params = { recipeId };
    const recipe = await client.fetch(query, params);

    if (!recipe) {
      return res.status(404).json({ message: "Recipe not found." });
    }

    // Optional: Process image URL if needed
    // const imageUrl = recipe.image ? client.urlFor(recipe.image).url() : null;
    // const responseRecipe = { ...recipe, imageUrl };

    res.status(200).json(recipe); // Send the full structured recipe

  } catch (error) {
    console.error("Error fetching recipe:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};