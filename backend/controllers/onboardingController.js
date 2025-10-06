const model = require('../models/onboardingModel.js');

/**
 * Controller to handle the basic-info API request (O2).
 * It validates the input and calls the model for business logic and data storage.
 * @param {object} req - The Express request object.
 * @param {object} res - The Express response object.
 */
exports.submitBasicInfo = async (req, res) => {
    const data = req.body;
    
    // --- CHANGE: Get userId from the authenticated request object, NOT the body ---
    // Assuming your authentication middleware attaches the user ID to req.user.userId
    const userId = req.user.userId;

    // Validate required fields for O2
    const requiredFields = ["age", "gender", "height_cm", "weight_kg", "waist_cm"];
    for (const field of requiredFields) {
        if (data[field] === undefined) {
            return res.status(400).json({ error: `Missing required field: ${field}` });
        }
    }

    try {
        // --- CHANGE: Pass the userId to the model function ---
        const result = await model.processAndStoreBasicInfo(userId, data);
        return res.status(200).json(result);
    } catch (error) {
        if (error instanceof model.ValidationError) {
            return res.status(400).json({ error: error.message });
        }
        console.error('Internal server error:', error);
        return res.status(500).json({ error: "Internal server error" });
    }
};

/**
 * Controller to handle the health-history API request (O3).
 * It validates the input and calls the model for business logic and data storage.
 * @param {object} req - The Express request object.
 * @param {object} res - The Express response object.
 */
exports.submitHealthHistory = async (req, res) => {
    const data = req.body;
    
    // --- CHANGE: Get userId from the authenticated request object, NOT the body ---
    const userId = req.user.userId; 

    // No need to check for userId in body anymore, as it's handled by middleware

    // Validate required fields for O3
    const requiredFields = ["q1", "q2", "q3", "q4", "q5", "q6"];
    for (const field of requiredFields) {
        if (typeof data[field] !== 'boolean') {
            return res.status(400).json({ error: `Invalid or missing field: ${field}. Must be a boolean.` });
        }
    }

    try {
        // Pass the userId to the model function
        const result = await model.processAndStoreHealthHistory(userId, data);
        return res.status(200).json(result);
    } catch (error) {
        if (error instanceof model.ValidationError) {
            return res.status(400).json({ error: error.message });
        }
        console.error('Internal server error:', error);
        return res.status(500).json({ error: "Internal server error" });
    }
};


/**
 * Controller to handle the lifestyle API request (O4).
 * It validates the input and calls the model for business logic and data storage.
 * @param {object} req - The Express request object.
 * @param {object} res - The Express response object.
 */
exports.submitLifestyle = async (req, res) => {
    const data = req.body;
    
    // --- CHANGE: Get userId from the authenticated request object, NOT the body ---
    const userId = req.user.userId; 

    // Validate required fields for O4
    const requiredFields = ["smoking", "alcohol"];
    for (const field of requiredFields) {
        if (data[field] === undefined) {
            return res.status(400).json({ error: `Missing required field: ${field}.` });
        }
    }

    try {
        // Pass the userId to the model function
        const result = await model.processAndStoreLifestyle(userId, data);
        return res.status(200).json(result);
    } catch (error) {
        if (error instanceof model.ValidationError) {
            return res.status(400).json({ error: error.message });
        }
        console.error('Internal server error:', error);
        return res.status(500).json({ error: "Internal server error" });
    }
};



/**
 * Controller to handle the exercise & eating API request (O5).
 * @param {object} req - The Express request object.
 * @param {object} res - The Express response object.
 */
exports.submitExerciseEating = async (req, res) => {
    const data = req.body;
    
    // --- CHANGE: Get userId from the authenticated request object, NOT the body ---
    const userId = req.user.userId;

    // Validate required fields for O5, removing cuisine_preference
    const requiredFields = ["min_exercise_per_week", "fruits_veg", "processed_food", "high_fiber"];
    for (const field of requiredFields) {
        if (data[field] === undefined) {
            return res.status(400).json({ error: `Missing required field: ${field}.` });
        }
    }

    try {
        // Pass the userId to the model function
        const result = await model.processAndStoreExerciseEating(userId, data);
        return res.status(200).json(result);
    } catch (error) {
        if (error instanceof model.ValidationError) {
            return res.status(400).json({ error: error.message });
        }
        console.error('Internal server error:', error);
        return res.status(500).json({ error: "Internal server error" });
    }
};



/**
 * Controller to handle the sleep & stress API request (O6).
 * @param {object} req - The Express request object.
 * @param {object} res - The Express response object.
 */
exports.submitSleepStress = async (req, res) => {
    const data = req.body;
    
    // --- CHANGE: Get userId from the authenticated request object, NOT the body ---
    const userId = req.user.userId;

    // Validate required fields for O6
    const requiredFields = ["sleep_hours", "problems_overwhelming", "enjoyable", "felt_nervous"];
    for (const field of requiredFields) {
        if (data[field] === undefined) {
            return res.status(400).json({ error: `Missing required field: ${field}.` });
        }
    }
    
    try {
        // Pass the userId to the model function
        const result = await model.processAndStoreSleepStress(userId, data);
        return res.status(200).json(result);
    } catch (error) {
        if (error instanceof model.ValidationError) {
            return res.status(400).json({ error: error.message });
        }
        console.error('Internal server error:', error);
        return res.status(500).json({ error: "Internal server error" });
    }
};


/**
 * Controller to handle the biomarker API request (O7).
 * It validates the input and calls the model to process the data.
 * @param {object} req - The Express request object.
 * @param {object} res - The Express response object.
 */
exports.submitBiomarkers = async (req, res) => {
    const data = req.body;
    
    // --- CHANGE: Get userId from the authenticated request object, NOT the body ---
    const userId = req.user.userId; 
    
    // Capture the rest of the body as o7Data
    const { ...o7Data } = data; 

    try {
        // Pass the userId and the o7Data to the model function
        const result = await model.processAndStoreBiomarkers(userId, o7Data);
        return res.status(200).json(result);
    } catch (error) {
        if (error instanceof model.ValidationError) {
            return res.status(400).json({ error: error.message });
        }
        console.error('Internal server error:', error);
        return res.status(500).json({ error: "Internal server error" });
    }
};