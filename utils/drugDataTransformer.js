/**
 * Normalizes text for accent-insensitive search
 * @param {string} text
 * @returns {string}
 */
const removeDiacritics = (text) => {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
};

/**
 * Transforms raw drug data into list-friendly shape
 * @param {Object} drugData
 * @returns {Object}
 */
const transformDrugListItem = (drugData) => ({
  id: drugData._id || drugData.id,
  tenThuoc: drugData.tenThuoc,
  hoatChatChinh: drugData.thongTinThuocCoBan?.hoatChatChinh || null,
  hamLuong: drugData.thongTinThuocCoBan?.hamLuong || null,
  dangBaoChe: drugData.thongTinThuocCoBan?.dangBaoChe || null,
  tenCongTySanXuat: drugData.congTySanXuat?.tenCongTySanXuat || null,
  soDangKy: drugData.soDangKy || null,
});

/**
 * Keeps full drug detail (lean doc) with consistent id field
 * @param {Object} drugData
 * @returns {Object}
 */
const transformDrugDetail = (drugData) => ({
  ...drugData,
  id: drugData._id || drugData.id,
});

module.exports = {
  transformDrugListItem,
  transformDrugDetail,
  removeDiacritics,
};
