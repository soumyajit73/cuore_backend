const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const doctorSchema = new mongoose.Schema({
    displayName: {
        type: String,
        required: [true, 'Full name is required'],
    },
    mobileNumber: {
        type: String,
        required: [true, 'Mobile number is required'],
        unique: true,
        match: [/^\+[1-9]\d{1,14}$/, 'Please fill a valid mobile number (e.g., +919876543210)'],
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: 6,
        select: false, // Don't send password in queries by default
    },
    // --- New fields from Create Account screen ---
    address: {
        clinicAddress: String,
        areaSector: String,
        city: String,
    },
    // Storing the 3 fee tiers
    fees: {
        threeMonths: { type: Number, default: 600 },
        sixMonths: { type: Number, default: 1000 },
        twelveMonths: { type: Number, default: 1500 },
    },
    accountManagerCode: {
        type: String,
        sparse: true, // This field is optional and doesn't need to be unique if empty
    },
    // --- End new fields ---
    doctorCode: {
        type: String,
        required: true,
        unique: true,
        sparse: true,
    },
    photoUrl: {
        type: String,
        default: 'https://example.com/default-doctor-avatar.png',
    },
    patients: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    // OTP for registration OR login
    otp: String,
    otpExpires: Date,
}, { timestamps: true });

// This part automatically hashes the password before saving
doctorSchema.pre('save', async function (next) {
    if (!this.isModified('password')) {
        return next();
    }
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

// This part adds a helper function to compare the login password
doctorSchema.methods.comparePassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('Doctor', doctorSchema);