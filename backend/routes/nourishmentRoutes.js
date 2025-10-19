const express = require('express');
const router = express.Router();
const { getNourishmentPlan } = require('../controllers/nourishmentController'); // Make sure path is correct
const { protect } = require('../middleware/authMiddleware'); // Import your authentication middleware

// GET /api/nourish/plan?meal_time=Breakfast
router.get('/plan', protect, getNourishmentPlan);

module.exports = router;