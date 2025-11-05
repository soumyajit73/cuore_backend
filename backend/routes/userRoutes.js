const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController'); 
const { protect } = require('../middleware/authMiddleware'); // Import the JWT protection

// PUT /api/v1/users/:userId/profile - This is a protected route
router.put('/:userId/profile', protect, userController.updateProfile);
router.get("/:userId/profile", protect, userController.getProfile);

module.exports = router;