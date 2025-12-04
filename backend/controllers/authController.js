const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const crypto = require("crypto");


let nanoid;
(async () => {
    const module = await import('nanoid');
    nanoid = module.nanoid;
})();

const User = require('../models/User');
const OtpRequest = require('../models/otp');
const { Onboarding } = require('../models/onboardingModel.js');
const PatientLink = require('../models/PatientLink'); 
const Doctor = require('../models/Doctor');

// --- CONSTANTS ---
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'fallback-access-secret';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret';
const ACCESS_EXPIRY = process.env.ACCESS_TOKEN_EXPIRY || '18000s'; 
const REFRESH_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || '7d';  // 7 days
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
        doctor_code,    // optional typed by user
        corporate_code
    } = req.body;

    if (!phone || !phone.startsWith('+')) {
        return res.status(400).json({ error: "A valid mobile number in international format is required." });
    }
    if (!display_name || !consent_flags || !consent_flags.tos) {
        return res.status(400).json({ error: "Display name and Terms of Service consent are required." });
    }

    try {
        // Check if user already exists
        const existingUser = await User.findOne({ phone });
        if (existingUser) {
            return res.status(409).json({
                error: "USER_ALREADY_EXISTS",
                message: "This mobile number is already registered. Please log in instead."
            });
        }

        // -------------------------------------------------------------------------
        // ⭐ DOCTOR MAPPING LOGIC (Updated for Manual Entry)
        // -------------------------------------------------------------------------
        
        let final_doctor_code = doctor_code || null; // Initialize with manual input
        let final_doctor_name = "";
        let final_doctor_phone = "";

        // 1. Priority Check: Did the doctor invite this specific phone number?
        const patientLink = await PatientLink.findOne({ patientMobile: phone });

        if (patientLink) {
            // CASE A: Pre-linked by Doctor (Overrides manual input)
            final_doctor_code = patientLink.doctorCode;

            const doctor = await Doctor.findOne({ doctorCode: final_doctor_code }).lean();
            if (doctor) {
                final_doctor_name = doctor.displayName;
                final_doctor_phone = doctor.mobileNumber;
            }
        } 
        else if (final_doctor_code) {
            // CASE B: User manually entered a code (No pre-link)
            // We must VALIDATE this code exists in the Doctor table
            const doctor = await Doctor.findOne({ doctorCode: final_doctor_code }).lean();
            
            if (doctor) {
                final_doctor_name = doctor.displayName;
                final_doctor_phone = doctor.mobileNumber;
            } else {
                // If the manually typed code is wrong, stop registration
                return res.status(400).json({ 
                    error: "INVALID_DOCTOR_CODE", 
                    message: "The Doctor Code you entered is invalid." 
                });
            }
        }

        // -------------------------------------------------------------------------
        // ⭐ OTP GENERATION
        // -------------------------------------------------------------------------
        const otp = generateSimpleOtp();
        const otpHash = hashOtp(otp);
        const requestId = require("crypto").randomBytes(16).toString("hex");
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

        await OtpRequest.create({
            request_id: requestId,
            phone,
            otpHash,
            expiresAt,
            lastRequestedAt: new Date(),

            // Store all user inputs securely for final account creation
            userData: {
                phone,
                display_name,
                dob,
                gender,
                preferred_time_zone,
                consent_flags,
                caregiver_mobile,

                // Populate doctor details (either from Link or Manual Input)
                doctor_code: final_doctor_code,
                doctor_name: final_doctor_name,
                doctor_phone: final_doctor_phone,

                corporate_code
            }
        });

        console.log(
            `[AUTH] OTP for ${phone}: ${otp} (Request ID: ${requestId})`
        );

        return res.status(201).json({
            request_id: requestId,
            test_otp_code: otp,
            message: "A verification code has been sent. Verify OTP to complete registration."
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
        // 1. Find OTP entry
        const otpEntry = await OtpRequest.findOne({ request_id });
        if (!otpEntry) {
            return res.status(401).json({ error: "OTP_INVALID (Code not found or expired.)" });
        }
        
        // 2. Expiry check
        if (otpEntry.expiresAt < new Date()) {
            await OtpRequest.deleteOne({ request_id });
            return res.status(410).json({ error: "OTP_EXPIRED (This code has expired.)" });
        }

        // 3. Verify OTP
        const isOtpValid = compareOtp(otp_code, otpEntry.otpHash);
        if (!isOtpValid) {
            return res.status(401).json({ error: "OTP_INVALID (That code didn't match.)" });
        }

        // 4. Avoid race condition
        const existingUser = await User.findOne({ phone: otpEntry.phone });
        if (existingUser) {
            await OtpRequest.deleteOne({ request_id });
            return res.status(409).json({ 
                error: "USER_ALREADY_EXISTS",
                message: "This mobile number is already registered."
            });
        }

        // 5. CREATE NEW USER
        const newUser = await User.create({
            ...otpEntry.userData,   // Includes doctor fields
            isPhoneVerified: true
        });

        // 6. LINK USER TO DOCTOR (if applicable)
        if (newUser.doctor_code) {
            const linkedDoctor = await Doctor.findOne({ doctorCode: newUser.doctor_code });

            if (linkedDoctor) {
                // Add this user ID to the doctor's patient list
                await Doctor.updateOne(
                    { _id: linkedDoctor._id },
                    { $addToSet: { patients: newUser._id } }
                );
                console.log(`[LINK] User ${newUser._id} linked to Doctor ${linkedDoctor._id}`);
            } else {
                console.warn(`[LINK] No matching doctor found for code ${newUser.doctor_code}`);
            }
        }

        // 7. Delete OTP entry
        await OtpRequest.deleteOne({ request_id });

        // 8. Issue tokens
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
        return res.status(500).json({ error: "SERVER_ERROR" });
    }
};

// Existing User Login Flow Endpoints (Modified)
exports.requestOtp = async (req, res) => {
  const { phone } = req.body;

  if (!phone || !phone.startsWith("+")) {
    return res.status(400).json({
      error: "Please enter a valid mobile number in international format eg: +91.... .",
    });
  }

  try {
    // --------------------------------------------
    // 1️⃣ CHECK IF THIS NUMBER BELONGS TO CAREGIVER
    // --------------------------------------------
    const caregiverPatient = await User.findOne({ caregiver_mobile: phone }).lean();

    // --------------------------------------------
    // 2️⃣ CHECK IF THIS NUMBER BELONGS TO NORMAL USER
    // --------------------------------------------
    // Only check user.phone if NOT caregiver
    const existingUser = caregiverPatient
      ? null
      : await User.findOne({ phone }).lean();

    // --------------------------------------------
    // 3️⃣ IF NEITHER → USER NOT FOUND
    // --------------------------------------------
    if (!existingUser && !caregiverPatient) {
      return res.status(404).json({
        error: "USER_NOT_FOUND",
        message: "Mobile number not registered, please sign up.",
        linkedDoctorCode: null,
        caregiver: false,
      });
    }

    // --------------------------------------------
    // 4️⃣ Generate OTP
    // --------------------------------------------
    const otp = generateSimpleOtp();
    const otpHash = hashOtp(otp);
    const requestId =
      typeof nanoid !== "undefined"
        ? nanoid()
        : require("crypto").randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    // --------------------------------------------
    // 5️⃣ Create OTP record with CONTEXT
    // --------------------------------------------
    await OtpRequest.create({
      request_id: requestId,
      phone,
      otpHash,
      expiresAt,
      lastRequestedAt: new Date(),

      // ⭐ LOGIN CONTEXT DECIDES USER TYPE
      loginContext: caregiverPatient
        ? { type: "caregiver", userId: caregiverPatient._id }
        : { type: "user", userId: existingUser._id },
    });

    console.log(`[AUTH] Test OTP for ${phone}: ${otp}`);

    // --------------------------------------------
    // 6️⃣ RESPONSE (CAREGIVER FLAG INCLUDED)
    // --------------------------------------------
    return res.status(202).json({
      request_id: requestId,
      test_otp_code: otp, // REMOVE IN PRODUCTION
      retry_after_seconds: RETRY_AFTER,
      message: "A login code has been sent to your number.",
      caregiver: !!caregiverPatient, // true if caregiver number
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
            return res.status(401).json({
                error: "OTP_INVALID (That code didn't match try again.)"
            });
        }

        // Check expiration
        if (otpEntry.expiresAt < new Date()) {
            await OtpRequest.deleteOne({ request_id });
            return res.status(410).json({
                error: "OTP_EXPIRED (This code has expired. Request a new one.)"
            });
        }

        // Verify OTP
        const isOtpValid = compareOtp(otp_code, otpEntry.otpHash);
        if (!isOtpValid) {
            return res.status(401).json({
                error: "OTP_INVALID (That code didn't match try again.)"
            });
        }

        // Extract login context
        const ctx = otpEntry.loginContext || {};
        const isCaregiver = ctx.type === "caregiver";

        // Delete OTP after use
        await OtpRequest.deleteOne({ request_id });

        // ============================================
        // 1️⃣ CAREGIVER FLOW — return patient's details
        // ============================================
        if (isCaregiver) {
            const patientUser = await User.findById(ctx.userId);

            if (!patientUser) {
                return res.status(404).json({
                    error: "PATIENT_NOT_FOUND (Linked user missing.)"
                });
            }

            const { accessToken, refreshToken } = generateTokens(
                patientUser._id,
                "caregiver"    // ⭐ Tell backend this is caregiver login
            );

            return res.status(200).json({
                user_id: patientUser._id,
                caregiver_login: true,
                onboardingStatus: "complete", // caregivers don't do onboarding
                role: "caregiver",
                access_token: accessToken,
                refresh_token: refreshToken,
                expires_in: 18000
            });
        }

        // ============================================
        // 2️⃣ NORMAL USER FLOW
        // ============================================
        const phone = otpEntry.phone;
        let user = await User.findOne({ phone });

        // Create new user only for NORMAL user flow
        if (!user) {
            user = await User.create({ phone });
            const { accessToken, refreshToken } = generateTokens(user._id);

            return res.status(200).json({
                user_id: user._id,
                new_user: true,
                onboardingStatus: "incomplete",
                access_token: accessToken,
                refresh_token: refreshToken,
                expires_in: 18000
            });
        }

        const onboardingDoc = await Onboarding.findOne({ userId: user._id });
        const onboardingStatus = onboardingDoc ? "complete" : "incomplete";

        const { accessToken, refreshToken } = generateTokens(user._id);

        return res.status(200).json({
            user_id: user._id,
            new_user: false,
            onboardingStatus,
            caregiver_login: false,
            role: "user",
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_in: 18000
        });

    } catch (error) {
        console.error("Error verifying OTP:", error);
        return res.status(500).json({
            error: "SERVER_ERROR (Something went wrong. Please try again.)"
        });
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


exports.requestCaregiverOtp = async (req, res) => {
  const { phone } = req.body;

  try {
    // 1. Basic validation
    if (!phone || !phone.startsWith("+")) {
      return res.status(400).json({
        error: "A valid mobile number in international format is required (e.g. +919876543210).",
      });
    }

    // 2. Find the user where this phone is saved as caregiver_mobile
    const user = await User.findOne({ caregiver_mobile: phone }).lean();

    if (!user) {
      return res.status(404).json({
        error: "No user found for this caregiver number.",
      });
    }

    // 3. Generate OTP and store as usual
    const otp = generateSimpleOtp();
    const otpHash = hashOtp(otp);
    const requestId = crypto.randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await OtpRequest.create({
      request_id: requestId,
      phone,
      otpHash,
      expiresAt,
      lastRequestedAt: new Date(),
      // 👇 store context so we know this is caregiver login
      loginContext: {
        type: "caregiver",
        userId: user._id,      // the patient user
      },
    });

    console.log(
      `[AUTH][CAREGIVER] Test OTP for caregiver ${phone}: ${otp} (Request ID: ${requestId})`
    );

    return res.status(201).json({
      request_id: requestId,
      test_otp_code: otp, // remove in production
      message: "A verification code has been sent to caregiver. Please verify to continue.",
    });
  } catch (error) {
    console.error("Error in requestCaregiverOtp:", error);
    return res
      .status(500)
      .json({ error: "Internal server error during caregiver OTP request." });
  }
};


// ---------------- CAREGIVER LOGIN: VERIFY OTP ----------------
exports.verifyCaregiverOtp = async (req, res) => {
  const { request_id, otp_code } = req.body;

  if (!request_id || !otp_code) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  try {
    // 1. Find OTP entry
    const otpEntry = await OtpRequest.findOne({ request_id });

    if (!otpEntry) {
      return res
        .status(401)
        .json({ error: "OTP_INVALID (Code not found or expired.)" });
    }

    // 2. Check expiration
    if (otpEntry.expiresAt < new Date()) {
      await OtpRequest.deleteOne({ request_id });
      return res.status(410).json({ error: "OTP_EXPIRED (This code has expired.)" });
    }

    // 3. Verify OTP
    const isOtpValid = compareOtp(otp_code, otpEntry.otpHash);
    if (!isOtpValid) {
      return res
        .status(401)
        .json({ error: "OTP_INVALID (That code didn't match.)" });
    }

    // 4. Ensure this OTP was issued for caregiver login
    const ctx = otpEntry.loginContext || {};
    if (ctx.type !== "caregiver" || !ctx.userId) {
      // Safety check: wrong context
      await OtpRequest.deleteOne({ request_id });
      return res
        .status(400)
        .json({ error: "INVALID_CONTEXT (Not a caregiver OTP request.)" });
    }

    // 5. Fetch the *user* (patient) this caregiver is linked to
    const user = await User.findById(ctx.userId);
    if (!user) {
      await OtpRequest.deleteOne({ request_id });
      return res
        .status(404)
        .json({ error: "LINKED_USER_NOT_FOUND (Patient record missing.)" });
    }

    // 6. Clean up OTP entry
    await OtpRequest.deleteOne({ request_id });

    // 7. Generate tokens AS USUAL (same as user login)
    //    If your generateTokens supports payload/roles, you can pass { role: 'caregiver' } later.
    const accessToken = jwt.sign(
        { userId: user._id, role: "caregiver" },
        JWT_ACCESS_SECRET,
        { expiresIn: ACCESS_EXPIRY }
    );

    const refreshToken = jwt.sign(
        { userId: user._id, role: "caregiver" },
        JWT_REFRESH_SECRET,
        { expiresIn: REFRESH_EXPIRY }
    );


    // 8. Respond
    return res.status(200).json({
      user_id: user._id,
      caregiver_login: true,
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 18000,
    });
  } catch (error) {
    console.error("Error in verifyCaregiverOtp:", error);
    return res
      .status(500)
      .json({ error: "SERVER_ERROR (Something went wrong during caregiver login.)" });
  }
};