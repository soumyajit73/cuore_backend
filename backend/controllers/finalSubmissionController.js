const model = require('../models/onboardingModel.js');
const { ValidationError } = model;

exports.submitFinalOnboarding = async (req, res) => {
    const userId = req.user.userId;
    const payload = req.body;

    try {
        const result = await model.processAndSaveFinalSubmission(userId, payload);
        return res.status(201).json({ 
            message: "Onboarding completed and score calculated successfully.", 
            cuoreScore: result.scores.cuoreScore,
            userId: result.userId 
        });
    } catch (error) {
        if (error instanceof ValidationError) {
            return res.status(400).json({ error: error.message });
        }
        console.error('Internal server error:', error);
        return res.status(500).json({ error: "Internal server error." });
    }
};