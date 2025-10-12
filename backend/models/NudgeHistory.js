const mongoose = require('mongoose');

const nudgeHistorySchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    segment: {
        type: String,
        required: true // e.g., 'today_smoking', 'today_medication_missed'
    },
    lastShownIndex: {
        type: Number,
        default: -1 // Start at -1 so the first increment brings it to 0
    }
});

// Add a compound index for efficient lookups and to prevent duplicate entries
nudgeHistorySchema.index({ userId: 1, segment: 1 }, { unique: true });

const NudgeHistory = mongoose.model('NudgeHistory', nudgeHistorySchema);

module.exports = NudgeHistory;