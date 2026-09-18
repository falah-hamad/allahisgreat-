import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  FacebookAuthProvider, 
  OAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  updateProfile,
  onAuthStateChanged,
  User
} from 'firebase/auth';
import { 
  getFirestore, 
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc, 
  getDocFromServer,
  collection,
  onSnapshot,
  setDoc,
  deleteDoc,
  getDocs
} from 'firebase/firestore';
import { 
  getStorage, 
  ref as storageRef, 
  uploadBytes, 
  getDownloadURL, 
  deleteObject 
} from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App
export const app = initializeApp(firebaseConfig);

// Initialize Firestore with multi-tab offline persistence & specific database ID
let firestoreInstance;
try {
  firestoreInstance = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    }),
    experimentalForceLongPolling: true,
  }, firebaseConfig.firestoreDatabaseId);
} catch (e) {
  // Fallback if initializeFirestore was already called or in restricted environment
  try {
    firestoreInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
  } catch {
    firestoreInstance = getFirestore(app);
  }
}
export const db = firestoreInstance;

// Initialize Authentication
export const auth = getAuth(app);

// Initialize Firebase Storage
export const storage = getStorage(app);

// Firebase Storage helpers for documents/images
export async function uploadUserFile(userId: string, folder: string, fileName: string, file: Blob | File): Promise<string> {
  const fileRef = storageRef(storage, `users/${userId}/${folder}/${Date.now()}_${fileName}`);
  const snapshot = await uploadBytes(fileRef, file);
  return await getDownloadURL(snapshot.ref);
}

export async function deleteUserFileByUrl(fileUrl: string): Promise<void> {
  try {
    const fileRef = storageRef(storage, fileUrl);
    await deleteObject(fileRef);
  } catch (e) {
    console.warn("Could not delete storage file:", e);
  }
}

// Authentication Providers
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});
export const facebookProvider = new FacebookAuthProvider();
export const microsoftProvider = new OAuthProvider('microsoft.com');

// Error handling types for Firestore ABAC & Debugging
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      providerInfo: auth.currentUser?.providerData?.map((provider) => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Test initial connection as required by skill guidelines
export async function testFirestoreConnection() {
  if (typeof window === 'undefined') return;
  // Delay slightly to give the browser network stack and Firestore channel time to establish
  setTimeout(async () => {
    try {
      if (navigator.onLine) {
        await getDocFromServer(doc(db, 'test', 'connection'));
      }
    } catch (error: any) {
      const msg = error?.message || String(error);
      const code = error?.code || '';
      if (
        code === 'unavailable' ||
        msg.includes('offline') ||
        msg.includes('Could not reach Cloud Firestore') ||
        msg.includes('10 seconds') ||
        msg.includes('Backend didn\'t respond')
      ) {
        console.info('Firestore is operating in offline mode / local cache until connection stabilizes.');
      } else {
        console.warn('Firebase initial connection check notice:', error);
      }
    }
  }, 2000);
}
testFirestoreConnection();
