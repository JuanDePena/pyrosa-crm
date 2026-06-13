import React from "react";
import { createRoot } from "react-dom/client";
import {
  Bell,
  Building2,
  Database,
  FileText,
  Image as ImageIcon,
  Link2,
  LogOut,
  ShieldCheck,
  UserRound
} from "lucide-react";
import "./styles.css";

type ClientSession = {
  expiresAt?: string;
  uiAuthAuthenticatedAt?: string;
  user?: {
    email?: string;
    displayName?: string;
    role?: string;
    locale?: string;
    timezone?: string;
    status?: string;
    primaryEmail?: {
      email?: string;
      isVerified?: boolean;
    };
    security?: {
      mfaRequired?: boolean;
      activeMfaMethods?: number;
    };
  };
};

type SessionResponse = {
  ok?: boolean;
  session?: ClientSession;
};

const platformServices = [
  {
    name: "Platform",
    icon: Database,
    service: "pyrosa-platform",
    owns: "Catalogo de apps, gobierno visual, contratos runtime y estado operativo"
  },
  {
    name: "IAM",
    icon: ShieldCheck,
    service: "pyrosa-iam",
    owns: "Autenticacion, MFA, tickets ui-auth, sesiones globales y politicas de acceso"
  },
  {
    name: "Accounts",
    icon: UserRound,
    service: "pyrosa-accounts",
    owns: "Centro de cuenta, perfil de usuario, preferencias y autoservicio"
  }
];

const modules = [
  { label: "Cuentas", icon: Building2, detail: "Organizaciones comerciales, segmentos y relaciones activas." },
  { label: "Contactos", icon: UserRound, detail: "Personas, roles, preferencias y datos de relacion." },
  { label: "Oportunidades", icon: FileText, detail: "Pipeline, etapas, propuestas y probabilidad comercial." },
  { label: "Actividades", icon: Bell, detail: "Seguimientos, tareas, recordatorios y proximas acciones." }
];

function App() {
  const [session, setSession] = React.useState<ClientSession | null>(null);
  const [brandLogoReady, setBrandLogoReady] = React.useState(true);

  React.useEffect(() => {
    let active = true;
    void fetch("/api/crm/session", {
      credentials: "same-origin",
      headers: { accept: "application/json" }
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: SessionResponse | null) => {
        if (active && payload?.session) {
          setSession(payload.session);
        }
      })
      .catch(() => {
        if (active) {
          setSession(null);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const displayName = session?.user?.displayName || session?.user?.email || "Sesion delegada";
  const displayEmail = session?.user?.email || "pyrosa-iam";
  const brandLogoUrl = "/public/assets/brand/crm-logo.png";

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="CRM">
        <div className="brand">
          <div className="brand-mark">
            {brandLogoReady ? (
              <img alt="" src={brandLogoUrl} onError={() => setBrandLogoReady(false)} />
            ) : (
              "PC"
            )}
          </div>
          <div>
            <div className="brand-title">PYROSA CRM</div>
            <div className="brand-subtitle">v2606 demo</div>
          </div>
        </div>
        <nav className="nav-list">
          <a className="active" href="#inicio">
            Inicio
          </a>
          <a href="#modulos">Modulos</a>
          <a href="#plataforma">Plataforma</a>
          <a href="#marca">Marca</a>
          <a href="#runtime">Runtime</a>
        </nav>
        <div className="session-card">
          <UserRound aria-hidden="true" />
          <div>
            <p>{displayName}</p>
            <span>{displayEmail}</span>
          </div>
          <a className="icon-link" href="/logout" title="Cerrar sesion" aria-label="Cerrar sesion">
            <LogOut aria-hidden="true" />
          </a>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">democrm.pyrosa.com.do</p>
            <h1>CRM transaccional, servicios plataforma afuera.</h1>
          </div>
          <div className="status-cluster">
            <span className="badge success">Node + TypeScript</span>
            <span className="badge success">Auth delegada</span>
            <span className="badge">PostgreSQL demo</span>
            <span className="badge warning">v2606 sandbox</span>
          </div>
        </header>

        <section className="grid">
          <article className="panel primary-panel" id="inicio">
            <div className="panel-heading">
              <Database aria-hidden="true" />
              <div>
                <h2>Base tecnica activa</h2>
                <p>
                  El carril demo ya usa el repositorio `pyrosa-crm`, con UI React,
                  servidor Node y contrato inicial PostgreSQL.
                </p>
              </div>
            </div>
            <dl className="facts">
              <div>
                <dt>Checkout demo</dt>
                <dd>/srv/containers/apps/pyrosa-democrm/app</dd>
              </div>
              <div>
                <dt>Health</dt>
                <dd>/__pyrosa_crm_health</dd>
              </div>
              <div>
                <dt>DB demo</dt>
                <dd>app_pyrosa_democrm</dd>
              </div>
            </dl>
          </article>

          <article className="panel" id="runtime">
            <div className="panel-heading compact">
              <Bell aria-hidden="true" />
              <div>
                <h2>Sesion delegada</h2>
                <p>
                  CRM consume identidad desde IAM y conserva solo la sesion local minima
                  para su experiencia propia.
                </p>
              </div>
            </div>
          </article>
        </section>

        <section className="module-grid" id="modulos" aria-label="Modulos CRM">
          {modules.map((module) => {
            const Icon = module.icon;
            return (
              <article className="module-card" key={module.label}>
                <Icon aria-hidden="true" />
                <h2>{module.label}</h2>
                <p>{module.detail}</p>
              </article>
            );
          })}
        </section>

        <section className="panel" id="plataforma">
          <div className="section-title">
            <Link2 aria-hidden="true" />
            <h2>Contratos con servicios Pyrosa</h2>
          </div>
          <div className="service-grid">
            {platformServices.map((service) => {
              const Icon = service.icon;
              return (
                <article className="service-row" key={service.name}>
                  <Icon aria-hidden="true" />
                  <div>
                    <h3>{service.name}</h3>
                    <p className="mono">{service.service}</p>
                    <p>{service.owns}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="panel brand-panel" id="marca">
          <div className="section-title">
            <ImageIcon aria-hidden="true" />
            <h2>Marca CRM</h2>
          </div>
          <div className="brand-manager">
            <div className="brand-preview" aria-label="Logo PYROSA CRM">
              {brandLogoReady ? (
                <img alt="" src={brandLogoUrl} onError={() => setBrandLogoReady(false)} />
              ) : (
                <span>PC</span>
              )}
            </div>
            <dl className="brand-facts">
              <div>
                <dt>Asset</dt>
                <dd>/public/assets/brand/crm-logo.png</dd>
              </div>
              <div>
                <dt>Fuente</dt>
                <dd>ui/public/public/assets/brand/crm-logo.png</dd>
              </div>
              <div>
                <dt>Estado</dt>
                <dd>Activo en el shell</dd>
              </div>
            </dl>
          </div>
        </section>

      </main>
    </div>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
