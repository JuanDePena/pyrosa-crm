import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@pyrosa/ui";
import type { TechnicalIssue } from "./crmTypes";

export function FatalErrorLanding({
  issue,
  message,
  onRetry,
  subtitle = "La aplicacion no puede iniciar de forma segura en este momento.",
  title = "DemoCRM no esta disponible"
}: {
  issue: TechnicalIssue;
  message: string;
  onRetry: () => void;
  subtitle?: string;
  title?: string;
}) {
  return (
    <main className="crm-fatal" data-crm-fatal-error="true">
      <section aria-labelledby="crm-fatal-title" className="crm-fatal__card">
        <div className="crm-fatal__brand" aria-label="PYROSA CRM">
          <img alt="" src="/public/assets/brand/crm-logo.png" />
          <strong>PYROSA CRM</strong>
        </div>
        <span aria-hidden="true" className="crm-fatal__icon">
          <AlertTriangle />
        </span>
        <div className="crm-fatal__copy">
          <h1 id="crm-fatal-title">{title}</h1>
          <p className="crm-fatal__subtitle">{subtitle}</p>
          <p>{message}</p>
        </div>
        <Button icon={<RefreshCw aria-hidden="true" />} onClick={onRetry}>
          Intentar nuevamente
        </Button>
        <details className="crm-fatal__details">
          <summary>Detalle tecnico</summary>
          <dl>
            <div>
              <dt>Codigo</dt>
              <dd>{issue.code}</dd>
            </div>
            {issue.status ? (
              <div>
                <dt>HTTP</dt>
                <dd>{issue.status}</dd>
              </div>
            ) : null}
            {issue.requestId ? (
              <div>
                <dt>Request ID</dt>
                <dd>{issue.requestId}</dd>
              </div>
            ) : null}
            {issue.occurredAt ? (
              <div>
                <dt>Ocurrio</dt>
                <dd>{issue.occurredAt}</dd>
              </div>
            ) : null}
            <div>
              <dt>Reintento</dt>
              <dd>{issue.retryable ? "permitido" : "requiere soporte"}</dd>
            </div>
          </dl>
        </details>
        <p className="crm-fatal__note">
          Si el problema continua, comparte solamente el codigo y el Request ID con soporte.
        </p>
      </section>
    </main>
  );
}

export class FatalErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <FatalErrorLanding
          issue={{ code: "crm.client.render_failed", retryable: true }}
          message="Se produjo un error interno al preparar la vista. No se mostraron datos alternativos."
          onRetry={() => {
            this.setState({ error: null });
            window.location.reload();
          }}
        />
      );
    }
    return this.props.children;
  }
}
