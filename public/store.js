// public/store.js
// صفحة المتجر - يتوقع أن store.html فيه: <div id="storeRoot"></div>
// ويحتاج auth.js محمّل قبله (يستخدم getSessionToken من auth.js)

const STORE_SLUG = new URLSearchParams(window.location.search).get('slug');

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function apiHeaders() {
  const token = getSessionToken(); // من auth.js
  return token ? { 'x-user-token': token } : {};
}

let currentStore = null;
let viewerCanManage = false;
let subscriptionInfo = null;

async function loadStore() {
  const root = document.getElementById('storeRoot');
  root.innerHTML = '<p class="store-loading">جاري تحميل المتجر...</p>';

  try {
    const res = await fetch(`/api/stores/${STORE_SLUG}`, { headers: apiHeaders() });
    const data = await res.json();
    if (!res.ok) {
      root.innerHTML = `<p class="store-error">${escapeHtml(data.error || 'المتجر غير موجود')}</p>`;
      return;
    }

    currentStore = data.store;
    viewerCanManage = !!data.viewerCanManage;
    subscriptionInfo = data.subscription || null;

    renderStore();
    loadProducts();
  } catch (err) {
    root.innerHTML = '<p class="store-error">تعذر الاتصال بالسيرفر</p>';
  }
}

function renderStore() {
  const s = currentStore;
  const root = document.getElementById('storeRoot');

  root.innerHTML = `
    <div class="store-cover" style="${
      s.coverImageUrl ? `background-image:url('${s.coverImageUrl}')` : ''
    }"></div>

    <div class="store-header">
      <div class="store-logo">
        ${
          s.logoUrl
            ? `<img src="${s.logoUrl}" alt="${escapeHtml(s.name)}">`
            : `<span>${escapeHtml(s.name).charAt(0)}</span>`
        }
      </div>
      <div class="store-title-block">
        <div class="store-title-row">
          <h1>${escapeHtml(s.name)}</h1>
          ${
            s.isVerified
              ? `<span class="store-badge-verified">✅ متجر موثّق</span>`
              : ''
          }
        </div>
        ${s.category ? `<p class="store-category">${escapeHtml(s.category)}</p>` : ''}
      </div>
      ${
        viewerCanManage
          ? `<button id="manageStoreBtn" class="btn btn-primary store-manage-btn">⚙️ إدارة المتجر</button>`
          : ''
      }
    </div>

    ${s.description ? `<p class="store-description">${escapeHtml(s.description)}</p>` : ''}
    ${renderSubscriptionBanner()}

    <div class="store-section" id="storeContactSection"></div>
    <div class="store-section" id="storePolicySection"></div>
    <div class="store-section" id="storeFilterSection"></div>
    <div class="store-products-grid" id="storeProductsGrid"></div>
  `;

  renderContactInfo();
  renderPolicyBox();
  renderFilters();

  if (viewerCanManage) {
    document.getElementById('manageStoreBtn').addEventListener('click', openAddProductModal);
  }
}

// يظهر فقط للمالك/المشرف، ينبّه قبل انتهاء الاشتراك أو بعده
function renderSubscriptionBanner() {
  if (!viewerCanManage || !subscriptionInfo) return '';
  const { status, daysRemaining, monthlyFee } = subscriptionInfo;

  if (status === 'expired') {
    return `<div class="store-sub-banner store-sub-banner--danger">
      ⏰ انتهى اشتراك المحل الشهري (${monthlyFee} د.أ). لازم تجدد عشان تقدر تنشر منتجات جديدة — تواصل مع إدارة سوقنا.
    </div>`;
  }
  if (status === 'suspended') {
    return `<div class="store-sub-banner store-sub-banner--danger">
      ⛔ حساب المحل موقوف حالياً من إدارة سوقنا. تواصل معنا للتفاصيل.
    </div>`;
  }
  if (daysRemaining <= 5) {
    return `<div class="store-sub-banner store-sub-banner--warn">
      ⚠️ اشتراك المحل بينتهي خلال ${daysRemaining} يوم. جدده لتفادي توقف النشر.
    </div>`;
  }
  return '';
}

function renderContactInfo() {
  const c = currentStore.contact || {};
  const items = [];
  if (c.whatsapp) {
    items.push(
      `<a class="store-contact-item" href="https://wa.me/${c.whatsapp.replace(/[^0-9]/g, '')}" target="_blank">
        <span class="store-contact-icon">💬</span>
        <span><span class="store-contact-label">واتساب</span><span class="store-contact-value">${escapeHtml(c.whatsapp)}</span></span>
      </a>`
    );
  }
  if (c.phone) {
    items.push(
      `<a class="store-contact-item" href="tel:${c.phone}">
        <span class="store-contact-icon">📞</span>
        <span><span class="store-contact-label">اتصال</span><span class="store-contact-value">${escapeHtml(c.phone)}</span></span>
      </a>`
    );
  }
  if (c.address) {
    const href = c.location
      ? `https://www.google.com/maps?q=${c.location.lat},${c.location.lng}`
      : '#';
    items.push(
      `<a class="store-contact-item" href="${href}" target="_blank">
        <span class="store-contact-icon">📍</span>
        <span><span class="store-contact-label">الموقع</span><span class="store-contact-value">${escapeHtml(c.address)}</span></span>
      </a>`
    );
  }

  const section = document.getElementById('storeContactSection');
  section.innerHTML = items.length
    ? `<h2 class="store-section-title">تواصل مع المتجر</h2><div class="store-contact-grid">${items.join('')}</div>`
    : '';
}

