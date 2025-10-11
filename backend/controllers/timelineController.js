const mongoose = require('mongoose');
const Medication = require('../models/Medication');
const Reminder = require('../models/Reminder');
const TimelineCard = require('../models/TimelineCard');
const User = require('../models/User'); 
const { Onboarding, ValidationError } = require('../models/onboardingModel.js');

const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const isSameOrAfter = require('dayjs/plugin/isSameOrAfter'); 
const isSameOrBefore = require('dayjs/plugin/isSameOrBefore');


dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);

function convertTo24Hour(timeStr) {
    if (!timeStr) return null;
    const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!match) return null;

    let [_, hour, minute, period] = match;
    hour = parseInt(hour);
    minute = parseInt(minute);

    if (period.toUpperCase() === 'PM' && hour !== 12) hour += 12;
    if (period.toUpperCase() === 'AM' && hour === 12) hour = 0;

    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}
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
function calculateScheduledTime(baseTime, minutesToAdd) {
    return dayjs(baseTime).add(minutesToAdd, 'minute');
}

// ----------------------------------------------------------------------
// NEW HELPER: Generates daily timeline cards from Medication/Reminder schedules
// ----------------------------------------------------------------------
const generateTimelineCardsForDay = async (userId, targetDate) => {
    const startOfDay = dayjs(targetDate).startOf('day').toDate();
    const endOfDay = dayjs(targetDate).endOf('day').toDate();

    // 1. Delete existing user-generated cards for that day
    await TimelineCard.deleteMany({
        userId,
        scheduleDate: {
            $gte: startOfDay,
            $lte: endOfDay
        },
        type: { $in: ['USER_REMINDER', 'USER_MEDICATION'] }
    });

    // 2. Fetch medications
    const medications = await Medication.find({
        userId,
        isActive: true,
        startDate: { $lte: targetDate },
        $or: [{ endDate: null }, { endDate: { $gte: targetDate } }]
    }).lean();

    // 3. Fetch reminders
    const reminders = await Reminder.find({
        userId,
        isActive: true,
        startDate: { $lte: targetDate },
        $or: [{ endDate: null }, { endDate: { $gte: targetDate } }]
    }).lean();

    // 4. Prepare cards
    const newCards = [];
    const todayStartUTC = dayjs(targetDate).startOf('day').toDate(); // ✅ correct

    medications.forEach(med => {
        newCards.push({
            userId,
            scheduleDate: todayStartUTC,
            scheduledTime: med.time,
            title: "Medication",
            description: `${med.name} ${med.dosage}`,
            type: 'USER_MEDICATION',
            sourceId: med._id
        });
    });

    reminders.forEach(rem => {
        newCards.push({
            userId,
            scheduleDate: todayStartUTC,
            scheduledTime: rem.time,
            title: rem.title,
            description: null,
            type: 'USER_REMINDER',
            sourceId: rem._id
        });
    });

    console.log("Saved scheduleDate:", todayStartUTC);

    // 5. Insert new cards
    if (newCards.length > 0) {
        await TimelineCard.insertMany(newCards);
    }
};


// ----------------------------------------------------------------------
// Consolidated Home Screen API
// ----------------------------------------------------------------------
exports.getHomeScreenData = async (req, res) => {
    const userId = req.user.userId;
    const dateString = req.query.date || dayjs().format('YYYY-MM-DD');

    try {
        // Fetch all required data concurrently for efficiency
        const [userData, timelineData, cuoreScoreData] = await Promise.all([
            User.findById(userId).select('name profileImage').lean(),
            getTimelineData(userId, dateString),
            getCuoreScoreData(userId)
        ]);

        if (!userData) {
            return res.status(404).json({ message: "User data not found." });
        }
        
        // Construct the final payload based on the requested format
        const homeScreenPayload = {
            user: {
                id: userId,
                name: userData.name,
                profileImage: userData.profileImage || "https://example.com/images/mjohnson.png"
            },
            date: dateString,
            summary: {
                missedTasks: timelineData.missed,
                message: `${timelineData.missed} ${timelineData.missed === 1 ? 'task' : 'tasks'} missed`,
            },
            progress: {
                periods: cuoreScoreData.history.map((score, index, array) => ({
                    month: dayjs(score.date).format("MMM 'YY"),
                    value: score.cuoreScore,
                    userImage: index === array.length - 1 ? (userData.profileImage || "https://example.com/images/mjohnson.png") : undefined
                })),
                goal: ">75%",
                buttonText: "Update Biomarkers"
            },
            motivationalMessage: "Every choice you make today sets you up for a healthier tomorrow.",
            alerts: timelineData.alerts,
            dailySchedule: timelineData.dailySchedule
        };

        res.status(200).json(homeScreenPayload);
    } catch (error) {
        console.error("Error fetching home screen data:", error);
        res.status(500).json({ error: "Internal server error." });
    }
};

