const fs = require('fs');
const { transformDrugData } = require('../utils/drugDataTransformer');

// Load drug database
const drugList = JSON.parse(fs.readFileSync(`${__dirname}/../vie.json`));

/**
 * Search for drugs by name
 * @route GET /api/v1/drug/:name
 */
const getDrugWithName = (req, res) => {
    try {
        const name = req.params.name;

        const data = drugList.filter((drug) => {
            const nameInList = drug.tenThuoc.toLowerCase();
            return nameInList.includes(name.toLowerCase());
        });

        if (data.length === 0) {
            return res.status(404).json({
                status: 'fail',
                message: 'No drug found with this name'
            });
        }

        // Return up to 5 results
        const count = Math.min(data.length, 5);
        const result = data.slice(0, count).map(transformDrugData);

        res.status(200).json({
            status: 'success',
            results: result.length,
            data: { result }
        });
    } catch (error) {
        console.error('Error in getDrugWithName:', error);
        res.status(500).json({
            status: 'error',
            message: 'Internal server error'
        });
    }
};

module.exports = { getDrugWithName };
