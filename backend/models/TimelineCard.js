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
    description: { type: String, default: null },
    type: { 
        type: String, 
        enum: ['SYSTEM', 'USER_REMINDER', 'USER_MEDICATION', 'HEALTH_CHECK'], 
        required: true 
    },

    // 🧠 System Cards (NEW)
    systemKey: { type: String, default: null },  // Example: 'SYSTEM_WAKEUP'
    icon: { type: String, default: null },       // Example: '🌞' (optional but useful)

    // Tracking & Status
    isCompleted: { type: Boolean, default: false },
    completionTime: { type: Date, default: null },
    isMissed: { type: Boolean, default: false },

    // Links to source data (for user reminders/medications)
    sourceId: { type: mongoose.Schema.Types.ObjectId, default: null },

    // For Alerts
    priority: { type: String, enum: ['RED', 'YELLOW', 'GREEN', 'NONE'], default: 'NONE' },

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// ✅ Index for faster lookups (especially for system cards)
timelineCardSchema.index({ userId: 1, scheduleDate: 1, systemKey: 1 });

// Auto-update `updatedAt`
timelineCardSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

module.exports = mongoose.model('TimelineCard', timelineCardSchema);
