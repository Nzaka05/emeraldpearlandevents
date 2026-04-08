// scripts/backup.js
// Run via: node scripts/backup.js
// Requires: MONGO_URI, CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY,
//           CLOUDINARY_API_SECRET in environment

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const DATE_TAG   = new Date().toISOString().slice(0, 10); // 2025-01-15
const DUMP_DIR   = `/tmp/emerald-dump-${DATE_TAG}`;
const ARCHIVE    = `/tmp/emerald-backup-${DATE_TAG}.tar.gz`;

async function run() {
  try {
    console.log(`[Backup] Starting dump — ${DATE_TAG}`);

    // 1. Dump
    execSync(
      `mongodump --uri="${process.env.MONGO_URI}" --out="${DUMP_DIR}"`,
      { stdio: 'inherit' }
    );
    console.log('[Backup] Dump complete');

    // 2. Compress
    execSync(`tar -czf "${ARCHIVE}" -C /tmp "emerald-dump-${DATE_TAG}"`,
      { stdio: 'inherit' }
    );
    console.log('[Backup] Compressed');

    // 3. Upload to Cloudinary as a raw file
    const result = await cloudinary.uploader.upload(ARCHIVE, {
      resource_type: 'raw',
      public_id: `emerald-backups/emerald-backup-${DATE_TAG}`,
      overwrite: true,
      tags: ['db-backup', 'emerald']
    });
    console.log(`[Backup] Uploaded to Cloudinary: ${result.secure_url}`);

    // 4. Clean up temp files
    execSync(`rm -rf "${DUMP_DIR}" "${ARCHIVE}"`);
    console.log('[Backup] Temp files cleaned. Done.');

  } catch (err) {
    console.error('[Backup] FAILED:', err.message);
    process.exit(1); // Non-zero exit so Render marks the cron job as failed
  }
}

run();
