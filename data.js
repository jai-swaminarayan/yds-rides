// Data layer: Firebase when config.js is filled in, otherwise a local demo store.
import { FIREBASE_CONFIG, ADMIN_EMAILS } from "./config.js";

const FB = "https://www.gstatic.com/firebasejs/10.12.2/";
const isConfigured = () => FIREBASE_CONFIG.apiKey && !FIREBASE_CONFIG.apiKey.startsWith("PASTE");
const adminCheck = email => !!email && ADMIN_EMAILS.map(e => e.toLowerCase().trim()).includes(email.toLowerCase());

export async function createBackend() {
  return isConfigured() ? firebaseBackend() : demoBackend();
}

async function firebaseBackend() {
  const { initializeApp } = await import(FB + "firebase-app.js");
  const A = await import(FB + "firebase-auth.js");
  const F = await import(FB + "firebase-firestore.js");
  const app = initializeApp(FIREBASE_CONFIG);
  const auth = A.getAuth(app);
  const db = F.getFirestore(app);
  const wrap = u => u && { uid: u.uid, name: u.displayName || "", email: (u.email || "").toLowerCase(), verified: !!u.emailVerified, admin: adminCheck(u.email) && !!u.emailVerified };
  return {
    mode: "firebase",
    onUser: cb => A.onAuthStateChanged(auth, u => cb(wrap(u))),
    async signIn() {
      const p = new A.GoogleAuthProvider();
      p.setCustomParameters({ prompt: "select_account" });
      try { await A.signInWithPopup(auth, p); }
      catch (e) { if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") throw e; }
    },
    async signUpEmail(email, pass, name) {
      const c = await A.createUserWithEmailAndPassword(auth, email, pass);
      if (name) await A.updateProfile(c.user, { displayName: name });
      try { await A.sendEmailVerification(c.user); } catch (e) {}
    },
    signInEmail: (email, pass) => A.signInWithEmailAndPassword(auth, email, pass),
    resetPassword: email => A.sendPasswordResetEmail(auth, email),
    resendVerification: () => A.sendEmailVerification(auth.currentUser),
    async refreshUser() { const u = auth.currentUser; if (!u) return null; await u.reload(); await u.getIdToken(true); return wrap(auth.currentUser); },
    signOut: () => A.signOut(auth),
    listen: (c, cb, err) => F.onSnapshot(F.collection(db, c), s => cb(s.docs.map(d => ({ ...d.data(), id: d.id }))), err),
    get: async (c, id) => { const s = await F.getDoc(F.doc(db, c, id)); return s.exists() ? { ...s.data(), id: s.id } : null; },
    set: (c, id, data) => F.setDoc(F.doc(db, c, id), data, { merge: true }),
    add: (c, data) => F.addDoc(F.collection(db, c), data),
    update: (c, id, data) => F.updateDoc(F.doc(db, c, id), data),
    remove: (c, id) => F.deleteDoc(F.doc(db, c, id))
  };
}

function demoBackend() {
  const KEY = "ydsr-demo-db2", UKEY = "ydsr-demo-user2";
  const PEOPLE = [
    { uid: "demo-admin", name: "Meshva (admin)", email: "admin@demo", admin: true, verified: true },
    { uid: "demo-leader", name: "Ride leader", email: "leader@demo", admin: false, verified: true },
    { uid: "demo-female", name: "Member (female)", email: "female@demo", admin: false, verified: true },
    { uid: "demo-male", name: "Member (male)", email: "male@demo", admin: false, verified: true }
  ];
  let store = null;
  try { store = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) {}
  if (!store) store = { roles: { "leader@demo": { role: "leader", name: "Ride leader", at: Date.now() } } };
  const subs = {}, userSubs = [];
  let who = -1;
  try { who = +(localStorage.getItem(UKEY) ?? -1); } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} };
  const emit = c => { const rows = Object.entries(store[c] || {}).map(([id, d]) => ({ ...d, id })); (subs[c] || []).forEach(f => f(rows)); };
  const setWho = w => { who = w; try { localStorage.setItem(UKEY, String(w)); } catch (e) {} userSubs.forEach(f => f(PEOPLE[who] || null)); };
  return {
    mode: "demo",
    onUser: cb => { userSubs.push(cb); setTimeout(() => cb(PEOPLE[who] || null), 0); },
    signIn: async () => setWho(0),
    signUpEmail: async () => setWho(0),
    signInEmail: async () => setWho(0),
    resetPassword: async () => {},
    resendVerification: async () => {},
    refreshUser: async () => PEOPLE[who] || null,
    signOut: async () => setWho(-1),
    switchDemoUser: () => setWho((who + 1) % PEOPLE.length),
    listen: (c, cb) => { (subs[c] = subs[c] || []).push(cb); setTimeout(() => emit(c), 0); return () => { subs[c] = (subs[c] || []).filter(f => f !== cb); }; },
    get: async (c, id) => (store[c] && store[c][id]) ? { ...store[c][id], id } : null,
    set: async (c, id, data) => { (store[c] = store[c] || {})[id] = { ...(store[c][id] || {}), ...data }; save(); emit(c); },
    add: async (c, data) => { const id = Math.random().toString(36).slice(2, 10); (store[c] = store[c] || {})[id] = data; save(); emit(c); return { id }; },
    update: async (c, id, data) => { Object.assign(store[c][id], data); save(); emit(c); },
    remove: async (c, id) => { if (store[c]) delete store[c][id]; save(); emit(c); }
  };
}
