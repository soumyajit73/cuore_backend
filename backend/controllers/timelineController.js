const mongoose = require('mongoose');
const Medication = require('../models/Medication');
const Reminder = require('../models/Reminder');
const TimelineCard = require('../models/TimelineCard');
const User = require('../models/User');
const { Onboarding } = require('../models/onboardingModel.js');

const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const isSameOrAfter = require('dayjs/plugin/isSameOrAfter');
const isSameOrBefore = require('dayjs/plugin/isSameOrBefore');
const customParseFormat = require('dayjs/plugin/customParseFormat');

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);
dayjs.extend(customParseFormat);

const TZ = 'Asia/Kolkata';

// -----------------------------------------------------
// Utility Functions
// -----------------------------------------------------
function convertTo24Hour(timeStr) {
    if (!timeStr) return null;
    const match12 = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (match12) {
        let [_, hour, minute, period] = match12;
        hour = parseInt(hour);
        minute = parseInt(minute);
        if (period.toUpperCase() === 'PM' && hour !== 12) hour += 12;
        if (period.toUpperCase() === 'AM' && hour === 12) hour = 0;
        return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    }
    const match24 = timeStr.match(/(\d{1,2}):(\d{2})/);
    if (match24) {
        let [_, hour, minute] = match24;
        hour = parseInt(hour);
        minute = parseInt(minute);
        if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
            return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        }
    }
    return null;
}

const parseDate = (dateString) => {
    if (!dateString || dateString.toLowerCase() === 'never') return null;
    return new Date(dateString);
};

function calculateScheduledTime(baseTime, minutesToAdd) {
    return dayjs(baseTime).add(minutesToAdd, 'minute');
}

function getModelAndId(req) {
    const isMedication = req.originalUrl.includes('/medications');
    const model = isMedication ? Medication : Reminder;
    const docId = isMedication ? req.params.medId : req.params.reminderId;
    return { model, docId };
}

function getColorStatus(value, greenThreshold, yellowThreshold, redThreshold) {
    if (value > greenThreshold) return 'green';
    if (value >= yellowThreshold) return 'yellow';
    if (value >= redThreshold) return 'red';
    return 'deep red'; // Or an appropriate default
}

