import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { FirebaseAuthentication as FirebaseAuth } from '@capacitor-firebase/authentication';
import { Capacitor } from '@capacitor/core';
import { auth, db } from '../lib/firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firebase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAdmin: boolean; // Means "is authenticated to use admin/treasury app"
  userRole: string | null;
  memberData: any | null; // Added to store member info if logged in as simple member
  isNative: boolean;
  signIn: () => Promise<void>; // Google (nativo no Android, popup na web)
  signInWithEmail: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isAdmin: false,
  userRole: null,
  memberData: null,
  isNative: false,
  signIn: async () => {},
  signInWithEmail: async () => {},
  resetPassword: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [memberData, setMemberData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          let hasAdminAccess = false;
          let role = null;

          if (currentUser.email) {
            const docRef = doc(db, 'admins', currentUser.email.toLowerCase());
            const docSnap = await getDoc(docRef);
            hasAdminAccess = docSnap.exists();
            if (hasAdminAccess) {
              role = docSnap.data().role || 'admin';
            }
          }

          setIsAdmin(hasAdminAccess);
          setUserRole(role);

          // Check if user is a registered member
          if (currentUser.email) {
            const memQuery = query(collection(db, 'members'), where('email', '==', currentUser.email));
            const memSnap = await getDocs(memQuery);
            if (!memSnap.empty) {
              setMemberData({ id: memSnap.docs[0].id, ...memSnap.docs[0].data() });
            } else {
              setMemberData(null);
            }
          }
        } catch (error) {
          console.error('Failed to fetch admin status', error);
          setIsAdmin(false);
          setUserRole(null);
          setMemberData(null);
        }
      } else {
        setIsAdmin(false);
        setUserRole(null);
        setMemberData(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Google: no Android usa o fluxo nativo (sem popup — que a WebView bloqueia);
  // na web mantém o popup clássico.
  const signIn = async () => {
    if (isNative) {
      await FirebaseAuth.signInWithGoogle();
      return;
    }
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const signInWithEmail = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email.trim(), password);
  };

  const resetPassword = async (email: string) => {
    await sendPasswordResetEmail(auth, email.trim());
  };

  const signOut = async () => {
    if (isNative) {
      try {
        await FirebaseAuth.signOut();
        return;
      } catch {
        /* fallback abaixo */
      }
    }
    await firebaseSignOut(auth);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAdmin,
        userRole,
        memberData,
        isNative,
        signIn,
        signInWithEmail,
        resetPassword,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
