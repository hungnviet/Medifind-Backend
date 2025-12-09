require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDatabase = require('./config/database');

// Import models
require('./models/user');
require('./models/reminder');

// Import routes
const drugRoutes = require('./routes/drugRoutes');
const chatbotRoutes = require('./routes/chatbotRoutes');
const scanRoutes = require('./routes/scanRoutes');
const authRoutes = require('./routes/authRoutes');
const reminderRoutes = require('./routes/reminderRoutes');
const historyRoutes = require('./routes/historyRoutes');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Connect to database
connectDatabase();

// API Routes
const API_VERSION = '/api/v1';
app.use(API_VERSION, drugRoutes);
app.use(API_VERSION, chatbotRoutes);
app.use(API_VERSION, scanRoutes);
app.use(API_VERSION, authRoutes);
app.use(API_VERSION, reminderRoutes);
app.use(API_VERSION, historyRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'success', message: 'Server is running' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        status: 'fail',
        message: 'Route not found'
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(err.status || 500).json({
        status: 'error',
        message: err.message || 'Internal server error'
    });
});

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running on port ${port}...`);
});

module.exports = app;
