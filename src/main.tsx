import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { onAuthStateChanged, type User } from 'firebase/auth';
import App from './App.tsx';
import './index.css';
import { AuthProvider } from './contexts/AuthContext.tsx';
import { auth } from './lib/firebase';
import { registerDeviceToken } from './lib/notifications';

onAuthStateChanged(auth, (user: User | null) => {
  if (!user) return;
  void registerDeviceToken(user.uid);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
