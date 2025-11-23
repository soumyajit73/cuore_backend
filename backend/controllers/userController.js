const User = require('../models/User'); 
const mongoose = require('mongoose');
const Doctor = require("../models/Doctor");  // <-- MUST BE ADDED

exports.updateProfile = async (req, res) => {
  const userIdFromToken = req.user.userId;

  const {
    display_name,
    phone,
    consent_flags,
    caregiver_name,
    caregiver_mobile,
    doctor_name,
    doctor_phone,
    doctor_code
  } = req.body;

  try {
    const updateFields = {};

    // Update user display name ONLY if front-end sends it
    if (display_name !== undefined && display_name !== "") {
      updateFields.display_name = display_name;
    }

    // Update caregiver details
    if (caregiver_name !== undefined) {
      updateFields.caregiver_name = caregiver_name;
    }
    if (caregiver_mobile !== undefined) {
      updateFields.caregiver_mobile = caregiver_mobile;
    }

    // Update doctor info
    if (doctor_name !== undefined) updateFields.doctor_name = doctor_name;
    if (doctor_phone !== undefined) updateFields.doctor_phone = doctor_phone;
    if (doctor_code !== undefined) updateFields.doctor_code = doctor_code;

    // Phone update — ONLY if non-empty
    if (phone !== undefined && phone !== "") {
      updateFields.phone = phone;
    }

    if (consent_flags !== undefined) {
      updateFields.consent_flags = consent_flags;
    }

    // No fields to update?
    if (Object.keys(updateFields).length === 0) {
      return res.status(400).json({ error: "No valid fields provided to update." });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userIdFromToken,
      { $set: updateFields },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ error: "User not found." });
    }

    return res.status(200).json({
      message: "Profile updated successfully.",
      profile: {
        display_name: updatedUser.display_name,
        caregiver_name: updatedUser.caregiver_name,
        caregiver_mobile: updatedUser.caregiver_mobile,
        doctor_name: updatedUser.doctor_name,
        doctor_phone: updatedUser.doctor_phone,
        doctor_code: updatedUser.doctor_code,
        phone: updatedUser.phone
      }
    });

  } catch (error) {
    console.error("Profile Update Error:", error);
    return res.status(500).json({ error: "Internal server error" });
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

    if (user.doctor_code) {
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
