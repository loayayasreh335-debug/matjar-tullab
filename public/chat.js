// chat.js - يُحمّل بكل صفحات الموقع (نفس مكان تحميله القديم)
// دوره الوحيد هلق: يحدّث النقطة الحمرا بزر "المحادثات" بشريط التنقل،
// ويبدأ محادثة جديدة (زر "تواصل" بأي منشور) ويحوّلك مباشرة لصفحة /chat.html
// الصفحة الكاملة نفسها (list + رسائل) موجودة بملف chat-page.js على حدة

let chatSocket = null;

function initChatSocket() {
  const me = getCurrentUser();
  if (!me || !me.uid) return;
  if (chatSocket) return;
  chatSocket = io();
  chatSocket.on('connect', () => {
    chatSocket.emit('register', me.uid);
  });
  chatSocket.on('newMessage', () => {
    // أي رسالة جديدة (من أي محادثة) — نحدّث النقطة الحمرا فوراً
    updateChatBadge();
  });
}

function chatHeaders() {
  return { 'Content-Type': 'application/json', 'x-user-token': getSessionToken() };
}

async function updateChatBadge() {
  if (!isLoggedIn()) return;
  const dot = document.getElementById('chatUnreadDot');
  if (!dot) return;
  try {
    const res = await fetch('/api/chat/unread-count', { headers: chatHeaders() });
    const data = await res.json();
    dot.style.display = data.count > 0 ? 'inline-block' : 'none';
  } catch (err) {
    // تجاهل بصمت، النقطة تبقى بحالتها الحالية
  }
}

// تُستدعى من أي صفحة عند الضغط على زر "تواصل" بمنشور معيّن (متل ما كانت قبل)
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

    window.location.href = `/chat.html?conv=${data.id}`;
  } catch (err) {
    alert('تعذر بدء المحادثة');
  }
}

function initChatNav() {
  const navChatBtn = document.getElementById('navChatBtn');
  if (navChatBtn) {
    navChatBtn.addEventListener('click', () => {
      window.location.href = '/chat.html';
    });
  }
  if (isLoggedIn()) {
    initChatSocket();
    updateChatBadge();
    setInterval(updateChatBadge, 20000); // احتياط لو انقطع socket
  }
}

document.addEventListener('DOMContentLoaded', initChatNav);
