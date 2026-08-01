let adminToken = localStorage.getItem('adminToken');

if (adminToken) {
    showDashboard();
}

async function login() {
    const password = document.getElementById('passwordInput').value;
    try {
        const res = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        const data = await res.json();
        if (data.success && data.token) {
            adminToken = data.token;
            localStorage.setItem('adminToken', adminToken);
            showDashboard();
        } else {
            alert('❌ كلمة المرور غير صحيحة');
        }
    } catch (err) {
        alert('❌ تعذر الاتصال بالسيرفر');
    }
}

function logout() {
    adminToken = null;
    localStorage.removeItem('adminToken');
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('dashboardScreen').classList.add('hidden');
}

function handleAuthError(status) {
    if (status === 401) {
        alert('⚠️ انتهت صلاحية جلستك، يرجى تسجيل الدخول من جديد');
        logout();
        return true;
    }
    return false;
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
        if (filterType) ads = ads.filter(ad => ad.adType === filterType);

        const searchTerm = document.getElementById('searchInput').value.toLowerCase();
        if (searchTerm) {
            ads = ads.filter(ad =>
                ad.name.toLowerCase().includes(searchTerm) ||
                ad.description.toLowerCase().includes(searchTerm)
            );
        }

        document.getElementById('statsContainer').innerHTML = `<div class="stat-card"><h3>${ads.length}</h3><p>إعلان</p></div>`;

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
            headers: { 'x-admin-token': adminToken }
        });
        if (response.ok) {
            alert('✅ تم حذف الإعلان بنجاح');
            loadAds();
        } else {
            if (handleAuthError(response.status)) return;
            const err = await response.json();
            alert('❌ ' + (err.error || 'فشل في الحذف'));
        }
    } catch (err) {
        alert('❌ خطأ في الاتصال');
    }
}

const ESCROW_STATUS_LABELS = {
    PENDING_PAYMENT: '⏳ بانتظار دفع المبلغ',
    PAYMENT_VERIFIED: '✅ تم تأكيد الدفع - بانتظار بيانات البائع',
    DATA_SUBMITTED: '📩 تم كشف البيانات للمشتري - بانتظار رده',
    PAYOUT_PENDING: '💸 بانتظار تحويلك للبائع',
    DISPUTED: '⚠️ نزاع - يحتاج قرارك',
    COMPLETED: '🎉 مكتملة',
    REFUNDED: '↩️ مُسترجعة'
};

function formatElapsed(timestamp) {
    if (!timestamp) return '';
    const diffMs = Date.now() - timestamp;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 60) return `منذ ${mins} دقيقة`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `منذ ${hours} ساعة`;
    const days = Math.floor(hours / 24);
    return `منذ ${days} يوم`;
}

async function loadEscrowSessions() {
    const container = document.getElementById('escrowContainer');
    try {
        const response = await fetch('/api/admin/escrow/pending', {
            headers: { 'x-admin-token': adminToken }
        });
        if (!response.ok) {
            if (handleAuthError(response.status)) return;
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
            const elapsed = formatElapsed(s.statusChangedAt || s.createdAt);
            const proofImg = s.paymentProof && s.paymentProof.screenshotUrl
                ? `<img class="proof-img" src="${s.paymentProof.screenshotUrl}" alt="إثبات الدفع">`
                : '<p>لا يوجد إثبات دفع مرفوع بعد</p>';

            let actionsHtml = '';
            if (s.status === 'PENDING_PAYMENT' && s.paymentProof) {
                actionsHtml = `<div class="actions"><button class="btn btn-success" onclick="verifyPayment('${s.id}')">✅ تأكيد استلام الدفع</button></div>`;
            } else if (s.status === 'DATA_SUBMITTED') {
                actionsHtml = `<div class="actions"><button class="btn btn-warning" onclick="forceComplete('${s.id}')">⏰ فرض الإتمام (المشتري غير مستجيب)</button></div>`;
            } else if (s.status === 'PAYOUT_PENDING') {
                actionsHtml = `<div class="actions"><button class="btn btn-info" onclick="markPaidSeller('${s.id}')">💸 أكدت تحويل ${s.dealAmount} د للبائع</button></div>`;
            } else if (s.status === 'DISPUTED') {
                actionsHtml = `<div class="actions">
                    <button class="btn btn-success" onclick="resolveDispute('${s.id}', 'proceed')">✅ إتمام الصفقة</button>
                    <button class="btn btn-danger" onclick="resolveDispute('${s.id}', 'refund')">↩️ استرجاع للمشتري</button>
                </div>`;
            }

            const disputeBox = (s.status === 'DISPUTED' && s.disputeReason)
                ? `<div class="dispute-box">⚠️ سبب البلاغ: ${s.disputeReason}</div>`
                : '';
            const forcedNote = s.forcedByAdmin ? '<p style="color:#f59e0b;">⏰ تم فرض هذه الصفقة يدوياً من الإدارة</p>' : '';

            return `
                <div class="escrow-card">
                    <span class="status-badge status-${s.status}">${statusLabel}</span>
                    <span class="elapsed-time">🕒 بهذه الحالة ${elapsed}</span>
                    <p>🎮 نوع اللعبة: ${s.gameType || 'غير محدد'}</p>
                    <p>👤 البائع (واتساب): ${s.sellerWhatsapp}</p>
                    <p>👤 المشتري (واتساب): ${s.buyerWhatsapp}</p>
                    <p>💰 سعر الحساب: ${s.dealAmount} دينار</p>
                    <p>💵 الإجمالي المطلوب: ${s.totalDue} دينار (شامل 5 د رسوم)</p>
                    ${disputeBox}
                    ${forcedNote}
                    ${proofImg}
                    ${actionsHtml}
                </div>
            `;
        }).join('');
    } catch (err) {
        console.error(err);
        container.innerHTML = '<p class="empty-msg">❌ خطأ في الاتصال بالسيرفر</p>';
    }
}

