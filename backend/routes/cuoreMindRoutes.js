const express = require('express');
const router = express.Router();
const { getCuoreMindData } = require('../controllers/cuoreMindController.js');

// This creates the API endpoint:
// GET /api/v1/cuoremind/:userId
router.get('/:userId', getCuoreMindData);

module.exports = router;
