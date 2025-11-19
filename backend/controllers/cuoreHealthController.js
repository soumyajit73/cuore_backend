const model = require("../models/onboardingModel.js");
const { Onboarding } = require("../models/onboardingModel.js");
const User = require("../models/User.js");
const Reminder = require("../models/Reminder.js");
const dayjs = require("dayjs");

// --- HELPER: Safe Number Conversion (Used in getCuoreScoreDetails) ---
const safeNum = (val) => {
  if (val === null || val === undefined || val === "") return null;
  const num = parseFloat(val);
  return isNaN(num) ? null : num;
};

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
    
    // Create a new array to hold processed history items
    const processedHistory = [];

    // Helper function to check for valid, selected string
    const isSelected = (val) => val && typeof val === 'string' && val.toLowerCase() !== 'false' && val.trim().length > 0;

    // q1: Heart Attack
    if (isSelected(o3Data.q1)) {
        processedHistory.push(o3Data.q1);
    }
    
    // q2: Diabetes
    if (isSelected(o3Data.q2)) {
        processedHistory.push(o3Data.q2); 
    }

    // q3: HTN
    if (isSelected(o3Data.q3)) {
        processedHistory.push("HTN"); 
    }

    // q4: DM
    if (isSelected(o3Data.q4)) {
        processedHistory.push("DM");
    }

    // q5: SOB
    if (isSelected(o3Data.q5)) {
        processedHistory.push("SOB/ Chest Discomfort"); 
    }

    // q6: Kidney Disease
    if (isSelected(o3Data.q6)) {
        processedHistory.push(o3Data.q6);
    }

    // Other conditions
    if (isSelected(o3Data.other_conditions)) {
        processedHistory.push(o3Data.other_conditions);
    }
    
    const pastHistory = processedHistory.join(", ");
    
    const smokerStatus = onboardingDoc.o4Data?.smoking || "N/A";

    const currentDate = new Date().toLocaleDateString("en-US", {
      day: "numeric",
      month: "long",
      year: "numeric"
    });

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

    // --- HELPER: Determine Status Logic ---
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

    // --- HEART RATE LOGIC ---
    const getHrStatus = (val) => {
        if (val == null || val === "") return "unknown";
        const num = parseFloat(val);
        // Red: < 50 or > 120
        if (num < 50 || num > 120) return "red";
        // Orange: 50-60 or 110-120
        if ((num >= 50 && num <= 60) || (num >= 110 && num <= 120)) return "orange";
        // Green: Everything else (61-109)
        return "green";
    };

    // --- BLOOD PRESSURE LOGIC (Combined) ---
    let bpString = null;
    let bpStatus = "unknown";

    if (o7Data.bp_upper && o7Data.bp_lower) {
      bpString = `${o7Data.bp_upper}/${o7Data.bp_lower}`;
      const sys = parseFloat(o7Data.bp_upper);
      const dia = parseFloat(o7Data.bp_lower);

      // Calculate individual statuses
      const sysStatus = sys < 100 ? "orange" : sys <= 130 ? "green" : sys <= 145 ? "orange" : "red";
      const diaStatus = dia < 64 ? "orange" : dia <= 82 ? "green" : dia <= 95 ? "orange" : "red";

      // Determine overall status (Red > Orange > Green)
      if (sysStatus === "red" || diaStatus === "red") {
        bpStatus = "red";
      } else if (sysStatus === "orange" || diaStatus === "orange") {
        bpStatus = "orange";
      } else {
        bpStatus = "green";
      }
    }

    // --- TG/HDL Logic ---
    const tgHdlValue = metrics.trigHDLRatio?.current;
    const tgHdlStatus = getStatus(tgHdlValue, "tg_hdl");

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
        status: tgHdlStatus
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

