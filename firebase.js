import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, writeBatch, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB07OUcurYPUhX1pYUUyJE4B20kaoczkgY",
  authDomain: "k9kilo.firebaseapp.com",
  projectId: "k9kilo",
  storageBucket: "k9kilo.firebasestorage.app",
  messagingSenderId: "899649146069",
  appId: "1:899649146069:web:397bf49f1155873a49265c"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

window._fbAuth = auth;
window._fbFns = { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged };

window._fbLoad = async function(uid) {
  try {
    const snap = await getDocs(collection(db, 'users', uid, 'dogs'));
    if (snap.empty) return null;

    const dogs = snap.docs.map((d) => {
      const data = d.data();
      return {
        // CRITICAL: restore the original numeric id saved in Firestore.
        // Expenses reference dogs by this id (dogId / splitDogIds).
        // Never reassign sequential ids — that breaks expense associations.
        id: typeof data.id === 'number' ? data.id : null,
        name: data.name || d.id,
        breed: data.breed || '',
        birthday: data.birthday || '',
        targetWeight: data.targetWeight ?? null,
        defaultLocation: data.defaultLocation || '',
        archived: data.archived || false,
        entries: data.entries || []
      };
    });

    // Legacy fallback: if any dog is missing a saved id, assign based on
    // alphabetical sort so this session at least stays internally consistent.
    const missingIds = dogs.some(d => d.id === null);
    if (missingIds) {
      dogs.sort((a, b) => a.name.localeCompare(b.name));
      dogs.forEach((d, i) => { if (d.id === null) d.id = i; });
    }

    const nonArchived = dogs.filter(d => !d.archived);
    const defaultDog = nonArchived.length ? nonArchived[0] : dogs[0];

    // Load expenses
    let expenses = [];
    try {
      const expSnap = await getDoc(doc(db, 'users', uid, 'meta', 'expenses'));
      if (expSnap.exists()) {
        expenses = expSnap.data().list || [];
      }
    } catch(e) {
      console.warn('Firestore expenses load failed:', e);
    }

    return { activeDogId: defaultDog?.id ?? null, dogs, expenses };

  } catch(e) { console.warn('Firestore load failed:', e); return null; }
};

window._fbSave = async function(state) {
  try {
    const uid = window._currentUser?.uid;
    if (!uid) return;

    const snap = await getDocs(collection(db, 'users', uid, 'dogs'));
    const existingNames = new Set(snap.docs.map(d => d.id));
    const currentNames = new Set(state.dogs.map(d => d.name));

    const batch = writeBatch(db);

    for (const dog of state.dogs) {
      const ref = doc(db, 'users', uid, 'dogs', dog.name);
      batch.set(ref, {
        id: dog.id,                        // ← persist numeric id so expenses stay linked
        name: dog.name,
        breed: dog.breed || '',
        birthday: dog.birthday || '',
        targetWeight: dog.targetWeight ?? null,
        defaultLocation: dog.defaultLocation || '',
        archived: dog.archived || false,
        entries: dog.entries || []
      });
    }

    for (const name of existingNames) {
      if (!currentNames.has(name)) {
        batch.delete(doc(db, 'users', uid, 'dogs', name));
      }
    }

    // Expenses saved as a single doc array — user-level, not per-dog
    const expRef = doc(db, 'users', uid, 'meta', 'expenses');
    batch.set(expRef, { list: state.expenses || [] });

    await batch.commit();
  } catch(e) { console.warn('Firestore save failed:', e); }
};

window._fbDeleteDog = async function(dogName) {
  try {
    const uid = window._currentUser?.uid;
    if (!uid) return;
    await deleteDoc(doc(db, 'users', uid, 'dogs', dogName));
  } catch(e) { console.warn('Firestore delete failed:', e); }
};

onAuthStateChanged(auth, (user) => {
  window._currentUser = user || null;
  if (user) {
    document.getElementById('auth-overlay').style.display = 'none';
    document.getElementById('app-root').style.display = 'block';
    document.getElementById('auth-user-email').textContent = user.email;
    document.getElementById('auth-user-bar').style.display = 'flex';
    if (typeof window._onLogin === 'function') window._onLogin(user);
  } else {
    document.getElementById('auth-overlay').style.display = 'flex';
    document.getElementById('app-root').style.display = 'none';
    document.getElementById('auth-user-bar').style.display = 'none';
  }
});