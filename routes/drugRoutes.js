const express = require('express');
const { getDrugWithName } = require('../controllers/drugController');

const router = express.Router();

router.get('/drug/:name', getDrugWithName);

module.exports = router;
