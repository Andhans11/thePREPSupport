import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { GoogleCalendarIntegration } from '../components/settings/GoogleCalendarIntegration';

export function AddCalendarPage() {
  return (
    <div className="max-w-2xl mx-auto p-6">
      <Link
        to="/settings?tab=inboxes"
        className="inline-flex items-center gap-2 text-sm text-[var(--hiver-text-muted)] hover:text-[var(--hiver-text)] mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Tilbake til E-post innbokser
      </Link>
      <GoogleCalendarIntegration mode="addOnly" />
    </div>
  );
}
