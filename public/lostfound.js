// lostfound.js - منطق قسم المفقودات والموجودات

const itemsGrid = document.getElementById('itemsGrid');
const itemsCount = document.getElementById('itemsCount');
const emptyState = document.getElementById('emptyState');
const resolvedCounter = document.getElementById('resolvedCounter');

const filterType = document.getElementById('filterType');
const filterGovernorate = document.getElementById('filterGovernorate');
const filterCategory = document.getElementById('filterCategory');

const overlay = document.getElementById('formOverlay');
const openFormBtn = document.getElementById('openFormBtn');
const closeFormBtn = document.getElementById('closeFormBtn');
const lfForm = document.getElementById('lfForm');
const formError = document.getElementById('formError');
const categorySelect = document.getElementById('categorySelect');
const governorateSelect = document.getElementById('governorateSelect');
const areaSelect = document.getElementById('areaSelect');
const typeToggle = document.getElementById('typeToggle');
const verificationField = document.getElementById('verificationField');


const themeToggleBtn = document.getElementById('themeToggleBtn');

let jordanLocations = {};

// ---------- الوضع الليلي / الفاتح (نفس مفتاح التخزين المستخدم بالصفحة الرئيسية) ----------
const THEME_KEY = 'matjarTullab_theme';
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeToggleBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
}
function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  const preferDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved || (preferDark ? 'dark' : 'light'));
}
themeToggleBtn.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  localStorage.setItem(THEME_KEY, next);
});
initTheme();

