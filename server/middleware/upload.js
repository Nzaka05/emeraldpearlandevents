const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({ cloudinary_url: process.env.CLOUDINARY_URL });

const galleryStorage = new CloudinaryStorage({
    cloudinary,
    params: { folder: 'emerald/gallery', allowed_formats: ['jpg', 'jpeg', 'png', 'webp'] }
});

const uploadGalleryImage = multer({ storage: galleryStorage });
module.exports = { uploadGalleryImage, cloudinary };
