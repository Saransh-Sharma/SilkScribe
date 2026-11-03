import { toast } from "sonner";

/**
 * Show a failed action as a friendly, translated title with the underlying
 * error message as the detail line, instead of a raw backend string.
 */
export const toastError = (title: string, error: unknown) => {
  const detail = error instanceof Error ? error.message : String(error ?? "");
  toast.error(
    title,
    detail && detail !== title ? { description: detail } : undefined,
  );
};
