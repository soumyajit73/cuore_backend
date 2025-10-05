const mongoose = require('mongoose');

const medicationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // Medication Details
    name: { type: String, required: true },
    dosage: { type: String, required: true },
    
    // Scheduling Details
    startDate: { type: Date, required: true },
    endDate: { type: Date, default: null }, // Null means 'Never' (End Repeat)
    time: { type: String, required: true }, // HH:MM string for scheduling
    repeatFrequency: { type: String, enum: ['Daily', 'Weekly', 'Monthly'], default: 'Daily' },
    
    // Tracking
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Medication', medicationSchema);