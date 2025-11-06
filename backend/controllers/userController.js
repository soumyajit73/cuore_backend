const User = require('../models/User'); 
const mongoose = require('mongoose'); // <-- MUST BE ADDED

exports.updateProfile = async (req, res) => {
  const userIdFromToken = req.user.userId;

  // ✅ Extract fields safely
  const {
    phone,
    display_name,
    consent_flags,
    caregiver_mobile,
    doctor_code
  } = req.body;

  // ✅ Basic validation
  if (!display_name || !phone) {
    return res.status(400).json({ error: "Display name and phone number are required." });
  }

  try {
    const userIdObject = new mongoose.Types.ObjectId(userIdFromToken);

    // ✅ Build update object dynamically
    const updateFields = {
      phone,
      display_name,
      consent_flags: consent_flags || {},
    };

    // Add caregiver/doctor details only if provided
    if (caregiver_mobile) updateFields.caregiver_mobile = caregiver_mobile;
    if (doctor_code) updateFields.doctor_code = doctor_code;

    // ✅ Perform the update
    const updatedUser = await User.findOneAndUpdate(
      { _id: userIdObject },
      { $set: updateFields },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ error: "User not found." });
    }

    // ✅ Response payload
    return res.status(200).json({
      message: "Profile updated successfully.",
      user_id: updatedUser._id,
      profile: {
        display_name: updatedUser.display_name,
        phone: updatedUser.phone,
        caregiver_mobile: updatedUser.caregiver_mobile || null,
        doctor_code: updatedUser.doctor_code || null,
      },
    });

  } catch (error) {
    console.error("Profile Update Error:", error);
    return res.status(500).json({ error: "Internal server error during profile update." });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const userIdFromToken = req.user.userId;

    const user = await User.findById(userIdFromToken).lean();

    if (!user) {
      return res.status(404).json({ status: "error", message: "User not found" });
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

        // Hardcoded doctor & caregiver data (not editable)
        doctor: {
          name: "Dr. Sharma",
          mobile: "+919999999999",
          doctorCode: user.doctor_code || "DOC123"
        },
        caregiver: {
          name: "Primary Caregiver",
          mobile: user.caregiver_mobile || "+918888888888"
        }
      }
    });

  } catch (error) {
    console.error("GET Profile Error:", error);
    return res.status(500).json({ status: "error", message: "Internal Server Error" });
  }
};
