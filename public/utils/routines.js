/**
 * Modul: Vorrat der Kinder-Routinen
 * Zweck: Die ueblichen Morgen- und Abendbilder, plus die Tageszeit auf der Wand.
 * Abhaengigkeiten: keine
 */

export const ROUTINE_PERIODS = Object.freeze(['morning', 'evening']);

/** 5:00 bis 14:59 = Morgen, sonst Abend. */
export function routinePeriodForHour(hour) {
  const n = Number(hour);
  if (!Number.isInteger(n)) return 'morning';
  return n >= 5 && n < 15 ? 'morning' : 'evening';
}

export function routineStepImageUrl(step) {
  if (!step?.has_image || !step?.id) return '';
  return `/api/v1/routines/steps/${Number(step.id)}/image?v=${encodeURIComponent(step.image_rev || 1)}`;
}

export function routineWallpaperUrl(person) {
  if (!person?.has_wallpaper || !person?.id) return '';
  return `/api/v1/routines/people/${Number(person.id)}/wallpaper?v=${encodeURIComponent(person.wallpaper_rev || 1)}`;
}

export const ROUTINE_TEMPLATES = Object.freeze({
  morning: Object.freeze([
    Object.freeze({ key: 'wake', icon: 'alarm-clock' }),
    Object.freeze({ key: 'toilet', icon: 'bath' }),
    Object.freeze({ key: 'hands', icon: 'droplets' }),
    Object.freeze({ key: 'breakfast', icon: 'utensils' }),
    Object.freeze({ key: 'dress', icon: 'shirt' }),
    Object.freeze({ key: 'teeth', icon: 'sparkles' }),
    Object.freeze({ key: 'shoes', icon: 'footprints' }),
    Object.freeze({ key: 'jacket', icon: 'backpack' }),
  ]),
  evening: Object.freeze([
    Object.freeze({ key: 'wash', icon: 'droplets' }),
    Object.freeze({ key: 'pajamas', icon: 'shirt' }),
    Object.freeze({ key: 'dinner', icon: 'utensils' }),
    Object.freeze({ key: 'teeth', icon: 'sparkles' }),
    Object.freeze({ key: 'hands', icon: 'bath' }),
    Object.freeze({ key: 'story', icon: 'book-open' }),
    Object.freeze({ key: 'bedtime', icon: 'moon' }),
  ]),
});
