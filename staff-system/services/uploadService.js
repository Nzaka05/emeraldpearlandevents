/**
 * uploadService.js
 * Handles file uploads to Cloudinary with local filesystem fallback.
 * Applies 5MB size limit and restricts to JPEG/PNG.
 */

const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Cloudinary auto-configures if CLOUDINARY_URL env var is present.
if (!process.env.CLOUDINARY_URL) {
    console.warn('[UploadService] ⚠️ CLOUDINARY_URL not set. Falling back to local disk storage for file uploads.');
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * Validates file size and mimetype
 */
function validateFile(file) {
    if (!file || !file.buffer) throw new Error('Invalid file object provided');
    if (file.size > MAX_FILE_SIZE) {
        throw new Error('File exceeds maximum size of 5MB');
    }
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
    if (!allowedTypes.includes(file.mimetype)) {
        throw new Error('Invalid file type. Only JPEG and PNG images are allowed.');
    }
}

/**
 * Upload buffer to Cloudinary using stream directly in memory
 */
function uploadToCloudinary(fileBuffer, folder) {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            { folder: `emerald/${folder}` },
            (error, result) => {
                if (error) return reject(error);
                resolve({ secure_url: result.secure_url, public_id: result.public_id });
            }
        );
        streamifier.createReadStream(fileBuffer).pipe(uploadStream);
    });
}

/**
 * Fallback local upload to /public/uploads/folder/
 */
function uploadToLocal(fileBuffer, folder, originalname) {
    return new Promise((resolve, reject) => {
        try {
            const ext = path.extname(originalname);
            const randomName = crypto.randomBytes(16).toString('hex');
            const filename = `${randomName}${ext}`;
            
            // Note: staff-system is mounted at /portal/staff-system? No, it's public dir.
            // Let's use the staff-system/public folder
            const baseUploadDir = path.resolve(__dirname, '..', 'public', 'uploads');
            const dir = path.normalize(path.join(baseUploadDir, folder));
            if (!dir.startsWith(baseUploadDir + path.sep)) {
                return reject(new Error('Path traversal detected in folder name'));
            }
            
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            const filepath = path.normalize(path.join(dir, filename));
            if (!filepath.startsWith(dir + path.sep)) {
                return reject(new Error('Path traversal detected in filename'));
            }
            fs.writeFile(filepath, fileBuffer, (err) => {
                if (err) return reject(err);
                resolve({ 
                    secure_url: `/uploads/${folder}/${filename}`, 
                    public_id: `local_${filename}` 
                });
            });
        } catch (err) {
            reject(err);
        }
    });
}

/**
 * Core processor for any specific upload pipeline
 */
async function processUpload(file, folder) {
    validateFile(file);
    if (process.env.CLOUDINARY_URL) {
        return await uploadToCloudinary(file.buffer, folder);
    } else {
        return await uploadToLocal(file.buffer, folder, file.originalname || 'upload.jpg');
    }
}

// ─────────────────────────────────────────────────────────────────
// Exports as requested
// ─────────────────────────────────────────────────────────────────

exports.uploadClockInSelfie = async (file) => {
    return await processUpload(file, 'clockin');
};

exports.uploadExpenseReceipt = async (file) => {
    return await processUpload(file, 'expenses');
};

exports.uploadStaffPhoto = async (file) => {
    return await processUpload(file, 'staff');
};
