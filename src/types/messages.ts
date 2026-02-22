/**
 * Worker message protocol types.
 *
 * Command: main thread → Worker
 * Response: Worker → main thread
 *
 * These will be refined in Plan 02 when atom types are defined.
 */

export type Command =
  | { type: 'INIT' }
  | { type: 'PING' }
  | { type: 'CREATE_ATOM'; payload: { content: string; atomType?: string } }
  | { type: 'UPDATE_ATOM'; payload: { id: string; content?: string; status?: string } }
  | { type: 'DELETE_ATOM'; payload: { id: string } };

export type Response =
  | { type: 'READY'; payload: { version: string } }
  | { type: 'PONG'; payload: string }
  | { type: 'ATOM_CREATED'; payload: { id: string } }
  | { type: 'ATOM_UPDATED'; payload: { id: string } }
  | { type: 'ERROR'; payload: { message: string } };
