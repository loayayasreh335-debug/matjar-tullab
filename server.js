// server.js
// سيرفر تطبيق "متجر الطلاب" - سوق مقايضة لطلاب الجامعات
// يستخدم Express + Multer + MongoDB Atlas (Mongoose) لتخزين دائم للإعلانات

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- الاتصال بقاعدة بيانات MongoDB Atlas ----------
const MONGODB_URI = process.env.MONGODB_URI;
if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ MongoDB Connected Successfully'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));
} else {
  console.error('⚠️ لم يتم ضبط متغير البيئة MONGODB_URI');
}

const EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_IMAGES = 4;

const JORDAN_UNIVERSITIES = [
  'الجامعة الأردنية', 'جامعة اليرموك', 'جامعة العلوم والتكنولوجيا الأردنية',
  'جامعة البلقاء التطبيقية - السلط', 'الجامعة الأردنية الألمانية', 'الجامعة الهاشمية',
  'جامعة مؤتة', 'جامعة آل البيت', 'جامعة الحسين بن طلال', 'جامعة الطفيلة التقنية',
  'الجامعة الأمريكية بمادبا', 'جامعة فيلادلفيا', 'جامعة الزيتونة الأردنية',
  'جامعة عمان الأهلية', 'جامعة البترا', 'جامعة الإسراء', 'جامعة الشرق الأوسط',
  'جامعة عمان العربية', 'جامعة جدارا', 'جامعة أخرى'
];

const CATEGORIES = [
  'كتب دراسية', 'قرطاسية وأدوات مكتبية', 'إلكترونيات',
  'أثاث ومستلزمات سكن', 'ملابس وأزياء', 'حسابات ألعاب', 'أخرى'
];

const RISKY_CATEGORIES = ['حسابات ألعاب'];

const GAME_TYPES = [
  'ببجي موبايل (PUBG)', 'فري فاير (Free Fire)', 'فورتنايت (Fortnite)',
  'فيفا (FIFA)', 'بيس (PES)', 'كلاش أوف كلانس', 'ماين كرافت', 'روبلوکس', 'لعبة أخرى'
];

const GAME_RELATED_CATEGORIES = ['حسابات ألعاب'];

const JORDAN_LOCATIONS = {
  'عمان': ['وسط البلد','جبل عمان','جبل اللويبدة','الشميساني','عبدون','دابوق','خلدا','أم أذينة','تلاع العلي','صويلح','الجبيهة','الرابية','أم السماق','دير غبار','ماركا','النصر','القويسمة','سحاب','طبربور','الدوار السابع','الدوار الثامن','حي نزال','جبل الحسين','زهران','شفا بدران','بيادر وادي السير','ياجوز','المقابلين','أخرى'],
  'إربد': ['مركز إربد','الرمثا','الحصن','بشرى','كفرسوم','الطرة','النعيمة','حوارة','إربد الجديدة','الشونة الشمالية','أخرى'],
  'الزرقاء': ['مركز الزرقاء','الرصيفة','الهاشمية','الأزرق','الضليل','أخرى'],
  'البلقاء': ['السلط','الفحيص','ماحص','عين الباشا','دير علا','أخرى'],
  'مادبا': ['مادبا المدينة','ذيبان','الفيصلية','أخرى'],
  'الكرك': ['الكرك المدينة','القصر','المزار الجنوبي','عي','الأغوار الجنوبية','أخرى'],
  'الطفيلة': ['الطفيلة المدينة','بصيرا','الحسا','أخرى'],
  'معان': ['معان المدينة','الشوبك','وادي موسى (البترا)','الجفر','أخرى'],
  'العقبة': ['العقبة المدينة','القويرة','الديسة','أخرى'],
  'جرش': ['وسط المدينة','ساكب','كتة','ريمون','برما','سوف','أخرى'],
  'عجلون': ['عجلون المدينة','عنجرة','كفرنجة','صخرة','أخرى'],
  'المفرق': ['المفرق المدينة','الرويشد','الخالدية','البادية الشمالية','أخرى']
};

const UNIVERSITY_RELATED_CATEGORIES = ['كتب دراسية', 'قرطاسية وأدوات مكتبية'];
const DEVELOPER_WHATSAPP = '962771587863';

