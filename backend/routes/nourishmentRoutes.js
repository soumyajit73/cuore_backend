const express = require('express');
const router = express.Router();
const nourishmentController = require('../controllers/nourishmentController');
const { protect } = require('../middleware/authMiddleware');

router.get('/', protect, nourishmentController.getNourishmentPlan);

module.exports = router;