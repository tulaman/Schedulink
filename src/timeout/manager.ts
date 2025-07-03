import dbService from '../database/service';
import { sendHumanLike } from '../whatsapp/index';
import { sendTelegramNotification } from '../telegram/bot';

// Map to store active timeouts: JID -> { reminderTimeout, escalationTimeout }
const activeTimeouts = new Map<string, {
  reminderTimeout?: NodeJS.Timeout;
  escalationTimeout?: NodeJS.Timeout;
}>();

// Timeout constants (in milliseconds)
const REMINDER_DELAY = 10 * 60 * 1000; // 10 minutes
const ESCALATION_DELAY = 20 * 60 * 1000; // 20 minutes

export class TimeoutManager {
  /**
   * Start timeout tracking for a sent message
   * @param jid WhatsApp JID of the barber
   */
  static async startTimeout(jid: string): Promise<void> {
    // Clear any existing timeouts for this JID
    this.clearTimeout(jid);
    
    console.log(`⏰ Starting timeout tracking for ${jid}`);
    
    // Set reminder timeout (10 minutes)
    const reminderTimeout = setTimeout(async () => {
      await this.handleReminder(jid);
    }, REMINDER_DELAY);
    
    // Set escalation timeout (20 minutes)
    const escalationTimeout = setTimeout(async () => {
      await this.handleEscalation(jid);
    }, ESCALATION_DELAY);
    
    // Store timeouts
    activeTimeouts.set(jid, {
      reminderTimeout,
      escalationTimeout
    });
    
    // Update database to mark as awaiting reply
    await dbService.markAwaitingReply(jid);
  }
  
  /**
   * Clear timeout when barber replies
   * @param jid WhatsApp JID of the barber
   */
  static clearTimeout(jid: string): void {
    const timeouts = activeTimeouts.get(jid);
    if (timeouts) {
      if (timeouts.reminderTimeout) {
        clearTimeout(timeouts.reminderTimeout);
      }
      if (timeouts.escalationTimeout) {
        clearTimeout(timeouts.escalationTimeout);
      }
      activeTimeouts.delete(jid);
      console.log(`✅ Timeout cleared for ${jid}`);
    }
  }
  
  /**
   * Handle reminder after 10 minutes of no response
   * @param jid WhatsApp JID of the barber
   */
  private static async handleReminder(jid: string): Promise<void> {
    try {
      console.log(`⏰ Sending reminder to ${jid} after 10 minutes of no response`);
      
      // Check if still awaiting reply (conversation might have been completed)
      const context = await dbService.getConversationContext(jid);
      if (!context || context.isCompleted) {
        console.log(`ℹ️ Conversation with ${jid} already completed, skipping reminder`);
        this.clearTimeout(jid);
        return;
      }
      
      // Send reminder message
      const reminderMessage = "Merhaba tekrar! Hala müsaitlik durumunuzu merak ediyorum. Hangi saatler size uygun? 😊";
      await sendHumanLike(jid, reminderMessage);
      
      // Update database
      await dbService.markReminderSent(jid);
      
      console.log(`📤 Reminder sent to ${jid}`);
      
      // Notify via Telegram
      const barberName = context?.barberName || 'Барбер';
      const clientName = context?.clientName || 'клиент';
      await sendTelegramNotification(
        `⏰ Напоминание отправлено!\n\n👨‍💼 Барбер: ${barberName}\n👤 Клиент: ${clientName}\n\n⌛ Барбер не отвечает уже 10 минут. Отправлено напоминание.`
      );
      
    } catch (error) {
      console.error(`❌ Failed to send reminder to ${jid}:`, error);
    }
  }
  
  /**
   * Handle escalation after 20 minutes of no response
   * @param jid WhatsApp JID of the barber
   */
  private static async handleEscalation(jid: string): Promise<void> {
    try {
      console.log(`🚨 Escalating conversation with ${jid} after 20 minutes of no response`);
      
      // Check if still awaiting reply
      const context = await dbService.getConversationContext(jid);
      if (!context || context.isCompleted) {
        console.log(`ℹ️ Conversation with ${jid} already completed, skipping escalation`);
        this.clearTimeout(jid);
        return;
      }
      
      // Update database
      await dbService.markEscalated(jid);
      
      // Send escalation notification to Telegram
      const barberName = context?.barberName || 'Неизвестный барбер';
      const clientName = context?.clientName || 'клиент';
      const barberPhone = jid.replace('@s.whatsapp.net', '');
      
      const escalationMessage = `🚨 ЭСКАЛАЦИЯ: Барбер не отвечает!\n\n👨‍💼 Барбер: ${barberName}\n📱 Телефон: +${barberPhone}\n👤 Клиент: ${clientName}\n\n⌛ Прошло 20 минут без ответа. Возможно, нужно связаться с барбером другим способом или попробовать другого барбера.\n\n💡 Используйте /wa ${barberPhone} <сообщение> для прямой отправки сообщения.`;
      
      await sendTelegramNotification(escalationMessage);
      
      // Clear timeout as it's now escalated
      this.clearTimeout(jid);
      
      console.log(`🚨 Escalation completed for ${jid}`);
      
    } catch (error) {
      console.error(`❌ Failed to escalate conversation with ${jid}:`, error);
    }
  }
  
  /**
   * Get active timeout count (for monitoring)
   */
  static getActiveTimeoutCount(): number {
    return activeTimeouts.size;
  }
  
  /**
   * Clear all timeouts (for shutdown)
   */
  static clearAllTimeouts(): void {
    for (const [jid] of activeTimeouts) {
      this.clearTimeout(jid);
    }
    console.log(`🧹 All timeouts cleared`);
  }
} 