// ----------------------------------------------------------------------
// REUSABLE HELPER FUNCTIONS
// ----------------------------------------------------------------------

const getCuoreScoreData = async (userId) => {
    const scoreHistory = await Onboarding.find({ userId, 'scores.cuoreScore': { $exists: true, $ne: 0 } })
        .select('scores.cuoreScore timestamp')
        .sort({ timestamp: 1 })
        .lean();

    if (scoreHistory.length === 0) {
        return { latestScore: 0, colorStatus: 'deep red', history: [] };
    }

    const latestDoc = scoreHistory[scoreHistory.length - 1];
    const latestScore = latestDoc.scores.cuoreScore;

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

    return { 
        latestScore: latestScore,
        colorStatus: colorStatus,
        history: scoreHistory.map(doc => ({
            date: doc.timestamp,
            cuoreScore: doc.scores.cuoreScore,
        }))
    };
};

const getTimelineData = async (userId, dateString) => {
    // 1. Parse the target date in Asia/Kolkata timezone
    const localDay = dayjs(dateString).tz('Asia/Kolkata').startOf('day');

    // 2. Compute start and end of day in UTC for DB query
    const utcStart = localDay.utc().toDate();
    const utcEnd = localDay.endOf('day').utc().toDate();

    // 3. Fetch onboarding data for wake time
    const onboarding = await Onboarding.findOne({ userId })
        .select('o6Data.sleep_hours o6Data.wake_time')
        .lean();

    let preferredWakeTime = convertTo24Hour(onboarding?.o6Data?.wake_time) || '07:00';
    const [wakeHour, wakeMinute] = preferredWakeTime.split(':').map(Number);
    let wakeUpAnchor = localDay.hour(wakeHour).minute(wakeMinute);

    if (!wakeUpAnchor.isValid()) wakeUpAnchor = localDay.hour(7).minute(0);

    // 4. System cards with proper times
    const systemCards = [
        { time: wakeUpAnchor, icon: "🌞", title: "Wake Up", description: "Start your day with Morning Harmony", type: 'SYSTEM_WAKEUP' },
        { time: calculateScheduledTime(wakeUpAnchor, 105), icon: "🍳", title: "Breakfast", description: "Healthy smoothie with oats and banana", type: 'SYSTEM_NUTRITION' },
        { time: calculateScheduledTime(wakeUpAnchor, 360), icon: "🏃", title: "Fitness", description: "Cardio & strength training", type: 'SYSTEM_FITNESS' },
        { time: calculateScheduledTime(wakeUpAnchor, 480), icon: "🍽️", title: "Lunch", description: "Re-energize yourself", type: 'SYSTEM_NUTRITION' },
        { time: calculateScheduledTime(wakeUpAnchor, 720), icon: "😴", title: "Short Nap or Walk", description: "Defeat the midday slump", type: 'SYSTEM_REST' },
        { time: calculateScheduledTime(wakeUpAnchor, 960), icon: "🌙", title: "Dinner", description: "Balanced and light", type: 'SYSTEM_NUTRITION' },
        { time: calculateScheduledTime(wakeUpAnchor, 1200), icon: "🛌", title: "Sleep", description: "Restore & repair", type: 'SYSTEM_REST' },
    ].map(card => ({
        ...card,
        completed: dayjs().isAfter(card.time),
        reminder: true,
        editable: card.type === 'SYSTEM_WAKEUP',
    }));

    // 5. Fetch user timeline cards for this day only
    const rawTimelineCards = await TimelineCard.find({
        userId,
        scheduleDate: { $gte: utcStart, $lte: utcEnd }
    });

    const userAndMedicationCards = rawTimelineCards.map(card => {
        let icon = '📝';
        let editable = true;
        let reminder = true;

        if (card.type === 'USER_MEDICATION') icon = '💊', editable = false;
        else if (card.type === 'USER_REMINDER') icon = '🔔';

        // Parse the scheduledTime string in local timezone, exact as user entered
        const parsedTime = dayjs(`${localDay.format('YYYY-MM-DD')} ${card.scheduledTime}`, 'YYYY-MM-DD h:mm A');

        return {
            time: parsedTime,
            icon,
            title: card.title,
            description: card.description,
            completed: card.isCompleted,
            reminder,
            editable,
            type: card.type
        };
    });

    // 6. Combine system + user cards and sort by actual time
    const allCards = [...systemCards, ...userAndMedicationCards]
        .sort((a, b) => dayjs(a.time).valueOf() - dayjs(b.time).valueOf())
        .map(card => ({
            ...card,
            time: dayjs(card.time).format('h:mm A') // keep string like "10:00 AM"
        }));

    // 7. Count missed tasks
    const missedTasks = allCards.filter(task =>
        !task.completed && dayjs(`${localDay.format('YYYY-MM-DD')} ${task.time}`, 'YYYY-MM-DD h:mm A').isBefore(dayjs())
    ).length;

    const alerts = missedTasks > 0 ? [{
        type: "warning",
        text: "Reassess to keep your plan aligned",
        action: "Check Plan"
    }] : [];

    return { dailySchedule: allCards, missed: missedTasks, alerts };
};

