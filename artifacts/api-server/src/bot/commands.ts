import { Context, Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import { generateImage, analyzeImage } from "./deepai";
import { enhancePrompt, adaptPrompt, isContentBlock, isTransient, friendlyError } from "./prompt";
import { logger } from "../lib/logger";

const HELP_TEXT = `🤖 *بوت الذكاء الاصطناعي*

الأوامر المتاحة:

🎨 *توليد صور:*
\`/image [وصف الصورة]\`
مثال: \`/image غروب الشمس على البحر\`

\`/imagine [وصف الصورة]\`
مثال: \`/imagine مدينة مستقبلية ليلاً\`

👤 *تحليل الوجوه:*
أرسل صورة مع التعليق \`/face\` أو \`/analyze\`

ℹ️ /help — عرض هذه الرسالة`;

async function handleStart(ctx: Context) {
  await ctx.reply(
    `👋 أهلاً! أنا بوت ذكاء اصطناعي يمكنه:\n\n` +
      `🎨 *توليد صور* من أي وصف نصي\n` +
      `👤 *تحليل الوجوه* في الصور\n\n` +
      `اكتب /help لمعرفة الأوامر المتاحة`,
    { parse_mode: "Markdown" },
  );
}

async function handleHelp(ctx: Context) {
  await ctx.reply(HELP_TEXT, { parse_mode: "Markdown" });
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function deleteMsg(ctx: Context, messageId: number) {
  try {
    await ctx.telegram.deleteMessage(ctx.chat!.id, messageId);
  } catch { /* ignore */ }
}

/**
 * Full generation pipeline — "maximize completion" strategy:
 *
 * 1. Try enhanced prompt (+ 1 auto-retry on transient errors)
 * 2. If DeepAI returns a content block → auto-adapt prompt, retry silently
 * 3. Only fail to the user when every attempt is exhausted
 */
async function generateWithFallback(raw: string): Promise<Buffer> {
  const enhanced = enhancePrompt(raw);

  // Attempt 1: enhanced prompt
  try {
    return await generateImage(enhanced);
  } catch (err) {
    // Retry once on transient failures
    if (isTransient(err)) {
      await sleep(2500);
      try {
        return await generateImage(enhanced);
      } catch (retryErr) {
        // Fall through to content-block check below
        if (!isContentBlock(retryErr)) throw retryErr;
      }
    }

    // Attempt 2: if content block → adapt and retry
    if (isContentBlock(err)) {
      const adapted = adaptPrompt(raw);

      // Only retry if adaptation actually changed the prompt
      if (adapted !== enhanced) {
        logger.info({ raw, adapted }, "Content block — retrying with adapted prompt");
        await sleep(1000);
        return await generateImage(adapted);
      }
    }

    throw err;
  }
}

async function handleImageGeneration(
  ctx: Context & { message: { text: string } },
) {
  const raw = ctx.message.text.replace(/^\/(image|imagine)\s*/i, "").trim();

  if (!raw) {
    await ctx.reply(
      "✏️ أضف وصف الصورة بعد الأمر.\nمثال: `/image قطة تجلس على سطح المنزل`",
      { parse_mode: "Markdown" },
    );
    return;
  }

  const statusMsg = await ctx.reply(
    `🎨 جاري توليد الصورة...\n📝 _${raw}_`,
    { parse_mode: "Markdown" },
  );

  try {
    const imageBuffer = await generateWithFallback(raw);

    await deleteMsg(ctx, statusMsg.message_id);
    await ctx.replyWithPhoto(
      { source: imageBuffer },
      {
        caption: `✅ الصورة جاهزة\n📝 _${raw}_`,
        parse_mode: "Markdown",
      },
    );
  } catch (err) {
    logger.error({ err, raw }, "All generation attempts failed");
    const { message: reason, canRetry } = friendlyError(err);

    await deleteMsg(ctx, statusMsg.message_id);
    await ctx.reply(
      `${reason}${canRetry ? "\n\n🔁 _أعد إرسال الطلب للمحاولة مجدداً._" : ""}`,
      { parse_mode: "Markdown" },
    );
  }
}

async function handlePhotoAnalysis(ctx: Context) {
  const msg = ctx.message as {
    photo?: Array<{ file_id: string }>;
    caption?: string;
  };

  if (!msg.photo?.length) return;

  const caption = (msg.caption ?? "").trim().toLowerCase();
  if (!caption.startsWith("/face") && !caption.startsWith("/analyze")) return;

  const statusMsg = await ctx.reply("👤 جاري تحليل الوجوه...");

  try {
    const photo = msg.photo[msg.photo.length - 1]!;
    const fileLink = await ctx.telegram.getFileLink(photo.file_id);
    const result = await analyzeImage(fileLink.href);

    await deleteMsg(ctx, statusMsg.message_id);

    if (result.faces === 0) {
      await ctx.reply(
        "😐 لم أجد أي وجه واضح في الصورة.\n💡 _تأكد أن الصورة واضحة والوجه مرئي جيداً._",
        { parse_mode: "Markdown" },
      );
    } else {
      await ctx.reply(
        [
          `👤 *نتائج تحليل الوجوه*`,
          ``,
          `🔢 عدد الوجوه: *${result.faces}*`,
          `🎂 العمر التقريبي: *${result.age}*`,
          `⚧ الجنس: *${translateGender(result.gender)}*`,
          `😊 المشاعر: *${translateEmotion(result.emotion)}*`,
          `🌍 الجنسية: *${result.race}*`,
        ].join("\n"),
        { parse_mode: "Markdown" },
      );
    }
  } catch (err) {
    logger.error({ err }, "Face analysis failed");
    const { message: reason } = friendlyError(err);
    await deleteMsg(ctx, statusMsg.message_id);
    await ctx.reply(reason, { parse_mode: "Markdown" });
  }
}

// Treat plain text as an image request — guide naturally
async function handleText(ctx: Context) {
  const msg = ctx.message as { text?: string };
  const text = (msg.text ?? "").trim();
  if (!text || text.startsWith("/")) return;

  await ctx.reply(
    `💡 يبدو أنك تريد توليد صورة! جرب:\n\`/image ${text}\``,
    { parse_mode: "Markdown" },
  );
}

function translateGender(gender: string): string {
  if (!gender || gender === "—") return "—";
  const g = gender.toLowerCase();
  if (g.includes("female")) return "أنثى";
  if (g.includes("male")) return "ذكر";
  return gender;
}

function translateEmotion(emotion: string): string {
  if (!emotion || emotion === "—") return "—";
  const map: Record<string, string> = {
    happy: "سعيد 😊",
    sad: "حزين 😢",
    angry: "غاضب 😠",
    surprised: "متفاجئ 😲",
    fear: "خائف 😨",
    disgust: "مشمئز 🤢",
    neutral: "محايد 😐",
  };
  return map[emotion.toLowerCase()] ?? emotion;
}

export function registerBotCommands(bot: Telegraf) {
  bot.start(handleStart);
  bot.help(handleHelp);
  bot.command("help", handleHelp);
  bot.command(
    ["image", "imagine"],
    handleImageGeneration as Parameters<typeof bot.command>[1],
  );
  bot.on(message("photo"), handlePhotoAnalysis);
  bot.on(message("text"), handleText as Parameters<typeof bot.on>[1]);

  bot.catch((err, ctx) => {
    logger.error({ err, update: ctx.update }, "Unhandled bot error");
  });
}
