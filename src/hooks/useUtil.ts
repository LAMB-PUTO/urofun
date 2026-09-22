import { useEffect, useRef, useState } from 'react';
import { listDoctors } from '../data/doctors.repo';
import type { Doctor } from '../domain/types';

export const useDocumentTitle = (title: string) => {
  useEffect(() => {
    const prev = document.title;
    document.title = `${title} · Urología Funcional`;
    return () => {
      document.title = prev;
    };
  }, [title]);
};

let doctorsCache: Doctor[] | null = null;

export const useDoctors = () => {
  const [doctors, setDoctors] = useState<Doctor[]>(doctorsCache ?? []);
  const [loading, setLoading] = useState(doctorsCache === null);
  useEffect(() => {
    let alive = true;
    listDoctors()
      .then((d) => {
        doctorsCache = d;
        if (alive) setDoctors(d);
      })
      .catch(() => undefined)
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);
  return { doctors, loading };
};

/** Ejecuta `onIdle` tras `seconds` sin interacción. Devuelve el reinicio manual. */
export const useIdleTimer = (seconds: number, onIdle: () => void, enabled = true) => {
  const cb = useRef(onIdle);
  cb.current = onIdle;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reset = () => {
    if (timer.current) clearTimeout(timer.current);
    if (enabled) timer.current = setTimeout(() => cb.current(), seconds * 1000);
  };
  useEffect(() => {
    if (!enabled) return;
    const events = ['pointerdown', 'keydown', 'touchstart', 'scroll'];
    const handler = () => reset();
    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
    reset();
    return () => {
      events.forEach((e) => window.removeEventListener(e, handler));
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds, enabled]);
  return reset;
};

export const useHotkey = (combo: string, handler: (e: KeyboardEvent) => void, enabled = true) => {
  const cb = useRef(handler);
  cb.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const parts = combo.toLowerCase().split('+');
    const key = parts[parts.length - 1];
    const needCtrl = parts.includes('ctrl') || parts.includes('mod');
    const needShift = parts.includes('shift');
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (typing && !needCtrl) return;
      if (e.key.toLowerCase() !== key) return;
      if (needCtrl !== (e.ctrlKey || e.metaKey)) return;
      if (needShift !== e.shiftKey) return;
      e.preventDefault();
      cb.current(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [combo, enabled]);
};

export const useDebouncedValue = <T>(value: T, ms = 300): T => {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
};

/** Reloj que avanza cada `ms` (para "hace X min"). */
export const useNow = (ms = 30_000) => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
};
