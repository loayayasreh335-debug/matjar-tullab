const express = require('express');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json({ limit: '10mb' }));

// الاتصال بـ MongoDB Atlas
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://loay:loay123@cluster0.mongodb.net/matjar?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ تم الاتصال بقاعدة البيانات بنجاح'))
    .catch(err => console.error('❌ خطأ في الاتصال بقاعدة البيانات:', err));

// Schema الإعلانات المتكاملة للموقع
const itemSchema = new mongoose.Schema({
    title: String,
    description: String,
    price: Number,
    category: String,
    governorate: String,
    university: String,
    type: String,
    phone: String,
    image: String,
    createdAt: { type: Date, default: Date.now }
});

const Item = mongoose.model('Item', itemSchema);

// مسار صفحة الأدمن
app.use((req, res, next) => {
    if (req.url.toLowerCase().includes('admin.html') || req.url.toLowerCase() === '/admin') {
        return res.sendFile(path.join(__dirname, 'public', 'admin.html'));
    }
    next();
});

app.use(express.static(path.join(__dirname, 'public')));

// API تسجيل دخول الأدمن
app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === 'admin123') {
        res.json({ success: true, message: 'Login successful' });
    } else {
        res.status(401).json({ success: false, message: 'كلمة السر غير صحيحة' });
    }
});

// APIs الإعلانات (جلب - إضافة - حذف)
app.get(['/api/items', '/api/ads'], async (req, res) => {
    try {
        const items = await Item.find().sort({ createdAt: -1 });
        res.json(items);
    } catch (err) {
        res.status(500).json({ error: 'خطأ في جلب البيانات' });
    }
});

app.post(['/api/items', '/api/ads'], async (req, res) => {
    try {
        const newItem = new Item(req.body);
        await newItem.save();
        res.status(201).json(newItem);
    } catch (err) {
        res.status(500).json({ error: 'خطأ في إضافة الإعلان' });
    }
});

app.delete(['/api/items/:id', '/api/ads/:id'], async (req, res) => {
    try {
        await Item.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'تم الحذف' });
    } catch (err) {
        res.status(500).json({ error: 'خطأ في الحذف' });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
