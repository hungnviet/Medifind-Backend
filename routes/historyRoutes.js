const express = require('express');
const {
    updateHistorySearch,
    getHistorySearch,
    getHistoryMedicine,
    postHistoryMedicine
} = require('../controllers/historyController');

const router = express.Router();

router.post('/historySearch/:id', updateHistorySearch);
router.get('/historySearch/:id', getHistorySearch);
router.get('/historyMedicine/:id', getHistoryMedicine);
router.post('/historyMedicine/:id', postHistoryMedicine);

module.exports = router;