// ---------- معرف الجهاز (نفس نمط الصفحة الرئيسية) ----------
const DEVICE_ID_KEY = 'matjarTullab_deviceId';
function getDeviceId() {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

// ---------- تخزين تذاكر ملكية منشورات المفقودات (منفصل عن إعلانات المقايضة) ----------
const LF_OWNER_TOKENS_KEY = 'sooqna_lostfound_ownerTokens';
function getLfOwnerTokens() {
  try { return JSON.parse(localStorage.getItem(LF_OWNER_TOKENS_KEY) || '{}'); }
  catch { return {}; }
}
function saveLfOwnerToken(id, token) {
  const tokens = getLfOwnerTokens();
  tokens[id] = token;
  localStorage.setItem(LF_OWNER_TOKENS_KEY, JSON.stringify(tokens));
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function formatRelativeTime(timestamp) {
  const diffMs = Date.now() - timestamp;
  const minute = 60 * 1000, hour = 60 * minute, day = 24 * hour;
  if (diffMs < hour) return 'قبل قليل';
  if (diffMs < day) {
    const hours = Math.floor(diffMs / hour);
    return `منذ ${hours} ${hours === 1 ? 'ساعة' : 'ساعات'}`;
  }
  const days = Math.floor(diffMs / day);
  if (days === 1) return 'منذ يوم';
  if (days < 7) return `منذ ${days} أيام`;
  return `منذ ${Math.floor(days / 7)} أسبوع`;
}

function buildWhatsappLink(number, itemName) {
  const message = encodeURIComponent(`مرحباً، بخصوص "${itemName}" على قسم المفقودات بسوقنا.`);
  return `https://wa.me/${number}?text=${message}`;
}

// ---------- تحميل التصنيفات والمحافظات ----------
async function loadCategories() {
  try {
    const res = await fetch('/api/lostfound/categories');
    const categories = await res.json();
    categories.forEach(cat => {
      categorySelect.appendChild(new Option(cat, cat));
      filterCategory.appendChild(new Option(cat, cat));
    });
  } catch (err) {
    console.error('فشل تحميل التصنيفات:', err);
  }
}

async function loadLocations() {
  try {
    const res = await fetch('/api/locations');
    jordanLocations = await res.json();
    Object.keys(jordanLocations).forEach(gov => {
      governorateSelect.appendChild(new Option(gov, gov));
      filterGovernorate.appendChild(new Option(gov, gov));
    });
  } catch (err) {
    console.error('فشل تحميل المحافظات:', err);
  }
}

governorateSelect.addEventListener('change', () => {
  const areas = jordanLocations[governorateSelect.value] || [];
  areaSelect.innerHTML = '';
  if (areas.length === 0) {
    areaSelect.appendChild(new Option('اختر المحافظة أولاً', ''));
    areaSelect.disabled = true;
    return;
  }
  areaSelect.appendChild(new Option('اختر المنطقة', '', true, false));
  areaSelect.options[0].disabled = true;
  areas.forEach(area => areaSelect.appendChild(new Option(area, area)));
  areaSelect.disabled = false;
});

// إظهار حقل سؤال التحقق فقط عند اختيار "وجدت إشي"
typeToggle.addEventListener('change', () => {
  const selected = typeToggle.querySelector('input[name="type"]:checked');
  const isFound = selected && selected.value === 'found';
  verificationField.style.display = isFound ? 'block' : 'none';
});

// ---------- الإحصائيات ----------
async function loadStats() {
  try {
    const res = await fetch('/api/lostfound/stats');
    const data = await res.json();
    if (typeof data.totalResolved === 'number') {
      resolvedCounter.style.display = 'inline-block';
      resolvedCounter.textContent = `✅ ${data.totalResolved} غرض تم إرجاعه لأصحابه حتى الآن`;
    }
  } catch (err) {
    console.error('فشل تحميل الإحصائيات:', err);
  }
}

// ---------- بطاقة العرض ----------
function renderCard(item) {
  const ownerTokens = getLfOwnerTokens();
  const myToken = ownerTokens[item.id];
  const isOwner = Boolean(myToken);

  const card = document.createElement('div');
  card.className = 'card' + (item.isResolved ? ' swapped' : '');

  const firstImage = item.imageUrls && item.imageUrls[0];
  const imageHtml = firstImage
    ? `<img class="card-image" src="${firstImage}" alt="${escapeHtml(item.name)}" onerror="this.remove()">`
    : `<div class="card-image placeholder">📦</div>`;

  const typeBadge = item.type === 'lost'
    ? `<span class="card-category">🔍 ضاع مني</span>`
    : `<span class="card-category">🙋‍♂️ وجدت إشي</span>`;

  const resolvedBadge = item.isResolved
    ? `<span class="swapped-badge">✅ تم الإرجاع لأصحابه</span>` : '';

  let contactHtml = '';
  if (item.isResolved) {
    contactHtml = '';
  } else {
    contactHtml = `<a class="btn-whatsapp" target="_blank" rel="noopener" href="${buildWhatsappLink(item.whatsapp, item.name)}">💬 تواصل عبر واتساب</a>`;
  }

  const ownerActionsHtml = isOwner
    ? `<div class="card-owner-actions">
         <button class="btn-swap ${item.isResolved ? 'active' : ''}" data-id="${item.id}">
           ${item.isResolved ? '↩️ إلغاء الإرجاع' : '✅ تم الإرجاع لأصحابه'}
         </button>
       </div>`
    : '';

  card.innerHTML = `
    <div class="card-image-wrap">
      ${imageHtml}
      ${resolvedBadge}
    </div>
    <div class="card-body">
      <div class="card-badges-row">
        ${typeBadge}
        <span class="card-category">📍 ${escapeHtml(item.area)}</span>
        <span class="card-category">🏷️ ${escapeHtml(item.category)}</span>
      </div>
      <h3 class="card-title">${escapeHtml(item.name)}</h3>
      <p class="card-desc">${escapeHtml(item.description)}</p>
      <div class="card-meta-row">
        <span>🕒 ${formatRelativeTime(item.createdAt)}</span>
      </div>
      ${contactHtml}
      ${ownerActionsHtml}
    </div>
  `;

  const swapBtn = card.querySelector('.btn-swap');
  if (swapBtn) swapBtn.addEventListener('click', () => toggleResolved(item.id, myToken));

  card.addEventListener('click', (e) => {
    if (e.target.closest('a, button')) return;
    window.history.pushState({}, '', '/lostfound/' + item.id);
    lfShowDetailView(item.id);
  });

  return card;
}

// ---------- جلب وعرض المنشورات ----------
async function loadItems() {
  itemsGrid.innerHTML = '';
  emptyState.style.display = 'none';

  const params = new URLSearchParams();
  if (filterType.value) params.set('type', filterType.value);
  if (filterGovernorate.value) params.set('governorate', filterGovernorate.value);
  if (filterCategory.value) params.set('category', filterCategory.value);

  try {
    const res = await fetch('/api/lostfound?' + params.toString());
    const items = await res.json();

    itemsCount.textContent = items.length ? `${items.length} منشور` : '';
    if (items.length === 0) {
      emptyState.style.display = 'block';
      return;
    }
    items.forEach(item => itemsGrid.appendChild(renderCard(item)));
  } catch (err) {
    console.error('فشل تحميل المنشورات:', err);
  }
}

[filterType, filterGovernorate, filterCategory].forEach(el => el.addEventListener('change', loadItems));

// ---------- فتح/إغلاق نافذة النشر ----------
openFormBtn.addEventListener('click', () => overlay.classList.add('active'));
closeFormBtn.addEventListener('click', () => overlay.classList.remove('active'));
overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('active'); });

