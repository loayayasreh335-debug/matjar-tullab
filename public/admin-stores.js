// public/admin-stores.js
// لوحة إدارة شاملة: طلبات تسجيل جديدة (موافقة/رفض)، متابعة الاشتراكات
// (تفعيل/تعليق/تعديل بالزيادة أو النقصان)، وحذف نهائي للمحلات المخالفة.
// يتطلب: حساب مسجل دخول عليه req.user.isSuperAdmin = true بقاعدة البيانات

function apiHeaders() {
  const token = getSessionToken(); // من auth.js
  return { 'Content-Type': 'application/json', ...(token ? { 'x-user-token': token } : {}) };
}

const STATUS_LABELS = {
  trial: '🎁 تجريبي',
  active: '✅ فعّال',
  expired: '⏰ منتهي',
  suspended: '⛔ موقوف',
};

async function loadAdminPage() {
  await Promise.all([loadPendingRequests(), loadAdminStores()]);
}

// ---------- طلبات التسجيل الجديدة ----------
async function loadPendingRequests() {
  const root = document.getElementById('adminPendingRoot');
  root.innerHTML = '<p class="loading">جاري التحميل...</p>';

  const res = await fetch('/api/admin/stores/pending', { headers: apiHeaders() });
  const data = await res.json();

  if (!res.ok) {
    root.innerHTML = `<p class="error">${data.error || 'تعذر جلب الطلبات'}</p>`;
    return;
  }
  if (data.stores.length === 0) {
    root.innerHTML = '<p class="empty">ما في طلبات جديدة حالياً 🎉</p>';
    return;
  }

  root.innerHTML = data.stores
    .map(
      (s) => `
    <div class="pending-card">
      <div class="pending-info">
        <b>${s.name}</b>
        <span>${s.category || 'بدون فئة'}</span>
        ${s.description ? `<p>${s.description}</p>` : ''}
      </div>
      <div class="pending-actions">
        <button class="btn btn-approve" onclick="approveStore('${s.slug}')">✅ موافقة</button>
        <button class="btn btn-reject" onclick="rejectStore('${s.slug}')">❌ رفض</button>
        <a class="btn btn-view" href="/store.html?slug=${s.slug}" target="_blank">👁️ معاينة</a>
      </div>
    </div>`
    )
    .join('');
}

async function approveStore(slug) {
  const res = await fetch(`/api/admin/stores/${slug}/approve`, {
    method: 'POST',
    headers: apiHeaders(),
  });
  if (res.ok) {
    loadAdminPage();
  } else alert('تعذرت الموافقة');
}

async function rejectStore(slug) {
  const reason = prompt('سبب الرفض (رح يشوفه صاحب المحل):', '');
  if (reason === null) return;
  const res = await fetch(`/api/admin/stores/${slug}/reject`, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({ reason }),
  });
  if (res.ok) loadAdminPage();
  else alert('تعذر الرفض');
}

