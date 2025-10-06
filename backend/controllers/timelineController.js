const mongoose = require('mongoose');
const Medication = require('../models/Medication');
const Reminder = require('../models/Reminder');
const User = require('../models/User'); 
const Onboarding = require('../models/onboardingModel'); // <--- CORRECT MODEL IMPORTED

const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const isSameOrAfter = require('dayjs/plugin/isSameOrAfter'); 
const isSameOrBefore = require('dayjs/plugin/isSameOrBefore');

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);

// Utility function to parse date fields from string to Date object
const parseDate = (dateString) => {
    if (!dateString || dateString.toLowerCase() === 'never') return null;
    return new Date(dateString);
};

// Utility to find the correct Model based on the request path
const getModelAndId = (req) => {
    const isMedication = req.originalUrl.includes('/medications');
    const model = isMedication ? Medication : Reminder;
    const docId = isMedication ? req.params.medId : req.params.reminderId;
    return { model, docId };
};

// Helper to calculate time offsets based on anchor time (wakeUp)
const calculateScheduledTime = (anchorTime, offsetMinutes) => {
    // anchorTime is a dayjs object
    return anchorTime.add(offsetMinutes, 'minute');
};

// ----------------------------------------------------------------------
// POST /api/v1/users/:userId/reminders - Add a new Reminder or Medication
// ----------------------------------------------------------------------
exports.addEntry = async (req, res) => {
    const userId = req.user.userId;
    const { 
        title, 
        startDate, 
        endDate,
        time,
        repeatFrequency,
        isMedication
    } = req.body;

    if (!title || !startDate || !time || !repeatFrequency) {
        return res.status(400).json({ error: "Missing required scheduling fields (title / date / time / frequency)." });
    }

    try {
        const start = new Date(startDate);
        const end = parseDate(endDate);

        if (isMedication) {
            const [name, dosage] = title.split(' ');
            
            const newMedication = await Medication.create({
                userId,
                name: name || title,
                dosage: dosage || 'N/A',
                startDate: start,
                endDate: end,
                time,
                repeatFrequency
            });
            return res.status(201).json({ message: "Medication added successfully.", type: 'medication', data: newMedication });

        } else {
            const newReminder = await Reminder.create({
                userId,
                title,
                startDate: start,
                endDate: end,
                time,
                repeatFrequency
            });
            return res.status(201).json({ message: "Reminder added successfully.", type: 'reminder', data: newReminder });
        }

    } catch (error) {
        console.error('Error adding new timeline entry:', error);
        return res.status(500).json({ error: "Internal server error: Could not save entry." });
    }
};

// ----------------------------------------------------------------------
// GET /api/v1/users/:userId/reminders - Get all Reminders (READ)
// GET /api/v1/users/:userId/medications - Get all Medications (READ)
// ----------------------------------------------------------------------
exports.getEntries = async (req, res) => {
    const userId = req.user.userId;
    const isMedicationPath = req.originalUrl.includes('/medications');

    try {
        let entries;
        if (isMedicationPath) {
            entries = await Medication.find({ userId, isActive: true }).select('-__v -userId');
            return res.status(200).json({ type: 'medications', data: entries });
        } else {
            entries = await Reminder.find({ userId, isActive: true }).select('-__v -userId');
            return res.status(200).json({ type: 'reminders', data: entries });
        }
    } catch (error) {
        console.error('Error getting user entries:', error);
        return res.status(500).json({ error: "Internal server error: Could not fetch entries." });
    }
};

// ----------------------------------------------------------------------
// PUT /api/v1/users/:userId/reminders/:reminderId - Update an Entry (UPDATE)
// PUT /api/v1/users/:userId/medications/:medId - Update an Entry (UPDATE)
// ----------------------------------------------------------------------
exports.updateEntry = async (req, res) => {
    const userId = req.user.userId;
    const { model, docId } = getModelAndId(req);
    
    const { title, startDate, endDate, time, repeatFrequency, name, dosage } = req.body;
    
    const updateData = {};
    if (title) updateData.title = title;
    if (startDate) updateData.startDate = parseDate(startDate);
    if (endDate !== undefined) updateData.endDate = parseDate(endDate); // Handles 'never' being passed as null/string
    if (time) updateData.time = time;
    if (repeatFrequency) updateData.repeatFrequency = repeatFrequency;
    
    if (model === Medication) {
        if (name) updateData.name = name;
        if (dosage) updateData.dosage = dosage;
    }

    try {
        const updatedEntry = await model.findOneAndUpdate(
            { _id: docId, userId: userId }, 
            { $set: updateData },
            { new: true, runValidators: true }
        );

        if (!updatedEntry) {
            return res.status(404).json({ error: `${model.modelName} not found or access denied.` });
        }

        return res.status(200).json({ message: `${model.modelName} updated successfully.`, data: updatedEntry });

    } catch (error) {
        console.error(`Error updating ${model.modelName}:`, error);
        return res.status(500).json({ error: "Internal server error during update." });
    }
};

