import { Tablet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui';
import type { Visit } from '../../domain/types';

export const KioskCodeCard = ({ visit, onSkipIntake, skipping }: { visit: Visit; onSkipIntake?: () => void; skipping?: boolean }) => {
  const navigate = useNavigate();
  return (
    <div className="kiosk-code">
      <div className="eyebrow">Código para la tablet</div>
      <div className="kiosk-code__num">{visit.meta.kioskCode ?? '— — — —'}</div>
      <p className="small muted">
        El paciente toca <strong>Tengo un código</strong> en la tablet y escribe estos 4 dígitos. Vale solo hoy.
      </p>
      <div className="row-wrap">
        <Button variant="secondary" size="sm" icon={<Tablet size={16} />} onClick={() => navigate(`/kiosk/continuar/${visit.id}`)}>
          Abrir en esta tablet
        </Button>
        {onSkipIntake && (
          <Button variant="ghost" size="sm" onClick={onSkipIntake} loading={skipping}>
            Sin tablet: pasar a sala
          </Button>
        )}
      </div>
    </div>
  );
};
