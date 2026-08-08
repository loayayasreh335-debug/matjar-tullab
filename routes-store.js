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
  app.get('/api/stores/:slug', async (req, res) => {
    try {
      const store = await db
        .collection('stores')
        .findOne({ slug: req.params.slug, isActive: { $ne: false } });
      if (!store) return res.status(404).json({ error: 'المتجر غير موجود' });

      const token = req.headers['x-user-token'];
      const uid = token && getUidFromToken ? await getUidFromToken(token) : null;
      const role = resolveStoreRole(store, uid);

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
        viewerCanManage: role === 'owner' || role === 'manager',
        viewerRole: role,
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

  // نشر منتج — مالك أو مشرف فقط
  app.post('/api/stores/:slug/products', requireUserAuth, requireStoreManager, async (req, res) => {
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
  });

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
