const express = require('express');
const {
    createReminder,
    getReminder,
    updateReminder
} = require('../controllers/reminderController');
const { createReminderValidation, mongoIdValidation, updateReminderValidation } = require('../middleware/validation');

const router = express.Router();

router.post('/reminder/:id', createReminderValidation, createReminder);
router.get('/reminder/:id', mongoIdValidation, getReminder);
router.put('/reminder/:reminderID/:userID', updateReminderValidation, updateReminder);

module.exports = router;
