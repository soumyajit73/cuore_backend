const express = require('express');
const router = express.Router();

// 1. Import all the functions from your controller
const { 
  getTobaccoData, 
  updateSmokingProfile, 
  logDailyCigarettes 
} = require('../controllers/tobaccoController.js');

// 2. Define the routes

/**
 * @route   GET /api/v1/tobacco/:userId
 * @desc    Get all data for the tobacco screen
 * (profile, stats, encouragement, challenges, etc.)
 */
router.get('/:userId', getTobaccoData);

/**
 * @route   PUT /api/v1/tobacco/:userId/profile
 * @desc    Update the user's smoking profile
 * @body    { cigarettesPerDay: number, yearsOfSmoking: number }
 */
router.put('/:userId/profile', updateSmokingProfile);

/**
 * @route   POST /api/v1/tobacco/:userId/log
 * @desc    Log the daily cigarette count
 * @body    { count: number }
 */
router.post('/:userId/log', logDailyCigarettes);

// 3. Export the router
module.exports = router;
