const User = require('../models/User'); 
const mongoose = require('mongoose');
const Doctor = require("../models/Doctor");
const OtpRequest = require("../models/otp");
const PatientLink = require("../models/PatientLink");
const { Onboarding } = require("../models/onboardingModel");
const TimelineCard = require("../models/TimelineCard");
const Medication = require("../models/Medication");
const Reminder = require("../models/Reminder");
const NudgeHistory = require("../models/NudgeHistory");
const NutritionPlanItem = require("../models/nutritionPlanItemModel");
const {TobaccoProfile} = require("../models/TobaccoProfile");
  // <-- MUST BE ADDED
  

exports.updateProfile = async (req, res) => {
  const userIdFromToken = req.user.userId;

  // Protect core fields if caregiver is being updated
  if (req.body.caregiver_name || req.body.caregiver_mobile) {
    delete req.body.display_name;  // Prevent name overwrite
    delete req.body.phone;         // Prevent phone overwrite
  }

  const {
    phone,
    display_name,
    consent_flags,
    caregiver_name,
    caregiver_mobile,
    doctor_name,   // ✅ Restored manual entry
    doctor_phone,  // ✅ Restored manual entry
    doctor_code
  } = req.body;

  try {
    const updateFields = {};

    const safeAssign = (key, value) => {
      if (value !== undefined && value !== null && value !== "") {
        updateFields[key] = value;
      }
    };

    // 1. Assign standard fields
    safeAssign("display_name", display_name);
    safeAssign("phone", phone);
    safeAssign("caregiver_name", caregiver_name);
    safeAssign("caregiver_mobile", caregiver_mobile);
    
    // 2. Assign manual doctor details (if provided)
    safeAssign("doctor_name", doctor_name);
    safeAssign("doctor_phone", doctor_phone);
    safeAssign("doctor_code", doctor_code);
    
    // -----------------------------------------------------------
    // ⭐ DOCTOR LINKING LOGIC (Priority Overwrite)
    // -----------------------------------------------------------
    if (doctor_code) {
        // Check if Doctor exists
        const doctor = await Doctor.findOne({ doctorCode: doctor_code });

        if (!doctor) {
            return res.status(400).json({ 
                error: "INVALID_DOCTOR_CODE", 
                message: "The Doctor Code you entered does not exist." 
            });
        }

        // ✅ AUTO-FILL: Overwrite manual entries with verified Doctor data
        // This ensures that even if the user sends only 'doctor_code', 
        // the name and phone are populated automatically.
        updateFields["doctor_code"] = doctor_code;
        updateFields["doctor_name"] = doctor.displayName;
        updateFields["doctor_phone"] = doctor.mobileNumber;

        // Link Patient to Doctor's List
        await Doctor.updateOne(
            { _id: doctor._id },
            { $addToSet: { patients: userIdFromToken } }
        );
        
        console.log(`[LINK] User ${userIdFromToken} linked to Doctor ${doctor.doctorCode} via Profile Update`);
    }
    // -----------------------------------------------------------

    if (consent_flags) updateFields.consent_flags = consent_flags;

    // 3. Validation: Ensure there is at least one field to update
    if (Object.keys(updateFields).length === 0) {
      return res.status(400).json({ error: "No valid fields provided for update." });
    }

    // 4. Perform Update
    const updatedUser = await User.findByIdAndUpdate(
      userIdFromToken,
      { $set: updateFields },
      { new: true, runValidators: true }
    );

    return res.status(200).json({
      message: "Profile updated successfully",
      profile: updatedUser
    });

  } catch (error) {
    console.error("Profile Update Error:", error);
    return res.status(500).json({ error: "Internal server error." });
  }
};


