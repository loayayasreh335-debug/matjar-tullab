// routes-auth.js
// نظام تسجيل الدخول بجوجل عبر Firebase - يتحقق من هوية المستخدم على السيرفر فعلياً
// (مش بس بيصدق أي بيانات يبعتها المتصفح) عبر Firebase Admin SDK
const admin = require('firebase-admin');

module.exports = function registerAuthRoutes(app, deps) {
  const { db, crypto } = deps;

  // نتحقق إن كل متغيرات Firebase موجودة قبل أي محاولة تهيئة
  // لو ناقصة، نتخطى التهيئة بأمان بدل ما نوقع السيرفر بالكامل
  const firebaseEnvReady = !!(
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  );

  if (firebaseEnvReady && !admin.apps.length) {
    try {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        })
      });
      console.log('✅ Firebase Admin تم تهيئته بنجاح');
    } catch (err) {
      console.error('⚠️ فشل تهيئة Firebase (تسجيل الدخول بجوجل سيكون معطّلاً مؤقتاً):', err.message);
    }
  } else if (!firebaseEnvReady) {
    console.warn('⚠️ متغيرات Firebase غير مكتملة على Render (FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY) — تسجيل الدخول بجوجل معطّل مؤقتاً، والسيرفر بيكمل الشغل عادي.');
  }

  db.collection('users').createIndex({ uid: 1 }, { unique: true }).catch(console.error);

  // ---------- جلسات المستخدمين (تذكرة دخول مؤقتة، بدون كوكيز) ----------
  const userSessions = new Map(); // sessionToken -> { uid, expiry }
  const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // صلاحية 30 يوم

  function issueSessionToken(uid) {
    const token = crypto.randomBytes(24).toString('hex');
    userSessions.set(token, { uid, expiry: Date.now() + SESSION_TTL_MS });
    return token;
  }

  async function requireUserAuth(req, res, next) {
    const token = req.headers['x-user-token'];
    const session = token ? userSessions.get(token) : null;
    if (!session || session.expiry < Date.now()) {
      if (session) userSessions.delete(token);
      return res.status(401).json({ error: 'يجب تسجيل الدخول أولاً' });
    }
    try {
      const user = await db.collection('users').findOne({ uid: session.uid });
      if (!user) return res.status(401).json({ error: 'الحساب غير موجود' });
      req.user = user;
      next();
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'خطأ بالتحقق من الجلسة' });
    }
  }

  // يسمح لملفات routes الأخرى (chat, lostfound...) تستخدم نفس دالة التحقق
  app.locals.requireUserAuth = requireUserAuth;

  // ---------- تسجيل الدخول ----------
  app.post('/api/auth/google', async (req, res) => {
    try {
      if (!admin.apps.length) {
        return res.status(503).json({ error: 'تسجيل الدخول بجوجل غير مفعّل حالياً على السيرفر' });
      }
      const { idToken } = req.body;
      if (!idToken) return res.status(400).json({ error: 'رمز الدخول مفقود' });

      const decoded = await admin.auth().verifyIdToken(idToken);
      const { uid, email, name, picture } = decoded;

      await db.collection('users').updateOne(
        { uid },
        {
          $set: {
            uid,
            email: email || '',
            name: name || 'مستخدم سوقنا',
            picture: picture || '',
            lastLoginAt: Date.now()
          },
          $setOnInsert: { createdAt: Date.now() }
        },
        { upsert: true }
      );

      const sessionToken = issueSessionToken(uid);
      const user = await db.collection('users').findOne({ uid });

      res.json({
        sessionToken,
        user: { uid: user.uid, name: user.name, email: user.email, picture: user.picture }
      });
    } catch (err) {
      console.error('فشل التحقق من تسجيل الدخول:', err.stack || err.message);
      res.status(401).json({ error: 'فشل تسجيل الدخول، حاول مرة أخرى' });
    }
  });

  app.get('/api/auth/me', requireUserAuth, (req, res) => {
    res.json({
      uid: req.user.uid,
      name: req.user.name,
      email: req.user.email,
      picture: req.user.picture
    });
  });

  app.post('/api/auth/logout', (req, res) => {
    const token = req.headers['x-user-token'];
    if (token) userSessions.delete(token);
    res.json({ success: true });
  });
};
