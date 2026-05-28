# حاسبة فرق الرسم الكمركي العراقي

نظام متكامل لاحتساب الرسوم الكمركية العراقية مع مساعد الموظف الكمركي الذكي.

## المميزات

- قراءة المنفست بالذكاء الاصطناعي (GPT-4)
- احتساب فرق الرسم الكمركي
- الموظف الكمركي الذكي: تدقيق الشحنات، كشف المنتجات الممنوعة، الحماية الوطنية، الموافقات
- تصفح 12,601 منتج برمز HS أو الوصف العربي
- جداول التعرفة الجمركية الرسمية
- واجهة عربية RTL كاملة مع الوضع الداكن/الفاتح

## المتطلبات

- Node.js 18+
- PostgreSQL
- مفتاح OpenAI API (لميزة قراءة المنفست)

## الإعداد

### 1. نسخ ملف البيئة

```bash
cp .env.example .env
```

ثم عدّل `.env` وأضف قيمك:

```env
DATABASE_URL=postgresql://user:password@host:5432/dbname
SESSION_SECRET=your-strong-random-secret-here
OPENAI_API_KEY=sk-...
NODE_ENV=production
```

### 2. تثبيت الحزم

```bash
npm install
```

### 3. إعداد قاعدة البيانات

```bash
npm run db:push
```

### 4. تشغيل التطبيق

```bash
# وضع التطوير
npm run dev

# وضع الإنتاج
npm run build
npm start
```

التطبيق يعمل على المنفذ `5000` افتراضياً.

## النشر على Cloudflare Pages + Railway/Render

### الخلفية (Express + PostgreSQL)

انشر الـ Backend على [Railway](https://railway.app) أو [Render](https://render.com):

1. ربط مستودع GitHub
2. إضافة متغيرات البيئة من `.env.example`
3. أمر البناء: `npm run build`
4. أمر التشغيل: `npm start`
5. إضافة قاعدة بيانات PostgreSQL من نفس المنصة

### الواجهة الأمامية (Cloudflare Pages)

> **ملاحظة:** هذا التطبيق Full-Stack (Express + PostgreSQL + React). لا يمكن نشره مباشرة على Cloudflare Pages لأنه يحتاج خادم Node.js. الحل المثلى هو نشر الكامل على Railway/Render أو استخدام Replit Deployments.

إذا أردت استخدام Cloudflare فقط كـ CDN/DNS:
1. انشر التطبيق على Railway أو Render
2. افتح Cloudflare DNS
3. أضف CNAME يشير إلى دومين Railway/Render
4. اضبط Proxy Status على "DNS only"

## النشر على Replit (الأسهل)

اضغط زر **Publish** مباشرة — يتولى Replit كل شيء تلقائياً.

## هيكل المشروع

```
customs-calculator/
├── client/          # React + Vite (الواجهة)
│   └── src/
│       ├── pages/   # صفحات التطبيق
│       └── components/
├── server/          # Express API
│   ├── routes.ts    # نقاط API
│   ├── storage.ts   # قاعدة البيانات
│   └── index.ts     # نقطة الدخول
├── shared/          # أنواع مشتركة
└── .env.example     # نموذج متغيرات البيئة
```

## التقنيات المستخدمة

- **Frontend:** React 18 + Vite + Wouter + TanStack Query + Tailwind CSS + shadcn/ui
- **Backend:** Express 5 + Drizzle ORM + PostgreSQL
- **AI:** OpenAI GPT-4 Vision (قراءة المنفست)
- **OCR:** Tesseract.js
