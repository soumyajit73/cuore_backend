const mongoose = require('mongoose');
const Medication = require('../models/Medication');
const Reminder = require('../models/Reminder');
const User = require('../models/User'); 

// Utility function to parse date fields from string to Date object
const parseDate = (dateString) => {
    if (!dateString || dateString.toLowerCase() === 'never') return null;
    return new Date(dateString);
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
// GET /api/v1/users/:userId/reminders - Get all Reminders
// GET /api/v1/users/:userId/medications - Get all Medications
// ----------------------------------------------------------------------
exports.getEntries = async (req, res) => {
    const userId = req.user.userId;
    // Determine which type of entry to fetch based on the endpoint path
    const isMedicationPath = req.path.includes('/medications');

    try {
        let entries;
        if (isMedicationPath) {
            entries = await Medication.find({ userId, isActive: true });
            return res.status(200).json({ type: 'medications', data: entries });
        } else {
            entries = await Reminder.find({ userId, isActive: true });
            return res.status(200).json({ type: 'reminders', data: entries });
        }
    } catch (error) {
        console.error('Error getting user entries:', error);
        return res.status(500).json({ error: "Internal server error: Could not fetch entries." });
    }
};

const getModelAndId = (req) => {
    // Check if the URL path contains '/medications' or '/reminders'
    const isMedication = req.originalUrl.includes('/medications');
    const model = isMedication ? Medication : Reminder;
    // Extract the ID based on the parameter name in the route file
    const docId = isMedication ? req.params.medId : req.params.reminderId;
    return { model, docId };
};

// ----------------------------------------------------------------------
// PUT /api/v1/users/:userId/reminders/:reminderId - Update an Entry
// PUT /api/v1/users/:userId/medications/:medId - Update an Entry
// ----------------------------------------------------------------------
exports.updateEntry = async (req, res) => {
    const userId = req.user.userId; // Get the user ID from the JWT
    const { model, docId } = getModelAndId(req);
    
    // We only take fields that are allowed to be updated.
    const { title, startDate, endDate, time, repeatFrequency, name, dosage } = req.body;
    
    const updateData = {};
    if (title) updateData.title = title;
    if (startDate) updateData.startDate = parseDate(startDate);
    if (endDate !== undefined) updateData.endDate = parseDate(endDate);
    if (time) updateData.time = time;
    if (repeatFrequency) updateData.repeatFrequency = repeatFrequency;
    
    // Specific fields for Medication model
    if (model === Medication) {
        if (name) updateData.name = name;
        if (dosage) updateData.dosage = dosage;
    }

    try {
        const updatedEntry = await model.findOneAndUpdate(
            { _id: docId, userId: userId }, // Find by ID and ensure user ownership
            { $set: updateData },
            { new: true, runValidators: true } // Return the updated document and run validation
        );

        if (!updatedEntry) {
            // Document not found or user doesn't own it
            return res.status(404).json({ error: `${model.modelName} not found or access denied.` });
        }

        return res.status(200).json({ message: `${model.modelName} updated successfully.`, data: updatedEntry });

    } catch (error) {
        console.error(`Error updating ${model.modelName}:`, error);
        return res.status(500).json({ error: "Internal server error during update." });
    }
};


// ----------------------------------------------------------------------
// POST /api/v1/users/:id/timeline/cards/:card_id/complete - Mark a card as complete
// ----------------------------------------------------------------------
exports.completeCard = async (req, res) => {
    // This is a placeholder for a later stage of implementation
    res.status(501).json({ message: "Not Implemented Yet. This will mark a task as complete." });
};

// ----------------------------------------------------------------------
// GET /api/v1/users/:id/timeline - Get the full daily schedule
// ----------------------------------------------------------------------
exports.getTimeline = async (req, res) => {
    // This is a placeholder for the timeline generation logic
    res.status(501).json({ message: "Not Implemented Yet. This will generate the timeline." });
};