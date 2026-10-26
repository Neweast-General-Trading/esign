import type { RecipientPublic } from "@/lib/types";

/** Workflow step for a recipient (shared by everyone in that stage). */
export function getRecipientStep(
  recipient: Pick<RecipientPublic, "signingStep" | "signingOrder">,
) {
  const step = Number(recipient.signingStep || recipient.signingOrder || 1);
  return step > 0 ? step : 1;
}
