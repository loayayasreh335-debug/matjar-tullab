const ADMIN_PASSWORD = 'admin123';
let isLoggedIn = false;

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
    loadEscrowSessions();
}

async function loadAds() {
    try {
        const response = await fetch('/api/items');
        let ads = await response.json();

        const filterType = document.getElementById('filterType').value;
        if (filterType) {
            ads = ads.filter(ad => ad.adType === filterType);
        }

        const searchTerm = document.getElementById('searchInput').value.toLowerCase();
        if (searchTerm) {
            ads = ads.filter(ad =>
                ad.name.toLowerCase().includes(searchTerm) ||
                ad.description.toLowerCase().includes(searchTerm)
            );
        }

        document.getElementById('statsContainer').innerHTML = `
            <div class="stat-card"><h3>${ads.length}</h3><p>إعلان</p></div>
        `;

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

const ESCROW_STATUS_LABELS = {
    PENDING_PAYMENT: '⏳ بانتظار دفع الرسوم',
    PAYMENT_VERIFIED: '✅ تم تأكيد الدفع - بانتظار بيانات البائع',
    DATA_SUBMITTED: '📩 تم استلام بيانات الحساب - بانتظار تأكيد الطرفين',
    AWAITING_BOTH_CONFIRM: '🤝 بانتظار تأكيد الاستلام من الطرفين',
    COMPLETED: '🎉 مكتملة'
};

async function loadEscrowSessions() {
    const container = document.getElementById('escrowContainer');
    try {
        const response = await fetch('/api/admin/escrow/pending', {
            headers: { 'x-admin-password': ADMIN_PASSWORD }
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            container.innerHTML = `<p class="empty-msg">❌ ${err.error || 'تعذر جلب طلبات الوسيط'}</p>`;
            return;
        }
        const data = await response.json();
        const sessions = data.sessions || [];

        if (sessions.length === 0) {
            container.innerHTML = '<p class="empty-msg">لا توجد طلبات وسيط معلّقة حالياً</p>';
            return;
        }

        container.innerHTML = sessions.map(s => {
            const statusLabel = ESCROW_STATUS_LABELS[s.status] || s.status;
            const proofImg = s.paymentProof && s.paymentProof.screenshotUrl
                ? `<img class="proof-img" src="${s.paymentProof.screenshotUrl}" alt="إثبات الدفع">`
                : '<p>لا يوجد إثبات دفع مرفوع بعد</p>';
            const showConfirmBtn = s.status === 'PENDING_PAYMENT' && s.paymentProof;
            return `
                <div class="escrow-card">
                    <span class="status-badge status-${s.status}">${statusLabel}</span>
                    <p>🎮 نوع اللعبة: ${s.gameType || 'غير محدد'}</p>
                    <p>👤 البائع (واتساب): ${s.sellerWhatsapp}</p>
                    <p>👤 المشتري (واتساب): ${s.buyerWhatsapp}</p>
                    <p>💵 الرسوم: ${s.feeAmount} دينار</p>
                    ${proofImg}
                    ${showConfirmBtn ? `<button class="btn btn-success" style="width:100%;margin-top:10px;" onclick="confirmEscrowPayment('${s.id}')">✅ تأكيد استلام الدفع</button>` : ''}
                </div>
            `;
        }).join('');
    } catch (err) {
        console.error(err);
        container.innerHTML = '<p class="empty-msg">❌ خطأ في الاتصال بالسيرفر</p>';
    }
}

async function confirmEscrowPayment(sessionId) {
    if (!confirm('هل تأكدت من استلام مبلغ الـ5 دينار فعلياً؟')) return;
    try {
        const response = await fetch(`/api/admin/escrow/${sessionId}/verify-payment`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-password': ADMIN_PASSWORD
            },
            body: JSON.stringify({})
        });
        if (response.ok) {
            alert('✅ تم تأكيد الدفع، البائع صار يقدر يدخل بيانات الحساب');
            loadEscrowSessions();
        } else {
            const err = await response.json().catch(() => ({}));
            alert('❌ ' + (err.error || 'فشل تأكيد الدفع'));
        }
    } catch (err) {
        alert('❌ خطأ في الاتصال');
    }
}
