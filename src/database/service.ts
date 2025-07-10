import { PrismaClient } from '@prisma/client';
import { ConversationContext } from '../agents/barberAgent';
import { normalizeJid } from '../whatsapp/index';

const prisma = new PrismaClient();

export interface CreateUserData {
  telegramChatId: string;
  telegramUsername?: string;
  name: string;
  language?: string;
  timezone?: string;
  onboardingCompleted?: boolean;
}

export interface UserBarberData {
  userId: string;
  barberId: string;
  nickname?: string;
  notes?: string;
  isFavorite?: boolean;
}

class MultiUserDatabaseService {
  async initDatabase() {
    try {
      await prisma.$connect();
      console.log('✅ Multi-user database connected');
      
      // Run JID normalization migration
      await this.migrateJidsToNormalizedFormat();
    } catch (error) {
      console.error('❌ Database connection failed:', error);
      throw error;
    }
  }

  async disconnect() {
    await prisma.$disconnect();
  }

  // ==== USER MANAGEMENT ====
  
  async createUser(data: CreateUserData) {
    const user = await prisma.user.create({
      data: {
        telegramChatId: data.telegramChatId,
        telegramUsername: data.telegramUsername,
        name: data.name,
        language: data.language || 'ru',
        timezone: data.timezone || 'UTC',
        onboardingCompleted: data.onboardingCompleted || false,
        preferences: {
          create: {
            notifyOnConfirmation: true,
            notifyOnTimeout: true,
            defaultAppointmentDuration: 60,
            reminderMinutesBefore: 30
          }
        }
      },
      include: {
        preferences: true
      }
    });
    
    console.log(`✅ Created user: ${user.name} (${user.telegramChatId})`);
    return user;
  }

  async getUserByTelegramId(telegramChatId: string) {
    return await prisma.user.findUnique({
      where: { telegramChatId },
      include: {
        preferences: true
      }
    });
  }

  async getUserById(userId: string) {
    return await prisma.user.findUnique({
      where: { id: userId },
      include: {
        preferences: true
      }
    });
  }

  async updateUserLanguage(telegramChatId: string, language: string) {
    return await prisma.user.update({
      where: { telegramChatId },
      data: { language }
    });
  }

  async updateUserTimezone(telegramChatId: string, timezone: string) {
    return await prisma.user.update({
      where: { telegramChatId },
      data: { timezone }
    });
  }

  async completeOnboarding(telegramChatId: string) {
    return await prisma.user.update({
      where: { telegramChatId },
      data: { onboardingCompleted: true }
    });
  }

  async getUserPreferences(userId: string) {
    return await prisma.userPreferences.findUnique({
      where: { userId }
    });
  }

  async updateUserPreferences(userId: string, preferences: Partial<any>) {
    return await prisma.userPreferences.update({
      where: { userId },
      data: preferences
    });
  }

  // ==== BARBER MANAGEMENT ====

  async findOrCreateBarber(jid: string, name?: string) {
    const normalizedJid = normalizeJid(jid);
    
    const barber = await prisma.barber.upsert({
      where: { jid: normalizedJid },
      update: { name },
      create: { jid: normalizedJid, name }
    });
    
    return barber;
  }

  async ensureUserBarber(userId: string, barberJid: string, barberName?: string) {
    const barber = await this.findOrCreateBarber(barberJid, barberName);
    
    // Create user-barber relationship if doesn't exist
    const userBarber = await prisma.userBarber.upsert({
      where: {
        userId_barberId: {
          userId,
          barberId: barber.id
        }
      },
      update: {
        nickname: barberName || undefined
      },
      create: {
        userId,
        barberId: barber.id,
        nickname: barberName
      }
    });
    
    return userBarber;
  }

  async getUserBarbers(userId: string) {
    return await prisma.userBarber.findMany({
      where: { userId },
      include: {
        barber: true
      },
      orderBy: [
        { isFavorite: 'desc' },
        { createdAt: 'desc' }
      ]
    });
  }

  async updateUserBarber(userId: string, barberId: string, data: Partial<UserBarberData>) {
    return await prisma.userBarber.update({
      where: {
        userId_barberId: {
          userId,
          barberId
        }
      },
      data
    });
  }

  async removeUserBarber(userId: string, barberId: string) {
    return await prisma.userBarber.delete({
      where: {
        userId_barberId: {
          userId,
          barberId
        }
      }
    });
  }

  // ==== CONVERSATION MANAGEMENT (with user isolation) ====

  async saveConversationMessage(
    barberJid: string,
    messageText: string,
    messageType: 'sent' | 'received' | 'system',
    userId: string // Now required!
  ) {
    const normalizedJid = normalizeJid(barberJid);
    const barber = await this.findOrCreateBarber(normalizedJid);
    
    const conversationLog = await prisma.conversationLog.create({
      data: {
        userId, // User isolation
        barberId: barber.id,
        messageText,
        messageType,
        timestamp: new Date()
      }
    });
    
    return conversationLog;
  }

