# موقع التقديم - النسخة الثانية

هذه النسخة تضيف Backend + SQLite + رفع ملفات + لوحة تحكم للإدارة.

## المتطلبات
- Node.js 18 أو أحدث

## التشغيل

افتح Terminal داخل مجلد المشروع:

```bash
npm install
npm start
```

ثم افتح:

http://localhost:3000

لوحة الإدارة:

http://localhost:3000/admin.html

كلمة مرور الإدارة الافتراضية:

ChangeMe123!

## تغيير كلمة المرور

Windows PowerShell:

```powershell
$env:ADMIN_PASSWORD="ضع-كلمة-مرور-قوية-هنا"
npm start
```

Windows CMD:

```cmd
set ADMIN_PASSWORD=ضع-كلمة-مرور-قوية-هنا
npm start
```

macOS / Linux:

```bash
ADMIN_PASSWORD="ضع-كلمة-مرور-قوية-هنا" npm start
```

## أين تحفظ البيانات؟

- قاعدة البيانات: `data/applications.db`
- الملفات المرفوعة: `data/uploads/`

## ملاحظة مهمة

هذه نسخة تطوير محلية. قبل نشرها للعامة يجب إضافة حماية أقوى للوحة الإدارة، HTTPS، إدارة جلسات آمنة، حماية CSRF، وقيود وصول مناسبة للملفات.
