import { Telegraf } from 'telegraf';
import 'dotenv/config';

export function createBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN not set');
  const bot = new Telegraf(token);
  bot.command('ping', ctx => ctx.reply('pong'));
  return bot;
}
