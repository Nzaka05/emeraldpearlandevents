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
  },

  // ── New 2026 Live Event & Protocol Highlights ──
  {
    filename: 'WhatsApp Image 2026-08-27 at 20.05.44.jpeg',
    url: '/images/gallery/WhatsApp%20Image%202026-08-27%20at%2020.05.44.jpeg',
    caption: 'Signature Emerald Welcome & Executive Guest Hospitality',
    eventType: 'Corporate & VIP',
    order: 32
  },
  {
    filename: 'WhatsApp Image 2026-08-27 at 20.05.44 (1).jpeg',
    url: '/images/gallery/WhatsApp%20Image%202026-08-27%20at%2020.05.44%20(1).jpeg',
    caption: 'Grand Ballroom Entrance & VIP Concierge Squad',
    eventType: 'VIP Protocol',
    order: 33
  },
  {
    filename: 'WhatsApp Image 2026-08-27 at 20.05.44 (2).jpeg',
    url: '/images/gallery/WhatsApp%20Image%202026-08-27%20at%2020.05.44%20(2).jpeg',
    caption: 'Distinguished Gala Coordination & Red Carpet Hosting',
    eventType: 'Corporate & VIP',
    order: 34
  },
  {
    filename: 'WhatsApp Image 2026-08-27 at 20.05.44 (3).jpeg',
    url: '/images/gallery/WhatsApp%20Image%202026-08-27%20at%2020.05.44%20(3).jpeg',
    caption: 'Bespoke Evening Banquet & Protocol Management',
    eventType: 'VIP Protocol',
    order: 35
  },
  {
    filename: 'WhatsApp Image 2026-08-27 at 20.13.18.jpeg',
    url: '/images/gallery/WhatsApp%20Image%202026-08-27%20at%2020.13.18.jpeg',
    caption: 'Luxury Wedding Hostesses & Guest Registration',
    eventType: 'Weddings',
    order: 36
  },
  {
    filename: 'WhatsApp Image 2026-08-27 at 20.13.18 (1).jpeg',
    url: '/images/gallery/WhatsApp%20Image%202026-08-27%20at%2020.13.18%20(1).jpeg',
    caption: 'Traditional Ceremony Protocol & Dignitary Ushering',
    eventType: 'Weddings',
    order: 37
  },
  {
    filename: 'WhatsApp Image 2026-08-27 at 20.13.18 (2).jpeg',
    url: '/images/gallery/WhatsApp%20Image%202026-08-27%20at%2020.13.18%20(2).jpeg',
    caption: 'Royal Wedding Reception Coordination Team',
    eventType: 'Weddings',
    order: 38
  },
  {
    filename: 'WhatsApp Image 2026-08-27 at 20.13.19.jpeg',
    url: '/images/gallery/WhatsApp%20Image%202026-08-27%20at%2020.13.19.jpeg',
    caption: 'High-Level Corporate Summit Staffing & Registration',
    eventType: 'Event Staffing',
    order: 39
  },
  {
    filename: 'WhatsApp Image 2026-08-27 at 20.13.19 (1).jpeg',
    url: '/images/gallery/WhatsApp%20Image%202026-08-27%20at%2020.13.19%20(1).jpeg',
    caption: 'Executive Conference Hosts & Information Desk',
    eventType: 'Event Staffing',
    order: 40
  },
  {
    filename: 'WhatsApp Image 2026-08-27 at 20.13.19 (2).jpeg',
    url: '/images/gallery/WhatsApp%20Image%202026-08-27%20at%2020.13.19%20(2).jpeg',
    caption: 'VIP Lounge Protocol & Exclusive Service Team',
    eventType: 'VIP Protocol',
    order: 41
  },
  {
    filename: 'WhatsApp Image 2026-08-27 at 20.13.19 (3).jpeg',
    url: '/images/gallery/WhatsApp%20Image%202026-08-27%20at%2020.13.19%20(3).jpeg',
    caption: 'Prestigious Award Ceremony Stage & Ushering Crew',
    eventType: 'Corporate & VIP',
    order: 42
  },
  {
    filename: 'WhatsApp Image 2026-08-27 at 20.13.19 (4).jpeg',
    url: '/images/gallery/WhatsApp%20Image%202026-08-27%20at%2020.13.19%20(4).jpeg',
    caption: 'Formal Diplomatic Dinner & Protocol Escorts',
    eventType: 'VIP Protocol',
    order: 43
  },
  {
    filename: 'WhatsApp Image 2026-08-27 at 20.13.20.jpeg',
    url: '/images/gallery/WhatsApp%20Image%202026-08-27%20at%2020.13.20.jpeg',
    caption: 'Luxury Social Soirée & Cocktail Reception Team',
    eventType: 'Social & Private',
    order: 44
  },
  {
    filename: 'WhatsApp Image 2026-08-27 at 20.13.20 (1).jpeg',
    url: '/images/gallery/WhatsApp%20Image%202026-08-27%20at%2020.13.20%20(1).jpeg',
    caption: 'Private Birthday Celebration & Exclusive Hostesses',
    eventType: 'Social & Private',
    order: 45
  },
  {
    filename: 'WhatsApp Image 2026-08-27 at 20.13.20 (2).jpeg',
    url: '/images/gallery/WhatsApp%20Image%202026-08-27%20at%2020.13.20%20(2).jpeg',
    caption: 'Evening Gala Champagne & Service Ambassadorship',
    eventType: 'Social & Private',
    order: 46
  },
  {
    filename: 'WhatsApp Image 2026-08-27 at 20.13.20 (3).jpeg',
    url: '/images/gallery/WhatsApp%20Image%202026-08-27%20at%2020.13.20%20(3).jpeg',
    caption: 'Executive Gala Hall Coordination & Guest Assistance',
    eventType: 'Corporate & VIP',
    order: 47
  },
  {
    filename: 'WhatsApp Image 2026-08-27 at 20.13.21.jpeg',
    url: '/images/gallery/WhatsApp%20Image%202026-08-27%20at%2020.13.21.jpeg',
    caption: 'Corporate Brand Activation & Experience Ambassadors',
    eventType: 'Event Staffing',
    order: 48
  },
  {
    filename: 'WhatsApp Image 2026-08-27 at 20.13.21 (1).jpeg',
    url: '/images/gallery/WhatsApp%20Image%202026-08-27%20at%2020.13.21%20(1).jpeg',
    caption: 'Premier Product Launch & VIP Reception Staff',
    eventType: 'Corporate & VIP',
    order: 49
  },
  {
    filename: 'WhatsApp Image 2026-08-27 at 20.13.22.jpeg',
    url: '/images/gallery/WhatsApp%20Image%202026-08-27%20at%2020.13.22.jpeg',
    caption: 'Luxury Garden Party Coordination & Guest Welcoming',
    eventType: 'Social & Private',
    order: 50
  },
  {
    filename: 'WhatsApp Image 2026-08-27 at 20.13.22 (1).jpeg',
    url: '/images/gallery/WhatsApp%20Image%202026-08-27%20at%2020.13.22%20(1).jpeg',
    caption: 'Bespoke Outdoor Celebration Protocol Officers',
    eventType: 'Social & Private',
    order: 51
  },
  {
    filename: 'WhatsApp Image 2026-08-27 at 20.13.22 (2).jpeg',
    url: '/images/gallery/WhatsApp%20Image%202026-08-27%20at%2020.13.22%20(2).jpeg',
    caption: 'Distinguished State & Corporate Banquet Ushers',
    eventType: 'VIP Protocol',
    order: 52
  },
  {
    filename: 'WhatsApp Image 2026-08-27 at 20.13.22 (3).jpeg',
    url: '/images/gallery/WhatsApp%20Image%202026-08-27%20at%2020.13.22%20(3).jpeg',
    caption: 'Grand Gala Dinner Seating & Protocol Direction',
    eventType: 'Corporate & VIP',
    order: 53
  },
  {
    filename: 'WhatsApp Image 2026-08-27 at 20.13.23.jpeg',
    url: '/images/gallery/WhatsApp%20Image%202026-08-27%20at%2020.13.23.jpeg',
    caption: 'Executive Protocol Squadron in Custom Uniforms',
    eventType: 'Event Staffing',
    order: 54
  },
  {
    filename: 'WhatsApp Image 2026-08-27 at 20.13.24.jpeg',
    url: '/images/gallery/WhatsApp%20Image%202026-08-27%20at%2020.13.24.jpeg',
    caption: 'Impeccable Wedding Guest Escort & Ceremony Ushering',
    eventType: 'Weddings',
    order: 55
  },
  {
    filename: 'WhatsApp Image 2026-08-27 at 20.15.37.jpeg',
    url: '/images/gallery/WhatsApp%20Image%202026-08-27%20at%2020.15.37.jpeg',
    caption: 'Traditional Bridal Ceremony Hosts & Ushering',
    eventType: 'Weddings',
    order: 56
  },
  {
    filename: 'WhatsApp Image 2026-08-27 at 20.15.37 (1).jpeg',
    url: '/images/gallery/WhatsApp%20Image%202026-08-27%20at%2020.15.37%20(1).jpeg',
    caption: 'Cultural Celebration Hostesses in Bespoke Attire',
    eventType: 'Weddings',
    order: 57
  },
  {
    filename: 'WhatsApp Image 2026-08-27 at 20.15.38.jpeg',
    url: '/images/gallery/WhatsApp%20Image%202026-08-27%20at%2020.15.38.jpeg',
    caption: 'VIP Dignitary Welcoming Line & Stage Escort',
    eventType: 'VIP Protocol',
    order: 58
  },
  {
    filename: 'WhatsApp Image 2026-08-27 at 20.15.38 (1).jpeg',
    url: '/images/gallery/WhatsApp%20Image%202026-08-27%20at%2020.15.38%20(1).jpeg',
    caption: 'Annual Corporate Convention Logistics & Staffing',
    eventType: 'Event Staffing',
    order: 59
  },
  {
    filename: 'WhatsApp Image 2026-08-27 at 20.15.38 (2).jpeg',
    url: '/images/gallery/WhatsApp%20Image%202026-08-27%20at%2020.15.38%20(2).jpeg',
    caption: 'High-Profile Event Management & Floor Direction',
    eventType: 'Corporate & VIP',
    order: 60
  },
  {
    filename: 'WhatsApp Image 2026-08-27 at 20.21.41.jpeg',
    url: '/images/gallery/WhatsApp%20Image%202026-08-27%20at%2020.21.41.jpeg',
    caption: 'Luxury Gala Grand Finale & Guest Farewell Protocol',
    eventType: 'VIP Protocol',
    order: 61
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
