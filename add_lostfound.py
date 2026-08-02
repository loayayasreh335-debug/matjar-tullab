# 1) تسجيل routes-lostfound.js بـ server.js بعد سطر routes-escrow مباشرة
path = "server.js"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

old = "    require('./routes-escrow')(app, { db, crypto, ADMIN_PASSWORD, upload, uploadImageToCloudinary, requireAdminToken });"
new = old + "\n    require('./routes-lostfound')(app, { db, crypto, uploadImageToCloudinary, deleteImagesFromCloudinary, upload, requireAdminToken, JORDAN_LOCATIONS });"

if old in content:
    content = content.replace(old, new)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print("✅ تم تسجيل routes-lostfound.js بنجاح")
else:
    print("⚠️ لم يتم إيجاد السطر بـ server.js - أرسل نسخة محدثة لأتحقق")

# 2) إضافة زر "المفقودات" بهيدر الصفحة الرئيسية
path2 = "public/index.html"
with open(path2, "r", encoding="utf-8") as f:
    content2 = f.read()

old2 = '<button id="myAdsBtn" class="btn btn-ghost">📋 إعلاناتي</button>'
new2 = old2 + '\n        <a href="/lostfound.html" class="btn btn-ghost">🔍 المفقودات</a>'

if old2 in content2:
    content2 = content2.replace(old2, new2)
    with open(path2, "w", encoding="utf-8") as f:
        f.write(content2)
    print("✅ تم إضافة زر المفقودات بالهيدر بنجاح")
else:
    print("⚠️ لم يتم إيجاد السطر بـ index.html - أرسل نسخة محدثة لأتحقق")
