export type ExportEmailAccount = {
  email: string | null;
  loginEmail?: string | null;
  retailerLogins?: Array<{ retailer: string; loginEmail?: string | null }>;
};

export function resolveExportEmail(account: ExportEmailAccount, selectedRetailer?: string | null): string {
  const normalizedSelectedRetailer = selectedRetailer?.trim().toLowerCase();

  if (normalizedSelectedRetailer) {
    const matchingLogin = account.retailerLogins?.find(
      (login) => login.retailer.trim().toLowerCase() === normalizedSelectedRetailer,
    );

    if (matchingLogin?.loginEmail?.trim()) {
      return matchingLogin.loginEmail.trim();
    }
  }

  if (account.loginEmail?.trim()) {
    return account.loginEmail.trim();
  }

  return account.email?.trim() || "";
}
