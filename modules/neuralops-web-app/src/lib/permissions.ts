// Display gating by COMPANY role (connection.role: owner | admin | member |
// viewer). The server enforces every action; these helpers only decide what
// to show. Owner/Admin manage; Viewer is read-only.

export type CompanyRole = string | null | undefined;

export const isCompanyAdmin = (role: CompanyRole) => role === "owner" || role === "admin";

export const isViewer = (role: CompanyRole) => role === "viewer";
