const express = require('express');
const router = express.Router();
const controller = require('../controllers/onboardingController.js');
const { protect } = require('../middleware/authMiddleware.js');

// o2
// This route is already correct and protected.
router.post('/basic-info', protect, controller.submitBasicInfo);

// o3
// ADD the 'protect' middleware here.
router.post('/health-history', protect, controller.submitHealthHistory);

// o4
// ADD the 'protect' middleware here.
router.post('/lifestyle', protect, controller.submitLifestyle);

// o5
// ADD the 'protect' middleware here.
router.post('/exercise-eating', protect, controller.submitExerciseEating);

// o6
// ADD the 'protect' middleware here.
router.post('/sleep-stress', protect, controller.submitSleepStress);

// o7
// ADD the 'protect' middleware here.
router.post('/biomarkers', protect, controller.submitBiomarkers);

module.exports = router;