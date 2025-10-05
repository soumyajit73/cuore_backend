const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.post('/create-account', authController.createAccount);

// 2. Verify OTP and finalize registration (New User)
router.post('/verify-new-user-otp', authController.verifyNewUserOtp);

// A. Login Mobile (enter phone & "Verify")
router.post('/otp/request', authController.requestOtp);

// B. OTP Verification (login)
router.post('/otp/verify', authController.verifyOtp);

// C. Resend OTP
router.post('/otp/resend', authController.resendOtp);

// D. Logout
router.post('/logout', authController.logout);

module.exports = router;
