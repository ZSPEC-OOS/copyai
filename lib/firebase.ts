import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyALNxKQjAlTTpzcmBusII-zmiNjgXjnDhU",
  authDomain: "copyai-c2e3b.firebaseapp.com",
  projectId: "copyai-c2e3b",
  storageBucket: "copyai-c2e3b.firebasestorage.app",
  messagingSenderId: "697207621340",
  appId: "1:697207621340:web:9505e51dfc97ed499d9619",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const db = getFirestore(app);
