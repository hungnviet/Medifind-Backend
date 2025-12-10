const express = require('express');
const { searchDrugs, getDrugDetail } = require('../controllers/drugController');

const router = express.Router();

router.get('/drugs', searchDrugs);
router.get('/drugs/:id', getDrugDetail);

module.exports = router;
