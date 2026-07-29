// server.js
// سيرفر تطبيق "متجر الطلاب" - سوق مقايضة لطلاب الجامعات
// يستخدم Express + Multer، والتخزين الدائم يكون على MongoDB Atlas (بيانات) و Cloudinary (صور)
// كلاهما مجاني للأبد بدون بطاقة ائتمان - لا يعتمد على القرص المحلي إطلاقاً

require('dotenv').config();

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { MongoClient } = require('mongodb');
const cloudinary = require('cloudinary').v2;

const app = express();
const PORT = process.env.PORT || 3000;

// مدة صلاحية الإعلان قبل حذفه تلقائياً (بالمللي ثانية) = 30 يوماً
const EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_IMAGES = 4;

// قائمة الجامعات الأردنية المتاحة للاختيار
const JORDAN_UNIVERSITIES = [
  'الجامعة الأردنية', 'جامعة اليرموك', 'جامعة العلوم والتكنولوجيا الأردنية',
  'جامعة البلقاء التطبيقية - السلط', 'الجامعة الأردنية الألمانية', 'الجامعة الهاشمية',
  'جامعة مؤتة', 'جامعة آل البيت', 'جامعة الحسين بن طلال', 'جامعة الطفيلة التقنية',
  'الجامعة الأمريكية بمادبا', 'جامعة فيلادلفيا', 'جامعة الزيتونة الأردنية',
  'جامعة عمان الأهلية', 'جامعة البترا', 'جامعة الإسراء', 'جامعة الشرق الأوسط',
  'جامعة عمان العربية', 'جامعة جدارا', 'جامعة أخرى'
];

// قائمة تصنيفات الأغراض
const CATEGORIES = [
  'كتب دراسية', 'قرطاسية وأدوات مكتبية', 'إلكترونيات', 'أثاث ومستلزمات سكن',
  'ملابس وأزياء', 'حسابات ألعاب', 'أخرى'
];

// التصنيفات التي تحتاج تنبيه أمان خاص عند النشر
const RISKY_CATEGORIES = ['حسابات ألعاب'];

// أنواع الألعاب المتاحة لتصنيف حسابات الألعاب
const GAME_TYPES = [
  'ببجي موبايل (PUBG)', 'فري فاير (Free Fire)', 'فورتنايت (Fortnite)', 'فيفا (FIFA)',
  'بيس (PES)', 'كلاش أوف كلانس', 'ماين كرافت', 'روبلوکس', 'لعبة أخرى'
];

// التصنيفات التي يكون فيها حقل "نوع اللعبة" إجبارياً
const GAME_RELATED_CATEGORIES = ['حسابات ألعاب'];

// محافظات الأردن ومناطقها الفرعية
const JORDAN_LOCATIONS = {
  'عمان': [
    'وسط البلد', 'جبل عمان', 'جبل اللويبدة', 'الشميساني', 'عبدون', 'دابوق',
    'خلدا', 'أم أذينة', 'تلاع العلي', 'صويلح', 'الجبيهة', 'الرابية',
    'أم السماق', 'دير غبار', 'ماركا', 'النصر', 'القويسمة', 'سحاب',
    'طبربور', 'الدوار السابع', 'الدوار الثامن', 'حي نزال', 'جبل الحسين',
    'زهران', 'شفا بدران', 'بيادر وادي السير', 'ياجوز', 'المقابلين', 'أخرى'
  ],
  'إربد': ['مركز إربد', 'الرمثا', 'الحصن', 'بشرى', 'كفرسوم', 'الطرة', 'النعيمة', 'حوارة', 'إربد الجديدة', 'الشونة الشمالية', 'أخرى'],
  'الزرقاء': ['مركز الزرقاء', 'الرصيفة', 'الهاشمية', 'الأزرق', 'الضليل', 'أخرى'],
  'البلقاء': ['السلط', 'الفحيص', 'ماحص', 'عين الباشا', 'دير علا', 'أخرى'],
  'مادبا': ['مادبا المدينة', 'ذيبان', 'الفيصلية', 'أخرى'],
  'الكرك': ['الكرك المدينة', 'القصر', 'المزار الجنوبي', 'عي', 'الأغوار الجنوبية', 'أخرى'],
  'الطفيلة': ['الطفيلة المدينة', 'بصيرا', 'الحسا', 'أخرى'],
  'معان': ['معان المدينة', 'الشوبك', 'وادي موسى (البترا)', 'الجفر', 'أخرى'],
  'العقبة': ['العقبة المدينة', 'القويرة', 'الديسة', 'أخرى'],
  'جرش': ['وسط المدينة', 'ساكب', 'كتة', 'ريمون', 'برما', 'سوف', 'أخرى'],
  'عجلون': ['عجلون المدينة', 'عنجرة', 'كفرنجة', 'صخرة', 'أخرى'],
  'المفرق': ['المفرق المدينة', 'الرويشد', 'الخالدية', 'البادية الشمالية', 'أخرى']
};

