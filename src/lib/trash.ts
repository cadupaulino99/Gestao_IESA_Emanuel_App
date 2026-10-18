import { doc, getDoc, setDoc, deleteDoc, collection } from 'firebase/firestore';
import { db } from './firebase'; // Wait, let's see where firebase is exported

export const moveToTrash = async (collectionName: string, id: string, userEmail: string) => {
  const docRef = doc(db, collectionName, id);
  const snap = await getDoc(docRef);
  
  if (!snap.exists()) return false;

  const data = snap.data();

  // Save to trash
  await setDoc(doc(db, 'trash', `${collectionName}_${id}`), {
    collectionName,
    originalId: id,
    data,
    deletedAt: new Date().toISOString(),
    deletedBy: userEmail,
  });

  // Delete original
  await deleteDoc(docRef);
  return true;
};

export const restoreFromTrash = async (trashId: string) => {
  const trashRef = doc(db, 'trash', trashId);
  const snap = await getDoc(trashRef);
  
  if (!snap.exists()) return false;

  const trashData = snap.data();
  const { collectionName, originalId, data } = trashData;

  // Restore
  await setDoc(doc(db, collectionName, originalId), data);

  // Remove from trash
  await deleteDoc(trashRef);
  return true;
};

export const isRecordLocked = (createdAt: string | number | undefined): { locked: boolean, reason?: string } => {
  if (!createdAt) return { locked: false };
  
  const createdDate = new Date(createdAt);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - createdDate.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
  
  if (diffDays > 30) {
    return { locked: true, reason: `Registo com mais de 30 dias (${diffDays} dias). O bloqueio de segurança está ativo.` };
  }
  
  return { locked: false };
};
