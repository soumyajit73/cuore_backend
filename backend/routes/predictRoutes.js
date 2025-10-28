const express = require('express');
const router = express.Router();

// 1. Import the controller function
const { getPredictionData } = require('../controllers/predictController.js');

// 2. Define the route
/**
 * @route   GET /api/v1/predict/:userId
 * @desc    Get the historical and predicted data for all 8 graphs
 */
router.get('/:userId', getPredictionData);

// 3. Export the router
module.exports = router;
