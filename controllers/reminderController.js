const mongoose = require('mongoose');
const User = mongoose.model('User');
const Reminder = mongoose.model('Reminder');

/**
 * Create a new medication reminder
 * @route POST /api/v1/reminder/:id
 */
const createReminder = async (req, res) => {
    try {
        const { name, amount, hour, minute, period, start_date, start_month, start_year } = req.body;
        const userId = req.params.id;

        // Verify user exists
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                status: 'fail',
                message: 'User not found'
            });
        }

        // Create reminder
        const reminder = new Reminder({
            name,
            amount,
            hour,
            minute,
            period,
            start_date,
            start_month,
            start_year,
            state: false,
            user: userId
        });

        await reminder.save();

        res.status(201).json({
            status: 'success',
            data: { reminder }
        });
    } catch (error) {
        console.error('Error in createReminder:', error);
        res.status(400).json({
            status: 'fail',
            message: error.message
        });
    }
};

/**
 * Get all reminders for a user
 * @route GET /api/v1/reminder/:id
 */
const getReminder = async (req, res) => {
    try {
        const userID = req.params.id;

        // Verify user exists
        const user = await User.findById(userID);
        if (!user) {
            return res.status(404).json({
                status: 'fail',
                message: 'User not found'
            });
        }

        // Get user's reminders
        const reminders = await Reminder.find({ user: userID });

        res.status(200).json({
            status: 'success',
            results: reminders.length,
            data: { reminders }
        });
    } catch (error) {
        console.error('Error in getReminder:', error);
        res.status(500).json({
            status: 'error',
            message: 'Internal server error'
        });
    }
};

/**
 * Toggle reminder state (active/inactive)
 * @route PUT /api/v1/reminder/:reminderID/:userID
 */
const updateReminder = async (req, res) => {
    try {
        const { reminderID, userID } = req.params;

        // Find and update reminder
        const reminder = await Reminder.findById(reminderID);
        if (!reminder) {
            return res.status(404).json({
                status: 'fail',
                message: 'Reminder not found'
            });
        }

        reminder.state = !reminder.state;
        await reminder.save();

        // Get all user's reminders after update
        const reminders = await Reminder.find({ user: userID });

        res.status(200).json({
            status: 'success',
            data: { reminders }
        });
    } catch (error) {
        console.error('Error in updateReminder:', error);
        res.status(500).json({
            status: 'error',
            message: 'Internal server error'
        });
    }
};

module.exports = { createReminder, getReminder, updateReminder };
