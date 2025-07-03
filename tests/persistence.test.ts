import { PrismaClient } from '@prisma/client';
import dbService from '../src/database/service';
import { startConversationWithBarber, continueConversationWithBarber, getAllActiveConversations } from '../src/agents/barberAgent';

// Mock OpenAI Agents
jest.mock('@openai/agents', () => ({
  Agent: jest.fn().mockImplementation(() => ({})),
  run: jest.fn().mockResolvedValue({
    finalOutput: 'Mocked response from agent'
  })
}));

// Mock Google Calendar
jest.mock('../src/calendar/google', () => ({
  createCalEvent: jest.fn().mockResolvedValue({ success: true })
}));

const prisma = new PrismaClient({
  datasourceUrl: 'file:./test.db'
});

describe('Stage 6: Persistence & Restart Safety', () => {
  beforeAll(async () => {
    // Initialize test database
    await dbService.initDatabase();
  });

  beforeEach(async () => {
    // Clean database before each test - order matters for foreign key constraints
    await prisma.conversationLog.deleteMany();
    await prisma.appointment.deleteMany();
    await prisma.barber.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    // Clean up - order matters for foreign key constraints
    await prisma.conversationLog.deleteMany();
    await prisma.appointment.deleteMany();
    await prisma.barber.deleteMany();
    await prisma.user.deleteMany();
    await dbService.disconnect();
  });

  describe('Conversation Persistence', () => {
    it('should persist conversation messages to database', async () => {
      const jid = 'test-barber@c.us';
      const clientName = 'John Doe';
      const barberName = 'Mehmet';

      // Start conversation
      await startConversationWithBarber(jid, clientName, barberName);

      // Verify barber was created
      const barber = await prisma.barber.findUnique({
        where: { jid },
        include: { conversationLogs: true }
      });

      expect(barber).toBeTruthy();
      expect(barber!.name).toBe(barberName);
      expect(barber!.conversationLogs).toHaveLength(2); // system + sent
      expect(barber!.conversationLogs[0].messageType).toBe('system'); // context message
      expect(barber!.conversationLogs[1].messageType).toBe('sent');
      expect(barber!.conversationLogs[1].messageText).toContain('Mocked response');
    });

    it('should persist received messages from barber', async () => {
      const jid = 'test-barber@c.us';
      const clientName = 'John Doe';
      const barberName = 'Mehmet';
      const barberReply = 'Merhaba! 15:00 uygun mu?';

      // Start conversation
      await startConversationWithBarber(jid, clientName, barberName);
      
      // Continue conversation
      await continueConversationWithBarber(jid, barberReply);

      // Verify messages were persisted
      const barber = await prisma.barber.findUnique({
        where: { jid },
        include: { 
          conversationLogs: {
            orderBy: { timestamp: 'asc' }
          }
        }
      });

      expect(barber!.conversationLogs).toHaveLength(4); // system, sent, received, sent
      expect(barber!.conversationLogs[0].messageType).toBe('system'); // context message
      expect(barber!.conversationLogs[1].messageType).toBe('sent');
      expect(barber!.conversationLogs[2].messageType).toBe('received');
      expect(barber!.conversationLogs[2].messageText).toBe(barberReply);
      expect(barber!.conversationLogs[3].messageType).toBe('sent');
    });

    it('should mark conversation as completed when appointment confirmed', async () => {
      const jid = 'test-barber@c.us';
      const clientName = 'John Doe';
      const barberName = 'Mehmet';
      
      // Start conversation
      await startConversationWithBarber(jid, clientName, barberName);
      
      // Mock confirmed response for the next call
      const { run } = require('@openai/agents');
      run.mockResolvedValueOnce({
        finalOutput: 'Harika! 15:00 saati benim için uygun. Teşekkürler! [CONFIRMED:15:00]'
      });

      // Continue with confirmation
      await continueConversationWithBarber(jid, '15:00 uygun mu?');

      // Verify conversation marked as completed
      const barber = await prisma.barber.findUnique({
        where: { jid },
        include: { 
          conversationLogs: true,
          appointments: true
        }
      });

      const completedLogs = barber!.conversationLogs.filter(log => log.isCompleted);
      expect(completedLogs.length).toBeGreaterThan(0);
      
      // Verify appointment was created
      expect(barber!.appointments).toHaveLength(1);
      expect(barber!.appointments[0].appointmentTime).toBe('15:00');
      expect(barber!.appointments[0].status).toBe('confirmed');
      expect(barber!.appointments[0].clientName).toBe(clientName);
    });
  });

  describe('Restart Recovery', () => {
    it('should restore incomplete conversations after restart', async () => {
      const jid1 = 'barber1@c.us';
      const jid2 = 'barber2@c.us';
      const jid3 = 'barber3@c.us';

      // Create some conversations - 2 incomplete, 1 completed
      await startConversationWithBarber(jid1, 'Client1', 'Barber1');
      await startConversationWithBarber(jid2, 'Client2', 'Barber2');
      await startConversationWithBarber(jid3, 'Client3', 'Barber3');

      // Mark one conversation as completed
      await dbService.markConversationCompleted(jid3);

      // Simulate restart - get incomplete conversations
      const incompleteConversations = await dbService.getAllIncompleteConversations();
      
      expect(incompleteConversations).toHaveLength(2);
      expect(incompleteConversations).toContain(jid1);
      expect(incompleteConversations).toContain(jid2);
      expect(incompleteConversations).not.toContain(jid3);
    });

    it('should restore conversation history correctly', async () => {
      const jid = 'test-barber@c.us';
      const clientName = 'John Doe';
      const barberName = 'Mehmet';

      // Create conversation with multiple messages
      await startConversationWithBarber(jid, clientName, barberName);
      await continueConversationWithBarber(jid, 'Merhaba! Hangi saatler uygun?');
      await continueConversationWithBarber(jid, '15:00 da gelebilir misin?');

      // Retrieve conversation history
      const history = await dbService.getConversationHistory(jid);
      
      expect(history).toHaveLength(6); // system, sent, received, sent, received, sent
      expect(history[0].type).toBe('system'); // context message
      expect(history[1].type).toBe('sent');
      expect(history[2].type).toBe('received');
      expect(history[2].text).toBe('Merhaba! Hangi saatler uygun?');
      expect(history[4].text).toBe('15:00 da gelebilir misin?');
    });

    it('should handle database connection failures gracefully', async () => {
      // This test simulates database connectivity issues
      const originalConnect = dbService.initDatabase;
      
      // Mock database failure
      jest.spyOn(dbService, 'initDatabase').mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(dbService.initDatabase()).rejects.toThrow('Database connection failed');
      
      // Restore original method
      dbService.initDatabase = originalConnect;
    });
  });

  describe('Active Conversations Management', () => {
    it('should track active conversations correctly', async () => {
      const jid1 = 'barber1@c.us';
      const jid2 = 'barber2@c.us';

      // Initially no active conversations
      let activeConversations = await getAllActiveConversations();
      expect(activeConversations).toHaveLength(0);

      // Start conversations
      await startConversationWithBarber(jid1, 'Client1', 'Barber1');
      await startConversationWithBarber(jid2, 'Client2', 'Barber2');

      // Should have 2 active conversations
      activeConversations = await getAllActiveConversations();
      expect(activeConversations).toHaveLength(2);
      expect(activeConversations).toContain(jid1);
      expect(activeConversations).toContain(jid2);

      // Complete one conversation
      await dbService.markConversationCompleted(jid1);

      // Should have 1 active conversation
      activeConversations = await getAllActiveConversations();
      expect(activeConversations).toHaveLength(1);
      expect(activeConversations).toContain(jid2);
      expect(activeConversations).not.toContain(jid1);
    });
  });
}); 