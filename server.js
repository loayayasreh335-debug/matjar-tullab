// server.js
// سيرفر تطبيق "متجر الطلاب" - سوق مقايضة لطلاب الجامعات
// يستخدم Express + Multer، والتخزين يكون في ملف JSON محلي (بدون حاجة لأي بناء مكتبات native)

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// مدة صلاحية الإعلان قبل حذفه تلقائياً (بالمللي ثانية) = 30 يوماً
const EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_IMAGES = 4;

// قائمة الجامعات الأردنية المتاحة للاختيار
const JORDAN_UNIVERSITIES = [
  'الجامعة الأردنية',
  'جامعة اليرموك',
  'جامعة العلوم والتكنولوجيا الأردنية',
  'جامعة البلقاء التطبيقية - السلط',
  'الجامعة الأردنية الألمانية',
  'الجامعة الهاشمية',
  'جامعة مؤتة',
  'جامعة آل البيت',
  'جامعة الحسين بن طلال',
  'جامعة الطفيلة التقنية',
  'الجامعة الأمريكية بمادبا',
  'جامعة فيلادلفيا',
  'جامعة الزيتونة الأردنية',
  'جامعة عمان الأهلية',
  'جامعة البترا',
  'جامعة الإسراء',
  'جامعة الشرق الأوسط',
  'جامعة عمان العربية',
  'جامعة جدارا',
  'جامعة أخرى'
];

// قائمة تصنيفات الأغراض
const CATEGORIES = [
  'كتب دراسية',
  'قرطاسية وأدوات مكتبية',
  'إلكترونيات',
  'أثاث ومستلزمات سكن',
  'ملابس وأزياء',
  'حسابات ألعاب',
  'أخرى'
];

// التصنيفات التي تحتاج تنبيه أمان خاص عند النشر (مثل حسابات الألعاب - خطر نصب أعلى)
const RISKY_CATEGORIES = ['حسابات ألعاب'];

// أنواع الألعاب المتاحة لتصنيف حسابات الألعاب
const GAME_TYPES = [
  'ببجي موبايل (PUBG)',
  'فري فاير (Free Fire)',
  'فورتنايت (Fortnite)',
  'فيفا (FIFA)',
  'بيس (PES)',
  'كلاش أوف كلانس',
  'ماين كرافت',
  'روبلوکس',
  'لعبة أخرى'
];

// التصنيفات التي يكون فيها حقل "نوع اللعبة" إجبارياً
const GAME_RELATED_CATEGORIES = ['حسابات ألعاب'];

// محافظات الأردن ومناطقها الفرعية (قابلة للتوسيع لاحقاً)
const JORDAN_LOCATIONS = {
  'عمان': [
    'وسط البلد', 'جبل عمان', 'جبل اللويبدة', 'الشميساني', 'عبدون', 'دابوق',
    'خلدا', 'أم أذينة', 'تلاع العلي', 'صويلح', 'الجبيهة', 'الرابية',
    'أم السماق', 'دير غبار', 'ماركا', 'النصر', 'القويسمة', 'سحاب',
    'طبربور', 'الدوار السابع', 'الدوار الثامن', 'حي نزال', 'جبل الحسين',
    'زهران', 'شفا بدران', 'بيادر وادي السير', 'ياجوز', 'المقابلين', 'أخرى'
  ],
  'إربد': [
    'مركز إربد', 'الرمثا', 'الحصن', 'بشرى', 'كفرسوم', 'الطرة', 'النعيمة',
    'حوارة', 'إربد الجديدة', 'الشونة الشمالية', 'أخرى'
  ],
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

// التصنيفات التي يكون فيها حقل الجامعة إجبارياً (لأنها مرتبطة بالمواد الدراسية)
const UNIVERSITY_RELATED_CATEGORIES = ['كتب دراسية', 'قرطاسية وأدوات مكتبية'];

// رقم واتساب صاحب المنصة للتواصل بخصوص مشاكل أو اقتراحات
const DEVELOPER_WHATSAPP = '962771587863';
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'items.json');
const REPORTS_FILE = path.join(DATA_DIR, 'reports.json');

// إنشاء المجلدات إن لم تكن موجودة
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf-8');
if (!fs.existsSync(REPORTS_FILE)) fs.writeFileSync(REPORTS_FILE, '[]', 'utf-8');

// ---------- دوال مساعدة لقراءة/كتابة قاعدة البيانات (JSON) ----------

// توحيد شكل الإعلان (يدعم الإعلانات القديمة المنشورة قبل هذا التحديث)
function normalizeItem(item) {
  if (!item.imageUrls) {
    item.imageUrls = item.imageUrl ? [item.imageUrl] : [];
  }
  if (!item.category) item.category = 'أخرى';
  if (!item.gameType) item.gameType = '';
  if (!item.governorate) item.governorate = '';
  if (!item.area) item.area = '';
  if (typeof item.views !== 'number') item.views = 0;
  if (typeof item.isSwapped !== 'boolean') item.isSwapped = false;
  return item;
}

