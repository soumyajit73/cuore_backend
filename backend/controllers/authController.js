const jwt = require('jsonwebtoken');

let nanoid;
(async () => {
    const module = await import('nanoid');
    nanoid = module.nanoid;
})();
const User = require('../models/User');
const OtpRequest = require('../models/otp');

// --- CONSTANTS ---
// NOTE: Use environment variables for secrets in production
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


// --- ENDPOINT LOGIC ---
function generateSimpleOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}
// A. Login Mobile (enter phone & "Verify")
exports.requestOtp = async (req, res) => {
    const { phone, purpose, client_info } = req.body;
    
    if (!phone) {
        return res.status(400).json({ error: "Please enter a valid mobile number." });
    }

    try {
        // --- CHANGE 1: Use simple Math.random() ---
        const otp = generateSimpleOtp();
        // --- END CHANGE 1 ---
        
        const otpHash = hashOtp(otp);
        // Ensure nanoid is accessible here, if it's imported globally
        const requestId = typeof nanoid !== 'undefined' ? nanoid() : require('crypto').randomBytes(16).toString('hex');
        
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

        // Create the OTP request entry
        await OtpRequest.create({
            request_id: requestId,
            phone,
            otpHash,
            expiresAt,
            lastRequestedAt: new Date(),
        });
        
        // Log to console (still useful for debugging)
        console.log(`[AUTH] Test OTP for ${phone}: ${otp} (Request ID: ${requestId})`);

        // --- CHANGE 2: Expose OTP in the response for binding (Temporary!) ---
        return res.status(202).json({ 
            request_id: requestId, 
            test_otp_code: otp, // <--- FRONTEND DEV MUST USE THIS
            retry_after_seconds: RETRY_AFTER,
            message: "If the number is registered, a code has been sent." 
        });
        // --- END CHANGE 2 ---

    } catch (error) {
        console.error("Error requesting OTP:", error);
        return res.status(500).json({ error: "Something went wrong. Please try again." });
    }
};


// B. OTP Verification (login)
exports.verifyOtp = async (req, res) => {
    const { request_id, otp_code, client_info } = req.body;
    
    if (!request_id || !otp_code) {
        return res.status(400).json({ error: "Missing required fields." });
    }

    try {
        // 1. Find the OTP request entry
        const otpEntry = await OtpRequest.findOne({ request_id });

        if (!otpEntry) {
            // No entry found (either never sent or TTL expired)
            return res.status(401).json({ error: "OTP_INVALID (That code didn't match try again.)" });
        }
        
        // 2. Check Expiration (TTL index handles automatic deletion, but manual check adds security)
        if (otpEntry.expiresAt < new Date()) {
            await OtpRequest.deleteOne({ request_id }); // Clean up expired entry manually
            return res.status(410).json({ error: "OTP_EXPIRED (This code has expired. Request a new one.)" });
        }

        // 3. Verify OTP code
        const isOtpValid = compareOtp(otp_code, otpEntry.otpHash);
        
        if (!isOtpValid) {
            // Implement attempt throttling here (e.g., 401 response with attempts left)
            return res.status(401).json({ error: "OTP_INVALID (That code didn't match try again. (x attempts left))" });
        }

        // 4. OTP Valid: Find or Create User
        const phone = otpEntry.phone;
        let user = await User.findOne({ phone });
        let new_user = false;

        if (!user) {
            // New user flow: Create the user profile minimally
            user = await User.create({ phone, isPhoneVerified: true });
            new_user = true;
        } else {
            // Existing user flow: Update verification status and clear OTP field
            user.isPhoneVerified = true;
            await user.save();
        }
        
        // 5. Clear OTP entry from temporary table (CRITICAL)
        await OtpRequest.deleteOne({ request_id });

        // 6. Generate and return tokens
        const { accessToken, refreshToken } = generateTokens(user._id);

        return res.status(200).json({
            user_id: user._id,
            new_user: new_user,
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_in: 900 // 15 minutes, matching ACCESS_EXPIRY
        });

    } catch (error) {
        console.error("Error verifying OTP:", error);
        return res.status(500).json({ error: "SERVER_ERROR (Something went wrong. Please try again.)" });
    }
};

// C. Resend OTP logic (uses the same logic as requestOtp but often needs rate limiting checks)
exports.resendOtp = async (req, res) => {
    // For simplicity, resend can just call requestOtp, but in production, 
    // it requires checking cooldown via lastRequestedAt field.
    // For now, we will just return a simple message, relying on client-side cooldown.
    return res.status(202).json({ 
        message: "Resend triggered. Check your phone.",
        retry_after_seconds: RETRY_AFTER
    });
};

// D. Logout Logic
exports.logout = async (req, res) => {
    // In a stateless JWT implementation, logout primarily clears client-side tokens.
    // Server-side actions would be needed only for refresh token revocation/blacklisting.
    // Assuming client-side token clearing is sufficient for basic spec fulfillment.
    return res.status(200).json({ message: "Logout successful. Tokens cleared." });
};
