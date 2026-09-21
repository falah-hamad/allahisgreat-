import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import App from './App.tsx';
import './index.css';
import { AuthProvider } from './contexts/AuthContext.tsx';
import { auth, db } from './lib/firebase';
import { registerNativePushNotifications } from './lib/native';

let nativePushCleanup: (() => void) | undefined;

onAuthStateChanged(auth, async (user: User | null) => {
  nativePushCleanup?.();
  nativePushCleanup = undefined;
  if (!user) return;

  nativePushCleanup = await registerNativePushNotifications(async ({ value }) => {
    const tokenId = btoa(value.slice(-36)).replace(/[/+=]/g, '_');
    await setDoc(doc(db, 'users', user.uid, 'tokens', tokenId), {
      id: tokenId,
      userId: user.uid,
      token: value,
      platform: 'android',
      updatedAt: serverTimestamp(),
    }, { merge: true });
  });
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
