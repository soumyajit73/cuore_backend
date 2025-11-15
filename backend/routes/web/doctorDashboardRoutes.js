const express = require('express');
const router = express.Router();
const { getPatientList,addPatientLink,getPatientDetails,sendProfileEditOtp,updateDoctorProfile,getDoctorProfile } = require('../../controllers/web/doctorDashboardController');
const { protect } = require('../../middleware/authMiddleware'); // Your combined auth file

// @route   GET /api/web/dashboard/patients
// @desc    Get the list of patients for the logged-in doctor
// @access  Private (Doctor only)
router.get('/patients', protect, getPatientList);

router.post('/add-patient', protect, addPatientLink);

router.get('/patient/:patientId', protect, getPatientDetails ); 

router.post('/profile/send-otp', protect, sendProfileEditOtp);

router.put('/profile/update', protect, updateDoctorProfile);

router.get('/profile', protect, getDoctorProfile);

module.exports = router;