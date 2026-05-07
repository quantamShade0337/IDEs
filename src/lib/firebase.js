import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  updateEmail,
  updatePassword,
  sendEmailVerification,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  EmailAuthProvider,
  linkWithPopup,
  deleteUser,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  getDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';

const envFirebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const hasEnvFirebaseConfig = Object.values(envFirebaseConfig).every(Boolean);

const getFirebaseConfig = () => {
  if (hasEnvFirebaseConfig) {
    return envFirebaseConfig;
  }
  const stored = localStorage.getItem('firebase_config');
  if (stored) {
    try { return JSON.parse(stored); } catch { /* */ }
  }
  return null;
};

let app, auth, db;

export const initFirebase = (config) => {
  try {
    app = initializeApp(config, 'webide');
    auth = getAuth(app);
    db = getFirestore(app);
    localStorage.setItem('firebase_config', JSON.stringify(config));
    return true;
  } catch (e) {
    console.error('Firebase init error:', e);
    return false;
  }
};

const savedConfig = getFirebaseConfig();
if (savedConfig) {
  try { initFirebase(savedConfig); } catch { /* */ }
}

export const getAuth_ = () => auth;
export const getDb = () => db;

export const signInWithGoogle = async () => {
  if (!auth) throw new Error('Firebase not initialized');
  const provider = new GoogleAuthProvider();
  return signInWithPopup(auth, provider);
};

export const signInWithEmail = async (email, password) => {
  if (!auth) throw new Error('Firebase not initialized');
  return signInWithEmailAndPassword(auth, email, password);
};

export const signUpWithEmail = async (email, password, displayName) => {
  if (!auth) throw new Error('Firebase not initialized');
  const result = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(result.user, { displayName });
  return result;
};

export const signOutUser = async () => {
  if (!auth) return;
  return signOut(auth);
};

export const saveProject = async (project) => {
  if (!db) throw new Error('Firebase not initialized');
  const { id, files, ...data } = project;
  const THUMBNAIL_LIMIT = 8000;
  const payload = {
    ...data,
    updatedAt: serverTimestamp(),
    // Top-level fields are thumbnail-only; full content is in files sub-collection
    html: (data.html || '').slice(0, THUMBNAIL_LIMIT),
    css: (data.css || '').slice(0, THUMBNAIL_LIMIT),
    js: (data.js || '').slice(0, THUMBNAIL_LIMIT),
    // Flag so callers know whether any file was truncated for the thumbnail
    thumbnailTruncated: [data.html, data.css, data.js].some(
      s => (s || '').length > THUMBNAIL_LIMIT
    ),
  };

  let projectId = id;
  if (id) {
    await updateDoc(doc(db, 'projects', id), payload);
  } else {
    const ref = await addDoc(collection(db, 'projects'), {
      ...payload,
      createdAt: serverTimestamp(),
    });
    projectId = ref.id;
  }

  // Save files sub-collection if provided
  if (files && files.length > 0 && projectId) {
    for (const file of files) {
      const fileRef = doc(db, 'projects', projectId, 'files', file.id);
      await setDoc(fileRef, {
        name: file.name,
        language: file.language,
        content: file.content,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    }
  }

  return projectId;
};

export const loadProjects = async (userId) => {
  if (!db) return [];
  // Only filter by userId — no orderBy to avoid needing a composite index.
  // Sort client-side by updatedAt descending.
  const q = query(
    collection(db, 'projects'),
    where('userId', '==', userId)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => {
      const ta = a.updatedAt?.toMillis?.() ?? a.updatedAt ?? 0;
      const tb = b.updatedAt?.toMillis?.() ?? b.updatedAt ?? 0;
      return tb - ta;
    });
};

// Real-time listener — calls callback immediately and on every change
export const subscribeProjects = (userId, callback) => {
  if (!db) { callback([]); return () => {}; }
  const q = query(collection(db, 'projects'), where('userId', '==', userId));
  return onSnapshot(q, (snap) => {
    const projects = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const ta = a.updatedAt?.toMillis?.() ?? 0;
        const tb = b.updatedAt?.toMillis?.() ?? 0;
        return tb - ta;
      });
    callback(projects);
  }, () => callback([]));
};

