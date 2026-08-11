// public/chat-page.js
// صفحة الشات الكاملة (بديل الفقاعة العائمة القديمة)
// يدعم فتح محادثة مباشرة عبر /chat.html?conv=CONVERSATION_ID

let socket = null;
let currentConvId = new URLSearchParams(window.location.search).get('conv');
let pollInterval = null;

function chatHeaders() {
  return { 'Content-Type': 'application/json', 'x-user-token': getSessionToken() };
}

function escapeHtmlChat(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function timeLabel(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString('ar-JO', { hour: '2-digit', minute: '2-digit' });
}

function renderShell() {
  const root = document.getElementById('chatPageRoot');
  root.innerHTML = `
    <div class="chat-page">
      <div class="chat-list-panel" id="chatListPanel">
        <div class="chat-page-header">
          <a href="/" class="chat-back-home">←</a>
          <h1>المحادثات</h1>
        </div>
        <div id="chatListView" class="chat-list"></div>
      </div>

      <div class="chat-convo-panel" id="chatConvoPanel">
        <div class="chat-page-header">
          <button id="chatBackToList" class="chat-back-btn">←</button>
          <div class="chat-convo-title" id="chatConvoTitle">اختر محادثة</div>
        </div>
        <div id="chatMessages" class="chat-messages"></div>
        <form id="chatSendForm" class="chat-send-form">
          <input id="chatInput" type="text" placeholder="اكتب رسالة..." autocomplete="off" required>
          <button type="submit" class="btn-send">➤</button>
        </form>
      </div>
    </div>
  `;

  document.getElementById('chatBackToList').addEventListener('click', showListOnMobile);
  document.getElementById('chatSendForm').addEventListener('submit', sendMessage);
}

function showListOnMobile() {
  document.getElementById('chatPageRoot').classList.remove('convo-active');
}

function initSocket() {
  const me = getCurrentUser();
  if (!me) return;
  socket = io();
  socket.on('connect', () => socket.emit('register', me.uid));
  socket.on('newMessage', (msg) => {
    if (msg.conversationId === currentConvId) {
      loadMessages(currentConvId, true);
    }
    loadConversationList();
  });
}

async function loadConversationList() {
  const listEl = document.getElementById('chatListView');
  try {
    const res = await fetch('/api/chat/conversations', { headers: chatHeaders() });
    const conversations = await res.json();

    if (!conversations.length) {
      listEl.innerHTML = '<p class="chat-empty">ما عندك محادثات بعد</p>';
      return;
    }

    listEl.innerHTML = conversations.map(c => `
      <div class="chat-list-item ${c.id === currentConvId ? 'active' : ''}" data-id="${c.id}" data-name="${escapeHtmlChat(c.otherUser.name)}">
        <img src="${c.otherUser.picture || '/logo-icon.png'}" class="chat-avatar">
        <div class="chat-list-item-body">
          <div class="chat-list-item-top">
            <span class="chat-list-item-name">${escapeHtmlChat(c.otherUser.name)}</span>
            ${c.lastMessageAt ? `<span class="chat-list-item-time">${timeLabel(c.lastMessageAt)}</span>` : ''}
          </div>
          <div class="chat-list-item-preview-row">
            <span class="chat-list-item-preview">${escapeHtmlChat(c.lastMessageText || c.itemName || 'بدون رسائل بعد')}</span>
            ${c.unreadCount > 0 ? `<span class="chat-unread-badge">${c.unreadCount}</span>` : ''}
          </div>
        </div>
      </div>
    `).join('');

    listEl.querySelectorAll('.chat-list-item').forEach(el => {
      el.addEventListener('click', () => openConversation(el.dataset.id, el.dataset.name));
    });
  } catch (err) {
    listEl.innerHTML = '<p class="chat-empty">تعذر تحميل المحادثات</p>';
  }
}

async function openConversation(id, name) {
  currentConvId = id;
  window.history.replaceState({}, '', `/chat.html?conv=${id}`);
  document.getElementById('chatPageRoot').classList.add('convo-active');
  document.getElementById('chatConvoTitle').textContent = name || 'محادثة';

  document.querySelectorAll('.chat-list-item').forEach(el => {
    el.classList.toggle('active', el.dataset.id === id);
  });

  await loadMessages(id);
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(() => loadMessages(id, true), 4000);
}

async function loadMessages(id, silent) {
  const box = document.getElementById('chatMessages');
  if (!silent) box.innerHTML = '<p class="chat-loading">جاري التحميل...</p>';

  try {
    const res = await fetch(`/api/chat/${id}/messages`, { headers: chatHeaders() });
    const messages = await res.json();
    const me = getCurrentUser();

    box.innerHTML = messages.map(m => {
      const mine = m.senderUid === me.uid;
      const tick = mine ? (m.readAt ? '✓✓' : '✓') : '';
      return `
        <div class="chat-bubble-row ${mine ? 'mine' : 'theirs'}">
          <div class="chat-bubble">
            <span class="chat-bubble-text">${escapeHtmlChat(m.text)}</span>
            <span class="chat-bubble-meta">
              ${timeLabel(m.createdAt)}
              ${mine ? `<span class="chat-tick ${m.readAt ? 'seen' : ''}">${tick}</span>` : ''}
            </span>
          </div>
        </div>
      `;
    }).join('');
    box.scrollTop = box.scrollHeight;

    loadConversationList(); // نحدّث النقطة/العداد بالقائمة بعد ما صارت مقروءة
    if (typeof updateChatBadge === 'function') updateChatBadge();
  } catch (err) {
    if (!silent) box.innerHTML = '<p class="chat-empty">تعذر تحميل الرسائل</p>';
  }
}

async function sendMessage(e) {
  e.preventDefault();
  if (!currentConvId) return;
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';

  try {
    await fetch(`/api/chat/${currentConvId}/messages`, {
      method: 'POST',
      headers: chatHeaders(),
      body: JSON.stringify({ text })
    });
    loadMessages(currentConvId, true);
  } catch (err) {
    alert('تعذر إرسال الرسالة');
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  if (!isLoggedIn()) {
    document.getElementById('chatPageRoot').innerHTML = `
      <div class="chat-login-prompt">
        <h1>🔑 سجل دخول أول</h1>
        <p>لازم تسجل دخول عشان تشوف محادثاتك</p>
        <button id="chatLoginBtn" class="btn-send" style="width:auto;padding:10px 24px;">تسجيل الدخول بجوجل</button>
      </div>
    `;
    document.getElementById('chatLoginBtn').addEventListener('click', async () => {
      await loginWithGoogle();
      window.location.reload();
    });
    return;
  }

  renderShell();
  initSocket();
  await loadConversationList();

  if (currentConvId) {
    // لو دخلنا مباشرة برابط فيه ?conv=، بنفتحها فوراً (اسم الطرف الآخر
    // رح يتحدث تلقائياً بعد ما تحمل القائمة أعلاه)
    const item = document.querySelector(`.chat-list-item[data-id="${currentConvId}"]`);
    openConversation(currentConvId, item ? item.dataset.name : '');
  }
});
