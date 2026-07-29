const express = require('express');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());

// خدمة ملفات المجلد العام
app.use(express.static(path.join(__dirname, 'public')));

// مسار صريح لصفحة الأدمن بحروف صغيرة وكبيرة لقطع الشك باليقين
app.get(['/admin.html', '/Admin.html', '/admin'], (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://loay:loay123@cluster0.mongodb.net/matjar?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ تم الاتصال بقاعدة بيانات MongoDB Atlas بنجاح'))
    .catch(err => console.error('❌ خطأ في الاتصال بقاعدة البيانات:', err));

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
