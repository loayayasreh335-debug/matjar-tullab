path = "public/script.js"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

old = '<img src="/logo.png" alt="سوقنا" style="height:40px;vertical-align:middle;">'
new = '🎓'

if old in content:
    content = content.replace(old, new)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print("✅ تم تعديل script.js بنجاح")
else:
    print("⚠️ لم يتم إيجاد النص - تحقق يدوياً")
