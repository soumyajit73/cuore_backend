const User = require('../models/User'); 
const mongoose = require('mongoose'); // <-- MUST BE ADDED

exports.updateProfile = async (req, res) => {
  const userIdFromToken = req.user.userId;

  // ✅ Extract only potential fields from request
  const {
    phone,
    display_name,
    consent_flags,
    caregiver_name,
    caregiver_mobile,
    doctor_name,
    doctor_code,
    doctor_phone
  } = req.body;

  try {
    const userIdObject = new mongoose.Types.ObjectId(userIdFromToken);

    // ✅ Build update object dynamically (only add fields user sent)
    const updateFields = {};

    if (display_name) updateFields.display_name = display_name;
    if (phone) updateFields.phone = phone;
    if (consent_flags) updateFields.consent_flags = consent_flags;
    if (caregiver_name) updateFields.caregiver_name = caregiver_name;
    if (caregiver_mobile) updateFields.caregiver_mobile = caregiver_mobile;
    if (doctor_name) updateFields.doctor_name = doctor_name;
    if (doctor_phone) updateFields.doctor_phone = doctor_phone;
    if (doctor_code) updateFields.doctor_code = doctor_code;

    // ✅ If no fields provided, throw an error
    if (Object.keys(updateFields).length === 0) {
      return res.status(400).json({ error: "No valid fields provided to update." });
    }

    // ✅ Perform the update
    const updatedUser = await User.findOneAndUpdate(
      { _id: userIdObject },
      { $set: updateFields },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ error: "User not found." });
    }

    // ✅ Return clean payload
    return res.status(200).json({
      message: "Profile updated successfully.",
      user_id: updatedUser._id,
      profile: {
        display_name: updatedUser.display_name || null,
        phone: updatedUser.phone || null,
        caregiver_name: updatedUser.caregiver_name || null,
        caregiver_mobile: updatedUser.caregiver_mobile || null,
        doctor_name: updatedUser.doctor_name || null,
        doctor_phone: updatedUser.doctor_phone || null,
        doctor_code: updatedUser.doctor_code || null,
      },
    });

  } catch (error) {
    console.error("Profile Update Error:", error);

    // ✅ Handle duplicate phone gracefully
    if (error.code === 11000 && error.keyPattern?.phone) {
      return res.status(400).json({
        error: "This phone number is already registered with another account."
      });
    }

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
