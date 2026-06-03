# 🤖 بوت تيليجرام - توليد صور وتحليل وجوه

بوت تيليجرام يعمل بالذكاء الاصطناعي لتوليد الصور وتحليل الوجوه عبر DeepAI.

## المميزات

- 🎨 **توليد صور** من وصف نصي باستخدام DeepAI Text2Image
- 👤 **تحليل الوجوه** (العمر، الجنس، المشاعر، الجنسية)
- 🔄 إعادة محاولة تلقائية عند الفشل المؤقت
- 💡 تكييف تلقائي للـ prompt لضمان أفضل نتيجة

## الأوامر

| الأمر | الوظيفة |
|-------|---------|
| `/image [وصف]` | توليد صورة |
| `/imagine [وصف]` | توليد صورة (بديل) |
| صورة + `/face` | تحليل الوجوه |
| صورة + `/analyze` | تحليل الوجوه (بديل) |
| `/help` | عرض المساعدة |

## المتطلبات

- Node.js 24+
- pnpm
- حساب DeepAI: [deepai.org](https://deepai.org)
- بوت تيليجرام من [@BotFather](https://t.me/BotFather)

## التثبيت

```bash
git clone https://github.com/hackerdarkapp-hash/bot-tzeef.git
cd bot-tzeef
pnpm install
```

## المتغيرات البيئية

```env
TELEGRAM_BOT_TOKEN=your_bot_token
DEEPAI_API_KEY=your_deepai_key
DATABASE_URL=your_postgres_url
PORT=5000
```

## التشغيل

```bash
pnpm --filter @workspace/api-server run dev
```

## التقنيات

- **Runtime**: Node.js 24 + TypeScript
- **Framework**: Express 5
- **Bot**: Telegraf
- **AI**: DeepAI API
- **DB**: PostgreSQL + Drizzle ORM
