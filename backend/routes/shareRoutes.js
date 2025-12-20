const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware.js');
const { shareReport } = require('../controllers/shareController.js');

router.post("/report", protect, shareReport);

module.exports = router;
