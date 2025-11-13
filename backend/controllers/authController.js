const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

let nanoid;
(async () => {
    const module = await import('nanoid');
    nanoid = module.nanoid;
})();

const User = require('../models/User');
const OtpRequest = require('../models/otp');
const { Onboarding } = require('../models/onboardingModel.js');
const PatientLink = require('../models/PatientLink'); 
const Doctor = require('../models/Doctor');// Corrected import

// --- CONSTANTS ---
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'fallback-access-secret';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret';
const ACCESS_EXPIRY = process.env.ACCESS_TOKEN_EXPIRY || '18000s'; 
const REFRESH_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || '7d';  // 7 days
const RETRY_AFTER = 60; // seconds

// ====================================================================
// HELPER FUNCTIONS (Declared only once)
// ====================================================================

function generateTokens(userId) {
    const payload = { userId };
    
    const accessToken = jwt.sign(payload, JWT_ACCESS_SECRET, { expiresIn: ACCESS_EXPIRY });
    const refreshToken = jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: REFRESH_EXPIRY });

    return { accessToken, refreshToken };
}

const hashOtp = (otp) => {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(otp).digest('hex');
};

const compareOtp = (plainOtp, hashedOtp) => {
    const crypto = require('crypto');
    const hashed = crypto.createHash('sha256').update(plainOtp).digest('hex');
    return hashed === hashedOtp;
};

function generateSimpleOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// ====================================================================
// NEW USER REGISTRATION FLOW ENDPOINTS
// ====================================================================

// 1. Create Profile and send OTP for Verification
exports.createAccount = async (req, res) => {
    let { 
        phone,
        display_name,
        dob,
        gender,
        preferred_time_zone,
        consent_flags,
        caregiver_mobile,
        doctor_code, // This is the code the user *might* have typed in
        corporate_code
    } = req.body;

    if (!phone || !phone.startsWith('+')) {
        return res.status(400).json({ error: "A valid mobile number in international format is required." });
    }
    if (!display_name || !consent_flags || !consent_flags.tos) {
        return res.status(400).json({ error: "Display name and Terms of Service consent are required." });
    }

    try {
        const existingUser = await User.findOne({ phone });
        if (existingUser) {
            return res.status(409).json({ error: "USER_ALREADY_EXISTS", message: "This mobile number is already registered. Please log in instead." });
        }

        // --- START: MODIFIED LOGIC ---
        // Check if a doctor has pre-linked this number.
        const patientLink = await PatientLink.findOne({ patientMobile: phone });
        let final_doctor_code = doctor_code; // Default to user's input

        if (patientLink) {
            // If a link exists, it OVERRIDES whatever the user typed.
            final_doctor_code = patientLink.doctorCode;
        }
        // --- END: MODIFIED LOGIC ---

        const otp = generateSimpleOtp();
        const otpHash = hashOtp(otp);
        const requestId = require('crypto').randomBytes(16).toString('hex');
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
        
        await OtpRequest.create({
            request_id: requestId,
            phone,
            otpHash,
            expiresAt,
            lastRequestedAt: new Date(),
            userData: {
                phone:phone,
                display_name,
                dob,
                gender,
                preferred_time_zone,
                consent_flags,
                caregiver_mobile,
                doctor_code: final_doctor_code, // Use the final, verified code
                corporate_code
            }
        });
        
        console.log(`[AUTH] Test OTP for new user ${phone}: ${otp} (Request ID: ${requestId})`);

        return res.status(201).json({ 
            request_id: requestId, 
            test_otp_code: otp,
            message: "A verification code has been sent. Please verify to complete your account."
        });

    } catch (error) {
        console.error("Error creating account:", error);
        return res.status(500).json({ error: "Internal server error during account creation." });
    }
};
// 2. Verify OTP and Activate New User Account
exports.verifyNewUserOtp = async (req, res) => {
    const { request_id, otp_code } = req.body;
    
    if (!request_id || !otp_code) {
        return res.status(400).json({ error: "Missing required fields." });
    }

    try {
        // 1. Find the OTP request entry and its temporary data
        const otpEntry = await OtpRequest.findOne({ request_id });
        if (!otpEntry) {
            return res.status(401).json({ error: "OTP_INVALID (Code not found or expired.)" });
        }
        
        // 2. Check Expiration
        if (otpEntry.expiresAt < new Date()) {
            await OtpRequest.deleteOne({ request_id });
            return res.status(410).json({ error: "OTP_EXPIRED (This code has expired.)" });
        }

        // 3. Verify OTP code
        const isOtpValid = compareOtp(otp_code, otpEntry.otpHash);
        if (!isOtpValid) {
            return res.status(401).json({ error: "OTP_INVALID (That code didn't match.)" });
        }

        // 4. Check for race condition
        const existingUser = await User.findOne({ phone: otpEntry.phone });
        if (existingUser) {
            await OtpRequest.deleteOne({ request_id });
            return res.status(409).json({ error: "USER_ALREADY_EXISTS", message: "This mobile number is already registered. Please log in." });
        }

        // 5. Create the new user
        const newUser = await User.create({
            ...otpEntry.userData,
            isPhoneVerified: true 
        });

        // --- START: NEW LINKING LOGIC ---
        // 6. Check if a doctor_code was used
        if (newUser.doctor_code) {
            // Find the doctor by their code
            const linkedDoctor = await Doctor.findOne({ doctorCode: newUser.doctor_code });

            if (linkedDoctor) {
                // Add this new patient's ID to the doctor's 'patients' array
                // We check $addToSet to avoid duplicates
                await Doctor.updateOne(
                    { _id: linkedDoctor._id },
                    { $addToSet: { patients: newUser._id } }
                );
                console.log(`[LINK] Successfully linked User ${newUser._id} to Doctor ${linkedDoctor._id}`);
            } else {
                console.warn(`[LINK] User ${newUser._id} had a doctor_code (${newUser.doctor_code}), but no matching doctor was found.`);
            }
        }
        // --- END: NEW LINKING LOGIC ---

        // 7. Clean up the OTP request
        await OtpRequest.deleteOne({ request_id });

        // 8. Generate tokens and send response
        const { accessToken, refreshToken } = generateTokens(newUser._id);

        return res.status(200).json({
            user_id: newUser._id,
            new_user: true, 
            onboardingStatus: "incomplete",
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_in: 18000 
        });

    } catch (error) {
        console.error("Error verifying new user OTP:", error);
        return res.status(500).json({ error: "SERVER_ERROR (Something went wrong.)" });
    }
};
// Existing User Login Flow Endpoints (Modified)
// Existing User Login Flow Endpoints (Modified)

