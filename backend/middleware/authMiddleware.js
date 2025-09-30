const jwt = require('jsonwebtoken');

exports.protect = (req, res, next) => {
    let token;

    // Read the secret inside the function to ensure dotenv has loaded
    const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
    console.log("[PROTECT] JWT_ACCESS_SECRET:", JWT_ACCESS_SECRET);

    // 1. Check for token in Authorization header (Bearer <token>)
    const authHeader = req.headers.authorization;
    console.log("[PROTECT] Incoming Authorization header:", authHeader);

    if (authHeader && authHeader.startsWith('Bearer')) {
        // Get token from header (split "Bearer" and actual token)
        token = authHeader.split(' ')[1];
    }
    console.log("[PROTECT] Token extracted:", token);

    // --- CRITICAL CHECK: Token must exist ---
    if (!token) {
        return res.status(401).json({ message: "Not authorized, no token provided in request." });
    }

    // Check for empty or malformed token
    if (token === 'undefined' || token === '') {
        return res.status(401).json({ message: "Not authorized, malformed token." });
    }

    try {
        // 2. Verify the token signature and expiration
        const decoded = jwt.verify(token, JWT_ACCESS_SECRET);
        console.log("[PROTECT] Decoded JWT payload:", decoded);

        // 3. Attach user ID to the request object
        req.user = { userId: decoded.userId };

        next(); // Move to the controller function

    } catch (error) {
        // This catch block handles:
        // a) Token expiration (TokenExpiredError)
        // b) Invalid signature (JsonWebTokenError)
        console.error("[PROTECT] JWT Verification Error:", error);

        return res.status(401).json({ message: "Not authorized, invalid or expired token." });
    }
};
