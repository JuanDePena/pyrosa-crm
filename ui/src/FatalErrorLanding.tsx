import type { ReactNode } from "react";
import {
  ApplicationErrorBoundary,
  InternalErrorLanding,
  type InternalErrorPresentation
} from "@pyrosa/ui-templates";
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
    <InternalErrorLanding
      logo={<img alt="" src="/public/assets/brand/crm-logo.png" />}
      model={crmErrorPresentation({ issue, message, subtitle, title })}
      onAction={() => onRetry()}
    />
  );
}

export function FatalErrorBoundary({ children }: { children: ReactNode }) {
  const issue = { code: "crm.client.render_failed", retryable: true };

  return (
    <ApplicationErrorBoundary
      logo={<img alt="" src="/public/assets/brand/crm-logo.png" />}
      model={crmErrorPresentation({
        issue,
        message: "Se produjo un error interno al preparar la vista. No se mostraron datos alternativos.",
        subtitle: "La aplicacion no puede iniciar de forma segura en este momento.",
        title: "DemoCRM no esta disponible"
      })}
      onAction={() => window.location.reload()}
    >
      {children}
    </ApplicationErrorBoundary>
  );
}

function crmErrorPresentation({
  issue,
  message,
  subtitle,
  title
}: {
  issue: TechnicalIssue;
  message: string;
  subtitle: string;
  title: string;
}): InternalErrorPresentation {
  return {
    appName: "PYROSA CRM",
    title,
    subtitle,
    message,
    primaryAction: {
      actionId: "retry",
      label: "Intentar nuevamente"
    },
    supportHint: "Si el problema continua, comparte solamente el codigo y el Request ID con soporte.",
    detailsLabel: "Detalle tecnico",
    technicalDetails: {
      code: issue.code,
      httpStatus: issue.status,
      requestId: issue.requestId,
      occurredAt: issue.occurredAt,
      retryable: issue.retryable
    }
  };
}
