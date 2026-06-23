import { useElectronIPC } from "@renderer/context/ElectronIPCProvider";
import { useEffect } from "react";

export function useEngineeringCapture() {
  const { invoke } = useElectronIPC();

  useEffect(() => {
    const recordError = (error: Error, source: "renderer_error" | "unhandled_rejection") => {
      void invoke("recordEngineeringEvent", {
        type: source,
        severity: "error",
        source: "renderer",
        message: error.message,
        stack: error.stack,
        route: window.location.hash || window.location.pathname,
      });
    };

    const handleError = (event: ErrorEvent) => {
      recordError(
        event.error instanceof Error ? event.error : new Error(event.message),
        "renderer_error",
      );
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      recordError(
        event.reason instanceof Error ? event.reason : new Error(String(event.reason)),
        "unhandled_rejection",
      );
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, [invoke]);
}
