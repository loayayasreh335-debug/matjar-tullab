// public/store.js
// صفحة المتجر - يتوقع أن store.html فيه: <div id="storeRoot"></div>
// ويحتاج auth.js محمّل قبله (يستخدم getSessionToken من auth.js)

const STORE_SLUG = new URLSearchParams(window.location.search).get('slug');

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function buildWhatsappLink(number, itemName) {
  const message = encodeURIComponent(`مرحباً، أنا مهتم بمنتج "${itemName}" في متجركم.`);
  return `https://wa.me/${number}?text=${message}`;
}

function buildStoreLink() {
  return `${window.location.origin}/store.html?slug=${STORE_SLUG}`;
}

async function shareStoreProduct(item) {
  const url = buildStoreLink();
  const text = `شوف "${item.title}" بمتجر ${currentStore.name} على سوقنا`;
  if (navigator.share) {
    try { await navigator.share({ title: item.title, text, url }); } catch (e) {}
  } else {
    window.open(`https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`, '_blank');
  }
}

async function copyStoreProductLink(btnEl) {
  try {
    await navigator.clipboard.writeText(buildStoreLink());
    const original = btnEl.textContent;
    btnEl.textContent = '✅ تم النسخ';
    setTimeout(() => (btnEl.textContent = original), 1500);
  } catch (e) {
    alert('تعذر نسخ الرابط');
  }
}

function apiHeaders() {
  const token = getSessionToken(); // من auth.js
  return token ? { 'x-user-token': token } : {};
}

let currentStore = null;
let viewerCanManage = false;
let subscriptionInfo = null;
let approvalStatus = null;
let approvalReason = '';

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
    approvalStatus = data.approvalStatus || null;
    approvalReason = data.approvalReason || '';

    renderStore();
    await loadProducts();
    storeHandleRouting();
  } catch (err) {
    root.innerHTML = '<p class="store-error">تعذر الاتصال بالسيرفر</p>';
  }
}

function renderStore() {
  const s = currentStore;
  const root = document.getElementById('storeRoot');

  root.innerHTML = `
    <div id="storeHomeContent">
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
          ? `<div class="store-manage-actions">
               <button id="addProductBtn" class="btn btn-primary store-manage-btn">➕ إنشاء منشور</button>
               <button id="editStoreBtn" class="btn btn-ghost store-manage-btn">⚙️ تعديل بيانات المحل</button>
             </div>`
          : ''
      }
    </div>

    ${s.description ? `<p class="store-description">${escapeHtml(s.description)}</p>` : ''}
    ${renderApprovalBanner()}
    ${renderSubscriptionBanner()}

    <div class="store-section" id="storeContactSection"></div>
    <div class="store-section" id="storeMapSection"></div>
    <div class="store-section" id="storePolicySection"></div>
    <div class="store-section" id="storeFilterSection"></div>
    <div class="store-products-grid" id="storeProductsGrid"></div>
    </div>
    <div id="storeDetailView" style="display:none;"></div>
  `;

  renderContactInfo();
  renderMap();
  renderPolicyBox();
  renderFilters();

  if (viewerCanManage) {
    document.getElementById('addProductBtn').addEventListener('click', openAddProductModal);
    document.getElementById('editStoreBtn').addEventListener('click', openEditStoreModal);
  }
}

