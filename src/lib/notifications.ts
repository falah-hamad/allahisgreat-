import { getMessaging, getToken, onMessage, isSupported, Messaging } from "firebase/messaging";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { app, db, auth } from "./firebase";

let messagingInstance: Messaging | null = null;
let messagingSupported: boolean | null = null;

/**
 * Check if the current browser and context support Firebase Cloud Messaging (FCM)
 */
export async function isFCMSupported(): Promise<boolean> {
  if (messagingSupported !== null) return messagingSupported;
  try {
    messagingSupported = typeof window !== "undefined" && "Notification" in window && (await isSupported());
    return messagingSupported;
  } catch {
    messagingSupported = false;
    return false;
  }
}

/**
 * Get or initialize the Firebase Messaging instance safely
 */
export async function getFCMInstance(): Promise<Messaging | null> {
  if (messagingInstance) return messagingInstance;
  const supported = await isFCMSupported();
  if (supported) {
    try {
      messagingInstance = getMessaging(app);
      return messagingInstance;
    } catch (e) {
      console.warn("Notice: Could not initialize Firebase Messaging in this context:", e);
      return null;
    }
  }
  return null;
}

/**
 * Register the dedicated Firebase Messaging Service Worker
 */
export async function registerMessagingServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  try {
    // Check if sw is already registered
    const existing = await navigator.serviceWorker.getRegistration("/firebase-messaging-sw.js");
    if (existing) {
      return existing;
    }
    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js", {
      scope: "/",
    });
    return registration;
  } catch (err) {
    console.warn("FCM Service Worker registration notice:", err);
    return null;
  }
}

/**
 * Request notification permissions and register device FCM token in Firestore.
 * Supports multiple devices per user without replacing other devices.
 */
export async function requestNotificationPermission(userId?: string): Promise<string | null> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return null;
  }

  try {
    // 1. Request permission if not already granted or denied
    let currentPermission = Notification.permission;
    if (currentPermission === "default") {
      currentPermission = await Notification.requestPermission();
    }
    if (currentPermission !== "granted") {
      // User dismissed or denied permission; return null gracefully without crashing
      return null;
    }

    // 2. Obtain messaging instance
    const messaging = await getFCMInstance();
    if (!messaging) return null;

    // 3. Ensure service worker is registered
    const swRegistration = await registerMessagingServiceWorker();

    // 4. Retrieve VAPID Key from environment variables (if provided by developer in Firebase Console)
    const vapidKey = (import.meta as any).env?.VITE_FIREBASE_VAPID_KEY || undefined;

    // 5. Get device registration token from FCM
    const tokenOptions: { serviceWorkerRegistration?: ServiceWorkerRegistration; vapidKey?: string } = {};
    if (swRegistration) {
      tokenOptions.serviceWorkerRegistration = swRegistration;
    }
    if (vapidKey && typeof vapidKey === "string" && vapidKey.trim().length > 0) {
      tokenOptions.vapidKey = vapidKey.trim();
    }

    const currentToken = await getToken(messaging, tokenOptions).catch((err) => {
      console.info("FCM getToken notice (requires VAPID key or top-level origin access):", err);
      return null;
    });

    const targetUid = userId || auth.currentUser?.uid;
    if (currentToken && targetUid) {
      // Create a deterministic yet safe ID from the token so multiple devices each have their own document
      const tokenId = btoa(currentToken.slice(-36)).replace(/[/+=]/g, "_");
      const tokenRef = doc(db, "users", targetUid, "tokens", tokenId);

      const isAndroid = /android/i.test(navigator.userAgent);
      const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const platformName = isAndroid ? "android" : isIOS ? "ios" : "web";

      await setDoc(tokenRef, {
        id: tokenId,
        userId: targetUid,
        token: currentToken,
        platform: platformName,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "web-browser",
        lastActiveAt: new Date().toISOString(),
        updatedAt: serverTimestamp(),
      }, { merge: true });
    }

    return currentToken;
  } catch (err) {
    console.warn("Notice: Notification permission / token process:", err);
    return null;
  }
}

export const registerDeviceToken = requestNotificationPermission;

/**
 * Display a local notification if granted
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
      console.warn("Notice: Local notification display:", e);
    }
  }
}

/**
 * Listen for foreground push notifications when the web app is open and active
 */
export async function setupForegroundNotificationListener(
  onNotificationReceived: (payload: any) => void
): Promise<(() => void) | null> {
  const messaging = await getFCMInstance();
  if (!messaging) return null;

  try {
    const unsubscribe = onMessage(messaging, (payload) => {
      onNotificationReceived(payload);
      const title = payload.notification?.title || "دفتر الديون المحاسبي";
      const body = payload.notification?.body || "إشعار جديد";
      showLocalNotification(title, {
        body,
        data: payload.data,
      });
    });
    return unsubscribe;
  } catch (e) {
    console.warn("Notice: Foreground notification listener:", e);
    return null;
  }
}