// التصنيفات التي يكون فيها حقل الجامعة إجبارياً
const UNIVERSITY_RELATED_CATEGORIES = ['كتب دراسية', 'قرطاسية وأدوات مكتبية'];

// رقم واتساب صاحب المنصة للتواصل بخصوص مشاكل أو اقتراحات
const DEVELOPER_WHATSAPP = '962771587863';

// صورة افتراضية تُستخدم تلقائياً عندما لا يرفع المستخدم أي صورة للإعلان
// (نص إنجليزي بسيط فقط بالرابط - خدمة placehold.co لا تدعم عرض الخطوط العربية بشكل صحيح)
const PLACEHOLDER_IMAGE_URL = 'https://placehold.co/800x600/e5e7eb/6b7280?text=No+Image';

// أنواع الإعلان المتاحة
const AD_TYPES = ['sell', 'barter'];

// ---------- إعداد الاتصال بـ MongoDB Atlas (تخزين البيانات الدائم) ----------
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ خطأ: متغير البيئة MONGODB_URI غير موجود. راجع ملف .env أو إعدادات Render.');
  process.exit(1);
}

let db;
const mongoClient = new MongoClient(MONGODB_URI);

async function connectDB() {
  await mongoClient.connect();
  db = mongoClient.db(); // اسم القاعدة يُقرأ من نهاية رابط الاتصال نفسه
  await db.collection('items').createIndex({ id: 1 }, { unique: true });
  await db.collection('items').createIndex({ createdAt: -1 });
  console.log('✅ تم الاتصال بقاعدة بيانات MongoDB Atlas بنجاح');
}

// ---------- إعداد Cloudinary (تخزين الصور الدائم) ----------
// يقرأ تلقائياً متغير البيئة CLOUDINARY_URL إن وُجد
if (!process.env.CLOUDINARY_URL) {
  console.error('❌ خطأ: متغير البيئة CLOUDINARY_URL غير موجود. راجع ملف .env أو إعدادات Render.');
  process.exit(1);
}

function uploadImageToCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'matjar-tullab', resource_type: 'image' },
      (err, result) => {
        if (err) return reject(err);
        resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );
    stream.end(buffer);
  });
}

async function deleteImagesFromCloudinary(publicIds) {
  for (const publicId of publicIds || []) {
    try {
      await cloudinary.uploader.destroy(publicId);
    } catch (err) {
      console.error('تعذر حذف صورة من Cloudinary:', publicId, err.message);
    }
  }
}

// ---------- دوال مساعدة ----------

// توحيد شكل الإعلان (يدعم إعلانات قديمة إن وُجدت)
function normalizeItem(item) {
  if (!item.imageUrls) item.imageUrls = [];
  if (!item.imagePublicIds) item.imagePublicIds = [];
  if (!item.category) item.category = 'أخرى';
  if (!item.gameType) item.gameType = '';
  if (!item.governorate) item.governorate = '';
  if (!item.area) item.area = '';
  if (!item.adType) item.adType = 'barter'; // الإعلانات القديمة كلها كانت مقايضة قبل هذه الميزة
  if (typeof item.price !== 'number') item.price = null;
  if (typeof item.views !== 'number') item.views = 0;
  if (typeof item.isSwapped !== 'boolean') item.isSwapped = false;
  return item;
}

// إخفاء الحقول الحساسة قبل إرسال الإعلان للعميل
function toPublicItem(item) {
  const { ownerToken, imagePublicIds, _id, ...publicItem } = item;
  return publicItem;
}

