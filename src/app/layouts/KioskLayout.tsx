import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { logout } from '../../services/session';
import { Surface } from './Surface';

const REDUCED_KEY = 'uf.reducedMotion';

export const applyReducedMotionSetting = () => {
  try {
    if (localStorage.getItem(REDUCED_KEY) === '1') document.documentElement.setAttribute('data-reduced-motion', '');
    else document.documentElement.removeAttribute('data-reduced-motion');
  } catch {
    /* sin almacenamiento */
  }
};

export const toggleReducedMotion = (): boolean => {
  let next = false;
  try {
    next = localStorage.getItem(REDUCED_KEY) !== '1';
    localStorage.setItem(REDUCED_KEY, next ? '1' : '0');
  } catch {
    /* sin almacenamiento */
  }
  applyReducedMotionSetting();
  return next;
};

export const isReducedMotion = (): boolean => {
  try {
    return localStorage.getItem(REDUCED_KEY) === '1';
  } catch {
    return false;
  }
};

export const KioskLayout = () => {
  useEffect(() => {
    applyReducedMotionSetting();
    // La tableta pasa a manos del paciente: ninguna sesión del personal sobrevive aquí (salida por PIN).
    logout();
  }, []);
  return (
    <Surface kind="kiosk" className="kiosk">
      <Outlet />
    </Surface>
  );
};