function readItems() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    const items = JSON.parse(raw || '[]');
    return items.map(normalizeItem);
  } catch (err) {
    console.error('خطأ في قراءة ملف البيانات:', err);
    return [];
  }
}

function writeItems(items) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2), 'utf-8');
}

// حذف الإعلانات التي مضى على نشرها أكثر من 30 يوماً (مع صورها)، وإرجاع القائمة المتبقية
function cleanupExpiredItems() {
  const items = readItems();
  const now = Date.now();

  const remaining = [];
  const expired = [];

  for (const item of items) {
    if (now - item.createdAt > EXPIRY_MS) {
      expired.push(item);
    } else {
      remaining.push(item);
    }
  }

  if (expired.length > 0) {
    for (const item of expired) {
      for (const imgUrl of item.imageUrls || []) {
        const imgPath = path.join(__dirname, imgUrl);
        if (fs.existsSync(imgPath)) fs.unlink(imgPath, () => {});
      }
    }
    writeItems(remaining);
    console.log(`🧹 تم حذف ${expired.length} إعلان منتهي الصلاحية (أقدم من 30 يوماً)`);
  }

  return remaining;
}

// إخفاء الحقول الحساسة (ownerToken) قبل إرسال الإعلان للعميل
function toPublicItem(item) {
  const { ownerToken, ...publicItem } = item;
  return publicItem;
}

// حد أقصى لعدد الإعلانات المسموح نشرها من نفس الجهاز خلال 24 ساعة (حماية بسيطة من السبام)
const DAILY_POST_LIMIT = 5;
const deviceLimitTracker = new Map(); // deviceId => [timestamps]

function isRateLimited(deviceId) {
  if (!deviceId) return false; // لا نمنع النشر لو المتصفح لا يدعم توليد معرف الجهاز
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
    cb(new Error('نوع الملف غير مدعوم. يرجى رفع صور (jpg, png, gif, webp)'));
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5 ميجابايت لكل صورة
});

// ---------- الميدلوير العام ----------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// تقديم الملفات الثابتة (الواجهة الأمامية)
app.use(express.static(path.join(__dirname, 'public')));
// تقديم الصور المرفوعة
app.use('/uploads', express.static(UPLOADS_DIR));

// ---------- المسارات (API Routes) ----------

app.get('/api/universities', (req, res) => {
  res.json(JORDAN_UNIVERSITIES);
});

app.get('/api/categories', (req, res) => {
  res.json(CATEGORIES);
});

app.get('/api/risky-categories', (req, res) => {
  res.json(RISKY_CATEGORIES);
});

app.get('/api/game-types', (req, res) => {
  res.json(GAME_TYPES);
});

app.get('/api/locations', (req, res) => {
  res.json(JORDAN_LOCATIONS);
});

// معلومات التواصل مع صاحب المنصة
app.get('/api/developer-contact', (req, res) => {
  res.json({ whatsapp: DEVELOPER_WHATSAPP });
});

// إحصائية بسيطة: إجمالي عدد الإعلانات المنشورة حالياً
app.get('/api/stats', (req, res) => {
  const items = cleanupExpiredItems();
  res.json({ totalItems: items.length });
});

// إرسال بلاغ عن إعلان (سوء استخدام / محتوى مخالف / إعلان وهمي)
app.post('/api/items/:id/report', (req, res) => {
  const { reason } = req.body;
  const items = readItems();
  const item = items.find(i => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'الإعلان غير موجود' });

  let reports = [];
  try {
    reports = JSON.parse(fs.readFileSync(REPORTS_FILE, 'utf-8') || '[]');
  } catch {
    reports = [];
  }

  reports.push({
    itemId: item.id,
    itemName: item.name,
    reason: (reason || 'غير محدد').trim().slice(0, 300),
    reportedAt: Date.now()
  });

  fs.writeFileSync(REPORTS_FILE, JSON.stringify(reports, null, 2), 'utf-8');
  res.status(201).json({ success: true });
});

// جلب كل الإعلانات (الأحدث أولاً) - مع تنظيف الإعلانات المنتهية أولاً
app.get('/api/items', (req, res) => {
  const items = cleanupExpiredItems();
  items.sort((a, b) => b.createdAt - a.createdAt);
  res.json(items.map(toPublicItem));
});

// جلب إعلان واحد بالتفصيل (تُستخدم لصفحة الغرض المستقلة وزر المشاركة) + زيادة عداد المشاهدات
app.get('/api/items/:id', (req, res) => {
  const items = readItems();
  const item = items.find(i => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'الإعلان غير موجود أو تم حذفه' });

  item.views = (item.views || 0) + 1;
  writeItems(items);

  res.json(toPublicItem(item));
});

