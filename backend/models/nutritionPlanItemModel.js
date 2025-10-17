const mongoose = require('mongoose');

const componentSchema = new mongoose.Schema({
    description: { type: String, required: true },
    is_base: { type: Boolean, default: false }
}, { _id: false });

const nutritionPlanItemSchema = new mongoose.Schema({
    _id: { type: String, required: true }, // Using a custom ID like 'V1.1_1300-1499'
    item_id: { type: String, required: true }, // e.g., 'V1.1'
    name: { type: String, required: true },
    diet_tag: { type: String, required: true, index: true }, // e.g., 'V1', 'V2'
    calories: { type: Number, required: true },
    calorie_range: { type: String, required: true, index: true },
    components: [componentSchema]
}, { versionKey: false });

// Compound index for efficient filtering by range and diet tag
nutritionPlanItemSchema.index({ calorie_range: 1, diet_tag: 1 });

const NutritionPlanItem = mongoose.model('NutritionPlanItem', nutritionPlanItemSchema, 'nutrition_plan_items');

module.exports = NutritionPlanItem;