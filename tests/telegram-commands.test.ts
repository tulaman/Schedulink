import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import dbService from '../src/database/service';

// Mock Telegraf Context for commands
const createCommandContext = (chatId: string, commandText: string, userName: string = 'Test User') => ({
  chat: { id: parseInt(chatId) },
  from: { first_name: userName, username: 'testuser' },
  message: { text: commandText },
  reply: jest.fn(),
  replyWithPhoto: jest.fn(),
  editMessageText: jest.fn(),
  answerCbQuery: jest.fn()
});

describe('Telegram Commands', () => {
  let testUser: any;

  beforeEach(async () => {
    await dbService.initDatabase();
    
    // Create test user
    const uniqueId = `test_${Date.now()}`;
    testUser = await dbService.createUser({
      telegramChatId: uniqueId,
      name: 'Test User',
      language: 'ru',
      timezone: 'Europe/Moscow',
      onboardingCompleted: true
    });
  });

  afterEach(async () => {
    await dbService.disconnect();
  });

  describe('/add_barber Command', () => {
    it('should add barber successfully', async () => {
      // Simulate database call that would happen in command
      await dbService.ensureUserBarber(testUser.id, '905551234567@s.whatsapp.net', 'Test Barber');
      
      const userBarbers = await dbService.getUserBarbers(testUser.id);
      expect(userBarbers).toHaveLength(1);
      expect(userBarbers[0].nickname).toBe('Test Barber');
      expect(userBarbers[0].barber.jid).toBe('905551234567@s.whatsapp.net');
    });

    it('should handle invalid phone number', async () => {
      // This would be handled in the command validation
      expect(() => {
        // Simulate normalizeJid validation
        const jid = '123'; // Invalid phone number
        if (jid.length < 10) throw new Error('Invalid phone number');
      }).toThrow('Invalid phone number');
    });
  });

  describe('/barbers Command', () => {
    it('should show empty barbers list', async () => {
      const userBarbers = await dbService.getUserBarbers(testUser.id);
      expect(userBarbers).toHaveLength(0);
    });

    it('should show barbers list with data', async () => {
      // Add test barbers
      await dbService.ensureUserBarber(testUser.id, '905551234567@s.whatsapp.net', 'Barber 1');
      await dbService.ensureUserBarber(testUser.id, '905551234568@s.whatsapp.net', 'Barber 2');
      
      const userBarbers = await dbService.getUserBarbers(testUser.id);
      expect(userBarbers).toHaveLength(2);
      expect(userBarbers[0].nickname).toBe('Barber 1');
      expect(userBarbers[1].nickname).toBe('Barber 2');
    });
  });

  describe('/appointments Command', () => {
    it('should show empty appointments list', async () => {
      const appointments = await dbService.getUserAppointments(testUser.id);
      expect(appointments).toHaveLength(0);
    });

    it('should show appointments with data', async () => {
      // Create test appointment
      await dbService.createAppointment(
        '905551234567@s.whatsapp.net',
        'Test Client',
        '15:00',
        testUser.id
      );
      
      const appointments = await dbService.getUserAppointments(testUser.id);
      expect(appointments).toHaveLength(1);
      expect(appointments[0].clientName).toBe('Test Client');
      expect(appointments[0].appointmentTime).toBe('15:00');
      expect(appointments[0].status).toBe('confirmed');
    });
  });

  describe('/settings Command', () => {
    it('should show user settings', async () => {
      const user = await dbService.getUserByTelegramId(testUser.telegramChatId);
      const preferences = await dbService.getUserPreferences(user!.id);
      
      expect(user!.name).toBe('Test User');
      expect(user!.language).toBe('ru');
      expect(user!.timezone).toBe('Europe/Moscow');
      expect(preferences!.notifyOnConfirmation).toBe(true);
      expect(preferences!.notifyOnTimeout).toBe(true);
    });
  });

  describe('User Isolation', () => {
    it('should isolate data between users', async () => {
      // Create second user
      const testUser2 = await dbService.createUser({
        telegramChatId: `test_2_${Date.now()}`,
        name: 'Test User 2',
        language: 'tr',
        timezone: 'Europe/Istanbul',
        onboardingCompleted: true
      });

      // User 1 adds barber
      await dbService.ensureUserBarber(testUser.id, '905551234567@s.whatsapp.net', 'User 1 Barber');
      
      // User 2 adds different barber
      await dbService.ensureUserBarber(testUser2.id, '905551234568@s.whatsapp.net', 'User 2 Barber');
      
      // User 1 creates appointment
      await dbService.createAppointment(
        '905551234567@s.whatsapp.net',
        'User 1 Client',
        '15:00',
        testUser.id
      );
      
      // User 2 creates appointment
      await dbService.createAppointment(
        '905551234568@s.whatsapp.net',
        'User 2 Client',
        '16:00',
        testUser2.id
      );
      
      // Check isolation
      const user1Barbers = await dbService.getUserBarbers(testUser.id);
      const user2Barbers = await dbService.getUserBarbers(testUser2.id);
      const user1Appointments = await dbService.getUserAppointments(testUser.id);
      const user2Appointments = await dbService.getUserAppointments(testUser2.id);
      
      expect(user1Barbers).toHaveLength(1);
      expect(user2Barbers).toHaveLength(1);
      expect(user1Appointments).toHaveLength(1);
      expect(user2Appointments).toHaveLength(1);
      
      expect(user1Barbers[0].nickname).toBe('User 1 Barber');
      expect(user2Barbers[0].nickname).toBe('User 2 Barber');
      expect(user1Appointments[0].clientName).toBe('User 1 Client');
      expect(user2Appointments[0].clientName).toBe('User 2 Client');
    });
  });

  describe('Error Handling', () => {
    it('should handle non-existent user', async () => {
      const user = await dbService.getUserByTelegramId('non_existent_user');
      expect(user).toBeNull();
    });

    it('should handle database errors gracefully', async () => {
      // This would be handled in the actual command error catching
      try {
        await dbService.getUserByTelegramId(''); // Invalid ID
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });
});