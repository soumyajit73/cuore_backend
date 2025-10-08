const express = require('express');
const router = express.Router();
const finalSubmissionController = require('../controllers/finalSubmissionController.js');
const { protect } = require('../middleware/authMiddleware.js');

router.post('/submit-all', protect, finalSubmissionController.submitFinalOnboarding);

// Route for reassessment (PUT is for updating an existing resource)
router.put('/reassess', protect, finalSubmissionController.submitFinalOnboarding);

// Route to fetch existing onboarding data for a logged-in user (GET)
router.get('/data', protect, finalSubmissionController.getOnboardingData);

module.exports = router;