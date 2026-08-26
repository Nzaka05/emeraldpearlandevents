require('dotenv').config();
const mongoose = require('mongoose');
const Admin = require('./server/models/Admin');
const Gallery = require('./server/models/Gallery');

const galleryData = [
  {
    filename: 'Chezshot@WindsorGolfClub14.jpg.jpeg',
    url: '/images/gallery/Chezshot@WindsorGolfClub14.jpg.jpeg',
    caption: 'Windsor Golf Club VIP Gala Reception',
    eventType: 'Corporate & VIP',
    order: 1
  },
  {
    filename: 'Chezshot@WindsorGolfClub15.jpg.jpeg',
    url: '/images/gallery/Chezshot@WindsorGolfClub15.jpg.jpeg',
    caption: 'Executive Protocol & Guest Hospitality',
    eventType: 'VIP Protocol',
    order: 2
  },
  {
    filename: 'Chezshot@WindsorGolfClub16.jpg.jpeg',
    url: '/images/gallery/Chezshot@WindsorGolfClub16.jpg.jpeg',
    caption: 'Evening Banquet Service & Coordination',
    eventType: 'Corporate & VIP',
    order: 3
  },
  {
    filename: 'Chezshot@WindsorGolfClub18.jpg.jpeg',
    url: '/images/gallery/Chezshot@WindsorGolfClub18.jpg.jpeg',
    caption: 'Luxury Outdoor Event Setup & Ushering',
    eventType: 'Social & Private',
    order: 4
  },
  {
    filename: 'Chezshot@WindsorGolfClub19.jpg.jpeg',
    url: '/images/gallery/Chezshot@WindsorGolfClub19.jpg.jpeg',
    caption: 'Prestigious Country Club Gathering',
    eventType: 'VIP Protocol',
    order: 5
  },
  {
    filename: 'Chezshot@WindsorGolfClub20.jpg.jpeg',
    url: '/images/gallery/Chezshot@WindsorGolfClub20.jpg.jpeg',
    caption: 'Bespoke Event Coordination & Elegance',
    eventType: 'Corporate & VIP',
    order: 6
  },
  {
    filename: 'Birthday Party.jpg',
    url: '/images/gallery/Birthday%20Party.jpg',
    caption: 'Milestone Celebration & Private Party Hosting',
    eventType: 'Social & Private',
    order: 7
  },
  {
    filename: '353106.jpg',
    url: '/images/gallery/353106.jpg',
    caption: 'High-End Corporate Hospitality Team',
    eventType: 'Corporate Events',
    order: 8
  },
  {
    filename: '353109.jpg',
    url: '/images/gallery/353109.jpg',
    caption: 'Impeccable Guest Welcoming & Protocol',
    eventType: 'VIP Protocol',
    order: 9
  },
  {
    filename: '353112.jpg',
    url: '/images/gallery/353112.jpg',
    caption: 'Professional Event Staffing & Registration',
    eventType: 'Event Staffing',
    order: 10
  },
  {
    filename: '353115.jpg',
    url: '/images/gallery/353115.jpg',
    caption: 'Elegant Wedding Coordination & Guest Ushering',
    eventType: 'Weddings',
    order: 11
  },
  {
    filename: '353124.jpg',
    url: '/images/gallery/353124.jpg',
    caption: 'Executive Hospitality & Brand Ambassadorship',
    eventType: 'Brand Activations',
    order: 12
  }
];

async function seedGallery() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    let admin = await Admin.findOne();
    if (!admin) {
      console.log('No admin found, creating default reference ID');
      admin = { _id: new mongoose.Types.ObjectId() };
    }

    for (const item of galleryData) {
      await Gallery.findOneAndUpdate(
        { filename: item.filename },
        {
          ...item,
          uploadedBy: admin._id,
          uploadedAt: new Date()
        },
        { upsert: true, new: true }
      );
      console.log(`Seeded gallery image: ${item.filename}`);
    }

    const total = await Gallery.countDocuments();
    console.log(`✅ Gallery seeding complete! Total images in DB: ${total}`);
    process.exit(0);
  } catch (err) {
    console.error('Seeding error:', err);
    process.exit(1);
  }
}

seedGallery();
