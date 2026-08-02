path = "public/style.css"
with open(path, "r", encoding="utf-8") as f:
    content = f.read()

old = '.logo {\n  font-size: 20px;\n  font-weight: 800;\n  color: var(--navy);'
new = '.logo {\n  font-size: 20px;\n  font-weight: 800;\n  color: var(--navy);\n}\n\nhtml[data-theme="dark"] .logo {\n  color: var(--text-dark);'

if old in content:
    content = content.replace(old, new)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print("✅ تم إصلاح لون اللوجو بالوضع الداكن")
else:
    print("⚠️ لم يتم إيجاد النص المطلوب - أرسل نسخة style.css الحالية لأتحقق")
