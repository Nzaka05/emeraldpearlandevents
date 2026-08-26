require('dotenv').config();
const mongoose = require('mongoose');
const Admin = require('./server/models/Admin');
const Gallery = require('./server/models/Gallery');

const allGalleryData = [
  // ── Windsor Golf Club & Executive Galas ──
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

  // ── Celebrations & Staffing ──
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
    eventType: 'Corporate & VIP',
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
    eventType: 'Event Staffing',
    order: 12
  },

  // ── High-Profile Ceremonies & Social Archive ──
  {
    filename: 'WhatsApp Image 2025-10-01 at 00.29.40.jpeg',
    url: '/images/gallery/WhatsApp%20Image%202025-10-01%20at%2000.29.40.jpeg',
    caption: 'Traditional Celebration & Royal Attire Ushering',
    eventType: 'Weddings',
    order: 13
  },
  {
    filename: 'WhatsApp Image 2025-10-01 at 00.29.42.jpeg',
    url: '/images/gallery/WhatsApp%20Image%202025-10-01%20at%2000.29.42.jpeg',
    caption: 'Luxury Ceremony Hostesses in Traditional Regalia',
    eventType: 'Weddings',
    order: 14
  },
  {
    filename: 'WhatsApp Image 2025-10-01 at 00.29.42 (1).jpeg',
    url: '/images/gallery/WhatsApp%20Image%202025-10-01%20at%2000.29.42%20(1).jpeg',
    caption: 'Distinguished Guest Protocol & Cultural Gala',
    eventType: 'VIP Protocol',
    order: 15
  },
  {
    filename: 'WhatsApp Image 2025-10-01 at 00.29.43.jpeg',
    url: '/images/gallery/WhatsApp%20Image%202025-10-01%20at%2000.29.43.jpeg',
    caption: 'Traditional Wedding Protocol Officers',
    eventType: 'Weddings',
    order: 16
  },
  {
    filename: 'WhatsApp Image 2025-10-01 at 00.30.39.jpeg',
    url: '/images/gallery/WhatsApp%20Image%202025-10-01%20at%2000.30.39.jpeg',
    caption: 'Black-Tie Corporate Banquet Management',
    eventType: 'Corporate & VIP',
    order: 17
  },
  {
    filename: 'WhatsApp Image 2025-10-01 at 00.30.40.jpeg',
    url: '/images/gallery/WhatsApp%20Image%202025-10-01%20at%2000.30.40.jpeg',
    caption: 'VIP Red Carpet Guest Management',
    eventType: 'VIP Protocol',
    order: 18
  },
  {
    filename: 'WhatsApp Image 2025-10-01 at 00.30.40 (1).jpeg',
    url: '/images/gallery/WhatsApp%20Image%202025-10-01%20at%2000.30.40%20(1).jpeg',
    caption: 'Executive Dinner Coordination & Service',
    eventType: 'Corporate & VIP',
    order: 19
  },
  {
    filename: 'WhatsApp Image 2025-10-01 at 00.30.41.jpeg',
    url: '/images/gallery/WhatsApp%20Image%202025-10-01%20at%2000.30.41.jpeg',
    caption: 'Elegant Ballroom Ushering Team',
    eventType: 'Event Staffing',
    order: 20
  },
  {
    filename: 'WhatsApp Image 2025-10-01 at 00.30.42.jpeg',
    url: '/images/gallery/WhatsApp%20Image%202025-10-01%20at%2000.30.42.jpeg',
    caption: 'Premium Banquet Escort & Hostess Service',
    eventType: 'Event Staffing',
    order: 21
  },
  {
    filename: 'WhatsApp Image 2025-10-01 at 00.30.43.jpeg',
    url: '/images/gallery/WhatsApp%20Image%202025-10-01%20at%2000.30.43.jpeg',
    caption: 'Corporate Gala Stage & Protocol Management',
    eventType: 'Corporate & VIP',
    order: 22
  },
  {
    filename: 'WhatsApp Image 2025-10-01 at 00.30.44.jpeg',
    url: '/images/gallery/WhatsApp%20Image%202025-10-01%20at%2000.30.44.jpeg',
    caption: 'High-Level Dignitary Welcoming Team',
    eventType: 'VIP Protocol',
    order: 23
  },
  {
    filename: 'WhatsApp Image 2025-10-01 at 00.30.45.jpeg',
    url: '/images/gallery/WhatsApp%20Image%202025-10-01%20at%2000.30.45.jpeg',
    caption: 'Bespoke Private Event Service Staff',
    eventType: 'Social & Private',
    order: 24
  },
  {
    filename: 'WhatsApp Image 2025-10-01 at 00.30.46.jpeg',
    url: '/images/gallery/WhatsApp%20Image%202025-10-01%20at%2000.30.46.jpeg',
    caption: 'Evening Gala Receptionists & Hostesses',
    eventType: 'Corporate & VIP',
    order: 25
  },
  {
    filename: 'WhatsApp Image 2025-10-01 at 00.30.47.jpeg',
    url: '/images/gallery/WhatsApp%20Image%202025-10-01%20at%2000.30.47.jpeg',
    caption: 'Luxury Social Soirée Coordination',
    eventType: 'Social & Private',
    order: 26
  },
  {
    filename: 'WhatsApp Image 2025-10-01 at 00.30.48.jpeg',
    url: '/images/gallery/WhatsApp%20Image%202025-10-01%20at%2000.30.48.jpeg',
    caption: 'VIP Lounge Coordination & Hospitality',
    eventType: 'VIP Protocol',
    order: 27
  },
  {
    filename: 'WhatsApp Image 2025-10-01 at 00.30.49.jpeg',
    url: '/images/gallery/WhatsApp%20Image%202025-10-01%20at%2000.30.49.jpeg',
    caption: 'Grand Ceremony Ushering Squadron',
    eventType: 'Event Staffing',
    order: 28
  },
  {
    filename: 'WhatsApp Image 2025-10-01 at 00.30.51.jpeg',
    url: '/images/gallery/WhatsApp%20Image%202025-10-01%20at%2000.30.51.jpeg',
    caption: 'Formal Gala Entrance Management',
    eventType: 'Corporate & VIP',
    order: 29
  },
  {
    filename: 'WhatsApp Image 2025-10-01 at 00.30.52.jpeg',
    url: '/images/gallery/WhatsApp%20Image%202025-10-01%20at%2000.30.52.jpeg',
    caption: 'Executive Event Registration Desk Team',
    eventType: 'Event Staffing',
    order: 30
  },
  {
    filename: 'WhatsApp Image 2025-10-01 at 00.30.53.jpeg',
    url: '/images/gallery/WhatsApp%20Image%202025-10-01%20at%2000.30.53.jpeg',
    caption: 'Luxury Gala Farewell & Guest Departure Protocol',
    eventType: 'VIP Protocol',
    order: 31
  }
];

async function seedGallery() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    let admin = await Admin.findOne();
    if (!admin) {
      admin = { _id: new mongoose.Types.ObjectId() };
    }

    for (const item of allGalleryData) {
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
