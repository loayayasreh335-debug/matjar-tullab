// chat.js - شات داخلي بسيط (Polling كل 4 ثواني) - يحتاج تسجيل دخول من auth.js
// للاستخدام: ضيف <div id="chatRoot"></div> بأي صفحة، وملف auth.js لازم يكون محمّل قبله

let chatPollInterval = null;
let currentConversationId = null;
let chatSocket = null;

function initChatSocket() {
  const me = getCurrentUser();
  if (!me || !me.uid) return;
  if (chatSocket) return;
  chatSocket = io();
  chatSocket.on('connect', () => {
    chatSocket.emit('register', me.uid);
  });
  chatSocket.on('newMessage', (msg) => {
    if (msg.conversationId === currentConversationId) {
      const me2 = getCurrentUser();
      const box = document.getElementById('chatMessages');
      if (box) {
        const bubble = document.createElement('div');
        bubble.className = 'chat-bubble ' + (msg.senderUid === me2.uid ? 'mine' : 'theirs');
        bubble.textContent = msg.text;
        box.appendChild(bubble);
        box.scrollTop = box.scrollHeight;
      }
    } else {
      const fab = document.getElementById('chatFab');
      if (fab) fab.classList.add('has-unread');
    }
  });
}

function chatHeaders() {
  return { 'Content-Type': 'application/json', 'x-user-token': getSessionToken() };
}

function initChatWidget() {
  const root = document.getElementById('chatRoot');
  if (!root) return;

  root.innerHTML = `
    <button id="chatFab" class="chat-fab" title="محادثاتي">💬</button>
    <div id="chatPanel" class="chat-panel">
      <div class="chat-panel-header">
        <button id="chatBackBtn" class="btn-close" style="display:none;">→</button>
        <span id="chatPanelTitle">محادثاتي</span>
        <button id="chatCloseBtn" class="btn-close">✕</button>
      </div>
      <div id="chatListView" class="chat-list"></div>
      <div id="chatConvoView" class="chat-convo" style="display:none;">
        <div id="chatMessages" class="chat-messages"></div>
        <form id="chatSendForm" class="chat-send-form">
          <input id="chatInput" type="text" placeholder="اكتب رسالة..." autocomplete="off" required>
          <button type="submit" class="btn btn-primary">إرسال</button>
        </form>
      </div>
    </div>
  `;

  initChatSocket();
  document.getElementById('chatFab').addEventListener('click', openChatList);
  document.getElementById('chatCloseBtn').addEventListener('click', closeChatPanel);
  document.getElementById('chatBackBtn').addEventListener('click', openChatList);
  document.getElementById('chatSendForm').addEventListener('submit', sendChatMessage);
}

function closeChatPanel() {
  document.getElementById('chatPanel').classList.remove('active');
  if (chatPollInterval) clearInterval(chatPollInterval);
}

async function openChatList() {
  if (!requireLogin('لازم تسجل دخول لتشوف محادثاتك')) return;
  const fab = document.getElementById('chatFab');
  if (fab) fab.classList.remove('has-unread');

  document.getElementById('chatPanel').classList.add('active');
  document.getElementById('chatListView').style.display = 'block';
  document.getElementById('chatConvoView').style.display = 'none';
  document.getElementById('chatBackBtn').style.display = 'none';
  document.getElementById('chatPanelTitle').textContent = 'محادثاتي';
  if (chatPollInterval) clearInterval(chatPollInterval);

  try {
    const res = await fetch('/api/chat/conversations', { headers: chatHeaders() });
    const conversations = await res.json();
    const listEl = document.getElementById('chatListView');

    if (!conversations.length) {
      listEl.innerHTML = '<p class="support-text" style="text-align:center;padding:20px;">ما عندك محادثات بعد</p>';
      return;
    }

    listEl.innerHTML = conversations.map(c => `
      <div class="chat-list-item" data-id="${c.id}">
        <img src="${c.otherUser.picture || '/logo.png'}" class="auth-avatar">
        <div class="chat-list-item-body">
          <div class="chat-list-item-name">${escapeHtmlChat(c.otherUser.name)}</div>
          <div class="chat-list-item-preview">${escapeHtmlChat(c.itemName)}</div>
        </div>
      </div>
    `).join('');

    listEl.querySelectorAll('.chat-list-item').forEach(el => {
      el.addEventListener('click', () => openConversation(el.dataset.id));
    });
  } catch (err) {
    console.error(err);
  }
}

async function openConversation(conversationId) {
  currentConversationId = conversationId;
  document.getElementById('chatListView').style.display = 'none';
  document.getElementById('chatConvoView').style.display = 'flex';
  document.getElementById('chatBackBtn').style.display = 'inline-block';
  document.getElementById('chatPanelTitle').textContent = 'محادثة';

  await loadMessages();
  if (chatPollInterval) clearInterval(chatPollInterval);
  chatPollInterval = setInterval(loadMessages, 4000);
}

async function loadMessages() {
  if (!currentConversationId) return;
  try {
    const res = await fetch(`/api/chat/${currentConversationId}/messages`, { headers: chatHeaders() });
    const messages = await res.json();
    const me = getCurrentUser();
    const box = document.getElementById('chatMessages');
    box.innerHTML = messages.map(m => `
      <div class="chat-bubble ${m.senderUid === me.uid ? 'mine' : 'theirs'}">${escapeHtmlChat(m.text)}</div>
    `).join('');
    box.scrollTop = box.scrollHeight;
  } catch (err) {
    console.error(err);
  }
}

async function sendChatMessage(e) {
  e.preventDefault();
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text || !currentConversationId) return;
  input.value = '';

  try {
    await fetch(`/api/chat/${currentConversationId}/messages`, {
      method: 'POST',
      headers: chatHeaders(),
      body: JSON.stringify({ text })
    });
    loadMessages();
  } catch (err) {
    console.error(err);
  }
}

// تُستدعى من أي صفحة عند الضغط على زر "تواصل" بمنشور معيّن
async function startChatWith({ itemType, itemId, itemName, otherUid }) {
  if (!requireLogin('لازم تسجل دخول عشان تبدأ محادثة')) return;
  if (!otherUid) { alert('تعذر تحديد الطرف الآخر'); return; }

  try {
    const res = await fetch('/api/chat/start', {
      method: 'POST',
      headers: chatHeaders(),
      body: JSON.stringify({ itemType, itemId, itemName, otherUid })
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || 'تعذر بدء المحادثة'); return; }

    document.getElementById('chatPanel').classList.add('active');
    openConversation(data.id);
  } catch (err) {
    alert('تعذر بدء المحادثة');
  }
}

function escapeHtmlChat(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', initChatWidget);
