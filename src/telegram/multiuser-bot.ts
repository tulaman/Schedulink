import { Telegraf, Context } from 'telegraf';
import { sendWaMessage, sendHumanLike, normalizeJid } from '../whatsapp/index';
import { startConversationWithBarber, continueConversationWithBarber } from '../agents/barberAgent';
import { OnboardingManager } from '../onboarding/flow';
import dbService from '../database/service';
import 'dotenv/config';

let botInstance: Telegraf | null = null;

export function createMultiUserBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN not set');
  
  const bot = new Telegraf(token);
  botInstance = bot;

  // Handle callback queries (including onboarding) - BEFORE middleware
  bot.on('callback_query', async (ctx) => {
    const handled = await OnboardingManager.handleCallback(ctx);
    if (!handled) {
      // Handle other callbacks here
      const callbackData = (ctx as any).callbackQuery?.data;
      const telegramChatId = ctx.chat!.id.toString();
      
      console.log(`🔍 Non-onboarding callback received: ${callbackData}`);
      
      try {
        if (callbackData === 'add_barber') {
          await ctx.reply(`
➕ Добавление нового барбера

Используйте команду:
/add_barber <номер_телефона> <имя_барбера>

Пример:
/add_barber 905551234567 Мастер Ахмет

Или отправьте номер телефона барбера, и я попрошу указать имя.
          `);
          await ctx.answerCbQuery();
        } else if (callbackData === 'refresh_barbers') {
          // Simulate /barbers command
          const user = await dbService.getUserByTelegramId(telegramChatId);
          if (user) {
            const userBarbers = await dbService.getUserBarbers(user.id);
            const barbersList = userBarbers.map((ub: any, index: number) => 
              `${index + 1}. ${ub.nickname || ub.barber.name || 'Без имени'} (${ub.barber.jid})${ub.isFavorite ? ' ⭐' : ''}`
            ).join('\n');
            
            await ctx.editMessageText(`
📋 Ваши барберы (обновлено):

${barbersList}

🔧 Управление:
• /add_barber <номер> <имя> - добавить нового барбера
• Используйте /haircut для записи к барберу
            `, {
              reply_markup: {
                inline_keyboard: [
                  [{ text: '➕ Добавить барбера', callback_data: 'add_barber' }],
                  [{ text: '🔄 Обновить список', callback_data: 'refresh_barbers' }]
                ]
              }
            });
          }
          await ctx.answerCbQuery('Список обновлен');
        } else if (callbackData === 'edit_profile') {
          await ctx.reply(`
✏️ Редактирование профиля

Доступные команды:
• /change_name <новое_имя>
• /change_language <язык>
• /change_timezone <часовой_пояс>
          `);
          await ctx.answerCbQuery();
        } else if (callbackData === 'edit_notifications') {
          await ctx.reply(`
🔔 Настройки уведомлений

Функция в разработке. Пока что все уведомления включены.
          `);
          await ctx.answerCbQuery();
        } else if (callbackData === 'edit_calendar') {
          await ctx.reply(`
📅 Настройки календаря

Функция в разработке. Google Calendar интеграция работает автоматически.
          `);
          await ctx.answerCbQuery();
        } else if (callbackData === 'open_settings') {
          // Simulate /settings command
          const user = await dbService.getUserByTelegramId(telegramChatId);
          if (user) {
            const preferences = await dbService.getUserPreferences(user.id);
            
            await ctx.reply(`
⚙️ Настройки аккаунта:

👤 Профиль:
• Имя: ${user.name}
• Язык: ${user.language}
• Часовой пояс: ${user.timezone}

🔔 Уведомления:
• При подтверждении: ${preferences?.notifyOnConfirmation ? '✅' : '❌'}
• При таймауте: ${preferences?.notifyOnTimeout ? '✅' : '❌'}

📅 Календарь:
• Google Calendar: ${preferences?.googleCalendarEnabled ? '✅' : '❌'}
• Напоминание за: ${preferences?.reminderMinutesBefore || 30} мин

🔧 Изменить настройки:
• /change_name <новое_имя>
• /change_language <язык>
• /change_timezone <часовой_пояс>
            `, {
              reply_markup: {
                inline_keyboard: [
                  [{ text: '✏️ Редактировать профиль', callback_data: 'edit_profile' }],
                  [{ text: '🔔 Уведомления', callback_data: 'edit_notifications' }],
                  [{ text: '📅 Календарь', callback_data: 'edit_calendar' }]
                ]
              }
            });
          }
          await ctx.answerCbQuery();
        } else {
          await ctx.answerCbQuery('Неизвестная команда');
        }
      } catch (error) {
        console.error('Error handling callback:', error);
        await ctx.answerCbQuery('Произошла ошибка');
      }
    }
  });

  // Middleware to check onboarding
  bot.use(async (ctx, next) => {
    // Skip onboarding check for certain commands and callback queries
    const text = (ctx.message as any)?.text;
    const isCallback = !!(ctx as any).callbackQuery;
    
    if (isCallback || (text && (text.startsWith('/start') || text.startsWith('/help')))) {
      return next();
    }

    const telegramChatId = ctx.chat!.id.toString();
    const needsOnboarding = await OnboardingManager.needsOnboarding(telegramChatId);
    
    if (needsOnboarding) {
      await OnboardingManager.startOnboarding(ctx);
      return;
    }

    return next();
  });

  // Start command - entry point
  bot.command('start', async (ctx) => {
    const telegramChatId = ctx.chat.id.toString();
    const needsOnboarding = await OnboardingManager.needsOnboarding(telegramChatId);
    
    if (needsOnboarding) {
      await OnboardingManager.startOnboarding(ctx);
    } else {
      await ctx.reply(`
👋 Добро пожаловать обратно!

🎯 Основные команды:
• /haircut <номер> <ваше_имя> - записаться к барберу
• /barbers - управление барберами
• /appointments - ваши встречи
• /settings - настройки аккаунта
• /qr - подключить WhatsApp
• /help - помощь

📱 Статус WhatsApp: ${await getWhatsAppStatus()}
      `);
    }
  });

  // Help command
  bot.command('help', async (ctx) => {
    await ctx.reply(`
📚 Schedulink - автоматическая запись к барберам

🎯 Основные команды:

/haircut <номер> <имя> [барбер] - записаться к барберу
Пример: /haircut 905551234567 Алексей Мастер Ахмет

/barbers - управление списком барберов
/appointments - ваши встречи
/settings - настройки аккаунта
/qr - подключить WhatsApp

🔧 Служебные команды:
/wa <номер> <текст> - отправить сообщение в WhatsApp
/ping - проверить работу бота

❓ Нужна помощь? Напишите @support_bot
    `);
  });

  // Main haircut command - now with user isolation
  bot.command('haircut', async (ctx) => {
    const telegramChatId = ctx.chat.id.toString();
    const user = await dbService.getUserByTelegramId(telegramChatId);
    
    if (!user) {
      await ctx.reply('❌ Пользователь не найден. Используйте /start для регистрации.');
      return;
    }

    const parts = ctx.message.text.split(' ');
    const jid = parts[1];
    const clientName = parts[2];
    const barberName = parts.slice(3).join(' ') || undefined;
    
    if (!jid || !clientName) {
      await ctx.reply(`
❌ Неверный формат команды.

Использование: /haircut <номер_барбера> <ваше_имя> [имя_барбера]

Примеры:
• /haircut 905551234567 Алексей
• /haircut +7 999 123 45 67 Иван Мастер Ахмет
• /haircut 905551234567@s.whatsapp.net Петр

💡 Совет: добавьте барберов через /barbers для быстрого доступа
      `);
      return;
    }

    try {
      const normalizedJid = normalizeJid(jid);
      
      // Check if user has this barber in their list
      await dbService.ensureUserBarber(user.id, normalizedJid, barberName);
      
      const message = await startConversationWithBarber(
        normalizedJid, 
        clientName, 
        barberName,
        user.id // Pass user ID for isolation
      );
      
      await sendHumanLike(normalizedJid, message);
      
      await ctx.reply(`✅ Запрос на запись отправлен барберу!
      
📱 Барбер: ${barberName || normalizedJid}
👤 Имя: ${clientName}
💬 Сообщение: "${message}"

⏱️ Ожидаем ответа барбера...`);
      
    } catch (err: any) {
      console.error('Failed to start barber conversation', err);
      await ctx.reply(`❌ Ошибка при отправке сообщения: ${err.message}`);
    }
  });

  // Barbers management
  bot.command('barbers', async (ctx) => {
    const telegramChatId = ctx.chat.id.toString();
    const user = await dbService.getUserByTelegramId(telegramChatId);
    
    if (!user) {
      await ctx.reply('❌ Пользователь не найден. Используйте /start для регистрации.');
      return;
    }

    const userBarbers = await dbService.getUserBarbers(user.id);
    
    if (userBarbers.length === 0) {
      await ctx.reply(`
📋 У вас пока нет сохраненных барберов.

Добавьте барбера:
• /haircut <номер> <ваше_имя> <имя_барбера>
• /add_barber <номер> <имя>

После первого использования барбер автоматически сохранится в вашем списке.
      `);
      return;
    }

    const barbersList = userBarbers.map((ub: any, index: number) => 
      `${index + 1}. ${ub.nickname || ub.barber.name || 'Без имени'} (${ub.barber.jid})${ub.isFavorite ? ' ⭐' : ''}`
    ).join('\n');

    await ctx.reply(`
📋 Ваши барберы:

${barbersList}

🔧 Управление:
• /add_barber <номер> <имя> - добавить нового барбера
• Используйте /haircut для записи к барберу
    `, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '➕ Добавить барбера', callback_data: 'add_barber' }],
          [{ text: '🔄 Обновить список', callback_data: 'refresh_barbers' }]
        ]
      }
    });
  });

  // Add barber command
  bot.command('add_barber', async (ctx) => {
    const telegramChatId = ctx.chat.id.toString();
    const user = await dbService.getUserByTelegramId(telegramChatId);
    
    if (!user) {
      await ctx.reply('❌ Пользователь не найден. Используйте /start для регистрации.');
      return;
    }

    const parts = ctx.message.text.split(' ');
    const phoneNumber = parts[1];
    const barberName = parts.slice(2).join(' ');
    
    if (!phoneNumber || !barberName) {
      await ctx.reply(`
❌ Неверный формат команды.

Использование: /add_barber <номер_телефона> <имя_барбера>

Примеры:
• /add_barber 905551234567 Мастер Ахмет
• /add_barber +7 999 123 45 67 Барбер Иван
      `);
      return;
    }

    try {
      const normalizedJid = normalizeJid(phoneNumber);
      await dbService.ensureUserBarber(user.id, normalizedJid, barberName);
      
      await ctx.reply(`✅ Барбер "${barberName}" успешно добавлен!
      
📱 Номер: ${phoneNumber}
📋 Посмотреть всех барберов: /barbers
💇‍♂️ Записаться: /haircut ${phoneNumber} ВашеИмя`);
      
    } catch (err: any) {
      await ctx.reply(`❌ Ошибка при добавлении барбера: ${err.message}`);
    }
  });

  // Appointments management
  bot.command('appointments', async (ctx) => {
    const telegramChatId = ctx.chat.id.toString();
    const user = await dbService.getUserByTelegramId(telegramChatId);
    
    if (!user) {
      await ctx.reply('❌ Пользователь не найден. Используйте /start для регистрации.');
      return;
    }

    const appointments = await dbService.getUserAppointments(user.id);
    
    if (appointments.length === 0) {
      await ctx.reply(`
📅 У вас пока нет записей.

Запишитесь к барберу командой:
/haircut <номер> <ваше_имя> [имя_барбера]
      `);
      return;
    }

    const appointmentsList = appointments.map((apt: any, index: number) => {
      const barberName = apt.barber.name || 'Без имени';
      const status = apt.status === 'confirmed' ? '✅' : '⏳';
      const date = apt.appointmentDate ? new Date(apt.appointmentDate).toLocaleDateString() : 'Сегодня';
      
      return `${index + 1}. ${status} ${barberName} - ${date} ${apt.appointmentTime}`;
    }).join('\n');

    await ctx.reply(`
📅 Ваши встречи:

${appointmentsList}

🔧 Управление:
• /cancel_appointment <номер> - отменить встречу
• /reschedule_appointment <номер> - перенести встречу
    `);
  });

  // Settings command
  bot.command('settings', async (ctx) => {
    const telegramChatId = ctx.chat.id.toString();
    const user = await dbService.getUserByTelegramId(telegramChatId);
    
    if (!user) {
      await ctx.reply('❌ Пользователь не найден. Используйте /start для регистрации.');
      return;
    }

    const preferences = await dbService.getUserPreferences(user.id);
    
    await ctx.reply(`
⚙️ Настройки аккаунта:

👤 Профиль:
• Имя: ${user.name}
• Язык: ${user.language}
• Часовой пояс: ${user.timezone}

🔔 Уведомления:
• При подтверждении: ${preferences?.notifyOnConfirmation ? '✅' : '❌'}
• При таймауте: ${preferences?.notifyOnTimeout ? '✅' : '❌'}

📅 Календарь:
• Google Calendar: ${preferences?.googleCalendarEnabled ? '✅' : '❌'}
• Напоминание за: ${preferences?.reminderMinutesBefore || 30} мин

🔧 Изменить настройки:
• /edit_profile - редактировать профиль
• /notifications - настройки уведомлений
• /calendar - настройки календаря
    `, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '✏️ Редактировать профиль', callback_data: 'edit_profile' }],
          [{ text: '🔔 Уведомления', callback_data: 'edit_notifications' }],
          [{ text: '📅 Календарь', callback_data: 'edit_calendar' }]
        ]
      }
    });
  });

  // QR command - now user-specific
  bot.command('qr', async (ctx) => {
    const telegramChatId = ctx.chat.id.toString();
    const user = await dbService.getUserByTelegramId(telegramChatId);
    
    if (!user) {
      await ctx.reply('❌ Пользователь не найден. Используйте /start для регистрации.');
      return;
    }

    try {
      const fs = await import('fs/promises');
      const qr = await fs.readFile('last_qr.png');
      await ctx.replyWithPhoto({ source: qr }, {
        caption: `📱 Отсканируйте QR-код в WhatsApp для подключения

⚠️ Важно: 
• Используйте "Связанные устройства" в WhatsApp
• QR-код действителен 20 секунд
• После подключения можете начать записываться к барберам`
      });
    } catch (e) {
      await ctx.reply(`❌ QR-код еще не сгенерирован.

Подождите несколько секунд и попробуйте еще раз.
Если проблема не решается, обратитесь в поддержку.`);
    }
  });

  // Manual WhatsApp message (for debugging)
  bot.command('wa', async (ctx) => {
    const telegramChatId = ctx.chat.id.toString();
    const user = await dbService.getUserByTelegramId(telegramChatId);
    
    if (!user) {
      await ctx.reply('❌ Пользователь не найден. Используйте /start для регистрации.');
      return;
    }

    const parts = ctx.message.text.split(' ');
    const jid = parts[1];
    const text = parts.slice(2).join(' ');
    
    if (!jid || !text) {
      await ctx.reply(`
❌ Неверный формат команды.

Использование: /wa <номер_или_jid> <текст>

Примеры:
• /wa 905551234567 Привет!
• /wa 905551234567@s.whatsapp.net Как дела?
      `);
      return;
    }

    try {
      const normalizedJid = normalizeJid(jid);
      await sendWaMessage(normalizedJid, text);
      
      // Log manual message
      await dbService.saveConversationMessage(normalizedJid, text, 'sent', user.id);
      
      await ctx.reply('✅ Сообщение отправлено');
    } catch (err: any) {
      await ctx.reply(`❌ Ошибка: ${err.message}`);
    }
  });

  // Ping command
  bot.command('ping', (ctx) => ctx.reply('🏓 pong'));

  return bot;
}

async function getWhatsAppStatus(): Promise<string> {
  // This would check actual WhatsApp connection status
  // For now, return a placeholder
  return 'Подключен ✅';
}

export async function sendTelegramNotification(message: string, userId: string): Promise<void> {
  try {
    const user = await dbService.getUserById(userId);
    if (!user) {
      console.error('User not found for notification:', userId);
      return;
    }

    const telegramChatId = parseInt(user.telegramChatId, 10);
    
    if (botInstance && telegramChatId) {
      await botInstance.telegram.sendMessage(telegramChatId, message);
      console.log(`📱 Telegram notification sent to user ${userId}: ${message}`);
    }
  } catch (error) {
    console.error('Failed to send Telegram notification:', error);
  }
}

export function getBotInstance(): Telegraf | null {
  return botInstance;
}