// ---------- كل المحلات + الاشتراكات ----------
async function loadAdminStores(filterStatus) {
  const root = document.getElementById('adminStoresRoot');
  root.innerHTML = '<p class="loading">جاري التحميل...</p>';

  const url = filterStatus ? `/api/admin/stores?status=${filterStatus}` : '/api/admin/stores';
  const res = await fetch(url, { headers: apiHeaders() });
  const data = await res.json();

  if (!res.ok) {
    root.innerHTML = `<p class="error">${data.error || 'ما قدرت أجيب البيانات، تأكد إنك أدمن'}</p>`;
    return;
  }
  if (data.stores.length === 0) {
    root.innerHTML = '<p class="empty">ما في محلات بهاي الحالة</p>';
    return;
  }

  root.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th>المحل</th>
          <th>الحالة</th>
          <th>أيام متبقية</th>
          <th>إجراء</th>
        </tr>
      </thead>
      <tbody>
        ${data.stores
          .map(
            (s) => `
          <tr>
            <td><a href="/store.html?slug=${s.slug}" target="_blank">${s.name}</a></td>
            <td>${STATUS_LABELS[s.effectiveStatus] || s.effectiveStatus}</td>
            <td>${s.daysRemaining}</td>
            <td class="admin-actions">
              <button class="btn btn-sm btn-primary" onclick="activateSubscription('${s.slug}')">تفعيل/تجديد</button>
              <button class="btn btn-sm btn-ghost" onclick="adjustSubscription('${s.slug}')">+/− أيام</button>
              ${
                s.effectiveStatus === 'suspended'
                  ? `<button class="btn btn-sm btn-ghost" onclick="unsuspendStore('${s.slug}')">رفع تعليق</button>`
                  : `<button class="btn btn-sm btn-ghost" onclick="suspendStore('${s.slug}')">تعليق</button>`
              }
              <button class="btn btn-sm btn-feature" onclick="toggleFeature('${s.slug}', true)">⭐ تمييز</button>
              <button class="btn btn-sm btn-danger" onclick="deleteStorePermanently('${s.slug}')">🗑️ حذف نهائي</button>
            </td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>
  `;
}

async function activateSubscription(slug) {
  const months = prompt('كم شهر تم دفعه؟', '1');
  if (!months) return;
  const note = prompt('ملاحظة (رقم تحويل/كليك، اختياري):', '') || '';

  const res = await fetch(`/api/admin/stores/${slug}/subscription/activate`, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({ months: Number(months), note }),
  });
  const data = await res.json();
  if (!res.ok) return alert(data.error || 'تعذر التفعيل');
  alert('تم تجديد الاشتراك ✅');
  loadAdminStores();
}

// تعديل يدوي بالأيام — رقم موجب يزيد، سالب ينقص (لتصحيح غلطة أو عقوبة جزئية)
async function adjustSubscription(slug) {
  const days = prompt('كم يوم بدك تضيف؟ (اكتب رقم سالب عشان تنقص، مثلاً: -7)', '');
  if (!days || isNaN(Number(days))) return;

  const res = await fetch(`/api/admin/stores/${slug}/subscription/adjust`, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({ days: Number(days) }),
  });
  if (res.ok) {
    alert('تم التعديل ✅');
    loadAdminStores();
  } else alert('تعذر التعديل');
}

async function suspendStore(slug) {
  const reason = prompt('سبب التعليق:', '');
  if (reason === null) return;
  const res = await fetch(`/api/admin/stores/${slug}/subscription/suspend`, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({ reason }),
  });
  if (res.ok) loadAdminStores();
  else alert('تعذر التعليق');
}

async function unsuspendStore(slug) {
  const res = await fetch(`/api/admin/stores/${slug}/subscription/unsuspend`, {
    method: 'POST',
    headers: apiHeaders(),
  });
  if (res.ok) loadAdminStores();
  else alert('تعذر رفع التعليق');
}

async function toggleFeature(slug, featured) {
  const res = await fetch(`/api/admin/stores/${slug}/feature`, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify({ featured }),
  });
  const data = await res.json();
  if (!res.ok) return alert(data.error || 'تعذر التحديث');
  alert('تم ✅');
  loadAdminStores();
}

async function deleteStorePermanently(slug) {
  if (!confirm('⚠️ حذف نهائي — رح يحذف المحل وكل منشوراته للأبد. متأكد؟')) return;
  if (!confirm('تأكيد أخير: هذا الإجراء لا يمكن التراجع عنه. متابعة؟')) return;

  const res = await fetch(`/api/admin/stores/${slug}`, {
    method: 'DELETE',
    headers: apiHeaders(),
  });
  if (res.ok) {
    alert('تم الحذف');
    loadAdminStores();
  } else alert('تعذر الحذف');
}

document.addEventListener('DOMContentLoaded', () => loadAdminPage());
