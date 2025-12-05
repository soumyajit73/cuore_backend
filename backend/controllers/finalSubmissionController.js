const model = require('../models/onboardingModel.js');

exports.submitFinalOnboarding = async (req, res) => {
    const userId = req.user.userId;
    const payload = req.body;
    const requestMethod = req.method; // Retrieve the request method (e.g., 'POST', 'PUT')

    try {
        // Pass the requestMethod to the model function
        const result = await model.processAndSaveFinalSubmission(userId, payload, requestMethod);
        const metrics = model.calculateAllMetrics(result);
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
                value: metrics.timeToTarget,
                unit: "months"
            },
            metabolic_age: {
                value: metrics.metabolicAge.metabolicAge,
                unit: "years",
                gap: metrics.metabolicAge.gap
            },
            weight: {
                current: metrics.weight.current,
                target: metrics.weight.target,
                unit: "kg",
                status: metrics.weight.status
            },
            bmi: {
                value: metrics.bmi.current,
                target: metrics.bmi.target,
                status: metrics.bmi.status
            },
            lifestyle_score: {
                value: metrics.lifestyle.score,
                target: 75,
                unit: "%",
                status: metrics.lifestyle.status
            },
            recommended: {
                calories: {
                    value: metrics.recommendedCalories,
                    unit: "kcal"
                },
                exercise: {
                    value: metrics.recommendedExercise,
                    unit: "min"
                }
            },
            vitals: {
                 blood_pressure: {
        current: metrics.bloodPressure?.upper?.current && metrics.bloodPressure?.lower?.current ? 
            `${metrics.bloodPressure.upper.current}/${metrics.bloodPressure.lower.current}` : "0/0",
        target: "120/80",
        status: {
            upper: metrics.bloodPressure?.upper?.status || "normal",
            lower: metrics.bloodPressure?.lower?.status || "normal"
        }
    },
                blood_sugar: {
                    fasting: {
                        value: metrics.bloodSugar.fasting.current,
                        target: metrics.bloodSugar.fasting.target,
                        status: metrics.bloodSugar.fasting.status
                    },
                    after_meal: {
                        value: metrics.bloodSugar.afterMeal.current,
                        target: metrics.bloodSugar.afterMeal.target,
                        status: metrics.bloodSugar.afterMeal.status
                    }
                },
                cholesterol: {
                    tg_hdl_ratio: {
                        value: metrics.trigHDLRatio.current,
                        target: metrics.trigHDLRatio.target,
                        status: metrics.trigHDLRatio.status
                    }
                },
                body_fat: {
                    value: metrics.bodyFat.current,
                    target: metrics.bodyFat.target,
                    unit: "%",
                    status: metrics.bodyFat.status
                }
            },
            main_focus: metrics.mainFocus
        }
    }
        };

        // The conditional now correctly checks the request method for the response message and status code.
        if (requestMethod === 'POST') {
            return res.status(201).json(responseBody);
        } else if (requestMethod === 'PUT') {
            responseBody.message = "Reassessment completed successfully";
            return res.status(200).json(responseBody);
        } else {
            // Fallback for any other unexpected method
            return res.status(405).json({ message: "Method Not Allowed" });
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
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({
                status: "error",
                message: "User ID missing"
            });
        }

        const onboardingData = await model.getOnboardingDataByUserId(userId);
        if (!onboardingData) {
            return res.status(404).json({
                status: "error",
                message: "No onboarding data found"
            });
        }

      const rawO3 = onboardingData.o3Data || {};

        // Helper to clean "false" strings from DB
        const cleanBool = (val) => {
             if (val === "false") return false; // Catches the string "false"
             if (!val) return false;
             return val; // Returns the actual text string
        };

        // ⭐ VERY IMPORTANT: Use EXACT saved values from DB
        const normalizedO3 = {
            q1: cleanBool(rawO3.q1),
            q2: cleanBool(rawO3.q2),
            q3: cleanBool(rawO3.q3),
            q4: cleanBool(rawO3.q4),
            q5: cleanBool(rawO3.q5),
            q6: cleanBool(rawO3.q6),

            selectedOptions: Array.isArray(rawO3.selectedOptions)
                ? rawO3.selectedOptions
                : [],

            other_conditions: rawO3.other_conditions || "",

            hasHypertension: !!rawO3.hasHypertension,
            hasDiabetes: !!rawO3.hasDiabetes
        };

        return res.status(200).json({
            status: "success",
            message: "Onboarding data retrieved",
            data: {
                o2Data: onboardingData.o2Data || {},
                o3Data: normalizedO3,
                o4Data: onboardingData.o4Data || {},
                o5Data: onboardingData.o5Data || {},
                o6Data: onboardingData.o6Data || {},
                o7Data: onboardingData.o7Data || {}
            }
        });

    } catch (error) {
        console.error("Error in getOnboardingData:", error);
        return res.status(500).json({
            status: "error",
            message: "Internal server error"
        });
    }
};