const calculateHealthMetrics = (onboardingDoc) => {
    const { o2Data, o7Data, derivedMetrics, scores } = onboardingDoc;
    const { age, gender, height_cm, weight_kg, waist_cm } = o2Data;
    const { bmi, wthr } = derivedMetrics;

    // --- Cuore Score ---
    const health_score = scores.cuoreScore;

    // --- Metabolic Age ---
    const metabolicAgeFactor = health_score >= 75 ? 0.95 : health_score <= 50 ? 1.2 : 1.1;
    const metabolicAge = Math.round(age * metabolicAgeFactor);
    const metabolicAgeGap = metabolicAge - age;

    // --- Time to Target ---
    const diffWeight = Math.abs(weight_kg - (gender === 'male' ? 52 + 1.9 * ((height_cm - 152.4) / 2.4) : 50 + 1.7 * ((height_cm - 152.4) / 2.4)));
    const diffBP = Math.abs(o7Data.bp_upper - 120);
    const diffBS = Math.abs(o7Data.bs_am - 160);
    const timeToTarget = Math.max(Math.ceil(diffWeight / 1.2), Math.ceil(diffBP / 2), Math.ceil(diffBS / 10)) + 1;

    // --- Weight ---
    const targetWeight = gender === 'male' ? 52 + 1.9 * ((height_cm - 152.4) / 2.4) : 50 + 1.7 * ((height_cm - 152.4) / 2.4);
    const weightDiffPercent = Math.abs(weight_kg - targetWeight) / targetWeight * 100;
    const weightStatus = weightDiffPercent < 5 ? 'green' : weightDiffPercent <= 15 ? 'orange' : 'red';

    // --- BMI ---
    const targetBMI = gender === 'male' ? 22.5 : 23.5;
    const bmiDiffPercent = Math.abs(bmi - targetBMI) / targetBMI * 100;
    const bmiStatus = bmiDiffPercent < 5 ? 'green' : bmiDiffPercent <= 15 ? 'orange' : 'red';
    
    // --- Recommended Calories ---
    let recommendedCalories;
    if (bmi < 21) {
        recommendedCalories = (gender === 'male' ? (66.47 + 13.75 * weight_kg + 5 * height_cm - 6.75 * age) * 1.15 : (665.1 + 9.563 * weight_kg + 1.85 * height_cm - 4.67 * age) * 1.15);
    } else if (bmi >= 21 && bmi <= 24) {
        recommendedCalories = (gender === 'male' ? (66.47 + 13.75 * weight_kg + 5 * height_cm - 6.75 * age) : (665.1 + 9.563 * weight_kg + 1.85 * height_cm - 4.67 * age));
    } else {
        recommendedCalories = (gender === 'male' ? (66.47 + 13.75 * weight_kg + 5 * height_cm - 6.75 * age) * 0.8 : (665.1 + 9.563 * weight_kg + 1.85 * height_cm - 4.67 * age) * 0.8);
    }
    recommendedCalories = Math.round(recommendedCalories / 100) * 100;

    // --- Recommended Exercise ---
    const recommendedExercise = scores.o5Score < 75 ? 15 : scores.o5Score <= 150 ? 30 : 45;

    // --- Lifestyle Score ---
    const lifestyleScore = 100 - (scores.o5Score / 100); // This is a placeholder, as the formula is complex
    const lifestyleStatus = lifestyleScore > 70 ? 'green' : lifestyleScore >= 55 ? 'orange' : 'red';

    // --- Vitals ---
    const bpUpperStatus = o7Data.bp_upper < 100 ? 'orange' : o7Data.bp_upper <= 130 ? 'green' : o7Data.bp_upper <= 145 ? 'orange' : 'red';
    const bpLowerStatus = o7Data.bp_lower < 64 ? 'orange' : o7Data.bp_lower <= 82 ? 'green' : o7Data.bp_lower <= 95 ? 'orange' : 'red';
    const bsFastingTarget = scores.o3Data?.hasDiabetes ? '<100' : '<100';
    const bsFastingStatus = scores.o3Data?.hasDiabetes ? (o7Data.bs_f < 100 ? 'red' : o7Data.bs_f <= 139 ? 'green' : o7Data.bs_f <= 170 ? 'orange' : 'red') : (o7Data.bs_f < 100 ? 'green' : o7Data.bs_f <= 125 ? 'orange' : 'red');
    const bsAfterMealTarget = scores.o3Data?.hasDiabetes ? '<160' : '<140';
    const bsAfterMealStatus = scores.o3Data?.hasDiabetes ? (o7Data.bs_am < 130 ? 'red' : o7Data.bs_am <= 169 ? 'green' : o7Data.bs_am <= 220 ? 'orange' : 'red') : (o7Data.bs_am < 140 ? 'green' : o7Data.bs_am <= 200 ? 'orange' : 'red');
    const trigHDLRatioStatus = o7Data.trig_hdl_ratio < 2.8 ? 'green' : o7Data.trig_hdl_ratio <= 4.0 ? 'orange' : 'red';
    const targetBodyFat = gender === 'male' ? 23 : 30;
    const bodyFat = gender === 'male' ? (1.2 * bmi) + (0.23 * age) - 16.2 : (1.2 * bmi) + (0.23 * age) - 5.4;
    const bodyFatDiffPercent = Math.abs(bodyFat - targetBodyFat) / targetBodyFat * 100;
    const bodyFatStatus = bodyFatDiffPercent < 5 ? 'green' : bodyFatDiffPercent <= 15 ? 'orange' : 'red';
    
    // --- Main Focus ---
    // Placeholder logic for Main Focus
    const mainFocus = ["Nutrition", "Fitness"]; // This would be dynamic

    return {
        health_score,
        estimated_time_to_target: { value: timeToTarget, unit: "months" },
        metabolic_age: { value: metabolicAge, unit: "years", gap: metabolicAgeGap },
        weight: { current: weight_kg, target: targetWeight, unit: "kg", status: weightStatus },
        bmi: { value: bmi, target: targetBMI, status: bmiStatus },
        lifestyle_score: { value: lifestyleScore, target: 75, unit: "%", status: lifestyleStatus },
        recommended: {
            calories: { value: recommendedCalories, unit: "kcal" },
            exercise: { value: recommendedExercise, unit: "min" }
        },
        vitals: {
            blood_pressure: {
                current: `${o7Data.bp_upper}/${o7Data.bp_lower}`,
                target: "120/80",
                status: { upper: bpUpperStatus, lower: bpLowerStatus }
            },
            blood_sugar: {
                fasting: { value: o7Data.bs_f, target: bsFastingTarget, status: bsFastingStatus },
                after_meal: { value: o7Data.bs_am, target: bsAfterMealTarget, status: bsAfterMealStatus }
            },
            cholesterol: {
                tg_hdl_ratio: {
                    value: o7Data.trig_hdl_ratio,
                    target: "<2.6",
                    status: trigHDLRatioStatus
                }
            },
            body_fat: {
                value: Math.round(bodyFat * 100) / 100,
                target: targetBodyFat,
                unit: "%",
                status: bodyFatStatus
            }
        },
        main_focus: mainFocus
    };
};

