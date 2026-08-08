// public/store-stories.js
// شريط دوائر المتاجر المميزة (زي ستوريز الانستقرام) — يُحط تحت صف الفلاتر
// وفوق الإعلانات بالصفحة الرئيسية. يحتاج <div id="storeStoriesBar"></div>

async function loadStoreStories() {
  const bar = document.getElementById('storeStoriesBar');
  if (!bar) return;

  try {
    const res = await fetch('/api/stores/featured');
    const data = await res.json();
    const stores = data.stores || [];

    if (stores.length === 0) {
      bar.style.display = 'none';
      return;
    }

    bar.innerHTML = stores
      .map(
        (s) => `
      <a class="store-story-item" href="/store.html?slug=${s.slug}">
        <div class="store-story-ring">
          <div class="store-story-avatar">
            ${
              s.logoUrl
                ? `<img src="${s.logoUrl}" alt="${escapeStoryName(s.name)}">`
                : `<span>${escapeStoryName(s.name).charAt(0)}</span>`
            }
          </div>
        </div>
        <span class="store-story-name">${escapeStoryName(s.name)}</span>
      </a>`
      )
      .join('');
  } catch (err) {
    bar.style.display = 'none';
  }
}

function escapeStoryName(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', loadStoreStories);

