const mongoose = require('mongoose');

const timelineCardSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // Schedule Data
    scheduleDate: { type: Date, required: true }, // The day this card belongs to
    scheduledTime: { type: String, required: true }, // HH:MM string (e.g., "08:30")
    
    // Card Content & Type
    title: { type: String, required: true },
    description: { type: String },
    type: { 
        type: String, 
        enum: ['SYSTEM', 'USER_REMINDER', 'USER_MEDICATION', 'HEALTH_CHECK'], 
        required: true 
    },
    
    // Tracking & Status
    isCompleted: { type: Boolean, default: false },
    completionTime: { type: Date, default: null },
    isMissed: { type: Boolean, default: false },
    
    // Links to source data
    sourceId: { type: mongoose.Schema.Types.ObjectId, default: null }, // Link back to Reminder/Medication/Alert
    
    // For System-Generated Tasks (like Wake Up, Breakfast)
    systemKey: { type: String, default: null }, 
    
    // For Alerts
    priority: { type: String, enum: ['RED', 'YELLOW', 'GREEN', 'NONE'], default: 'NONE' },
    
    createdAt: { type: Date, default: Date.now }
});

// Create a compound index for efficient querying by user and date
timelineCardSchema.index({ userId: 1, scheduleDate: 1 });

module.exports = mongoose.model('TimelineCard', timelineCardSchema);
