const mongoose = require('mongoose');

const tobaccoProfileSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true,
    ref: 'User', // Link to your main User model
  },

  // --- Smoking Profile (Set by user) ---
  cigarettesPerDay: {
    type: Number,
    default: 0,
  },
  yearsOfSmoking: {
    type: Number,
    default: 0,
  },

  // --- Daily Tracking (Managed by the API) ---
  tobaccoFreeDays: {
    type: Number,
    default: 0,
  },
  lastLogEntry: {
    type: Date,
    default: null,
  },
  
  // --- Progression ---
  currentLevel: {
    type: Number,
    default: 0,
  },
  unlockedLevels: {
    type: [Number],
    default: [0],
  },

  // --- NEW FIELDS for Conditional Encouragement ---
  // Stores the *last* count the user entered, for comparison
  previousDayCount: {
    type: Number,
    default: -1, // -1 indicates no log yet
  },
  // Tracks which messages have been shown to avoid repetition
  seenEncouragementIds: {
    type: [String],
    default: [],
  },
  // --- END NEW FIELDS ---

}, { timestamps: true });

const TobaccoProfile = mongoose.model('TobaccoProfile', tobaccoProfileSchema);

module.exports = { TobaccoProfile };

