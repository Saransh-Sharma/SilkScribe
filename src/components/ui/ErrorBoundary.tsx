import React from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw, ScrollText } from "lucide-react";
import { commands } from "@/bindings";
import { Alert } from "./Alert";
import { Button } from "./Button";

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

interface ErrorBoundaryFallbackProps {
  onReload: () => void;
  onOpenLogs: () => void;
}

const ErrorBoundaryFallback: React.FC<ErrorBoundaryFallbackProps> = ({
  onReload,
  onOpenLogs,
}) => {
  const { t } = useTranslation();

  return (
    <div className="rounded-[var(--ss-radius-lg)] border border-ss-border-subtle bg-ss-bg-surface p-5 shadow-[var(--ss-shadow-card)]">
      <Alert variant="error" contained>
        {t("common.errorBoundary.description")}
      </Alert>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="primary" size="sm" onClick={onReload}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {t("common.errorBoundary.reload")}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onOpenLogs}
        >
          <ScrollText className="h-4 w-4" aria-hidden="true" />
          {t("common.errorBoundary.openLogs")}
        </Button>
      </div>
    </div>
  );
};

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("SilkScribe content crashed:", error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleOpenLogs = async () => {
    const result = await commands.openLogDir();
    if (result.status === "error") {
      console.warn("Failed to open log directory:", result.error);
    }
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <ErrorBoundaryFallback
        onReload={this.handleReload}
        onOpenLogs={this.handleOpenLogs}
      />
    );
  }
}
