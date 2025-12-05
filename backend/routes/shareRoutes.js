const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const { exportPDF } = require("../controllers/pdfExportController");

router.get("/:userId/pdf", protect, exportPDF);

module.exports = router;
