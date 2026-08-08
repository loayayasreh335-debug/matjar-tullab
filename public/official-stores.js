// public/official-stores.js

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

let activeCategory = '';
let activeSearch = '';

function renderShell() {
  const root = document.getElementById('officialStoresRoot');
  root.innerHTML = `
    <div class="ofs-hero">
      <h1>المتاجر الرسمية 🏬</h1>
      <p>محلات موثّقة على منصة سوقنا، تقدر تتواصل معهم مباشرة وتتصفح منتجاتهم</p>
    </div>

    <div class="ofs-filter-bar">
      <input id="ofsSearch" type="text" placeholder="ابحث عن محل..." class="ofs-input">
      <select id="ofsCategory" class="ofs-input">
        <option value="">كل التصنيفات</option>
        <option value="ملابس وأزياء">ملابس وأزياء</option>
        <option value="مطاعم وكافيهات">مطاعم وكافيهات</option>
        <option value="إلكترونيات">إلكترونيات</option>
        <option value="خدمات">خدمات</option>
        <option value="أخرى">أخرى</option>
      </select>
    </div>

    <div class="ofs-grid" id="ofsGrid"></div>
  `;

  document.getElementById('ofsSearch').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      activeSearch = e.target.value;
      loadStores();
    }
  });
  document.getElementById('ofsCategory').addEventListener('change', (e) => {
    activeCategory = e.target.value;
    loadStores();
  });
}

async function loadStores() {
  const grid = document.getElementById('ofsGrid');
  grid.innerHTML = '<p class="ofs-loading">جاري التحميل...</p>';

  const params = new URLSearchParams();
  if (activeCategory) params.set('category', activeCategory);
  if (activeSearch) params.set('q', activeSearch);

  const res = await fetch(`/api/stores?${params}`);
  const data = await res.json();
  const stores = data.stores || [];

  if (stores.length === 0) {
    grid.innerHTML = '<p class="ofs-empty">ما في محلات مطابقة حالياً</p>';
    return;
  }

  grid.innerHTML = stores
    .map(
      (s) => `
    <a class="ofs-card" href="/store.html?slug=${s.slug}">
      <div class="ofs-card-cover" style="${
        s.coverImageUrl ? `background-image:url('${s.coverImageUrl}')` : ''
      }"></div>
      <div class="ofs-card-body">
        <div class="ofs-card-logo">
          ${
            s.logoUrl
              ? `<img src="${s.logoUrl}" alt="${escapeHtml(s.name)}">`
              : `<span>${escapeHtml(s.name).charAt(0)}</span>`
          }
        </div>
        <div class="ofs-card-info">
          <div class="ofs-card-name-row">
            <h3>${escapeHtml(s.name)}</h3>
            ${s.isVerified ? '<span class="ofs-verified-dot" title="موثّق">✅</span>' : ''}
          </div>
          ${s.category ? `<p>${escapeHtml(s.category)}</p>` : ''}
        </div>
      </div>
    </a>`
    )
    .join('');
}

document.addEventListener('DOMContentLoaded', () => {
  renderShell();
  loadStores();
});

