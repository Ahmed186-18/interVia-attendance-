# InterVia Attendance

نظام عربي لإدارة الحضور والموظفين والمشاريع والمهام والتسليمات المرتبطة بـ Dropbox.

## التشغيل المحلي

يتطلب المشروع Node.js 20 أو أحدث وقاعدة PostgreSQL.

1. انسخ `.env.example` إلى `.env` وأدخل القيم الحقيقية.
2. ثبّت الحزم: `npm install`.
3. طبّق قاعدة البيانات: `npm run db:migrate:deploy`.
4. أنشئ المدير الأول: `npm run db:seed`.
5. شغّل التطبيق: `npm run dev`.

## النشر على Vercel

اربط هذا المستودع بمشروع Vercel، واربط قاعدة PostgreSQL مُدارة مثل Neon أو Supabase أو Prisma Postgres، ثم أضف متغيرات Production التالية:

| المتغير | مطلوب | الاستخدام |
| --- | --- | --- |
| `DATABASE_URL` | نعم | رابط PostgreSQL مع SSL ويفضل أن يكون pooled للـ serverless |
| `JWT_SECRET` | نعم | سر عشوائي بطول 32 حرفاً على الأقل |
| `CRON_SECRET` | نعم | سر مختلف لحماية مسار المهام المجدولة |
| `INTEGRATION_ENCRYPTION_KEY` | موصى به | تشفير بيانات Dropbox المخزنة في قاعدة البيانات |
| `SEED_ADMIN_NAME` | نعم | اسم المدير الأول |
| `SEED_ADMIN_EMAIL` | نعم | بريد المدير الأول |
| `SEED_ADMIN_PASSWORD` | نعم | كلمة مرور أولية قوية بطول 12 حرفاً على الأقل |
| `SEED_ADMIN_COUNTRY` | اختياري | دولة المدير |
| `SEED_ADMIN_TIMEZONE` | اختياري | المنطقة الزمنية، والافتراضي `Asia/Hebron` |
| `NEXT_PUBLIC_APP_NAME` | اختياري | اسم التطبيق الظاهر |
| `DROPBOX_APP_KEY` | للتسليمات | مفتاح تطبيق Dropbox |
| `DROPBOX_APP_SECRET` | للتسليمات | سر تطبيق Dropbox |
| `DROPBOX_REFRESH_TOKEN` | للتسليمات | Refresh token طويل الأجل |
| `DROPBOX_TEAM_MEMBER_ID` | حسب الحساب | مطلوب عند استخدام توكن Dropbox Business للفريق |

أمر Vercel يبني Prisma Client، يطبق migrations الآمنة، ينشئ المدير إن لم يكن موجوداً، ثم يبني Next.js. عملية seed لا تغيّر حساب مدير موجود.

## المهام المجدولة

المسار `/api/cron/maintenance` محمي تلقائياً بواسطة `CRON_SECRET` ويقوم بـ:

- إغلاق سجلات الحضور المتروكة مفتوحة.
- إرسال إشعار للموظف عند الإغلاق التلقائي.
- حذف المشاريع التي تجاوزت مدة الاحتفاظ في سلة المهملات.

الإعداد الافتراضي في `vercel.json` يعمل يومياً الساعة `21:05 UTC` ليتوافق مع Vercel Hobby. على Vercel Pro يمكن تغيير الجدول إلى `5 * * * *` لتشغيل الصيانة كل ساعة بدقة أعلى.

## أوامر التحقق

```bash
npm run lint
npm run build
npm run test:notifications
```

لا ترفع ملفات `.env` أو قواعد البيانات المحلية أو أي مفاتيح Dropbox إلى GitHub.
