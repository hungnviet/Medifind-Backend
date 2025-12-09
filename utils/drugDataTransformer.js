/**
 * Transforms raw drug data from vie.json into standardized format
 * @param {Object} drugData - Raw drug data object
 * @returns {Object} Transformed drug information
 */
const transformDrugData = (drugData) => {
    return {
        ten: drugData.tenThuoc,
        hoatChatChinh: drugData.thongTinThuocCoBan?.hoatChatChinh || null,
        SDK: drugData.soDangKy,
        SQD: drugData.thongTinDangKyThuoc?.soQuyetDinh || null,
        xuatSu: drugData.congTySanXuat?.nuocSanXuat || null,
        congTy: drugData.congTySanXuat?.tenCongTySanXuat || null,
        dangBaoChe: drugData.thongTinDangKyThuoc?.dangBaoChe || null,
        diaChiSX: drugData.congTySanXuat?.diaChiSanXuat || null,
    };
};

module.exports = { transformDrugData };
