import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import dbService from '../src/database/service';
import { TimeoutManager } from '../src/timeout/manager';

describe('Integration Tests', () => {
  let testUser: any;
  let testBarber: any;

  beforeEach(async () => {
    await dbService.initDatabase();
    
    testUser = await dbService.createUser({
      telegramChatId: `integration_user_${Date.now()}`,
      name: 'Integration User',
      language: 'ru',
      timezone: 'Europe/Moscow',
      onboardingCompleted: true
    });
    
    testBarber = await dbService.findOrCreateBarber('905551234567@s.whatsapp.net', 'Integration Barber');
  });

  afterEach(async () => {
    TimeoutManager.clearAllTimeouts();
    await dbService.disconnect();
  });

  describe('Complete Appointment Flow', () => {
    it('should handle complete appointment booking flow', async () => {
      const barberJid = testBarber.jid;
      
      // 1. User starts conversation
      await dbService.saveConversationContext(barberJid, 'Test Client', testUser.id, 'Test Barber');
      await dbService.saveConversationMessage(barberJid, 'Initial message', 'sent', testUser.id);
      
      // 2. Check conversation context
      const initialContext = await dbService.getConversationContext(barberJid, testUser.id);
      expect(initialContext?.clientName).toBe('Test Client');
      expect(initialContext?.isCompleted).toBe(false);
      
      // 3. Barber responds
      await dbService.saveConversationMessage(barberJid, 'Barber response', 'received', testUser.id);
      
      // 4. User responds with confirmation
      await dbService.saveConversationMessage(barberJid, 'Confirmed for 15:00 [CONFIRMED:15:00]', 'sent', testUser.id);
      
      // 5. Mark conversation as completed
      await dbService.markConversationCompleted(barberJid, testUser.id);
      
      // 6. Create appointment
      await dbService.createAppointment(barberJid, 'Test Client', '15:00', testUser.id);
      
      // 7. Verify final state
      const finalContext = await dbService.getConversationContext(barberJid, testUser.id);
      const userAppointments = await dbService.getUserAppointments(testUser.id);
      
      expect(finalContext?.isCompleted).toBe(true);
      expect(userAppointments).toHaveLength(1);
      expect(userAppointments[0].appointmentTime).toBe('15:00');
      expect(userAppointments[0].status).toBe('confirmed');
    });
  });

  describe('Multi-User Scenario', () => {
    it('should handle multiple users booking same barber', async () => {
      // Create second user
      const testUser2 = await dbService.createUser({
        telegramChatId: `integration_user_2_${Date.now()}`,
        name: 'Integration User 2',
        language: 'tr',
        timezone: 'Europe/Istanbul',
        onboardingCompleted: true
      });

      const barberJid = testBarber.jid;
      
      // User 1 starts conversation
      await dbService.saveConversationContext(barberJid, 'Client 1', testUser.id, 'Barber Name');
      await dbService.saveConversationMessage(barberJid, 'User 1 message', 'sent', testUser.id);
      
      // User 2 starts conversation with same barber
      await dbService.saveConversationContext(barberJid, 'Client 2', testUser2.id, 'Barber Name');
      await dbService.saveConversationMessage(barberJid, 'User 2 message', 'sent', testUser2.id);
      
      // Check both users have active conversations
      const activeUsers = await dbService.getUsersWithActiveConversationForBarber(barberJid);
      expect(activeUsers).toContain(testUser.id);
      expect(activeUsers).toContain(testUser2.id);
      
      // User 1 completes booking
      await dbService.markConversationCompleted(barberJid, testUser.id);
      await dbService.createAppointment(barberJid, 'Client 1', '15:00', testUser.id);
      
      // User 2 still has active conversation
      const activeUsersAfter = await dbService.getUsersWithActiveConversationForBarber(barberJid);
      expect(activeUsersAfter).not.toContain(testUser.id);
      expect(activeUsersAfter).toContain(testUser2.id);
      
      // Check appointments are isolated
      const user1Appointments = await dbService.getUserAppointments(testUser.id);
      const user2Appointments = await dbService.getUserAppointments(testUser2.id);
      
      expect(user1Appointments).toHaveLength(1);
      expect(user2Appointments).toHaveLength(0);
    });
  });

  describe('Timeout Management Integration', () => {
    it('should handle timeout tracking correctly', async () => {
      const barberJid = testBarber.jid;
      
      // Start conversation and timeout tracking
      await dbService.saveConversationMessage(barberJid, 'Initial message', 'sent', testUser.id);
      await dbService.markAwaitingReply(barberJid, testUser.id);
      
      // Check active conversations
      const activeConversations = await dbService.getActiveConversations(testUser.id);
      expect(activeConversations).toContain(barberJid);
      
      // Barber replies
      await dbService.saveConversationMessage(barberJid, 'Barber reply', 'received', testUser.id);
      await dbService.clearAwaitingReply(barberJid, testUser.id);
      
      // Check timeout is cleared
      const activeAfterReply = await dbService.getActiveConversations(testUser.id);
      expect(activeAfterReply).toHaveLength(0);
    });
  });

  describe('Data Consistency', () => {
    it('should maintain data consistency across operations', async () => {
      const barberJid = testBarber.jid;
      
      // Create user-barber relationship
      await dbService.ensureUserBarber(testUser.id, barberJid, 'My Barber');
      
      // Start conversation
      await dbService.saveConversationContext(barberJid, 'Test Client', testUser.id, 'My Barber');
      await dbService.saveConversationMessage(barberJid, 'Hello', 'sent', testUser.id);
      
      // Create appointment
      await dbService.createAppointment(barberJid, 'Test Client', '15:00', testUser.id);
      
      // Check all data is consistent
      const userBarbers = await dbService.getUserBarbers(testUser.id);
      const conversationContext = await dbService.getConversationContext(barberJid, testUser.id);
      const userAppointments = await dbService.getUserAppointments(testUser.id);
      
      expect(userBarbers).toHaveLength(1);
      expect(userBarbers[0].nickname).toBe('My Barber');
      expect(conversationContext?.barberName).toBe('My Barber');
      expect(conversationContext?.clientName).toBe('Test Client');
      expect(userAppointments).toHaveLength(1);
      expect(userAppointments[0].clientName).toBe('Test Client');
    });
  });

  describe('Error Recovery', () => {
    it('should handle incomplete conversation recovery', async () => {
      const barberJid = testBarber.jid;
      
      // Create incomplete conversation
      await dbService.saveConversationMessage(barberJid, 'Incomplete message', 'sent', testUser.id);
      
      // Check it's detected as incomplete
      const incompleteConversations = await dbService.getAllIncompleteConversations(testUser.id);
      expect(incompleteConversations).toContain(barberJid);
      
      // Complete the conversation
      await dbService.markConversationCompleted(barberJid, testUser.id);
      
      // Check it's no longer incomplete
      const afterCompletion = await dbService.getAllIncompleteConversations(testUser.id);
      expect(afterCompletion).not.toContain(barberJid);
    });
  });
});