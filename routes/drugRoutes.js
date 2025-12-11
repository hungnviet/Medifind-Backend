const express = require('express');
const { searchDrugs, getDrugDetail, batchSearchDrugs } = require('../controllers/drugController');

const router = express.Router();

router.get('/drugs', searchDrugs);
router.post('/drugs/batch', batchSearchDrugs);
router.get('/drugs/:id', getDrugDetail);

module.exports = router;
