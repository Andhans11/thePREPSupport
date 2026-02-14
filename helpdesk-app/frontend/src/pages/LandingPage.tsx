import { Link } from 'react-router-dom';
import heroBg from '../assets/hero_bg.png';

const landingFont = 'Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif';

export function LandingPage() {
  return (
    <div className="min-h-screen bg-[#f8fafc] text-[#1e293b] overflow-hidden" style={{ fontFamily: landingFont }}>
      {/* Hero */}
      <header
        className="relative min-h-screen flex flex-col bg-[#f8fafc] bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${heroBg})` }}
      >
        <nav className="flex items-center justify-between px-6 py-5 sm:px-8  bg-white/80 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <img src="/thePREP.svg" alt="thePREP" className="h-8 w-auto" />
            <span className="font-semibold text-[#475569] text-sm tracking-tight">Support</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="rounded-lg bg-white/90 px-4 py-2 text-sm font-medium text-[#475569] hover:bg-white hover:text-[#0f172a] transition-colors backdrop-blur-sm"
            >
              Logg inn
            </Link>
            <Link
              to="/signup"
              className="rounded-lg bg-[#0f766e] px-4 py-2 text-sm font-medium text-white hover:bg-[#115e59] transition-colors"
            >
              Registrer deg
            </Link>
          </div>
        </nav>

        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center sm:px-8">
          <div className="w-full max-w-2xl rounded-2xl bg-white/60 px-8 py-10 shadow-lg backdrop-blur-sm sm:px-12 sm:py-12">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-[#0f172a] max-w-4xl">
              Support som
              <span className="block mt-1 text-[#0f766e]">skalerer med deg</span>
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-[#64748b] max-w-xl font-normal mx-auto">
              Få oversikt over henvendelser, team og kunder – på ett sted.
              Gmail-sync, saksnummer og invitasjoner inkludert.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                to="/signup"
                className="w-full sm:w-auto rounded-lg bg-[#0f766e] px-8 py-4 text-base font-semibold text-white hover:bg-[#115e59] transition-colors"
              >
                Kom i gang
              </Link>
              <Link
                to="/login"
                className="w-full sm:w-auto rounded-lg border border-[#cbd5e1] bg-white px-8 py-4 text-base font-semibold text-[#334155] hover:bg-[#f1f5f9] hover:border-[#94a3b8] transition-colors"
              >
                Logg inn
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Features */}
      <section className="relative bg-white py-24 px-6 sm:px-8 border-t border-[#e2e8f0]">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-center text-[#0f172a] mb-16">
            Alt du trenger for support
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                title: 'Saker og tråder',
                desc: 'Samle all historikk, notateter, filer i en og samme sak. Kunden og teamet ditt i samme samtale.',
                icon: '📬',
              },
              {
                title: 'Gmail-sync',
                desc: 'Koble support-epost. Innkommende supportsaker og svar synkroniseres automatisk til saker.',
                icon: '✉️',
              },
              {
                title: 'Team og invitasjoner',
                desc: 'Inviter medarbeidere med e-postlenke. Roller, team-tilordning og tilgang styres på ett sted.',
                icon: '👥',
              },
              {
                title: 'Kunder og oversikt',
                desc: 'Kundeliste, saksoversikt og enkel rapportering. Vedlegg lagres sikkert per sak.',
                icon: '📊',
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-6 transition hover:border-[#0f766e]/30 hover:shadow-sm"
              >
                <span className="text-2xl" aria-hidden>{item.icon}</span>
                <h3 className="mt-3 text-lg font-semibold text-[#0f172a]">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm text-[#64748b] leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA strip */}
      <section className="relative bg-[#0f766e] py-16 px-6 sm:px-8">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white">
            Klar til å starte?
          </h2>
          <p className="mt-2 text-white/90">
            Registrer deg eller logg inn for å bruke helpdesk.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/signup"
              className="rounded-lg bg-white text-[#0f766e] px-8 py-3 text-base font-semibold hover:bg-[#f0fdfa] transition-colors"
            >
              Registrer deg
            </Link>
            <Link
              to="/login"
              className="rounded-lg border-2 border-white/80 text-white px-8 py-3 text-base font-semibold hover:bg-white/10 transition-colors"
            >
              Logg inn
            </Link>
          </div>
        </div>
      </section>

      <footer className="relative bg-[#f1f5f9] py-8 px-6 text-center text-sm text-[#64748b] border-t border-[#e2e8f0]">
        thePREP Support Helpdesk
      </footer>
    </div>
  );
}
