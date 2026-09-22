import { Armchair, BookOpen, CalendarDays, LogOut, Menu as MenuIcon, ShieldCheck, UserPlus, Users } from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { can } from '../../config/roles';
import { Avatar } from '../../components/ui';
import { Drawer } from '../../components/ui/Dialog';
import { logout, useSession } from '../../services/session';
import { roleLabel } from '../../services/session';
import { Surface } from './Surface';

const NavItems = ({ onNavigate }: { onNavigate?: () => void }) => {
  const session = useSession();
  return (
    <nav className="sidebar__nav" aria-label="Principal">
      <NavLink to="/panel/espera" className="nav__item" onClick={onNavigate}>
        <Armchair />
        <span>Sala de espera</span>
      </NavLink>
      <NavLink to="/panel/agenda" className="nav__item" onClick={onNavigate}>
        <CalendarDays />
        <span>Agenda</span>
      </NavLink>
      {can(session, 'patient.register') && (
        <NavLink to="/panel/registrar" className="nav__item" onClick={onNavigate}>
          <UserPlus />
          <span>Registrar paciente</span>
        </NavLink>
      )}
      {can(session, 'patients.view') && (
        <NavLink to="/panel/pacientes" className="nav__item" onClick={onNavigate}>
          <Users />
          <span>Pacientes</span>
        </NavLink>
      )}
      {can(session, 'research.use') && (
        <NavLink to="/panel/investigacion" className="nav__item" onClick={onNavigate}>
          <BookOpen />
          <span>Investigación</span>
        </NavLink>
      )}
      {can(session, 'admin.doctors') && (
        <>
          <div className="sidebar__group eyebrow">Administración</div>
          <NavLink to="/panel/doctores" className="nav__item" onClick={onNavigate}>
            <ShieldCheck />
            <span>Doctores</span>
          </NavLink>
        </>
      )}
    </nav>
  );
};

const Sidebar = ({ drawer, onNavigate }: { drawer?: boolean; onNavigate?: () => void }) => {
  const session = useSession();
  const navigate = useNavigate();
  const doLogout = () => {
    logout();
    navigate('/', { replace: true });
  };
  return (
    <aside className={['sidebar', drawer ? 'sidebar--drawer' : ''].filter(Boolean).join(' ')}>
      <div className="sidebar__brand">
        <img src="/logo-mark.png" alt="" />
        <div className="sidebar__brand-text">
          <span className="sidebar__brand-name">Urología Funcional</span>
          <span className="small muted">{session ? roleLabel[session.role] : ''}</span>
        </div>
      </div>
      <NavItems onNavigate={onNavigate} />
      <div className="sidebar__user">
        <Avatar name={session?.fullName ?? ''} doctor={session?.role === 'doctor'} />
        <div className="sidebar__user-text grow">
          <span className="small strong truncate">{session?.fullName}</span>
          <span className="micro muted">{session?.isAdmin ? 'Administrador' : session ? roleLabel[session.role] : ''}</span>
        </div>
        <button type="button" className="icon-btn icon-btn--sm" onClick={doLogout} aria-label="Cerrar sesión" title="Cerrar sesión">
          <LogOut size={18} />
        </button>
      </div>
    </aside>
  );
};

export const StaffLayout = () => {
  const [open, setOpen] = useState(false);
  return (
    <Surface kind="staff" className="shell">
      <div className="sidebar__topbar">
        <button type="button" className="icon-btn" onClick={() => setOpen(true)} aria-label="Abrir menú">
          <MenuIcon size={22} />
        </button>
        <img src="/logo-mark.png" alt="" width={28} height={28} />
        <span className="sidebar__brand-name">Urología Funcional</span>
      </div>
      <Sidebar />
      <main className="shell__main">
        <Outlet />
      </main>
      <Drawer open={open} onClose={() => setOpen(false)} title="Menú">
        <Sidebar drawer onNavigate={() => setOpen(false)} />
      </Drawer>
    </Surface>
  );
};
