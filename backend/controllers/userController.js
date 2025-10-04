const User = require('../models/User'); 
const mongoose = require('mongoose'); // <-- MUST BE ADDED

exports.updateProfile = async (req, res) => {
    // 1. Get the ID string from the JWT payload
    const userIdFromToken = req.user.userId;

    // 2. Safely get the request body data
    const { 
        display_name, 
        dob, 
        gender, 
        preferred_time_zone, 
        consent_flags,
        caregiver_mobile, 
        doctor_code, 
        corporate_code
    } = req.body;

    // Basic validation
    if (!display_name || !consent_flags || !consent_flags.tos) {
        return res.status(400).json({ error: "Display name and Terms of Service consent are required." });
    }

    try {
        // --- FINAL FIX HERE: Convert the string ID to a Mongoose ObjectId ---
        const userIdObject = new mongoose.Types.ObjectId(userIdFromToken);
        
        const updatedUser = await User.findOneAndUpdate(
            { _id: userIdObject }, // Query Mongoose using the correct ObjectId type
            {
                $set: {
                    display_name,
                    dob,
                    gender,
                    preferred_time_zone,
                    consent_flags,
                    caregiver_mobile,
                    doctor_code,
                    corporate_code
                }
            },
            { new: true, runValidators: true }
        );
        // ------------------------------------------------------------------

        if (!updatedUser) {
            // This means the token was valid, but the user ID didn't match a document.
            return res.status(404).json({ error: "User not found." });
        }

        return res.status(200).json({ 
            message: "Profile updated successfully.", 
            user_id: updatedUser._id,
            profile: { 
                display_name: updatedUser.display_name, 
                gender: updatedUser.gender 
            }
        });

    } catch (error) {
        console.error('Profile Update Error:', error);
        // This catch block will now often show the true error, if it's not a JWT failure.
        return res.status(500).json({ error: "Internal server error during profile update." });
    }
};