import { Agent, run } from '@openai/agents';
import { createCalEvent } from '../calendar/google';
import dbService from '../database/service';
import { normalizeJid } from '../whatsapp/index';
import { sendTelegramNotification } from '../telegram/multiuser-bot';
import { TimeoutManager } from '../timeout/manager';

export interface ConversationContext {
  barberName?: string;
  clientName?: string;
  appointmentTime?: string;
  appointmentDate?: string;
  isCompleted?: boolean;
}

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
  barberName: string | undefined,
  userId: string // Add userId parameter
): Promise<string> {
  // Normalize JID to ensure consistency
  const normalizedJid = normalizeJid(jid);
  
  const initialPrompt = barberName 
    ? `${barberName} ismindeki berbere ${clientName} adına saç kesimi randevusu almak için samimi bir mesaj yaz. Bugün veya yarın için uygun saatleri sor.`
    : `${clientName} adına berbere saç kesimi randevusu almak için samimi bir mesaj yaz. Bugün veya yarın için uygun saatleri sor.`;
  
  const result = await run(barberAgent, initialPrompt);
  const message = result.finalOutput || 'Hata oluştu';
  
  // Save conversation context (client and barber info) with normalized JID and userId
  await dbService.saveConversationContext(normalizedJid, clientName, userId, barberName);
  
  // Save initial message to database with normalized JID and userId
  await dbService.saveConversationMessage(normalizedJid, message, 'sent', userId);
  
  // Start timeout tracking for the initial message
  await TimeoutManager.startTimeout(normalizedJid, userId);
  
  return message;
}

export async function continueConversationWithBarber(
  jid: string,
  barberMessage: string,
  userId: string // Add userId parameter
): Promise<string> {
  // Normalize JID to ensure consistency
  const normalizedJid = normalizeJid(jid);
  
  // Save the received message from barber
  await dbService.saveConversationMessage(normalizedJid, barberMessage, 'received', userId);
  
  // Clear awaiting reply status since barber responded
  await dbService.clearAwaitingReply(normalizedJid, userId);
  
  const userPrompt = `Berber şöyle cevap verdi: "${barberMessage}"\n\nBu mesaja uygun şekilde cevap ver. Eğer saat önerdi ve uygunsa onayla ve randevuyu kesinleştir. Eğer randevu kesinleştiyse mesajın sonuna [CONFIRMED:HH:MM] formatında ekle.`;
  
  const result = await run(barberAgent, userPrompt);
  
  const response = result.finalOutput || 'Hata oluştu';
  
  // Save our response
  await dbService.saveConversationMessage(normalizedJid, response, 'sent', userId);
  
  // Check if appointment was confirmed
  const confirmedMatch = response.match(/\[CONFIRMED:(\d{1,2}:\d{2})\]/);
  if (confirmedMatch) {
    const time = confirmedMatch[1];
    const context = await dbService.getConversationContext(normalizedJid, userId);
    
    // Mark conversation as completed
    await dbService.markConversationCompleted(normalizedJid, userId);
    
    // Create appointment record
    await dbService.createAppointment(normalizedJid, context?.clientName || 'Unknown', time, userId);
    
    // Create calendar event
    try {
      await createCalendarEvent(time, context?.barberName);
      console.log(`📅 Calendar event created for ${time}`);
    } catch (error) {
      console.error('Failed to create calendar event:', error);
    }
    
    // Send notification to Telegram
    try {
      const barberName = context?.barberName || 'Берберов';
      const clientName = context?.clientName || 'вас';
      const notificationMessage = `🎉 Отлично! Запись подтверждена!\n\n📅 Время: ${time}\n👨‍💼 Барбер: ${barberName}\n👤 Клиент: ${clientName}\n\n✅ Встреча добавлена в ваш календарь Google.`;
      
      await sendTelegramNotification(notificationMessage, userId);
    } catch (error) {
      console.error('Failed to send Telegram notification:', error);
    }
  }
  
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

export async function getConversationContext(jid: string, userId: string): Promise<ConversationContext | null> {
  const normalizedJid = normalizeJid(jid);
  return await dbService.getConversationContext(normalizedJid, userId);
}

export async function isConversationCompleted(jid: string, userId: string): Promise<boolean> {
  const normalizedJid = normalizeJid(jid);
  return await dbService.isConversationCompleted(normalizedJid, userId);
}

export async function getAllActiveConversations(userId: string): Promise<string[]> {
  return await dbService.getActiveConversations(userId);
} 