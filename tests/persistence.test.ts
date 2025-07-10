import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { startConversationWithBarber, continueConversationWithBarber, getConversationContext } from '../src/agents/barberAgent';
import dbService from '../src/database/service';

// Mock the OpenAI agents SDK
jest.mock('@openai/agents', () => ({
  Agent: class MockAgent {
    constructor() {}
  },
  run: jest.fn().mockResolvedValue({
    finalOutput: 'Mocked response from agent'
  })
}));

// Mock WhatsApp functions
jest.mock('../src/whatsapp/index', () => ({
  normalizeJid: (jid: string) => {
    if (!jid || typeof jid !== 'string') {
      throw new Error('Invalid JID: JID must be a non-empty string');
    }
    if (jid.includes('@')) return jid;
    const phoneNumber = jid.replace(/[^\d]/g, '');
    if (phoneNumber.length < 10) {
      throw new Error('Invalid phone number: must be at least 10 digits');
    }
    return `${phoneNumber}@s.whatsapp.net`;
  }
}));

// Mock Telegram functions
jest.mock('../src/telegram/multiuser-bot', () => ({
  sendTelegramNotification: jest.fn()
}));

// Mock timeout manager
jest.mock('../src/timeout/manager', () => ({
  TimeoutManager: {
    startTimeout: jest.fn(),
    clearTimeout: jest.fn()
  }
}));

// Mock calendar integration
jest.mock('../src/calendar/google', () => ({
  createCalEvent: jest.fn()
}));

describe('Persistence Tests (Multi-User)', () => {
  let testUserId: string;

  beforeEach(async () => {
    await dbService.initDatabase();
    
    // Create test user
    const testUser = await dbService.createUser({
      telegramChatId: `test_${Date.now()}`,
      name: 'Test User',
      language: 'tr',
      timezone: 'Europe/Istanbul',
      onboardingCompleted: true
    });
    testUserId = testUser.id;
  });

  afterEach(async () => {
    await dbService.disconnect();
  });

  describe('Conversation Persistence', () => {
    it('should persist conversation messages with user isolation', async () => {
      const jid = 'test-barber@s.whatsapp.net';
      const clientName = 'Test Client';
      const barberName = 'Test Barber';

      // Start conversation
      await startConversationWithBarber(jid, clientName, barberName, testUserId);

      // Verify conversation context
      const conversationContext = await getConversationContext(jid, testUserId);
      expect(conversationContext).toBeDefined();
      expect(conversationContext?.clientName).toBe(clientName);
      expect(conversationContext?.barberName).toBe(barberName);

      // Verify messages are saved with user isolation
      const history = await dbService.getConversationHistory(jid, testUserId);
      expect(history.length).toBeGreaterThan(0);
    });

    it('should handle barber replies with user isolation', async () => {
      const jid = 'test-barber-2@s.whatsapp.net';
      const clientName = 'Test Client 2';
      const barberName = 'Test Barber 2';

      // Start conversation
      await startConversationWithBarber(jid, clientName, barberName, testUserId);

      // Continue conversation
      const barberReply = "Evet, yarın 15:00 uygun mu?";
      await continueConversationWithBarber(jid, barberReply, testUserId);

      // Verify both messages are saved
      const history = await dbService.getConversationHistory(jid, testUserId);
      expect(history.length).toBeGreaterThan(1);
      expect(history.some(msg => msg.type === 'received')).toBe(true);
    });
  });

  describe('Multi-User Isolation', () => {
    it('should isolate conversations between users', async () => {
      // Create second user
      const testUser2 = await dbService.createUser({
        telegramChatId: `test_2_${Date.now()}`,
        name: 'Test User 2',
        language: 'ru',
        timezone: 'Europe/Moscow',
        onboardingCompleted: true
      });

      const jid = 'shared-barber@s.whatsapp.net';
      
      // User 1 starts conversation
      await startConversationWithBarber(jid, 'Client 1', 'Barber Name', testUserId);
      
      // User 2 starts conversation with same barber
      await startConversationWithBarber(jid, 'Client 2', 'Barber Name', testUser2.id);

      // Check conversations are isolated
      const context1 = await getConversationContext(jid, testUserId);
      const context2 = await getConversationContext(jid, testUser2.id);

      expect(context1?.clientName).toBe('Client 1');
      expect(context2?.clientName).toBe('Client 2');
    });
  });

  describe('Appointment Persistence', () => {
    it('should create appointments with user isolation', async () => {
      const jid = 'appointment-barber@s.whatsapp.net';
      
      await dbService.createAppointment(jid, 'Test Client', '15:00', testUserId);
      
      const appointments = await dbService.getUserAppointments(testUserId);
      expect(appointments).toHaveLength(1);
      expect(appointments[0].clientName).toBe('Test Client');
      expect(appointments[0].appointmentTime).toBe('15:00');
    });
  });

  describe('Recovery and Restart', () => {
    it('should recover incomplete conversations by user', async () => {
      const jid = 'recovery-barber@s.whatsapp.net';
      
      // Start incomplete conversation
      await startConversationWithBarber(jid, 'Recovery Client', 'Recovery Barber', testUserId);
      
      // Check it's detected as incomplete
      const incompleteConversations = await dbService.getAllIncompleteConversations(testUserId);
      expect(incompleteConversations).toContain(jid);
      
      // Complete the conversation
      await dbService.markConversationCompleted(jid, testUserId);
      
      // Check it's no longer incomplete
      const afterCompletion = await dbService.getAllIncompleteConversations(testUserId);
      expect(afterCompletion).not.toContain(jid);
    });
  });
});