export const loadProject = async (id) => {
  if (!db) return null;
  const snap = await getDoc(doc(db, 'projects', id));
  if (!snap.exists()) return null;
  const project = { id: snap.id, ...snap.data() };

  // Load files sub-collection
  try {
    const filesSnap = await getDocs(collection(db, 'projects', id, 'files'));
    if (!filesSnap.empty) {
      project.files = filesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
  } catch { /* files collection may not exist */ }

  return project;
};

export const deleteProject = async (id) => {
  if (!db) return;
  await deleteProjectTree(id);
};

export const isFirebaseReady = () => !!app && !!auth && !!db;

async function deleteCollectionDocs(dbInstance, collectionRef) {
  const snapshot = await getDocs(collectionRef);
  await Promise.all(snapshot.docs.map((entry) => deleteDoc(entry.ref)));
}

async function deleteProjectTree(projectId) {
  if (!db || !projectId) return;

  const projectRef = doc(db, 'projects', projectId);
  const filesRef = collection(db, 'projects', projectId, 'files');
  const presenceRef = collection(db, 'projects', projectId, 'presence');
  const chatRef = collection(db, 'projects', projectId, 'chat');
  const collabSessionRef = doc(db, 'projects', projectId, 'collab', 'session');

  await Promise.all([
    deleteCollectionDocs(db, filesRef),
    deleteCollectionDocs(db, presenceRef),
    deleteCollectionDocs(db, chatRef),
    deleteDoc(collabSessionRef).catch(() => {}),
  ]);

  await deleteDoc(projectRef);
}

// ── Account management ────────────────────────────────────────────────────────

export const updateDisplayName = async (displayName) => {
  if (!auth?.currentUser) throw new Error('Not signed in');
  await updateProfile(auth.currentUser, { displayName });
};

export const sendVerificationEmail = async () => {
  if (!auth?.currentUser) throw new Error('Not signed in');
  await sendEmailVerification(auth.currentUser);
};

export const reauthWithPassword = async (password) => {
  const user = auth?.currentUser;
  if (!user) throw new Error('Not signed in');
  const credential = EmailAuthProvider.credential(user.email, password);
  await reauthenticateWithCredential(user, credential);
};

export const reauthWithGoogle = async () => {
  if (!auth?.currentUser) throw new Error('Not signed in');
  const provider = new GoogleAuthProvider();
  await reauthenticateWithPopup(auth.currentUser, provider);
};

export const changePassword = async (currentPassword, newPassword) => {
  await reauthWithPassword(currentPassword);
  await updatePassword(auth.currentUser, newPassword);
};

export const linkGoogleAccount = async () => {
  if (!auth?.currentUser) throw new Error('Not signed in');
  const provider = new GoogleAuthProvider();
  return linkWithPopup(auth.currentUser, provider);
};

export const isGoogleLinked = () => {
  const user = auth?.currentUser;
  if (!user) return false;
  return user.providerData.some(p => p.providerId === 'google.com');
};

export const isEmailProvider = () => {
  const user = auth?.currentUser;
  if (!user) return false;
  return user.providerData.some(p => p.providerId === 'password');
};

// Passkey (WebAuthn) — registration
export const registerPasskey = async () => {
  if (!window.PublicKeyCredential) throw new Error('Passkeys not supported in this browser');
  const user = auth?.currentUser;
  if (!user) throw new Error('Not signed in');

  // Generate a challenge — in production this should come from your server.
  // For a fully client-side app without a backend, we generate one locally and
  // store the credential ID in localStorage (best-effort, no server verification).
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = new TextEncoder().encode(user.uid);

  const credential = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: 'WebIDE', id: window.location.hostname },
      user: {
        id: userId,
        name: user.email || user.uid,
        displayName: user.displayName || user.email || 'User',
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },   // ES256
        { type: 'public-key', alg: -257 },  // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'required',
      },
      timeout: 60000,
    },
  });

  // Persist credential ID so we can list it later
  const stored = JSON.parse(localStorage.getItem('passkey_ids') || '[]');
  const credId = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
  const entry = {
    id: credId,
    name: `Passkey — ${new Date().toLocaleDateString()}`,
    createdAt: Date.now(),
  };
  stored.push(entry);
  localStorage.setItem('passkey_ids', JSON.stringify(stored));
  return entry;
};

export const getPasskeys = () => {
  try {
    return JSON.parse(localStorage.getItem('passkey_ids') || '[]');
  } catch {
    return [];
  }
};

export const removePasskey = (credId) => {
  const stored = getPasskeys().filter(p => p.id !== credId);
  localStorage.setItem('passkey_ids', JSON.stringify(stored));
};

export const deleteAccount = async (password) => {
  const user = auth?.currentUser;
  if (!user) throw new Error('Not signed in');
  // Re-authenticate first
  if (isEmailProvider() && password) {
    await reauthWithPassword(password);
  } else {
    await reauthWithGoogle();
  }
  // Delete Firestore projects
  if (db) {
    try {
      const snap = await getDocs(collection(db, 'projects'));
      const mine = snap.docs.filter(d => d.data().userId === user.uid);
      await Promise.all(mine.map(d => deleteProjectTree(d.id)));
    } catch { /* best-effort */ }
  }
  await deleteUser(user);
  localStorage.removeItem('passkey_ids');
};