// Alerts function
const getAlerts = async (userId) => {
    const alerts = [];
    const onboarding = await Onboarding.findOne({ userId }).lean();
    if (!onboarding) return [];

    const { scores, o3Data, o7Data } = onboarding;
    const now = dayjs();

    // --- Red Alerts (Critical) ---
    // Rule 225: SOB or chest discomfort in Onboarding 3
    if (o3Data.q5) {
        alerts.push({ type: 'red', text: 'Consult your doctor promptly.', action: 'Consult' });
    }
    // Rule 234, 244: High/low BP
    if (o7Data.bp_upper > 170 || o7Data.bp_upper < 90 || o7Data.bp_lower > 110 || o7Data.bp_lower < 60) {
        alerts.push({ type: 'red', text: 'Consult your doctor for BP.', action: 'Consult' });
    }
    // Rule 254: High/low pulse rate
    if (o7Data.pulse < 50 || o7Data.pulse > 120) {
        alerts.push({ type: 'red', text: 'Consult your doctor for heart rate.', action: 'Consult' });
    }
    // Rule 287: O2 Saturation
    if (o7Data.o2_sat < 91) {
        alerts.push({ type: 'red', text: 'Consult your doctor for O2 Sat.', action: 'Consult' });
    }
    // Rule 223: Check-in requested by doctor (Requires a flag from Veyra/doctor app)
    // if (onboarding.doctorCheckinRequested) {
    //     alerts.push({ type: 'red', text: 'Check-in requested by doctor.' });
    // }

    // --- Orange Alerts (Important) ---
    // Rule 224: Cuore score low and last consultation is old
    // NOTE: Requires a last_consultation_date field in the Onboarding model
    // if (scores.cuoreScore < 55 && dayjs(onboarding.lastConsultationDate).isBefore(now.subtract(100, 'days'))) {
    //     alerts.push({ type: 'orange', text: 'It’s time to check in with your doctor.' });
    // }
    // Rule 227: Diabetes symptoms in Onboarding 3
    if (o3Data.q6) {
        alerts.push({ type: 'orange', text: 'Consult your doctor for diabetes.', action: 'Consult' });
    }
    // Rule 228: Reassessment not done
    // NOTE: Requires a last_reassessment_date field in Onboarding model
    // if (dayjs(onboarding.lastReassessmentDate).isBefore(now.subtract(55, 'days'))) {
    //     alerts.push({ type: 'orange', text: 'Reassess now to keep your plan aligned.', action: 'Reassess' });
    // }
    // Rule 235, 245: Borderline BP
    if ((o7Data.bp_upper >= 150 && o7Data.bp_upper <= 170) || (o7Data.bp_upper >= 90 && o7Data.bp_upper <= 100) ||
        (o7Data.bp_lower >= 100 && o7Data.bp_lower <= 110) || (o7Data.bp_lower >= 60 && o7Data.bp_lower <= 66)) {
        alerts.push({ type: 'orange', text: 'Consult your doctor for BP.', action: 'Consult' });
    }
    // Rule 261, 268: Borderline blood sugar
    if (o7Data.bs_f > 240 || o7Data.bs_f < 100 || o7Data.bs_am > 260 || o7Data.bs_am < 120) {
        alerts.push({ type: 'orange', text: 'Monitor sugar & consult your doctor.', action: 'Monitor' });
    }
    // Rule 295: Cholesterol
    if (o7Data.HDL < 45 || o7Data.LDL > 180 || o7Data.Trig > 200) {
        alerts.push({ type: 'orange', text: 'Consult your doctor for Cholesterol.', action: 'Consult' });
    }

    // --- Yellow Alerts (Warning) ---
    // Rule 236, 246: Monitor BP
    if ((o7Data.bp_upper >= 140 && o7Data.bp_upper <= 150) || (o7Data.bp_upper >= 100 && o7Data.bp_upper <= 110) ||
        (o7Data.bp_lower >= 88 && o7Data.bp_lower <= 100) || (o7Data.bp_lower >= 66 && o7Data.bp_lower <= 74)) {
        alerts.push({ type: 'yellow', text: 'Monitor BP.', action: 'Monitor' });
    }
    // Rule 262, 269: Monitor sugar
    if ((o7Data.bs_f >= 200 && o7Data.bs_f <= 240) || (o7Data.bs_f >= 100 && o7Data.bs_f <= 140) ||
        (o7Data.bs_am >= 220 && o7Data.bs_am <= 260) || (o7Data.bs_am >= 120 && o7Data.bs_am <= 160)) {
        alerts.push({ type: 'yellow', text: 'Monitor sugar.', action: 'Monitor' });
    }
    // Rule 237, 247: BP spike (Requires previous readings)
    // if (o7Data.bp_upper - previous_bp_upper > 20 || o7Data.bp_lower - previous_bp_lower > 10) {
    //     alerts.push({ type: 'yellow', text: 'BP spike! Try deep breathing.', action: 'Breathing' });
    // }
    // Rule 293: Exercise timing
    // NOTE: This requires knowing meal times, a complex check
    // if (exerciseTime is within 60 mins of a meal) {
    //     alerts.push({ type: 'yellow', text: 'Avoid exercising within 60 minutes of eating.' });
    // }

    // --- Pale Yellow Alerts (Advisory) ---
    // Rule 232: Update blood reports
    // NOTE: Requires last_report_date fields
    // if (dayjs(onboarding.lastBloodReportDate).isBefore(now.subtract(12, 'months'))) {
    //     alerts.push({ type: 'pale_yellow', text: 'Update blood reports.', action: 'Update' });
    // }
    // Rule 294: Connect to a doctor
    if (!onboarding.doctor_code) {
        alerts.push({ type: 'pale_yellow', text: 'Connect to a doctor for alert monitoring.', action: 'Connect' });
    }

    // Sort alerts by severity (Red > Orange > Yellow > Pale Yellow)
    const severityOrder = { 'red': 1, 'orange': 2, 'yellow': 3, 'pale_yellow': 4 };
    if (alerts.length > 0) {
        alerts.sort((a, b) => severityOrder[a.type] - severityOrder[b.type]);
        // Return only the most critical alert
        return [alerts[0]];
    }

    return [];
};
// -----------------------------------------------------
// Generate Timeline Cards
// -----------------------------------------------------
const generateTimelineCardsForDay = async (userId, targetDate) => {
    const localDay = dayjs(targetDate).tz(TZ).startOf('day');
    const startOfDayUTC = localDay.utc().toDate();
    const endOfDayUTC = localDay.endOf('day').utc().toDate();

    await TimelineCard.deleteMany({
        userId,
        scheduleDate: { $gte: startOfDayUTC, $lte: endOfDayUTC },
        type: { $in: ['USER_REMINDER', 'USER_MEDICATION'] }
    });

    const medications = await Medication.find({
        userId,
        isActive: true,
        startDate: { $lte: localDay.endOf('day').toDate() },
        $or: [{ endDate: null }, { endDate: { $gte: localDay.startOf('day').toDate() } }]
    }).lean();

    const reminders = await Reminder.find({
        userId,
        isActive: true,
        startDate: { $lte: localDay.endOf('day').toDate() },
        $or: [{ endDate: null }, { endDate: { $gte: localDay.startOf('day').toDate() } }]
    }).lean();

    const newCards = [];

    medications.forEach(med => {
        const timeStr = convertTo24Hour(med.time) || '00:00';
        newCards.push({
            userId,
            scheduleDate: med.startDate,
            scheduledTime: timeStr,
            title: 'Medication',
            description: `${med.name} ${med.dosage}`,
            type: 'USER_MEDICATION',
            sourceId: med._id
        });
    });

    reminders.forEach(rem => {
        const timeStr = convertTo24Hour(rem.time) || '00:00';
        newCards.push({
            userId,
            scheduleDate: rem.startDate,
            scheduledTime: timeStr,
            title: rem.title,
            description: null,
            type: 'USER_REMINDER',
            sourceId: rem._id
        });
    });

    if (newCards.length > 0) await TimelineCard.insertMany(newCards);
};