// حذف الإعلانات المنتهية (أقدم من 30 يوماً) مع صورها من Cloudinary
async function cleanupExpiredItems() {
  const cutoff = Date.now() - EXPIRY_MS;
  const expired = await db.collection('items').find({ createdAt: { $lt: cutoff } }).toArray();

  if (expired.length > 0) {
    for (const item of expired) {
      await deleteImagesFromCloudinary(item.imagePublicIds);
    }
    await db.collection('items').deleteMany({ createdAt: { $lt: cutoff } });
    console.log(`🧹 تم حذف ${expired.length} إعلان منتهي الصلاحية (أقدم من 30 يوماً)`);
  }
}

// حد أقصى لعدد الإعلانات المسموح نشرها من نفس الجهاز خلال 24 ساعة (حماية بسيطة من السبام)
const DAILY_POST_LIMIT = 5;
const deviceLimitTracker = new Map(); // deviceId => [timestamps]

function isRateLimited(deviceId) {
  if (!deviceId) return false;
  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  const timestamps = (deviceLimitTracker.get(deviceId) || []).filter(t => t > oneDayAgo);
  deviceLimitTracker.set(deviceId, timestamps);
  return timestamps.length >= DAILY_POST_LIMIT;
}

function recordPost(deviceId) {
  if (!deviceId) return;
  const timestamps = deviceLimitTracker.get(deviceId) || [];
  timestamps.push(Date.now());
  deviceLimitTracker.set(deviceId, timestamps);
}

// ---------- إعداد رفع الصور (Multer في الذاكرة - بدون حفظ محلي) ----------
function fileFilter(req, file, cb) {
  const allowed = /jpeg|jpg|png|gif|webp/;
  const extOk = allowed.test(path.extname(file.originalname).toLowerCase());
  const mimeOk = allowed.test(file.mimetype);
  if (extOk && mimeOk) cb(null, true);
  else cb(new Error('نوع الملف غير مدعوم. يرجى رفع صور (jpg, png, gif, webp)'));
}

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
});

// ---------- الميدلوير العام ----------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- المسارات (API Routes) ----------

app.get('/api/universities', (req, res) => res.json(JORDAN_UNIVERSITIES));
app.get('/api/categories', (req, res) => res.json(CATEGORIES));
app.get('/api/risky-categories', (req, res) => res.json(RISKY_CATEGORIES));
app.get('/api/game-types', (req, res) => res.json(GAME_TYPES));
app.get('/api/locations', (req, res) => res.json(JORDAN_LOCATIONS));
app.get('/api/developer-contact', (req, res) => res.json({ whatsapp: DEVELOPER_WHATSAPP }));

app.get('/api/stats', async (req, res) => {
  try {
    await cleanupExpiredItems();
    const totalItems = await db.collection('items').countDocuments();
    res.json({ totalItems });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'تعذر جلب الإحصائيات' });
  }
});

app.post('/api/items/:id/report', async (req, res) => {
  try {
    const { reason } = req.body;
    const item = await db.collection('items').findOne({ id: req.params.id });
    if (!item) return res.status(404).json({ error: 'الإعلان غير موجود' });

    await db.collection('reports').insertOne({
      itemId: item.id,
      itemName: item.name,
      reason: (reason || 'غير محدد').trim().slice(0, 300),
      reportedAt: Date.now()
    });

    res.status(201).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'تعذر إرسال البلاغ' });
  }
});

app.get('/api/items', async (req, res) => {
  try {
    await cleanupExpiredItems();
    const items = await db.collection('items').find({}).sort({ createdAt: -1 }).toArray();
    res.json(items.map(normalizeItem).map(toPublicItem));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'تعذر جلب الإعلانات' });
  }
});

app.get('/api/items/:id', async (req, res) => {
  try {
    const result = await db.collection('items').findOneAndUpdate(
      { id: req.params.id },
      { $inc: { views: 1 } },
      { returnDocument: 'after' }
    );
    const item = result && result.value ? result.value : result;
    if (!item) return res.status(404).json({ error: 'الإعلان غير موجود أو تم حذفه' });
    res.json(toPublicItem(normalizeItem(item)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'تعذر جلب الإعلان' });
  }
});

