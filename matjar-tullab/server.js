// server.js
// سيرفر تطبيق "متجر الطلاب" - سوق مقايضة لطلاب الجامعات
// يستخدم Express + Multer، والتخزين يكون في ملف JSON محلي (بدون حاجة لأي بناء مكتبات native)

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- إعداد المسارات والمجلدات ----------
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'items.json');

// إنشاء المجلدات إن لم تكن موجودة
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf-8');

// ---------- دوال مساعدة لقراءة/كتابة قاعدة البيانات (JSON) ----------
function readItems() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw || '[]');
  } catch (err) {
    console.error('خطأ في قراءة ملف البيانات:', err);
    return [];
  }
}

function writeItems(items) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2), 'utf-8');
}

// ---------- إعداد رفع الصور (Multer) ----------
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_DIR);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname) || '.jpg';
    const uniqueName = 'item-' + Date.now() + '-' + Math.round(Math.random() * 1e9) + ext;
    cb(null, uniqueName);
  }
});

function fileFilter(req, file, cb) {
  const allowed = /jpeg|jpg|png|gif|webp/;
  const extOk = allowed.test(path.extname(file.originalname).toLowerCase());
  const mimeOk = allowed.test(file.mimetype);
  if (extOk && mimeOk) {
    cb(null, true);
  } else {
    cb(new Error('نوع الملف غير مدعوم. يرجى رفع صورة (jpg, png, gif, webp)'));
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5 ميجابايت كحد أقصى
});

// ---------- الميدلوير العام ----------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// تقديم الملفات الثابتة (الواجهة الأمامية)
app.use(express.static(path.join(__dirname, 'public')));
// تقديم الصور المرفوعة
app.use('/uploads', express.static(UPLOADS_DIR));

// ---------- المسارات (API Routes) ----------

// جلب كل الإعلانات (الأحدث أولاً)
app.get('/api/items', (req, res) => {
  const items = readItems();
  items.sort((a, b) => b.createdAt - a.createdAt);
  res.json(items);
});

// إضافة إعلان جديد
app.post('/api/items', upload.single('image'), (req, res) => {
  try {
    const { name, description, lookingFor, whatsapp } = req.body;

    if (!name || !description || !lookingFor || !whatsapp) {
      return res.status(400).json({ error: 'يرجى تعبئة جميع الحقول المطلوبة' });
    }

    // تنظيف رقم الواتساب من أي رموز غير رقمية (يبقي علامة + إن وجدت في البداية)
    const cleanedWhatsapp = whatsapp.trim().replace(/[^\d+]/g, '');

    const newItem = {
      id: Date.now().toString(36) + Math.round(Math.random() * 1e6).toString(36),
      name: name.trim(),
      description: description.trim(),
      lookingFor: lookingFor.trim(),
      whatsapp: cleanedWhatsapp,
      imageUrl: req.file ? '/uploads/' + req.file.filename : null,
      createdAt: Date.now()
    };

    const items = readItems();
    items.push(newItem);
    writeItems(items);

    res.status(201).json(newItem);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء إضافة الإعلان' });
  }
});

// حذف إعلان (اختياري، مفيد للتجربة والصيانة)
app.delete('/api/items/:id', (req, res) => {
  const items = readItems();
  const item = items.find(i => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'الإعلان غير موجود' });

  // حذف الصورة المرتبطة إن وجدت
  if (item.imageUrl) {
    const imgPath = path.join(__dirname, item.imageUrl);
    if (fs.existsSync(imgPath)) {
      fs.unlink(imgPath, () => {});
    }
  }

  const filtered = items.filter(i => i.id !== req.params.id);
  writeItems(filtered);
  res.json({ success: true });
});

// معالجة أخطاء Multer (مثل حجم الملف الكبير)
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err) {
    return res.status(400).json({ error: err.message });
  }
  next();
});

// ---------- تشغيل السيرفر ----------
app.listen(PORT, () => {
  console.log(`✅ السيرفر يعمل الآن على: http://localhost:${PORT}`);
});
