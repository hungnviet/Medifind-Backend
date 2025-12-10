const mongoose = require('mongoose');
const User = mongoose.model('User');
const Reminder = mongoose.model('Reminder');

/**
 * Create a new medication reminder
 * @route POST /api/v1/reminder/:id
 */
const createReminder = async (req, res) => {
    try {
        const {
            name,
            amount,
            hour,
            minute,
            period,
            start_date,
            start_month,
            start_year,
            end_date,
            end_month,
            end_year,
            dosageUnit,
            note
        } = req.body;
        const userId = req.params.id;

        // Verify user exists
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                status: 'fail',
                message: 'User not found'
            });
        }

        const hasEndDate = [end_date, end_month, end_year].every((v) => v !== undefined && v !== null);
        let derivedPeriod = period;

        if (hasEndDate) {
            const startUtc = Date.UTC(Number(start_year), Number(start_month) - 1, Number(start_date));
            const endUtc = Date.UTC(Number(end_year), Number(end_month) - 1, Number(end_date));

            if (endUtc < startUtc) {
                return res.status(400).json({
                    status: 'fail',
                    message: 'End date must be on or after start date'
                });
            }

            const diffDays = Math.floor((endUtc - startUtc) / (1000 * 60 * 60 * 24)) + 1; // inclusive
            derivedPeriod = diffDays;
        } else if (derivedPeriod === undefined || derivedPeriod === null) {
            return res.status(400).json({
                status: 'fail',
                message: 'Period is required when end date is not provided'
            });
        }

        // Create reminder
        const reminder = new Reminder({
            name,
            amount,
            hour,
            minute,
            period: Number(derivedPeriod),
            start_date,
            start_month,
            start_year,
            end_date,
            end_month,
            end_year,
            state: false,
            dosageUnit: dosageUnit || 'tablet',
            note: note || '',
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

        // Verify user exists
        const user = await User.findById(userID);
        if (!user) {
            return res.status(404).json({
                status: 'fail',
                message: 'User not found'
            });
        }

        // Find and update reminder belonging to user
        const reminder = await Reminder.findOne({ _id: reminderID, user: userID });
        if (!reminder) {
            return res.status(404).json({
                status: 'fail',
                message: 'Reminder not found for this user'
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