app.post('/api/items', upload.array('images', MAX_IMAGES), async (req, res) => {
  try {
    const deviceId = req.headers['x-device-id'];
    if (isRateLimited(deviceId)) {
      return res.status(429).json({ error: `وصلت للحد الأقصى (${DAILY_POST_LIMIT} إعلانات) خلال 24 ساعة. حاول مرة أخرى لاحقاً.` });
    }

    const { name, description, lookingFor, whatsapp, university, category, gameType, governorate, area, adType, price } = req.body;

    if (!name || !description || !whatsapp || !category || !governorate || !area) {
      return res.status(400).json({ error: 'يرجى تعبئة جميع الحقول المطلوبة (بما فيها المحافظة والمنطقة)' });
    }
    if (!JORDAN_LOCATIONS[governorate] || !JORDAN_LOCATIONS[governorate].includes(area)) {
      return res.status(400).json({ error: 'المحافظة أو المنطقة المختارة غير صحيحة' });
    }

    const cleanAdType = AD_TYPES.includes(adType) ? adType : null;
    if (!cleanAdType) {
      return res.status(400).json({ error: 'يرجى اختيار نوع الإعلان: بيع أو مقايضة' });
    }

    let cleanPrice = null;
    if (cleanAdType === 'sell') {
      const parsedPrice = parseFloat(price);
      if (isNaN(parsedPrice) || parsedPrice <= 0) {
        return res.status(400).json({ error: 'يرجى إدخال سعر صحيح للإعلان' });
      }
      cleanPrice = parsedPrice;
    } else if (cleanAdType === 'barter' && !lookingFor) {
      return res.status(400).json({ error: 'يرجى تحديد ما ترغب بالمقايضة به' });
    }

    const isUniversityRequired = UNIVERSITY_RELATED_CATEGORIES.includes(category.trim());
    if (isUniversityRequired && !university) {
      return res.status(400).json({ error: 'يرجى اختيار الجامعة لهذا التصنيف' });
    }
    const isGameTypeRequired = GAME_RELATED_CATEGORIES.includes(category.trim());
    if (isGameTypeRequired && !gameType) {
      return res.status(400).json({ error: 'يرجى اختيار نوع اللعبة' });
    }

    // رفع الصور إلى Cloudinary (اختياري تماماً - لو ما رفع المستخدم أي صورة نستخدم صورة افتراضية)
    const uploaded = await Promise.all(
      (req.files || []).map(f => uploadImageToCloudinary(f.buffer))
    );

    const cleanedWhatsapp = whatsapp.trim().replace(/[^\d+]/g, '');
    const ownerToken = crypto.randomBytes(16).toString('hex');

    const newItem = {
      id: Date.now().toString(36) + Math.round(Math.random() * 1e6).toString(36),
      name: name.trim(),
      description: description.trim(),
      adType: cleanAdType,
      price: cleanPrice,
      lookingFor: cleanAdType === 'barter' ? lookingFor.trim() : '',
      whatsapp: cleanedWhatsapp,
      university: university ? university.trim() : '',
      category: category.trim(),
      gameType: gameType ? gameType.trim() : '',
      governorate: governorate.trim(),
      area: area.trim(),
      imageUrls: uploaded.length ? uploaded.map(u => u.url) : [PLACEHOLDER_IMAGE_URL],
      imagePublicIds: uploaded.map(u => u.publicId), // فاضية لو استخدمنا الصورة الافتراضية (لا شيء نحذفه من Cloudinary لاحقاً)
      createdAt: Date.now(),
      isSwapped: false,
      views: 0,
      ownerToken
    };

    await db.collection('items').insertOne(newItem);
    recordPost(deviceId);

    res.status(201).json({ ...toPublicItem(newItem), ownerToken });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء إضافة الإعلان' });
  }
});

app.patch('/api/items/:id/swap', async (req, res) => {
  try {
    const { ownerToken } = req.body;
    const item = await db.collection('items').findOne({ id: req.params.id });
    if (!item) return res.status(404).json({ error: 'الإعلان غير موجود' });
    if (!ownerToken || ownerToken !== item.ownerToken) {
      return res.status(403).json({ error: 'غير مصرح لك بتعديل هذا الإعلان' });
    }

    await db.collection('items').updateOne(
      { id: req.params.id },
      { $set: { isSwapped: !item.isSwapped } }
    );
    const updated = await db.collection('items').findOne({ id: req.params.id });
    res.json(toPublicItem(normalizeItem(updated)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'تعذر تحديث حالة الإعلان' });
  }
});

