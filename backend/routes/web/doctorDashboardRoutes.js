const express = require('express');
const router = express.Router();
const { getPatientList,addPatientLink } = require('../../controllers/web/doctorDashboardController');
const { protect } = require('../../middleware/authMiddleware'); // Your combined auth file

// @route   GET /api/web/dashboard/patients
// @desc    Get the list of patients for the logged-in doctor
// @access  Private (Doctor only)
router.get('/patients', protect, getPatientList);

router.post('/add-patient', protect, addPatientLink);

module.exports = router;