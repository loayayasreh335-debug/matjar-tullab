// routes-auctions.js
// مسارات نظام المزادات (Auctions) + لوحة تحكم المطور
// يُستدعى من server.js بعد الاتصال بقاعدة البيانات بنجاح (داخل .then الخاص بـ connectDB)

module.exports = function registerAuctionRoutes(app, ctx) {
  const {
    db,
    crypto,
    uploadImageToCloudinary,
    deleteImagesFromCloudinary,
    upload,
    ADMIN_PASSWORD
  } = ctx;

  // ---------- إعداد الفهارس ----------
  db.collection('auctions').createIndex({ id: 1 }, { unique: true }).catch(() => {});
  db.collection('auctions').createIndex({ isApproved: 1, endsAt: 1 }).catch(() => {});

  // ---------- ميدلوير حماية مسارات الأدمن ----------
  function requireAdmin(req, res, next) {
    const password = req.headers['x-admin-password'];
    if (!password || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'غير مصرح. يرجى تسجيل الدخول كأدمن.' });
    }
    next();
  }

  // إخفاء الحقول الحساسة قبل إرسال المزاد للواجهة العامة
  function toPublicAuction(a) {
    const { ownerToken, imagePublicId, _id, ...publicAuction } = a;
    return publicAuction;
  }

  // ==================== مسارات عامة (Public) ====================

  // إنشاء مزاد جديد - يبقى "قيد المراجعة" لحد ما المطور يوافق عليه يدوياً بعد استلام الرسوم
  app.post('/api/auctions', upload.single('image'), async (req, res) => {
    try {
      const { title, description, startingPrice, endsAt, whatsapp } = req.body;

      if (!title || !description || !startingPrice || !endsAt || !whatsapp) {
        return res.status(400).json({ error: 'يرجى تعبئة جميع الحقول المطلوبة' });
      }

      const cleanStartingPrice = parseFloat(startingPrice);
      if (isNaN(cleanStartingPrice) || cleanStartingPrice <= 0) {
        return res.status(400).json({ error: 'يرجى إدخال سعر بداية صحيح' });
      }

      const endsAtMs = new Date(endsAt).getTime();
      if (isNaN(endsAtMs) || endsAtMs <= Date.now()) {
        return res.status(400).json({ error: 'يرجى اختيار وقت انتهاء صحيح بالمستقبل' });
      }

      let imageUrl = '';
      let imagePublicId = '';
      if (req.file) {
        const uploaded = await uploadImageToCloudinary(req.file.buffer);
        imageUrl = uploaded.url;
        imagePublicId = uploaded.publicId;
      }

      const ownerToken = crypto.randomBytes(16).toString('hex');

      const newAuction = {
        id: Date.now().toString(36) + Math.round(Math.random() * 1e6).toString(36),
        title: title.trim(),
        description: description.trim(),
        imageUrl,
        imagePublicId,
        startingPrice: cleanStartingPrice,
        currentBid: cleanStartingPrice,
        bidsCount: 0,
        endsAt: endsAtMs,
        whatsapp: whatsapp.trim().replace(/[^\d+]/g, ''),
        status: 'pending', // pending | active | rejected | ended
        isApproved: false,
        createdAt: Date.now(),
        approvedAt: null,
        ownerToken
      };

      await db.collection('auctions').insertOne(newAuction);

      res.status(201).json({ ...toPublicAuction(newAuction), ownerToken });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'حدث خطأ أثناء إنشاء المزاد' });
    }
  });

  // عرض كل المزادات المعتمدة فقط (المنشورة للعامة)
  app.get('/api/auctions', async (req, res) => {
    try {
      const auctions = await db.collection('auctions')
        .find({ isApproved: true })
        .sort({ endsAt: 1 })
        .toArray();
      res.json(auctions.map(toPublicAuction));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'تعذر جلب المزادات' });
    }
  });

  // عرض مزاد واحد معتمد بالتفصيل
  app.get('/api/auctions/:id', async (req, res) => {
    try {
      const auction = await db.collection('auctions').findOne({ id: req.params.id, isApproved: true });
      if (!auction) return res.status(404).json({ error: 'المزاد غير موجود أو لسا قيد المراجعة' });
      res.json(toPublicAuction(auction));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'تعذر جلب المزاد' });
    }
  });

  // تقديم مزايدة جديدة على مزاد معتمد ونشط
  app.post('/api/auctions/:id/bid', async (req, res) => {
    try {
      const bidAmount = parseFloat(req.body.amount);

      const auction = await db.collection('auctions').findOne({ id: req.params.id });
      if (!auction || !auction.isApproved) {
        return res.status(404).json({ error: 'المزاد غير موجود أو غير معتمد' });
      }
      if (auction.endsAt <= Date.now()) {
        return res.status(400).json({ error: 'المزاد انتهى، لا يمكن المزايدة عليه' });
      }
      if (isNaN(bidAmount) || bidAmount <= auction.currentBid) {
        return res.status(400).json({ error: `يجب أن تكون المزايدة أعلى من السعر الحالي (${auction.currentBid})` });
      }

      await db.collection('auctions').updateOne(
        { id: req.params.id },
        { $set: { currentBid: bidAmount }, $inc: { bidsCount: 1 } }
      );

      const updated = await db.collection('auctions').findOne({ id: req.params.id });
      res.json(toPublicAuction(updated));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'تعذر تسجيل المزايدة' });
    }
  });

  // ==================== مسارات المطور/الأدمن (Admin) ====================

  // تسجيل دخول الأدمن (كلمة سر واحدة بسيطة، بدون حسابات - متوافق مع فلسفة المشروع)
  app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (password && password === ADMIN_PASSWORD) {
      return res.json({ success: true });
    }
    res.status(401).json({ success: false, error: 'كلمة السر غير صحيحة' });
  });

  // عرض المزادات لمراجعتها (افتراضياً: المعلقة فقط، أو ?status=active/rejected/ended للفلترة)
  app.get('/api/admin/auctions', requireAdmin, async (req, res) => {
    try {
      const status = req.query.status;
      const filter = status ? { status } : {};
      const auctions = await db.collection('auctions').find(filter).sort({ createdAt: -1 }).toArray();
      res.json(auctions); // للأدمن فقط - يشمل كل الحقول
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'تعذر جلب المزادات' });
    }
  });

  // قبول وتفعيل المزاد (بعد التأكد اليدوي من استلام رسوم الـ 50 دينار)
  app.patch('/api/admin/auctions/:id/approve', requireAdmin, async (req, res) => {
    try {
      const result = await db.collection('auctions').findOneAndUpdate(
        { id: req.params.id },
        { $set: { isApproved: true, status: 'active', approvedAt: Date.now() } },
        { returnDocument: 'after' }
      );
      const updated = result && result.value ? result.value : result;
      if (!updated) return res.status(404).json({ error: 'المزاد غير موجود' });
      res.json(updated);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'تعذر تفعيل المزاد' });
    }
  });

  // رفض مزاد (يبقى بالسجل للمراجعة لكن لا يظهر للعامة)
  app.patch('/api/admin/auctions/:id/reject', requireAdmin, async (req, res) => {
    try {
      const result = await db.collection('auctions').findOneAndUpdate(
        { id: req.params.id },
        { $set: { isApproved: false, status: 'rejected' } },
        { returnDocument: 'after' }
      );
      const updated = result && result.value ? result.value : result;
      if (!updated) return res.status(404).json({ error: 'المزاد غير موجود' });
      res.json(updated);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'تعذر رفض المزاد' });
    }
  });

  // حذف مزاد نهائياً (مع صورته من Cloudinary لو موجودة)
  app.delete('/api/admin/auctions/:id', requireAdmin, async (req, res) => {
    try {
      const auction = await db.collection('auctions').findOne({ id: req.params.id });
      if (!auction) return res.status(404).json({ error: 'المزاد غير موجود' });

      if (auction.imagePublicId) {
        await deleteImagesFromCloudinary([auction.imagePublicId]);
      }
      await db.collection('auctions').deleteOne({ id: req.params.id });
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'تعذر حذف المزاد' });
    }
  });

  console.log('✅ تم تفعيل مسارات نظام المزادات ولوحة تحكم المطور');
};