// -----------------------------------------------------
// Home Screen Controller
// -----------------------------------------------------
exports.getHomeScreenData = async (req, res) => {
    const userId = req.user.userId;
    const dateString = req.query.date || dayjs().tz(TZ).format('YYYY-MM-DD');
    const todayDate = dayjs.tz(dateString, TZ).toDate();

    try {
        await generateTimelineCardsForDay(userId, todayDate);

        const [userData, timelineData, cuoreScoreData, alerts] = await Promise.all([
            User.findById(userId).select('name profileImage').lean(),
            getTimelineData(userId, dateString),
            getCuoreScoreData(userId),
            getAlerts(userId)
        ]);

        if (!userData) return res.status(404).json({ message: 'User data not found.' });

        const payload = {
            user: {
                id: userId,
                name: userData.name,
                profileImage: userData.profileImage || 'https://example.com/images/mjohnson.png'
            },
            date: dateString,
            summary: {
                missedTasks: timelineData.missed,
                message: `${timelineData.missed} ${timelineData.missed === 1 ? 'task' : 'tasks'} missed`,
            },
            progress: {
                periods: cuoreScoreData.history.map((score, i, arr) => ({
                    month: dayjs(score.date).format("MMM 'YY"),
                    value: score.cuoreScore,
                    userImage: i === arr.length - 1 ? (userData.profileImage || 'https://example.com/images/mjohnson.png') : undefined
                })),
                goal: '>75%',
                buttonText: 'Update Biomarkers'
            },
            motivationalMessage: 'Every choice you make today sets you up for a healthier tomorrow.',
            alerts: alerts, // Now populated by the getAlerts helper
            dailySchedule: timelineData.dailySchedule
        };

        res.status(200).json(payload);
    } catch (error) {
        console.error('Error fetching home screen data:', error);
        res.status(500).json({ error: 'Internal server error.' });
    }
};

