// script.js - منطق الواجهة الأمامية

const itemsGrid = document.getElementById('itemsGrid');
const itemsCount = document.getElementById('itemsCount');
const emptyState = document.getElementById('emptyState');

const overlay = document.getElementById('formOverlay');
const openFormBtn = document.getElementById('openFormBtn');
const closeFormBtn = document.getElementById('closeFormBtn');
const itemForm = document.getElementById('itemForm');
const formError = document.getElementById('formError');

// فتح وإغلاق نافذة النموذج
openFormBtn.addEventListener('click', () => {
  overlay.classList.add('active');
});

closeFormBtn.addEventListener('click', () => {
  overlay.classList.remove('active');
});

overlay.addEventListener('click', (e) => {
  if (e.target === overlay) overlay.classList.remove('active');
});

// بناء رابط واتساب مباشر مع رسالة جاهزة
function buildWhatsappLink(number, itemName) {
  const message = encodeURIComponent(`مرحباً، أنا مهتم بمقايضة "${itemName}" الذي عرضته في متجر الطلاب.`);
  return `https://wa.me/${number}?text=${message}`;
}

// بناء بطاقة عرض غرض واحد
function renderCard(item) {
  const card = document.createElement('div');
  card.className = 'card';

  const imageHtml = item.imageUrl
    ? `<img class="card-image" src="${item.imageUrl}" alt="${escapeHtml(item.name)}">`
    : `<div class="card-image placeholder">📦</div>`;

  card.innerHTML = `
    ${imageHtml}
    <div class="card-body">
      <h3 class="card-title">${escapeHtml(item.name)}</h3>
      <p class="card-desc">${escapeHtml(item.description)}</p>
      <div class="card-trade">🔄 بدل بـ: ${escapeHtml(item.lookingFor)}</div>
      <a class="btn-whatsapp" target="_blank" rel="noopener" href="${buildWhatsappLink(item.whatsapp, item.name)}">
        💬 تواصل عبر واتساب
      </a>
    </div>
  `;

  return card;
}

// حماية بسيطة من حقن HTML عند عرض النصوص
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// جلب وعرض كل الأغراض
async function loadItems() {
  try {
    const res = await fetch('/api/items');
    const items = await res.json();

    itemsGrid.innerHTML = '';

    if (items.length === 0) {
      emptyState.style.display = 'block';
      itemsCount.textContent = '';
      return;
    }

    emptyState.style.display = 'none';
    itemsCount.textContent = `${items.length} غرض معروض للمقايضة`;

    items.forEach(item => {
      itemsGrid.appendChild(renderCard(item));
    });
  } catch (err) {
    console.error('فشل تحميل الأغراض:', err);
  }
}

// إرسال نموذج إضافة غرض جديد
itemForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  formError.textContent = '';

  const submitBtn = itemForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'جاري النشر...';

  try {
    const formData = new FormData(itemForm);
    const res = await fetch('/api/items', {
      method: 'POST',
      body: formData
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'حدث خطأ غير متوقع');
    }

    itemForm.reset();
    overlay.classList.remove('active');
    loadItems();
  } catch (err) {
    formError.textContent = err.message;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'نشر الإعلان';
  }
});

// التحميل الأولي
loadItems();
