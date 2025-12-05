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
            return res.status(401).json({ status: "error", message: "User ID missing" });
        }

        const onboardingData = await model.getOnboardingDataByUserId(userId);
        if (!onboardingData) {
            return res.status(404).json({ status: "error", message: "No onboarding data found" });
        }

        const rawO3 = onboardingData.o3Data || {};

        // 1️⃣ Define the EXACT strings your frontend expects for the options
        const Q_TEXTS = {
            q1: "One of my parents was diagnosed with diabetes before the age of 60",
            q2: "One of my parents had a heart attack before the age of 60",
            q3: "I have Hypertension (High blood pressure)",
            q4: "I have Diabetes (High blood sugar)",
            q5: "I feel short of breath or experience chest discomfort even during mild activity or at rest",
            q6: "I've noticed an increase in hunger, thirst, or the need to urinate frequently"
        };

        // 2️⃣ Reconstruct selectedOptions dynamically
        // We do NOT trust rawO3.selectedOptions from the DB because it might be out of sync.
        // We check if q1...q6 exists (is not null/false) and push the text.
        const reconstructedOptions = [];
        
        // Helper to check if a field is "truthy" (either the string text or boolean true)
        const isSelected = (val) => val && val !== "false" && val !== false;

        if (isSelected(rawO3.q1)) reconstructedOptions.push(Q_TEXTS.q1);
        if (isSelected(rawO3.q2)) reconstructedOptions.push(Q_TEXTS.q2);
        if (isSelected(rawO3.q3)) reconstructedOptions.push(Q_TEXTS.q3);
        if (isSelected(rawO3.q4)) reconstructedOptions.push(Q_TEXTS.q4);
        if (isSelected(rawO3.q5)) reconstructedOptions.push(Q_TEXTS.q5);
        if (isSelected(rawO3.q6)) reconstructedOptions.push(Q_TEXTS.q6);

        // 3️⃣ Normalize the O3 Object
        const normalizedO3 = {
            // If the field has data, send the Text String (truthy), otherwise false.
            q1: isSelected(rawO3.q1) ? Q_TEXTS.q1 : false,
            q2: isSelected(rawO3.q2) ? Q_TEXTS.q2 : false,
            q3: isSelected(rawO3.q3) ? Q_TEXTS.q3 : false,
            q4: isSelected(rawO3.q4) ? Q_TEXTS.q4 : false,
            q5: isSelected(rawO3.q5) ? Q_TEXTS.q5 : false,
            q6: isSelected(rawO3.q6) ? Q_TEXTS.q6 : false,

            // Send the reconstructed array so the Frontend List pre-fills correctly
            selectedOptions: reconstructedOptions,

            other_conditions: rawO3.other_conditions || "",
            hasHypertension: !!rawO3.hasHypertension,
            hasDiabetes: !!rawO3.hasDiabetes
        };

        return res.status(200).json({
            status: "success",
            message: "Onboarding data retrieved",
            data: {
                o2Data: onboardingData.o2Data || {},
                o3Data: normalizedO3, // Use our fixed object
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