// ----------------------------------------------------------------------
// GET /api/v1/users/:userId/cuore-score - Get Cuore Score History for Progress Bar
// ----------------------------------------------------------------------
exports.getCuoreScore = async (req, res) => {
    // The protect middleware ensures req.user.userId is safe to use.
    const userId = req.user.userId;

    try {
        // 1. Fetch ALL finalized scores from the Onboarding collection
        const scoreHistory = await Onboarding.find({ userId, 'scores.cuoreScore': { $exists: true, $ne: 0 } })
            .select('scores.cuoreScore scores.o7Score timestamp')
            .sort({ timestamp: 1 }) // 1 = ascending (oldest first) for charting
            .lean();

        if (scoreHistory.length === 0) {
            // If no scores found, return a default state for the progress bar
            return res.status(200).json({ 
                latestScore: 0, 
                colorStatus: 'deep red', 
                history: [],
                targetScore: 75,
                message: "No finalized scores yet."
            });
        }

        // 2. Get the latest score and date (The last item in the sorted array)
        const latestDoc = scoreHistory[scoreHistory.length - 1];
        const latestScore = latestDoc.scores.cuoreScore;

        // 3. Define color status dynamically based on the latestScore
        let colorStatus;
        if (latestScore > 75) {
            colorStatus = 'green';
        } else if (latestScore >= 50) {
            colorStatus = 'yellow';
        } else if (latestScore >= 25) {
            colorStatus = 'light red';
        } else {
            colorStatus = 'deep red';
        }
        
        // 4. Map the data into a clean structure for the frontend chart (Timeline Data)
        const timelineData = scoreHistory.map(doc => ({
            date: doc.timestamp, // X-axis time point
            cuoreScore: doc.scores.cuoreScore, // Y-axis value
            o7Score: doc.scores.o7Score 
        }));

        // 5. This response provides both the single latest score (for the main bar)
        // and the full history array (for the progress chart).
        return res.status(200).json({ 
            latestScore: latestScore,
            colorStatus: colorStatus,
            scoreDate: latestDoc.timestamp, 
            targetScore: 75,
            history: timelineData,
            message: "Score history retrieved successfully."
        });

    } catch (error) {
        console.error('Error fetching Cuore score:', error);
        return res.status(500).json({ error: "Internal server error." });
    }
};

// ----------------------------------------------------------------------
// GET /api/v1/users/:id/timeline - Get the full daily schedule (The Engine)
// ----------------------------------------------------------------------
exports.getTimeline = async (req, res) => {
    const userId = req.user.userId;
    const dateString = req.query.date; // Expecting YYYY-MM-DD
    
    if (!dateString) {
        return res.status(400).json({ error: "Date query parameter (YYYY-MM-DD) is required." });
    }

    try {
        const user = await User.findById(userId).select('preferred_time_zone preferred_wake_time').lean();
        if (!user) {
            return res.status(404).json({ error: "User not found." });
        }

        // 1. Setup Time Context
        const targetDate = dayjs(dateString).startOf('day');
        const userTimezone = user.preferred_time_zone || 'Asia/Kolkata'; 

        // Anchor the Wake Up time to the target date in the user's timezone
        const preferredWakeTime = user.preferred_wake_time || '07:00'; 
        const [wakeHour, wakeMinute] = preferredWakeTime.split(':').map(Number);
        
        // This is the starting point for all calculations
        let wakeUpAnchor = dayjs.tz(targetDate.format('YYYY-MM-DD'), userTimezone).hour(wakeHour).minute(wakeMinute);

        let timeline = [];

        // --- 2. Generate System Cards (Based on Page 7 Offsets) ---
        
        // A. Wake Up (0 min offset)
        timeline.push({ 
            scheduledTime: wakeUpAnchor.format('HH:mm'), 
            title: 'Wake Up', 
            type: 'SYSTEM_WAKEUP' 
        });

        // B. Breakfast (Add 1 hour 45 min = 105 min)
        const breakfastTime = calculateScheduledTime(wakeUpAnchor, 105); 
        timeline.push({ 
            scheduledTime: breakfastTime.format('HH:mm'), 
            title: 'Breakfast', 
            type: 'SYSTEM_NUTRITION',
            description: 'Boost your energy'
        });

        // C. Sleep (Add 16 hours = 960 min)
        const sleepTime = calculateScheduledTime(wakeUpAnchor, 16 * 60); 
        timeline.push({ 
            scheduledTime: sleepTime.format('HH:mm'), 
            title: 'Sleep', 
            type: 'SYSTEM_REST',
            description: 'Restore & repair'
        });
        
        // NOTE: Other system cards (Lunch, Dinner, Fitness) would be added here

        // --- 3. Integrate User Reminders and Medications ---

        // Helper to check if entry is active on the target date 
        const isActiveOnDate = (entry, date) => {
            return dayjs(entry.startDate).isSameOrBefore(date, 'day') && (entry.endDate === null || dayjs(entry.endDate).isSameOrAfter(date, 'day'));
        };
        
        // Fetch user-defined entries
        const rawReminders = await Reminder.find({ userId, isActive: true });
        const rawMedications = await Medication.find({ userId, isActive: true });

        // Add active user entries to the timeline
        [...rawReminders, ...rawMedications].forEach(entry => {
            if (isActiveOnDate(entry, targetDate)) {
                timeline.push({
                    scheduledTime: entry.time,
                    title: entry.title || entry.name,
                    type: entry.name ? 'USER_MEDICATION' : 'USER_REMINDER',
                    sourceId: entry._id
                });
            }
        });

        // --- 4. Final Sorting and Output ---
        
        timeline.sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));

        return res.status(200).json({ date: dateString, timeline });

    } catch (error) {
        console.error('Error getting timeline:', error);
        return res.status(500).json({ error: "Internal server error." });
    }
};


// ----------------------------------------------------------------------
// Placeholder for Step 6: POST /api/v1/users/:id/timeline/cards/:card_id/complete
// ----------------------------------------------------------------------
exports.completeCard = async (req, res) => {
    res.status(501).json({ message: "Not Implemented Yet. This will mark a task as complete." });
};
