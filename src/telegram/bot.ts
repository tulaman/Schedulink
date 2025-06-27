import { Telegraf } from 'telegraf';
import { sendWaMessage } from '../whatsapp/index';
import 'dotenv/config';

export let qrChatId: number | undefined;

export function createBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN not set');
  const bot = new Telegraf(token);
  bot.command('ping', ctx => ctx.reply('pong'));
  bot.command('wa', async ctx => {
    qrChatId = ctx.chat.id;
    const parts = ctx.message.text.split(' ');
    const jid = parts[1];
    const text = parts.slice(2).join(' ');
    if (jid && text) {
      await sendWaMessage(jid, text);
      await ctx.reply('sent');
    } else {
      await ctx.reply('Usage: /wa <jid> <text>');
    }
  });
  return bot;
}
