const express = require('express');
const router = express.Router();
const controller = require('../controllers/onboardingController.js');

// o2
router.post('/basic-info', controller.submitBasicInfo);

// o3
router.post('/health-history', controller.submitHealthHistory);

//o4
router.post('/lifestyle', controller.submitLifestyle);

// o5
router.post('/exercise-eating', controller.submitExerciseEating);

// o6
router.post('/sleep-stress', controller.submitSleepStress);

// o7
router.post('/biomarkers', controller.submitBiomarkers);

module.exports = router;