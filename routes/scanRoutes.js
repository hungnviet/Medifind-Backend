const express = require('express');
const { handleScan, upload } = require('../controllers/scanController');

const router = express.Router();

router.post('/nlp', upload.single('file'), handleScan);

module.exports = router;
