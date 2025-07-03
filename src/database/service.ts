import { PrismaClient } from '@prisma/client';
import { ConversationContext } from '../agents/barberAgent';
import { normalizeJid } from '../whatsapp/index';

// For now, let's use any types until Prisma client is generated
type PrismaConversationLog = any;
type PrismaBarber = any;

const prisma = new PrismaClient();

export interface ConversationRecord {
  barberId: string;
  context: ConversationContext;
  messages: ConversationMessage[];
}

export interface ConversationMessage {
  text: string;
  type: 'sent' | 'received' | 'system';
  timestamp: Date;
}

class DatabaseService {
  async initDatabase() {
    try {
      await prisma.$connect();
      console.log('✅ Database connected');
      
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

  // User operations
  async findOrCreateUser(telegramChatId: string, name: string) {
    const user = await prisma.user.upsert({
      where: { telegramChatId },
      update: { name },
      create: { telegramChatId, name }
    });
    return user;
  }

  // Barber operations
  async findOrCreateBarber(jid: string, name?: string) {
    const barber = await prisma.barber.upsert({
      where: { jid },
      update: { name },
      create: { jid, name }
    });
    return barber;
  }

  // Conversation operations
  async saveConversationMessage(
    barberJid: string, 
    messageText: string, 
    messageType: 'sent' | 'received' | 'system',
    userId?: string
  ) {
    const barber = await this.findOrCreateBarber(barberJid);
    
    const conversationLog = await prisma.conversationLog.create({
      data: {
        barberId: barber.id,
        userId,
        messageText,
        messageType,
        timestamp: new Date()
      }
    });
    
    return conversationLog;
  }

  // Store client information for conversation
  async saveConversationContext(
    barberJid: string,
    clientName: string,
    barberName?: string
  ) {
    await this.findOrCreateBarber(barberJid, barberName);
    
    // Save context as a system message for easy retrieval
    await this.saveConversationMessage(
      barberJid, 
      JSON.stringify({ clientName, barberName, type: 'context' }), 
      'system'
    );
  }

  async getConversationHistory(barberJid: string): Promise<ConversationMessage[]> {
    const barber = await prisma.barber.findUnique({
      where: { jid: barberJid },
      include: {
        conversationLogs: {
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

  async markConversationCompleted(barberJid: string) {
    const barber = await prisma.barber.findUnique({
      where: { jid: barberJid }
    });

    if (!barber) return;

    await prisma.conversationLog.updateMany({
      where: { barberId: barber.id },
      data: { isCompleted: true }
    });
  }

  async getActiveConversations(): Promise<string[]> {
    const activeConversations = await prisma.conversationLog.findMany({
      where: {
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

  // Appointment operations
  async createAppointment(
    barberJid: string,
    clientName: string,
    appointmentTime: string,
    userId?: string,
    calendarEventId?: string
  ) {
    const barber = await this.findOrCreateBarber(barberJid);

    const appointment = await prisma.appointment.create({
      data: {
        barberId: barber.id,
        userId,
        clientName,
        appointmentTime,
        appointmentDate: new Date(), // Default to today, can be improved
        status: 'confirmed',
        calendarEventId
      }
    });

    return appointment;
  }

  async updateAppointmentStatus(appointmentId: string, status: string) {
    return await prisma.appointment.update({
      where: { id: appointmentId },
      data: { status }
    });
  }

  // Get conversation context from database
  async getConversationContext(barberJid: string): Promise<ConversationContext | null> {
    const barber = await prisma.barber.findUnique({
      where: { jid: barberJid },
      include: {
        conversationLogs: {
          orderBy: { timestamp: 'asc' }
        },
        appointments: {
          where: { status: 'confirmed' },
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

  // Check if conversation is completed
  async isConversationCompleted(barberJid: string): Promise<boolean> {
    const context = await this.getConversationContext(barberJid);
    return context?.isCompleted || false;
  }

  // Recovery operations
  async getAllIncompleteConversations(): Promise<string[]> {
    const incompleteConversations = await prisma.conversationLog.findMany({
      where: { isCompleted: false },
      select: {
        barber: {
          select: { jid: true }
        }
      },
      distinct: ['barberId']
    });

    return incompleteConversations.map((conv: any) => conv.barber.jid);
  }

  // Migration function to normalize existing JIDs
  async migrateJidsToNormalizedFormat(): Promise<void> {
    console.log('🔄 Starting JID normalization migration...');
    
    try {
      // Get all barbers with potentially unnormalized JIDs
      const barbers = await prisma.barber.findMany();
      
      if (barbers.length === 0) {
        console.log('📄 No barbers found, skipping migration');
        return;
      }
      
      for (const barber of barbers) {
        try {
          // Import normalizeJid locally to avoid circular dependency
          const { normalizeJid } = await import('../whatsapp/index');
          const normalizedJid = normalizeJid(barber.jid);
          
          // If JID was normalized (changed), update it
          if (normalizedJid !== barber.jid) {
            console.log(`📝 Normalizing JID: ${barber.jid} → ${normalizedJid}`);
            
            // Check if a barber with normalized JID already exists
            const existingBarber = await prisma.barber.findUnique({
              where: { jid: normalizedJid }
            });
            
            if (existingBarber) {
              // Merge the records - transfer all conversation logs and appointments to the existing normalized barber
              console.log(`⚠️  Merging duplicate barber records for ${normalizedJid}`);
              
              // Update conversation logs
              await prisma.conversationLog.updateMany({
                where: { barberId: barber.id },
                data: { barberId: existingBarber.id }
              });
              
              // Update appointments
              await prisma.appointment.updateMany({
                where: { barberId: barber.id },
                data: { barberId: existingBarber.id }
              });
              
              // Delete the old barber record
              await prisma.barber.delete({
                where: { id: barber.id }
              });
              
              console.log(`✅ Merged and deleted old barber record for ${barber.jid}`);
            } else {
              // Simply update the JID
              await prisma.barber.update({
                where: { id: barber.id },
                data: { jid: normalizedJid }
              });
              
              console.log(`✅ Updated JID for barber ${barber.id}`);
            }
          }
        } catch (error) {
          console.error(`❌ Failed to normalize JID for barber ${barber.jid}:`, error);
          // Continue with other barbers even if one fails
        }
      }
      
      console.log('✅ JID normalization migration completed successfully');
    } catch (error) {
      console.error('❌ JID normalization migration failed:', error);
      // Don't throw error to prevent startup failure - just log and continue
    }
  }

  // Timeout tracking methods
  async markAwaitingReply(barberJid: string): Promise<void> {
    const barber = await this.findOrCreateBarber(barberJid);
    
    // Update the latest conversation log to mark as awaiting reply
    await prisma.conversationLog.updateMany({
      where: { 
        barberId: barber.id,
        messageType: 'sent'
      },
      data: { 
        awaitingReply: true,
        lastSentAt: new Date()
      }
    });
  }

  async markReminderSent(barberJid: string): Promise<void> {
    const barber = await this.findOrCreateBarber(barberJid);
    
    await prisma.conversationLog.updateMany({
      where: { 
        barberId: barber.id,
        awaitingReply: true
      },
      data: { 
        reminderSentAt: new Date()
      }
    });
  }

  async markEscalated(barberJid: string): Promise<void> {
    const barber = await this.findOrCreateBarber(barberJid);
    
    await prisma.conversationLog.updateMany({
      where: { 
        barberId: barber.id,
        awaitingReply: true
      },
      data: { 
        escalatedAt: new Date(),
        awaitingReply: false // No longer awaiting reply as it's escalated
      }
    });
  }

  async clearAwaitingReply(barberJid: string): Promise<void> {
    const barber = await this.findOrCreateBarber(barberJid);
    
    await prisma.conversationLog.updateMany({
      where: { 
        barberId: barber.id,
        awaitingReply: true
      },
      data: { 
        awaitingReply: false
      }
    });
  }
}

export const dbService = new DatabaseService();
export default dbService; 