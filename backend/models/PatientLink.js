const mongoose = require('mongoose');

const patientLinkSchema = new mongoose.Schema({
    patientMobile: {
        type: String,
        required: true,
        unique: true, // Only one link per mobile number
        match: [/^\+[1-9]\d{1,14}$/, 'Please use international format (e.g., +91...)'],
    },
    doctorCode: {
        type: String,
        required: true,
    },
    planDuration: {
        type: String, // e.g., "3 Months", "12 Months"
    },
    // This will auto-delete the link after 30 days if not used
    expiresAt: {
        type: Date,
        default: () => Date.now() + 30*24*60*60*1000, // 30 days from now
        expires: '30d', 
    }
}, { timestamps: true });

module.exports = mongoose.model('PatientLink', patientLinkSchema);