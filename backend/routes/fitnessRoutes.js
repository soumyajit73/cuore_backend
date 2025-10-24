const express = require('express');
const router = express.Router();
 // Make sure path is correct
const { protect } = require('../middleware/authMiddleware');
const { getUserFitnessPlan } = require('../controllers/fitnessController');

router.get('/fitness-plan', protect, getUserFitnessPlan);


module.exports = router;