// routes-chat.js
// نظام محادثة داخلية بين طرفين، مرتبط بأي نوع منشور (مفقودات، إعلان، مزاد...)
// يعتمد بالكامل على تسجيل الدخول من routes-auth.js - لا يعمل بدون حساب

module.exports = function registerChatRoutes(app, deps) {
  const { db, emitToUser } = deps;
  const requireUserAuth = deps.requireUserAuth || app.locals.requireUserAuth;

  db.collection('conversations').createIndex({ participants: 1 }).catch(console.error);
  db.collection('conversations').createIndex({ lastMessageAt: -1 }).catch(console.error);
  db.collection('messages').createIndex({ conversationId: 1, createdAt: 1 }).catch(console.error);

  function convId(itemType, itemId, uidA, uidB) {
    const sorted = [uidA, uidB].sort();
    return `conv_${itemType}_${itemId}_${sorted[0]}_${sorted[1]}`;
  }

  // بدء محادثة جديدة أو فتح واحدة موجودة أصلاً لنفس الطرفين ونفس المنشور
  app.post('/api/chat/start', requireUserAuth, async (req, res) => {
    try {
      const { itemType, itemId, itemName, otherUid } = req.body;
      if (!itemType || !itemId || !otherUid) {
        return res.status(400).json({ error: 'بيانات ناقصة لبدء المحادثة' });
      }
      if (otherUid === req.user.uid) {
        return res.status(400).json({ error: 'ما فيك تبدأ محادثة مع نفسك' });
      }

      const otherUser = await db.collection('users').findOne({ uid: otherUid });
      if (!otherUser) return res.status(404).json({ error: 'المستخدم غير موجود' });

      const id = convId(itemType, itemId, req.user.uid, otherUid);
      const existing = await db.collection('conversations').findOne({ id });

      if (existing) {
        return res.json({ id: existing.id });
      }

      await db.collection('conversations').insertOne({
        id,
        itemType,
        itemId,
        itemName: itemName || '',
        participants: [req.user.uid, otherUid],
        participantInfo: {
          [req.user.uid]: { name: req.user.name, picture: req.user.picture },
          [otherUid]: { name: otherUser.name, picture: otherUser.picture }
        },
        createdAt: Date.now(),
        lastMessageAt: Date.now()
      });

      res.status(201).json({ id });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'تعذر بدء المحادثة' });
    }
  });

  // قائمة كل محادثاتي
  app.get('/api/chat/conversations', requireUserAuth, async (req, res) => {
    try {
      const conversations = await db.collection('conversations')
        .find({ participants: req.user.uid })
        .sort({ lastMessageAt: -1 })
        .toArray();

      const result = conversations.map(c => {
        const otherUid = c.participants.find(uid => uid !== req.user.uid);
        const otherInfo = (c.participantInfo && c.participantInfo[otherUid]) || {};
        return {
          id: c.id,
          itemType: c.itemType,
          itemId: c.itemId,
          itemName: c.itemName,
          otherUser: { uid: otherUid, name: otherInfo.name || 'مستخدم', picture: otherInfo.picture || '' }
        };
      });

      res.json(result);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'تعذر جلب المحادثات' });
    }
  });

  // رسائل محادثة معيّنة
  app.get('/api/chat/:id/messages', requireUserAuth, async (req, res) => {
    try {
      const conversation = await db.collection('conversations').findOne({ id: req.params.id });
      if (!conversation || !conversation.participants.includes(req.user.uid)) {
        return res.status(403).json({ error: 'غير مصرح لك بالوصول لهذه المحادثة' });
      }

      const messages = await db.collection('messages')
        .find({ conversationId: req.params.id })
        .sort({ createdAt: 1 })
        .limit(200)
        .toArray();

      res.json(messages.map(m => ({ senderUid: m.senderUid, text: m.text, createdAt: m.createdAt })));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'تعذر جلب الرسائل' });
    }
  });

  // إرسال رسالة
  app.post('/api/chat/:id/messages', requireUserAuth, async (req, res) => {
    try {
      const { text } = req.body;
      const cleanText = (text || '').trim().slice(0, 1000);
      if (!cleanText) return res.status(400).json({ error: 'الرسالة فارغة' });

      const conversation = await db.collection('conversations').findOne({ id: req.params.id });
      if (!conversation || !conversation.participants.includes(req.user.uid)) {
        return res.status(403).json({ error: 'غير مصرح لك بالإرسال بهذه المحادثة' });
      }

      const now = Date.now();
      await db.collection('messages').insertOne({
        conversationId: req.params.id,
        senderUid: req.user.uid,
        text: cleanText,
        createdAt: now
      });
      await db.collection('conversations').updateOne({ id: req.params.id }, { $set: { lastMessageAt: now } });

      const otherUid = conversation.participants.find(uid => uid !== req.user.uid);
      if (emitToUser) {
        emitToUser(otherUid, 'newMessage', {
          conversationId: req.params.id,
          senderUid: req.user.uid,
          text: cleanText,
          createdAt: now
        });
      }

      res.status(201).json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'تعذر إرسال الرسالة' });
    }
  });
};
