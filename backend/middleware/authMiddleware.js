const jwt = require('jsonwebtoken');
const Doctor = require('../models/Doctor');

exports.protect = async (req, res, next) => {
    let token;

    const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
    if (!JWT_ACCESS_SECRET) {
        return res.status(500).json({ message: "Server configuration error: JWT secret is missing." });
    }

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer')) {
        token = authHeader.split(' ')[1];
    }

    if (!token) {
        return res.status(401).json({ message: "Not authorized, no token provided." });
    }

    try {
        const decoded = jwt.verify(token, JWT_ACCESS_SECRET);
        console.log("[PROTECT] Decoded JWT payload:", decoded);

        // ----------------------------------------------------
        // A) DOCTOR TOKEN
        // ----------------------------------------------------
        if (decoded.type === 'doctor' && decoded.id) {
            const doctor = await Doctor.findById(decoded.id).select('-password');
            if (!doctor) {
                return res.status(401).json({ error: 'Not authorized, doctor not found' });
            }

            req.doctor = doctor;
            req.role = "doctor";
            return next();
        }

        // ----------------------------------------------------
        // B) CAREGIVER TOKEN (READ-ONLY)
        // ----------------------------------------------------
        if (decoded.role === "caregiver") {
    req.role = "caregiver";
    req.user = { userId: decoded.userId };

    // Reject ALL write operations
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
        return res.status(403).json({
            error: "Caregiver has read-only access."
        });
    }

    return next();
}


        // ----------------------------------------------------
        // C) NORMAL USER TOKEN
        // ----------------------------------------------------
        if (decoded.userId) {
            req.user = { userId: decoded.userId };
            req.role = "user";
            return next();
        }

        // ----------------------------------------------------
        // D) Anything else = invalid
        // ----------------------------------------------------
        return res.status(401).json({ message: "Not authorized, invalid token payload." });

    } catch (error) {
        console.error("[PROTECT] JWT Verification Error:", error);
        return res.status(401).json({ message: "Not authorized, invalid or expired token." });
    }
};