async function verifyPayment(sessionId) {
    if (!confirm('هل تأكدت من استلام المبلغ الإجمالي فعلياً؟')) return;
    try {
        const response = await fetch(`/api/admin/escrow/${sessionId}/verify-payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
            body: JSON.stringify({})
        });
        if (response.ok) {
            alert('✅ تم تأكيد الدفع، البائع صار يقدر يدخل بيانات الحساب');
            loadEscrowSessions();
        } else {
            if (handleAuthError(response.status)) return;
            const err = await response.json().catch(() => ({}));
            alert('❌ ' + (err.error || 'فشل تأكيد الدفع'));
        }
    } catch (err) {
        alert('❌ خطأ في الاتصال');
    }
}

async function markPaidSeller(sessionId) {
    if (!confirm('هل حوّلت فعلياً سعر الحساب للبائع خارج النظام (CliQ/Orange)؟ هذا الإجراء يغلق الصفقة نهائياً.')) return;
    try {
        const response = await fetch(`/api/admin/escrow/${sessionId}/mark-paid-seller`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
            body: JSON.stringify({})
        });
        if (response.ok) {
            alert('🎉 تم إغلاق الصفقة بنجاح');
            loadEscrowSessions();
        } else {
            if (handleAuthError(response.status)) return;
            const err = await response.json().catch(() => ({}));
            alert('❌ ' + (err.error || 'فشل تأكيد التحويل'));
        }
    } catch (err) {
        alert('❌ خطأ في الاتصال');
    }
}

async function forceComplete(sessionId) {
    if (!confirm('⚠️ استخدم هذا فقط لو حاولت تتواصل مع المشتري (واتساب) ولم يرد. سيتم اعتبار الصفقة مؤكدة وتحويل المبلغ للبائع. هل أنت متأكد؟')) return;
    try {
        const response = await fetch(`/api/admin/escrow/${sessionId}/force-complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
            body: JSON.stringify({})
        });
        if (response.ok) {
            alert('✅ تم فرض إتمام الصفقة، صارت جاهزة لتحويل المبلغ للبائع');
            loadEscrowSessions();
        } else {
            if (handleAuthError(response.status)) return;
            const err = await response.json().catch(() => ({}));
            alert('❌ ' + (err.error || 'فشل فرض الإتمام'));
        }
    } catch (err) {
        alert('❌ خطأ في الاتصال');
    }
}

async function resolveDispute(sessionId, resolution) {
    const confirmMsg = resolution === 'proceed'
        ? 'هل تأكدت إن الحساب صحيح ولا مشكلة فيه؟ سيتم المتابعة لتحويل المبلغ للبائع.'
        : 'هل قررت استرجاع كامل المبلغ للمشتري وإلغاء الصفقة؟';
    if (!confirm(confirmMsg)) return;
    try {
        const response = await fetch(`/api/admin/escrow/${sessionId}/resolve-dispute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
            body: JSON.stringify({ resolution })
        });
        if (response.ok) {
            alert('✅ تم تنفيذ القرار');
            loadEscrowSessions();
        } else {
            if (handleAuthError(response.status)) return;
            const err = await response.json().catch(() => ({}));
            alert('❌ ' + (err.error || 'فشل تنفيذ القرار'));
        }
    } catch (err) {
        alert('❌ خطأ في الاتصال');
    }
}
