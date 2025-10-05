const express = require('express');
const router = express.Router();
const timelineController = require('../controllers/timelineController');
const { protect } = require('../middleware/authMiddleware'); // Middleware to protect routes

// All routes here are protected and must include a valid JWT token
// ------------------------------------------------------------------------------------

// POST /api/v1/users/:userId/reminders - Add new entry (Reminder or Medication)
// This matches the POST endpoint in your API inventory (Reminders section)
router.post('/:userId/reminders', protect, timelineController.addEntry);

// GET /api/v1/users/:userId/reminders - List all reminders
router.get('/:userId/reminders', protect, timelineController.getEntries);

// router.get('/:userId/reminders', protect, timelineController.getEntries);

// Get all Medications
router.get('/:userId/medications', protect, timelineController.getEntries);

// PUT /api/v1/users/:userId/reminders/:reminderId - Update a Reminder
router.put('/:userId/reminders/:reminderId', protect, timelineController.updateEntry);

// PUT /api/v1/users/:userId/medications/:medId - Update a Medication
router.put('/:userId/medications/:medId', protect, timelineController.updateEntry);

// get cuore score
router.get('/:userId/cuore-score', protect, timelineController.getCuoreScore);

// --- Placeholders for future APIs ---
// router.get('/:userId/medications', protect, timelineController.getEntries); 
router.get('/:userId/timeline', protect, timelineController.getTimeline);

module.exports = router;