import { useEffect } from 'react';
import { LocalNotifications } from '@capacitor/local-notifications';
import { useAuth } from '../context/AuthContext';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useDevice } from './useDevice';
import { isBirthdayToday } from '../lib/luanda';

export function useNotifications() {
  const { userRole } = useAuth();
  const { isMobile, isTablet } = useDevice();
  const isCapacitor = isMobile || isTablet;

  useEffect(() => {
    if (!isCapacitor) return;

    let hasChecked = false;

    const setupNotifications = async () => {
      try {
        const { display } = await LocalNotifications.requestPermissions();
        if (display !== 'granted') return;

        // Limpa notificações antigas (pending) para evitar repetição massiva
        await LocalNotifications.cancel({ notifications: [{ id: 1 }, { id: 2 }, { id: 3 }] });

        // Verificações
        if (userRole === 'admin') {
          // Alertar para pedidos de atualização pendentes
          const q = query(collection(db, 'pedidos_atualizacao'), where('status', '==', 'pendente'));
          const snap = await getDocs(q);
          if (snap.size > 0 && !hasChecked) {
            await LocalNotifications.schedule({
              notifications: [
                {
                  title: "Atualizações Pendentes",
                  body: `Existem ${snap.size} pedidos de atualização de membros à espera de aprovação.`,
                  id: 1,
                  schedule: { at: new Date(Date.now() + 1000 * 5) } // Agendado para daqui a 5 segundos
                }
              ]
            });
          }
        }

        // Aniversariantes do dia (P3: pelo dia de LUANDA — o fuso do aparelho
        // mudava o contador; e o split('-') ignorava o legado 'DD/MM/AAAA').
        const membersSnapshot = await getDocs(collection(db, 'members'));
        let aniversariantes = 0;
        membersSnapshot.forEach(doc => {
            if (isBirthdayToday(doc.data().birthDate)) aniversariantes++;
        });

        if (aniversariantes > 0 && !hasChecked) {
             await LocalNotifications.schedule({
                notifications: [
                  {
                    title: "Aniversariantes do Dia!",
                    body: `Hoje temos ${aniversariantes} membro(s) a celebrar aniversário. Dê-lhes os parabéns!`,
                    id: 2,
                    schedule: { at: new Date(Date.now() + 1000 * 10) } // Daqui a 10 segundos
                  }
                ]
             });
        }
        
        hasChecked = true;

      } catch (err) {
        console.error("Local notifications error:", err);
      }
    };

    setupNotifications();
  }, [userRole, isCapacitor]);
}
