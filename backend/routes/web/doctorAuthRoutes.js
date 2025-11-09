const express = require('express');
const router = express.Router();

// We will create this controller in the next step
const {
    sendRegistrationOtp,
    registerDoctor,
    loginWithPassword,
    sendLoginOtp,
    verifyLoginOtp
} = require('../../controllers/web/doctorAuthController');

// --- Routes for "Create Account" Screen ---
// Route to send OTP and save registration data
router.post('/send-registration-otp', sendRegistrationOtp);

// Route to verify OTP and create the account
router.post('/register', registerDoctor);


// --- Routes for "Login" Screen ---
// Route to login with a password
router.post('/login-password', loginWithPassword);

// Route to send an OTP for an *existing* doctor
router.post('/send-login-otp', sendLoginOtp);

// Route to verify the login OTP
router.post('/verify-login-otp', verifyLoginOtp);


module.exports = router;