// ---------- إرسال نموذج النشر ----------
lfForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  formError.textContent = '';

  const formData = new FormData(lfForm);

  try {
    const res = await fetch('/api/lostfound', {
      method: 'POST',
      headers: { 'x-device-id': getDeviceId() },
      body: formData
    });
    const data = await res.json();

    if (!res.ok) {
      formError.textContent = data.error || 'حدث خطأ، حاول مرة أخرى';
      return;
    }

    saveLfOwnerToken(data.id, data.ownerToken);
    lfForm.reset();
    verificationField.style.display = 'none';
    overlay.classList.remove('active');
    loadItems();
    loadStats();
  } catch (err) {
    formError.textContent = 'تعذر الاتصال بالسيرفر، تأكد من اتصالك بالإنترنت';
  }
});

// ---------- تعليم منشور كـ "تم الإرجاع" ----------
async function toggleResolved(id, ownerToken) {
  try {
    const res = await fetch(`/api/lostfound/${id}/resolve`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerToken })
    });
    if (!res.ok) throw new Error('تعذر تحديث الحالة');
    loadItems();
    loadStats();
  } catch (err) {
    alert(err.message);
  }
}

// ---------- نافذة سؤال التحقق ----------

// ---------- بدء التشغيل ----------
loadCategories();
loadLocations();
loadStats();
lfHandleRouting();

// ---------- نافذة التفاصيل ----------
const lfHomeView = document.getElementById('lfHomeView');
const lfDetailView = document.getElementById('lfDetailView');

function lfShowHomeView() {
  lfHomeView.style.display = '';
  lfDetailView.style.display = 'none';
}

function lfShowDetailView(itemId) {
  lfHomeView.style.display = 'none';
  lfDetailView.style.display = 'block';
  lfLoadItemDetail(itemId);
}

function lfHandleRouting() {
  const m = window.location.pathname.match(/^\/lostfound\/(.+)$/);
  if (m) {
    lfShowDetailView(decodeURIComponent(m[1]));
  } else {
    lfShowHomeView();
  }
}

window.addEventListener('popstate', lfHandleRouting);
async function lfLoadItemDetail(itemId) {
  try {
    const res = await fetch(`/api/lostfound/${itemId}`);
    const data = await res.json();
    if (!res.ok) {
      lfDetailView.innerHTML = `
        <button class="btn-ghost" id="lfBackBtn">→ رجوع لكل المفقودات والموجودات</button>
        <div class="empty-state"><p>${escapeHtml(data.error || 'العنصر غير موجود')}</p></div>
      `;
      document.getElementById('lfBackBtn').addEventListener('click', () => {
        window.history.pushState({}, '', '/lostfound.html');
        lfShowHomeView();
      });
      return;
    }
    lfRenderItemDetail(data);
  } catch (err) {
    console.error('lfLoadItemDetail error:', err);
  }
}

