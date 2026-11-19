# Sh_Store — شجرتي

متجر عربي RTL لبيع زيت الزيتون، مبني بملفات HTML/CSS/JavaScript خفيفة، مع Cloudflare Worker وD1 لإدارة المنتجات والطلبات.

## التشغيل المحلي

```bash
python3 -m http.server 4173
```

ثم افتح `http://localhost:4173`، ولوحة الإدارة من `http://localhost:4173/admin.html`.

## الخدمات

- Worker API: `https://shagarty-store-api.youssefzeweil1.workers.dev`
- قاعدة البيانات: Cloudflare D1 باسم `shagarty_store`.
- صور المنتجات: مجلد Cloudinary `shagarty/products`.
- الدفع اليدوي: Vodafone Cash على الرقم `01014761698`.
- الطلبات: زر إتمام الطلب يفتح WhatsApp على الرقم `01014761698` برسالة المنتجات والإجمالي.

## لوحة الإدارة

افتح `admin.html` وأدخل رمز الأدمن. الرمز محفوظ داخل Cloudflare Worker Secret باسم `ADMIN_TOKEN`، ولا يوجد داخل GitHub أو ملفات الواجهة. تستخدم اللوحة واجهات المنتجات والطلبات المحمية برأس `X-Admin-Token`.

رفع الصور إلى Cloudinary يحتاج رابط الصورة أو إعداد Upload Preset مناسب؛ حقل رابط الصورة جاهز حاليًا في لوحة الإدارة.