// ----------------------------------------------------------------------
// REMAINING EXPORTED FUNCTIONS (with critical fixes)
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
        
        let newEntry;
        if (isMedication) {
            const [name, dosage] = title.split(' ');
            newEntry = await Medication.create({
                userId,
                name: name || title,
                dosage: dosage || 'N/A',
                startDate: start,
                endDate: end,
                time,
                repeatFrequency
            });
        } else {
            newEntry = await Reminder.create({
                userId,
                title,
                startDate: start,
                endDate: end,
                time,
                repeatFrequency
            });
        }
        
        await generateTimelineCardsForDay(userId, dayjs().toDate());

        return res.status(201).json({ 
            message: `${isMedication ? 'Medication' : 'Reminder'} added successfully.`, 
            type: isMedication ? 'medication' : 'reminder', 
            data: newEntry 
        });

    } catch (error) {
        console.error('Error adding new timeline entry:', error);
        return res.status(500).json({ error: "Internal server error: Could not save entry." });
    }
};

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

exports.updateEntry = async (req, res) => {
    const userId = req.user.userId;
    const { model, docId } = getModelAndId(req);
    
    const { title, startDate, endDate, time, repeatFrequency, name, dosage } = req.body;
    
    const updateData = {};
    if (title) updateData.title = title;
    if (startDate) updateData.startDate = parseDate(startDate);
    if (endDate !== undefined) updateData.endDate = parseDate(endDate);
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
        
        await generateTimelineCardsForDay(userId, dayjs().toDate());

        return res.status(200).json({ message: `${model.modelName} updated successfully.`, data: updatedEntry });

    } catch (error) {
        console.error(`Error updating ${model.modelName}:`, error);
        return res.status(500).json({ error: "Internal server error during update." });
    }
};

exports.getCuoreScore = async (req, res) => {
    try {
        const userId = req.user.userId;
        const scoreData = await getCuoreScoreData(userId);
        res.status(200).json(scoreData);
    } catch (error) {
        console.error('Error in getCuoreScore:', error);
        res.status(500).json({ error: "Internal server error." });
    }
};

exports.getTimeline = async (req, res) => {
    try {
        const userId = req.user.userId;
        const dateString = req.query.date;
        if (!dateString) {
            return res.status(400).json({ error: "Date query parameter is required." });
        }
        const timelineData = await getTimelineData(userId, dateString);
        res.status(200).json({ date: dateString, timeline: timelineData.dailySchedule });
    } catch (error) {
        console.error('Error in getTimeline:', error);
        res.status(500).json({ error: "Internal server error." });
    }
};

exports.completeCard = async (req, res) => {
    res.status(501).json({ message: "Not Implemented Yet. This will mark a task as complete." });
};