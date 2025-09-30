const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    // Primary Identifier
    phone: { 
        type: String, 
        required: true, 
        unique: true,
        // Enforce E.164 format, as specified in the docs (e.g., +911234567890)
        match: /^\+[1-9]\d{1,14}$/ 
    },
    
    // Profile Data (to be added via PUT /profile)
    display_name: { type: String, default: '' },
    dob: { type: Date },
    gender: { type: String },
    preferred_time_zone: { type: String }, // From specs

    // Authentication Status
    isPhoneVerified: { type: Boolean, default: false },

    // Consent Flags (based on Technical Specs)
    consent_flags: {
        tos: { type: Boolean, default: false },
        share_with_doctor: { type: Boolean, default: false }
    },

    // Temporary OTP fields (will be used by the controller)
    otp: { type: String }, 
    otpExpiration: { type: Date },

     caregiver_mobile: { type: String, match: /^\+[1-9]\d{1,14}$/ },
    doctor_code: { type: String },
    corporate_code: { type: String },

}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);