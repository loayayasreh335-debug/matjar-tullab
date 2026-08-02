#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
rebrand.py
سكريبت إعادة تسمية المشروع من "متجر الطلاب" إلى "سوقنا"
شغّله من داخل مجلد المشروع مباشرة: python3 rebrand.py
"""

import os
import re

# ---------- الإعدادات ----------
PROJECT_ROOT = os.getcwd()

SKIP_DIR_NAMES = {
    'node_modules', 'uploads', 'data', 'current-state',
    '.git', 'current-state', 'current-state.zip'
}

VALID_EXTENSIONS = {'.html', '.js', '.css'}

# نصوص العلامة التجارية القديمة -> الجديدة
TEXT_REPLACEMENTS = [
    ('متجر الطلاب', 'سوقنا'),
    ('متجر طلاب', 'سوقنا'),
    ('Matjar Tullab', 'Sooqna'),
    ('matjar tullab', 'sooqna'),
    ('MATJAR TULLAB', 'SOOQNA'),
]

# التصنيفات العامة الجديدة التي تُضاف بجانب التصنيفات الطلابية الموجودة (بدون حذف أي شي)
NEW_GENERAL_CATEGORIES = [
    'سيارات ومركبات',
    'عقارات وسكن',
    'أجهزة منزلية',
    'وظائف وخدمات',
    'حيوانات أليفة',
    'رياضة وهوايات'
]

LOGO_IMG_TAG = '<img src="/logo.png" alt="سوقنا" style="height:40px;vertical-align:middle;">'

report = []


def should_skip(path):
    rel = os.path.relpath(path, PROJECT_ROOT)
    parts = rel.split(os.sep)
    return any(p in SKIP_DIR_NAMES or '.backup' in p for p in parts)


def collect_target_files():
    targets = []
    # ملفات public/
    public_dir = os.path.join(PROJECT_ROOT, 'public')
    if os.path.isdir(public_dir):
        for root, dirs, files in os.walk(public_dir):
            dirs[:] = [d for d in dirs if d not in SKIP_DIR_NAMES]
            for f in files:
                full = os.path.join(root, f)
                if should_skip(full):
                    continue
                if os.path.splitext(f)[1] in VALID_EXTENSIONS:
                    targets.append(full)

    # ملفات .js بجذر المشروع (server.js, routes-*.js) بدون node_modules/backups
    for f in os.listdir(PROJECT_ROOT):
        full = os.path.join(PROJECT_ROOT, f)
        if os.path.isfile(full) and f.endswith('.js') and '.backup' not in f:
            targets.append(full)

    return sorted(set(targets))


def apply_text_replacements(text):
    count = 0
    for old, new in TEXT_REPLACEMENTS:
        occurrences = text.count(old)
        if occurrences:
            text = text.replace(old, new)
            count += occurrences
    return text, count


def apply_logo_replacement(text):
    count = text.count('🎓')
    if count:
        text = text.replace('🎓', LOGO_IMG_TAG)
    return text, count


def ensure_favicon(text, is_html):
    if not is_html:
        return text, False
    if '<head>' not in text:
        return text, False

    if 'rel="icon"' in text or "rel='icon'" in text:
        # حدّث أي favicon موجود مسبقاً ليشير للوجو الجديد
        new_text = re.sub(
            r'<link[^>]*rel=["\']icon["\'][^>]*>',
            '<link rel="icon" type="image/png" href="/logo.png">',
            text
        )
        return new_text, new_text != text
    else:
        new_text = text.replace('<head>', '<head>\n  <link rel="icon" type="image/png" href="/logo.png">', 1)
        return new_text, True


def update_categories_array(text):
    """يضيف التصنيفات العامة الجديدة داخل مصفوفة CATEGORIES في server.js دون حذف أي تصنيف موجود."""
    pattern = re.compile(r"const CATEGORIES = \[(.*?)\];", re.DOTALL)
    match = pattern.search(text)
    if not match:
        return text, False

    inner = match.group(1)
    existing_items = re.findall(r"'([^']*)'", inner)

    already_present = set(existing_items)
    to_add = [c for c in NEW_GENERAL_CATEGORIES if c not in already_present]
    if not to_add:
        return text, False

    # نحافظ على 'أخرى' كآخر عنصر لو كانت موجودة أصلاً
    has_other = 'أخرى' in existing_items
    base_items = [c for c in existing_items if c != 'أخرى']
    new_items = base_items + to_add + (['أخرى'] if has_other else [])

    formatted = ",\n  ".join(f"'{c}'" for c in new_items)
    new_block = f"const CATEGORIES = [\n  {formatted}\n];"

    new_text = text[:match.start()] + new_block + text[match.end():]
    return new_text, True


def process_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        original = f.read()

    text = original
    total_changes = 0
    notes = []

    text, n = apply_text_replacements(text)
    if n:
        total_changes += n
        notes.append(f"استبدال اسم العلامة التجارية ×{n}")

    text, n = apply_logo_replacement(text)
    if n:
        total_changes += n
        notes.append(f"استبدال أيقونة التخرج بالشعار ×{n}")

    is_html = path.endswith('.html')
    text, changed = ensure_favicon(text, is_html)
    if changed:
        total_changes += 1
        notes.append("تحديث/إضافة الفافيكون")

    if os.path.basename(path) == 'server.js':
        text, changed = update_categories_array(text)
        if changed:
            total_changes += 1
            notes.append("إضافة تصنيفات عامة جديدة")

    if total_changes > 0:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(text)
        rel = os.path.relpath(path, PROJECT_ROOT)
        report.append((rel, notes))

    return total_changes


def main():
    targets = collect_target_files()
    print(f"🔍 فحص {len(targets)} ملف...")

    total = 0
    for path in targets:
        try:
            total += process_file(path)
        except Exception as e:
            print(f"⚠️ تعذر معالجة {path}: {e}")

    print("\n" + "=" * 50)
    if not report:
        print("لم يتم العثور على أي نص يحتاج تعديل.")
    else:
        for rel, notes in report:
            print(f"✅ {rel}")
            for note in notes:
                print(f"   - {note}")
    print("=" * 50)
    print(f"\nإجمالي التعديلات: {total} داخل {len(report)} ملف")
    print("\n⚠️ تذكير: لازم تحط ملف الشعار الجديد بالمسار public/logo.png يدوياً قبل الرفع.")


if __name__ == '__main__':
    main()
