/* eslint-disable no-console */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Drug = require('../models/drug');

const DATA_PATH = path.join(__dirname, '..', '..', 'database', 'drugs_data.json');

const removeDiacritics = (text) => {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
};

const buildSearchText = (drug) => {
  const parts = [
    drug.tenThuoc,
    drug.soDangKy,
    drug.thongTinThuocCoBan?.hoatChatChinh,
    drug.thongTinThuocCoBan?.hamLuong,
    drug.congTySanXuat?.tenCongTySanXuat,
    drug.congTySanXuat?.nuocSanXuat,
  ];
  return removeDiacritics(parts.filter(Boolean).join(' '));
};

const seed = async () => {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error('MONGODB_URI is not set in environment.');
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(uri);

    console.log(`Reading dataset from ${DATA_PATH} ...`);
    const raw = fs.readFileSync(DATA_PATH, 'utf-8');
    const data = JSON.parse(raw);

    console.log(`Preparing ${data.length} drug records for upsert...`);
    const ops = data.map((drug) => {
      const _id = String(drug.id);
      return {
        updateOne: {
          filter: { _id },
          update: {
            _id,
            ...drug,
            searchText: buildSearchText(drug),
          },
          upsert: true,
        },
      };
    });

    const result = await Drug.bulkWrite(ops, { ordered: false });
    console.log('Seed complete:', {
      upserted: result.upsertedCount,
      modified: result.modifiedCount,
      matched: result.matchedCount,
    });
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  } catch (error) {
    console.error('Seed failed:', error.message);
    process.exit(1);
  }
};

seed();
