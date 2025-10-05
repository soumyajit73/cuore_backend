const mongoose = require('mongoose');

const reminderSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // Reminder Details
    title: { type: String, required: true },
    
    // Scheduling Details
    startDate: { type: Date, required: true },
    endDate: { type: Date, default: null },
    time: { type: String, required: true }, // HH:MM string
    repeatFrequency: { type: String, enum: ['Daily', 'Weekly', 'Monthly'], default: 'Daily' },
    
    // Tracking
    isMedication: { type: Boolean, default: false }, // Should be handled by the Medication model, but included for flexibility
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Reminder', reminderSchema);