function renderPolicyBox() {
  const p = currentStore.policies || {};
  const section = document.getElementById('storePolicySection');
  if (!p.warrantyText && !p.returnPolicyText) {
    section.innerHTML = '';
    return;
  }
  section.innerHTML = `
    <div class="store-policy-box">
      <h2 class="store-section-title store-section-title--light">سياسات الكفالة والاسترجاع</h2>
      <div class="store-policy-grid">
        ${
          p.warrantyText
            ? `<div class="store-policy-card">
                <div class="store-policy-card-head">🛡️ الكفالة ${p.warrantyPeriodDays ? `<span>${p.warrantyPeriodDays} يوم</span>` : ''}</div>
                <p>${escapeHtml(p.warrantyText)}</p>
              </div>`
            : ''
        }
        ${
          p.returnPolicyText
            ? `<div class="store-policy-card">
                <div class="store-policy-card-head">↩️ سياسة الاسترجاع</div>
                <p>${escapeHtml(p.returnPolicyText)}</p>
              </div>`
            : ''
        }
      </div>
    </div>
  `;
}

let activeFilters = { sortBy: 'newest' };

function renderFilters() {
  const section = document.getElementById('storeFilterSection');
  section.innerHTML = `
    <div class="store-filter-bar">
      <input id="storeSearchInput" type="text" placeholder="ابحث ضمن منتجات هذا المتجر..." class="store-input">
      <select id="storeSortSelect" class="store-input">
        <option value="newest">الأحدث</option>
        <option value="price_asc">السعر: من الأقل</option>
        <option value="price_desc">السعر: من الأعلى</option>
        <option value="popular">الأكثر مشاهدة</option>
      </select>
    </div>
  `;

  document.getElementById('storeSearchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      activeFilters.q = e.target.value;
      loadProducts();
    }
  });
  document.getElementById('storeSortSelect').addEventListener('change', (e) => {
    activeFilters.sortBy = e.target.value;
    loadProducts();
  });
}

async function loadProducts() {
  const grid = document.getElementById('storeProductsGrid');
  grid.innerHTML = '<p class="store-loading">جاري تحميل المنتجات...</p>';

  const params = new URLSearchParams();
  if (activeFilters.q) params.set('q', activeFilters.q);
  if (activeFilters.sortBy) params.set('sortBy', activeFilters.sortBy);

  // ملاحظة: لا يوجد أي storeId هنا — المسار (STORE_SLUG) وحده يحدد المتجر بالسيرفر
  const res = await fetch(`/api/stores/${STORE_SLUG}/products?${params}`);
  const data = await res.json();
  const products = data.products || [];

  if (products.length === 0) {
    grid.innerHTML = '<p class="store-empty">لا توجد منتجات تطابق البحث حالياً</p>';
    return;
  }

  grid.innerHTML = products
    .map(
      (p) => `
    <div class="store-product-card" data-id="${p._id}">
      <div class="store-product-img">${p.images && p.images[0] ? `<img src="${p.images[0]}" alt="${escapeHtml(p.title)}">` : ''}</div>
      <div class="store-product-body">
        <h3>${escapeHtml(p.title)}</h3>
        <p class="store-product-price">${p.price} د.أ</p>
        ${
          viewerCanManage
            ? `<div class="store-product-actions">
                <button class="btn btn-ghost btn-sm" onclick="deleteStoreProduct('${p._id}')">🗑️ حذف</button>
              </div>`
            : ''
        }
      </div>
    </div>`
    )
    .join('');
}

async function deleteStoreProduct(productId) {
  if (!confirm('هل تريد حذف هذا المنتج؟')) return;
  const res = await fetch(`/api/stores/${STORE_SLUG}/products/${productId}`, {
    method: 'DELETE',
    headers: apiHeaders(),
  });
  if (res.ok) loadProducts();
  else {
    const data = await res.json().catch(() => ({}));
    alert(data.error || 'تعذر حذف المنتج');
  }
}

function openAddProductModal() {
  // يمكن استبدالها بنافذة منبثقة أجمل، هاي أبسط نسخة تشتغل فوراً
  const title = prompt('اسم المنتج:');
  if (!title) return;
  const priceStr = prompt('السعر (د.أ):');
  const price = Number(priceStr);
  if (!priceStr || isNaN(price)) return alert('سعر غير صالح');

  fetch(`/api/stores/${STORE_SLUG}/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...apiHeaders() },
    body: JSON.stringify({ title, price }),
  })
    .then(async (res) => {
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'تعذر نشر المنتج');
        return;
      }
      loadProducts();
    })
    .catch(() => alert('تعذر الاتصال بالسيرفر'));
}

document.addEventListener('DOMContentLoaded', () => {
  if (!STORE_SLUG) {
    document.getElementById('storeRoot').innerHTML =
      '<p class="store-error">رابط المتجر غير صالح</p>';
    return;
  }
  loadStore();
});

