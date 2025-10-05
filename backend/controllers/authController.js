const jwt = require('jsonwebtoken');
const mongoose = require('mongoose'); // Need to ensure mongoose is available if updateProfile is here

let nanoid;
(async () => {
    // Import nanoid dynamically
    const module = await import('nanoid');
    nanoid = module.nanoid;
})();
const User = require('../models/User');
const OtpRequest = require('../models/otp'); // Assuming this is your OTP temp model

// --- CONSTANTS ---
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'fallback-access-secret';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret';
const ACCESS_EXPIRY = process.env.ACCESS_TOKEN_EXPIRY || '900s'; // 15 mins
const REFRESH_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || '7d';  // 7 days
const RETRY_AFTER = 60; // seconds

// Utility to generate JWT tokens
function generateTokens(userId) {
    const payload = { userId };
    
    const accessToken = jwt.sign(payload, JWT_ACCESS_SECRET, { expiresIn: ACCESS_EXPIRY });
    const refreshToken = jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: REFRESH_EXPIRY });

    return { accessToken, refreshToken };
}

// Dummy Hashing for OTP (Replace with real bcrypt/crypto in production)
const hashOtp = (otp) => `HASHED_${otp}`;
const compareOtp = (plainOtp, hashedOtp) => hashedOtp === `HASHED_${plainOtp}`;

// OTP Generator
function generateSimpleOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// ====================================================================
// NEW USER REGISTRATION FLOW ENDPOINTS
// ====================================================================

// 1. Create Profile and send OTP for Verification
exports.createAccount = async (req, res) => {
    const { 
        phone,
        display_name,
        dob,
        gender,
        preferred_time_zone,
        consent_flags,
        caregiver_mobile,
        doctor_code,
        corporate_code
    } = req.body;

    if (!phone || !phone.startsWith('+')) {
        return res.status(400).json({ error: "A valid mobile number in international format is required." });
    }
    if (!display_name || !consent_flags || !consent_flags.tos) {
        return res.status(400).json({ error: "Display name and Terms of Service consent are required." });
    }

    try {
        // Check if the user already exists (Prevents duplicate accounts)
        const existingUser = await User.findOne({ phone });
        if (existingUser) {
            return res.status(409).json({ error: "USER_ALREADY_EXISTS", message: "This mobile number is already registered. Please log in instead." });
        }

        // Create the new user document (isPhoneVerified defaults to false in model)
        const newUser = await User.create({
            phone,
            display_name,
            dob,
            gender,
            preferred_time_zone,
            consent_flags,
            caregiver_mobile,
            doctor_code,
            corporate_code,
        });

        // Generate and send an OTP for verification
        const otp = generateSimpleOtp();
        const otpHash = hashOtp(otp);
        const requestId = typeof nanoid !== 'undefined' ? nanoid() : require('crypto').randomBytes(16).toString('hex');
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

        // Store the OTP request in a temporary table
        await OtpRequest.create({
            request_id: requestId,
            phone,
            otpHash,
            expiresAt,
            lastRequestedAt: new Date(),
        });
        
        console.log(`[AUTH] Test OTP for new user ${phone}: ${otp} (Request ID: ${requestId})`);

        // Respond with success and the request ID to the frontend
        return res.status(201).json({ 
            user_id: newUser._id,
            request_id: requestId, 
            test_otp_code: otp, // For development/testing only
            message: "Account created successfully. A verification code has been sent."
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
        // 1. Find the OTP request entry
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

        // 4. Find the user and update isPhoneVerified to true (Activate Account)
        // Ensure we only activate if it's currently false (protect against re-use)
        const user = await User.findOneAndUpdate(
            { phone: otpEntry.phone, isPhoneVerified: false }, 
            { isPhoneVerified: true },
            { new: true }
        );

        if (!user) {
            return res.status(404).json({ error: "User profile missing or already verified." });
        }

        // 5. Clear the OTP entry
        await OtpRequest.deleteOne({ request_id });

        // 6. Generate tokens and log the user in
        const { accessToken, refreshToken } = generateTokens(user._id);

        return res.status(200).json({
            user_id: user._id,
            new_user: true, 
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_in: 900
        });

    } catch (error) {
         console.error("Error verifying new user OTP:", error);
         return res.status(500).json({ error: "SERVER_ERROR (Something went wrong.)" });
    }
};


// ====================================================================
// EXISTING USER LOGIN FLOW ENDPOINTS (MODIFIED)
// ====================================================================

// A. Login Mobile (enter phone & "Verify") - Now dedicated to existing users
exports.requestOtp = async (req, res) => {
    const { phone } = req.body;
    
    if (!phone || !phone.startsWith('+')) {
        return res.status(400).json({ error: "Please enter a valid mobile number in international format eg: +91.... ." });
    }

    try {
        // --- 1. Check for existing user first (CRITICAL FLOW CHANGE) ---
        const existingUser = await User.findOne({ phone });

        if (!existingUser) {
            // User does not exist. Do NOT send OTP.
            return res.status(404).json({
                error: "USER_NOT_FOUND",
                message: "Mobile number not registered, please sign up."
            });
        }
        
        // --- 2. If user exists, PROCEED WITH OTP GENERATION FOR LOGIN ---
        const otp = generateSimpleOtp();
        const otpHash = hashOtp(otp);
        const requestId = typeof nanoid !== 'undefined' ? nanoid() : require('crypto').randomBytes(16).toString('hex');
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

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
            message: "A login code has been sent to your registered number." 
        });

    } catch (error) {
        console.error("Error requesting OTP:", error);
        return res.status(500).json({ error: "Something went wrong. Please try again." });
    }
};


