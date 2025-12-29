const mongoose = require("mongoose");

const corporateCodeSchema = new mongoose.Schema(
  {
    // e.g. KS-025-BL
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      match: /^[A-Z]{2}-\d{3}-[A-Z]{2}$/ // AA-111-AA format
    },

    // -1 = unlimited usage
    max_uses: {
      type: Number,
      default: -1
    },

    // how many users have used this code
    used_count: {
      type: Number,
      default: 0
    },

    // allows admin/system to disable instantly
    is_active: {
      type: Boolean,
      default: true
    },

    // for classification & future reporting
    purpose: {
      type: String,
      enum: ["corporate", "testing", "internal"],
      default: "corporate"
    },

    // optional metadata (who issued it)
    issued_to: {
      type: String, // e.g. "Kartik Sharma - Bangalore"
      default: ""
    },

    created_by: {
      type: String,
      default: "system"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("CorporateCode", corporateCodeSchema);
