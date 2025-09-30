const mongoose = require('mongoose');

// Define OTP TTL (Time To Live) in seconds, matching spec (5 minutes = 300s)
const OTP_TTL = 300; 

const otpRequestSchema = new mongoose.Schema({
    // Identifier used to match the request
    request_id: { type: String, required: true, unique: true }, 

    // User identification
    phone: { type: String, required: true },
    
    // OTP storage (hashed for security)
    otpHash: { type: String, required: true }, 

    // Expiration timestamp. MongoDB will automatically delete documents after this time.
    expiresAt: {
        type: Date,
        default: Date.now,
        expires: OTP_TTL, // TTL Index automatically deletes doc after 300 seconds
    },

    // Tracking attempts and rate-limiting data (if implementing advanced logic)
    attempts: { type: Number, default: 0 },
    lastRequestedAt: { type: Date, default: Date.now },

}, { timestamps: true });

module.exports = mongoose.model('OtpRequest', otpRequestSchema);
