import { PrismaClient } from '@prisma/client';
import { ConversationContext } from '../agents/barberAgent';

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
}

export const dbService = new DatabaseService();
export default dbService; 