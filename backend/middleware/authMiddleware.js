const jwt = require('jsonwebtoken');
const Doctor = require('../models/Doctor');
// Assuming you have a User model, though your old middleware didn't check the DB
// const User = require('../models/User');

exports.protect = async (req, res, next) => {
    let token;

    // Read the secret inside the function
    const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
    if (!JWT_ACCESS_SECRET) {
        return res.status(500).json({ message: "Server configuration error: JWT secret is missing." });
    }

    // 1. Check for token in Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer')) {
        token = authHeader.split(' ')[1];
    }

    // 2. Token must exist
    if (!token) {
        return res.status(401).json({ message: "Not authorized, no token provided." });
    }

    try {
        // 3. Verify the token
        const decoded = jwt.verify(token, JWT_ACCESS_SECRET);
        console.log("[PROTECT] Decoded JWT payload:", decoded);

        // --- 4. SMARTLY CHECK PAYLOAD TYPE ---
        
        // --- A) It's a DOCTOR token ---
        if (decoded.type === 'doctor' && decoded.id) {
            
            // Get doctor from the token ID
            const doctor = await Doctor.findById(decoded.id).select('-password');
            
            if (!doctor) {
                return res.status(401).json({ error: 'Not authorized, doctor not found' });
            }
            
            // Attach doctor to request
            req.doctor = doctor;
            next(); // Go to the doctor's controller

        // --- B) It's a USER (patient) token ---
        } else if (decoded.userId) {
            
            // This matches your old logic:
            // Just attach the user ID to the request object
            req.user = { userId: decoded.userId };
            next(); // Go to the user's controller

        // --- C) It's an unrecognized token ---
        } else {
            return res.status(401).json({ message: "Not authorized, invalid token payload." });
        }
        // --- END OF CHECK ---

    } catch (error) {
        // Handles expired tokens, invalid signatures, etc.
        console.error("[PROTECT] JWT Verification Error:", error);
        return res.status(401).json({ message: "Not authorized, invalid or expired token." });
    }
};