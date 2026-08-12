module.exports = function registerFavoritesRoutes(app, deps) {
  const { db } = deps;
  const requireUserAuth = deps.requireUserAuth || app.locals.requireUserAuth;

  db.collection('favorites').createIndex({ uid: 1, itemId: 1 }, { unique: true }).catch(console.error);
  db.collection('favorites').createIndex({ uid: 1, createdAt: -1 }).catch(console.error);

  // إرجاع كل معرّفات المنشورات المحفوظة عند المستخدم الحالي (خفيف - للتحقق بالبطاقات)
  app.get('/api/favorites/ids', requireUserAuth, async (req, res) => {
    try {
      const favs = await db.collection('favorites').find({ uid: req.user.uid }).project({ itemId: 1 }).toArray();
      res.json(favs.map(f => f.itemId));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'حدث خطأ' });
    }
  });

  // إرجاع المنشورات المحفوظة كاملة (لصفحة المفضلة)
  app.get('/api/favorites', requireUserAuth, async (req, res) => {
    try {
      const favs = await db.collection('favorites').find({ uid: req.user.uid }).sort({ createdAt: -1 }).toArray();
      const ids = favs.map(f => f.itemId);
      const items = await db.collection('items').find({ id: { $in: ids } }).toArray();
      const itemsById = Object.fromEntries(items.map(i => [i.id, i]));
      const ordered = ids.map(id => itemsById[id]).filter(Boolean);
      res.json(ordered);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'حدث خطأ' });
    }
  });

  // حفظ منشور بالمفضلة
  app.post('/api/favorites/:itemId', requireUserAuth, async (req, res) => {
    try {
      const itemId = req.params.itemId;
      const item = await db.collection('items').findOne({ id: itemId });
      if (!item) return res.status(404).json({ error: 'المنشور غير موجود' });

      await db.collection('favorites').updateOne(
        { uid: req.user.uid, itemId },
        { $setOnInsert: { uid: req.user.uid, itemId, createdAt: Date.now() } },
        { upsert: true }
      );
      res.status(201).json({ saved: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'حدث خطأ' });
    }
  });

  // إزالة منشور من المفضلة
  app.delete('/api/favorites/:itemId', requireUserAuth, async (req, res) => {
    try {
      await db.collection('favorites').deleteOne({ uid: req.user.uid, itemId: req.params.itemId });
      res.json({ saved: false });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'حدث خطأ' });
    }
  });
};
