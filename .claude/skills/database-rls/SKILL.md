---
name: database-rls
description: Use when designing PostgreSQL/Supabase data models, migrations and Row Level Security with least privilege.
---
# database-rls

## خطوات
1. افصل أدوار الزائر والمدير والخدمة وحدد ملكية البيانات.
2. صمم الجداول والمفاتيح والعلاقات وفهارس الاستخدام المتوقعة.
3. فعّل RLS على الجداول المكشوفة، مع سياسات deny-by-default واختبارات كل دور.
4. اختبر الوصول إلى بيانات مستخدم آخر، وحدود الحذف والتعديل، وسجّل rollback migration.
5. لا تضع `service_role` أو بيانات اعتماد قواعد البيانات في متصفح أو repo.
6. استخدم بيئة تطوير؛ لا تطبّق migrations على إنتاج دون موافقة ونسخة احتياطية.

## التسليم
ERD، migrations مقترحة، اختبارات RLS، خطة rollback.

## قيود عامة
- اقرأ فقط الملفات اللازمة للمهمة.
- التزم بـ `AGENTS.md` في جذر المشروع وسياسات `06-SECURITY`.
- لا تدّع تشغيل أداة أو اجتياز اختبار لم يحدث.
- تأكيد بشري قبل تثبيت أو نشر أو الوصول لإنتاج.
