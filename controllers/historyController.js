const mongoose = require('mongoose');
const User = mongoose.model('User');

/**
 * Add drug name to user's search history
 * @route POST /api/v1/historySearch/:id
 */
const updateHistorySearch = async (req, res) => {
    try {
        const userID = req.params.id;
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({
                status: 'fail',
                message: 'Drug name is required'
            });
        }

        // Find user and update history
        const user = await User.findById(userID);
        if (!user) {
            return res.status(404).json({
                status: 'fail',
                message: 'User not found'
            });
        }

        user.historySearch.push({ name });
        await user.save();

        res.status(200).json({
            status: 'success',
            data: { history: user.historySearch }
        });
    } catch (error) {
        console.error('Error in updateHistorySearch:', error);
        res.status(500).json({
            status: 'error',
            message: 'Internal server error'
        });
    }
};

/**
 * Get user's search history
 * @route GET /api/v1/historySearch/:id
 */
const getHistorySearch = async (req, res) => {
    try {
        const userID = req.params.id;

        const user = await User.findById(userID);
        if (!user) {
            return res.status(404).json({
                status: 'fail',
                message: 'User not found'
            });
        }

        res.status(200).json({
            status: 'success',
            results: user.historySearch.length,
            data: { history: user.historySearch }
        });
    } catch (error) {
        console.error('Error in getHistorySearch:', error);
        res.status(500).json({
            status: 'error',
            message: 'Internal server error'
        });
    }
};

/**
 * Get user's medicine history
 * @route GET /api/v1/historyMedicine/:id
 */
const getHistoryMedicine = async (req, res) => {
    try {
        const userID = req.params.id;

        const user = await User.findById(userID);
        if (!user) {
            return res.status(404).json({
                status: 'fail',
                message: 'User not found'
            });
        }

        res.status(200).json({
            status: 'success',
            results: user.historyMedicine.length,
            data: { history: user.historyMedicine }
        });
    } catch (error) {
        console.error('Error in getHistoryMedicine:', error);
        res.status(500).json({
            status: 'error',
            message: 'Internal server error'
        });
    }
};

/**
 * Add entries to user's medicine history
 * @route POST /api/v1/historyMedicine/:id
 */
const postHistoryMedicine = async (req, res) => {
    try {
        const userID = req.params.id;
        const newHistory = req.body;

        if (!Array.isArray(newHistory) || newHistory.length === 0) {
            return res.status(400).json({
                status: 'fail',
                message: 'History data must be a non-empty array'
            });
        }

        const user = await User.findById(userID);
        if (!user) {
            return res.status(404).json({
                status: 'fail',
                message: 'User not found'
            });
        }

        user.historyMedicine.push(...newHistory);
        await user.save();

        res.status(200).json({
            status: 'success',
            data: { history: user.historyMedicine }
        });
    } catch (error) {
        console.error('Error in postHistoryMedicine:', error);
        res.status(500).json({
            status: 'error',
            message: 'Internal server error'
        });
    }
};

module.exports = {
    updateHistorySearch,
    getHistorySearch,
    getHistoryMedicine,
    postHistoryMedicine
};