  async saveConversationContext(
    barberJid: string,
    clientName: string,
    userId: string, // Now required!
    barberName?: string
  ) {
    const normalizedJid = normalizeJid(barberJid);
    await this.findOrCreateBarber(normalizedJid, barberName);
    
    // Ensure user-barber relationship exists
    await this.ensureUserBarber(userId, normalizedJid, barberName);
    
    // Save context as a system message
    await this.saveConversationMessage(
      normalizedJid,
      JSON.stringify({ clientName, barberName, type: 'context' }),
      'system',
      userId
    );
  }

  async getConversationHistory(barberJid: string, userId: string) {
    const normalizedJid = normalizeJid(barberJid);
    const barber = await prisma.barber.findUnique({
      where: { jid: normalizedJid },
      include: {
        conversationLogs: {
          where: { userId }, // User isolation
          orderBy: { timestamp: 'asc' }
        }
      }
    });

    if (!barber) return [];

    return barber.conversationLogs.map((log: any) => ({
      text: log.messageText,
      type: log.messageType as 'sent' | 'received' | 'system',
      timestamp: log.timestamp
    }));
  }

  async getConversationContext(barberJid: string, userId: string): Promise<ConversationContext | null> {
    const normalizedJid = normalizeJid(barberJid);
    const barber = await prisma.barber.findUnique({
      where: { jid: normalizedJid },
      include: {
        conversationLogs: {
          where: { userId }, // User isolation
          orderBy: { timestamp: 'asc' }
        },
        appointments: {
          where: { 
            userId, // User isolation
            status: 'confirmed' 
          },
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });

    if (!barber || barber.conversationLogs.length === 0) {
      return null;
    }

    // Find context from system message
    const contextMessage = barber.conversationLogs.find((log: any) => 
      log.messageType === 'system' && log.messageText.includes('"type":"context"')
    );
    
    let clientName, barberName;
    if (contextMessage) {
      try {
        const context = JSON.parse(contextMessage.messageText);
        clientName = context.clientName;
        barberName = context.barberName;
      } catch (e) {
        // Ignore parsing errors
      }
    }

    const isCompleted = barber.conversationLogs.some((log: any) => log.isCompleted);
    const latestAppointment = barber.appointments[0];

    return {
      barberName: barberName || barber.name || undefined,
      clientName: clientName || latestAppointment?.clientName,
      appointmentTime: latestAppointment?.appointmentTime,
      appointmentDate: latestAppointment?.appointmentDate?.toISOString(),
      isCompleted
    };
  }

  async markConversationCompleted(barberJid: string, userId: string) {
    const normalizedJid = normalizeJid(barberJid);
    const barber = await prisma.barber.findUnique({
      where: { jid: normalizedJid }
    });

    if (!barber) return;

    await prisma.conversationLog.updateMany({
      where: { 
        barberId: barber.id,
        userId // User isolation
      },
      data: { isCompleted: true }
    });
  }

  async isConversationCompleted(barberJid: string, userId: string): Promise<boolean> {
    const context = await this.getConversationContext(barberJid, userId);
    return context?.isCompleted || false;
  }

  async getActiveConversations(userId: string): Promise<string[]> {
    const activeConversations = await prisma.conversationLog.findMany({
      where: {
        userId, // User isolation
        isCompleted: false
      },
      select: {
        barber: {
          select: { jid: true }
        }
      },
      distinct: ['barberId']
    });

    return activeConversations.map((conv: any) => conv.barber.jid);
  }

  async getAllIncompleteConversations(userId?: string): Promise<string[]> {
    const where = userId ? { userId, isCompleted: false } : { isCompleted: false };
    
    const incompleteConversations = await prisma.conversationLog.findMany({
      where,
      select: {
        barber: {
          select: { jid: true }
        }
      },
      distinct: ['barberId']
    });

    return incompleteConversations.map((conv: any) => conv.barber.jid);
  }

  // ==== APPOINTMENT MANAGEMENT (with user isolation) ====

  async createAppointment(
    barberJid: string,
    clientName: string,
    appointmentTime: string,
    userId: string, // Now required!
    calendarEventId?: string,
    duration?: number
  ) {
    const normalizedJid = normalizeJid(barberJid);
    const barber = await this.findOrCreateBarber(normalizedJid);

    const appointment = await prisma.appointment.create({
      data: {
        userId, // User isolation
        barberId: barber.id,
        clientName,
        appointmentTime,
        appointmentDate: new Date(), // Default to today
        status: 'confirmed',
        calendarEventId,
        duration: duration || 60
      }
    });

    return appointment;
  }

  async getUserAppointments(userId: string, limit?: number) {
    return await prisma.appointment.findMany({
      where: { userId }, // User isolation
      include: {
        barber: true
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    });
  }

  async updateAppointmentStatus(appointmentId: string, status: string, userId: string) {
    return await prisma.appointment.update({
      where: { 
        id: appointmentId,
        userId // User isolation
      },
      data: { status }
    });
  }

  async cancelAppointment(appointmentId: string, userId: string) {
    return await this.updateAppointmentStatus(appointmentId, 'cancelled', userId);
  }

  // ==== TIMEOUT TRACKING (with user isolation) ====

  async markAwaitingReply(barberJid: string, userId: string): Promise<void> {
    const normalizedJid = normalizeJid(barberJid);
    const barber = await this.findOrCreateBarber(normalizedJid);
    
    await prisma.conversationLog.updateMany({
      where: { 
        barberId: barber.id,
        userId, // User isolation
        messageType: 'sent'
      },
      data: { 
        awaitingReply: true,
        lastSentAt: new Date()
      }
    });
  }

  async markReminderSent(barberJid: string, userId: string): Promise<void> {
    const normalizedJid = normalizeJid(barberJid);
    const barber = await this.findOrCreateBarber(normalizedJid);
    
    await prisma.conversationLog.updateMany({
      where: { 
        barberId: barber.id,
        userId, // User isolation
        awaitingReply: true
      },
      data: { 
        reminderSentAt: new Date()
      }
    });
  }

  async markEscalated(barberJid: string, userId: string): Promise<void> {
    const normalizedJid = normalizeJid(barberJid);
    const barber = await this.findOrCreateBarber(normalizedJid);
    
    await prisma.conversationLog.updateMany({
      where: { 
        barberId: barber.id,
        userId, // User isolation
        awaitingReply: true
      },
      data: { 
        escalatedAt: new Date(),
        awaitingReply: false
      }
    });
  }

  async clearAwaitingReply(barberJid: string, userId: string): Promise<void> {
    const normalizedJid = normalizeJid(barberJid);
    const barber = await this.findOrCreateBarber(normalizedJid);
    
    await prisma.conversationLog.updateMany({
      where: { 
        barberId: barber.id,
        userId, // User isolation
        awaitingReply: true
      },
      data: { 
        awaitingReply: false
      }
    });
  }

  // ==== UTILITY METHODS FOR MULTI-USER SUPPORT ====

  /**
   * Find all users who have active conversations with a specific barber
   * Used by WhatsApp module to determine which users should receive barber replies
   */
  async getUsersWithActiveConversationForBarber(barberJid: string): Promise<string[]> {
    const normalizedJid = normalizeJid(barberJid);
    
    const activeConversations = await prisma.conversationLog.findMany({
      where: {
        barber: {
          jid: normalizedJid
        },
        isCompleted: false
      },
      select: {
        userId: true
      },
      distinct: ['userId']
    });

    return activeConversations.map(conv => conv.userId);
  }

  // ==== MIGRATION UTILITIES ====

  async migrateJidsToNormalizedFormat(): Promise<void> {
    console.log('🔄 Starting JID normalization migration...');
    
    try {
      const barbers = await prisma.barber.findMany();
      
      if (barbers.length === 0) {
        console.log('📄 No barbers found, skipping migration');
        return;
      }
      
      for (const barber of barbers) {
        try {
          const { normalizeJid } = await import('../whatsapp/index');
          const normalizedJid = normalizeJid(barber.jid);
          
          if (normalizedJid !== barber.jid) {
            console.log(`📝 Normalizing JID: ${barber.jid} → ${normalizedJid}`);
            
            const existingBarber = await prisma.barber.findUnique({
              where: { jid: normalizedJid }
            });
            
            if (existingBarber) {
              console.log(`⚠️  Merging duplicate barber records for ${normalizedJid}`);
              
              // Merge conversations
              await prisma.conversationLog.updateMany({
                where: { barberId: barber.id },
                data: { barberId: existingBarber.id }
              });
              
              // Merge appointments
              await prisma.appointment.updateMany({
                where: { barberId: barber.id },
                data: { barberId: existingBarber.id }
              });
              
              // Merge user-barber relationships
              await prisma.userBarber.updateMany({
                where: { barberId: barber.id },
                data: { barberId: existingBarber.id }
              });
              
              // Delete old barber
              await prisma.barber.delete({
                where: { id: barber.id }
              });
              
              console.log(`✅ Merged and deleted old barber record for ${barber.jid}`);
            } else {
              await prisma.barber.update({
                where: { id: barber.id },
                data: { jid: normalizedJid }
              });
              
              console.log(`✅ Updated JID for barber ${barber.id}`);
            }
          }
        } catch (error) {
          console.error(`❌ Failed to normalize JID for barber ${barber.jid}:`, error);
        }
      }
      
      console.log('✅ JID normalization migration completed successfully');
    } catch (error) {
      console.error('❌ JID normalization migration failed:', error);
    }
  }
}

const multiUserDbService = new MultiUserDatabaseService();
export default multiUserDbService;