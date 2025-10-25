const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { getKnowledgeByUser } = require('../controllers/knowledgeController');

router.get('/:userId', protect, getKnowledgeByUser);

module.exports = router;