// public/my-store.js
// صفحة مستقلة وبسيطة لصاحب المحل: يسجل دخول بجوجل من هون مباشرة،
// المنصة بتلاقيله محلاته تلقائياً (بدون ما يعرف رابط محله)، وإذا ما عنده
// محل بعد فيه فورم بسيط ينشئ فيه واحد جديد.

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function apiHeaders() {
  const token = getSessionToken();
  return { 'Content-Type': 'application/json', ...(token ? { 'x-user-token': token } : {}) };
}

const STATUS_LABELS = {
  trial: '🎁 فترة تجريبية',
  active: '✅ الاشتراك فعّال',
  expired: '⏰ الاشتراك منتهي',
  suspended: '⛔ موقوف',
};

function render() {
  const root = document.getElementById('myStoreRoot');

  if (!isLoggedIn()) {
    root.innerHTML = `
      <div class="ms-center">
        <div class="ms-card ms-login-card">
          <h1>👋 أهلاً فيك بصفحة "متجري"</h1>
          <p>سجل دخول بحسابك على جوجل عشان تدير محلك أو تنشئ واحد جديد</p>
          <button id="msLoginBtn" class="btn btn-primary">🔑 تسجيل الدخول بجوجل</button>
        </div>
      </div>
    `;
    document.getElementById('msLoginBtn').addEventListener('click', async () => {
      try {
        await loginWithGoogle();
        render();
        loadMyStores();
      } catch (err) {
        // loginWithGoogle نفسها بتعرض رسالة الخطأ لو صار شي
      }
    });
    return;
  }

  const user = getCurrentUser();
  root.innerHTML = `
    <div class="ms-header">
      <div class="ms-user-chip">
        <img src="${user.picture || ''}" alt="">
        <span>أهلاً، ${escapeHtml(user.name)}</span>
      </div>
      <button id="msLogoutBtn" class="btn btn-ghost btn-sm">خروج</button>
    </div>

    <div class="ms-content" id="msContent">
      <p class="ms-loading">جاري البحث عن محلاتك...</p>
    </div>
  `;

  document.getElementById('msLogoutBtn').addEventListener('click', () => {
    logout();
    render();
  });
}

async function loadMyStores() {
  const content = document.getElementById('msContent');
  if (!content) return;

  try {
    const res = await fetch('/api/stores/mine', { headers: apiHeaders() });
    const data = await res.json();

    if (!res.ok) {
      content.innerHTML = `<p class="ms-error">${escapeHtml(data.error || 'صار خطأ')}</p>`;
      return;
    }

    const stores = data.stores || [];

    content.innerHTML = `
      ${
        stores.length > 0
          ? `<h2 class="ms-section-title">محلاتك (${stores.length})</h2>
             <div class="ms-store-list">
               ${stores
                 .map(
                   (s) => `
                 <a class="ms-store-card" href="/store.html?slug=${s.slug}">
                   <div class="ms-store-logo">
                     ${
                       s.logoUrl
                         ? `<img src="${s.logoUrl}" alt="${escapeHtml(s.name)}">`
                         : `<span>${escapeHtml(s.name).charAt(0)}</span>`
                     }
                   </div>
                   <div class="ms-store-info">
                     <h3>${escapeHtml(s.name)} ${s.isVerified ? '✅' : ''}</h3>
                     <p>${s.role === 'owner' ? 'المالك' : 'مشرف'} · ${STATUS_LABELS[s.effectiveStatus] || ''}</p>
                   </div>
                   <span class="ms-store-arrow">‹</span>
                 </a>`
                 )
                 .join('')}
             </div>`
          : `<p class="ms-empty">ما عندك محل مسجّل بعد.</p>`
      }

      <div class="ms-card ms-create-card">
        <h2 class="ms-section-title">➕ إنشاء محل جديد</h2>
        <div id="msCreateMsg"></div>
        <input id="msName" class="ms-input" placeholder="اسم المحل">
        <input id="msSlug" class="ms-input" placeholder="رابط المحل بالإنجليزي (مثال: ahmad-store)">
        <select id="msCategory" class="ms-input">
          <option value="">اختر الفئة</option>
          <option value="ملابس وأزياء">ملابس وأزياء</option>
          <option value="مطاعم وكافيهات">مطاعم وكافيهات</option>
          <option value="إلكترونيات">إلكترونيات</option>
          <option value="خدمات">خدمات</option>
          <option value="أخرى">أخرى</option>
        </select>
        <textarea id="msDesc" class="ms-input" placeholder="وصف قصير عن المحل" rows="2"></textarea>
        <button id="msCreateBtn" class="btn btn-primary">إنشاء المحل</button>
        <p class="ms-hint">💡 بيبلش عندك شهر تجريبي مجاني، وبعدها الاشتراك 15 د.أ شهرياً.</p>
      </div>
    `;

    document.getElementById('msCreateBtn').addEventListener('click', createStore);
  } catch (err) {
    content.innerHTML = '<p class="ms-error">تعذر الاتصال بالسيرفر</p>';
  }
}

async function createStore() {
  const msg = document.getElementById('msCreateMsg');
  const name = document.getElementById('msName').value.trim();
  const slug = document
    .getElementById('msSlug')
    .value.trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-');
  const category = document.getElementById('msCategory').value;
  const description = document.getElementById('msDesc').value.trim();

  if (!name || !slug) {
    msg.innerHTML = '<p class="ms-error">اسم المحل ورابطه مطلوبين</p>';
    return;
  }

  msg.innerHTML = '<p class="ms-loading">جاري الإنشاء...</p>';

  try {
    const res = await fetch('/api/stores', {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({ name, slug, category, description }),
    });
    const data = await res.json();

    if (!res.ok) {
      msg.innerHTML = `<p class="ms-error">${escapeHtml(data.error || 'تعذر الإنشاء')}</p>`;
      return;
    }

    window.location.href = `/store.html?slug=${slug}`;
  } catch (err) {
    msg.innerHTML = '<p class="ms-error">تعذر الاتصال بالسيرفر</p>';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  render();
  if (isLoggedIn()) loadMyStores();
});
