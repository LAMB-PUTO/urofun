import { Mic, Square } from 'lucide-react';
import type { RefObject } from 'react';
import { Button } from '../../components/ui';
import type { useDictation } from '../../hooks/useDictation';

type Dictation = ReturnType<typeof useDictation>;

/** Inserta texto en el caret del textarea y devuelve el nuevo valor. */
export const insertAtCaret = (el: HTMLTextAreaElement | null, current: string, text: string): string => {
  const clean = text.trim();
  if (!clean) return current;
  if (!el) return current ? `${current}\n${clean}` : clean;
  const start = el.selectionStart ?? current.length;
  const end = el.selectionEnd ?? current.length;
  const before = current.slice(0, start);
  const after = current.slice(end);
  const sep = before && !/\s$/.test(before) ? ' ' : '';
  return `${before}${sep}${clean}${after}`;
};

export const DictationButton = ({ field, dictation, textareaRef, value, onChange }: { field: string; dictation: Dictation; textareaRef: RefObject<HTMLTextAreaElement | null>; value: string; onChange: (v: string) => void }) => {
  const mine = dictation.field === field;
  const recording = mine && dictation.phase === 'recording';
  const transcribing = mine && dictation.phase === 'transcribing';
  const disabled = dictation.phase !== 'idle' && !mine;
  const handle = () => {
    if (recording) void dictation.stop((t) => onChange(insertAtCaret(textareaRef.current, value, t)));
    else void dictation.start(field);
  };
  return (
    <span className="row-2">
      {recording && (
        <span className="small num danger-text row-2">
          <span className="rec-dot" /> {dictation.seconds}s
        </span>
      )}
      <Button size="sm" variant={recording ? 'danger' : 'ghost'} icon={recording ? <Square size={14} /> : <Mic size={14} />} onClick={handle} loading={transcribing} disabled={disabled} title={recording ? 'Detener y transcribir' : 'Dictar en este campo'}>
        {recording ? 'Detener' : transcribing ? 'Transcribiendo' : 'Dictar'}
      </Button>
    </span>
  );
};
