const ADMIN_PASSWORD = 'admin123';
let isLoggedIn = false;

// التحقق من تسجيل الدخول عند التحميل
if (localStorage.getItem('adminLoggedIn') === 'true') {
    showDashboard();
}

function login() {
    const password = document.getElementById('passwordInput').value;
    if (password === ADMIN_PASSWORD) {
        localStorage.setItem('adminLoggedIn', 'true');
        showDashboard();
    } else {
        alert('❌ كلمة المرور غير صحيحة');
    }
}

function logout() {
    localStorage.removeItem('adminLoggedIn');
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('dashboardScreen').classList.add('hidden');
}

function showDashboard() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('dashboardScreen').classList.remove('hidden');
    loadAds();
}

async function loadAds() {
    try {
        const response = await fetch('/api/items');
        let ads = await response.json();
        
        // فلترة حسب النوع
        const filterType = document.getElementById('filterType').value;
        if (filterType) {
            ads = ads.filter(ad => ad.adType === filterType);
        }
        
        // بحث
        const searchTerm = document.getElementById('searchInput').value.toLowerCase();
        if (searchTerm) {
            ads = ads.filter(ad => 
                ad.name.toLowerCase().includes(searchTerm) ||
                ad.description.toLowerCase().includes(searchTerm)
            );
        }
        
        // إحصائيات
        document.getElementById('statsContainer').innerHTML = `
            <div class="stat-card"><h3>${ads.length}</h3><p>إعلان</p></div>
        `;
        
        // عرض الإعلانات
        const container = document.getElementById('adsContainer');
        if (ads.length === 0) {
            container.innerHTML = '<p style="text-align:center;grid-column:1/-1;">لا توجد إعلانات</p>';
            return;
        }
        
        container.innerHTML = ads.map(ad => `
            <div class="ad-card">
                <img src="${ad.imageUrls && ad.imageUrls[0] ? ad.imageUrls[0] : 'https://placehold.co/600x400/e5e7eb/6b7280?text=No+Image'}" alt="${ad.name}">
                <button class="delete-btn" onclick="deleteAd('${ad.id}')">🗑️ حذف</button>
                <div class="info">
                    <h3>${ad.name}</h3>
                    <p>📦 ${ad.adType === 'sell' ? 'بيع' : ad.adType === 'barter' ? 'مقايضة' : 'مزاد'}</p>
                    ${ad.price ? `<p>💰 ${ad.price} دينار</p>` : ''}
                    <p>📍 ${ad.governorate} - ${ad.area}</p>
                    <p>📱 ${ad.whatsapp}</p>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error(err);
        alert('خطأ في تحميل الإعلانات');
    }
}

async function deleteAd(itemId) {
    if (!confirm('🗑️ هل أنت متأكد من حذف هذا الإعلان؟')) return;
    
    try {
        const response = await fetch(`/api/admin/items/${itemId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ adminPassword: ADMIN_PASSWORD })
        });
        
        if (response.ok) {
            alert('✅ تم حذف الإعلان بنجاح');
            loadAds();
        } else {
            const err = await response.json();
            alert('❌ ' + (err.error || 'فشل في الحذف'));
        }
    } catch (err) {
        alert('❌ خطأ في الاتصال');
    }
}
