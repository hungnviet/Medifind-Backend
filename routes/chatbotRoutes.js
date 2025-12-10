const express = require('express');
const { getReply } = require('../controllers/chatbotController');
const { chatbotValidation } = require('../middleware/validation');

const router = express.Router();

// Chatbot endpoint now uses POST to avoid GET+body issues on mobile clients
router.post('/chatBot', chatbotValidation, getReply);

module.exports = router;
