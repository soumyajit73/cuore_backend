// 1️⃣ Load environment variables first
require('dotenv').config();
console.log("JWT_ACCESS_SECRET:", process.env.JWT_ACCESS_SECRET);

const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');

// 2️⃣ Import all routes AFTER dotenv loads
const onboardingRoutes = require('./routes/onboardingRoutes.js'); 
const finalSubmissionRoutes = require('./routes/finalSubmissionRoutes.js');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes'); 
const timelineRoutes = require('./routes/timelineRoutes'); 

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON bodies
app.use(bodyParser.json());

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI;
mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB connected successfully'))
    .catch(err => console.error('MongoDB connection error:', err));

// Root route
app.get("/", (req,res)=>{
    res.send("Cuore Onboarding API is running");
});

// Set up the routes for the API with corrected paths
app.use('/api/v1/onboarding', onboardingRoutes); // Correct path for onboarding
app.use('/api/v1/onboarding', finalSubmissionRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes); 
app.use('/api/v1/users', timelineRoutes); // This is still a conflict
// A better fix for this conflict is to combine the routers in the route files
// but for now, we will assume you meant to use both sets of routes at this path

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});