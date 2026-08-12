import { LocalNotifications } from '@capacitor/local-notifications';
import { Order } from '../types';

/**
 * Checks the current permission status for notifications (both Capacitor and Web)
 */
export async function checkNotificationPermission(): Promise<'granted' | 'denied' | 'prompt' | 'unsupported'> {
  // 1. Check Capacitor native notifications
  try {
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display === 'granted') {
      return 'granted';
    }
    if (perm.display === 'denied') {
      return 'denied';
    }
  } catch (e) {
    // If Capacitor is not available/supported in this environment, proceed to Web API
  }

  // 2. Check Browser/Web Notifications
  if (typeof window !== 'undefined' && 'Notification' in window) {
    const webPerm = Notification.permission;
    if (webPerm === 'granted') return 'granted';
    if (webPerm === 'denied') return 'denied';
    return 'prompt';
  }

  return 'unsupported';
}

/**
 * Requests permission for notifications from both Capacitor and Web
 */
export async function requestNotificationPermission(): Promise<boolean> {
  // 1. Try Capacitor native notifications
  try {
    const res = await LocalNotifications.requestPermissions();
    if (res.display === 'granted') {
      return true;
    }
  } catch (e) {
    // Graceful fallback to web
  }

  // 2. Try Browser/Web Notifications
  if (typeof window !== 'undefined' && 'Notification' in window) {
    try {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    } catch (e) {
      console.error('Failed to request web notification permission:', e);
    }
  }

  return false;
}

/**
 * Sends a notification for a new order
 */
export async function sendOrderNotification(order: Order, currencySymbol: string = 'د.ج') {
  const title = 'طلب جديد! 🛍️';
  const body = `قيمة الطلب: ${order.total} ${currencySymbol} | العميل: ${order.customerName}`;

  // 1. Try Capacitor local notifications
  try {
    const isGrantedRes = await LocalNotifications.checkPermissions();
    if (isGrantedRes.display === 'granted') {
      await LocalNotifications.schedule({
        notifications: [
          {
            title,
            body,
            id: Math.floor(Math.random() * 100000),
            sound: 'beep.wav',
            actionTypeId: 'OPEN_ORDER',
            extra: {
              orderId: order.id,
            },
          },
        ],
      });
      return;
    }
  } catch (e) {
    // Graceful fallback to web
  }

  // 2. Try Web Notifications
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body,
        icon: '/app_icon.jpg',
        badge: '/app_icon.jpg',
        tag: order.id,
      });
    } catch (e) {
      console.error('Failed to send web notification:', e);
    }
  }
}

/**
 * Sends a test notification to verify settings
 */
export async function sendTestNotification() {
  const title = 'إشعار تجريبي ناجح! 🧪';
  const body = 'تهانينا! هاتفك مستعد الآن لاستقبال الإشعارات الفورية عند وجود طلبات جديدة.';

  try {
    const isGrantedRes = await LocalNotifications.checkPermissions();
    if (isGrantedRes.display === 'granted') {
      await LocalNotifications.schedule({
        notifications: [
          {
            title,
            body,
            id: 99999,
          },
        ],
      });
      return;
    }
  } catch (e) {
    // Fallback to web
  }

  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body,
        icon: '/app_icon.jpg',
      });
    } catch (e) {
      console.error('Failed to send web test notification:', e);
    }
  }
}
