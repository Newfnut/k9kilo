// ─────────────────────────────────────────────
//  K9 Kilo v2 — firebase.js
//  Firebase init, Auth, Firestore.
//  Exports functions directly — no window.* globals.
// ─────────────────────────────────────────────

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  writeBatch,
  deleteDoc,
  onSnapshot,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey:            'AIzaSyB07OUcurYPUhX1pYUUyJE4B20kaoczkgY',
  authDomain:        'k9kilo.firebaseapp.com',
  projectId:         'k9kilo',
  storageBucket:     'k9kilo.firebasestorage.app',
  messagingSenderId: '899649146069',
  appId:             '1:899649146069:web:397bf49f1155873a49265c',
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ── Auth wrappers ────────────────────────────
export function fbSignIn(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export function fbSignUp(email, password) {
  return createUserWithEmailAndPassword(auth, email, password);
}

export function fbSignOut() {
  return signOut(auth);
}

export function fbOnAuthStateChanged(callback) {
  return onAuthStateChanged(auth, callback);
}

export function fbCurrentUser() {
  return auth.currentUser;
}

// ── Firestore: Load ──────────────────────────
export async function fbLoad(uid) {
  try {
    const snap = await getDocs(collection(db, 'users', uid, 'dogs'));
    if (snap.empty) return null;

    const dogs = snap.docs.map(d => {
      const data = d.data();
      return {
        id:              typeof data.id === 'number' ? data.id : null,
        name:            data.name || d.id,
        breed:           data.breed || '',
        birthday:        data.birthday || '',
        targetWeight:    data.targetWeight ?? null,
        defaultLocation: data.defaultLocation || '',
        chartStartDate:  data.chartStartDate || '',
        archived:        data.archived || false,
        archivedDate:    data.archivedDate || '',
        entries:         data.entries || [],
      };
    });

    // Assign missing IDs
    const missingIds = dogs.some(d => d.id === null);
    if (missingIds) {
      dogs.sort((a, b) => a.name.localeCompare(b.name));
      dogs.forEach((d, i) => { if (d.id === null) d.id = i; });
    }

    const nonArchived  = dogs.filter(d => !d.archived);
    const defaultDog   = nonArchived.length ? nonArchived[0] : dogs[0];
    const activeDogId  = defaultDog?.id ?? null;

    // Load expenses — null means doc doesn't exist yet
    let expenses = null;
    try {
      const expSnap = await getDoc(doc(db, 'users', uid, 'meta', 'expenses'));
      if (expSnap.exists()) {
        const data = expSnap.data();
        expenses = Array.isArray(data.list) ? data.list : [];
      }
    } catch (e) {
      console.warn('Firestore expenses load failed:', e);
    }

    return { activeDogId, dogs, expenses };
  } catch (e) {
    console.warn('Firestore load failed:', e);
    return null;
  }
}

// ── Firestore: Save ──────────────────────────
export async function fbSave(state) {
  try {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const snap = await getDocs(collection(db, 'users', uid, 'dogs'));
    const existingNames = new Set(snap.docs.map(d => d.id));
    const currentNames  = new Set(state.dogs.map(d => d.name));

    const batch = writeBatch(db);

    for (const dog of state.dogs) {
      const ref = doc(db, 'users', uid, 'dogs', dog.name);
      batch.set(ref, {
        id:              dog.id,
        name:            dog.name,
        breed:           dog.breed || '',
        birthday:        dog.birthday || '',
        targetWeight:    dog.targetWeight ?? null,
        defaultLocation: dog.defaultLocation || '',
        chartStartDate:  dog.chartStartDate || '',
        archived:        dog.archived || false,
        archivedDate:    dog.archivedDate || '',
        entries:         dog.entries || [],
      });
    }

    // Delete orphaned dog docs (renames / deletes)
    for (const name of existingNames) {
      if (!currentNames.has(name)) {
        batch.delete(doc(db, 'users', uid, 'dogs', name));
      }
    }

    // Always write expenses so other devices get the snapshot
    const expRef = doc(db, 'users', uid, 'meta', 'expenses');
    batch.set(expRef, { list: state.expenses || [], updatedAt: Date.now() });

    await batch.commit();
  } catch (e) {
    console.warn('Firestore save failed:', e);
  }
}

// ── Firestore: Delete single dog doc ────────
export async function fbDeleteDog(dogName) {
  try {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    await deleteDoc(doc(db, 'users', uid, 'dogs', dogName));
  } catch (e) {
    console.warn('Firestore delete dog failed:', e);
  }
}

// ── Firestore: Live listener ─────────────────
let _unsubscribe = null;

export function fbListen(uid, onUpdate) {
  // Tear down any existing listener
  if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }

  const expRef = doc(db, 'users', uid, 'meta', 'expenses');
  _unsubscribe = onSnapshot(expRef, snap => {
    if (!snap.exists()) return;
    const data = snap.data();
    if (!Array.isArray(data.list)) return;
    onUpdate(data.list);
  }, err => {
    console.warn('Firestore snapshot error:', err);
  });
}

export function fbStopListen() {
  if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }
}
