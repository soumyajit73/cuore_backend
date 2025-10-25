const express = require('express');
const router = express.Router();
 // Make sure path is correct
const { protect } = require('../middleware/authMiddleware');
const { getUserFitnessPlan , updateUserPreferredExerciseTime } = require('../controllers/fitnessController');

router.get('/fitness-plan', protect, getUserFitnessPlan);
router.put('/update-ex-time', protect, updateUserPreferredExerciseTime); 


module.exports = router;