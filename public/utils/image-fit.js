/**
 * Modul: Bild auf Kartenmass bringen
 * Zweck: Ein Foto fuer die Kinder-Tafel (Schritt oder Hintergrund) ohne
 *        Quadratzuschnitt - die Zeichnung soll ganz bleiben.
 * Abhaengigkeiten: /i18n.js
 */
import { t } from '/i18n.js';

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_FILE_BYTES = 5 * 1024 * 1024;

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(t('settings.profilePictureReadError')));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(t('settings.profilePictureReadError')));
    img.src = dataUrl;
  });
}

/**
 * @param {File|undefined} file
 * @param {{ maxWidth?: number, maxHeight?: number, maxDataLength?: number }} [opts]
 * @returns {Promise<string|undefined>} JPEG-Data-URL oder undefined ohne Datei
 */
export async function readFittedImage(file, {
  maxWidth = 800,
  maxHeight = 800,
  maxDataLength = 768 * 1024,
} = {}) {
  if (!file) return undefined;
  if (!ACCEPTED_TYPES.includes(file.type)) throw new Error(t('settings.profilePictureTypeError'));
  if (file.size > MAX_FILE_BYTES) throw new Error(t('settings.profilePictureFileTooLarge'));

  const img = await loadImage(await readFileAsDataUrl(file));
  const scale = Math.min(1, maxWidth / img.naturalWidth, maxHeight / img.naturalHeight);
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(img, 0, 0, width, height);

  let quality = 0.88;
  let out = canvas.toDataURL('image/jpeg', quality);
  while (out.length > maxDataLength && quality > 0.45) {
    quality -= 0.08;
    out = canvas.toDataURL('image/jpeg', quality);
  }
  if (out.length > maxDataLength) throw new Error(t('settings.profilePictureTooLarge'));
  return out;
}