// B. OTP Verification (login) - Dedicated to logging in existing users
exports.verifyOtp = async (req, res) => {
    const { request_id, otp_code } = req.body;
    
    if (!request_id || !otp_code) {
        return res.status(400).json({ error: "Missing required fields." });
    }

    try {
        // 1. Find the OTP request entry
        const otpEntry = await OtpRequest.findOne({ request_id });

        if (!otpEntry) {
            return res.status(401).json({ error: "OTP_INVALID (That code didn't match try again.)" });
        }
        
        // 2. Check Expiration
        if (otpEntry.expiresAt < new Date()) {
            await OtpRequest.deleteOne({ request_id });
            return res.status(410).json({ error: "OTP_EXPIRED (This code has expired. Request a new one.)" });
        }

        // 3. Verify OTP code
        const isOtpValid = compareOtp(otp_code, otpEntry.otpHash);
        
        if (!isOtpValid) {
            return res.status(401).json({ error: "OTP_INVALID (That code didn't match try again.)" });
        }

        // 4. OTP Valid: Find the User (Guaranteed to exist)
        const phone = otpEntry.phone;
        const user = await User.findOne({ phone });

        if (!user) {
            return res.status(404).json({ error: "User not found." });
        }
        
        // 5. Clear OTP entry from temporary table
        await OtpRequest.deleteOne({ request_id });

        // 6. Generate and return tokens
        const { accessToken, refreshToken } = generateTokens(user._id);

        return res.status(200).json({
            user_id: user._id,
            new_user: false, 
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_in: 900
        });

    } catch (error) {
        console.error("Error verifying OTP:", error);
        return res.status(500).json({ error: "SERVER_ERROR (Something went wrong. Please try again.)" });
    }
};

// C. Resend OTP logic 
exports.resendOtp = async (req, res) => {
    return res.status(202).json({ 
        message: "Resend triggered. Check your phone.",
        retry_after_seconds: RETRY_AFTER
    });
};

// D. Logout Logic
exports.logout = async (req, res) => {
    return res.status(200).json({ message: "Logout successful. Tokens cleared." });
};
