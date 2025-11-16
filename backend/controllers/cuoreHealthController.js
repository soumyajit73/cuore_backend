const model = require("../models/onboardingModel.js");
const { Onboarding } = require("../models/onboardingModel.js");
const User = require("../models/User.js");
const Reminder = require("../models/Reminder.js");
const dayjs = require("dayjs");

// -----------------------------------------------------------------
// --- NEW CONTROLLER FOR CUORE HEALTH SCREEN ---
// -----------------------------------------------------------------
exports.getCuoreHealthData = async (req, res) => {
  try {
    // Authentication check
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }
    const userId = req.user.userId;

    // --- 1. FETCH ALL DATA SOURCES IN PARALLEL ---
    const userPromise = User.findById(userId).select("display_name").lean();
    const onboardingPromise = model.getOnboardingDataByUserId(userId);
    const medicationPromise = Reminder.find({
      userId,
      isMedication: true,
      isActive: true,
    }).lean();

    const [user, onboardingDoc, allMeds] = await Promise.all([
      userPromise,
      onboardingPromise,
      medicationPromise,
    ]);

    if (!onboardingDoc) {
      return res
        .status(404)
        .json({ message: "Onboarding data not found for this user." });
    }

    // --- 2. PROCESS DATA FOR POINT 1 (USER PROFILE) ---
    const minDuration = 15 * 24 * 60 * 60 * 1000; // 15 days
    const medications = allMeds
      .filter((med) => {
        if (med.endDate === null) return true;
        const duration =
          new Date(med.endDate).getTime() - new Date(med.startDate).getTime();
        return duration >= minDuration;
      })
      .map((med) => med.title);

    const o3Data = onboardingDoc.o3Data || {};
    const historyItems = [
      o3Data.q1,
      o3Data.q2,
      o3Data.q3,
      o3Data.q4,
      o3Data.q5,
      o3Data.q6,
      o3Data.other_conditions,
    ];
    
    // --- START: FIX FOR 'pastHO' ---
    // Filter out any "false" strings, nulls, or empty strings
    const pastHistory = historyItems
      .filter(item => item && typeof item === 'string' && item.trim().length > 0 && item.toLowerCase() !== "false")
      .join(", ");
    // --- END: FIX FOR 'pastHO' ---
    
    const smokerStatus = onboardingDoc.o4Data?.smoking || "N/A";

    const profileData = {
      name: user?.display_name || "User",
      age: onboardingDoc.o2Data?.age || null,
      smoker: smokerStatus,
      pastHO: pastHistory,
      medications: medications,
      lastConsulted: onboardingDoc.lastConsultedDate || null,
    };

    // --- 3. PROCESS DATA FOR POINT 2 (HEALTH OBSERVATIONS) ---
    const o7Data = onboardingDoc.o7Data || {};
    // This function calculates the FRESH values (e.g., 0.9)
    const metrics = model.calculateAllMetrics(onboardingDoc); 

    const healthObservations = {
      heartRate: o7Data.pulse || null,
      bloodPressure:
        o7Data.bp_upper && o7Data.bp_lower
          ? `${o7Data.bp_upper}/${o7Data.bp_lower}`
          : null,
      bloodSugarPP: o7Data.bs_am || null,
      HbA1c: o7Data.A1C || null,
      
      // --- START: FIX FOR 'TG_HDL_Ratio' ---
      // Read from the fresh 'metrics' object, NOT the stale 'o7Data'
      TG_HDL_Ratio: metrics.trigHDLRatio?.current || null,
      // --- END: FIX FOR 'TG_HDL_Ratio' ---

      HsCRP: o7Data.HsCRP || null,
      lifestyleScore: metrics.lifestyle?.score || null,
    };

    // --- 4. ASSEMBLE FINAL RESPONSE ---
    const responseBody = {
      profile: profileData,
      healthObservations: healthObservations,
      healthRecords: {
        summary: null,
        diseaseProgressionRisk: null,
      },
    };

    return res.status(200).json({ status: "success", data: responseBody });
  } catch (error) {
    console.error("Error in getCuoreHealthData:", error);
    return res.status(500).json({ error: "Internal server error." });
  }
};

