// routes-escrow.js
// نظام الوسيط الآمن (Escrow) الكامل - الفلوس تمر عبر الأدمن لحماية الطرفين
// التدفق: دفع (سعر الحساب + 5 رسوم) للأدمن -> تحقق الأدمن -> البائع يدخل البيانات
// -> تنكشف فوراً للمشتري -> المشتري يجرب ويأكد أو يبلغ عن مشكلة
// -> لو أكد: الأدمن يحول سعر الحساب للبائع | لو أبلغ: الأدمن يراجع ويقرر

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

  function pushMessage(sessionId, text) {
    return db.collection('escrowSessions').updateOne(
      { id: sessionId },
      { $push: { messages: { senderRole: 'bot', text, createdAt: Date.now() } } }
    );
  }

  // ---------- إنشاء جلسة وساطة جديدة ----------
  app.post('/api/escrow/create', async (req, res) => {
    try {
      const { sellerWhatsapp, buyerWhatsapp, gameType, itemId, dealAmount } = req.body;
      if (!sellerWhatsapp || !buyerWhatsapp) {
        return res.status(400).json({ error: 'يرجى إدخال أرقام واتساب البائع والمشتري' });
      }
      const parsedDeal = parseFloat(dealAmount);
      if (isNaN(parsedDeal) || parsedDeal <= 0) {
        return res.status(400).json({ error: 'يرجى إدخال سعر صحيح للحساب المتفق عليه' });
      }

      const feeAmount = 5;
      const totalDue = Math.round((parsedDeal + feeAmount) * 100) / 100;

      const session = {
        id: genId(),
        sellerWhatsapp: sellerWhatsapp.trim(),
        buyerWhatsapp: buyerWhatsapp.trim(),
        gameType: gameType || '',
        itemId: itemId || null,
        status: 'PENDING_PAYMENT',
        dealAmount: parsedDeal,
        feeAmount,
        totalDue,
        sellerToken: genToken(),
        buyerToken: genToken(),
        paymentProof: null,
        credentials: null,
        disputeReason: null,
        sellerPaid: false,
        confirmations: { sellerConfirmed: false, buyerConfirmed: false },
        messages: [{
          senderRole: 'bot',
          text: `مرحباً بكما في روم الوسيط الآمن. المبلغ الإجمالي المطلوب تحويله للأدمن: ${totalDue} دينار (${parsedDeal} دينار سعر الحساب + ${feeAmount} دينار رسوم الخدمة). يرجى التحويل عبر CliQ أو Orange Money وإرفاق صورة الإشعار.`,
          createdAt: Date.now()
        }],
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

  // ---------- جلب بيانات الحساب المكشوفة (المشتري فقط) ----------
  app.get('/api/escrow/:id/credentials', async (req, res) => {
    try {
      const { token } = req.query;
      const session = await db.collection('escrowSessions').findOne({ id: req.params.id });
      if (!session) return res.status(404).json({ error: 'الجلسة غير موجودة' });
      if (token !== session.buyerToken) return res.status(403).json({ error: 'رمز غير صحيح' });
      if (!session.credentials || !session.credentials.encryptedPayload || !session.credentials.revealedToBuyer) {
        return res.status(400).json({ error: 'بيانات الحساب غير متاحة بعد' });
      }
      if (!ENC_KEY) return res.status(500).json({ error: 'مفتاح التشفير غير مهيأ على السيرفر' });
      const decrypted = decryptCreds(session.credentials.encryptedPayload);
      res.json({ success: true, credentials: decrypted });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'تعذر جلب بيانات الحساب' });
    }
  });

  // ---------- إرسال إثبات الدفع (صورة الإشعار) ----------
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
        { $set: { paymentProof: { method: method || 'CLIQ', screenshotUrl, submittedAt: Date.now() } } }
      );
      await pushMessage(req.params.id, 'تم استلام إشعار الدفع، بانتظار تأكيد الأدمن.');
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
      if (session.status !== 'PENDING_PAYMENT') {
        return res.status(400).json({ error: 'الجلسة ليست بانتظار تحقق الدفع' });
      }
      await db.collection('escrowSessions').updateOne(
        { id: req.params.id },
        { $set: { status: 'PAYMENT_VERIFIED' } }
      );
      await pushMessage(req.params.id, 'تم تأكيد الدفع ✅. البائع، الرجاء إدخال بيانات الحساب الآن.');
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'تعذر تأكيد الدفع' });
    }
  });

  // ---------- تسليم بيانات الحساب (البائع فقط) - تنكشف فوراً للمشتري ----------
  app.post('/api/escrow/:id/submit-credentials', async (req, res) => {
    try {
      const { token, email, password, otpNote } = req.body;
      const session = await db.collection('escrowSessions').findOne({ id: req.params.id });
      if (!session) return res.status(404).json({ error: 'الجلسة غير موجودة' });
      if (token !== session.sellerToken) return res.status(403).json({ error: 'البائع فقط يمكنه إدخال بيانات الحساب' });
      if (session.status !== 'PAYMENT_VERIFIED') return res.status(400).json({ error: 'الدفع لم يُؤكد بعد من الأدمن' });
      if (!ENC_KEY) return res.status(500).json({ error: 'مفتاح التشفير غير مهيأ على السيرفر' });
      if (!email || !password) return res.status(400).json({ error: 'يرجى تعبئة الإيميل وكلمة السر' });

      const encryptedPayload = encryptCreds({ email, password, otpNote: otpNote || '' });
      await db.collection('escrowSessions').updateOne(
        { id: req.params.id },
        {
          $set: {
            status: 'DATA_SUBMITTED',
            credentials: { encryptedPayload, submittedAt: Date.now(), revealedToBuyer: true, revealedAt: Date.now() }
          }
        }
      );
      await pushMessage(req.params.id, 'تم استلام بيانات الحساب. المشتري، جرّب الدخول الآن على الحساب، وبعد التأكد اضغط "تم الاستلام والرضا" أو "الإبلاغ عن مشكلة" إذا في خطأ بالبيانات.');
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'تعذر حفظ بيانات الحساب' });
    }
  });

  // ---------- المشتري: تأكيد الاستلام والرضا عن الحساب ----------
  app.post('/api/escrow/:id/confirm-receipt', async (req, res) => {
    try {
      const { token } = req.body;
      const session = await db.collection('escrowSessions').findOne({ id: req.params.id });
      if (!session) return res.status(404).json({ error: 'الجلسة غير موجودة' });
      if (token !== session.buyerToken) return res.status(403).json({ error: 'المشتري فقط يمكنه تأكيد الاستلام' });
      if (session.status !== 'DATA_SUBMITTED') return res.status(400).json({ error: 'لا يمكن التأكيد بهذه المرحلة' });

      await db.collection('escrowSessions').updateOne(
        { id: req.params.id },
        { $set: { status: 'PAYOUT_PENDING', 'confirmations.buyerConfirmed': true } }
      );
      await pushMessage(req.params.id, 'المشتري أكد استلام الحساب بنجاح ✅. الأدمن بيحول سعر الحساب للبائع الآن.');
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'تعذر تأكيد الاستلام' });
    }
  });

  // ---------- المشتري: الإبلاغ عن مشكلة بالحساب ----------
  app.post('/api/escrow/:id/report-issue', async (req, res) => {
    try {
      const { token, reason } = req.body;
      const session = await db.collection('escrowSessions').findOne({ id: req.params.id });
      if (!session) return res.status(404).json({ error: 'الجلسة غير موجودة' });
      if (token !== session.buyerToken) return res.status(403).json({ error: 'المشتري فقط يمكنه الإبلاغ عن مشكلة' });
      if (session.status !== 'DATA_SUBMITTED') return res.status(400).json({ error: 'لا يمكن الإبلاغ بهذه المرحلة' });
      if (!reason || !reason.trim()) return res.status(400).json({ error: 'يرجى كتابة سبب المشكلة' });

      await db.collection('escrowSessions').updateOne(
        { id: req.params.id },
        { $set: { status: 'DISPUTED', disputeReason: reason.trim().slice(0, 500) } }
      );
      await pushMessage(req.params.id, '⚠️ المشتري أبلغ عن مشكلة بالحساب. الجلسة الآن قيد المراجعة من فريق الإدارة، ولن يتم تحويل أي مبلغ للبائع لحد ما تتحل المشكلة.');
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'تعذر إرسال البلاغ' });
    }
  });

  // ---------- (أدمن) تأكيد تحويل سعر الحساب للبائع - إغلاق الصفقة بنجاح ----------
  app.post('/api/admin/escrow/:id/mark-paid-seller', requireAdmin, async (req, res) => {
    try {
      const session = await db.collection('escrowSessions').findOne({ id: req.params.id });
      if (!session) return res.status(404).json({ error: 'الجلسة غير موجودة' });
      if (session.status !== 'PAYOUT_PENDING') return res.status(400).json({ error: 'الجلسة ليست بانتظار تحويل للبائع' });

      await db.collection('escrowSessions').updateOne(
        { id: req.params.id },
        { $set: { status: 'COMPLETED', sellerPaid: true } }
      );
      await pushMessage(req.params.id, '🎉 تم تحويل المبلغ للبائع، واكتملت الصفقة بنجاح. شكراً لاستخدامكم خدمة الوسيط الآمن.');
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'تعذر تأكيد التحويل' });
    }
  });

  // ---------- (أدمن) حل النزاع: إتمام الصفقة أو استرجاع المبلغ للمشتري ----------
  app.post('/api/admin/escrow/:id/resolve-dispute', requireAdmin, async (req, res) => {
    try {
      const { resolution } = req.body; // 'proceed' | 'refund'
      const session = await db.collection('escrowSessions').findOne({ id: req.params.id });
      if (!session) return res.status(404).json({ error: 'الجلسة غير موجودة' });
      if (session.status !== 'DISPUTED') return res.status(400).json({ error: 'الجلسة ليست بحالة نزاع' });

      if (resolution === 'proceed') {
        await db.collection('escrowSessions').updateOne(
          { id: req.params.id },
          { $set: { status: 'PAYOUT_PENDING' } }
        );
        await pushMessage(req.params.id, 'تمت مراجعة البلاغ من الإدارة، وتقرر إتمام الصفقة. جاري تحويل المبلغ للبائع.');
      } else if (resolution === 'refund') {
        await db.collection('escrowSessions').updateOne(
          { id: req.params.id },
          { $set: { status: 'REFUNDED' } }
        );
        await pushMessage(req.params.id, 'تمت مراجعة البلاغ من الإدارة، وتقرر استرجاع كامل المبلغ للمشتري. تم إلغاء الصفقة.');
      } else {
        return res.status(400).json({ error: 'قيمة resolution غير صحيحة' });
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'تعذر حل النزاع' });
    }
  });

  // ---------- (أدمن) كل الجلسات المعلقة (تحتاج إجراء) ----------
  app.get('/api/admin/escrow/pending', requireAdmin, async (req, res) => {
    try {
      const sessions = await db.collection('escrowSessions')
        .find({ status: { $in: ['PENDING_PAYMENT', 'PAYMENT_VERIFIED', 'DATA_SUBMITTED', 'PAYOUT_PENDING', 'DISPUTED'] } })
        .sort({ createdAt: -1 })
        .toArray();
      res.json({ success: true, sessions: sessions.map(toPublicSession) });
    } catch (err) {
      res.status(500).json({ error: 'تعذر جلب الجلسات' });
    }
  });
};
