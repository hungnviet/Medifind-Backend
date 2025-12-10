const Drug = require('../models/drug');
const {
  transformDrugListItem,
  transformDrugDetail,
  removeDiacritics,
} = require('../utils/drugDataTransformer');

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

/**
 * Search for drugs
 * @route GET /api/v1/drugs?query=...&limit=10&page=1
 */
const searchDrugs = async (req, res) => {
  try {
    const rawQuery = (req.query.query || '').trim();
    const limit = Math.min(
      parseInt(req.query.limit, 10) || DEFAULT_LIMIT,
      MAX_LIMIT
    );
    const page = parseInt(req.query.page, 10) || 1;
    const skip = (page - 1) * limit;

    if (rawQuery.length < 2) {
      return res.status(200).json({
        status: 'success',
        results: 0,
        data: { results: [] },
      });
    }

    const normalizedQuery = removeDiacritics(rawQuery);
    const regex = new RegExp(normalizedQuery, 'i');

    const filter = {
      $or: [
        { searchText: regex },
        { tenThuoc: { $regex: rawQuery, $options: 'i' } },
        { soDangKy: { $regex: rawQuery, $options: 'i' } },
      ],
    };

    const drugs = await Drug.find(filter)
      .skip(skip)
      .limit(limit)
      .lean()
      .exec();

    const results = drugs.map(transformDrugListItem);

    res.status(200).json({
      status: 'success',
      results: results.length,
      data: { results },
    });
  } catch (error) {
    console.error('Error in searchDrugs:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error',
    });
  }
};

/**
 * Get full drug detail by id (or soDangKy fallback)
 * @route GET /api/v1/drugs/:id
 */
const getDrugDetail = async (req, res) => {
  try {
    const { id } = req.params;

    let drug = await Drug.findById(id).lean().exec();

    if (!drug) {
      drug = await Drug.findOne({ soDangKy: id }).lean().exec();
    }

    if (!drug) {
      return res.status(404).json({
        status: 'fail',
        message: 'Drug not found',
      });
    }

    res.status(200).json({
      status: 'success',
      data: { drug: transformDrugDetail(drug) },
    });
  } catch (error) {
    console.error('Error in getDrugDetail:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error',
    });
  }
};

module.exports = { searchDrugs, getDrugDetail };