// يظهر فقط لصاحب المحل/مشرفه، ينبّه لو محله لسا بانتظار المراجعة أو انرفض
function renderApprovalBanner() {
  if (!viewerCanManage || !approvalStatus || approvalStatus === 'approved') return '';
  if (approvalStatus === 'pending') {
    return `<div class="store-sub-banner store-sub-banner--warn">
      ⏳ محلك بانتظار مراجعة إدارة سوقنا. ما رح يظهر للزوار ولا تقدر تنشر منشورات لحد ما توافق الإدارة عليه.
    </div>`;
  }
  if (approvalStatus === 'rejected') {
    return `<div class="store-sub-banner store-sub-banner--danger">
      ❌ تم رفض طلب تسجيل محلك${approvalReason ? `: ${escapeHtml(approvalReason)}` : ''}. تواصل مع إدارة سوقنا للتفاصيل.
    </div>`;
  }
  return '';
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

function renderMap() {
  const section = document.getElementById('storeMapSection');
  const loc = currentStore.contact && currentStore.contact.location;
  if (!loc || !loc.lat || !loc.lng) {
    section.innerHTML = '';
    return;
  }
  section.innerHTML = `
    <h2 class="store-section-title">موقع المحل على الخريطة</h2>
    <div class="store-map-frame">
      <iframe
        src="https://www.google.com/maps?q=${loc.lat},${loc.lng}&output=embed"
        loading="lazy"
        referrerpolicy="no-referrer-when-downgrade">
      </iframe>
    </div>
  `;
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
let currentProducts = [];

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
  currentProducts = products;

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
          !p.isSoldOut && currentStore.contact && currentStore.contact.whatsapp
            ? `<a class="btn-whatsapp" target="_blank" rel="noopener" href="${buildWhatsappLink(currentStore.contact.whatsapp, p.title)}">💬 تواصل عبر واتساب</a>`
            : ''
        }
        ${
          !p.isSoldOut && currentStore.ownerUid
            ? `<button class="btn-chat" onclick="openStoreProductChat('${p._id}', '${encodeURIComponent(p.title)}')">💬 محادثة</button>`
            : ''
        }
        <div class="store-product-share-row">
          <button class="btn-share" data-id="${p._id}">🔗 مشاركة</button>
          <button class="btn-copy-link" data-id="${p._id}">📋 نسخ الرابط</button>
        </div>
        ${
          viewerCanManage
            ? `<div class="store-product-actions">
                <button class="btn btn-ghost btn-sm" onclick="openEditProductModal('${p._id}')">✏️ تعديل</button>
                <button class="btn btn-ghost btn-sm" onclick="deleteStoreProduct('${p._id}')">🗑️ حذف</button>
              </div>`
            : ''
        }
      </div>
    </div>`
    )
    .join('');

  grid.querySelectorAll('.store-product-card').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('a, button')) return;
      const productId = card.dataset.id;
      window.history.pushState({}, '', `/store.html?slug=${STORE_SLUG}&product=${productId}`);
      storeShowDetailView(productId);
    });
  });

  grid.querySelectorAll('.btn-share').forEach((btn) => {
    btn.addEventListener('click', () => {
      const product = currentProducts.find((p) => p._id === btn.dataset.id);
      if (product) shareStoreProduct(product);
    });
  });
  grid.querySelectorAll('.btn-copy-link').forEach((btn) => {
    btn.addEventListener('click', () => copyStoreProductLink(btn));
  });
}

function openStoreProductChat(productId, encodedTitle) {
  if (!currentStore || !currentStore.ownerUid) return;
  const product = currentProducts.find((p) => p._id === productId);
  const itemName = product ? product.title : decodeURIComponent(encodedTitle);
  startChatWith({ itemType: 'store_product', itemId: productId, itemName, otherUid: currentStore.ownerUid });
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

function openEditProductModal(productId) {
  const product = currentProducts.find((p) => p._id === productId);
  if (!product) return;

  const existing = document.getElementById('sooqnaModalRoot');
  if (existing) existing.remove();

  const wrapper = document.createElement('div');
  wrapper.id = 'sooqnaModalRoot';
  wrapper.innerHTML = `
    <div class="ms-modal-overlay">
      <div class="ms-modal-box">
        <div class="ms-modal-head">
          <h2>✏️ تعديل المنشور</h2>
          <button class="ms-modal-close" id="epClose">✕</button>
        </div>
        <div id="epMsg"></div>
        <input id="epTitle" class="ms-input" value="${escapeHtml(product.title)}">
        <input id="epPrice" type="number" class="ms-input" value="${product.price}">
        <input id="epCategory" class="ms-input" value="${escapeHtml(product.category || '')}">
        <textarea id="epDesc" class="ms-input" rows="3">${escapeHtml(product.description || '')}</textarea>
        ${
          product.images && product.images[0]
            ? `<p class="ms-input-label">الصور الحالية</p>
               <div class="ms-current-images">
                 ${product.images.map((u) => `<img src="${u}" class="ms-thumb">`).join('')}
               </div>`
            : ''
        }
        <p class="ms-input-label">تغيير الصور (اختياري — اختيار صور جديدة بيستبدل القديمة كلها)</p>
        <input id="epImages" type="file" accept="image/*" multiple class="ms-input">
        <button id="epSubmit" class="btn btn-primary">حفظ التعديل</button>
      </div>
    </div>
  `;
  document.body.appendChild(wrapper);

  document.getElementById('epClose').addEventListener('click', () => wrapper.remove());
  document.getElementById('epSubmit').addEventListener('click', async () => {
    const msg = document.getElementById('epMsg');
    const title = document.getElementById('epTitle').value.trim();
    const price = Number(document.getElementById('epPrice').value);
    const category = document.getElementById('epCategory').value.trim();
    const description = document.getElementById('epDesc').value.trim();
    const files = document.getElementById('epImages').files;

    msg.innerHTML = '<p class="ms-loading">جاري الحفظ...</p>';
    try {
      const fd = new FormData();
      fd.append('title', title);
      fd.append('price', price);
      fd.append('category', category);
      fd.append('description', description);
      for (const f of files) fd.append('images', f);

      const res = await fetch(`/api/stores/${STORE_SLUG}/products/${productId}`, {
        method: 'PATCH',
        headers: apiHeaders(), // بدون Content-Type — FormData بيحددها تلقائيًا
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        msg.innerHTML = `<p class="ms-error">${escapeHtml(data.error || 'تعذر الحفظ')}</p>`;
        return;
      }
      wrapper.remove();
      loadProducts();
    } catch (err) {
      msg.innerHTML = '<p class="ms-error">تعذر الاتصال بالسيرفر</p>';
    }
  });
}

function openAddProductModal() {
  const existing = document.getElementById('sooqnaModalRoot');
  if (existing) existing.remove();

  const wrapper = document.createElement('div');
  wrapper.id = 'sooqnaModalRoot';
  wrapper.innerHTML = `
    <div class="ms-modal-overlay">
      <div class="ms-modal-box">
        <div class="ms-modal-head">
          <h2>➕ إنشاء منشور جديد</h2>
          <button class="ms-modal-close" id="apClose">✕</button>
        </div>
        <div id="apMsg"></div>
        <input id="apTitle" class="ms-input" placeholder="اسم المنتج / المنشور">
        <input id="apPrice" type="number" class="ms-input" placeholder="السعر (د.أ)">
        <input id="apCategory" class="ms-input" placeholder="الفئة (اختياري)">
        <textarea id="apDesc" class="ms-input" rows="3" placeholder="الوصف"></textarea>
        <p class="ms-input-label">صور المنتج (تقدر تختار أكتر من صورة)</p>
        <input id="apImages" type="file" accept="image/*" multiple class="ms-input">
        <button id="apSubmit" class="btn btn-primary">نشر</button>
      </div>
    </div>
  `;
  document.body.appendChild(wrapper);

  document.getElementById('apClose').addEventListener('click', () => wrapper.remove());
  document.getElementById('apSubmit').addEventListener('click', async () => {
    const msg = document.getElementById('apMsg');
    const title = document.getElementById('apTitle').value.trim();
    const price = Number(document.getElementById('apPrice').value);
    const category = document.getElementById('apCategory').value.trim();
    const description = document.getElementById('apDesc').value.trim();
    const files = document.getElementById('apImages').files;

    if (!title || !price) {
      msg.innerHTML = '<p class="ms-error">اسم المنشور والسعر مطلوبين</p>';
      return;
    }

    msg.innerHTML = '<p class="ms-loading">جاري النشر...</p>';
    try {
      const fd = new FormData();
      fd.append('title', title);
      fd.append('price', price);
      fd.append('category', category);
      fd.append('description', description);
      for (const f of files) fd.append('images', f);

      const res = await fetch(`/api/stores/${STORE_SLUG}/products`, {
        method: 'POST',
        headers: apiHeaders(), // بدون Content-Type — FormData بيحددها تلقائيًا
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        msg.innerHTML = `<p class="ms-error">${escapeHtml(data.error || 'تعذر النشر')}</p>`;
        return;
      }
      wrapper.remove();
      loadProducts();
    } catch (err) {
      msg.innerHTML = '<p class="ms-error">تعذر الاتصال بالسيرفر</p>';
    }
  });
}

function openEditStoreModal() {
  const existing = document.getElementById('sooqnaModalRoot');
  if (existing) existing.remove();

  const c = currentStore.contact || {};
  const p = currentStore.policies || {};
  const loc = c.location || {};

  const wrapper = document.createElement('div');
  wrapper.id = 'sooqnaModalRoot';
  wrapper.innerHTML = `
    <div class="ms-modal-overlay">
      <div class="ms-modal-box">
        <div class="ms-modal-head">
          <h2>⚙️ تعديل بيانات المحل</h2>
          <button class="ms-modal-close" id="esClose">✕</button>
        </div>
        <div id="esMsg"></div>

        <p class="ms-input-label">واتساب</p>
        <input id="esWhatsapp" class="ms-input" value="${escapeHtml(c.whatsapp || '')}" placeholder="9627xxxxxxxx">

        <p class="ms-input-label">رقم الهاتف</p>
        <input id="esPhone" class="ms-input" value="${escapeHtml(c.phone || '')}" placeholder="07xxxxxxxx">

        <p class="ms-input-label">شعار المحل</p>
        ${currentStore.logoUrl ? `<img src="${currentStore.logoUrl}" class="ms-thumb">` : ''}
        <input id="esLogoFile" type="file" accept="image/*" class="ms-input">

        <p class="ms-input-label">صورة الغلاف</p>
        ${currentStore.coverImageUrl ? `<img src="${currentStore.coverImageUrl}" class="ms-thumb">` : ''}
        <input id="esCoverFile" type="file" accept="image/*" class="ms-input">

        <p class="ms-input-label">العنوان (نص)</p>
        <input id="esAddress" class="ms-input" value="${escapeHtml(c.address || '')}" placeholder="عمّان، الأردن">

        <p class="ms-input-label">موقع المحل على خرائط جوجل</p>
        <p class="ms-hint" style="text-align:right;margin:0 0 6px">
          افتح خرائط جوجل، دوس مطولاً على مكان محلك بالضبط، وانسخ الإحداثيات (رقمين مفصولين بفاصلة) والصقهم هون:
        </p>
        <input id="esCoords" class="ms-input" placeholder="مثال: 31.9539, 35.9106">

        <p class="ms-input-label">نص الكفالة</p>
        <textarea id="esWarranty" class="ms-input" rows="2">${escapeHtml(p.warrantyText || '')}</textarea>

        <p class="ms-input-label">مدة الكفالة (بالأيام)</p>
        <input id="esWarrantyDays" type="number" class="ms-input" value="${p.warrantyPeriodDays || ''}">

        <p class="ms-input-label">سياسة الاسترجاع</p>
        <textarea id="esReturn" class="ms-input" rows="2">${escapeHtml(p.returnPolicyText || '')}</textarea>

        <button id="esSubmit" class="btn btn-primary">حفظ التعديلات</button>
      </div>
    </div>
  `;
  document.body.appendChild(wrapper);

  document.getElementById('esClose').addEventListener('click', () => wrapper.remove());
  document.getElementById('esSubmit').addEventListener('click', async () => {
    const msg = document.getElementById('esMsg');
    const coordsRaw = document.getElementById('esCoords').value.trim();
    let lat, lng;
    if (coordsRaw) {
      const parts = coordsRaw.split(',').map((v) => Number(v.trim()));
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        [lat, lng] = parts;
      } else {
        msg.innerHTML = '<p class="ms-error">صيغة الإحداثيات غير صحيحة، لازم تكون رقمين مفصولين بفاصلة</p>';
        return;
      }
    } else if (loc.lat) {
      lat = loc.lat;
      lng = loc.lng;
    }

    const payload = {
      whatsapp: document.getElementById('esWhatsapp').value.trim(),
      phone: document.getElementById('esPhone').value.trim(),
      address: document.getElementById('esAddress').value.trim(),
      warrantyText: document.getElementById('esWarranty').value.trim(),
      warrantyPeriodDays: Number(document.getElementById('esWarrantyDays').value) || null,
      returnPolicyText: document.getElementById('esReturn').value.trim(),
      ...(lat !== undefined ? { lat, lng } : {}),
    };

    msg.innerHTML = '<p class="ms-loading">جاري الحفظ...</p>';
    try {
      const res = await fetch(`/api/stores/${STORE_SLUG}/contact-and-policies`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...apiHeaders() },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        msg.innerHTML = `<p class="ms-error">${escapeHtml(data.error || 'تعذر الحفظ')}</p>`;
        return;
      }

      // رفع الشعار/الغلاف لو انتاروا (بدون Content-Type — FormData بتحددها تلقائيًا)
      const logoFile = document.getElementById('esLogoFile').files[0];
      const coverFile = document.getElementById('esCoverFile').files[0];
      if (logoFile) {
        const fd = new FormData();
        fd.append('image', logoFile);
        await fetch(`/api/stores/${STORE_SLUG}/logo`, { method: 'PATCH', headers: apiHeaders(), body: fd }).catch(() => {});
      }
      if (coverFile) {
        const fd = new FormData();
        fd.append('image', coverFile);
        await fetch(`/api/stores/${STORE_SLUG}/cover`, { method: 'PATCH', headers: apiHeaders(), body: fd }).catch(() => {});
      }

      wrapper.remove();
      loadStore();
    } catch (err) {
      msg.innerHTML = '<p class="ms-error">تعذر الاتصال بالسيرفر</p>';
    }
  });
}

// ---------- نافذة تفاصيل المنتج ----------
function storeBuildProductUrl(productId) {
  return `${window.location.origin}/store.html?slug=${STORE_SLUG}&product=${productId}`;
}

function storeShowHomeView() {
  document.getElementById('storeHomeContent').style.display = '';
  document.getElementById('storeDetailView').style.display = 'none';
}

function storeShowDetailView(productId) {
  const product = currentProducts.find((p) => p._id === productId);
  if (!product) { storeShowHomeView(); return; }
  document.getElementById('storeHomeContent').style.display = 'none';
  const detailView = document.getElementById('storeDetailView');
  detailView.style.display = 'block';
  storeRenderProductDetail(product);
}

function storeHandleRouting() {
  const productId = new URLSearchParams(window.location.search).get('product');
  if (productId) {
    storeShowDetailView(productId);
  } else {
    storeShowHomeView();
  }
}

window.addEventListener('popstate', storeHandleRouting);
function storeRenderProductDetail(product) {
  const images = (product.images && product.images.length) ? product.images : [null];

  const mainImageHtml = images[0]
    ? `<img class="detail-main-image" id="storeDetailMainImage" src="${images[0]}" alt="${escapeHtml(product.title)}">`
    : `<div class="detail-main-image placeholder" id="storeDetailMainImage">📦</div>`;

  const dotsHtml = images.length > 1
    ? `<div class="detail-dots">${images.map((img, i) =>
        `<button class="detail-dot ${i === 0 ? 'active' : ''}" data-index="${i}"></button>`).join('')}</div>`
    : '';

  let contactHtml = '';
  if (!product.isSoldOut && currentStore.contact && currentStore.contact.whatsapp) {
    contactHtml = `<a class="btn-whatsapp" target="_blank" rel="noopener" href="${buildWhatsappLink(currentStore.contact.whatsapp, product.title)}">💬 تواصل عبر واتساب</a>`;
  }

  let chatBtnHtml = '';
  if (!product.isSoldOut && currentStore.ownerUid) {
    chatBtnHtml = `<button class="btn-chat" onclick="openStoreProductChat('${product._id}', '${encodeURIComponent(product.title)}')">💬 محادثة</button>`;
  }

  const soldOutBadge = product.isSoldOut
    ? `<div class="card-trade" style="background:#fdecec; color:#c62828;">🚫 نفذت الكمية</div>`
    : '';

  const detailView = document.getElementById('storeDetailView');
  detailView.innerHTML = `
    <button class="btn-ghost" id="storeDetailBackBtn">→ رجوع لكل منتجات المتجر</button>
    <div class="item-detail">
      <div class="detail-gallery">
        ${mainImageHtml}
        ${dotsHtml}
      </div>
      <div class="detail-body">
        <h1 class="detail-title">${escapeHtml(product.title)}</h1>
        <p class="store-product-price">${product.price} د.أ</p>
        ${soldOutBadge}
        <div class="card-actions-row">
          ${contactHtml}
          ${chatBtnHtml}
          <button class="btn-share" id="storeDetailShareBtn">🔗 مشاركة</button>
          <button class="btn-copy-link" id="storeDetailCopyLinkBtn">📋 نسخ الرابط</button>
          ${viewerCanManage ? `<button class="btn btn-ghost" onclick="toggleProductSoldOut('${product._id}', ${!!product.isSoldOut})">${product.isSoldOut ? '↩️ إلغاء نفذت الكمية' : '🚫 نفذت الكمية'}</button>` : ''}
        </div>
      </div>
    </div>
  `;

  const dotButtons = detailView.querySelectorAll('.detail-dot');
  const mainImageEl = document.getElementById('storeDetailMainImage');
  dotButtons.forEach(dot => {
    dot.addEventListener('click', () => {
      const idx = parseInt(dot.dataset.index, 10);
      if (mainImageEl.tagName === 'IMG') mainImageEl.src = images[idx];
      dotButtons.forEach(d => d.classList.remove('active'));
      dot.classList.add('active');
    });
  });

  document.getElementById('storeDetailBackBtn').addEventListener('click', () => {
    window.history.pushState({}, '', `/store.html?slug=${STORE_SLUG}`);
    storeShowHomeView();
  });

  document.getElementById('storeDetailShareBtn').addEventListener('click', () => storeShareProductDetail(product));
  const copyBtn = document.getElementById('storeDetailCopyLinkBtn');
  copyBtn.addEventListener('click', () => storeCopyProductDetailLink(product._id, copyBtn));
}

async function storeShareProductDetail(product) {
  const url = storeBuildProductUrl(product._id);
  const text = `${product.title} - في متجر ${currentStore.name} على سوقنا`;
  if (navigator.share) {
    try { await navigator.share({ title: product.title, text, url }); } catch (e) {}
  } else {
    window.open(`https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`, '_blank');
  }
}

async function storeCopyProductDetailLink(productId, btnEl) {
  try {
    await navigator.clipboard.writeText(storeBuildProductUrl(productId));
    const original = btnEl.textContent;
    btnEl.textContent = '✅ تم النسخ';
    setTimeout(() => (btnEl.textContent = original), 1500);
  } catch (e) {
    alert('تعذر نسخ الرابط');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (!STORE_SLUG) {
    document.getElementById('storeRoot').innerHTML =
      '<p class="store-error">رابط المتجر غير صالح</p>';
    return;
  }
  loadStore();
});
