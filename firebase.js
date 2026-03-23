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

// Load dogs from users/{uid}/dogs/ sub-collection
// AND expenses from users/{uid}/meta/expenses doc
window._fbLoad = async function(uid) {
  try {
    // ── Load dogs ──
    const snap = await getDocs(collection(db, 'users', uid, 'dogs'));
    if (snap.empty) return null;

    const dogs = snap.docs.map((d, i) => {
      const data = d.data();
      return {
        id: i,
        name: data.name || d.id,
        breed: data.breed || '',
        birthday: data.birthday || '',
        targetWeight: data.targetWeight ?? null,
        defaultLocation: data.defaultLocation || '',
        archived: data.archived || false,
        entries: data.entries || []
      };
    });

    // Sort alphabetically so order is consistent
    dogs.sort((a, b) => a.name.localeCompare(b.name));
    // Re-assign sequential ids after sort
    dogs.forEach((d, i) => { d.id = i; });

    // FIX: never default to an archived dog — pick first active dog,
    // only fall back to any dog if everything is archived
    const nonArchived = dogs.filter(d => !d.archived);
    const defaultDog = nonArchived.length ? nonArchived[0] : dogs[0];

    // ── Load expenses from users/{uid}/meta/expenses ──
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

// Save state — write each dog back to its own doc in the sub-collection,
// AND write all expenses to users/{uid}/meta/expenses
// Also deletes any Firestore docs that no longer exist in local state
window._fbSave = async function(state) {
  try {
    const uid = window._currentUser?.uid;
    if (!uid) return;

    // Get existing Firestore dog docs so we can delete removed ones
    const snap = await getDocs(collection(db, 'users', uid, 'dogs'));
    const existingNames = new Set(snap.docs.map(d => d.id));
    const currentNames = new Set(state.dogs.map(d => d.name));

    const batch = writeBatch(db);

    // Write current dogs
    for (const dog of state.dogs) {
      const ref = doc(db, 'users', uid, 'dogs', dog.name);
      batch.set(ref, {
        name: dog.name,
        breed: dog.breed || '',
        birthday: dog.birthday || '',
        targetWeight: dog.targetWeight ?? null,
        defaultLocation: dog.defaultLocation || '',
        archived: dog.archived || false,
        entries: dog.entries || []
      });
    }

    // Delete any Firestore dog docs no longer in state
    for (const name of existingNames) {
      if (!currentNames.has(name)) {
        batch.delete(doc(db, 'users', uid, 'dogs', name));
      }
    }

    // Write expenses into users/{uid}/meta/expenses as a single doc with an array.
    // Expenses are user-level (not per-dog) because they can be split across dogs.
    const expRef = doc(db, 'users', uid, 'meta', 'expenses');
    batch.set(expRef, { list: state.expenses || [] });

    await batch.commit();
  } catch(e) { console.warn('Firestore save failed:', e); }
};

// Immediately delete a single dog doc from Firestore by name
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
