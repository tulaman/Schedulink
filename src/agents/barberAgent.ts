import { Agent, run } from '@openai/agents';
import { createCalEvent } from '../calendar/google';

export interface ConversationContext {
  barberName?: string;
  clientName?: string;
  appointmentTime?: string;
  appointmentDate?: string;
  isCompleted?: boolean;
}

export interface BarberConversation {
  thread: any[];
  context: ConversationContext;
  jid: string; // WhatsApp JID of the barber
}

// Global conversations storage (in production this should be persisted)
const conversations = new Map<string, BarberConversation>();

const barberAgent = new Agent({
  name: 'BarberBookingAgent',
  instructions: `Sen Türkiye'de yaşayan bir müşterinin kişisel asistanısın. Görevin müşteri adına berberlere yazıp saç kesimi randevusu almak.

KURALLARIN:
1. Her zaman kibar, samimi ve doğal bir Türkçe kullan
2. Müşteri adına konuş, sanki müşterinin kendisi yazıyormuş gibi
3. Randevu talep ederken açık ve net ol
4. Berber saat önerdiğinde, uygun olan saati onayla
5. Randevu konfirme olduğunda, mesajın sonunda [CONFIRMED:HH:MM] formatında belirt
6. Maksimum 3-4 mesajda randevu almaya çalış

HEDEF: Müşteri için uygun bir saatte saç kesimi randevusu almak.

Örnekler:
- İlk mesaj: "Merhaba! Saç kesimi randevusu almak istiyorum. Bugün veya yarın müsait saatleriniz var mı?"
- Onaylama: "Harika! 15:00 saati benim için uygun. Teşekkürler! [CONFIRMED:15:00]"`
});

export async function startConversationWithBarber(
  jid: string, 
  clientName: string, 
  barberName?: string
): Promise<string> {
  const context: ConversationContext = {
    clientName,
    barberName,
    isCompleted: false
  };
  
  const initialPrompt = barberName 
    ? `${barberName} ismindeki berbere ${clientName} adına saç kesimi randevusu almak için samimi bir mesaj yaz. Bugün veya yarın için uygun saatleri sor.`
    : `${clientName} adına berbere saç kesimi randevusu almak için samimi bir mesaj yaz. Bugün veya yarın için uygun saatleri sor.`;
  
  const result = await run(barberAgent, initialPrompt);
  
  conversations.set(jid, {
    thread: [], // We'll manage this manually since we need to track the conversation state
    context,
    jid
  });
  
  return result.finalOutput || 'Hata oluştu';
}

export async function continueConversationWithBarber(
  jid: string,
  barberMessage: string
): Promise<string> {
  const conversation = conversations.get(jid);
  if (!conversation) {
    throw new Error('Conversation not found');
  }
  
  const userPrompt = `Berber şöyle cevap verdi: "${barberMessage}"\n\nBu mesaja uygun şekilde cevap ver. Eğer saat önerdi ve uygunsa onayla ve randevuyu kesinleştir. Eğer randevu kesinleştiyse mesajın sonuna [CONFIRMED:HH:MM] formatında ekle.`;
  
  const result = await run(barberAgent, userPrompt);
  
  const response = result.finalOutput || 'Hata oluştu';
  
  // Check if appointment was confirmed
  const confirmedMatch = response.match(/\[CONFIRMED:(\d{1,2}:\d{2})\]/);
  if (confirmedMatch) {
    const time = confirmedMatch[1];
    conversation.context.appointmentTime = time;
    conversation.context.isCompleted = true;
    
    // Create calendar event
    try {
      await createCalendarEvent(time, conversation.context.barberName);
      console.log(`📅 Calendar event created for ${time}`);
    } catch (error) {
      console.error('Failed to create calendar event:', error);
    }
  }
  
  // Update conversation context
  conversations.set(jid, conversation);
  
  return response;
}

async function createCalendarEvent(time: string, barberName?: string) {
  try {
    const appointmentDate = new Date();
    const [hours, minutes] = time.split(':').map(Number);
    
    const startTime = new Date(appointmentDate);
    startTime.setHours(hours, minutes, 0, 0);
    
    const endTime = new Date(startTime);
    endTime.setHours(hours + 1, minutes, 0, 0); // Default 1 hour duration
    
    await createCalEvent({
      start: startTime,
      end: endTime,
      summary: barberName ? `Saç kesimi - ${barberName}` : 'Saç kesimi randevusu'
    });
    
    return { success: true, message: 'Randevu takvime eklendi' };
  } catch (error) {
    console.error('Calendar event creation failed:', error);
    return { success: false, message: 'Takvime eklenirken hata oluştu' };
  }
}

export function getConversationContext(jid: string): ConversationContext | null {
  const conversation = conversations.get(jid);
  return conversation ? conversation.context : null;
}

export function isConversationCompleted(jid: string): boolean {
  const context = getConversationContext(jid);
  return context?.isCompleted || false;
}

export function getAllActiveConversations(): string[] {
  return Array.from(conversations.keys()).filter(jid => !isConversationCompleted(jid));
} 