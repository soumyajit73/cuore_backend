const express = require('express');
const router = express.Router();
const { getRecipeById } = require('../controllers/recipeController'); // Make sure path is correct
const { protect } = require('../middleware/authMiddleware'); // Import your authentication middleware

// GET /api/recipes/recipe.poha-id-123
router.get('/:recipeId', protect, getRecipeById);

module.exports = router;