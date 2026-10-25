import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { resolveRole, firstMemberOrNone } from '../lib/access';
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
import { doc, getDoc, collection, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firebase';
import { toast } from 'sonner';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAdmin: boolean; // Means "is authenticated to use admin/treasury app"
  userRole: string | null;
  memberData: any | null; // Added to store member info if logged in as simple member
  /** v1.14: estado do auto-cadastro quando (ainda) não é membro activo. */
  signupMeta: { statusSignup: 'pendente' | 'rejeitado' | 'aprovado'; reason?: string | null } | null;
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
  signupMeta: null,
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
  const [signupMeta, setSignupMeta] = useState<{ statusSignup: 'pendente' | 'rejeitado' | 'aprovado'; reason?: string | null } | null>(null);
  const [adminMeta, setAdminMeta] = useState<{ isSuper: boolean; disabled: boolean; mustChangePassword: boolean; tempPasswordIssuedAt: number | null } | null>(null);
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
            // lógica pura, testada em src/lib/__tests__/access.test.ts
            role = resolveRole(docSnap.exists(), docSnap.data()?.role);
            hasAdminAccess = role !== null;
            if (docSnap.exists()) {
              const ad = docSnap.data() as any;
              setAdminMeta({
                isSuper: ad.isSuper === true || currentUser.email?.toLowerCase() === 'cadupaulino99@gmail.com',
                disabled: ad.disabled === true,
                mustChangePassword: ad.mustChangePassword === true,
                tempPasswordIssuedAt: Number(ad.tempPasswordIssuedAt || 0) || null,
              });
              // conta desativada: não entra (o Worker também bloqueia).
              // v1.14.1: com MENSAGEM — antes o utilizador era atirado para o
              // login em silêncio e achava que «não conseguia aceder».
              if (ad.disabled === true) {
                toast.error('A sua conta foi desativada. Contacte o super administrador.');
                await firebaseSignOut(auth);
                setUser(null);
                return;
              }
              // último acesso (regras permitem ao próprio só estes campos)
              updateDoc(docRef, { lastLoginAt: Date.now() }).catch(() => {});
            } else {
              setAdminMeta(null);
            }
          }

          setIsAdmin(hasAdminAccess);
          setUserRole(role);

          // Check if user is a registered member
          if (currentUser.email) {
            const memQuery = query(collection(db, 'members'), where('email', '==', currentUser.email));
            const memSnap = await getDocs(memQuery);
            const first = firstMemberOrNone(memSnap.docs);
            if (first) {
              setMemberData({ id: first.id, ...first.data() });
              setSignupMeta(null);
            } else {
              setMemberData(null);
              /* v1.14: auto-cadastro pendente/rejeitado? O documento vive em
                 member_signups/<email-normalizado> (leitura: só o próprio ou a
                 liderança — regras). Sem query: o ID É o email. */
              if (!hasAdminAccess) {
                try {
                  const sSnap = await getDoc(doc(db, 'member_signups', currentUser.email.toLowerCase()));
                  if (sSnap.exists()) {
                    const sd = sSnap.data() as any;
                    setSignupMeta({ statusSignup: sd.statusSignup, reason: sd.reason || null });
                  } else {
                    setSignupMeta(null);
                  }
                } catch {
                  setSignupMeta(null); // sem regras publicadas ainda: não bloqueia o ecrã antigo
                }
              } else {
                setSignupMeta(null);
              }
            }
          }
        } catch (error) {
          console.error('Failed to fetch admin status', error);
          setIsAdmin(false);
          setUserRole(null);
          setMemberData(null);
          setSignupMeta(null);
        }
      } else {
        setIsAdmin(false);
        setUserRole(null);
        setMemberData(null);
        setSignupMeta(null);
        setAdminMeta(null);
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
        signupMeta,
        adminMeta,
        isSuperAdmin: !!adminMeta?.isSuper,
        mustChangePassword: !!adminMeta?.mustChangePassword,
        tempPasswordIssuedAt: adminMeta?.tempPasswordIssuedAt ?? null,
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
