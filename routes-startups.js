// public/routes-startups.js
// نظام "استثمار" - عرض مشاريع الـ Startups

const { ObjectId } = require('mongodb');

module.exports = function (app, deps) {
  const { db, uploadImageToCloudinary, upload, requirePlatformSuperAdmin } = deps;
  const startups = db.collection('startups');
  const investmentInterests = db.collection('investment_interests');

  // إنشاء مشروع جديد
  app.post('/api/startups', deps.requireUserAuth || app.locals.requireUserAuth, upload.single('logo'), async (req, res) => {
    try {
      const { name, idea, field, stage, isStudentProject, university } = req.body;
      if (!name || !idea || !field || !stage) {
        return res.status(400).json({ error: 'الرجاء تعبئة جميع الحقول المطلوبة' });
      }

      let logoUrl = null;
      if (req.file) {
        const uploaded = await uploadImageToCloudinary(req.file.buffer);
        logoUrl = uploaded.url;
      }

      const doc = {
        ownerUid: req.user.uid,
        ownerName: req.user.name || '',
        name,
        idea,
        field,
        stage,
        isStudentProject: isStudentProject === 'true' || isStudentProject === true,
        university: university || '',
        logoUrl,
        images: [],
        approvalStatus: 'pending',
        isAdopted: false,
        investCount: 0,
        createdAt: new Date()
      };

      const result = await startups.insertOne(doc);
      res.json({ success: true, id: result.insertedId });
    } catch (err) {
      console.error('POST /api/startups error:', err);
      res.status(500).json({ error: 'خطأ بالسيرفر' });
    }
  });

  // مشاريعي
  app.get('/api/startups/mine', deps.requireUserAuth || app.locals.requireUserAuth, async (req, res) => {
    try {
      const list = await startups.find({ ownerUid: req.user.uid }).sort({ createdAt: -1 }).toArray();
      res.json(list);
    } catch (err) {
      console.error('GET /api/startups/mine error:', err);
      res.status(500).json({ error: 'خطأ بالسيرفر' });
    }
  });

  // المعتمدة فقط (معرض عام) + فلترة
  app.get('/api/startups', async (req, res) => {
    try {
      const filter = { approvalStatus: 'approved' };
      if (req.query.field) filter.field = req.query.field;
      if (req.query.stage) filter.stage = req.query.stage;
      if (req.query.isStudentProject === 'true') filter.isStudentProject = true;

      const list = await startups.find(filter).sort({ createdAt: -1 }).toArray();
      res.json(list);
    } catch (err) {
      console.error('GET /api/startups error:', err);
      res.status(500).json({ error: 'خطأ بالسيرفر' });
    }
  });

  // تفاصيل مشروع
  app.get('/api/startups/:id', async (req, res) => {
    try {
      const item = await startups.findOne({ _id: new ObjectId(req.params.id) });
      if (!item) return res.status(404).json({ error: 'المشروع غير موجود' });
      res.json(item);
    } catch (err) {
      res.status(400).json({ error: 'معرّف غير صالح' });
    }
  });

  // تعديل مشروع (صاحبه فقط)
  app.patch('/api/startups/:id', deps.requireUserAuth || app.locals.requireUserAuth, async (req, res) => {
    try {
      const { name, idea, field, stage, university } = req.body;
      const update = {};
      if (name) update.name = name;
      if (idea) update.idea = idea;
      if (field) update.field = field;
      if (stage) update.stage = stage;
      if (university !== undefined) update.university = university;

      const result = await startups.updateOne(
        { _id: new ObjectId(req.params.id), ownerUid: req.user.uid },
        { $set: update }
      );
      if (result.matchedCount === 0) return res.status(404).json({ error: 'المشروع غير موجود أو غير مصرح' });
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: 'خطأ بالطلب' });
    }
  });

  // زر "استثمار"
  app.post('/api/startups/:id/invest', deps.requireUserAuth || app.locals.requireUserAuth, async (req, res) => {
    try {
      const { contactInfo } = req.body;
      const startupId = new ObjectId(req.params.id);

      const startup = await startups.findOne({ _id: startupId });
      if (!startup) return res.status(404).json({ error: 'المشروع غير موجود' });

      await investmentInterests.insertOne({
        startupId,
        interestedUid: req.user.uid,
        interestedName: req.user.name || '',
        contactInfo: contactInfo || '',
        createdAt: new Date()
      });

      await startups.updateOne({ _id: startupId }, { $inc: { investCount: 1 } });
      res.json({ success: true });
    } catch (err) {
      console.error('POST /api/startups/:id/invest error:', err);
      res.status(500).json({ error: 'خطأ بالسيرفر' });
    }
  });

  // زر "تم تبني هذا المشروع" (صاحب المشروع فقط)
  app.patch('/api/startups/:id/adopt', deps.requireUserAuth || app.locals.requireUserAuth, async (req, res) => {
    try {
      const result = await startups.updateOne(
        { _id: new ObjectId(req.params.id), ownerUid: req.user.uid },
        { $set: { isAdopted: true } }
      );
      if (result.matchedCount === 0) return res.status(404).json({ error: 'المشروع غير موجود أو غير مصرح' });
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: 'خطأ بالطلب' });
    }
  });

  // أدمن: الموافقة
  app.post('/api/admin/startups/:id/approve', requirePlatformSuperAdmin, async (req, res) => {
    try {
      const result = await startups.updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: { approvalStatus: 'approved' } }
      );
      if (result.matchedCount === 0) return res.status(404).json({ error: 'المشروع غير موجود' });
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: 'خطأ بالطلب' });
    }
  });

  // أدمن: الرفض
  app.delete('/api/admin/startups/:id/reject', requirePlatformSuperAdmin, async (req, res) => {
    try {
      const result = await startups.updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: { approvalStatus: 'rejected' } }
      );
      if (result.matchedCount === 0) return res.status(404).json({ error: 'المشروع غير موجود' });
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ error: 'خطأ بالطلب' });
    }
  });
};
