import { Context } from 'telegraf';
import dbService from '../database/service';

export interface OnboardingState {
  step: 'welcome' | 'language' | 'timezone' | 'first_barber' | 'completed';
  data?: any;
}

export class OnboardingManager {
  
  /**
   * Check if user needs onboarding
   */
  static async needsOnboarding(telegramChatId: string): Promise<boolean> {
    const user = await dbService.getUserByTelegramId(telegramChatId);
    return !user || !user.onboardingCompleted;
  }

  /**
   * Start onboarding process
   */
  static async startOnboarding(ctx: Context): Promise<void> {
    const telegramChatId = ctx.chat!.id.toString();
    const telegramUsername = ctx.from?.username;
    
    // Create user if doesn't exist
    let user = await dbService.getUserByTelegramId(telegramChatId);
    if (!user) {
      user = await dbService.createUser({
        telegramChatId,
        telegramUsername,
        name: ctx.from?.first_name || 'User',
        onboardingCompleted: false
      });
    }

    // Start welcome step
    await this.showWelcomeStep(ctx);
  }

  /**
   * Welcome step
   */
  static async showWelcomeStep(ctx: Context): Promise<void> {
    const welcomeMessage = `
🎉 Добро пожаловать в Schedulink!

Я помогу вам автоматически записываться к барберам через WhatsApp.

Давайте настроим ваш аккаунт:

1️⃣ Выберем язык
2️⃣ Настроим часовой пояс  
3️⃣ Добавим первого барбера
4️⃣ Подключим WhatsApp

Начнем? 🚀
    `;

    await ctx.reply(welcomeMessage, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🚀 Начать настройку', callback_data: 'onboarding_language' }],
          [{ text: '❓ Как это работает?', callback_data: 'onboarding_help' }]
        ]
      }
    });
  }

  /**
   * Language selection step
   */
  static async showLanguageStep(ctx: Context): Promise<void> {
    const message = `
🌐 Выберите язык для общения с барберами:

• 🇷🇺 Русский - для общения с русскоязычными барберами
• 🇹🇷 Türkçe - для общения с турецкими барберами  
• 🇬🇧 English - для общения с англоязычными барберами
    `;

    await ctx.reply(message, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🇷🇺 Русский', callback_data: 'lang_ru' }],
          [{ text: '🇹🇷 Türkçe', callback_data: 'lang_tr' }],
          [{ text: '🇬🇧 English', callback_data: 'lang_en' }]
        ]
      }
    });
  }

  /**
   * Timezone selection step  
   */
  static async showTimezoneStep(ctx: Context): Promise<void> {
    const message = `
🕐 Выберите ваш часовой пояс:

Это нужно для корректного отображения времени встреч в календаре.
    `;

    await ctx.reply(message, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🇷🇺 Москва (UTC+3)', callback_data: 'tz_Europe/Moscow' }],
          [{ text: '🇹🇷 Стамбул (UTC+3)', callback_data: 'tz_Europe/Istanbul' }],
          [{ text: '🇺🇸 Нью-Йорк (UTC-5)', callback_data: 'tz_America/New_York' }],
          [{ text: '🇬🇧 Лондон (UTC+0)', callback_data: 'tz_Europe/London' }],
          [{ text: '⚙️ Другой часовой пояс', callback_data: 'tz_custom' }]
        ]
      }
    });
  }

  /**
   * First barber setup step
   */
  static async showFirstBarberStep(ctx: Context): Promise<void> {
    const message = `
💇‍♂️ Добавьте первого барбера

Отправьте номер телефона вашего барбера в формате:
• +7 999 123 45 67
• 905551234567  
• 905551234567@s.whatsapp.net

Или нажмите "Пропустить" - вы сможете добавить барбера позже.
    `;

    await ctx.reply(message, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '⏭️ Пропустить', callback_data: 'skip_first_barber' }],
          [{ text: '❓ Как найти номер барбера?', callback_data: 'help_barber_number' }]
        ]
      }
    });
  }

  /**
   * Final setup step
   */
  static async showFinalStep(ctx: Context): Promise<void> {
    const message = `
✅ Отлично! Настройка завершена.

Теперь вам нужно подключить WhatsApp:
1. Отправьте команду /qr
2. Отсканируйте QR-код в WhatsApp
3. Начните записываться к барберам командой /haircut

🎯 Основные команды:
• /haircut <номер> <ваше_имя> - записаться к барберу
• /barbers - управление барберами
• /settings - настройки аккаунта
• /help - помощь

Удачи! 🎉
    `;

    await ctx.reply(message, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📱 Подключить WhatsApp', callback_data: 'connect_whatsapp' }],
          [{ text: '⚙️ Настройки', callback_data: 'open_settings' }]
        ]
      }
    });

    // Mark onboarding as completed
    const telegramChatId = ctx.chat!.id.toString();
    await dbService.completeOnboarding(telegramChatId);
  }

  /**
   * Handle callback queries during onboarding
   */
  static async handleCallback(ctx: Context): Promise<boolean> {
    const callbackData = (ctx as any).callbackQuery?.data;
    console.log(`🔍 Onboarding callback received: ${callbackData}`);
    
    if (!callbackData || !(callbackData.startsWith('onboarding_') || callbackData.startsWith('lang_') || callbackData.startsWith('tz_') || callbackData === 'skip_first_barber' || callbackData === 'connect_whatsapp' || callbackData === 'help_barber_number')) {
      console.log(`❌ Callback not handled by onboarding: ${callbackData}`);
      return false;
    }

    const telegramChatId = ctx.chat!.id.toString();
    console.log(`✅ Processing onboarding callback: ${callbackData} for user: ${telegramChatId}`);

    try {
      if (callbackData === 'onboarding_language') {
        await this.showLanguageStep(ctx);
      } else if (callbackData === 'onboarding_help') {
        await this.showHelpMessage(ctx);
      } else if (callbackData.startsWith('lang_')) {
        const language = callbackData.replace('lang_', '');
        await dbService.updateUserLanguage(telegramChatId, language);
        await this.showTimezoneStep(ctx);
      } else if (callbackData.startsWith('tz_')) {
        const timezone = callbackData.replace('tz_', '');
        await dbService.updateUserTimezone(telegramChatId, timezone);
        await this.showFirstBarberStep(ctx);
      } else if (callbackData === 'skip_first_barber') {
        await this.showFinalStep(ctx);
      } else if (callbackData === 'connect_whatsapp') {
        await ctx.reply('📱 Отправьте команду /qr для подключения WhatsApp');
      } else if (callbackData === 'help_barber_number') {
        await ctx.reply(`
❓ Как найти номер барбера?

1️⃣ **Из WhatsApp контактов:**
   • Откройте WhatsApp
   • Найдите барбера в контактах
   • Скопируйте номер телефона

2️⃣ **Из сообщений:**
   • Откройте чат с барбером
   • Нажмите на имя контакта
   • Скопируйте номер

3️⃣ **Формат номера:**
   • 905551234567 (турецкий)
   • +7 999 123 45 67 (российский)
   • 905551234567@s.whatsapp.net (полный JID)

💡 Совет: Можно сначала пропустить этот шаг и добавить барбера позже командой /add_barber
        `);
      }

      await (ctx as any).answerCbQuery();
      return true;
    } catch (error) {
      console.error('Onboarding callback error:', error);
      await (ctx as any).answerCbQuery('Произошла ошибка');
      return false;
    }
  }

  /**
   * Show help message
   */
  static async showHelpMessage(ctx: Context): Promise<void> {
    const helpMessage = `
❓ Как работает Schedulink:

1️⃣ Вы отправляете команду /haircut с номером барбера
2️⃣ Бот автоматически пишет барберу от вашего имени
3️⃣ Ведет переговоры о времени встречи
4️⃣ Подтверждает запись и добавляет в календарь

🔐 Безопасность:
• Бот использует ваш WhatsApp аккаунт
• Все сообщения сохраняются в зашифрованном виде
• Вы можете отключить бота в любое время

💡 Подходит для:
• Записи к барберам
• Салонов красоты
• Массажистов
• Других услуг по записи
    `;

    await ctx.reply(helpMessage, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🚀 Продолжить настройку', callback_data: 'onboarding_language' }]
        ]
      }
    });
  }
}