import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import dbService from '../src/database/service';
import { normalizeJid } from '../src/whatsapp/index';

describe('Multi-user Database Service', () => {
  let testUser1: any;
  let testUser2: any;
  let testBarber: any;

  beforeEach(async () => {
    // Initialize database
    await dbService.initDatabase();
    
    // Create test users with unique IDs
    const timestamp = Date.now();
    testUser1 = await dbService.createUser({
      telegramChatId: `test_user_1_${timestamp}`,
      name: 'Test User 1',
      language: 'ru',
      timezone: 'Europe/Moscow'
    });

    testUser2 = await dbService.createUser({
      telegramChatId: `test_user_2_${timestamp}`, 
      name: 'Test User 2',
      language: 'tr',
      timezone: 'Europe/Istanbul'
    });

    // Create test barber
    testBarber = await dbService.findOrCreateBarber('905551234567@s.whatsapp.net', 'Test Barber');
  });

  afterEach(async () => {
    await dbService.disconnect();
  });

  describe('User Management', () => {
    it('should create users with preferences', async () => {
      expect(testUser1.id).toBeDefined();
      expect(testUser1.name).toBe('Test User 1');
      expect(testUser1.language).toBe('ru');
      expect(testUser1.preferences).toBeDefined();
      expect(testUser1.preferences.notifyOnConfirmation).toBe(true);
    });

    it('should find users by telegram ID', async () => {
      const found = await dbService.getUserByTelegramId('test_user_1');
      expect(found).toBeDefined();
      expect(found!.name).toBe('Test User 1');
    });

    it('should update user language', async () => {
      await dbService.updateUserLanguage('test_user_1', 'en');
      const updated = await dbService.getUserByTelegramId('test_user_1');
      expect(updated!.language).toBe('en');
    });
  });

  describe('User-Barber Relationships', () => {
    it('should create user-barber relationships', async () => {
      await dbService.ensureUserBarber(testUser1.id, testBarber.jid, 'My Barber');
      
      const userBarbers = await dbService.getUserBarbers(testUser1.id);
      expect(userBarbers).toHaveLength(1);
      expect(userBarbers[0].nickname).toBe('My Barber');
      expect(userBarbers[0].barber.jid).toBe(testBarber.jid);
    });

    it('should isolate barbers by user', async () => {
      // User 1 adds barber with nickname
      await dbService.ensureUserBarber(testUser1.id, testBarber.jid, 'My Favorite Barber');
      
      // User 2 adds same barber with different nickname
      await dbService.ensureUserBarber(testUser2.id, testBarber.jid, 'Good Barber');
      
      const user1Barbers = await dbService.getUserBarbers(testUser1.id);
      const user2Barbers = await dbService.getUserBarbers(testUser2.id);
      
      expect(user1Barbers).toHaveLength(1);
      expect(user2Barbers).toHaveLength(1);
      expect(user1Barbers[0].nickname).toBe('My Favorite Barber');
      expect(user2Barbers[0].nickname).toBe('Good Barber');
    });
  });

  describe('Conversation Isolation', () => {
    it('should isolate conversations by user', async () => {
      // User 1 starts conversation
      await dbService.saveConversationMessage(testBarber.jid, 'Hello from user 1', 'sent', testUser1.id);
      await dbService.saveConversationContext(testBarber.jid, 'Client 1', testUser1.id, 'Barber Name');
      
      // User 2 starts conversation with same barber
      await dbService.saveConversationMessage(testBarber.jid, 'Hello from user 2', 'sent', testUser2.id);
      await dbService.saveConversationContext(testBarber.jid, 'Client 2', testUser2.id, 'Barber Name');
      
      // Check conversation contexts are isolated
      const context1 = await dbService.getConversationContext(testBarber.jid, testUser1.id);
      const context2 = await dbService.getConversationContext(testBarber.jid, testUser2.id);
      
      expect(context1?.clientName).toBe('Client 1');
      expect(context2?.clientName).toBe('Client 2');
    });

    it('should find users with active conversations', async () => {
      // User 1 has active conversation
      await dbService.saveConversationMessage(testBarber.jid, 'Active message', 'sent', testUser1.id);
      
      // User 2 has completed conversation
      await dbService.saveConversationMessage(testBarber.jid, 'Completed message', 'sent', testUser2.id);
      await dbService.markConversationCompleted(testBarber.jid, testUser2.id);
      
      const activeUsers = await dbService.getUsersWithActiveConversationForBarber(testBarber.jid);
      expect(activeUsers).toContain(testUser1.id);
      expect(activeUsers).not.toContain(testUser2.id);
    });
  });

  describe('Appointment Isolation', () => {
    it('should isolate appointments by user', async () => {
      // User 1 creates appointment
      await dbService.createAppointment(testBarber.jid, 'Client 1', '15:00', testUser1.id);
      
      // User 2 creates appointment with same barber
      await dbService.createAppointment(testBarber.jid, 'Client 2', '16:00', testUser2.id);
      
      const user1Appointments = await dbService.getUserAppointments(testUser1.id);
      const user2Appointments = await dbService.getUserAppointments(testUser2.id);
      
      expect(user1Appointments).toHaveLength(1);
      expect(user2Appointments).toHaveLength(1);
      expect(user1Appointments[0].clientName).toBe('Client 1');
      expect(user2Appointments[0].clientName).toBe('Client 2');
    });
  });

  describe('Timeout Tracking Isolation', () => {
    it('should isolate timeout tracking by user', async () => {
      // User 1 marks awaiting reply
      await dbService.markAwaitingReply(testBarber.jid, testUser1.id);
      
      // User 2 marks awaiting reply for same barber
      await dbService.markAwaitingReply(testBarber.jid, testUser2.id);
      
      // User 1 clears awaiting reply
      await dbService.clearAwaitingReply(testBarber.jid, testUser1.id);
      
      // Check that user 2 is still awaiting reply
      const user1Active = await dbService.getActiveConversations(testUser1.id);
      const user2Active = await dbService.getActiveConversations(testUser2.id);
      
      expect(user1Active).toHaveLength(0);
      expect(user2Active).toHaveLength(1);
    });
  });

  describe('JID Normalization', () => {
    it('should normalize JIDs consistently', async () => {
      const jid1 = normalizeJid('905551234567');
      const jid2 = normalizeJid('+90 555 123 45 67');
      const jid3 = normalizeJid('905551234567@s.whatsapp.net');
      
      expect(jid1).toBe('905551234567@s.whatsapp.net');
      expect(jid2).toBe('905551234567@s.whatsapp.net');
      expect(jid3).toBe('905551234567@s.whatsapp.net');
    });

    it('should handle invalid JIDs', async () => {
      expect(() => normalizeJid('')).toThrow('Invalid JID');
      expect(() => normalizeJid('123')).toThrow('Invalid phone number');
    });
  });
});