// إضافة إعلان جديد (يدعم حتى 4 صور)
app.post('/api/items', upload.array('images', MAX_IMAGES), (req, res) => {
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

    const isUniversityRequired = UNIVERSITY_RELATED_CATEGORIES.includes(category.trim());
    if (isUniversityRequired && !university) {
      return res.status(400).json({ error: 'يرجى اختيار الجامعة لهذا التصنيف' });
    }

    const isGameTypeRequired = GAME_RELATED_CATEGORIES.includes(category.trim());
    if (isGameTypeRequired && !gameType) {
      return res.status(400).json({ error: 'يرجى اختيار نوع اللعبة' });
    }

    const cleanedWhatsapp = whatsapp.trim().replace(/[^\d+]/g, '');
    const ownerToken = crypto.randomBytes(16).toString('hex');
    const imageUrls = (req.files || []).map(f => '/uploads/' + f.filename);

    const newItem = {
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
    };

    const items = readItems();
    items.push(newItem);
    writeItems(items);

    recordPost(deviceId);

    res.status(201).json({ ...toPublicItem(newItem), ownerToken });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'حدث خطأ أثناء إضافة الإعلان' });
  }
});

// تبديل حالة "تمت المقايضة"
app.patch('/api/items/:id/swap', (req, res) => {
  const { ownerToken } = req.body;
  const items = readItems();
  const item = items.find(i => i.id === req.params.id);

  if (!item) return res.status(404).json({ error: 'الإعلان غير موجود' });
  if (!ownerToken || ownerToken !== item.ownerToken) {
    return res.status(403).json({ error: 'غير مصرح لك بتعديل هذا الإعلان' });
  }

  item.isSwapped = !item.isSwapped;
  writeItems(items);
  res.json(toPublicItem(item));
});

// حذف إعلان
app.delete('/api/items/:id', (req, res) => {
  const { ownerToken } = req.body;
  const items = readItems();
  const item = items.find(i => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'الإعلان غير موجود' });

  if (!ownerToken || ownerToken !== item.ownerToken) {
    return res.status(403).json({ error: 'غير مصرح لك بحذف هذا الإعلان' });
  }

  for (const imgUrl of item.imageUrls || []) {
    const imgPath = path.join(__dirname, imgUrl);
    if (fs.existsSync(imgPath)) fs.unlink(imgPath, () => {});
  }

  const filtered = items.filter(i => i.id !== req.params.id);
  writeItems(filtered);
  res.json({ success: true });
});

// تهريب النصوص قبل إدراجها داخل خصائص HTML لتفادي كسر الصفحة
function escapeAttr(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// إدراج وسوم Open Graph مخصصة داخل ملف index.html قبل إرساله (لمعاينة صحيحة عند مشاركة الرابط)
function injectOgTags(html, { title, description, image, url }) {
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeAttr(title)}</title>`);
  html = html.replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${escapeAttr(title)}">`);
  html = html.replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${escapeAttr(description)}">`);
  html = html.replace(/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${escapeAttr(image)}">`);
  html = html.replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${escapeAttr(url)}">`);
  return html;
}

// صفحة تفاصيل غرض مستقلة (رابط قابل للمشاركة) مع معاينة صحيحة (صورة + اسم الغرض) عند اللصق بواتساب
app.get('/item/:id', (req, res) => {
  const items = readItems();
  const item = items.find(i => i.id === req.params.id);
  const baseHtml = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf-8');

  if (!item) return res.send(baseHtml);

  const fullUrl = `${req.protocol}://${req.get('host')}/item/${item.id}`;
  const imageUrl = item.imageUrls && item.imageUrls[0]
    ? `${req.protocol}://${req.get('host')}${item.imageUrls[0]}`
    : '';

  const html = injectOgTags(baseHtml, {
    title: `${item.name} | متجر الطلاب`,
    description: `متاح للمقايضة بـ: ${item.lookingFor} — ${item.description}`.slice(0, 200),
    image: imageUrl,
    url: fullUrl
  });

  res.send(html);
});

// صفحة إعلانات جامعة محددة (رابط قابل للمشاركة داخل مجموعات جامعة معينة)
app.get('/university/:name', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// معالجة أخطاء Multer (مثل حجم الملف الكبير أو عدد الصور)
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err) {
    return res.status(400).json({ error: err.message });
  }
  next();
});

// صفحة 404 مخصصة لأي رابط غير موجود (يجب أن تكون آخر شيء يُسجَّل)
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

// ---------- تشغيل السيرفر ----------
app.listen(PORT, () => {
  console.log(`✅ السيرفر يعمل الآن على: http://localhost:${PORT}`);

  cleanupExpiredItems();
  setInterval(cleanupExpiredItems, 12 * 60 * 60 * 1000);
});
