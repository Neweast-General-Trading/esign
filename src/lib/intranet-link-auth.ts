export interface IntranetLinkParams {
  userId: string;
  otp: string;
  companyCode: string;
}

/** Read Intranet menu OTP params (uSrId, LoTp, co) and strip them from the URL. */
export function consumeIntranetLinkFromQuery(): IntranetLinkParams | null {
  const params = new URLSearchParams(window.location.search);
  const userId = params.get("uSrId")?.trim();
  const otp = params.get("LoTp")?.trim();
  const companyCode = params.get("co")?.trim();
  if (!userId || !otp || !companyCode) return null;

  params.delete("uSrId");
  params.delete("LoTp");
  params.delete("co");
  const nextSearch = params.toString();
  const nextUrl = `${window.location.pathname}${
    nextSearch ? `?${nextSearch}` : ""
  }${window.location.hash}`;
  window.history.replaceState(window.history.state, "", nextUrl);

  return { userId, otp, companyCode };
}
