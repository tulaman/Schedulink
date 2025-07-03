import { Telegraf } from 'telegraf';
import { sendWaMessage, normalizeJid } from '../whatsapp/index';
import 'dotenv/config';
import fs from 'fs/promises';
import { startConversationWithBarber, continueConversationWithBarber } from '../agents/barberAgent.js';

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
      try {
        const normalizedJid = normalizeJid(jid);
        await sendWaMessage(normalizedJid, text);
        await ctx.reply('sent');
      } catch (err: any) {
        await ctx.reply(`❌ Error: ${err.message}`);
      }
    } else {
      await ctx.reply('Usage: /wa <phone_number_or_jid> <text>\nExample: /wa 905551234567 Hello\nOr: /wa 905551234567@s.whatsapp.net Hello');
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

  // New command to start barber conversation
  bot.command('haircut', async ctx => {
    await fs.writeFile('telegram_chat_id', String(ctx.chat.id));
    const parts = ctx.message.text.split(' ');
    const jid = parts[1];
    const clientName = parts[2];
    const barberName = parts.slice(3).join(' ') || undefined;
    
    if (jid && clientName) {
      try {
        const normalizedJid = normalizeJid(jid);
        const message = await startConversationWithBarber(normalizedJid, clientName, barberName);
        await sendWaMessage(normalizedJid, message);
        await ctx.reply(`✅ Randevu talebi gönderildi: "${message}"`);
      } catch (err: any) {
        console.error('Failed to start barber conversation', err);
        await ctx.reply(`❌ Hata: ${err.message}`);
      }
    } else {
      await ctx.reply('Usage: /haircut <barber_phone_or_jid> <client_name> [barber_name]\nExample: /haircut 905551234567 Ahmet [Berber Mehmet]');
    }
  });

  // Keep the old greet command for backward compatibility
  bot.command('greet', async ctx => {
    await fs.writeFile('telegram_chat_id', String(ctx.chat.id));
    const parts = ctx.message.text.split(' ');
    const jid = parts[1];
    const name = parts.slice(2).join(' ');
    if (jid && name) {
      try {
        const normalizedJid = normalizeJid(jid);
        const message = await startConversationWithBarber(normalizedJid, name);
        await sendWaMessage(normalizedJid, message);
        await ctx.reply(`✅ Greeting sent: "${message}"`);
      } catch (err: any) {
        console.error('Failed to generate greeting', err);
        await ctx.reply(`❌ Error: ${err.message}`);
      }
    } else {
      await ctx.reply('Usage: /greet <phone_number_or_jid> <name>\nExample: /greet 905551234567 Ahmet');
    }
  });
  
  return bot;
}