exports.requestOtp = async (req, res) => {
    const { phone } = req.body;
    
    if (!phone || !phone.startsWith('+')) {
        return res.status(400).json({ error: "Please enter a valid mobile number in international format eg: +91.... ." });
    }

    try {
        const existingUser = await User.findOne({ phone });

        // --- START: MODIFIED LOGIC ---
        // This function is for "LOGIN". If the user exists, send a login OTP.
        // If the user does NOT exist, check for a doctor link for the "auto-fill" feature.
        
        if (!existingUser) {
            // User not found. Check if they are a new, pre-linked patient.
            const patientLink = await PatientLink.findOne({ patientMobile: phone });
            
            return res.status(404).json({
                error: "USER_NOT_FOUND",
                message: "Mobile number not registered, please sign up.",
                // This NEW field tells the frontend to auto-fill the doctor code
                linkedDoctorCode: patientLink ? patientLink.doctorCode : null 
            });
        }
        // --- END: MODIFIED LOGIC ---
        
        // --- (This is the original logic for an EXISTING user) ---
        const otp = generateSimpleOtp();
        const otpHash = hashOtp(otp);
        const requestId = typeof nanoid !== 'undefined' ? nanoid() : require('crypto').randomBytes(16).toString('hex');
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

        await OtpRequest.create({
            request_id: requestId,
            phone,
            otpHash,
            expiresAt,
            lastRequestedAt: new Date(),
        });
        
        console.log(`[AUTH] Test OTP for ${phone}: ${otp} (Request ID: ${requestId})`);

        return res.status(202).json({ 
            request_id: requestId, 
            test_otp_code: otp,
            retry_after_seconds: RETRY_AFTER,
            message: "A login code has been sent to your registered number.",
            // We also send null here so the frontend knows not to auto-fill for logins
            linkedDoctorCode: null 
        });

    } catch (error) {
        console.error("Error requesting OTP:", error);
        return res.status(500).json({ error: "Something went wrong. Please try again." });
    }
};

exports.verifyOtp = async (req, res) => {
    const { request_id, otp_code } = req.body;
    
    if (!request_id || !otp_code) {
        return res.status(400).json({ error: "Missing required fields." });
    }

    try {
        const otpEntry = await OtpRequest.findOne({ request_id });

        if (!otpEntry) {
            return res.status(401).json({ error: "OTP_INVALID (That code didn't match try again.)" });
        }
        
        if (otpEntry.expiresAt < new Date()) {
            await OtpRequest.deleteOne({ request_id });
            return res.status(410).json({ error: "OTP_EXPIRED (This code has expired. Request a new one.)" });
        }

        const isOtpValid = compareOtp(otp_code, otpEntry.otpHash);
        
        if (!isOtpValid) {
            return res.status(401).json({ error: "OTP_INVALID (That code didn't match try again.)" });
        }

        const phone = otpEntry.phone;
        const user = await User.findOne({ phone });

        if (!user) {
            // This is a new user flow; handle registration
            const newUser = await User.create({ phone });
            await OtpRequest.deleteOne({ request_id });
            
            const { accessToken, refreshToken } = generateTokens(newUser._id);
            
            return res.status(200).json({
                user_id: newUser._id,
                new_user: true, 
                onboardingStatus: "incomplete", // New users haven't onboarded
                access_token: accessToken,
                refresh_token: refreshToken,
                expires_in: 18000
            });
        }
        
        await OtpRequest.deleteOne({ request_id });

        // --- ADDED LOGIC: Check for onboarding status for existing users ---
        const onboardingDoc = await Onboarding.findOne({ userId: user._id });
        const onboardingStatus = onboardingDoc ? "complete" : "incomplete";

        const { accessToken, refreshToken } = generateTokens(user._id);

        return res.status(200).json({
            user_id: user._id,
            new_user: false, 
            onboardingStatus: onboardingStatus, // Onboarding status for existing user
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_in: 18000
        });

    } catch (error) {
        console.error("Error verifying OTP:", error);
        return res.status(500).json({ error: "SERVER_ERROR (Something went wrong. Please try again.)" });
    }
};

exports.resendOtp = async (req, res) => {
    return res.status(202).json({ 
        message: "Resend triggered. Check your phone.",
        retry_after_seconds: RETRY_AFTER
    });
};

exports.logout = async (req, res) => {
    return res.status(200).json({ message: "Logout successful. Tokens cleared." });
};