const mongoose = require('mongoose');

const DrugSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // use provided id as primary key
    tenThuoc: { type: String, required: true },
    soDangKy: { type: String },
    thongTinDangKyThuoc: {
      ngayCapSoDangKy: { type: String },
      ngayGiaHanSoDangKy: { type: String },
      ngayHetHanSoDangKy: { type: String },
      soQuyetDinh: { type: String },
      urlSoQuyetDinh: { type: String },
      dotCap: { type: String },
    },
    thongTinThuocCoBan: {
      hoatChatHamLuong: { type: String },
      hoatChatChinh: { type: String },
      hoatChatChinhId: { type: String },
      hamLuong: { type: String },
      dangBaoChe: { type: String },
      dangBaoCheId: { type: String },
      dongGoi: { type: String },
      dongGoiJson: { type: mongoose.Schema.Types.Mixed },
      maDuongDung: { type: String },
      tenDuongDung: { type: String },
      tieuChuan: { type: String },
      tieuChuanId: { type: String },
      tuoiTho: { type: String },
      loaiThuoc: { type: String },
      loaiThuocId: { type: String },
      nhomThuoc: { type: String },
      nhomThuocId: { type: String },
    },
    congTySanXuat: {
      tenCongTySanXuat: { type: String },
      diaChiSanXuat: { type: String },
      nuocSanXuat: { type: String },
      nuocSanXuatId: { type: String },
    },
    phanLoaiThuocEnum: { type: Number },
    ghiChu: { type: String },
    isActive: { type: Boolean, default: true },
    searchText: { type: String, index: true }, // accent-less searchable blob
  },
  { timestamps: false }
);

DrugSchema.index({
  tenThuoc: 'text',
  'thongTinThuocCoBan.hoatChatChinh': 'text',
  'congTySanXuat.tenCongTySanXuat': 'text',
  soDangKy: 'text',
  searchText: 'text',
});

module.exports = mongoose.model('Drug', DrugSchema);
