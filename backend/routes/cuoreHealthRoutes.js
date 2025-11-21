const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware.js');
const { getCuoreHealthData, updateLastConsultedDate} = require('../controllers/cuoreHealthController.js');

router.get("/:userId", protect, getCuoreHealthData);
router.put("/:userId/last-consulted", protect, updateLastConsultedDate);
module.exports= router;