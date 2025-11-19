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
    
    // --- PAST HISTORY PROCESSING ---
    const processedHistory = [];
    const isSelected = (val) => val && typeof val === 'string' && val.toLowerCase() !== 'false' && val.trim().length > 0;

    if (isSelected(o3Data.q1)) processedHistory.push(o3Data.q1);
    if (isSelected(o3Data.q2)) processedHistory.push(o3Data.q2); 
    if (isSelected(o3Data.q3)) processedHistory.push("HTN"); 
    if (isSelected(o3Data.q4)) processedHistory.push("DM");
    if (isSelected(o3Data.q5)) processedHistory.push("SOB/ Chest Discomfort"); 
    if (isSelected(o3Data.q6)) processedHistory.push(o3Data.q6);
    if (isSelected(o3Data.other_conditions)) processedHistory.push(o3Data.other_conditions);
    
    const pastHistory = processedHistory.join(", ");
    const smokerStatus = onboardingDoc.o4Data?.smoking || "N/A";

    // Current Date Fallback
    const currentDate = new Date();

    const profileData = {
      name: user?.display_name || "User",
      age: onboardingDoc.o2Data?.age || null,
      smoker: smokerStatus,
      pastHO: pastHistory, 
      medications: medications,
      lastConsulted: onboardingDoc.lastConsultedDate || currentDate,
    };

    // --- 3. PROCESS DATA FOR POINT 2 (HEALTH OBSERVATIONS WITH COLOR) ---
    const o7Data = onboardingDoc.o7Data || {};
    const metrics = model.calculateAllMetrics(onboardingDoc);

    // --- HELPER: Determine Generic Status Logic ---
    const getStatus = (val, type) => {
      if (val == null || val === "") return "unknown";
      const num = parseFloat(val);

      switch (type) {
        case "bs_pp": // Blood Sugar Post Prandial
          return num <= 140 ? "green" : "red";
        case "a1c":   // HbA1c
          return num <= 5.6 ? "green" : "red";
        case "tg_hdl": // TG/HDL Ratio
          if (num > 4.0) return "red";
          if (num >= 2.8) return "orange";
          return "green";
        case "hscrp": // HsCRP
          return num > 0.3 ? "orange" : "green"; 
        default:
          return "unknown";
      }
    };

    // --- HELPER: Heart Rate Logic ---
    const getHrStatus = (val) => {
        if (val == null || val === "") return "unknown";
        const num = parseFloat(val);
        if (num < 50 || num > 120) return "red";
        if ((num >= 50 && num <= 60) || (num >= 110 && num <= 120)) return "orange";
        return "green";
    };

    // --- HELPER: Blood Pressure Logic (Combined) ---
    let bpString = null;
    let bpStatus = "unknown";

    if (o7Data.bp_upper && o7Data.bp_lower) {
      bpString = `${o7Data.bp_upper}/${o7Data.bp_lower}`;
      const sys = parseFloat(o7Data.bp_upper);
      const dia = parseFloat(o7Data.bp_lower);

      // Individual logic from reference
      const sysStatus = sys < 100 ? "orange" : sys <= 130 ? "green" : sys <= 145 ? "orange" : "red";
      const diaStatus = dia < 64 ? "orange" : dia <= 82 ? "green" : dia <= 95 ? "orange" : "red";

      // Overall logic: Red takes priority, then Orange, then Green
      if (sysStatus === "red" || diaStatus === "red") bpStatus = "red";
      else if (sysStatus === "orange" || diaStatus === "orange") bpStatus = "orange";
      else bpStatus = "green";
    }

    // --- TG/HDL Value ---
    const tgHdlValue = metrics.trigHDLRatio?.current;

    // --- ASSEMBLE OBSERVATIONS ---
    const healthObservations = {
      heartRate: {
        value: o7Data.pulse || null,
        status: getHrStatus(o7Data.pulse)
      },
      bloodPressure: {
        value: bpString,
        status: bpStatus
      },
      bloodSugarPP: {
        value: o7Data.bs_am || null,
        status: getStatus(o7Data.bs_am, "bs_pp")
      },
      HbA1c: {
        value: o7Data.A1C || null,
        status: getStatus(o7Data.A1C, "a1c")
      },
      TG_HDL_Ratio: {
        value: tgHdlValue || null,
        status: getStatus(tgHdlValue, "tg_hdl")
      },
      HsCRP: {
        value: o7Data.HsCRP || null,
        status: getStatus(o7Data.HsCRP, "hscrp")
      },
      lifestyleScore: {
        value: metrics.lifestyle?.score || null,
        status: metrics.lifestyle?.status || "unknown"
      },
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