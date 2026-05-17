import { db } from './firebase';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';

interface ReminderConfig {
  enabled: boolean;
  time: string; // HH:MM
  message: string;
  lastTriggeredDate: string | null;
}

type AlarmListener = (message: string) => void;

class ReminderService {
  private config: ReminderConfig = {
    enabled: false,
    time: '08:00',
    message: 'Time to record your daily cash flow entries!',
    lastTriggeredDate: null,
  };

  private audio: HTMLAudioElement | null = null;
  private interval: number | null = null;
  private unsubscribe: (() => void) | null = null;
  private listeners: AlarmListener[] = [];

  constructor() {
    // Use a louder, more persistent alarm sound
    this.audio = new Audio('https://assets.mixkit.co/active_storage/sfx/951/951-preview.mp3');
  }

  public onAlarm(listener: AlarmListener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  public init() {
    this.unsubscribe = onSnapshot(doc(db, 'settings', 'reminder'), (snapshot) => {
      if (snapshot.exists()) {
        this.config = { ...this.config, ...snapshot.data() };
      }
    });

    if (this.interval) window.clearInterval(this.interval);
    this.interval = window.setInterval(() => this.checkReminder(), 30000);
  }

  private checkReminder() {
    if (!this.config.enabled) return;

    const now = new Date();
    const currentHHMM = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const todayStr = now.toLocaleDateString();

    if (currentHHMM === this.config.time && this.config.lastTriggeredDate !== todayStr) {
      this.triggerAlarm(todayStr);
    }
  }

  private async triggerAlarm(dateStr: string) {
    this.config.lastTriggeredDate = dateStr;
    
    // Play sound 5 times
    for (let i = 0; i < 5; i++) {
        try {
          if (this.audio) {
            this.audio.currentTime = 0;
            await this.audio.play();
            // Wait for sound to finish before next play (preview is usually 1-3s)
            await new Promise(r => setTimeout(r, 2500)); 
          }
        } catch (e) {
          console.warn("Audio failed:", e);
          break; 
        }
    }

    // Notify listeners (UI)
    this.listeners.forEach(listen => listen(this.config.message));

    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('CashFlow Reminder', {
        body: this.config.message,
        icon: '/favicon.ico'
      });
    }
  }

  public async testSound() {
    try {
      if (this.audio) {
        this.audio.currentTime = 0;
        await this.audio.play();
      }
    } catch (e) {
      alert("Please click anywhere on the app first to enable sounds.");
    }
  }

  public stop() {
    if (this.interval) window.clearInterval(this.interval);
    if (this.unsubscribe) this.unsubscribe();
  }
}

export const reminderService = new ReminderService();
