const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const routes = require('./routes/onboardingRoutes.js');
require('dotenv').config();
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON bodies
app.use(bodyParser.json());

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI;
mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB connected successfully'))
    .catch(err => console.error('MongoDB connection error:', err));
app.get("/", (req,res)=>{
    res.send("Cuore Onboarding API is running");
});
// Set up the routes for the API
app.use('/api/v1', routes);

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});