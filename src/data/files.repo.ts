import type { AttachedFile } from '../domain/types';
import { BUCKETS, fail, supabase } from './supabase';

const safeName = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(-80);

export const uploadPatientFile = async (file: File, visitId: string): Promise<AttachedFile> => {
  const path = `${visitId}/${Date.now()}-${safeName(file.name)}`;
  const { error } = await supabase.storage.from(BUCKETS.patientFiles).upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (error) fail('No se pudo subir el archivo. Verifica que exista el bucket "patient_files".', error);
  const { data } = supabase.storage.from(BUCKETS.patientFiles).getPublicUrl(path);
  return { name: file.name, url: data.publicUrl, type: file.type, uploadedAt: new Date().toISOString(), path };
};
