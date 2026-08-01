// script.js - منطق الواجهة الأمامية

// ---------- عناصر DOM ----------
const homeView = document.getElementById('homeView');
const heroSection = document.getElementById('heroSection');
const itemDetailView = document.getElementById('itemDetailView');

const itemsGrid = document.getElementById('itemsGrid');
const itemsCount = document.getElementById('itemsCount');
const emptyState = document.getElementById('emptyState');

const searchInput = document.getElementById('searchInput');
const filterUniversity = document.getElementById('filterUniversity');
const filterCategory = document.getElementById('filterCategory');
const filterGovernorate = document.getElementById('filterGovernorate');
const myAdsBtn = document.getElementById('myAdsBtn');

const overlay = document.getElementById('formOverlay');
const openFormBtn = document.getElementById('openFormBtn');
const closeFormBtn = document.getElementById('closeFormBtn');
const itemForm = document.getElementById('itemForm');
const formError = document.getElementById('formError');
const universitySelect = document.getElementById('universitySelect');
const universityField = document.getElementById('universityField');
const gameTypeSelect = document.getElementById('gameTypeSelect');
const gameTypeField = document.getElementById('gameTypeField');
const governorateSelect = document.getElementById('governorateSelect');
const areaSelect = document.getElementById('areaSelect');
const categorySelect = document.getElementById('categorySelect');
const riskyCategoryWarning = document.getElementById('riskyCategoryWarning');

let riskyCategories = [];
let jordanLocations = {};

// التصنيفات التي يظهر لها حقل اختيار الجامعة (لأنها مرتبطة بالمواد الدراسية)
const UNIVERSITY_RELATED_CATEGORIES = ['كتب دراسية', 'قرطاسية وأدوات مكتبية'];

// التصنيفات التي يظهر لها حقل اختيار نوع اللعبة
const GAME_RELATED_CATEGORIES = ['حسابات ألعاب'];

const supportOverlay = document.getElementById('supportOverlay');
const openSupportBtn = document.getElementById('openSupportBtn');
const openSupportBtnFooter = document.getElementById('openSupportBtnFooter');
const closeSupportBtn = document.getElementById('closeSupportBtn');
const copyWalletBtn = document.getElementById('copyWalletBtn');
const walletNumber = document.getElementById('walletNumber');

const aboutOverlay = document.getElementById('aboutOverlay');
const openAboutBtn = document.getElementById('openAboutBtn');
const closeAboutBtn = document.getElementById('closeAboutBtn');

const themeToggleBtn = document.getElementById('themeToggleBtn');
const statsCounter = document.getElementById('statsCounter');
const developerWhatsappLink = document.getElementById('developerWhatsappLink');

const welcomeOverlay = document.getElementById('welcomeOverlay');
const closeWelcomeBtn = document.getElementById('closeWelcomeBtn');

// ---------- الحالة العامة ----------
let itemsCache = [];
let showOnlyMine = false;

// ---------- الوضع الليلي / الفاتح ----------
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

// ---------- نافذة الترحيب (تظهر مرة واحدة فقط لكل جهاز) ----------
const WELCOME_SEEN_KEY = 'matjarTullab_welcomeSeen';

function maybeShowWelcome() {
  if (!localStorage.getItem(WELCOME_SEEN_KEY)) {
    welcomeOverlay.classList.add('active');
  }
}

closeWelcomeBtn.addEventListener('click', () => {
  welcomeOverlay.classList.remove('active');
  localStorage.setItem(WELCOME_SEEN_KEY, '1');
});

// ---------- تحميل بيانات التواصل مع المطور والإحصائيات ----------
async function loadDeveloperContact() {
  try {
    const res = await fetch('/api/developer-contact');
    const data = await res.json();
    if (data.whatsapp) {
      developerWhatsappLink.href = `https://wa.me/${data.whatsapp}?text=${encodeURIComponent('مرحباً، عندي استفسار/اقتراح بخصوص متجر الطلاب')}`;
    }
  } catch (err) {
    console.error('فشل تحميل بيانات التواصل:', err);
  }
}

async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();
    if (typeof data.totalItems === 'number') {
      statsCounter.style.display = 'inline-block';
      statsCounter.textContent = `📦 ${data.totalItems} غرض منشور حتى الآن`;
    }
  } catch (err) {
    console.error('فشل تحميل الإحصائيات:', err);
  }
}

// ---------- سكيلتون التحميل ----------
function renderSkeletons(count = 6) {
  itemsGrid.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const sk = document.createElement('div');
    sk.className = 'skeleton-card';
    sk.innerHTML = `
      <div class="skeleton-block skeleton-image"></div>
      <div class="skeleton-block skeleton-line"></div>
      <div class="skeleton-block skeleton-line short"></div>
      <div class="skeleton-block skeleton-line"></div>
    `;
    itemsGrid.appendChild(sk);
  }
}