// -----------------------------------------------------------------
// --- EXISTING CONTROLLER FOR DETAILED SCORE ---
// -----------------------------------------------------------------
exports.getCuoreScoreDetails = async (req, res) => {
  const userId = req.user && req.user.userId;
  if (!userId)
    return res.status(401).json({ message: "Unauthorized / userId missing" });

  try {
    const onboardingDoc = await Onboarding.findOne({ userId }).lean();
    if (!onboardingDoc)
      return res
        .status(404)
        .json({ message: "Onboarding data not found for this user." });

    const metrics =
      typeof model.calculateAllMetrics === "function"
        ? model.calculateAllMetrics(onboardingDoc)
        : {};

    const recommendedExercise =
      typeof model.calculateRecommendedExercise === "function"
        ? model.calculateRecommendedExercise(onboardingDoc.o5Data || {})
        : 15;

    const o7 = onboardingDoc.o7Data || {};

    // 🩺 Prefer manual values from o7Data if available
    const bp_upper = safeNum(o7.bp_upper ?? metrics?.bloodPressure?.upper?.current);
    const bp_lower = safeNum(o7.bp_lower ?? metrics?.bloodPressure?.lower?.current);
    const bs_f = safeNum(o7.bs_f ?? metrics?.bloodSugar?.fasting?.current);
    const bs_am = safeNum(o7.bs_am ?? metrics?.bloodSugar?.afterMeal?.current);
    const A1C = safeNum(o7.A1C ?? metrics?.bloodSugar?.A1C?.current);
    const tg_hdl_ratio = safeNum(metrics?.trigHDLRatio?.current);
    const body_fat = safeNum(o7.body_fat ?? metrics?.bodyFat?.current);

    // 🧠 BP Status logic
    const upperStatus =
      bp_upper == null
        ? "unknown"
        : bp_upper < 100
        ? "orange"
        : bp_upper <= 130
        ? "green"
        : bp_upper <= 145
        ? "orange"
        : "red";

    const lowerStatus =
      bp_lower == null
        ? "unknown"
        : bp_lower < 64
        ? "orange"
        : bp_lower <= 82
        ? "green"
        : bp_lower <= 95
        ? "orange"
        : "red";

    // 🧠 Correct Trig/HDL logic (Target <2.6; <2.8 green; 2.8–4.0 orange; >4.0 red)
    let tgStatus = "unknown";
    const tgTarget = 2.6;
    if (tg_hdl_ratio != null && !isNaN(tg_hdl_ratio)) {
      if (tg_hdl_ratio > 4.0) tgStatus = "red";
      else if (tg_hdl_ratio >= 2.8) tgStatus = "orange";
      else tgStatus = "green";
    }

    const responseBody = {
      health_metrics: {
        health_score:
          onboardingDoc?.scores?.cuoreScore ??
          metrics?.cuoreScore ??
          metrics?.scores?.cuoreScore ??
          0,
        estimated_time_to_target: {
          value: metrics?.timeToTarget ?? 0,
          unit: "months",
        },
        metabolic_age: {
          value: metrics?.metabolicAge?.metabolicAge ?? 0,
          unit: "years",
          gap: metrics?.metabolicAge?.gap ?? 0,
        },
        weight: {
          current: metrics?.weight?.current ?? null,
          target: metrics?.weight?.target ?? null,
          unit: "kg",
          status: metrics?.weight?.status ?? "unknown",
        },
        bmi: {
          value: metrics?.bmi?.current ?? null,
          target: metrics?.bmi?.target ?? null,
          status: metrics?.bmi?.status ?? "unknown",
        },
        lifestyle_score: {
          value: metrics?.lifestyle?.score ?? null,
          target: 75,
          unit: "%",
          status: metrics?.lifestyle?.status ?? "unknown",
        },
        recommended: {
          calories: {
            value: metrics?.recommendedCalories ?? null,
            unit: "kcal",
          },
          exercise: {
            value: recommendedExercise,
            unit: "min",
          },
        },
        vitals: {
          blood_pressure: {
            current:
              bp_upper != null && bp_lower != null
                ? `${bp_upper}/${bp_lower}`
                : null,
            target: "120/80",
            status: {
              upper: upperStatus,
              lower: lowerStatus,
            },
          },
          blood_sugar: {
            fasting: {
              value: bs_f,
              target: 100,
              status: bs_f == null ? "unknown" : bs_f <= 100 ? "green" : "red",
            },
            after_meal: {
              value: bs_am,
              target: 140,
              status: bs_am == null ? "unknown" : bs_am <= 140 ? "green" : "red",
            },
            A1C: {
              value: A1C,
              target: 5.6,
              status: A1C == null ? "unknown" : A1C <= 5.6 ? "green" : "red",
            },
          },

          // 👇 Conditionally include cholesterol (tgl/hdl)
          ...(o7.Trig != null &&
          o7.HDL != null &&
          o7.Trig !== "" &&
          o7.HDL !== ""
            ? {
                cholesterol: {
                  tg_hdl_ratio: {
                    value: tg_hdl_ratio,
                    target: tgTarget,
                    status: tgStatus,
                  },
                },
              }
            : {}),

          body_fat: {
            value: body_fat,
            target: metrics?.bodyFat?.target ?? 23,
            unit: "%",
            status: metrics?.bodyFat?.status ?? "unknown",
          },
        },

        main_focus: metrics?.mainFocus ?? [],
      },
    };

    return res.status(200).json(responseBody);
  } catch (err) {
    console.error("Error in getCuoreScoreDetails:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};