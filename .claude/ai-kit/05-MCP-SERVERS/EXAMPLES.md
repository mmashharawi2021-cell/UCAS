# أمثلة توجيهية للربط — تتطلب تهيئة يدوية

## GitHub
المصدر: https://github.com/github/github-mcp-server
اختر Read-only mode في العميل أو الخادم، وحدد المستودعات/الأذونات المطلوبة. **لا تضف PAT إلى ملفات Git.**

## Supabase
المصدر: https://supabase.com/docs/guides/ai-tools/mcp
في شاشة إعداد MCP الرسمية: اختر مشروعًا تجريبيًا محددًا، وفعّل `read_only=true`، وقيّد feature groups. مثال لشكل عنوان فقط (غير فعال، مع placeholder):
`https://mcp.supabase.com/mcp?project_ref=REPLACE_WITH_STAGING_PROJECT_REF&read_only=true&features=database%2Cdocs`
لا تربط قاعدة الإنتاج أو بيانات المستخدمين الحقيقية مع وكيل لمجرد سهولة الاستخدام.

## Playwright
المصدر: https://github.com/microsoft/playwright-mcp
ابدأ بصفحة محلية مأذون بها. ثبّت نسخة تبعية موثقة بعد مراجعتها بدل تنزيل `latest` دون تتبع. اضبط النطاق المسموح في البيئة/الحساب وليس فقط النص.

## قبل التشغيل
فحص المصدر والرخصة والنسخة والعميل والبيانات المتاحة ثم موافقة صريحة + سجل تغيير. **لم تفعّل هذه الحزمة أي خادم**.
