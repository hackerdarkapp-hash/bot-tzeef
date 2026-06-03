import { Telegraf } from "telegraf";
import { registerBotCommands } from "./commands";
import { logger } from "../lib/logger";

const TOKEN = process.env["TELEGRAM_BOT_TOKEN"];

let bot: Telegraf | null = null;

export function createBot(): Telegraf {
  if (!TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is required but not set");
  }

  bot = new Telegraf(TOKEN);
  registerBotCommands(bot);
  return bot;
}

export async function startBot(): Promise<void> {
  if (!TOKEN) {
    logger.warn("TELEGRAM_BOT_TOKEN not set — Telegram bot will not start");
    return;
  }

  const instance = createBot();

  process.once("SIGINT", () => instance.stop("SIGINT"));
  process.once("SIGTERM", () => instance.stop("SIGTERM"));

  logger.info("Starting Telegram bot (long polling)...");
  await instance.launch();
  logger.info("Telegram bot is running");
}

export { bot };