// ---------- نسخ رابط ومشاركة والإبلاغ ----------
async function copyItemLink(itemId, btnEl) {
  try {
    await navigator.clipboard.writeText(buildItemUrl(itemId));
    const original = btnEl.textContent;
    btnEl.textContent = 'تم النسخ ✓';
    setTimeout(() => (btnEl.textContent = original), 1500);
  } catch {
    alert('تعذر نسخ الرابط تلقائياً، يمكنك نسخه يدوياً من شريط العنوان بعد فتح الإعلان');
  }
}

async function reportItem(itemId) {
  const reason = prompt('ما سبب الإبلاغ عن هذا الإعلان؟ (مثال: إعلان وهمي، محتوى مخالف...)');
  if (reason === null) return; // المستخدم ألغى

  try {
    const res = await fetch(`/api/items/${itemId}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });
    if (!res.ok) throw new Error('تعذر إرسال البلاغ');
    alert('تم استلام بلاغك، شكراً لمساعدتك في الحفاظ على جودة المنصة 🙏');
  } catch (err) {
    alert(err.message);
  }
}


const OWNER_TOKENS_KEY = 'matjarTullab_ownerTokens';

function getOwnerTokens() {
  try {
    return JSON.parse(localStorage.getItem(OWNER_TOKENS_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveOwnerToken(itemId, token) {
  const tokens = getOwnerTokens();
  tokens[itemId] = token;
  localStorage.setItem(OWNER_TOKENS_KEY, JSON.stringify(tokens));
}

function removeOwnerToken(itemId) {
  const tokens = getOwnerTokens();
  delete tokens[itemId];
  localStorage.setItem(OWNER_TOKENS_KEY, JSON.stringify(tokens));
}

// ---------- فتح وإغلاق النوافذ المنبثقة ----------
openFormBtn.addEventListener('click', () => overlay.classList.add('active'));
closeFormBtn.addEventListener('click', () => overlay.classList.remove('active'));
overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('active'); });

function openSupportModal() { supportOverlay.classList.add('active'); }
openSupportBtn.addEventListener('click', openSupportModal);
openSupportBtnFooter.addEventListener('click', openSupportModal);
closeSupportBtn.addEventListener('click', () => supportOverlay.classList.remove('active'));
supportOverlay.addEventListener('click', (e) => { if (e.target === supportOverlay) supportOverlay.classList.remove('active'); });

openAboutBtn.addEventListener('click', () => aboutOverlay.classList.add('active'));
closeAboutBtn.addEventListener('click', () => aboutOverlay.classList.remove('active'));
aboutOverlay.addEventListener('click', (e) => { if (e.target === aboutOverlay) aboutOverlay.classList.remove('active'); });

copyWalletBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(walletNumber.textContent.trim());
    copyWalletBtn.textContent = 'تم النسخ ✓';
    setTimeout(() => (copyWalletBtn.textContent = 'نسخ'), 1500);
  } catch {
    // فشل النسخ التلقائي (متصفحات قديمة) - لا حاجة لفعل شيء إضافي
  }
});

// ---------- إظهار/إخفاء حقل الجامعة، نوع اللعبة، وتحذير الأمان حسب التصنيف المختار ----------
function updateUniversityFieldVisibility() {
  const selectedCategory = categorySelect.value;

  const shouldShowUniversity = UNIVERSITY_RELATED_CATEGORIES.includes(selectedCategory);
  universityField.style.display = shouldShowUniversity ? 'flex' : 'none';
  universitySelect.required = shouldShowUniversity;
  if (!shouldShowUniversity) universitySelect.value = '';

  const shouldShowGameType = GAME_RELATED_CATEGORIES.includes(selectedCategory);
  gameTypeField.style.display = shouldShowGameType ? 'flex' : 'none';
  gameTypeSelect.required = shouldShowGameType;
  if (!shouldShowGameType) gameTypeSelect.value = '';

  riskyCategoryWarning.style.display = riskyCategories.includes(selectedCategory) ? 'block' : 'none';
}

categorySelect.addEventListener('change', updateUniversityFieldVisibility);

async function loadRiskyCategories() {
  try {
    const res = await fetch('/api/risky-categories');
    riskyCategories = await res.json();
  } catch (err) {
    console.error('فشل تحميل قائمة التصنيفات الحساسة:', err);
  }
}

// ---------- معرف الجهاز (لحد النشر اليومي، غير مرتبط بأي بيانات شخصية) ----------
const DEVICE_ID_KEY = 'matjarTullab_deviceId';

function getDeviceId() {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

// ---------- ضغط الصور بالمتصفح قبل الرفع (لتوفير مساحة التخزين على الاستضافة) ----------
function compressImage(file, maxWidth = 1280, quality = 0.72) {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/')) {
      resolve(file);
      return;
    }

    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(
          (blob) => {
            if (!blob) { resolve(file); return; }
            resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = () => resolve(file);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

// ---------- تحميل الجامعات والتصنيفات (لحقول النموذج وفلاتر البحث) ----------
async function loadUniversities() {
  try {
    const res = await fetch('/api/universities');
    const universities = await res.json();
    universities.forEach(uni => {
      universitySelect.appendChild(new Option(uni, uni));
      filterUniversity.appendChild(new Option(uni, uni));
    });
  } catch (err) {
    console.error('فشل تحميل قائمة الجامعات:', err);
  }
}

async function loadGameTypes() {
  try {
    const res = await fetch('/api/game-types');
    const gameTypes = await res.json();
    gameTypes.forEach(game => {
      gameTypeSelect.appendChild(new Option(game, game));
    });
  } catch (err) {
    console.error('فشل تحميل قائمة الألعاب:', err);
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
    console.error('فشل تحميل قائمة المحافظات:', err);
  }
}

// تحديث قائمة المناطق تلقائياً بناءً على المحافظة المختارة بالنموذج
governorateSelect.addEventListener('change', () => {
  const selectedGov = governorateSelect.value;
  const areas = jordanLocations[selectedGov] || [];

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

async function loadCategories() {
  try {
    const res = await fetch('/api/categories');
    const categories = await res.json();
    categories.forEach(cat => {
      categorySelect.appendChild(new Option(cat, cat));
      filterCategory.appendChild(new Option(cat, cat));
    });
  } catch (err) {
    console.error('فشل تحميل التصنيفات:', err);
  }
}

// ---------- أدوات مساعدة ----------
// دالة عامة: عند فشل تحميل أي صورة (رابط قديم مكسور، حذف من Cloudinary، إلخ)
// تستبدلها تلقائياً بصندوق نائب أنيق بدل أيقونة الصورة المكسورة الافتراضية بالمتصفح
function handleImageError(imgEl) {
  const wrap = imgEl.parentElement;
  const isDetail = imgEl.classList.contains('detail-main-image');
  imgEl.remove();
  const placeholder = document.createElement('div');
  placeholder.className = isDetail ? 'detail-main-image placeholder' : 'card-image placeholder';
  placeholder.textContent = '📦';
  wrap.prepend(placeholder);
}
window.handleImageError = handleImageError;

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function buildWhatsappLink(number, itemName) {
  const message = encodeURIComponent(`مرحباً، أنا مهتم بمقايضة "${itemName}" الذي عرضته في متجر الطلاب.`);
  return `https://wa.me/${number}?text=${message}`;
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
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `منذ ${weeks} ${weeks === 1 ? 'أسبوع' : 'أسابيع'}`;
  const monthsAgo = Math.floor(days / 30);
  return `منذ ${monthsAgo} ${monthsAgo === 1 ? 'شهر' : 'أشهر'}`;
}

function buildItemUrl(itemId) {
  return `${window.location.origin}/item/${itemId}`;
}

async function shareItem(item) {
  const url = buildItemUrl(item.id);
  const text = `شاهد "${item.name}" على متجر الطلاب - متاح للمقايضة`;

  if (navigator.share) {
    try {
      await navigator.share({ title: item.name, text, url });
    } catch {
      // المستخدم ألغى المشاركة، لا حاجة لفعل شيء
    }
  } else {
    // بديل: فتح مشاركة واتساب مباشرة
    const waLink = `https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`;
    window.open(waLink, '_blank');
  }
}

// ---------- بطاقة عرض غرض واحد بالشبكة الرئيسية ----------
function renderCard(item) {
  const ownerTokens = getOwnerTokens();
  const myToken = ownerTokens[item.id];
  const isOwner = Boolean(myToken);

  const card = document.createElement('div');
  card.className = 'card' + (item.isSwapped ? ' swapped' : '');

  const firstImage = item.imageUrls && item.imageUrls[0];
  const imageHtml = firstImage
    ? `<img class="card-image" src="${firstImage}" alt="${escapeHtml(item.name)}" onerror="handleImageError(this)">`
    : `<div class="card-image placeholder">📦</div>`;

  const imageCountBadge = item.imageUrls && item.imageUrls.length > 1
    ? `<span class="image-count-badge">📷 ${item.imageUrls.length}</span>` : '';

  const doneLabel = item.adType === 'sell' ? 'تم البيع' : 'تمت المقايضة';
  const swappedBadge = item.isSwapped ? `<span class="swapped-badge">✅ ${doneLabel}</span>` : '';

  const whatsappHtml = item.isSwapped
    ? ''
    : `<a class="btn-whatsapp" target="_blank" rel="noopener" href="${buildWhatsappLink(item.whatsapp, item.name)}">
         💬 تواصل عبر واتساب
       </a>`;


  const ownerActionsHtml = isOwner
    ? `<div class="card-owner-actions">
         <button class="btn-swap ${item.isSwapped ? 'active' : ''}" data-id="${item.id}">
           ${item.isSwapped ? '↩️ إلغاء ' + doneLabel : '✅ ' + doneLabel}
         </button>
         <button class="btn-delete" data-id="${item.id}">🗑️ حذف</button>
       </div>`
    : '';

  const universityBadge = item.university
    ? `<span class="card-university">🎓 ${escapeHtml(item.university)}</span>` : '';

  const gameTypeBadge = item.gameType
    ? `<span class="card-university">🎮 ${escapeHtml(item.gameType)}</span>` : '';

  const locationBadge = item.area
    ? `<span class="card-university">📍 ${escapeHtml(item.area)}</span>` : '';

  card.innerHTML = `
    <a class="card-image-wrap" href="/item/${item.id}">
      ${imageHtml}
      ${imageCountBadge}
      ${swappedBadge}
    </a>
    <div class="card-body">
      <div class="card-badges-row">
        ${locationBadge}
        ${universityBadge}
        ${gameTypeBadge}
        <span class="card-category">🏷️ ${escapeHtml(item.category || 'أخرى')}</span>
      </div>
      <a href="/item/${item.id}" style="text-decoration:none; color:inherit;">
        <h3 class="card-title">${escapeHtml(item.name)}</h3>
      </a>
      ${item.adType === 'sell'
        ? `<div class="card-trade">💰 ${item.price} د.أ</div>`
        : `<div class="card-trade">🔄 بدل بـ: ${escapeHtml(item.lookingFor)}</div>`}
      <div class="card-meta-row">
        <span>🕒 ${formatRelativeTime(item.createdAt)}</span>
        <span>👁️ ${item.views || 0}</span>
      </div>
      <div class="card-actions-row">
        ${whatsappHtml}
        <button class="btn-share" data-id="${item.id}">🔗 مشاركة</button>
        <button class="btn-copy-link" data-id="${item.id}">📋 نسخ</button>
      </div>
      ${ownerActionsHtml}
      ${!isOwner ? `<button class="btn-report" data-id="${item.id}">🚩 إبلاغ عن هذا الإعلان</button>` : ''}
    </div>
  `;

  const deleteBtn = card.querySelector('.btn-delete');
  if (deleteBtn) deleteBtn.addEventListener('click', () => deleteItem(item.id, myToken));

  const swapBtn = card.querySelector('.btn-swap');
  if (swapBtn) swapBtn.addEventListener('click', () => toggleSwapped(item.id, myToken, swapBtn));

  const shareBtn = card.querySelector('.btn-share');
  shareBtn.addEventListener('click', () => shareItem(item));

  const copyBtn = card.querySelector('.btn-copy-link');
  copyBtn.addEventListener('click', () => copyItemLink(item.id, copyBtn));

  const reportBtn = card.querySelector('.btn-report');
  if (reportBtn) reportBtn.addEventListener('click', () => reportItem(item.id));

card.querySelectorAll('a[href^="/item/"]').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    window.history.pushState({}, '', `/item/${item.id}`);
    showDetailView(item.id);
  });
});  return card;
}

