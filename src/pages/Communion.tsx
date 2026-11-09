import { Navigate } from 'react-router-dom';

/** Redireciona para Membros → aba Comunhão (funcionalidade unificada). */
export default function Communion() {
  return <Navigate to="/members" replace state={{ tab: 'comunhao' }} />;
}
