import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
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
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';

const getFirebaseConfig = () => {
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
  const payload = {
    ...data,
    updatedAt: serverTimestamp(),
    // Store trimmed versions for thumbnail
    html: (data.html || '').slice(0, 8000),
    css: (data.css || '').slice(0, 8000),
    js: (data.js || '').slice(0, 8000),
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
  const q = query(
    collection(db, 'projects'),
    where('userId', '==', userId),
    orderBy('updatedAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
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
  await deleteDoc(doc(db, 'projects', id));
};

export const isFirebaseReady = () => !!app && !!auth && !!db;
