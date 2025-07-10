import { describe, it, expect, jest, beforeEach, afterAll } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { 
  startConversationWithBarber, 
  continueConversationWithBarber,
  getConversationContext,
  isConversationCompleted,
  getAllActiveConversations
} from '../src/agents/barberAgent';
import dbService from '../src/database/service';

// Mock OpenAI Agents SDK
jest.mock('@openai/agents', () => ({
  Agent: jest.fn().mockImplementation(() => ({})),
  run: jest.fn(),
  tool: jest.fn().mockImplementation((config: any) => config),
}));

// Mock calendar
jest.mock('../src/calendar/google', () => ({
  createCalEvent: jest.fn(),
}));

jest.mock('../src/telegram/multiuser-bot', () => ({
  sendTelegramNotification: jest.fn(),
}));

const { run } = require('@openai/agents');
const { createCalEvent } = require('../src/calendar/google');
const { sendTelegramNotification } = require('../src/telegram/multiuser-bot');

const prisma = new PrismaClient({
  datasourceUrl: 'file:./test.db'
});

describe('BarberAgent - OpenAI Agents SDK Integration', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    (sendTelegramNotification as jest.MockedFunction<typeof sendTelegramNotification>).mockResolvedValue(undefined);
    
    // Clean database before each test - order matters for foreign key constraints
    await prisma.conversationLog.deleteMany();
    await prisma.appointment.deleteMany();
    await prisma.userBarber.deleteMany();
    await prisma.barber.deleteMany();
    await prisma.userPreferences.deleteMany();
    await prisma.user.deleteMany();

    // Create a test user for the multi-user architecture
    await prisma.user.create({
      data: {
        id: 'test-user-id',
        telegramChatId: 'test-chat-id',
        name: 'Test User',
        isActive: true,
        onboardingCompleted: true,
        language: 'ru',
        timezone: 'UTC'
      }
    });
  });

  afterAll(async () => {
    // Clean up - order matters for foreign key constraints
    await prisma.conversationLog.deleteMany();
    await prisma.appointment.deleteMany();
    await prisma.userBarber.deleteMany();
    await prisma.barber.deleteMany();
    await prisma.userPreferences.deleteMany();
    await prisma.user.deleteMany();
    await dbService.disconnect();
  });

  describe('Initial conversation flow', () => {
    it('should start conversation with barber using client name', async () => {
      const mockResponse = 'Merhaba! Saç kesimi randevusu almak istiyorum. Bugün veya yarın müsait saatleriniz var mı?';
      (run as jest.MockedFunction<typeof run>).mockResolvedValue({
        finalOutput: mockResponse,
        history: []
      });

      const result = await startConversationWithBarber('test@whatsapp.net', 'Ahmet', 'Mehmet Berber', 'test-user-id');

      expect(result).toBe(mockResponse);
      expect(run).toHaveBeenCalledWith(
        expect.any(Object),
        expect.stringContaining('Mehmet Berber ismindeki berbere Ahmet adına saç kesimi randevusu almak')
      );

      // Check conversation context is created
      const context = await getConversationContext('test@whatsapp.net', 'test-user-id');
      expect(context).toEqual({
        clientName: 'Ahmet',
        barberName: 'Mehmet Berber',
        isCompleted: false
      });
    });

    it('should start conversation without barber name', async () => {
      const mockResponse = 'Merhaba! Saç kesimi randevusu almak istiyorum.';
      (run as jest.MockedFunction<typeof run>).mockResolvedValue({
        finalOutput: mockResponse,
        history: []
      });

      const result = await startConversationWithBarber('test2@whatsapp.net', 'Ali', undefined, 'test-user-id');

      expect(result).toBe(mockResponse);
      expect(run).toHaveBeenCalledWith(
        expect.any(Object),
        expect.stringContaining('Ali adına berbere saç kesimi randevusu almak')
      );
    });
  });

  describe('Conversation continuation flow', () => {
    beforeEach(async () => {
      // Setup initial conversation
      (run as jest.MockedFunction<typeof run>).mockResolvedValueOnce({
        finalOutput: 'Merhaba! Randevu istiyorum.',
        history: []
      });
      await startConversationWithBarber('test@whatsapp.net', 'Ahmet', 'Mehmet Berber', 'test-user-id');
    });

    it('should continue conversation with barber response', async () => {
      const continueResponse = 'Tabii, saat 15:00 uygun mu size?';
      (run as jest.MockedFunction<typeof run>).mockResolvedValue({
        finalOutput: continueResponse,
        history: []
      });

      const result = await continueConversationWithBarber('test@whatsapp.net', '15:00 de müsait misiniz?', 'test-user-id');

      expect(result).toBe(continueResponse);
      expect(run).toHaveBeenCalledWith(
        expect.any(Object),
        expect.stringContaining('Berber şöyle cevap verdi: "15:00 de müsait misiniz?"')
      );
    });

    it('should handle appointment confirmation and create calendar event', async () => {
      const confirmedResponse = 'Mükemmel! 15:30 saati benim için uygun. Teşekkürler! [CONFIRMED:15:30]';
      (run as jest.MockedFunction<typeof run>).mockResolvedValue({
        finalOutput: confirmedResponse,
        history: []
      });

      (createCalEvent as jest.MockedFunction<typeof createCalEvent>).mockResolvedValue({
        success: true,
        message: 'Event created'
      });

      const result = await continueConversationWithBarber('test@whatsapp.net', '15:30 uygun', 'test-user-id');

      expect(result).toBe(confirmedResponse);
      expect(createCalEvent).toHaveBeenCalledWith({
        start: expect.any(Date),
        end: expect.any(Date),
        summary: 'Saç kesimi - Mehmet Berber'
      });

      // Check that Telegram notification was sent
      expect(sendTelegramNotification).toHaveBeenCalledWith(
        expect.stringContaining('🎉 Отлично! Запись подтверждена!'),
        'test-user-id'
      );

      // Check conversation is completed
      const context = await getConversationContext('test@whatsapp.net', 'test-user-id');
      expect(context?.appointmentTime).toBe('15:30');
      expect(context?.isCompleted).toBe(true);
      expect(await isConversationCompleted('test@whatsapp.net', 'test-user-id')).toBe(true);
    });

    it('should handle appointment confirmation without barber name', async () => {
      // Start new conversation without barber name
      (run as jest.MockedFunction<typeof run>).mockResolvedValueOnce({
        finalOutput: 'Merhaba! Randevu istiyorum.',
        history: []
      });
      await startConversationWithBarber('test3@whatsapp.net', 'Can', undefined, 'test-user-id');

      const confirmedResponse = 'Harika! 14:00 saati uygun. [CONFIRMED:14:00]';
      (run as jest.MockedFunction<typeof run>).mockResolvedValue({
        finalOutput: confirmedResponse,
        history: []
      });

      await continueConversationWithBarber('test3@whatsapp.net', '14:00 uygun', 'test-user-id');

      expect(createCalEvent).toHaveBeenCalledWith({
        start: expect.any(Date),
        end: expect.any(Date),
        summary: 'Saç kesimi randevusu'
      });
    });

    it('should handle calendar event creation failure gracefully', async () => {
      const confirmedResponse = 'Tamam! 16:00 da görüşürüz. [CONFIRMED:16:00]';
      (run as jest.MockedFunction<typeof run>).mockResolvedValue({
        finalOutput: confirmedResponse,
        history: []
      });

      (createCalEvent as jest.MockedFunction<typeof createCalEvent>).mockRejectedValue(
        new Error('Calendar API error')
      );

      // Should not throw error even if calendar fails
      const result = await continueConversationWithBarber('test@whatsapp.net', '16:00 uygun', 'test-user-id');
      expect(result).toBe(confirmedResponse);
    });
  });

  describe('Conversation state management', () => {
    it('should handle non-existent conversation gracefully', async () => {
      // Mock a response for non-existent conversation
      (run as jest.MockedFunction<typeof run>).mockResolvedValue({
        finalOutput: 'Response to unknown conversation',
        history: []
      });

      // Should not throw error - will create new conversation entry
      const result = await continueConversationWithBarber('nonexistent@whatsapp.net', 'test message', 'test-user-id');
      expect(result).toBe('Response to unknown conversation');
    });

    it('should track active conversations', async () => {
      // Count current active conversations
      const initialActiveConversations = await getAllActiveConversations('test-user-id');
      const initialActiveCount = initialActiveConversations.length;
      
      // Start multiple conversations
      (run as jest.MockedFunction<typeof run>).mockResolvedValue({
        finalOutput: 'Merhaba!',
        history: []
      });

      await startConversationWithBarber('user1@whatsapp.net', 'User1', undefined, 'test-user-id');
      await startConversationWithBarber('user2@whatsapp.net', 'User2', undefined, 'test-user-id');

      const activeConversations = await getAllActiveConversations('test-user-id');
      expect(activeConversations).toContain('user1@whatsapp.net');
      expect(activeConversations).toContain('user2@whatsapp.net');
      expect(activeConversations).toHaveLength(initialActiveCount + 2);
    });

    it('should remove completed conversations from active list', async () => {
      // Start conversation
      (run as jest.MockedFunction<typeof run>).mockResolvedValue({
        finalOutput: 'Merhaba!',
        history: []
      });
      await startConversationWithBarber('user3@whatsapp.net', 'User3', undefined, 'test-user-id');

      let activeConversations = await getAllActiveConversations('test-user-id');
      expect(activeConversations).toContain('user3@whatsapp.net');

      // Complete conversation
      (run as jest.MockedFunction<typeof run>).mockResolvedValue({
        finalOutput: 'Tamam! [CONFIRMED:15:00]',
        history: []
      });
      await continueConversationWithBarber('user3@whatsapp.net', 'uygun', 'test-user-id');

      activeConversations = await getAllActiveConversations('test-user-id');
      expect(activeConversations).not.toContain('user3@whatsapp.net');
    });
  });

  describe('OpenAI Agents SDK error handling', () => {
    it('should handle OpenAI Agents run failure gracefully', async () => {
      (run as jest.MockedFunction<typeof run>).mockRejectedValue(
        new Error('OpenAI API error')
      );

      await expect(
        startConversationWithBarber('error@whatsapp.net', 'ErrorUser', undefined, 'test-user-id')
      ).rejects.toThrow('OpenAI API error');
    });

    it('should handle empty response from OpenAI Agents', async () => {
      (run as jest.MockedFunction<typeof run>).mockResolvedValue({
        finalOutput: null,
        history: []
      });

      const result = await startConversationWithBarber('empty@whatsapp.net', 'EmptyUser', undefined, 'test-user-id');
      expect(result).toBe('Hata oluştu');
    });

    it('should handle malformed confirmation tags', async () => {
      (run as jest.MockedFunction<typeof run>).mockResolvedValueOnce({
        finalOutput: 'Merhaba!',
        history: []
      });
      await startConversationWithBarber('malformed@whatsapp.net', 'User', undefined, 'test-user-id');

      // Response with malformed confirmation
      (run as jest.MockedFunction<typeof run>).mockResolvedValue({
        finalOutput: 'Tamam! [CONFIRMED:invalid-time]',
        history: []
      });

      const result = await continueConversationWithBarber('malformed@whatsapp.net', 'uygun', 'test-user-id');
      
      // Should not crash and should not mark as completed
      expect(result).toBe('Tamam! [CONFIRMED:invalid-time]');
      expect(await isConversationCompleted('malformed@whatsapp.net', 'test-user-id')).toBe(false);
    });
  });
}); 