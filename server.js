const express = require('express');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());

// مسار الأدمن Mappings
app.use((req, res, next) => {
    if (req.url.toLowerCase().includes('admin.html') || req.url.toLowerCase() === '/admin') {
        return res.sendFile(path.join(__dirname, 'public', 'admin.html'));
    }
    next();
});

app.use(express.static(path.join(__dirname, 'public')));

// API تسجيل الدخول للأدمن
app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === 'admin123') {
        res.json({ success: true, message: 'Login successful' });
    } else {
        res.status(401).json({ success: false, message: 'كلمة السر غير صحيحة' });
    }
});

const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://loay:loay123@cluster0.mongodb.net/matjar?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ تم الاتصال بقاعدة البيانات بنجاح'))
    .catch(err => console.error('❌ خطأ في الاتصال بقاعدة البيانات:', err));

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
