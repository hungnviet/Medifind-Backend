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
    body('dosageUnit').optional().isString().trim().isLength({ min: 1, max: 50 }).withMessage('dosageUnit must be a non-empty string'),
    body('note').optional().isString().isLength({ max: 500 }).withMessage('note must be a string up to 500 characters'),
    body('end_date').optional().isInt({ min: 1, max: 31 }).withMessage('end_date must be between 1-31'),
    body('end_month').optional().isInt({ min: 1, max: 12 }).withMessage('end_month must be between 1-12'),
    body('end_year').optional().isInt({ min: 2020 }).withMessage('end_year must be 2020 or later'),
    body('period').custom((value, { req }) => {
        const hasEndDate = ['end_date', 'end_month', 'end_year'].every((field) => req.body[field] !== undefined && req.body[field] !== null);
        if (hasEndDate) {
            return true;
        }
        if (value === undefined || value === null) {
            throw new Error('Period is required when end date is not provided');
        }
        const numericValue = Number(value);
        if (!Number.isInteger(numericValue) || numericValue < 1) {
            throw new Error('Period must be a positive integer');
        }
        return true;
    }),
    body().custom((_, { req }) => {
        const endFields = ['end_date', 'end_month', 'end_year'];
        const provided = endFields.filter((field) => req.body[field] !== undefined && req.body[field] !== null);

        // Either provide all end fields or none
        if (provided.length > 0 && provided.length < endFields.length) {
            throw new Error('Provide end_date, end_month, and end_year together');
        }

        // Validate end date is not before start date
        const { start_date, start_month, start_year, end_date, end_month, end_year } = req.body;
        const hasStart = [start_date, start_month, start_year].every((v) => v !== undefined && v !== null);
        const hasEnd = [end_date, end_month, end_year].every((v) => v !== undefined && v !== null);

        if (hasStart && hasEnd) {
            const startUtc = Date.UTC(Number(start_year), Number(start_month) - 1, Number(start_date));
            const endUtc = Date.UTC(Number(end_year), Number(end_month) - 1, Number(end_date));

            if (endUtc < startUtc) {
                throw new Error('End date must be on or after start date');
            }
        }

        return true;
    }),
    body('start_date').isInt({ min: 1, max: 31 }).withMessage('Date must be between 1-31'),
    body('start_month').isInt({ min: 1, max: 12 }).withMessage('Month must be between 1-12'),
    body('start_year').isInt({ min: 2020 }).withMessage('Year must be valid'),
    validate
];

/**
 * Validation rules for updating reminder
 */
const updateReminderValidation = [
    param('reminderID').isMongoId().withMessage('Invalid reminder ID'),
    param('userID').isMongoId().withMessage('Invalid user ID'),
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
    updateReminderValidation,
    mongoIdValidation,
    chatbotValidation
};
