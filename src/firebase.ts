import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAn0CGO7tiC4eQCUQwtnmXby-n9v8UCjAk",
  authDomain: "net-worth-ab46e.firebaseapp.com",
  databaseURL: "https://net-worth-ab46e-default-rtdb.firebaseio.com",
  projectId: "net-worth-ab46e",
  storageBucket: "net-worth-ab46e.firebasestorage.app",
  messagingSenderId: "892172260057",
  appId: "1:892172260057:web:e456450b77f7d850a7a4c8",
  measurementId: "G-L1X3RKTC1H",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
