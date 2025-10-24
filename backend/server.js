// 1️⃣ Load environment variables first
require('dotenv').config();
console.log("JWT_ACCESS_SECRET:", process.env.JWT_ACCESS_SECRET ? 'Loaded' : 'MISSING!'); // Check if loaded
console.log("MONGO_URI:", process.env.MONGO_URI ? 'Loaded' : 'MISSING!'); // Check if loaded
console.log("SANITY_READ_TOKEN:", process.env.SANITY_READ_TOKEN ? 'Loaded' : 'MISSING!'); // Check if loaded

const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');

// 2️⃣ Import all routes AFTER dotenv loads
const onboardingRoutes = require('./routes/onboardingRoutes');
const finalSubmissionRoutes = require('./routes/finalSubmissionRoutes');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const timelineRoutes = require('./routes/timelineRoutes');

// --- NEW/UPDATED IMPORTS ---
const nourishmentRoutes = require('./routes/nourishmentRoutes'); // Assuming this now uses the Sanity controller
const mealBuilderRoutes = require('./routes/mealBuilderRoutes'); // You'll need to create this file
const recipeRoutes = require('./routes/recipeRoutes');  
const fitnessRoutes= require('./routes/fitnessRoutes');     // You'll need to create this file
// ----------------------------

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());

// MongoDB Connection (Keep if other parts of your app still use it)
const MONGO_URI = process.env.MONGO_URI;
if (MONGO_URI) {
    mongoose.connect(MONGO_URI)
        .then(() => console.log('MongoDB connected successfully'))
        .catch(err => console.error('MongoDB connection error:', err));
} else {
    console.warn('MONGO_URI not found in environment variables. Skipping MongoDB connection.');
}


// --- API Routes ---

// Root route
app.get("/", (req, res) => {
    res.send("Cuore Backend API is running");
});

// Authentication
app.use('/api/v1/auth', authRoutes);

// Onboarding (Uses two separate routers on the same base path, which is okay)
app.use('/api/v1/onboarding', onboardingRoutes);
app.use('/api/v1/onboarding', finalSubmissionRoutes); // Keep if distinct routes exist

// User & Timeline (Mounted separately to avoid conflict)
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/timeline', timelineRoutes); // Changed base path for clarity

// --- SANITY-BASED ROUTES ---
app.use('/api/nourish', nourishmentRoutes);     // Handles GET /api/nourish/plan?meal_time=...
app.use('/api/builder', mealBuilderRoutes);     // Handles GET /api/builder/items?meal_time=...&cuisine=...
app.use('/api/recipes', recipeRoutes);        // Handles GET /api/recipes/:recipeId
app.use('/api/fitness', fitnessRoutes);        
// -------------------------

// --- Start Server ---
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});