exports.getProfile = async (req, res) => {
  try {
    const userIdFromToken = req.user.userId;

    // Fetch user
    const user = await User.findById(userIdFromToken).lean();
    if (!user) {
      return res.status(404).json({ status: "error", message: "User not found" });
    }

    // ----------------------------------------
    // ⭐ FETCH DOCTOR DETAILS (if linked)
    // ----------------------------------------
    let doctorDetails = null;

 if (user.doctorId) {
  doctorDetails = await Doctor.findById(user.doctorId).lean();
} else if (user.doctor_code) {
  doctorDetails = await Doctor.findOne({
    doctorCode: user.doctor_code
  }).lean();
}



    return res.status(200).json({
      status: "success",
      data: {
        user: {
          phone: user.phone,
          display_name: user.display_name || "",
          isPhoneVerified: user.isPhoneVerified,

          consent_flags: user.consent_flags || {},

          dob: user.dob || null,
          gender: user.gender || null,
          preferred_time_zone: user.preferred_time_zone || null,

          caregiver_mobile: user.caregiver_mobile || null,
          doctor_code: user.doctor_code || null,
          corporate_code: user.corporate_code || null,

          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        },

        // -------------------------------------
        // ⭐ DOCTOR INFO (REAL one from DB)
        // -------------------------------------
        doctor: doctorDetails
          ? {
              name: doctorDetails.displayName,
              mobile: doctorDetails.mobileNumber,
              doctorCode: doctorDetails.doctorCode,
              photoUrl: doctorDetails.photoUrl || null
            }
          : {
              name: null,
              mobile: null,
              doctorCode: null
            },

        // -------------------------------------
        // ⭐ CAREGIVER INFO
        // -------------------------------------
        caregiver: {
          name: user.caregiver_name || null,
          mobile: user.caregiver_mobile || null
        }
      }
    });

  } catch (error) {
    console.error("GET Profile Error:", error);
    return res.status(500).json({ status: "error", message: "Internal Server Error" });
  }
};


// --- SEARCH DOCTORS FOR MOBILE APP ---
exports.searchDoctors = async (req, res) => {
  try {
    const { search } = req.query;
    let query = {};
    
    // If user typed something, filter by name (case-insensitive)
    if (search) {
      query.displayName = { $regex: search, $options: "i" };
    }

    // 1. Fetch Doctors
    const doctors = await Doctor.find(query)
      .select("displayName address fees patients mobileNumber doctorCode") 
      .lean();

    // 2. Format Data for the UI Card
    const formattedDoctors = doctors.map((doc) => {
      
      const count = doc.patients ? doc.patients.length : 0;

      // --- FEE FORMATTING LOGIC ---
      let feeDisplay = "Consult for fees";
      
      if (doc.fees) {
          if (typeof doc.fees === 'object') {
             // Create an array of fee strings dynamically
             const parts = [];
             
             // Check for keys and add them if they exist
             if (doc.fees.threeMonths) parts.push(`3 months: ₹${doc.fees.threeMonths}`);
             if (doc.fees.sixMonths)   parts.push(`6 months: ₹${doc.fees.sixMonths}`);
             if (doc.fees.twelveMonths) parts.push(`12 months: ₹${doc.fees.twelveMonths}`);
             
             // Join them. If empty (fees object exists but empty), keep default.
             if (parts.length > 0) {
                 // Join with a visible separator like spaces or a pipe
                 feeDisplay = parts.join("   "); 
             }
          } else {
             // Fallback for old string format
             feeDisplay = doc.fees.toString(); 
          }
      }

      return {
        _id: doc._id,
        name: doc.displayName,
        address: doc.address || "Address not available",
        linkedPatients: count,
        fees: feeDisplay,
        doctorCode: doc.doctorCode 
      };
    });

    res.status(200).json({
      status: "success",
      results: formattedDoctors.length,
      data: formattedDoctors,
    });

  } catch (error) {
    console.error("Error searching doctors:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.deleteAccount = async (req, res) => {
  const userId = req.user.userId;

  try {
    // 1️⃣ Fetch user (for phone reference)
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        status: "error",
        message: "User not found"
      });
    }

    const userPhone = user.phone;

    // ------------------------------------------------------------------
    // 2️⃣ REMOVE USER FROM DOCTOR DASHBOARD
    // ------------------------------------------------------------------
    await Doctor.updateMany(
      { patients: userId },
      { $pull: { patients: userId } }
    );

    // ------------------------------------------------------------------
    // 3️⃣ DELETE EVERYTHING RELATED TO USER
    // ------------------------------------------------------------------
    await Promise.all([
      // Core user
      User.deleteOne({ _id: userId }),

      // Auth / links
      OtpRequest.deleteMany({ phone: userPhone }),
      PatientLink.deleteMany({ patientMobile: userPhone }),

      // User-specific data
      Onboarding.deleteMany({ userId }),
      TimelineCard.deleteMany({ userId }),
      Medication.deleteMany({ userId }),
      Reminder.deleteMany({ userId }),
      NudgeHistory.deleteMany({ userId }),
      NutritionPlanItem.deleteMany({ userId }),
      TobaccoProfile.deleteMany({ userId })

      // 👉 Add any other userId-based collections here
    ]);

    // ------------------------------------------------------------------
    // 4️⃣ DONE
    // ------------------------------------------------------------------
    return res.status(200).json({
      status: "success",
      message: "User account and all related data have been permanently deleted."
    });

  } catch (error) {
    console.error("DELETE ACCOUNT ERROR:", error);
    return res.status(500).json({
      status: "error",
      message: "Failed to delete account"
    });
  }
};