const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ---------- نموذج الإعلان بقاعدة البيانات ----------
const itemSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: String,
  description: String,
  lookingFor: String,
  whatsapp: String,
  university: { type: String, default: '' },
  category: { type: String, default: 'أخرى' },
  gameType: { type: String, default: '' },
  governorate: { type: String, default: '' },
  area: { type: String, default: '' },
  imageUrls: { type: [String], default: [] },
  createdAt: { type: Number, default: Date.now },
  isSwapped: { type: Boolean, default: false },
  views: { type: Number, default: 0 },
  ownerToken: String
});
const Item = mongoose.model('Item', itemSchema);

const reportSchema = new mongoose.Schema({
  itemId: String,
  itemName: String,
  reason: String,
  reportedAt: { type: Number, default: Date.now }
});
const Report = mongoose.model('Report', reportSchema);

function toPublicItem(item) {
  const obj = item.toObject ? item.toObject() : item;
  const { ownerToken, _id, __v, ...publicItem } = obj;
  return publicItem;
}

async function cleanupExpiredItems() {
  try {
    const now = Date.now();
    const expired = await Item.find({ createdAt: { $lt: now - EXPIRY_MS } });
    if (expired.length > 0) {
      for (const item of expired) {
        for (const imgUrl of item.imageUrls || []) {
          const imgPath = path.join(__dirname, imgUrl);
          if (fs.existsSync(imgPath)) fs.unlink(imgPath, () => {});
        }
      }
      await Item.deleteMany({ createdAt: { $lt: now - EXPIRY_MS } });
      console.log(`🧹 تم حذف ${expired.length} إعلان منتهي الصلاحية`);
    }
  } catch (err) {
    console.error('خطأ أثناء تنظيف الإعلانات المنتهية:', err);
  }
}

const DAILY_POST_LIMIT = 5;
const deviceLimitTracker = new Map();
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

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, 'item-' + Date.now() + '-' + Math.round(Math.random() * 1e9) + ext);
  }
});
function fileFilter(req, file, cb) {
  const allowed = /jpeg|jpg|png|gif|webp/;
  const extOk = allowed.test(path.extname(file.originalname).toLowerCase());
  const mimeOk = allowed.test(file.mimetype);
  if (extOk && mimeOk) cb(null, true);
  else cb(new Error('نوع الملف غير مدعوم. يرجى رفع صور (jpg, png, gif, webp)'));
}
const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

app.get('/api/universities', (req, res) => res.json(JORDAN_UNIVERSITIES));
app.get('/api/categories', (req, res) => res.json(CATEGORIES));
app.get('/api/risky-categories', (req, res) => res.json(RISKY_CATEGORIES));
app.get('/api/game-types', (req, res) => res.json(GAME_TYPES));
app.get('/api/locations', (req, res) => res.json(JORDAN_LOCATIONS));
app.get('/api/developer-contact', (req, res) => res.json({ whatsapp: DEVELOPER_WHATSAPP }));

app.get('/api/stats', async (req, res) => {
  await cleanupExpiredItems();
  const totalItems = await Item.countDocuments();
  res.json({ totalItems });
});

app.post('/api/items/:id/report', async (req, res) => {
  try {
    const { reason } = req.body;
    const item = await Item.findOne({ id: req.params.id });
    if (!item) return res.status(404).json({ error: 'الإعلان غير موجود' });
    await Report.create({ itemId: item.id, itemName: item.name, reason: (reason || 'غير محدد').trim().slice(0, 300) });
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'تعذر إرسال البلاغ' });
  }
});

