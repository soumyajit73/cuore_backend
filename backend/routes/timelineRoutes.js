const express = require('express');
const router = express.Router();
const timelineController = require('../controllers/timelineController');
const { protect } = require('../middleware/authMiddleware'); // Middleware to protect routes

// All routes here are protected and must include a valid JWT token
// ------------------------------------------------------------------------------------

// POST /api/v1/users/:userId/reminders - Add new entry (Reminder or Medication)
router.post('/:userId/reminders', protect, timelineController.addEntry);

// GET /api/v1/users/:userId/reminders - List all reminders
router.get('/:userId/reminders', protect, timelineController.getEntries);

// Get all Medications
// router.get('/:userId/medications', protect, timelineController.getEntries);

// PUT /api/v1/users/:userId/reminders/:reminderId - Update a Reminder
router.put('/:userId/reminders/:reminderId', protect, timelineController.updateEntry);



// PUT /api/v1/users/:userId/medications/:medId - Update a Medication
// router.put('/:userId/medications/:medId', protect, timelineController.updateEntry);

// get cuore score
router.get('/:userId/cuore-score', protect, timelineController.getCuoreScore);

// New consolidated route for the home screen API
router.get('/:userId/home', protect, timelineController.getHomeScreenData);

// --- Placeholders for future APIs ---
router.get('/:userId/timeline', protect, timelineController.getTimeline);

router.put('/:userId/timeline/wakeup', protect, timelineController.updateWakeUpTime);

router.get('/:userId/cuore-score-details' , protect, timelineController.getCuoreScoreDetails);

router.delete('/:userId/reminders/:reminderId', protect, timelineController.deleteReminder);

router.put("/:userId/complete/:reminderId", protect, timelineController.completeCard);

// Mark alarm as notified (bell icon pressed)
router.put('/:userId/notified/:reminderId', protect, timelineController.markAlarmNotified);

router.put('/:userId/off/:reminderId', protect, timelineController.markAlarmOff);


// router.post('/:userId/clear-checkin', protect, timelineController.clearDoctorCheckin);
module.exports = router;