app.delete('/api/items/:id', async (req, res) => {
  try {
    const { ownerToken } = req.body;
    const item = await db.collection('items').findOne({ id: req.params.id });
    if (!item) return res.status(404).json({ error: 'الإعلان غير موجود' });
    if (!ownerToken || ownerToken !== item.ownerToken) {
      return res.status(403).json({ error: 'غير مصرح لك بحذف هذا الإعلان' });
    }

    await deleteImagesFromCloudinary(item.imagePublicIds);
    await db.collection('items').deleteOne({ id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'تعذر حذف الإعلان' });
  }
});

// تهريب النصوص قبل إدراجها داخل خصائص HTML
function escapeAttr(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function injectOgTags(html, { title, description, image, url }) {
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeAttr(title)}</title>`);
  html = html.replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${escapeAttr(title)}">`);
  html = html.replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${escapeAttr(description)}">`);
  html = html.replace(/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${escapeAttr(image)}">`);
  html = html.replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${escapeAttr(url)}">`);
  return html;
}

app.get('/item/:id', async (req, res) => {
  try {
    const item = await db.collection('items').findOne({ id: req.params.id });
    const baseHtml = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf-8');
    if (!item) return res.send(baseHtml);

    const fullUrl = `${req.protocol}://${req.get('host')}/item/${item.id}`;
    const imageUrl = item.imageUrls && item.imageUrls[0] ? item.imageUrls[0] : '';

    const html = injectOgTags(baseHtml, {
      title: `${item.name} | متجر الطلاب`,
      description: `متاح للمقايضة بـ: ${item.lookingFor} — ${item.description}`.slice(0, 200),
      image: imageUrl,
      url: fullUrl
    });
    res.send(html);
  } catch (err) {
    console.error(err);
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

app.get('/university/:name', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// معالجة أخطاء Multer
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err) {
    return res.status(400).json({ error: err.message });
  }
  next();
});

// صفحة 404 مخصصة
app.use((req, res) => {
  res.status(404).send(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>الصفحة غير موجودة | متجر الطلاب</title>
      <style>
        body { font-family: Tahoma, Arial, sans-serif; background:#f5f6f8; color:#1f2430;
               display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; text-align:center; padding:20px; }
        .box { max-width:380px; }
        .emoji { font-size:60px; margin-bottom:10px; }
        h1 { font-size:20px; margin:0 0 10px; }
        p { color:#6b7280; font-size:14px; margin:0 0 20px; }
        a { background:#ff7a1a; color:#fff; text-decoration:none; padding:12px 24px; border-radius:10px; font-weight:700; display:inline-block; }
      </style>
    </head>
    <body>
      <div class="box">
        <div class="emoji">🔍📦</div>
        <h1>هاي الصفحة مش موجودة</h1>
        <p>يمكن الرابط قديم أو انحذف الإعلان. ارجع للصفحة الرئيسية وتصفح باقي الإعلانات.</p>
        <a href="/">🏠 الصفحة الرئيسية</a>
      </div>
    </body>
    </html>
  `);
});
// حذف إعلان من قبل المطور (للوحة الإدارية)
app.delete('/api/admin/items/:id', async (req, res) => {
  try {
    const { adminPassword } = req.body;
    if (adminPassword !== 'admin123') {
      return res.status(403).json({ error: 'غير مصرح لك بالحذف' });
    }
    const item = await db.collection('items').findOne({ id: req.params.id });
    if (!item) return res.status(404).json({ error: 'الإعلان غير موجود' });
    
    await deleteImagesFromCloudinary(item.imagePublicIds);
    await db.collection('items').deleteOne({ id: req.params.id });
    res.json({ success: true, message: 'تم حذف الإعلان بنجاح' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'تعذر حذف الإعلان' });
  }
});
// ---------- تشغيل السيرفر ----------
connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`✅ السيرفر يعمل الآن على: http://localhost:${PORT}`);
      cleanupExpiredItems();
      setInterval(cleanupExpiredItems, 12 * 60 * 60 * 1000);
    });
  })
  .catch(err => {
    console.error('❌ فشل الاتصال بقاعدة البيانات:', err.message);
    process.exit(1);
  });
