const multer = require('multer');
const FormData = require('form-data');
const fetch = require('node-fetch');

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

/**
 * Handle image scanning with OCR
 * @route POST /api/v1/nlp
 */
const handleScan = async (req, res) => {
    try {
        const file = req.file;

        if (!file) {
            return res.status(400).json({
                status: 'fail',
                message: 'No file uploaded'
            });
        }

        const formData = new FormData();
        formData.append('file', file.buffer, { filename: file.originalname });

        const apiOcr = process.env.OCR_API_URL;
        console.log('Processing image with OCR...');

        const response = await fetch(apiOcr, {
            method: 'POST',
            body: formData,
            headers: formData.getHeaders(),
        });

        if (!response.ok) {
            console.error('OCR API error:', response.status);
            return res.status(response.status).json({
                status: 'fail',
                message: 'Image processing failed'
            });
        }

        const jsonArray = await response.json();

        res.status(200).json({
            status: 'success',
            results: jsonArray.results.length,
            data: jsonArray.results
        });
    } catch (error) {
        console.error('Error in handleScan:', error);
        res.status(500).json({
            status: 'error',
            message: 'An error occurred while processing the image'
        });
    }
};

module.exports = { handleScan, upload };