app.get('/api/items', async (req, res) => {
  try {
    await cleanupExpiredItems();
    const items = await Item.find().sort({ createdAt: -1 });
    res.json(items.map(toPublicItem));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

app.get('/api/items/:id', async (req, res) => {
  try {
    const item = await Item.findOne({ id: req.params.id });
    if (!item) return res.status(404).json({ error: 'الإعلان غير موجود أو تم حذفه' });
    item.views = (item.views || 0) + 1;
    await item.save();
    res.json(toPublicItem(item));
  } catch (err) {
    res.status(500).json({ error: 'خطأ في جلب الإعلان' });
  }
});

app.post('/api/items', upload.array('images', MAX_IMAGES), async (req, res) => {
  try {
    const deviceId = req.headers['x-device-id'];
    if (isRateLimited(deviceId)) {
      return res.status(429).json({ error: `وصلت للحد الأقصى (${DAILY_POST_LIMIT} إعلانات) خلال 24 ساعة. حاول مرة أخرى لاحقاً.` });
    }
    const { name, description, lookingFor, whatsapp, university, category, gameType, governorate, area } = req.body;
    if (!name || !description || !lookingFor || !whatsapp || !category || !governorate || !area) {
      return res.status(400).json({ error: 'يرجى تعبئة جميع الحقول المطلوبة (بما فيها المحافظة والمنطقة)' });
    }
    if (!JORDAN_LOCATIONS[governorate] || !JORDAN_LOCATIONS[governorate].includes(area)) {
      return res.status(400).json({ error: 'المحافظة أو المنطقة المختارة غير صحيحة' });
    }
    if (UNIVERSITY_RELATED_CATEGORIES.includes(category.trim()) && !university) {
      return res.status(400).json({ error: 'يرجى اختيار الجامعة لهذا التصنيف' });
    }
    if (GAME_RELATED_CATEGORIES.includes(category.trim()) && !gameType) {
      return res.status(400).json({ error: 'يرجى اختيار نوع اللعبة' });
    }
    const cleanedWhatsapp = whatsapp.trim().replace(/[^\d+]/g, '');
    const ownerToken = crypto.randomBytes(16).toString('hex');
    const imageUrls = (req.files || []).map(f => '/uploads/' + f.filename);

    const newItem = await Item.create({
      id: Date.now().toString(36) + Math.round(Math.random() * 1e6).toString(36),
      name: name.trim(),
      description: description.trim(),
      lookingFor: lookingFor.trim(),
      whatsapp: cleanedWhatsapp,
      university: university ? university.trim() : '',
      category: category.trim(),
      gameType: gameType ? gameType.trim() : '',
      governorate: governorate.trim(),
      area: area.trim(),
      imageUrls,
      createdAt: Date.now(),
      isSwapped: false,
      views: 0,
      ownerToken
    });

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
    const item = await Item.findOne({ id: req.params.id });
    if (!item) return res.status(404).json({ error: 'الإعلان غير موجود' });
    if (!ownerToken || ownerToken !== item.ownerToken) {
      return res.status(403).json({ error: 'غير مصرح لك بتعديل هذا الإعلان' });
    }
    item.isSwapped = !item.isSwapped;
    await item.save();
    res.json(toPublicItem(item));
  } catch (err) {
    res.status(500).json({ error: 'تعذر تحديث حالة الإعلان' });
  }
});

app.delete('/api/items/:id', async (req, res) => {
  try {
    const { ownerToken } = req.body;
    const item = await Item.findOne({ id: req.params.id });
    if (!item) return res.status(404).json({ error: 'الإعلان غير موجود' });
    if (!ownerToken || ownerToken !== item.ownerToken) {
      return res.status(403).json({ error: 'غير مصرح لك بحذف هذا الإعلان' });
    }
    for (const imgUrl of item.imageUrls || []) {
      const imgPath = path.join(__dirname, imgUrl);
      if (fs.existsSync(imgPath)) fs.unlink(imgPath, () => {});
    }
    await Item.deleteOne({ id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'تعذر حذف الإعلان' });
  }
});

function escapeAttr(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
    const item = await Item.findOne({ id: req.params.id });
    const baseHtml = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf-8');
    if (!item) return res.send(baseHtml);
    const fullUrl = `${req.protocol}://${req.get('host')}/item/${item.id}`;
    const imageUrl = item.imageUrls && item.imageUrls[0] ? `${req.protocol}://${req.get('host')}${item.imageUrls[0]}` : '';
    const html = injectOgTags(baseHtml, {
      title: `${item.name} | متجر الطلاب`,
      description: `متاح للمقايضة بـ: ${item.lookingFor} — ${item.description}`.slice(0, 200),
      image: imageUrl,
      url: fullUrl
    });
    res.send(html);
  } catch (err) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

app.get('/university/:name', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err) {
    return res.status(400).json({ error: err.message });
  }
  next();
});

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

app.listen(PORT, () => {
  console.log(`✅ السيرفر يعمل الآن على المنفذ ${PORT}`);
  cleanupExpiredItems();
  setInterval(cleanupExpiredItems, 12 * 60 * 60 * 1000);
});
