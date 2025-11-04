const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware.js');
const { getCuoreHealthData } = require('../controllers/cuoreHealthController.js');

router.get("/:userId", protect, getCuoreHealthData);
module.exports= router;