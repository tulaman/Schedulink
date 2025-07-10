import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { OnboardingManager } from '../src/onboarding/flow';
import dbService from '../src/database/service';

// Mock Telegraf Context
const createMockContext = (chatId: string, messageText?: string, callbackData?: string) => ({
  chat: { id: parseInt(chatId) },
  from: { first_name: 'Test User', username: 'testuser' },
  message: messageText ? { text: messageText } : undefined,
  callbackQuery: callbackData ? { data: callbackData } : undefined,
  reply: jest.fn(),
  replyWithPhoto: jest.fn(),
  editMessageText: jest.fn(),
  answerCbQuery: jest.fn()
});

describe('Onboarding Flow', () => {
  beforeEach(async () => {
    await dbService.initDatabase();
  });

  afterEach(async () => {
    await dbService.disconnect();
  });

  describe('Onboarding Detection', () => {
    it('should detect new users need onboarding', async () => {
      const needsOnboarding = await OnboardingManager.needsOnboarding('new_user_123');
      expect(needsOnboarding).toBe(true);
    });

    it('should detect completed users do not need onboarding', async () => {
      // Create user with completed onboarding
      const uniqueId = `completed_user_${Date.now()}`;
      await dbService.createUser({
        telegramChatId: uniqueId,
        name: 'Completed User',
        onboardingCompleted: true
      });

      const needsOnboarding = await OnboardingManager.needsOnboarding(uniqueId);
      expect(needsOnboarding).toBe(false);
    });
  });

  describe('Onboarding Steps', () => {
    it('should start onboarding for new users', async () => {
      const mockCtx = createMockContext('123456');
      
      await OnboardingManager.startOnboarding(mockCtx as any);
      
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('🎉 Добро пожаловать в Schedulink!'),
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            inline_keyboard: expect.arrayContaining([
              expect.arrayContaining([
                expect.objectContaining({ callback_data: 'onboarding_language' })
              ])
            ])
          })
        })
      );
    });

    it('should handle language selection callback', async () => {
      const mockCtx = createMockContext('123456', undefined, 'lang_ru');
      
      const handled = await OnboardingManager.handleCallback(mockCtx as any);
      
      expect(handled).toBe(true);
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('🕐 Выберите ваш часовой пояс'),
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            inline_keyboard: expect.arrayContaining([
              expect.arrayContaining([
                expect.objectContaining({ callback_data: 'tz_Europe/Moscow' })
              ])
            ])
          })
        })
      );
    });

    it('should handle timezone selection callback', async () => {
      // First create user for language selection
      const uniqueId = `tz_test_${Date.now()}`;
      await dbService.createUser({
        telegramChatId: uniqueId,
        name: 'Test User',
        language: 'ru'
      });

      const mockCtx = createMockContext(uniqueId, undefined, 'tz_Europe/Moscow');
      
      const handled = await OnboardingManager.handleCallback(mockCtx as any);
      
      expect(handled).toBe(true);
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('💇‍♂️ Добавьте первого барбера'),
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            inline_keyboard: expect.arrayContaining([
              expect.arrayContaining([
                expect.objectContaining({ callback_data: 'skip_first_barber' })
              ])
            ])
          })
        })
      );
    });

    it('should handle skip first barber callback', async () => {
      const mockCtx = createMockContext('123456', undefined, 'skip_first_barber');
      
      const handled = await OnboardingManager.handleCallback(mockCtx as any);
      
      expect(handled).toBe(true);
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('✅ Отлично! Настройка завершена'),
        expect.objectContaining({
          reply_markup: expect.objectContaining({
            inline_keyboard: expect.arrayContaining([
              expect.arrayContaining([
                expect.objectContaining({ callback_data: 'connect_whatsapp' })
              ])
            ])
          })
        })
      );
    });

    it('should handle help callback', async () => {
      const mockCtx = createMockContext('123456', undefined, 'help_barber_number');
      
      const handled = await OnboardingManager.handleCallback(mockCtx as any);
      
      expect(handled).toBe(true);
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('❓ Как найти номер барбера?')
      );
    });

    it('should not handle unknown callbacks', async () => {
      const mockCtx = createMockContext('123456', undefined, 'unknown_callback');
      
      const handled = await OnboardingManager.handleCallback(mockCtx as any);
      
      expect(handled).toBe(false);
    });
  });

  describe('User Creation During Onboarding', () => {
    it('should create user during onboarding', async () => {
      const uniqueId = `new_user_${Date.now()}`;
      const mockCtx = createMockContext(uniqueId);
      
      await OnboardingManager.startOnboarding(mockCtx as any);
      
      const user = await dbService.getUserByTelegramId(uniqueId);
      expect(user).toBeDefined();
      expect(user!.name).toBe('Test User');
      expect(user!.onboardingCompleted).toBe(false);
    });

    it('should update user language during onboarding', async () => {
      // Start onboarding to create user
      const uniqueId = `lang_test_${Date.now()}`;
      const mockCtx = createMockContext(uniqueId);
      await OnboardingManager.startOnboarding(mockCtx as any);
      
      // Handle language selection
      const langCtx = createMockContext(uniqueId, undefined, 'lang_tr');
      await OnboardingManager.handleCallback(langCtx as any);
      
      const user = await dbService.getUserByTelegramId(uniqueId);
      expect(user!.language).toBe('tr');
    });
  });
});