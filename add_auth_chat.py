path = "server.js"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

old = "    require('./routes-auctions')(app, { db, crypto, uploadImageToCloudinary, deleteImagesFromCloudinary, upload, ADMIN_PASSWORD, issueAdminToken, requireAdminToken });"

new = """    require('./routes-auth')(app, { db, crypto });
    require('./routes-chat')(app, { db });
    require('./routes-auctions')(app, { db, crypto, uploadImageToCloudinary, deleteImagesFromCloudinary, upload, ADMIN_PASSWORD, issueAdminToken, requireAdminToken });"""

if old in content:
    content = content.replace(old, new)
else:
    print("⚠️ لم يتم إيجاد سطر routes-auctions - توقف، أرسل نسخة محدثة من server.js")
    exit()

old2 = "    require('./routes-lostfound')(app, { db, crypto, uploadImageToCloudinary, deleteImagesFromCloudinary, upload, requireAdminToken, JORDAN_LOCATIONS });"
new2 = "    require('./routes-lostfound')(app, { db, crypto, uploadImageToCloudinary, deleteImagesFromCloudinary, upload, requireAdminToken, JORDAN_LOCATIONS, requireUserAuth: app.locals.requireUserAuth });"

if old2 in content:
    content = content.replace(old2, new2)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print("✅ تم تسجيل routes-auth و routes-chat وتحديث routes-lostfound بنجاح")
else:
    print("⚠️ لم يتم إيجاد سطر routes-lostfound - راجع يدوياً")
