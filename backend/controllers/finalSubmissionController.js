const model = require('../models/onboardingModel.js');

exports.submitFinalOnboarding = async (req, res) => {
    const userId = req.user.userId;
    const payload = req.body;

    try {
        const result = await model.processAndSaveFinalSubmission(userId, payload);
        
        // This is the single, consistent response body object.
        const responseBody = {
            status: "success",
            message: "Onboarding completed successfully",
            data: {
                user_profile: {
                    user_id: result.userId,
                    age: result.o2Data.age,
                    gender: result.o2Data.gender,
                    height_cm: result.o2Data.height_cm,
                    weight_kg: result.o2Data.weight_kg,
                    waist_cm: result.o2Data.waist_cm
                },
                health_metrics: {
                    health_score: result.scores.cuoreScore,
                    estimated_time_to_target: {
                        value: 7, // Assuming this is a static value for now. You might need to add logic for this later.
                        unit: "months"
                    },
                    metabolic_age: {
                        value: 38, // Assuming a static value. You'll need to calculate this from the user's data.
                        unit: "years",
                        target: 34
                    },
                    weight: {
                        current: result.o2Data.weight_kg,
                        target: 68, // Assuming a static target for now.
                        unit: "kg"
                    },
                    bmi: {
                        value: result.derivedMetrics.bmi,
                        target: 23
                    },
                    lifestyle_score: {
                        value: result.scores.o4Score + result.scores.o5Score + result.scores.o6Score, // Sum of lifestyle scores
                        target: 75,
                        unit: "%"
                    },
                    recommended: {
                        calories: {
                            value: 1600, // Static value, you'll need to add logic for this later.
                            unit: "kcal"
                        },
                        exercise: {
                            value: 30, // Static value, you'll need to add logic for this later.
                            unit: "min"
                        }
                    },
                    vitals: {
                        blood_pressure: {
                            current: `${result.o7Data.bp_upper}/${result.o7Data.bp_lower}`,
                            target: "120/80"
                        },
                        blood_sugar: {
                            fasting: {
                                value: result.o7Data.bs_f,
                                target: "<160"
                            },
                            after_meal: {
                                value: result.o7Data.bs_am,
                                target: "<180"
                            }
                        },
                        cholesterol: {
                            tg_hdl_ratio: {
                                value: result.o7Data.trig_hdl_ratio,
                                target: 2.5
                            }
                        },
                        body_fat: {
                            value: 28, // Static value, you'll need to calculate this.
                            target: 23,
                            unit: "%"
                        }
                    },
                    main_focus: ["Nutrition", "Tobacco Cessation"] // This will need to be calculated based on user scores.
                }
            }
        };

        // --- NEW LOGIC: Use a conditional to determine the status code and message ---
        if (req.method === 'POST') {
            return res.status(201).json(responseBody);
        } else { // This will be true for PUT requests
            // Change the message for reassessment
            responseBody.message = "Reassessment completed successfully";
            return res.status(200).json(responseBody);
        }

    } catch (error) {
        if (error instanceof model.ValidationError) {
            return res.status(400).json({ error: error.message });
        }
        console.error('Internal server error:', error);
        return res.status(500).json({ error: "Internal server error." });
    }
};

exports.getOnboardingData = async (req, res) => {
    const userId = req.user.userId;

    try {
        const onboardingData = await model.getOnboardingDataByUserId(userId);
        
        if (!onboardingData) {
            return res.status(404).json({ message: "Onboarding data not found for this user." });
        }

        return res.status(200).json({
            status: "success",
            message: "Onboarding data retrieved successfully",
            data: onboardingData
        });
    } catch (error) {
        console.error('Error fetching onboarding data:', error);
        return res.status(500).json({ error: "Internal server error." });
    }
};