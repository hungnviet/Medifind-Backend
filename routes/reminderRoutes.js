const express = require('express');
const {
    createReminder,
    getReminder,
    updateReminder
} = require('../controllers/reminderController');
const { createReminderValidation, mongoIdValidation } = require('../middleware/validation');

const router = express.Router();

router.post('/reminder/:id', createReminderValidation, createReminder);
router.get('/reminder/:id', mongoIdValidation, getReminder);
router.put('/reminder/:reminderID/:userID', updateReminder);

module.exports = router;
