// public/admin-stores.js
// لوحة إدارة بسيطة لمتابعة اشتراكات المحلات وتفعيلها يدوياً بعد استلام الدفعة
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

async function loadAdminStores(filterStatus) {
  const root = document.getElementById('adminStoresRoot');
  root.innerHTML = '<p class="store-loading">جاري التحميل...</p>';

  const url = filterStatus ? `/api/admin/stores?status=${filterStatus}` : '/api/admin/stores';
  const res = await fetch(url, { headers: apiHeaders() });
  const data = await res.json();

  if (!res.ok) {
    root.innerHTML = `<p class="store-error">${data.error || 'ما قدرت أجيب البيانات، تأكد إنك أدمن'}</p>`;
    return;
  }

  if (data.stores.length === 0) {
    root.innerHTML = '<p class="store-empty">ما في محلات بهاي الحالة</p>';
    return;
  }

  root.innerHTML = `
    <table class="admin-table">
      <thead>
        <tr>
          <th>المحل</th>
          <th>الحالة</th>
          <th>أيام متبقية</th>
          <th>الرسوم الشهرية</th>
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
            <td>${s.monthlyFee} د.أ</td>
            <td class="admin-actions">
              <button class="btn btn-sm btn-primary" onclick="activateSubscription('${s.slug}')">تفعيل / تجديد</button>
              ${
                s.effectiveStatus === 'suspended'
                  ? `<button class="btn btn-sm btn-ghost" onclick="unsuspendStore('${s.slug}')">رفع التعليق</button>`
                  : `<button class="btn btn-sm btn-ghost" onclick="suspendStore('${s.slug}')">تعليق</button>`
              }
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

document.addEventListener('DOMContentLoaded', () => loadAdminStores());

