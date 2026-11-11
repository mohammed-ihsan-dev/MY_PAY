import { ZodError } from "zod";

/** A user-facing error from a data operation (validation, conflict, not found). */
export class AppError extends Error {
  constructor(
    public readonly code: "BAD_REQUEST" | "NOT_FOUND" | "CONFLICT" | "LOCKED",
    message: string,
    public readonly details?: { issues?: { path: string; message: string }[] }
  ) {
    super(message);
    this.name = "AppError";
  }
  static badRequest(message: string, field?: string) {
    return new AppError("BAD_REQUEST", message, field ? { issues: [{ path: field, message }] } : undefined);
  }
  static notFound(message = "Not found.") {
    return new AppError("NOT_FOUND", message);
  }
  static conflict(message: string) {
    return new AppError("CONFLICT", message);
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof ZodError) return err.issues[0]?.message ?? "Check the highlighted fields.";
  return err instanceof Error ? err.message : "Something went wrong.";
}

/** Field → message map for highlighting form inputs. */
export function fieldErrors(err: unknown): Record<string, string> {
  if (err instanceof ZodError) return Object.fromEntries(err.issues.map((i) => [i.path.join("."), i.message]));
  if (err instanceof AppError) return Object.fromEntries((err.details?.issues ?? []).map((i) => [i.path, i.message]));
  return {};
}
