const express = require('express');
const { signUp, signIn } = require('../controllers/authController');
const { signUpValidation, signInValidation } = require('../middleware/validation');

const router = express.Router();

router.post('/signup', signUpValidation, signUp);
router.post('/signin', signInValidation, signIn);

module.exports = router;
