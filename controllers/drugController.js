const Drug = require('../models/drug');
const {
  transformDrugListItem,
  transformDrugDetail,
  removeDiacritics,
} = require('../utils/drugDataTransformer');

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

/**
 * Extract key tokens from medicine name for matching
 */
function extractMedicineTokens(name) {
  if (!name) return { brandName: '', dosage: '', tokens: [], normalized: '' };

  // Remove punctuation and normalize
  const cleaned = removeDiacritics(name)
    .toLowerCase()
    .replace(/[-_]/g, ' ')  // Convert hyphens to spaces
    .replace(/[()]/g, ' ')   // Remove parentheses
    .replace(/\s+/g, ' ')    // Normalize spaces
    .trim();

  // Extract brand name (first 1-2 words before numbers)
  const brandMatch = cleaned.match(/^([a-z]+(?:\s+[a-z]+)?)\s*\d/);
  const brandName = brandMatch ? brandMatch[1] : cleaned.split(/\s+/)[0];

  // Extract dosage (number + unit)
  const dosageMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*(mg|g|ml|iu|mcg|vien|goi)/i);
  const dosage = dosageMatch ? dosageMatch[0] : '';

  // Get all significant words (exclude common words)
  const commonWords = ['the', 'and', 'for', 'tablets', 'capsules', 'delayed', 'release', 'vien', 'goi'];
  const words = cleaned
    .split(/\s+/)
    .filter(w => w.length > 2 && !commonWords.includes(w));

  return {
    brandName,
    dosage,
    tokens: words,
    normalized: cleaned
  };
}

/**
 * Calculate match score between OCR name and database name
 */
function calculateMatchScore(ocrTokens, dbTokens) {
  let score = 0;

  // Brand name match (highest weight)
  if (ocrTokens.brandName && dbTokens.brandName) {
    if (ocrTokens.brandName === dbTokens.brandName) {
      score += 50;
    } else if (dbTokens.brandName.includes(ocrTokens.brandName) ||
               ocrTokens.brandName.includes(dbTokens.brandName)) {
      score += 30;
    }
  }

  // Dosage match (high weight)
  if (ocrTokens.dosage && dbTokens.dosage) {
    if (ocrTokens.dosage === dbTokens.dosage) {
      score += 30;
    }
  }

  // Token overlap (medium weight)
  const commonTokens = ocrTokens.tokens.filter(t =>
    dbTokens.tokens.some(dt => dt.includes(t) || t.includes(dt))
  );
  score += commonTokens.length * 5;

  return score;
}

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

/**
 * Batch search for multiple medicine names
 * @route POST /api/v1/drugs/batch
 */
const batchSearchDrugs = async (req, res) => {
  try {
    const { queries } = req.body;

    // Validate input
    if (!Array.isArray(queries) || queries.length === 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'queries must be a non-empty array of medicine names'
      });
    }

    // Limit batch size to prevent abuse
    if (queries.length > 20) {
      return res.status(400).json({
        status: 'fail',
        message: 'Maximum 20 queries allowed per batch request'
      });
    }

    // Search for each medicine name with token-based scoring
    const results = await Promise.all(
      queries.map(async (query) => {
        const rawQuery = (query || '').trim();

        if (rawQuery.length < 2) {
          return {
            query: rawQuery,
            found: false,
            match: null
          };
        }

        // Extract tokens from OCR query
        const ocrTokens = extractMedicineTokens(rawQuery);

        // Create flexible regex for brand name
        // Replace spaces with optional hyphens/spaces: "yesom" -> "yesom[\s-]*"
        const brandPattern = ocrTokens.brandName.replace(/\s+/g, '[\\s-]*');
        const regex = new RegExp(brandPattern, 'i');

        const filter = {
          $or: [
            { searchText: regex },
            { tenThuoc: regex },
          ],
        };

        // Find multiple potential matches (top 5)
        const drugs = await Drug.find(filter)
          .limit(5)
          .lean()
          .exec();

        if (drugs.length === 0) {
          return {
            query: rawQuery,
            found: false,
            match: null
          };
        }

        // Score each match and pick the best one
        let bestMatch = drugs[0];
        let bestScore = 0;

        for (const drug of drugs) {
          const dbTokens = extractMedicineTokens(drug.tenThuoc);
          const score = calculateMatchScore(ocrTokens, dbTokens);

          if (score > bestScore) {
            bestScore = score;
            bestMatch = drug;
          }
        }

        // Return best match if score is reasonable (>= 40)
        if (bestScore >= 40) {
          return {
            query: rawQuery,
            found: true,
            match: {
              tenThuoc: bestMatch.tenThuoc,
              soDangKy: bestMatch.soDangKy || null,
              soQuyetDinh: bestMatch.thongTinDangKyThuoc?.soQuyetDinh || null,
              hoatChatChinh: bestMatch.thongTinThuocCoBan?.hoatChatChinh || null,
              hamLuong: bestMatch.thongTinThuocCoBan?.hamLuong || null,
            }
          };
        }

        // If score is low but we have results, still return the best match
        // This handles edge cases where scoring might be imperfect
        return {
          query: rawQuery,
          found: drugs.length > 0,
          match: bestMatch ? {
            tenThuoc: bestMatch.tenThuoc,
            soDangKy: bestMatch.soDangKy || null,
            soQuyetDinh: bestMatch.thongTinDangKyThuoc?.soQuyetDinh || null,
            hoatChatChinh: bestMatch.thongTinThuocCoBan?.hoatChatChinh || null,
            hamLuong: bestMatch.thongTinThuocCoBan?.hamLuong || null,
          } : null
        };
      })
    );

    res.status(200).json({
      status: 'success',
      results: results.length,
      data: { results }
    });

  } catch (error) {
    console.error('Error in batchSearchDrugs:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error',
    });
  }
};

module.exports = { searchDrugs, getDrugDetail, batchSearchDrugs };
