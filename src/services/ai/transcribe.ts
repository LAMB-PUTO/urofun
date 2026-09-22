import { ENV } from '../env';
import { AiError, fetchWithRetry, hasProxy, proxyForm } from './client';

/** Dictado médico (Whisper / modelos de transcripción de OpenAI), forzado a español. */
export const transcribeAudio = async (audio: Blob): Promise<string> => {
  const form = new FormData();
  form.append('file', audio, 'dictado.webm');
  form.append('model', ENV.transcribeModel);
  form.append('language', 'es');
  form.append('prompt', 'Dictado de nota médica urológica en español: signos vitales, diagnóstico, receta con dosis y frecuencia.');

  if (hasProxy()) {
    const data = await proxyForm<{ text: string }>('transcribe', form, { timeoutMs: 120_000 });
    if (typeof data?.text !== 'string') throw new AiError('El proxy no devolvió transcripción.');
    return data.text.trim();
  }

  if (!ENV.openaiKey) throw new AiError('No hay proveedor de IA configurado para transcribir.');

  const res = await fetchWithRetry(
    'https://api.openai.com/v1/audio/transcriptions',
    { method: 'POST', headers: { Authorization: `Bearer ${ENV.openaiKey}` }, body: form },
    { timeoutMs: 120_000, retries: 1 },
  );
  const data = (await res.json()) as { text?: string };
  if (typeof data.text !== 'string') throw new AiError('Transcripción vacía.');
  return data.text.trim();
};

/** Graba audio del micrófono. Devuelve `stop()` que resuelve con el Blob. */
export const startRecording = async (): Promise<{ stop: () => Promise<Blob>; stream: MediaStream }> => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported(m));
  const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  recorder.start();
  const stop = () =>
    new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        resolve(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
      };
      recorder.stop();
    });
  return { stop, stream };
};
