// routes-store.js
// نظام المتاجر الرسمية - بنفس نمط routes-auth.js، يعتمد على requireUserAuth
// الموجود مسبقاً (app.locals.requireUserAuth) وعلى نفس نظام الجلسات (x-user-token)

const { ObjectId } = require('mongodb');

module.exports = function registerStoreRoutes(app, deps) {
  const { db } = deps;
  const requireUserAuth = app.locals.requireUserAuth;
  const getUidFromToken = app.locals.getUidFromToken;

  db.collection('stores').createIndex({ slug: 1 }, { unique: true }).catch(console.error);
  db.collection('stores').createIndex({ ownerUid: 1 }).catch(console.error);
  db.collection('store_products').createIndex({ storeId: 1, isPublished: 1, createdAt: -1 }).catch(console.error);
  db.collection('store_products').createIndex({ title: 'text', description: 'text' }).catch(console.error);

  // ---------- الاشتراك الشهري (15 د.أ افتراضياً) ----------
  //
  // القاعدة: subscriptionStatus='suspended' يعتبر حظر يدوي من الإدارة ويتجاوز
  // تاريخ الانتهاء (حتى لو الاشتراك مو منتهي). غير هيك، المرجع الحقيقي هو
  // تاريخ subscriptionExpiresAt نفسه — مش حقل الحالة المخزّن، عشان ما نحتاج
  // مهمة مجدولة (cron) تحدّث آلاف المتاجر كل يوم؛ نحسبها لحظة الطلب.

  const DAY_MS = 24 * 60 * 60 * 1000;
  const DEFAULT_TRIAL_DAYS = 30;
  const DEFAULT_MONTHLY_FEE = 15;

  function computeSubscriptionState(store) {
    const now = Date.now();
    if (store.subscriptionStatus === 'suspended') {
      return { effectiveStatus: 'suspended', isActive: false, daysRemaining: 0 };
    }
    const expiresAt = store.subscriptionExpiresAt || 0;
    const isActive = expiresAt > now;
    const daysRemaining = isActive ? Math.ceil((expiresAt - now) / DAY_MS) : 0;
    return {
      effectiveStatus: isActive ? (store.subscriptionStatus || 'active') : 'expired',
      isActive,
      daysRemaining,
    };
  }

  // يُستخدم فقط على العمليات اللي "بتولّد قيمة جديدة" (نشر منتج جديد) —
  // مش على تعديل/حذف منتجات موجودة أصلاً، حتى ما يخسر صاحب المحل بياناته
  // القديمة لمجرد تأخر بالدفع يوم أو يومين.
  function requireActiveSubscription(req, res, next) {
    if (req.store.approvalStatus !== 'approved') {
      return res.status(403).json({
        error:
          req.store.approvalStatus === 'rejected'
            ? 'تم رفض طلب تسجيل هذا المحل من إدارة سوقنا'
            : 'محلك لسا بانتظار موافقة إدارة سوقنا، رح تقدر تنشر بعد الموافقة',
        approvalStatus: req.store.approvalStatus,
      });
    }
    const state = computeSubscriptionState(req.store);
    if (!state.isActive) {
      const reason =
        state.effectiveStatus === 'suspended'
          ? 'حسابكم موقوف مؤقتاً من إدارة سوقنا، تواصلوا معنا للتفاصيل'
          : 'انتهى اشتراك المتجر الشهري، جدّدوه عشان تقدروا تنشروا منتجات جديدة';
      return res.status(402).json({ error: reason, subscriptionStatus: state.effectiveStatus });
    }
    next();
  }

  // ---------- صلاحيات المتجر ----------

  function resolveStoreRole(store, uid) {
    if (!uid) return 'none';
    if (store.ownerUid === uid) return 'owner';
    const admin = (store.admins || []).find((a) => a.uid === uid && a.isActive);
    if (admin && admin.role === 'manager') return 'manager';
    return 'none';
  }

  async function loadStoreOr404(req, res) {
    const store = await db.collection('stores').findOne({
      slug: req.params.slug,
      isActive: { $ne: false },
    });
    if (!store) {
      res.status(404).json({ error: 'المتجر غير موجود' });
      return null;
    }
    return store;
  }

  // مالك أو مشرف نشط — يُستخدم على نشر/تعديل/حذف المنتجات
  async function requireStoreManager(req, res, next) {
    const store = await loadStoreOr404(req, res);
    if (!store) return;
    const role = resolveStoreRole(store, req.user.uid);
    if (role === 'none') {
      return res.status(403).json({ error: 'لا تملك صلاحية إدارة هذا المتجر' });
    }
    req.store = store;
    req.storeRole = role;
    next();
  }

  // المالك فقط — لبيانات الاتصال، السياسات، إدارة المشرفين
  async function requireStoreOwner(req, res, next) {
    const store = await loadStoreOr404(req, res);
    if (!store) return;
    if (store.ownerUid !== req.user.uid) {
      return res.status(403).json({ error: 'هذا الإجراء متاح لمالك المتجر فقط' });
    }
    req.store = store;
    req.storeRole = 'owner';
    next();
  }

  // يتأكد أن المنتج فعلاً يتبع للمتجر المطلوب (يمنع تعديل منتج متجر آخر
  // عبر تمرير productId يدوياً حتى لو كان المستخدم مالك/مشرف بمتجر مختلف)
  async function requireProductBelongsToStore(req, res, next) {
    try {
      const product = await db
        .collection('store_products')
        .findOne({ _id: new ObjectId(req.params.productId) });
      if (!product) return res.status(404).json({ error: 'المنتج غير موجود' });
      if (String(product.storeId) !== String(req.store._id)) {
        return res.status(403).json({ error: 'هذا المنتج لا يتبع لهذا المتجر' });
      }
      req.product = product;
      next();
    } catch (err) {
      res.status(400).json({ error: 'معرّف منتج غير صالح' });
    }
  }

  // فقط فريق سوقنا — عدّل هالشرط حسب طريقتكم بتحديد الأدمن
  // (مثلاً: قائمة uid ثابتة بمتغير بيئة، أو حقل isSuperAdmin بمستند اليوزر)
  function requirePlatformSuperAdmin(req, res, next) {
    if (!req.user.isSuperAdmin) {
      return res.status(403).json({ error: 'هذا الإجراء متاح لإدارة منصة سوقنا فقط' });
    }
    next();
  }

  // ---------- محلاتي (لصفحة صاحب المحل) ----------
  // يرجع كل المحلات يلي المستخدم الحالي مالكها أو مشرف فيها — تُستخدم
  // بصفحة "متجري" عشان صاحب المحل يلاقي محله بعد ما يسجل دخول مباشرة،
  // بدون ما يحتاج يعرف الـ slug أو يدور عنه
  app.get('/api/stores/mine', requireUserAuth, async (req, res) => {
    try {
      const uid = req.user.uid;
      const stores = await db
        .collection('stores')
        .find({ $or: [{ ownerUid: uid }, { 'admins.uid': uid }] })
        .sort({ createdAt: -1 })
        .toArray();

      res.json({
        stores: stores.map((s) => ({
          slug: s.slug,
          name: s.name,
          logoUrl: s.logoUrl,
          category: s.category,
          isVerified: s.isVerified,
          role: s.ownerUid === uid ? 'owner' : 'manager',
          approvalStatus: s.approvalStatus,
          approvalReason: s.approvalReason,
          ...computeSubscriptionState(s),
        })),
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'تعذر جلب محلاتك' });
    }
  });

  // ---------- إنشاء متجر ----------
  app.post('/api/stores', requireUserAuth, async (req, res) => {
    try {
      const { name, slug, description, logoUrl, coverImageUrl, category } = req.body;
      if (!name || !slug) return res.status(400).json({ error: 'الاسم والمعرّف مطلوبان' });

      const exists = await db.collection('stores').findOne({ slug });
      if (exists) return res.status(409).json({ error: 'هذا المعرّف مستخدم بالفعل، اختر غيره' });

      const store = {
        name,
        slug,
        description: description || '',
        logoUrl: logoUrl || '',
        coverImageUrl: coverImageUrl || '',
        category: category || '',
        ownerUid: req.user.uid, // ← الملكية دائماً من الجلسة المصادَق عليها، مش من body
        admins: [],
        isVerified: false,
        verifiedAt: null,
        verifiedByUid: null,
        contact: { whatsapp: '', phone: '', address: '', location: null },
        policies: { warrantyText: '', returnPolicyText: '', warrantyPeriodDays: null },
        isActive: true,
        // ---------- الموافقة الإدارية ----------
        // كل محل جديد يبلش "بانتظار المراجعة" — ما يظهر بدليل المتاجر ولا
        // بالبحث العام إلا بعد ما توافق عليه إدارة سوقنا يدوياً. صاحب المحل
        // نفسه بيقدر يشوف محله بحالة "قيد المراجعة" من صفحة "متجري"
        approvalStatus: 'pending', // pending | approved | rejected
        approvalReason: '',
        // ---------- الاشتراك الشهري ----------
        // كل متجر جديد يبلش بفترة تجريبية مجانية شهر واحد، وبعدها لازم
        // يدفع 15 د.أ شهرياً عشان يقدر ينشر منتجات جديدة (يفعّلها فريق سوقنا يدوياً)
        subscriptionStatus: 'trial',
        subscriptionExpiresAt: Date.now() + DEFAULT_TRIAL_DAYS * DAY_MS,
        monthlyFee: DEFAULT_MONTHLY_FEE,
        lastPaymentAt: null,
        paymentHistory: [],
        // ---------- الظهور المميز بالصفحة الرئيسية ----------
        // isFeatured: يظهر بشريط الدوائر أعلى الصفحة الرئيسية (بحد أقصى 3 محلات
        // بنفس الوقت) — رسوم إضافية منفصلة عن الاشتراك الشهري العادي، تُفعّل يدوياً
        isFeatured: false,
        featuredOrder: null,
        createdAt: Date.now(),
      };

      const result = await db.collection('stores').insertOne(store);
      res.status(201).json({ store: { ...store, _id: result.insertedId } });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'تعذر إنشاء المتجر' });
    }
  });

  // ---------- عرض عام لصفحة المتجر ----------

  // شريط الدوائر بالصفحة الرئيسية — أكتر 3 محلات "راعي رسمي" فقط،
  // ونتأكد إن اشتراكها فعّال لحظياً (لو انتهى اشتراك محل مميز، بيختفي
  // تلقائياً من الشريط بدون ما يحتاج أحد يلغي تمييزه يدوياً)
  app.get('/api/stores/featured', async (req, res) => {
    try {
      const stores = await db
        .collection('stores')
        .find({ isFeatured: true, isActive: { $ne: false }, approvalStatus: 'approved' })
        .sort({ featuredOrder: 1 })
        .limit(3)
        .toArray();

      const active = stores.filter((s) => computeSubscriptionState(s).isActive);

      res.json({
        stores: active.map((s) => ({
          slug: s.slug,
          name: s.name,
          logoUrl: s.logoUrl,
          isVerified: s.isVerified,
        })),
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'تعذر جلب المتاجر المميزة' });
    }
  });

  // دليل كل المتاجر الرسمية — صفحة "المتاجر الرسمية" العامة، بفلترة وبحث
  app.get('/api/stores', async (req, res) => {
    try {
      const { category, q, page = 1, limit = 20 } = req.query;

      const filter = { isActive: { $ne: false }, approvalStatus: 'approved' };
      if (category) filter.category = category;
      if (q) filter.name = { $regex: q, $options: 'i' };

      const pageNum = Math.max(1, Number(page));
      const limitNum = Math.min(50, Math.max(1, Number(limit)));

      const all = await db
        .collection('stores')
        .find(filter)
        .sort({ isVerified: -1, createdAt: -1 })
        .toArray();

      // نستبعد المحلات المعلّقة من الدليل العام (لكن نبقيها تظهر لو حد
      // دخل رابطها المباشر، عشان صاحبها يقدر يشوف حالة اشتراكه ويجدد)
      const visible = all.filter((s) => computeSubscriptionState(s).effectiveStatus !== 'suspended');

      const total = visible.length;
      const pageItems = visible.slice((pageNum - 1) * limitNum, pageNum * limitNum);

      res.json({
        stores: pageItems.map((s) => ({
          slug: s.slug,
          name: s.name,
          logoUrl: s.logoUrl,
          coverImageUrl: s.coverImageUrl,
          category: s.category,
          isVerified: s.isVerified,
        })),
        pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'تعذر جلب المتاجر' });
    }
  });

  app.get('/api/stores/:slug', async (req, res) => {
    try {
      const store = await db
        .collection('stores')
        .findOne({ slug: req.params.slug, isActive: { $ne: false } });
      if (!store) return res.status(404).json({ error: 'المتجر غير موجود' });

      const token = req.headers['x-user-token'];
      const uid = token && getUidFromToken ? await getUidFromToken(token) : null;
      const role = resolveStoreRole(store, uid);
      const canManage = role === 'owner' || role === 'manager';

      // متجر بانتظار المراجعة أو مرفوض: يظهر فقط لمالكه/مشرفه، مش لأي زائر آخر
      if (store.approvalStatus !== 'approved' && !canManage) {
        return res.status(404).json({ error: 'المتجر غير موجود' });
      }

      const subscription = computeSubscriptionState(store);

      res.json({
        store: {
          id: store._id,
          name: store.name,
          slug: store.slug,
          description: store.description,
          logoUrl: store.logoUrl,
          coverImageUrl: store.coverImageUrl,
          category: store.category,
          isVerified: store.isVerified,
          contact: store.contact,
          policies: store.policies,
          createdAt: store.createdAt,
        },
        // للفرونت إند فقط (إظهار/إخفاء زر الإدارة) — الحماية الفعلية بالمسارات تحت
        viewerCanManage: canManage,
        viewerRole: role,
        // نُرجع حالة الاشتراك فقط للمالك/المشرف — زائر عادي ما إله دخل فيها
        subscription: canManage
          ? {
              status: subscription.effectiveStatus,
              daysRemaining: subscription.daysRemaining,
              monthlyFee: store.monthlyFee,
            }
          : undefined,
        approvalStatus: canManage ? store.approvalStatus : undefined,
        approvalReason: canManage ? store.approvalReason : undefined,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'تعذر تحميل المتجر' });
    }
  });

  // تعديل بيانات أساسية — مالك أو مشرف
  app.patch('/api/stores/:slug', requireUserAuth, requireStoreManager, async (req, res) => {
    try {
      const allowed = ['name', 'description', 'logoUrl', 'coverImageUrl', 'category'];
      const updates = {};
      for (const f of allowed) if (req.body[f] !== undefined) updates[f] = req.body[f];
      await db.collection('stores').updateOne({ _id: req.store._id }, { $set: updates });
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'تعذر التحديث' });
    }
  });

  // تعديل التواصل والسياسات — المالك فقط
  app.patch(
    '/api/stores/:slug/contact-and-policies',
    requireUserAuth,
    requireStoreOwner,
    async (req, res) => {
      try {
        const { whatsapp, phone, address, lat, lng, warrantyText, returnPolicyText, warrantyPeriodDays } =
          req.body;

        const update = {
          'contact.whatsapp': whatsapp || '',
          'contact.phone': phone || '',
          'contact.address': address || '',
          'policies.warrantyText': warrantyText || '',
          'policies.returnPolicyText': returnPolicyText || '',
          'policies.warrantyPeriodDays': warrantyPeriodDays ?? null,
        };
        if (lat !== undefined && lng !== undefined) {
          update['contact.location'] = { lat, lng };
        }

        await db.collection('stores').updateOne({ _id: req.store._id }, { $set: update });
        res.json({ success: true });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'تعذر التحديث' });
      }
    }
  );

  // إضافة مشرف — المالك فقط
  app.post('/api/stores/:slug/admins', requireUserAuth, requireStoreOwner, async (req, res) => {
    try {
      const { uid, role = 'manager' } = req.body;
      if (!uid) return res.status(400).json({ error: 'uid المستخدم مطلوب' });

      const already = (req.store.admins || []).some((a) => a.uid === uid);
      if (already) return res.status(409).json({ error: 'هذا المستخدم مشرف بالفعل' });

      await db
        .collection('stores')
        .updateOne(
          { _id: req.store._id },
          { $push: { admins: { uid, role, isActive: true, addedAt: Date.now() } } }
        );
      res.status(201).json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'تعذر إضافة المشرف' });
    }
  });

  // إزالة مشرف — المالك فقط
  app.delete(
    '/api/stores/:slug/admins/:uid',
    requireUserAuth,
    requireStoreOwner,
    async (req, res) => {
      try {
        await db
          .collection('stores')
          .updateOne({ _id: req.store._id }, { $pull: { admins: { uid: req.params.uid } } });
        res.json({ success: true });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'تعذر الحذف' });
      }
    }
  );

  // تفعيل/إلغاء شارة التوثيق — فريق سوقنا فقط
  app.patch(
    '/api/admin/stores/:slug/verify',
    requireUserAuth,
    requirePlatformSuperAdmin,
    async (req, res) => {
      const store = await loadStoreOr404(req, res);
      if (!store) return;
      try {
        const { isVerified } = req.body;
        await db.collection('stores').updateOne(
          { _id: store._id },
          {
            $set: {
              isVerified: !!isVerified,
              verifiedAt: isVerified ? Date.now() : null,
              verifiedByUid: isVerified ? req.user.uid : null,
            },
          }
        );
        res.json({ success: true });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'تعذر التحديث' });
      }
    }
  );

  // ---------- طلبات تسجيل المحلات (الموافقة الإدارية) ----------

  // قائمة المحلات بانتظار المراجعة
  app.get('/api/admin/stores/pending', requireUserAuth, requirePlatformSuperAdmin, async (req, res) => {
    try {
      const stores = await db
        .collection('stores')
        .find({ approvalStatus: 'pending' })
        .sort({ createdAt: 1 })
        .toArray();
      res.json({
        stores: stores.map((s) => ({
          slug: s.slug,
          name: s.name,
          category: s.category,
          ownerUid: s.ownerUid,
          description: s.description,
          createdAt: s.createdAt,
        })),
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'تعذر جلب الطلبات' });
    }
  });

  // موافقة على محل — بيصير مرئي للعموم فوراً
  app.post(
    '/api/admin/stores/:slug/approve',
    requireUserAuth,
    requirePlatformSuperAdmin,
    async (req, res) => {
      try {
        await db
          .collection('stores')
          .updateOne(
            { slug: req.params.slug },
            { $set: { approvalStatus: 'approved', approvalReason: '' } }
          );
        res.json({ success: true });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'تعذر الموافقة' });
      }
    }
  );

  // رفض محل — يضل مخفي عن العموم، صاحبه بيشوف سبب الرفض بصفحة "متجري"
  app.post(
    '/api/admin/stores/:slug/reject',
    requireUserAuth,
    requirePlatformSuperAdmin,
    async (req, res) => {
      try {
        const { reason = '' } = req.body;
        await db
          .collection('stores')
          .updateOne(
            { slug: req.params.slug },
            { $set: { approvalStatus: 'rejected', approvalReason: reason } }
          );
        res.json({ success: true });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'تعذر الرفض' });
      }
    }
  );

  // حذف محل نهائياً — بيحذف منتجاته كمان (إجراء لا يُراجع، استخدمه بحذر)
  app.delete(
    '/api/admin/stores/:slug',
    requireUserAuth,
    requirePlatformSuperAdmin,
    async (req, res) => {
      try {
        const store = await db.collection('stores').findOne({ slug: req.params.slug });
        if (!store) return res.status(404).json({ error: 'المتجر غير موجود' });

        await db.collection('store_products').deleteMany({ storeId: store._id });
        await db.collection('stores').deleteOne({ _id: store._id });

        res.json({ success: true });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'تعذر الحذف' });
      }
    }
  );

  // تعديل مدة الاشتراك بالزيادة أو النقصان (بالأيام) — يقدر يستخدمها الأدمن
  // لتصحيح غلطة، أو لتقصير اشتراك محل مخالف بدون تعليقه بالكامل
  app.post(
    '/api/admin/stores/:slug/subscription/adjust',
    requireUserAuth,
    requirePlatformSuperAdmin,
    async (req, res) => {
      try {
        const store = await db.collection('stores').findOne({ slug: req.params.slug });
        if (!store) return res.status(404).json({ error: 'المتجر غير موجود' });

        const { days } = req.body; // رقم موجب = زيادة، سالب = نقصان
        const daysNum = Number(days);
        if (!daysNum) return res.status(400).json({ error: 'عدد الأيام مطلوب' });

        const base = store.subscriptionExpiresAt || Date.now();
        const newExpiry = base + daysNum * DAY_MS;

        await db
          .collection('stores')
          .updateOne({ _id: store._id }, { $set: { subscriptionExpiresAt: newExpiry } });

        res.json({ success: true, subscriptionExpiresAt: newExpiry });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'تعذر التعديل' });
      }
    }
  );

  // حذف أي منشور من أي محل (رقابة إدارية) — بدون شرط ملكية، فقط صلاحية أدمن
  app.delete(
    '/api/admin/stores/:slug/products/:productId',
    requireUserAuth,
    requirePlatformSuperAdmin,
    async (req, res) => {
      try {
        await db
          .collection('store_products')
          .deleteOne({ _id: new ObjectId(req.params.productId) });
        res.json({ success: true });
      } catch (err) {
        console.error(err);
        res.status(400).json({ error: 'تعذر الحذف' });
      }
    }
  );

  // ---------- إدارة الاشتراكات (فريق سوقنا فقط) ----------

  // قائمة كل المتاجر مع حالة اشتراكها — للوحة تحكم الإدارة
  app.get('/api/admin/stores', requireUserAuth, requirePlatformSuperAdmin, async (req, res) => {
    try {
      const { status } = req.query; // trial | active | expired | suspended (اختياري)
      const stores = await db.collection('stores').find({}).sort({ createdAt: -1 }).toArray();

      const enriched = stores.map((s) => ({
        id: s._id,
        name: s.name,
        slug: s.slug,
        ownerUid: s.ownerUid,
        monthlyFee: s.monthlyFee,
        lastPaymentAt: s.lastPaymentAt,
        ...computeSubscriptionState(s),
      }));

      const filtered = status ? enriched.filter((s) => s.effectiveStatus === status) : enriched;
      res.json({ stores: filtered });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'تعذر جلب قائمة المتاجر' });
    }
  });

  // تفعيل/تجديد الاشتراك يدوياً بعد استلام الدفعة (كليك/تحويل/كاش)
  // يمدد من تاريخ الانتهاء الحالي إذا كان بالمستقبل (ما يخسر صاحب المحل أيام
  // دفعها سلفاً)، أو من الآن إذا كان الاشتراك منتهي أصلاً.
  app.post(
    '/api/admin/stores/:slug/subscription/activate',
    requireUserAuth,
    requirePlatformSuperAdmin,
    async (req, res) => {
      try {
        const store = await db.collection('stores').findOne({ slug: req.params.slug });
        if (!store) return res.status(404).json({ error: 'المتجر غير موجود' });

        const { months = 1, note = '' } = req.body;
        const monthsNum = Math.max(1, Number(months) || 1);
        const now = Date.now();
        const base = store.subscriptionExpiresAt > now ? store.subscriptionExpiresAt : now;
        const newExpiry = base + monthsNum * 30 * DAY_MS;

        const paymentEntry = {
          amount: (store.monthlyFee || DEFAULT_MONTHLY_FEE) * monthsNum,
          months: monthsNum,
          note,
          recordedByUid: req.user.uid,
          at: now,
        };

        await db.collection('stores').updateOne(
          { _id: store._id },
          {
            $set: { subscriptionStatus: 'active', subscriptionExpiresAt: newExpiry, lastPaymentAt: now },
            $push: { paymentHistory: paymentEntry },
          }
        );

        res.json({ success: true, subscriptionExpiresAt: newExpiry });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'تعذر تفعيل الاشتراك' });
      }
    }
  );

  // تعليق يدوي (مثلاً حالة نصب أو مخالفة) — يتجاوز تاريخ الانتهاء بالكامل
  app.post(
    '/api/admin/stores/:slug/subscription/suspend',
    requireUserAuth,
    requirePlatformSuperAdmin,
    async (req, res) => {
      try {
        const { reason = '' } = req.body;
        await db
          .collection('stores')
          .updateOne(
            { slug: req.params.slug },
            { $set: { subscriptionStatus: 'suspended', suspendReason: reason } }
          );
        res.json({ success: true });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'تعذر التعليق' });
      }
    }
  );

  // رفع التعليق (بدون تمديد تاريخ — يرجع يعتمد على subscriptionExpiresAt الطبيعي)
  app.post(
    '/api/admin/stores/:slug/subscription/unsuspend',
    requireUserAuth,
    requirePlatformSuperAdmin,
    async (req, res) => {
      try {
        await db
          .collection('stores')
          .updateOne({ slug: req.params.slug }, { $set: { subscriptionStatus: 'active' }, $unset: { suspendReason: '' } });
        res.json({ success: true });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'تعذر رفع التعليق' });
      }
    }
  );

  // تفعيل/إلغاء الظهور المميز بشريط الدوائر بالصفحة الرئيسية — حد أقصى 3 محلات
  app.post(
    '/api/admin/stores/:slug/feature',
    requireUserAuth,
    requirePlatformSuperAdmin,
    async (req, res) => {
      try {
        const store = await db.collection('stores').findOne({ slug: req.params.slug });
        if (!store) return res.status(404).json({ error: 'المتجر غير موجود' });

        const { featured } = req.body;

        if (featured) {
          const currentCount = await db
            .collection('stores')
            .countDocuments({ isFeatured: true, slug: { $ne: req.params.slug } });
          if (currentCount >= 3) {
            return res.status(409).json({
              error: 'في 3 محلات مميزة حالياً بالفعل، لازم تلغي واحد منهم أول عشان تضيف هذا',
            });
          }
          await db
            .collection('stores')
            .updateOne({ _id: store._id }, { $set: { isFeatured: true, featuredOrder: currentCount } });
        } else {
          await db
            .collection('stores')
            .updateOne({ _id: store._id }, { $set: { isFeatured: false, featuredOrder: null } });
        }

        res.json({ success: true });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'تعذر التحديث' });
      }
    }
  );

  // ---------- منتجات المتجر ----------

  // تصفح عام بفلترة/ترتيب — محصور دائماً بـ storeId هذا المتجر فقط
  app.get('/api/stores/:slug/products', async (req, res) => {
    try {
      const store = await db
        .collection('stores')
        .findOne({ slug: req.params.slug, isActive: { $ne: false } });
      if (!store) return res.status(404).json({ error: 'المتجر غير موجود' });

      const { category, minPrice, maxPrice, inStock, sortBy = 'newest', page = 1, limit = 20, q } =
        req.query;

      const filter = { storeId: store._id, isPublished: true }; // ← القيد الحصري
      if (category) filter.category = category;
      if (inStock === 'true') filter.stock = { $gt: 0 };
      if (minPrice || maxPrice) {
        filter.price = {};
        if (minPrice) filter.price.$gte = Number(minPrice);
        if (maxPrice) filter.price.$lte = Number(maxPrice);
      }
      if (q) filter.$text = { $search: q };

      const sortMap = {
        newest: { createdAt: -1 },
        price_asc: { price: 1 },
        price_desc: { price: -1 },
        popular: { viewsCount: -1 },
      };
      const sort = sortMap[sortBy] || sortMap.newest;
      const pageNum = Math.max(1, Number(page));
      const limitNum = Math.min(50, Math.max(1, Number(limit)));

      const items = await db
        .collection('store_products')
        .find(filter)
        .sort(sort)
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .toArray();
      const total = await db.collection('store_products').countDocuments(filter);

      res.json({
        products: items,
        pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'تعذر جلب المنتجات' });
    }
  });

  // نشر منتج — مالك أو مشرف، وبشرط اشتراك المتجر فعّال (requireActiveSubscription)
  app.post(
    '/api/stores/:slug/products',
    requireUserAuth,
    requireStoreManager,
    requireActiveSubscription,
    async (req, res) => {
    try {
      const { title, description, price, discountPrice, images, category, stock } = req.body;
      if (!title || price === undefined) {
        return res.status(400).json({ error: 'العنوان والسعر مطلوبان' });
      }

      const product = {
        storeId: req.store._id, // ← يُشتق من الراوت (req.store)، مش من body
        createdByUid: req.user.uid,
        title,
        description: description || '',
        price: Number(price),
        discountPrice: discountPrice !== undefined ? Number(discountPrice) : null,
        images: images || [],
        category: category || '',
        stock: stock !== undefined ? Number(stock) : 0,
        isPublished: true,
        viewsCount: 0,
        createdAt: Date.now(),
      };

      const result = await db.collection('store_products').insertOne(product);
        res.status(201).json({ product: { ...product, _id: result.insertedId } });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'تعذر نشر المنتج' });
      }
    }
  );

  // تعديل منتج
  app.patch(
    '/api/stores/:slug/products/:productId',
    requireUserAuth,
    requireStoreManager,
    requireProductBelongsToStore,
    async (req, res) => {
      try {
        const allowed = ['title', 'description', 'price', 'discountPrice', 'images', 'category', 'stock', 'isPublished'];
        const updates = { lastEditedByUid: req.user.uid };
        for (const f of allowed) if (req.body[f] !== undefined) updates[f] = req.body[f];
        await db.collection('store_products').updateOne({ _id: req.product._id }, { $set: updates });
        res.json({ success: true });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'تعذر التحديث' });
      }
    }
  );

  // حذف منتج
  app.delete(
    '/api/stores/:slug/products/:productId',
    requireUserAuth,
    requireStoreManager,
    requireProductBelongsToStore,
    async (req, res) => {
      try {
        await db.collection('store_products').deleteOne({ _id: req.product._id });
        res.json({ success: true });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'تعذر الحذف' });
      }
    }
  );
};
