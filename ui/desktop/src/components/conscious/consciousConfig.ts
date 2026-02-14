/**
 * Centralized configuration for the Conscious AI subsystem.
 *
 * All conscious component files should import from here rather than
 * defining their own `CONSCIOUS_API` constant. This makes it trivial
 * to change the host/port for production or testing.
 */

/** Base URL for the Conscious REST API (Python backend). */
export const CONSCIOUS_API =
  (typeof window !== 'undefined' &&
    (window as unknown as Record<string, string | undefined>).__CONSCIOUS_API__) ||
  'http://localhost:8999';

/** WebSocket URL for the Conscious UI Bridge. */
export const CONSCIOUS_WS =
  (typeof window !== 'undefined' &&
    (window as unknown as Record<string, string | undefined>).__CONSCIOUS_WS__) ||
  'ws://localhost:8997';
