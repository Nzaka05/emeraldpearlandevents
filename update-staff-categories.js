require('dotenv').config();
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGO_URI).then(async () => {
    const db = mongoose.connection.db;
    await db.collection('staffs').updateOne({ name: 'Gideon Nzaka' }, { $set: { category: 'Director', title: 'Co-CEO/IT Director' } });
    await db.collection('staffs').updateOne({ name: 'David Charles Abuor' }, { $set: { category: 'Director', title: 'Director' } });
    await db.collection('staffs').updateOne({ name: 'Joshua Nzaka' }, { $set: { category: 'Director', title: 'CEO' } });
    await db.collection('staffs').updateOne({ name: 'Tiffany Hales' }, { $set: { category: 'Usher' } });
    await db.collection('staffs').updateOne({ name: 'Witney Adero' }, { $set: { category: 'Usher' } });
    await db.collection('staffs').updateOne({ name: 'Vanessa Mdee' }, { $set: { category: 'Usher' } });
    await db.collection('staffs').updateOne({ name: 'Naliaka Wendy' }, { $set: { category: 'Usher' } });
    await db.collection('staffs').updateOne({ name: 'Emerald Admin' }, { $set: { category: 'Admin' } });
    console.log('Updated all staff categories');
    mongoose.disconnect();
});
