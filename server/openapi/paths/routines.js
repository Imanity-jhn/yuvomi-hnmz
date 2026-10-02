import { op, jsonBody, idParam } from '../helpers.js';

export function routinesPaths() {
  return {
    '/api/v1/routines': {
      get: op({
        summary: 'List kid routine boards',
        tag: 'Dashboard',
        description: 'Household members and their morning/evening steps. Completions are for today only.',
      }),
    },
    '/api/v1/routines/steps': {
      post: op({
        summary: 'Add a routine step',
        tag: 'Dashboard',
        stateChanging: true,
        requestBody: jsonBody(null),
        description: 'Body: { user_id, period: morning|evening, title, icon?, image_data?, show_title? }. A display cannot call this.',
      }),
    },
    '/api/v1/routines/steps/order': {
      put: op({
        summary: 'Reorder routine steps',
        tag: 'Dashboard',
        stateChanging: true,
        requestBody: jsonBody(null),
        description: 'Body: { ids }.',
      }),
    },
    '/api/v1/routines/steps/{id}': {
      patch: op({
        summary: 'Update a routine step',
        tag: 'Dashboard',
        params: [idParam()],
        stateChanging: true,
        requestBody: jsonBody(null),
        description: 'Body: { title?, icon?, image_data?, show_title? }. A display cannot call this.',
      }),
      delete: op({
        summary: 'Delete a routine step',
        tag: 'Dashboard',
        params: [idParam()],
        stateChanging: true,
      }),
    },
    '/api/v1/routines/steps/{id}/image': {
      get: op({
        summary: 'Routine step photo',
        tag: 'Dashboard',
        params: [idParam()],
        description: 'Binary PNG/JPEG/WebP. Lists only send has_image and image_rev.',
      }),
    },
    '/api/v1/routines/people/{id}': {
      put: op({
        summary: 'Set a person wallpaper for the routine board',
        tag: 'Dashboard',
        params: [idParam()],
        stateChanging: true,
        requestBody: jsonBody(null),
        description: 'Body: { wallpaper_data }. Null clears. A display cannot call this.',
      }),
    },
    '/api/v1/routines/people/{id}/wallpaper': {
      get: op({
        summary: 'Routine board wallpaper',
        tag: 'Dashboard',
        params: [idParam()],
        description: 'Binary PNG/JPEG/WebP for that person. Lists only send has_wallpaper.',
      }),
    },
    '/api/v1/routines/steps/{id}/done': {
      post: op({
        summary: 'Mark a routine step done for today',
        tag: 'Dashboard',
        params: [idParam()],
        stateChanging: true,
        requestBody: jsonBody(null),
        description: 'Body: { user_id }. A display must name the child. Resets at the next household day.',
      }),
      delete: op({
        summary: 'Undo a routine step for today',
        tag: 'Dashboard',
        params: [idParam()],
        stateChanging: true,
        requestBody: jsonBody(null),
      }),
    },
  };
}
