const express = require('express');
const router = express.Router();
const finalSubmissionController = require('../controllers/finalSubmissionController.js');
const { protect } = require('../middleware/authMiddleware.js');

router.post('/submit-all', protect, finalSubmissionController.submitFinalOnboarding);

module.exports = router;