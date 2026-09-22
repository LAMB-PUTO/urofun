import { useCallback, useEffect, useRef, useState } from 'react';
import { startRecording, transcribeAudio } from '../services/ai/transcribe';

export type DictationPhase = 'idle' | 'recording' | 'transcribing';

/**
 * Dictado por campo: un solo campo graba a la vez. `onText` recibe el texto
 * transcrito para insertarlo en el caret del campo activo.
 */
export const useDictation = () => {
  const [phase, setPhase] = useState<DictationPhase>('idle');
  const [field, setField] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef<(() => Promise<Blob>) | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastBlob = useRef<{ field: string; blob: Blob } | null>(null);

  const clearTimer = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  const transcribe = useCallback(async (target: string, blob: Blob, onText: (text: string, field: string) => void) => {
    setPhase('transcribing');
    try {
      const text = await transcribeAudio(blob);
      if (text) onText(text, target);
      lastBlob.current = null;
      setError(null);
    } catch (err) {
      lastBlob.current = { field: target, blob };
      setError(err instanceof Error ? err.message : 'No se pudo transcribir.');
    } finally {
      setPhase('idle');
      setField(null);
    }
  }, []);

  const start = useCallback(async (target: string) => {
    if (phase !== 'idle') return;
    setError(null);
    try {
      const { stop } = await startRecording();
      stopRef.current = stop;
      setField(target);
      setPhase('recording');
      setSeconds(0);
      timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setError('No se pudo acceder al micrófono. Revise los permisos del navegador.');
    }
  }, [phase]);

  const stop = useCallback(
    async (onText: (text: string, field: string) => void) => {
      if (phase !== 'recording' || !stopRef.current || !field) return;
      clearTimer();
      const blob = await stopRef.current();
      stopRef.current = null;
      if (blob.size > 25 * 1024 * 1024) {
        setError('La grabación supera 25 MB. Dicte en fragmentos más cortos.');
        setPhase('idle');
        setField(null);
        return;
      }
      await transcribe(field, blob, onText);
    },
    [phase, field, transcribe],
  );

  /** Reintenta la última transcripción fallida; el texto llega con el campo que se dictó. */
  const retry = useCallback(
    async (onText: (text: string, field: string) => void) => {
      const last = lastBlob.current;
      if (!last) return;
      setField(last.field);
      await transcribe(last.field, last.blob, onText);
    },
    [transcribe],
  );

  const cancel = useCallback(async () => {
    clearTimer();
    if (stopRef.current) {
      await stopRef.current();
      stopRef.current = null;
    }
    setPhase('idle');
    setField(null);
  }, []);

  useEffect(() => () => clearTimer(), []);

  return { phase, field, seconds, error, start, stop, cancel, retry, canRetry: lastBlob.current !== null };
};
