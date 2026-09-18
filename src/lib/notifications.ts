import { getMessaging, getToken, onMessage, isSupported, Messaging } from "firebase/messaging";
import { doc, setDoc } from "firebase/firestore";
import { app, db, auth } from "./firebase";

let messagingInstance: Messaging | null = null;
let messagingSupported: boolean | null = null;

export async function isFCMSupported(): Promise<boolean> {
  if (messagingSupported !== null) return messagingSupported;
  try {
    messagingSupported = typeof window !== "undefined" && (await isSupported());
    return messagingSupported;
  } catch {
    messagingSupported = false;
    return false;
  }
}

export async function getFCMInstance(): Promise<Messaging | null> {
  if (messagingInstance) return messagingInstance;
  const supported = await isFCMSupported();
  if (supported) {
    try {
      messagingInstance = getMessaging(app);
      return messagingInstance;
    } catch (e) {
      console.warn("Could not initialize Firebase Messaging:", e);
      return null;
    }
  }
  return null;
}

/**
 * Request notification permissions and register device token in Firestore
 */
export async function requestNotificationPermission(userId?: string): Promise<string | null> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return null;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return null;
    }

    const messaging = await getFCMInstance();
    if (!messaging) return null;

    // Register service worker if available
    let swRegistration: ServiceWorkerRegistration | undefined = undefined;
    if ("serviceWorker" in navigator) {
      try {
        swRegistration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
      } catch (e) {
        console.warn("Service worker registration skipped:", e);
      }
    }

    const currentToken = await getToken(messaging, {
      serviceWorkerRegistration: swRegistration,
    }).catch((err) => {
      console.warn("FCM getToken failed (expected in sandboxed environments):", err);
      return null;
    });

    const targetUid = userId || auth.currentUser?.uid;
    if (currentToken && targetUid) {
      // Save token to user's tokens collection in Firestore
      const tokenId = btoa(currentToken.slice(-32)).replace(/[/+=]/g, "_");
      const tokenRef = doc(db, "users", targetUid, "tokens", tokenId);
      await setDoc(tokenRef, {
        id: tokenId,
        userId: targetUid,
        token: currentToken,
        platform: /android/i.test(navigator.userAgent) ? "android" : "web",
        userAgent: navigator.userAgent,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    }

    return currentToken;
  } catch (err) {
    console.warn("Notification permission / token error:", err);
    return null;
  }
}

export const registerDeviceToken = requestNotificationPermission;

/**
 * Show a local debt or payment notification
 */
export function showLocalNotification(title: string, options?: NotificationOptions) {
  if (typeof window === "undefined" || !("Notification" in window)) return;

  if (Notification.permission === "granted") {
    try {
      new Notification(title, {
        icon: "/favicon.ico",
        badge: "/favicon.ico",
        dir: "rtl",
        lang: "ar",
        ...options,
      });
    } catch (e) {
      console.warn("Local notification display failed:", e);
    }
  }
}

/**
 * Listen for foreground push notifications
 */
export async function setupForegroundNotificationListener(
  onNotificationReceived: (payload: any) => void
): Promise<(() => void) | null> {
  const messaging = await getFCMInstance();
  if (!messaging) return null;

  try {
    const unsubscribe = onMessage(messaging, (payload) => {
      onNotificationReceived(payload);
      if (payload.notification?.title) {
        showLocalNotification(payload.notification.title, {
          body: payload.notification.body,
        });
      }
    });
    return unsubscribe;
  } catch (e) {
    console.warn("Foreground notification listener error:", e);
    return null;
  }
}
