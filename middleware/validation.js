const { body, param, validationResult } = require('express-validator');

/**
 * Middleware to check validation results
 */
const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            status: 'fail',
            message: 'Validation failed',
            errors: errors.array()
        });
    }
    next();
};

/**
 * Validation rules for user signup
 */
const signUpValidation = [
    body('name')
        .trim()
        .notEmpty().withMessage('Name is required')
        .isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
    body('email')
        .trim()
        .notEmpty().withMessage('Email is required')
        .isEmail().withMessage('Must be a valid email'),
    body('password')
        .notEmpty().withMessage('Password is required')
        .isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    validate
];

/**
 * Validation rules for user signin
 */
const signInValidation = [
    body('email')
        .trim()
        .notEmpty().withMessage('Email is required')
        .isEmail().withMessage('Must be a valid email'),
    body('password')
        .notEmpty().withMessage('Password is required'),
    validate
];

/**
 * Validation rules for creating reminder
 */
const createReminderValidation = [
    param('id').isMongoId().withMessage('Invalid user ID'),
    body('name').trim().notEmpty().withMessage('Reminder name is required'),
    body('amount').isInt({ min: 1 }).withMessage('Amount must be a positive integer'),
    body('hour').isInt({ min: 0, max: 23 }).withMessage('Hour must be between 0-23'),
    body('minute').isInt({ min: 0, max: 59 }).withMessage('Minute must be between 0-59'),
    body('period').isInt({ min: 1 }).withMessage('Period must be a positive integer'),
    body('start_date').isInt({ min: 1, max: 31 }).withMessage('Date must be between 1-31'),
    body('start_month').isInt({ min: 1, max: 12 }).withMessage('Month must be between 1-12'),
    body('start_year').isInt({ min: 2020 }).withMessage('Year must be valid'),
    validate
];

/**
 * Validation for MongoDB ObjectId parameters
 */
const mongoIdValidation = [
    param('id').isMongoId().withMessage('Invalid ID format'),
    validate
];

/**
 * Validation for chatbot message
 */
const chatbotValidation = [
    body('message').trim().notEmpty().withMessage('Message is required'),
    validate
];

module.exports = {
    signUpValidation,
    signInValidation,
    createReminderValidation,
    mongoIdValidation,
    chatbotValidation
};