// ---------- إجراءات الحذف وتبديل حالة المقايضة ----------
async function deleteItem(itemId, ownerToken) {
  const confirmed = confirm('هل أنت متأكد أنك تريد حذف هذا الإعلان؟ لا يمكن التراجع عن هذا الإجراء.');
  if (!confirmed) return;

  try {
    const res = await fetch(`/api/items/${itemId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerToken })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'تعذر حذف الإعلان');

    removeOwnerToken(itemId);
    loadItems();
  } catch (err) {
    alert(err.message);
  }
}

async function toggleSwapped(itemId, ownerToken, buttonEl) {
  try {
    const res = await fetch(`/api/items/${itemId}/swap`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerToken })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'تعذر تحديث حالة الإعلان');

    if (buttonEl && data.isSwapped) {
      buttonEl.classList.add('just-swapped');
      await new Promise(r => setTimeout(r, 350));
    }

    loadItems();
  } catch (err) {
    alert(err.message);
  }
}

// ---------- الفلترة والبحث ----------
function applyFiltersAndRender() {
  const query = searchInput.value.trim().toLowerCase();
  const uniFilter = filterUniversity.value;
  const catFilter = filterCategory.value;
  const govFilter = filterGovernorate.value;
  const ownerTokens = getOwnerTokens();

  let filtered = itemsCache.filter(item => {
    if (showOnlyMine && !ownerTokens[item.id]) return false;
    if (uniFilter && item.university !== uniFilter) return false;
    if (catFilter && item.category !== catFilter) return false;
    if (govFilter && item.governorate !== govFilter) return false;
    if (query) {
      const haystack = `${item.name} ${item.description} ${item.lookingFor}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  itemsGrid.innerHTML = '';

  if (filtered.length === 0) {
    emptyState.style.display = 'block';
    itemsCount.textContent = '';

    if (showOnlyMine) {
      emptyState.innerHTML = `<p>لم تنشر أي إعلانات بعد من هذا الجهاز.</p><p>أضف أول غرض لك للمقايضة! 👇</p>`;
    } else if (query || uniFilter || catFilter) {
      emptyState.innerHTML = `<p>لا توجد نتائج مطابقة لبحثك أو الفلاتر المحددة.</p><p>جرّب تعديل كلمات البحث أو إزالة الفلاتر.</p>`;
    } else {
      emptyState.innerHTML = `<p>لا توجد أغراض معروضة حالياً.</p><p>كن أول من يضيف غرضاً للمقايضة! 👇</p>`;
    }
    return;
  }

  emptyState.style.display = 'none';
  itemsCount.textContent = `${filtered.length} غرض معروض للمقايضة`;

  filtered.forEach(item => itemsGrid.appendChild(renderCard(item)));
}

searchInput.addEventListener('input', applyFiltersAndRender);
filterUniversity.addEventListener('change', applyFiltersAndRender);
filterCategory.addEventListener('change', applyFiltersAndRender);
filterGovernorate.addEventListener('change', applyFiltersAndRender);

myAdsBtn.addEventListener('click', () => {
  showOnlyMine = !showOnlyMine;
  myAdsBtn.classList.toggle('active', showOnlyMine);
  myAdsBtn.textContent = showOnlyMine ? '📋 كل الإعلانات' : '📋 إعلاناتي';
  applyFiltersAndRender();
});

// ---------- جلب كل الأغراض ----------
async function loadItems() {
  renderSkeletons();
  try {
    const res = await fetch('/api/items');
    itemsCache = await res.json();
    applyFiltersAndRender();
  } catch (err) {
    console.error('فشل تحميل الأغراض:', err);
  }
}

// ---------- نموذج إضافة غرض جديد ----------
// ---------- إظهار/إخفاء حقل السعر أو "المطلوب" حسب نوع الإعلان (بيع/مقايضة) ----------
const priceField = document.getElementById('priceField');
const lookingForField = document.getElementById('lookingForField');

function updateAdTypeFieldsVisibility() {
  const checked = itemForm.querySelector('input[name="adType"]:checked');
  const selected = checked ? checked.value : '';

  const isSell = selected === 'sell';
  const isBarter = selected === 'barter';

  priceField.style.display = isSell ? 'flex' : 'none';
  itemForm.price.required = isSell;
  if (!isSell) itemForm.price.value = '';

  lookingForField.style.display = isBarter ? 'flex' : 'none';
  itemForm.lookingFor.required = isBarter;
  if (!isBarter) itemForm.lookingFor.value = '';
}

itemForm.querySelectorAll('input[name="adType"]').forEach(radio => {
  radio.addEventListener('change', updateAdTypeFieldsVisibility);
});

itemForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  formError.textContent = '';

  const imagesInput = itemForm.querySelector('input[name="images"]');
  if (imagesInput.files.length > 4) {
    formError.textContent = 'يمكنك رفع 4 صور كحد أقصى';
    return;
  }

  const adTypeChecked = itemForm.querySelector('input[name="adType"]:checked');
  const selectedAdType = adTypeChecked ? adTypeChecked.value : '';

  if (!selectedAdType) {
    formError.textContent = 'يرجى اختيار نوع الإعلان: بيع أو مقايضة';
    return;
  }
  if (selectedAdType === 'sell' && (!itemForm.price.value || Number(itemForm.price.value) <= 0)) {
    formError.textContent = 'يرجى إدخال سعر صحيح';
    return;
  }
  if (selectedAdType === 'barter' && !itemForm.lookingFor.value.trim()) {
    formError.textContent = 'يرجى تحديد ما ترغب بالمقايضة به';
    return;
  }

  const submitBtn = itemForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'جاري ضغط الصور ونشر الإعلان...';

  try {
    const formData = new FormData();
    formData.append('name', itemForm.name.value);
    formData.append('description', itemForm.description.value);
    formData.append('adType', selectedAdType);
    formData.append('price', selectedAdType === 'sell' ? itemForm.price.value : '');
    formData.append('lookingFor', selectedAdType === 'barter' ? itemForm.lookingFor.value : '');
    formData.append('whatsapp', itemForm.whatsapp.value);
    formData.append('university', itemForm.university.value || '');
    formData.append('gameType', itemForm.gameType.value || '');
    formData.append('category', itemForm.category.value);
    formData.append('governorate', itemForm.governorate.value || '');
    formData.append('area', itemForm.area.value || '');

    // ضغط كل صورة قبل رفعها لتوفير مساحة التخزين
    const compressedFiles = await Promise.all(
      Array.from(imagesInput.files).map(file => compressImage(file))
    );
    compressedFiles.forEach(file => formData.append('images', file));

    const res = await fetch('/api/items', {
      method: 'POST',
      headers: { 'X-Device-Id': getDeviceId() },
      body: formData
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'حدث خطأ غير متوقع');

    if (data.ownerToken) saveOwnerToken(data.id, data.ownerToken);

    itemForm.reset();
    updateUniversityFieldVisibility();
    updateAdTypeFieldsVisibility();
    areaSelect.innerHTML = '<option value="" disabled selected>اختر المحافظة أولاً</option>';
    areaSelect.disabled = true;
    overlay.classList.remove('active');
    loadItems();
    loadStats();
  } catch (err) {
    formError.textContent = err.message;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'نشر الإعلان';
  }
});

// ---------- صفحة تفاصيل غرض واحد (/item/:id) ----------
function renderItemDetail(item) {
  const ownerTokens = getOwnerTokens();
  const myToken = ownerTokens[item.id];
  const isOwner = Boolean(myToken);
  const images = (item.imageUrls && item.imageUrls.length) ? item.imageUrls : [null];

  let currentImageIndex = 0;

  const mainImageHtml = images[0]
    ? `<img class="detail-main-image" id="detailMainImage" src="${images[0]}" alt="${escapeHtml(item.name)}" onerror="handleImageError(this)">`
    : `<div class="detail-main-image placeholder" id="detailMainImage">📦</div>`;

  const dotsHtml = images.length > 1
    ? `<div class="detail-dots">${images.map((img, i) =>
        `<button class="detail-dot ${i === 0 ? 'active' : ''}" data-index="${i}"></button>`).join('')}</div>`
    : '';

  const doneLabelDetail = item.adType === 'sell' ? 'تم بيع' : 'تمت مقايضة';
  const doneLabelShort = item.adType === 'sell' ? 'تم البيع' : 'تمت المقايضة';

  const swappedNote = item.isSwapped
    ? `<div class="card-trade" style="background:#fdecec; color:#c62828;">✅ ${doneLabelDetail} هذا الغرض ولم يعد متاحاً</div>`
    : '';

  const whatsappHtml = item.isSwapped
    ? ''
    : `<a class="btn-whatsapp" target="_blank" rel="noopener" href="${buildWhatsappLink(item.whatsapp, item.name)}">
         💬 تواصل عبر واتساب
       </a>`;

  const ownerActionsHtml = isOwner
    ? `<div class="card-owner-actions">
         <button class="btn-swap ${item.isSwapped ? 'active' : ''}" id="detailSwapBtn">
           ${item.isSwapped ? '↩️ إلغاء ' + doneLabelShort : '✅ ' + doneLabelShort}
         </button>
         <button class="btn-delete" id="detailDeleteBtn">🗑️ حذف</button>
       </div>`
    : '';

  const escrowHtml = (item.category === 'حسابات ألعاب' && !isOwner && !item.isSwapped)
    ? `<button class="btn-escrow" onclick="openEscrowModal('${item.id}', '${escapeHtml(item.whatsapp)}', '${escapeHtml(item.name)}')">🔒 طلب وسيط آمن</button>`
    : '';

  const universityBadgeDetail = item.university
    ? `<span class="card-university">🎓 ${escapeHtml(item.university)}</span>` : '';

  const gameTypeBadgeDetail = item.gameType
    ? `<span class="card-university">🎮 ${escapeHtml(item.gameType)}</span>` : '';

  const locationBadgeDetail = item.area
    ? `<span class="card-university">📍 ${escapeHtml(item.area)}${item.governorate ? ' - ' + escapeHtml(item.governorate) : ''}</span>` : '';

  itemDetailView.innerHTML = `
    <button class="back-link" id="backToHomeBtn">→ رجوع لكل الإعلانات</button>
    <div class="item-detail">
      <div class="detail-gallery">
        ${mainImageHtml}
        ${dotsHtml}
      </div>
      <div class="detail-body">
        <div class="card-badges-row">
          ${locationBadgeDetail}
          ${universityBadgeDetail}
          ${gameTypeBadgeDetail}
          <span class="card-category">🏷️ ${escapeHtml(item.category || 'أخرى')}</span>
        </div>
        <h1 class="detail-title">${escapeHtml(item.name)}</h1>
        <p class="detail-desc">${escapeHtml(item.description)}</p>
        ${item.adType === 'sell'
          ? `<div class="card-trade">💰 السعر: ${item.price} دينار أردني</div>`
          : `<div class="card-trade">🔄 بدل بـ: ${escapeHtml(item.lookingFor)}</div>`}
        ${swappedNote}
        <div class="detail-meta">
          <span>🕒 ${formatRelativeTime(item.createdAt)}</span>
          <span>👁️ ${item.views || 0} مشاهدة</span>
        </div>
        <div class="card-actions-row">
          ${whatsappHtml}
            ${escrowHtml}
          <button class="btn-share" id="detailShareBtn">🔗 مشاركة</button>
          <button class="btn-copy-link" id="detailCopyLinkBtn">📋 نسخ الرابط</button>
        </div>
        ${ownerActionsHtml}
        ${!isOwner ? `<button class="btn-report" id="detailReportBtn">🚩 إبلاغ عن هذا الإعلان</button>` : ''}
      </div>
    </div>
  `;

  // تبديل الصور بالنقاط
  const dotButtons = itemDetailView.querySelectorAll('.detail-dot');
  const mainImageEl = document.getElementById('detailMainImage');
  dotButtons.forEach(dot => {
    dot.addEventListener('click', () => {
      currentImageIndex = parseInt(dot.dataset.index, 10);
      if (mainImageEl.tagName === 'IMG') mainImageEl.src = images[currentImageIndex];
      dotButtons.forEach(d => d.classList.remove('active'));
      dot.classList.add('active');
    });
  });

  document.getElementById('backToHomeBtn').addEventListener('click', () => {
    window.history.pushState({}, '', '/');
    showHomeView();
  });

  document.getElementById('detailShareBtn').addEventListener('click', () => shareItem(item));

  const copyLinkBtn = document.getElementById('detailCopyLinkBtn');
  copyLinkBtn.addEventListener('click', () => copyItemLink(item.id, copyLinkBtn));

  const reportBtn = document.getElementById('detailReportBtn');
  if (reportBtn) reportBtn.addEventListener('click', () => reportItem(item.id));

  const deleteBtn = document.getElementById('detailDeleteBtn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      const confirmed = confirm('هل أنت متأكد أنك تريد حذف هذا الإعلان؟');
      if (!confirmed) return;
      try {
        const res = await fetch(`/api/items/${item.id}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ownerToken: myToken })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'تعذر حذف الإعلان');
        removeOwnerToken(item.id);
        window.history.pushState({}, '', '/');
        showHomeView();
        loadItems();
      } catch (err) {
        alert(err.message);
      }
    });
  }

  const swapBtn = document.getElementById('detailSwapBtn');
  if (swapBtn) {
    swapBtn.addEventListener('click', async () => {
      try {
        const res = await fetch(`/api/items/${item.id}/swap`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ownerToken: myToken })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'تعذر تحديث حالة الإعلان');
        renderItemDetail(data);
      } catch (err) {
        alert(err.message);
      }
    });
  }
}

async function loadItemDetail(itemId) {
  try {
    const res = await fetch(`/api/items/${itemId}`);
    const data = await res.json();
    if (!res.ok) {
      itemDetailView.innerHTML = `
        <button class="back-link" id="backToHomeBtn">→ رجوع لكل الإعلانات</button>
        <div class="empty-state"><p>${escapeHtml(data.error || 'الإعلان غير موجود')}</p></div>
      `;
      document.getElementById('backToHomeBtn').addEventListener('click', () => {
        window.history.pushState({}, '', '/');
        showHomeView();
      });
      return;
    }
    renderItemDetail(data);
  } catch (err) {
    console.error('فشل تحميل تفاصيل الإعلان:', err);
  }
}

// ---------- التنقل بين الصفحة الرئيسية وصفحة التفاصيل وصفحة الجامعة ----------
function showHomeView(presetUniversity) {
  homeView.style.display = 'block';
  heroSection.style.display = 'block';
  itemDetailView.style.display = 'none';

  if (presetUniversity) {
    filterUniversity.value = presetUniversity;
  }

  loadItems();
}

function showDetailView(itemId) {
  homeView.style.display = 'none';
  heroSection.style.display = 'none';
  itemDetailView.style.display = 'block';
  loadItemDetail(itemId);
}

function handleRouting() {
  const itemMatch = window.location.pathname.match(/^\/item\/(.+)$/);
  const uniMatch = window.location.pathname.match(/^\/university\/(.+)$/);

  if (itemMatch) {
    showDetailView(decodeURIComponent(itemMatch[1]));
  } else if (uniMatch) {
    showHomeView(decodeURIComponent(uniMatch[1]));
  } else {
    showHomeView();
  }
}

window.addEventListener('popstate', handleRouting);

// ---------- التحميل الأولي ----------
initTheme();
loadUniversities().then(handleRouting);
loadCategories();
loadRiskyCategories();
loadGameTypes();
loadLocations();
loadDeveloperContact();
loadStats();
maybeShowWelcome();

// ================= Escrow (نظام الوسيط الآمن) =================
function openEscrowModal(itemId, ownerWhatsapp, itemName) {
  const existing = document.getElementById('escrowModalOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'escrowModalOverlay';
  overlay.className = 'escrow-modal-overlay';
  overlay.innerHTML = `
    <div class="escrow-modal">
      <h2>🔒 طلب وسيط آمن</h2>
      <p class="escrow-hint">رسوم الخدمة: 5 دينار أردني (تُضاف على سعر الحساب المتفق عليه). أدخل رقم واتساب الطرف الآخر والسعر لإنشاء روم الوساطة.</p>
      <label>أنا:</label>
      <select id="escrowMyRole">
        <option value="buyer">مشتري (سأشتري الحساب)</option>
        <option value="seller">بائع (سأبيع الحساب)</option>
      </select>
      <label>رقم واتساب الطرف الآخر:</label>
      <input type="tel" id="escrowOtherWhatsapp" placeholder="9627xxxxxxxx">
      <label>رقم واتساب الخاص بي:</label>
      <input type="tel" id="escrowMyWhatsapp" value="${escapeHtml(ownerWhatsapp || '')}">
      <label>السعر المتفق عليه لقيمة الحساب (دينار):</label>
      <input type="number" id="escrowDealAmount" placeholder="مثال: 20" min="1" step="0.5">
      <button onclick="createEscrowSession('${itemId}', '${escapeHtml(itemName || '')}')">إنشاء روم الوساطة</button>
      <button class="escrow-cancel" onclick="closeEscrowModal()">إلغاء</button>
      <div id="escrowResultBox"></div>
    </div>`;
  document.body.appendChild(overlay);
}

function closeEscrowModal() {
  const el = document.getElementById('escrowModalOverlay');
  if (el) el.remove();
}

async function createEscrowSession(itemId, itemName) {
  const myRole = document.getElementById('escrowMyRole').value;
  const otherWhatsapp = document.getElementById('escrowOtherWhatsapp').value.trim();
  const myWhatsapp = document.getElementById('escrowMyWhatsapp').value.trim();
  const dealAmount = document.getElementById('escrowDealAmount').value.trim();

  if (!otherWhatsapp || !myWhatsapp) {
    alert('يرجى تعبئة رقمي الواتساب');
    return;
  }

  if (!dealAmount || parseFloat(dealAmount) <= 0) {
    alert('يرجى إدخال السعر المتفق عليه لقيمة الحساب');
    return;
  }

  const sellerWhatsapp = myRole === 'seller' ? myWhatsapp : otherWhatsapp;
  const buyerWhatsapp = myRole === 'buyer' ? myWhatsapp : otherWhatsapp;

  try {
    const res = await fetch('/api/escrow/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sellerWhatsapp, buyerWhatsapp, itemId, gameType: itemName, dealAmount })
    });
    const data = await res.json();
    if (!data.success) { alert(data.error || 'تعذر إنشاء الجلسة'); return; }

    const base = location.origin;
    const sellerLink = `${base}/escrow-room.html?id=${data.id}&token=${data.sellerToken}&role=seller`;
    const buyerLink = `${base}/escrow-room.html?id=${data.id}&token=${data.buyerToken}&role=buyer`;
    const myLink = myRole === 'seller' ? sellerLink : buyerLink;
    const otherLink = myRole === 'seller' ? buyerLink : sellerLink;
    const otherWaMsg = encodeURIComponent(`مرحباً، تفضل رابط روم الوسيط الآمن لإتمام عملية "${itemName}":\n${otherLink}`);

    document.getElementById('escrowResultBox').innerHTML = `
      <div class="escrow-result">
        <p>✅ تم إنشاء الروم بنجاح</p>
        <p><strong>رابطك أنت:</strong></p>
        <a href="${myLink}" target="_blank" class="escrow-link-btn">فتح الروم الخاص بي</a>
        <p><strong>أرسل هذا الرابط للطرف الآخر:</strong></p>
        <a href="https://wa.me/${otherWhatsapp.replace(/[^\d]/g,'')}?text=${otherWaMsg}" target="_blank" class="escrow-link-btn escrow-whatsapp-btn">📲 إرسال عبر واتساب</a>
      </div>`;
  } catch (e) {
    console.error(e);
    alert('تعذر إنشاء جلسة الوساطة');
  }
}

