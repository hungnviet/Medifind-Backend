const fetch = require('node-fetch');

/**
 * Get AI chatbot reply using OpenAI API
 * @route GET /api/v1/chatBot
 */
const getReply = async (req, res) => {
    try {
        const { message } = req.body;

        if (!message) {
            return res.status(400).json({
                status: 'fail',
                message: 'Message is required'
            });
        }

        const apiKey = process.env.OPENAI_API_KEY;
        const endpoint = 'https://api.openai.com/v1/chat/completions';
        const model = 'gpt-3.5-turbo';
        const messages = [{ role: 'user', content: message }];
        const temperature = 0.7;

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({ model, messages, temperature })
        });

        if (!response.ok) {
            throw new Error(`OpenAI API error: ${response.status}`);
        }

        const data = await response.json();
        const reply = data.choices[0].message.content;

        res.json({
            status: 'success',
            data: { reply }
        });
    } catch (error) {
        console.error('Error in chatbot:', error);
        res.status(500).json({
            status: 'error',
            message: 'Error fetching response from AI'
        });
    }
};

module.exports = { getReply };
