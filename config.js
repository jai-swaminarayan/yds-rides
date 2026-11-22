// ─────────────────────────────────────────────────────────────
//  YDS Rides settings: the only file you need to edit.
// ─────────────────────────────────────────────────────────────

// 1) Paste the firebaseConfig values from:
//    Firebase console → Project settings → Your apps → Web app → SDK setup and configuration → Config
//    While apiKey still says "PASTE_HERE", the app runs in DEMO MODE
//    (data stays in your own browser only, nothing goes online).
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDt_ehtdC77Y6RA5QxSGeWJ_w-mLqc_iV4",
  authDomain: "yds-ride-seva.firebaseapp.com",
  projectId: "yds-ride-seva",
  storageBucket: "yds-ride-seva.firebasestorage.app",
  messagingSenderId: "185145265821",
  appId: "1:185145265821:web:fb4553644ce58b3292ce74"
};

// 2) Organizers: Gmail addresses that can add and delete trips.
//    Put the SAME emails in firestore.rules (that file is what actually enforces it).
export const ADMIN_EMAILS = [
  "sampsurdbhavekta@gmail.com"
];

// 3) Name shown in the app header.
export const APP_NAME = "YDS Rides";
