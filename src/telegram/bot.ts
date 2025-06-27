import { Telegraf } from 'telegraf';
import { sendWaMessage } from '../whatsapp/index';
import 'dotenv/config';
import fs from 'fs/promises';

export function createBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN not set');
  const bot = new Telegraf(token);
  bot.command('ping', ctx => ctx.reply('pong'));
  bot.command('wa', async ctx => {
    await fs.writeFile('telegram_chat_id', String(ctx.chat.id));
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
  bot.command('qr', async ctx => {
    await fs.writeFile('telegram_chat_id', String(ctx.chat.id));
    try {
      const qr = await fs.readFile('last_qr.png');
      await ctx.replyWithPhoto({ source: qr });
    } catch (e) {
      await ctx.reply('QR not generated yet – please try again in a few seconds.');
    }
  });
  bot.command('greet', async ctx => {
    await fs.writeFile('telegram_chat_id', String(ctx.chat.id));
    const parts = ctx.message.text.split(' ');
    const jid = parts[1];
    const name = parts.slice(2).join(' ');
    if (jid && name) {
      try {
        const { generateGreeting } = await import('../agents/turkishNegotiator.js');
        const greeting = await generateGreeting(name);
        await sendWaMessage(jid, greeting);
        await ctx.reply('sent');
      } catch (err: any) {
        console.error('Failed to generate greeting', err);
        await ctx.reply('error');
      }
    } else {
      await ctx.reply('Usage: /greet <jid> <name>');
    }
  });
  return bot;
}
