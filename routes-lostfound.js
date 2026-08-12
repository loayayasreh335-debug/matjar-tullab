// routes-lostfound.js
// قسم "المفقودات والموجودات بالمملكة" - ملف مستقل تماماً عن باقي منطق التطبيق
// لا يلمس items.js الأصلي أو المزاد أو الوساطة أو الأدمن

const MAX_LF_IMAGES = 4;

const LOSTFOUND_CATEGORIES = [
  'بطاقات ووثائق رسمية',
  'أجهزة وموبايلات',
  'مفاتيح وحقائب',
  'أغراض شخصية',
  'أخرى'
];

const LF_TYPES = ['lost', 'found']; // ضاع مني / وجدت إشي
const LF_DAILY_POST_LIMIT = 5;
const LF_MAX_CLAIM_ATTEMPTS = 5; // كحد أقصى لمحاولات إجابة سؤال التحقق كل ساعة

module.exports = function registerLostFoundRoutes(app, deps) {
  const {
    db,
    crypto,
    uploadImageToCloudinary,
    deleteImagesFromCloudinary,
    upload,
    requireAdminToken,
    JORDAN_LOCATIONS
  } = deps;

  // فهارس Mongo الخاصة بهذا القسم (لا تؤثر على أي Collection ثانية)
  db.collection('lostfound').createIndex({ id: 1 }, { unique: true }).catch(console.error);
  db.collection('lostfound').createIndex({ createdAt: -1 }).catch(console.error);

  // ---------- تتبّع حد النشر اليومي (منفصل تماماً عن حد الإعلانات العادية) ----------
  const lfDeviceLimitTracker = new Map();
  function isLfRateLimited(deviceId) {
    if (!deviceId) return false;
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const timestamps = (lfDeviceLimitTracker.get(deviceId) || []).filter(t => t > oneDayAgo);
    lfDeviceLimitTracker.set(deviceId, timestamps);
    return timestamps.length >= LF_DAILY_POST_LIMIT;
  }
  function recordLfPost(deviceId) {
    if (!deviceId) return;
    const timestamps = lfDeviceLimitTracker.get(deviceId) || [];
    timestamps.push(Date.now());
    lfDeviceLimitTracker.set(deviceId, timestamps);
  }

  // ---------- تتبّع محاولات سؤال التحقق (منع التخمين العشوائي) ----------
  const claimAttemptsTracker = new Map(); // key: itemId_deviceId -> [timestamps]
  function isClaimRateLimited(itemId, deviceId) {
    const key = `${itemId}_${deviceId || 'anon'}`;
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const timestamps = (claimAttemptsTracker.get(key) || []).filter(t => t > oneHourAgo);
    claimAttemptsTracker.set(key, timestamps);
    return timestamps.length >= LF_MAX_CLAIM_ATTEMPTS;
  }
  function recordClaimAttempt(itemId, deviceId) {
    const key = `${itemId}_${deviceId || 'anon'}`;
    const timestamps = claimAttemptsTracker.get(key) || [];
    timestamps.push(Date.now());
    claimAttemptsTracker.set(key, timestamps);
  }

  // ---------- تجهيز العنصر للعرض العام (إخفاء الحقول الحساسة) ----------
  function toPublicLostFound(item) {
    const { ownerToken, imagePublicIds, verificationAnswer, _id, whatsapp, ...rest } = item;
    const publicItem = { ...rest };
    publicItem.requiresVerification = item.type === 'found' && !item.isResolved;

    // إعلانات "ضاع مني" يظهر فيها رقم التواصل مباشرة (صاحبها هو من يحتاج يوصل له الناس)
    // إعلانات "وجدت إشي" لا يظهر فيها رقم التواصل إلا بعد اجتياز سؤال التحقق
    if (item.type === 'lost') {
      publicItem.whatsapp = whatsapp;
    }
    return publicItem;
  }

  // ---------- المسارات (Routes) ----------

  app.get('/api/lostfound/categories', (req, res) => res.json(LOSTFOUND_CATEGORIES));

  app.get('/api/lostfound/stats', async (req, res) => {
    try {
      const totalResolved = await db.collection('lostfound').countDocuments({ isResolved: true });
      const totalActive = await db.collection('lostfound').countDocuments({ isResolved: false });
      res.json({ totalResolved, totalActive });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'تعذر جلب الإحصائيات' });
    }
  });

  app.get('/api/lostfound', async (req, res) => {
    try {
      const { governorate, category, type } = req.query;
      const query = {};
      if (governorate) query.governorate = governorate;
      if (category) query.category = category;
      if (type && LF_TYPES.includes(type)) query.type = type;

      const items = await db.collection('lostfound').find(query).sort({ createdAt: -1 }).toArray();
      res.json(items.map(toPublicLostFound));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'تعذر جلب منشورات المفقودات' });
    }
  });

  app.get('/api/lostfound/:id', async (req, res) => {
    try {
      const item = await db.collection('lostfound').findOne({ id: req.params.id });
      if (!item) return res.status(404).json({ error: 'المنشور غير موجود أو تم حذفه' });
      res.json(toPublicLostFound(item));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'تعذر جلب المنشور' });
    }
  });

  app.post('/api/lostfound', upload.array('images', MAX_LF_IMAGES), async (req, res) => {
    try {
      const deviceId = req.headers['x-device-id'];
      if (isLfRateLimited(deviceId)) {
        return res.status(429).json({ error: `وصلت للحد الأقصى (${LF_DAILY_POST_LIMIT} منشورات) خلال 24 ساعة. حاول مرة أخرى لاحقاً.` });
      }

      const { type, name, description, category, governorate, area, whatsapp, verificationAnswer } = req.body;

      if (!LF_TYPES.includes(type)) {
        return res.status(400).json({ error: 'يرجى تحديد الحالة: ضاع مني أو وجدت إشي' });
      }
      if (!name || !description || !category || !governorate || !area || !whatsapp) {
        return res.status(400).json({ error: 'يرجى تعبئة جميع الحقول المطلوبة' });
      }
      if (!LOSTFOUND_CATEGORIES.includes(category.trim())) {
        return res.status(400).json({ error: 'التصنيف المختار غير صحيح' });
      }
      if (!JORDAN_LOCATIONS[governorate] || !JORDAN_LOCATIONS[governorate].includes(area)) {
        return res.status(400).json({ error: 'المحافظة أو المنطقة المختارة غير صحيحة' });
      }

      const uploaded = await Promise.all(
        (req.files || []).map(f => uploadImageToCloudinary(f.buffer))
      );

      const cleanedWhatsapp = whatsapp.trim().replace(/[^\d+]/g, '');
      const ownerToken = crypto.randomBytes(16).toString('hex');

      const newItem = {
        id: 'lf_' + Date.now().toString(36) + Math.round(Math.random() * 1e6).toString(36),
        type,
        name: name.trim(),
        description: description.trim(),
        category: category.trim(),
        governorate: governorate.trim(),
        area: area.trim(),
        whatsapp: cleanedWhatsapp,
        imageUrls: uploaded.map(u => u.url),
        imagePublicIds: uploaded.map(u => u.publicId),
        createdAt: Date.now(),
        isResolved: false,
        ownerToken
      };

      await db.collection('lostfound').insertOne(newItem);
      recordLfPost(deviceId);

      res.status(201).json({ ...toPublicLostFound(newItem), ownerToken });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'حدث خطأ أثناء نشر المنشور' });
    }
  });


  // تعليم منشور كـ "تم الإرجاع لأصحابه"
  app.patch('/api/lostfound/:id/resolve', async (req, res) => {
    try {
      const { ownerToken } = req.body;
      const item = await db.collection('lostfound').findOne({ id: req.params.id });
      if (!item) return res.status(404).json({ error: 'المنشور غير موجود' });
      if (!ownerToken || ownerToken !== item.ownerToken) {
        return res.status(403).json({ error: 'غير مصرح لك بتعديل هذا المنشور' });
      }

      await db.collection('lostfound').updateOne(
        { id: req.params.id },
        { $set: { isResolved: !item.isResolved } }
      );
      const updated = await db.collection('lostfound').findOne({ id: req.params.id });
      res.json(toPublicLostFound(updated));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'تعذر تحديث حالة المنشور' });
    }
  });

  app.delete('/api/lostfound/:id', async (req, res) => {
    try {
      const { ownerToken } = req.body;
      const item = await db.collection('lostfound').findOne({ id: req.params.id });
      if (!item) return res.status(404).json({ error: 'المنشور غير موجود' });
      if (!ownerToken || ownerToken !== item.ownerToken) {
        return res.status(403).json({ error: 'غير مصرح لك بحذف هذا المنشور' });
      }

      await deleteImagesFromCloudinary(item.imagePublicIds);
      await db.collection('lostfound').deleteOne({ id: req.params.id });
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'تعذر حذف المنشور' });
    }
  });

  // حذف من لوحة تحكم الأدمن
  app.delete('/api/admin/lostfound/:id', requireAdminToken, async (req, res) => {
    try {
      const item = await db.collection('lostfound').findOne({ id: req.params.id });
      if (!item) return res.status(404).json({ error: 'المنشور غير موجود' });

      await deleteImagesFromCloudinary(item.imagePublicIds);
      await db.collection('lostfound').deleteOne({ id: req.params.id });
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'تعذر حذف المنشور' });
    }
  });
};
