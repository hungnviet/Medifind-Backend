const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = mongoose.model('User');

/**
 * Register a new user
 * @route POST /api/v1/signup
 */
const signUp = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(422).json({
                status: 'fail',
                message: 'User already exists with that email'
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create new user
        const user = new User({
            name,
            email,
            password: hashedPassword,
            historySearch: [],
            historyMedicine: []
        });

        await user.save();

        // Remove password from response
        const userResponse = user.toObject();
        delete userResponse.password;

        res.status(201).json({
            status: 'success',
            data: { user: userResponse }
        });
    } catch (error) {
        console.error('Error in signUp:', error);
        res.status(400).json({
            status: 'fail',
            message: error.message
        });
    }
};

/**
 * User login
 * @route POST /api/v1/signin
 */
const signIn = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(422).json({
                status: 'fail',
                message: 'Please provide email and password'
            });
        }

        // Find user
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(422).json({
                status: 'fail',
                message: 'Invalid email or password'
            });
        }

        // Compare password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(422).json({
                status: 'fail',
                message: 'Invalid email or password'
            });
        }

        res.json({
            status: 'success',
            data: {
                userID: user._id,
                name: user.name
            }
        });
    } catch (error) {
        console.error('Error in signIn:', error);
        res.status(500).json({
            status: 'error',
            message: 'Internal server error'
        });
    }
};

module.exports = { signUp, signIn };