function lfRenderItemDetail(item) {
  const ownerTokens = getOwnerTokens();
  const myToken = ownerTokens[item.id];
  const isOwner = Boolean(myToken);
  const images = (item.imageUrls && item.imageUrls.length) ? item.imageUrls : [null];

  const mainImageHtml = images[0]
    ? `<img class="detail-main-image" id="lfDetailMainImage" src="${images[0]}" alt="${escapeHtml(item.name)}">`
    : `<div class="detail-main-image placeholder" id="lfDetailMainImage">📦</div>`;

  const dotsHtml = images.length > 1
    ? `<div class="detail-dots">${images.map((img, i) =>
        `<button class="detail-dot ${i === 0 ? 'active' : ''}" data-index="${i}"></button>`).join('')}</div>`
    : '';

  const typeBadge = item.type === 'lost'
    ? `<span class="card-category">🔍 فقدت إشي</span>`
    : `<span class="card-category">🙋‍♂️ وجدت إشي</span>`;

  const resolvedNote = item.isResolved
    ? `<div class="card-trade" style="background:#fdecec; color:#c62828;">✅ تم الإرجاع لأصحابه ولم يعد متاحاً</div>`
    : '';

  let contactHtml = '';
  if (item.isResolved) {
    contactHtml = '';
  } else {
    contactHtml = `<a class="btn-whatsapp" target="_blank" rel="noopener" href="${buildWhatsappLink(item.whatsapp, item.name)}">💬 تواصل عبر واتساب</a>`;
  }

  let chatBtnHtml = '';
  if (!item.isResolved && item.ownerUid && !isOwner) {
    chatBtnHtml = `<button class="btn-chat" onclick="lfOpenChat('${item.id}', '${encodeURIComponent(item.name)}', '${item.ownerUid}')">💬 محادثة</button>`;
  }

  const ownerActionsHtml = isOwner
    ? `<div class="card-owner-actions">
         <button class="btn-swap ${item.isResolved ? 'active' : ''}" id="lfDetailResolveBtn">
           ${item.isResolved ? '↩️ إلغاء الإرجاع' : '✅ تم الإرجاع لأصحابه'}
         </button>
       </div>`
    : '';

  lfDetailView.innerHTML = `
    <button class="btn-ghost" id="lfBackBtn">→ رجوع لكل المفقودات والموجودات</button>
    <div class="item-detail">
      <div class="detail-gallery">
        ${mainImageHtml}
        ${dotsHtml}
      </div>
      <div class="detail-body">
        <div class="card-badges-row">
          ${typeBadge}
          <span class="card-category">📍 ${escapeHtml(item.area)}</span>
          <span class="card-category">🏷️ ${escapeHtml(item.category)}</span>
        </div>
        <h1 class="detail-title">${escapeHtml(item.name)}</h1>
        <p class="detail-desc">${escapeHtml(item.description)}</p>
        ${resolvedNote}
        <div class="detail-meta">
          <span>🕒 ${formatRelativeTime(item.createdAt)}</span>
        </div>
        <div class="card-actions-row">
          ${contactHtml}
          ${chatBtnHtml}
          <button class="btn-share" id="lfDetailShareBtn">🔗 مشاركة</button>
          <button class="btn-copy-link" id="lfDetailCopyLinkBtn">📋 نسخ الرابط</button>
        </div>
        ${ownerActionsHtml}
      </div>
    </div>
  `;

  const dotButtons = lfDetailView.querySelectorAll('.detail-dot');
  const mainImageEl = document.getElementById('lfDetailMainImage');
  dotButtons.forEach(dot => {
    dot.addEventListener('click', () => {
      const idx = parseInt(dot.dataset.index, 10);
      if (mainImageEl.tagName === 'IMG') mainImageEl.src = images[idx];
      dotButtons.forEach(d => d.classList.remove('active'));
      dot.classList.add('active');
    });
  });

  document.getElementById('lfBackBtn').addEventListener('click', () => {
    window.history.pushState({}, '', '/lostfound.html');
    lfShowHomeView();
  });

  document.getElementById('lfDetailShareBtn').addEventListener('click', () => lfShareItem(item));
  const copyBtn = document.getElementById('lfDetailCopyLinkBtn');
  copyBtn.addEventListener('click', () => lfCopyItemLink(item.id, copyBtn));

  const resolveBtn = document.getElementById('lfDetailResolveBtn');
  if (resolveBtn) {
    resolveBtn.addEventListener('click', async () => {
      try {
        await toggleResolved(item.id, myToken);
        lfLoadItemDetail(item.id);
      } catch (err) {}
    });
  }
}

function lfOpenChat(itemId, encodedName, ownerUid) {
  const itemName = decodeURIComponent(encodedName);
  startChatWith({ itemType: 'lostfound', itemId, itemName, otherUid: ownerUid });
}

function lfBuildItemUrl(itemId) {
  return `${window.location.origin}/lostfound/${itemId}`;
}

async function lfShareItem(item) {
  const url = lfBuildItemUrl(item.id);
  const text = `${item.name} - على سوقنا`;
  if (navigator.share) {
    try { await navigator.share({ title: item.name, text, url }); } catch (e) {}
  } else {
    window.open(`https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`, '_blank');
  }
}

async function lfCopyItemLink(itemId, btnEl) {
  try {
    await navigator.clipboard.writeText(lfBuildItemUrl(itemId));
    const original = btnEl.textContent;
    btnEl.textContent = '✅ تم النسخ';
    setTimeout(() => (btnEl.textContent = original), 1500);
  } catch (e) {
    alert('تعذر نسخ الرابط');
  }
}
