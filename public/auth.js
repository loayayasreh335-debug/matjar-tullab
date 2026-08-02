// auth.js - تسجيل الدخول بجوجل عبر Firebase (مشترك بكل صفحات الموقع)

const firebaseConfig = {
  apiKey: "AIzaSyApLsgOCJKDYHwcldKZ48tveFe-Ql6HxzY",
  authDomain: "sooqna-72753.firebaseapp.com",
  projectId: "sooqna-72753",
  storageBucket: "sooqna-72753.firebasestorage.app",
  messagingSenderId: "84516889594",
  appId: "1:84516889594:web:c89594fa616caa5b60fa43",
  measurementId: "G-GD9QV020N7"
};

firebase.initializeApp(firebaseConfig);

const SESSION_KEY = 'sooqna_sessionToken';
const USER_KEY = 'sooqna_user';

function getSessionToken() {
  return localStorage.getItem(SESSION_KEY);
}
function getCurrentUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); }
  catch { return null; }
}
function isLoggedIn() {
  return Boolean(getSessionToken() && getCurrentUser());
}

function logout() {
  const token = getSessionToken();
  if (token) {
    fetch('/api/auth/logout', { method: 'POST', headers: { 'x-user-token': token } }).catch(() => {});
  }
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(USER_KEY);
  renderAuthUI();
}

async function loginWithGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    const result = await firebase.auth().signInWithPopup(provider);
    const idToken = await result.user.getIdToken();

    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'فشل تسجيل الدخول');

    localStorage.setItem(SESSION_KEY, data.sessionToken);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    renderAuthUI();
    return data.user;
  } catch (err) {
    if (err.code !== 'auth/popup-closed-by-user') {
      alert(err.message || 'فشل تسجيل الدخول، حاول مرة أخرى');
    }
    throw err;
  }
}

// تُستخدم قبل أي عملية تتطلب حساب (نشر، محادثة...)
// ترجع true فوراً لو مسجل دخول، أو تفتح نافذة تسجيل دخول وترجع false
function requireLogin(message) {
  if (isLoggedIn()) return true;
  if (confirm((message || 'لازم تسجل دخول أول عشان تكمل') + '\n\nبدك تسجل دخول بجوجل هلق؟')) {
    loginWithGoogle().then(() => {
      // بعد نجاح تسجيل الدخول، المستخدم بضغط الزر مرة ثانية
    });
  }
  return false;
}

// ---------- واجهة زر الدخول/الخروج بالهيدر ----------
function renderAuthUI() {
  const container = document.getElementById('authWidget');
  if (!container) return;

  const user = getCurrentUser();
  if (user) {
    container.innerHTML = `
      <div class="auth-user-chip" id="authUserChip" title="اضغط لتسجيل الخروج">
        <img src="${user.picture || '/logo.png'}" alt="${escapeAuthHtml(user.name)}" class="auth-avatar">
        <span class="auth-user-name">${escapeAuthHtml(user.name)}</span>
      </div>
    `;
    document.getElementById('authUserChip').addEventListener('click', () => {
      if (confirm('بدك تسجل خروج؟')) logout();
    });
  } else {
    container.innerHTML = `<button id="loginBtn" class="btn btn-ghost">🔑 تسجيل الدخول</button>`;
    document.getElementById('loginBtn').addEventListener('click', () => loginWithGoogle());
  }
}

function escapeAuthHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', renderAuthUI);
