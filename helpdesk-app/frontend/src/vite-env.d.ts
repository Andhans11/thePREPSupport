/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_GOOGLE_REDIRECT_URI: string;
  /** Optional. If set, Google Calendar OAuth uses this redirect (add same URL in Google Console + set REDIRECT_URI_CALENDAR on the calendar Edge Function). */
  readonly VITE_GOOGLE_CALENDAR_REDIRECT_URI?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
