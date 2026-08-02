path = "public/index.html"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

old = '<button id="myAdsBtn" class="btn btn-ghost">📋 إعلاناتي</button>'
new = old + '\n        <a href="/lostfound.html" class="btn btn-ghost">🔍 المفقودات</a>\n        <div id="authWidget"></div>'

old2 = '  <script src="script.js"></script>'
new2 = '''  <link rel="stylesheet" href="chat.css">
  <div id="chatRoot"></div>
  <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>
  <script src="auth.js"></script>
  <script src="chat.js"></script>
  <script src="script.js"></script>'''

ok1 = old in content
ok2 = old2 in content

if ok1:
    content = content.replace(old, new)
if ok2:
    content = content.replace(old2, new2)

if ok1 and ok2:
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print("✅ تم إضافة زر الدخول والشات بالصفحة الرئيسية بنجاح")
else:
    print(f"⚠️ نتيجة البحث: زر إعلاناتي={ok1}, وسم السكريبت={ok2} - راجع يدوياً")
