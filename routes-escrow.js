// routes-escrow.js
// نظام الوسيط الآمن (Escrow) لتبادل حسابات الألعاب - تحقق يدوي من الأدمن
const cryptoNode = require('crypto');

module.exports = function registerEscrowRoutes(app, ctx) {
  const { db, crypto, ADMIN_PASSWORD } = ctx;

  db.collection('escrowSessions').createIndex({ id: 1 }, { unique: true }).catch(() => {});
  db.collection('escrowSessions').createIndex({ status: 1 }).catch(() => {});

  const ENC_KEY_HEX = process.env.ESCROW_ENC_KEY;
  const ENC_KEY = ENC_KEY_HEX ? Buffer.from(ENC_KEY_HEX, 'hex') : null;

  function encryptCreds(obj) {
    const iv = cryptoNode.randomBytes(12);
    const cipher = cryptoNode.createCipheriv('aes-256-gcm', ENC_KEY, iv);
    const enc = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]).toString('base64');
  }
  function decryptCreds(payload) {
    const data = Buffer.from(payload, 'base64');
    const iv = data.slice(0, 12), tag = data.slice(12, 28), enc = data.slice(28);
    const decipher = cryptoNode.createDecipheriv('aes-256-gcm', ENC_KEY, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return JSON.parse(dec.toString('utf8'));
  }

  function requireAdmin(req, res, next) {
    const headerPass = req.headers['x-admin-password'];
    const bodyPass = req.body && req.body.adminPassword;
    const password = headerPass || bodyPass;
    if (!password || password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'غير مصرح - كلمة سر الأدمن غير صحيحة' });
    }
    next();
  }

  function toPublicSession(s) {
    const clean = { ...s };
    if (clean.credentials) {
      const { encryptedPayload, ...restCred } = clean.credentials;
      clean.credentials = restCred;
    }
    delete clean._id;
    return clean;
  }

  function genId() {
    return Date.now().toString(36) + Math.round(Math.random() * 1e6).toString(36);
  }
  function genToken() {
    return crypto.randomBytes(16).toString('hex');
  }

  // ---------- إنشاء جلسة وساطة جديدة ----------
  app.post('/api/escrow/create', async (req, res) => {
    try {
      const { sellerWhatsapp, buyerWhatsapp, gameType, itemId } = req.body;
      if (!sellerWhatsapp || !buyerWhatsapp) {
        return res.status(400).json({ error: 'يرجى إدخال أرقام واتساب البائع والمشتري' });
      }
      const session = {
        id: genId(),
        sellerWhatsapp: sellerWhatsapp.trim(),
        buyerWhatsapp: buyerWhatsapp.trim(),
        gameType: gameType || '',
        itemId: itemId || null,
        status: 'PENDING_PAYMENT',
        feeAmount: 5,
        sellerToken: genToken(),
        buyerToken: genToken(),
        paymentProof: null,
        credentials: null,
        confirmations: { sellerConfirmed: false, buyerConfirmed: false },
        messages: [{ senderRole: 'bot', text: 'مرحباً بكما في روم الوسيط الآمن. يرجى دفع رسوم الخدمة (5 دينار) عبر CliQ أو Orange Money وإرفاق صورة الإشعار.', createdAt: Date.now() }],
        createdAt: Date.now()
      };
      await db.collection('escrowSessions').insertOne(session);
      res.status(201).json({
        success: true,
        id: session.id,
        sellerToken: session.sellerToken,
        buyerToken: session.buyerToken
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'تعذر إنشاء جلسة الوساطة' });
    }
  });

  // ---------- جلب حالة الجلسة ----------
  app.get('/api/escrow/:id', async (req, res) => {
    try {
      const session = await db.collection('escrowSessions').findOne({ id: req.params.id });
      if (!session) return res.status(404).json({ error: 'الجلسة غير موجودة' });
      res.json({ success: true, session: toPublicSession(session) });
    } catch (err) {
      res.status(500).json({ error: 'تعذر جلب الجلسة' });
    }
  });

  // ---------- إرسال إثبات الدفع (صورة الإشعار) - يُخزن على Cloudinary ----------
  app.post('/api/escrow/:id/pay', ctx.upload.single('proof'), async (req, res) => {
    try {
      const { token, method } = req.body;
      const session = await db.collection('escrowSessions').findOne({ id: req.params.id });
      if (!session) return res.status(404).json({ error: 'الجلسة غير موجودة' });
      if (token !== session.sellerToken && token !== session.buyerToken) {
        return res.status(403).json({ error: 'رمز غير صحيح' });
      }
      let screenshotUrl = null;
      if (req.file) {
        const uploaded = await ctx.uploadImageToCloudinary(req.file.buffer);
        screenshotUrl = uploaded.url;
      }
      await db.collection('escrowSessions').updateOne(
        { id: req.params.id },
        {
          $set: { paymentProof: { method: method || 'CLIQ', screenshotUrl, submittedAt: Date.now() } },
          $push: { messages: { senderRole: 'bot', text: 'تم استلام إشعار الدفع، بانتظار تأكيد الأدمن.', createdAt: Date.now() } }
        }
      );
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'تعذر إرسال إثبات الدفع' });
    }
  });

  // ---------- (أدمن) تأكيد استلام الدفع ----------
  app.post('/api/admin/escrow/:id/verify-payment', requireAdmin, async (req, res) => {
    try {
      const session = await db.collection('escrowSessions').findOne({ id: req.params.id });
      if (!session) return res.status(404).json({ error: 'الجلسة غير موجودة' });
      await db.collection('escrowSessions').updateOne(
        { id: req.params.id },
        {
          $set: { status: 'PAYMENT_VERIFIED' },
          $push: { messages: { senderRole: 'bot', text: 'تم تأكيد الدفع ✅. البائع، الرجاء إدخال بيانات الحساب الآن.', createdAt: Date.now() } }
        }
      );
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'تعذر تأكيد الدفع' });
    }
  });

  // ---------- تسليم بيانات الحساب (البائع فقط) ----------
  app.post('/api/escrow/:id/submit-credentials', async (req, res) => {
    try {
      const { token, email, password, otpNote } = req.body;
      const session = await db.collection('escrowSessions').findOne({ id: req.params.id });
      if (!session) return res.status(404).json({ error: 'الجلسة غير موجودة' });
      if (token !== session.sellerToken) return res.status(403).json({ error: 'البائع فقط يمكنه إدخال بيانات الحساب' });
      if (session.status !== 'PAYMENT_VERIFIED') return res.status(400).json({ error: 'الدفع لم يُؤكد بعد من الأدمن' });
      if (!ENC_KEY) return res.status(500).json({ error: 'مفتاح التشفير غير مهيأ على السيرفر' });

      const encryptedPayload = encryptCreds({ email, password, otpNote: otpNote || '' });
      await db.collection('escrowSessions').updateOne(
        { id: req.params.id },
        {
          $set: { status: 'DATA_SUBMITTED', credentials: { encryptedPayload, submittedAt: Date.now(), revealedToBuyer: false } },
          $push: { messages: { senderRole: 'bot', text: 'تم استلام بيانات الحساب وتشفيرها. المشتري، عند تأكدك من استلام المبلغ اضغط "تم الاستلام بنجاح".', createdAt: Date.now() } }
        }
      );
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'تعذر حفظ بيانات الحساب' });
    }
  });

  // ---------- تأكيد الاستلام من الطرفين ----------
  app.post('/api/escrow/:id/complete', async (req, res) => {
    try {
      const { token } = req.body;
      const session = await db.collection('escrowSessions').findOne({ id: req.params.id });
      if (!session) return res.status(404).json({ error: 'الجلسة غير موجودة' });

      const isSeller = token === session.sellerToken;
      const isBuyer = token === session.buyerToken;
      if (!isSeller && !isBuyer) return res.status(403).json({ error: 'رمز غير صحيح' });

      const confirmations = { ...session.confirmations };
      if (isSeller) confirmations.sellerConfirmed = true;
      if (isBuyer) confirmations.buyerConfirmed = true;

      let newStatus = session.status;
      let revealedCredentials = null;

      if (confirmations.sellerConfirmed && confirmations.buyerConfirmed) {
        newStatus = 'COMPLETED';
        if (session.credentials && session.credentials.encryptedPayload) {
          revealedCredentials = decryptCreds(session.credentials.encryptedPayload);
        }
        await db.collection('escrowSessions').updateOne(
          { id: req.params.id },
          {
            $set: {
              status: newStatus,
              confirmations,
              'credentials.revealedToBuyer': true,
              'credentials.revealedAt': Date.now()
            },
            $push: { messages: { senderRole: 'bot', text: 'تمت العملية بنجاح ✅ وتم كشف بيانات الحساب للمشتري.', createdAt: Date.now() } }
          }
        );
      } else {
        newStatus = 'AWAITING_BOTH_CONFIRM';
        await db.collection('escrowSessions').updateOne(
          { id: req.params.id },
          { $set: { status: newStatus, confirmations } }
        );
      }

      const responsePayload = { success: true, status: newStatus };
      if (revealedCredentials && isBuyer) {
        responsePayload.credentials = revealedCredentials;
      }
      res.json(responsePayload);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'تعذر إتمام العملية' });
    }
  });

  // ---------- (أدمن) كل الجلسات المعلقة ----------
  app.get('/api/admin/escrow/pending', requireAdmin, async (req, res) => {
    try {
      const sessions = await db.collection('escrowSessions')
        .find({ status: { $in: ['PENDING_PAYMENT', 'PAYMENT_VERIFIED', 'DATA_SUBMITTED', 'AWAITING_BOTH_CONFIRM'] } })
        .sort({ createdAt: -1 })
        .toArray();
      res.json({ success: true, sessions: sessions.map(toPublicSession) });
    } catch (err) {
      res.status(500).json({ error: 'تعذر جلب الجلسات' });
    }
  });
};
