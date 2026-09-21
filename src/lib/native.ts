import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
import { PushNotifications, type PluginListenerHandle, type Token } from '@capacitor/push-notifications';
import { FilePicker } from '@capawesome/capacitor-file-picker';
import { BiometricAuth } from '@capawesome/capacitor-biometrics';

export const isNativeAndroid = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

export async function takeNativePhoto() {
  if (!isNativeAndroid()) return null;
  const permissions = await Camera.requestPermissions({ permissions: ['camera', 'photos'] });
  if (permissions.camera !== 'granted') return null;
  return Camera.getPhoto({
    source: CameraSource.Camera,
    resultType: CameraResultType.Uri,
    quality: 90,
  });
}

export async function pickNativeFiles() {
  if (!isNativeAndroid()) return null;
  return FilePicker.pickFiles({ limit: 10, readData: false });
}

export async function authenticateWithBiometrics(reason = 'تأكيد هويتك للوصول إلى التطبيق') {
  if (!isNativeAndroid()) return { success: false, unsupported: true };
  const result = await BiometricAuth.authenticate({ reason });
  return { success: result.verified, unsupported: false };
}

export const setNativePreference = (key: string, value: string) => Preferences.set({ key, value });
export const getNativePreference = async (key: string) => (await Preferences.get({ key })).value;

export function saveNativeTextFile(path: string, content: string) {
  return Filesystem.writeFile({
    path,
    data: content,
    directory: Directory.Documents,
    encoding: Encoding.UTF8,
    recursive: true,
  });
}

export async function registerNativePushNotifications(
  onToken: (token: Token) => void,
  onNotification?: (notification: unknown) => void,
): Promise<() => void> {
  if (!isNativeAndroid()) return () => undefined;

  let permission = await PushNotifications.checkPermissions();
  if (permission.receive !== 'granted') {
    permission = await PushNotifications.requestPermissions();
  }
  if (permission.receive !== 'granted') return () => undefined;

  const listeners: PluginListenerHandle[] = [];
  listeners.push(await PushNotifications.addListener('registration', onToken));
  if (onNotification) {
    listeners.push(await PushNotifications.addListener('pushNotificationReceived', onNotification));
  }
  await PushNotifications.register();
  return () => listeners.forEach((listener) => void listener.remove());
}
