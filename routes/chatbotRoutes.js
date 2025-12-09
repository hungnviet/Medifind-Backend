const express = require('express');
const { getReply } = require('../controllers/chatbotController');
const { chatbotValidation } = require('../middleware/validation');

const router = express.Router();

router.get('/chatBot', chatbotValidation, getReply);

module.exports = router;
