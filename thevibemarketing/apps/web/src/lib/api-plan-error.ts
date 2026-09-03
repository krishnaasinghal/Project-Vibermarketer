/**
 * Parse plan/meter API errors (402 monthly meter, 403 feature gate).
 * Shared by Studio / queue for upgrade-friendly UI copy.
 */

export type PlanApiError = {
  message: string;
  code?: string;
  upgrade?: string;
  feature?: string;
  min_label?: string;
  meter?: {
    used?: number;
    limit?: number;
    remaining?: number;
    period?: string;
    label?: string;
  };
};

export async function readPlanApiError(res: Response): Promise<PlanApiError> {
  try {
    const body = (await res.json()) as {
      error?: string;
      message?: string;
      code?: string;
      upgrade?: string;
      feature?: string;
      min_label?: string;
      feature_label?: string;
      meter?: PlanApiError["meter"];
    };
    const message =
      body.error ||
      body.message ||
      (res.status === 402
        ? "Monthly agent budget reached."
        : res.status === 403
          ? "This feature requires a higher plan."
          : `Request failed (${res.status})`);
    return {
      message,
      code: body.code,
      upgrade: body.upgrade || "/pricing",
      feature: body.feature_label || body.feature,
      min_label: body.min_label,
      meter: body.meter,
    };
  } catch {
    return {
      message:
        res.status === 402
          ? "Monthly agent budget reached — upgrade for more runs."
          : res.status === 403
            ? "Feature locked on your plan — upgrade to unlock."
            : `Request failed (${res.status})`,
      upgrade: "/pricing",
    };
  }
}

export function formatPlanError(err: PlanApiError): string {
  if (err.code === "MONTHLY_METER" && err.meter) {
    return `${err.message} (${err.meter.used}/${err.meter.limit} this month).`;
  }
  if (err.code === "FEATURE_GATED" && err.min_label) {
    return `${err.message}`;
  }
  return err.message;
}
