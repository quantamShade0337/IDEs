// Real-time collaboration via Firebase Firestore
import {
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  serverTimestamp,
} from 'firebase/firestore';
import { getDb } from './firebase';

const COLORS = [
  '#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff',
  '#ff922b', '#cc5de8', '#20c997', '#f06595',
];

function getColor(uid) {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) hash = uid.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
}

// ── Presence ──────────────────────────────────────────────────────────────────

export function joinSession(projectId, user) {
  const db = getDb();
  if (!db || !projectId) return () => {};

  const presenceRef = doc(db, 'projects', projectId, 'presence', user.uid);
  const data = {
    uid: user.uid,
    displayName: user.displayName || 'Anonymous',
    color: getColor(user.uid),
    activeFileId: null,
    cursor: null,
    joinedAt: serverTimestamp(),
    lastSeen: serverTimestamp(),
  };

  setDoc(presenceRef, data).catch(() => {});

  // Heartbeat every 15s
  const heartbeat = setInterval(() => {
    updateDoc(presenceRef, { lastSeen: serverTimestamp() }).catch(() => {});
  }, 15000);

  return () => {
    clearInterval(heartbeat);
    deleteDoc(presenceRef).catch(() => {});
  };
}

export function subscribePresence(projectId, callback) {
  const db = getDb();
  if (!db || !projectId) return () => {};

  const presenceCol = collection(db, 'projects', projectId, 'presence');
  let lastSerialized = '';
  return onSnapshot(presenceCol, (snap) => {
    const now = Date.now();
    const users = snap.docs
      .map(d => d.data())
      .filter(u => {
        const last = u.lastSeen?.toMillis?.() || 0;
        return now - last < 30000; // only show active in last 30s
      })
      .sort((a, b) => a.uid.localeCompare(b.uid));

    const serialized = JSON.stringify(users.map((u) => ({
      uid: u.uid,
      activeFileId: u.activeFileId || null,
      cursorLine: u.cursor?.line || null,
      cursorColumn: u.cursor?.column || null,
      lastSeen: u.lastSeen?.toMillis?.() || 0,
    })));

    if (serialized === lastSerialized) return;
    lastSerialized = serialized;
    callback(users);
  }, () => {});
}

export function updateCursor(projectId, uid, fileId, cursor) {
  const db = getDb();
  if (!db || !projectId) return;
  const presenceRef = doc(db, 'projects', projectId, 'presence', uid);
  updateDoc(presenceRef, { activeFileId: fileId, cursor, lastSeen: serverTimestamp() }).catch(() => {});
}

// ── Live Document Sync ─────────────────────────────────────────────────────────

export function subscribeProject(projectId, callback) {
  const db = getDb();
  if (!db || !projectId) return () => {};

  const projectRef = doc(db, 'projects', projectId);
  return onSnapshot(projectRef, (snap) => {
    if (snap.exists()) callback({ id: snap.id, ...snap.data() });
  }, () => {});
}

export function subscribeFiles(projectId, callback) {
  const db = getDb();
  if (!db || !projectId) return () => {};

  const filesCol = collection(db, 'projects', projectId, 'files');
  return onSnapshot(filesCol, (snap) => {
    const changes = snap.docChanges().map((change) => ({
      type: change.type,
      file: { id: change.doc.id, ...change.doc.data() },
    }));
    callback(changes);
  }, () => {});
}

export async function syncFileContent(projectId, fileId, content, userId) {
  const db = getDb();
  if (!db || !projectId) return;
  const fileRef = doc(db, 'projects', projectId, 'files', fileId);
  await setDoc(fileRef, { content, updatedAt: serverTimestamp(), updatedBy: userId }, { merge: true });
}

// ── Collaboration Session ──────────────────────────────────────────────────────

export async function createCollabSession(projectId, ownerId) {
  const db = getDb();
  if (!db) return null;
  const sessionRef = doc(db, 'projects', projectId, 'collab', 'session');
  await setDoc(sessionRef, {
    ownerId,
    active: true,
    createdAt: serverTimestamp(),
    collaborators: [],
  });
  return projectId;
}

export async function endCollabSession(projectId) {
  const db = getDb();
  if (!db) return;
  const sessionRef = doc(db, 'projects', projectId, 'collab', 'session');
  await updateDoc(sessionRef, { active: false }).catch(() => {});
}

export function subscribeCollabSession(projectId, callback) {
  const db = getDb();
  if (!db || !projectId) return () => {};
  const sessionRef = doc(db, 'projects', projectId, 'collab', 'session');
  return onSnapshot(sessionRef, (snap) => {
    callback(snap.exists() ? snap.data() : null);
  }, () => {});
}

// ── Chat ───────────────────────────────────────────────────────────────────────

export async function sendChatMessage(projectId, user, text) {
  const db = getDb();
  if (!db || !projectId) return;
  const chatRef = collection(db, 'projects', projectId, 'chat');
  const msgRef = doc(chatRef);
  await setDoc(msgRef, {
    uid: user.uid,
    displayName: user.displayName || 'Anonymous',
    color: getColor(user.uid),
    text,
    createdAt: serverTimestamp(),
  });
}

export function subscribeChat(projectId, callback) {
  const db = getDb();
  if (!db || !projectId) return () => {};
  const chatRef = collection(db, 'projects', projectId, 'chat');
  return onSnapshot(chatRef, (snap) => {
    const msgs = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));
    callback(msgs);
  }, () => {});
}

export { getColor };