// -----------------------------------------------------
// Timeline Helper
// -----------------------------------------------------
const getTimelineData = async (userId, dateString) => {
    const localDay = dayjs.tz(dateString, TZ).startOf('day');
    const utcStart = localDay.utc().toDate();
    const utcEnd = localDay.endOf('day').utc().toDate();

    const onboarding = await Onboarding.findOne({ userId })
        .select('o6Data.sleep_hours o6Data.wake_time')
        .lean();

    const preferredWake = convertTo24Hour(onboarding?.o6Data?.wake_time) || '07:00';
    const [wakeHour, wakeMinute] = preferredWake.split(':').map(Number);
    let wakeUpAnchor = localDay.hour(wakeHour).minute(wakeMinute);

    if (!wakeUpAnchor.isValid()) wakeUpAnchor = localDay.hour(7).minute(0);

    const systemCards = [
        { time: wakeUpAnchor, icon: '🌞', title: 'Wake Up', description: 'Start your day with Morning Harmony', type: 'SYSTEM_WAKEUP' },
        { time: calculateScheduledTime(wakeUpAnchor, 105), icon: '🍳', title: 'Breakfast', description: 'Healthy smoothie with oats and banana', type: 'SYSTEM_NUTRITION' },
        { time: calculateScheduledTime(wakeUpAnchor, 360), icon: '🏃', title: 'Fitness', description: 'Cardio & strength training', type: 'SYSTEM_FITNESS' },
        { time: calculateScheduledTime(wakeUpAnchor, 480), icon: '🍽️', title: 'Lunch', description: 'Re-energize yourself', type: 'SYSTEM_NUTRITION' },
        { time: calculateScheduledTime(wakeUpAnchor, 720), icon: '😴', title: 'Short Nap or Walk', description: 'Defeat the midday slump', type: 'SYSTEM_REST' },
        { time: calculateScheduledTime(wakeUpAnchor, 960), icon: '🌙', title: 'Dinner', description: 'Balanced and light', type: 'SYSTEM_NUTRITION' },
        { time: calculateScheduledTime(wakeUpAnchor, 1200), icon: '🛌', title: 'Sleep', description: 'Restore & repair', type: 'SYSTEM_REST' },
    ].map(card => ({
        ...card,
        completed: dayjs().tz(TZ).isAfter(card.time),
        reminder: true,
        editable: card.type === 'SYSTEM_WAKEUP'
    }));

    const rawCards = await TimelineCard.find({
        userId,
        scheduleDate: { $gte: utcStart, $lte: utcEnd }
    });

    const userCards = rawCards.map(card => {
        let icon = '📝';
        let editable = true;
        let reminder = true;

        if (card.type === 'USER_MEDICATION') icon = '💊', editable = false;
        else if (card.type === 'USER_REMINDER') icon = '🔔';

        let parsedTime;
        if (card.scheduledTime.includes('AM') || card.scheduledTime.includes('PM')) {
            parsedTime = dayjs.tz(`${localDay.format('YYYY-MM-DD')} ${card.scheduledTime}`, 'YYYY-MM-DD hh:mm A', TZ);
        } else {
            parsedTime = dayjs.tz(`${localDay.format('YYYY-MM-DD')} ${card.scheduledTime}`, 'YYYY-MM-DD HH:mm', TZ);
        }

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

    const allCards = [...systemCards, ...userCards]
        .sort((a, b) => a.time.valueOf() - b.time.valueOf())
        .map(card => ({ ...card, time: dayjs(card.time).tz(TZ).format('h:mm A') }));

    const missedTasks = allCards.filter(task =>
        !task.completed && dayjs.tz(`${localDay.format('YYYY-MM-DD')} ${task.time}`, 'YYYY-MM-DD h:mm A', TZ).isBefore(dayjs().tz(TZ))
    ).length;

    const alerts = missedTasks > 0 ? [{
        type: 'warning',
        text: 'Reassess to keep your plan aligned',
        action: 'Check Plan'
    }] : [];

    return { dailySchedule: allCards, missed: missedTasks, alerts };
};

// -----------------------------------------------------
// Cuore Score Helper
// -----------------------------------------------------
const getCuoreScoreData = async (userId) => {
    const scoreHistory = await Onboarding.find({ userId, 'scores.cuoreScore': { $exists: true, $ne: 0 } })
        .select('scores.cuoreScore timestamp')
        .sort({ timestamp: 1 })
        .lean();

    if (scoreHistory.length === 0) return { latestScore: 0, colorStatus: 'deep red', history: [] };

    const latest = scoreHistory.at(-1);
    const latestScore = latest.scores.cuoreScore;
    let colorStatus = latestScore > 75 ? 'green' : latestScore >= 50 ? 'yellow' : latestScore >= 25 ? 'light red' : 'deep red';

    return {
        latestScore,
        colorStatus,
        history: scoreHistory.map(doc => ({ date: doc.timestamp, cuoreScore: doc.scores.cuoreScore }))
    };
};

// -----------------------------------------------------
// Add Entry
// -----------------------------------------------------
exports.addEntry = async (req, res) => {
    const userId = req.user.userId;
    const { title, startDate, endDate, time, repeatFrequency, isMedication } = req.body;

    if (!title || !time || !repeatFrequency)
        return res.status(400).json({ error: 'Missing required scheduling fields.' });

    try {
        const startDay = dayjs.tz(startDate || new Date(), TZ);
        const endDay = endDate && endDate.toLowerCase() !== 'never' ? dayjs.tz(endDate, TZ).endOf('day') : null;

        const standardizedTime = convertTo24Hour(time);
        if (!standardizedTime) return res.status(400).json({ error: 'Invalid time format.' });

        let newEntry;
        if (isMedication) {
            const [name, dosage] = title.split(' ');
            newEntry = await Medication.create({
                userId,
                name: name || title,
                dosage: dosage || 'N/A',
                startDate: startDay.toDate(),
                endDate: endDay ? endDay.toDate() : null,
                time: standardizedTime,
                repeatFrequency
            });
        } else {
            newEntry = await Reminder.create({
                userId,
                title,
                startDate: startDay.toDate(),
                endDate: endDay ? endDay.toDate() : null,
                time: standardizedTime,
                repeatFrequency
            });
        }

        await generateTimelineCardsForDay(userId, dayjs().tz(TZ).toDate());

        return res.status(201).json({
            message: `${isMedication ? 'Medication' : 'Reminder'} added successfully.`,
            type: isMedication ? 'medication' : 'reminder',
            data: newEntry
        });
    } catch (error) {
        console.error('Error adding new timeline entry:', error);
        return res.status(500).json({ error: 'Internal server error.' });
    }
};

// -----------------------------------------------------
// Update Wake Up Time
// -----------------------------------------------------
exports.updateWakeUpTime = async (req, res) => {
    const userId = req.user.userId;
    const { newWakeUpTime } = req.body;

    if (!newWakeUpTime) {
        return res.status(400).json({ error: "Missing newWakeUpTime in request body." });
    }

    try {
        const standardizedTime = convertTo24Hour(newWakeUpTime);
        if (!standardizedTime) {
            return res.status(400).json({ error: "Invalid time format provided." });
        }
        
        const updatedOnboarding = await Onboarding.findOneAndUpdate(
            { userId },
            { $set: { 'o6Data.wake_time': standardizedTime } },
            { new: true, runValidators: true }
        );

        if (!updatedOnboarding) {
            return res.status(404).json({ error: "User onboarding data not found." });
        }

        const today = dayjs().tz(TZ).toDate();
        await generateTimelineCardsForDay(userId, today);
        
        const [userData, timelineData, cuoreScoreData] = await Promise.all([
            User.findById(userId).select('name profileImage').lean(),
            getTimelineData(userId, dayjs(today).format('YYYY-MM-DD')),
            getCuoreScoreData(userId)
        ]);
        
        const homeScreenPayload = {
            user: {
                id: userId,
                name: userData.name,
                profileImage: userData.profileImage || 'https://example.com/images/mjohnson.png'
            },
            date: dayjs(today).format('YYYY-MM-DD'),
            summary: {
                missedTasks: timelineData.missed,
                message: `${timelineData.missed} ${timelineData.missed === 1 ? 'task' : 'tasks'} missed`,
            },
            progress: {
                periods: cuoreScoreData.history.map((score, i, arr) => ({
                    month: dayjs(score.date).format("MMM 'YY"),
                    value: score.cuoreScore,
                    userImage: i === arr.length - 1 ? (userData.profileImage || 'https://example.com/images/mjohnson.png') : undefined
                })),
                goal: '>75%',
                buttonText: 'Update Biomarkers'
            },
            motivationalMessage: 'Every choice you make today sets you up for a healthier tomorrow.',
            alerts: timelineData.alerts,
            dailySchedule: timelineData.dailySchedule
        };
        
        res.status(200).json({ 
            message: "Wake-up time updated successfully. Timeline adjusted.",
            updatedData: homeScreenPayload
        });

    } catch (error) {
        console.error("Error updating wake-up time:", error);
        res.status(500).json({ error: "Internal server error." });
    }
};

// -----------------------------------------------------
// Existing APIs (kept as-is)
// -----------------------------------------------------

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
    if (time) updateData.time = convertTo24Hour(time);
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

exports.getCuoreScoreDetails = async (req, res) => {
    const userId = req.user.userId;

    try {
        const onboardingDoc = await Onboarding.findOne({ userId }).lean();
        if (!onboardingDoc) {
            return res.status(404).json({ message: "Onboarding data not found for this user." });
        }
        
        const healthMetrics = calculateHealthMetrics(onboardingDoc);
        
        res.status(200).json({ health_metrics: healthMetrics });

    } catch (error) {
        console.error("Error fetching Cuore Score details:", error);
        res.status(500).json({ error: "Internal server error." });
    }
};

