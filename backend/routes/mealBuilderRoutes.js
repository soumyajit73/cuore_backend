const express = require('express');
const router = express.Router();
const { getBuilderItems } = require('../controllers/mealBuilderController'); // Make sure path is correct
const { protect } = require('../middleware/authMiddleware'); // Import your authentication middleware

// GET /api/builder/items?meal_time=Breakfast&cuisine=Indian
router.get('/items', protect, getBuilderItems);

module.exports = router;