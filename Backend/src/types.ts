export type Role = "superadmin" | "admin" | "employee";

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  employeeId?: string;
  /** API-relative path of the profile picture (e.g. "/avatars/<id>?v=123"), or null. */
  avatarUrl: string | null;
}
