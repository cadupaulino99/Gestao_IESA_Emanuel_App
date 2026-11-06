import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import CommunionMonthlyAdmin from '../components/admin/CommunionMonthlyAdmin';

/** Aba própria: Presença na Comunhão / Santa Ceia (somente admin). */
export default function Communion() {
  const { userRole } = useAuth();
  if (userRole !== 'admin') {
    return <Navigate to="/" replace />;
  }
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <CommunionMonthlyAdmin />
    </div>
  );
}
