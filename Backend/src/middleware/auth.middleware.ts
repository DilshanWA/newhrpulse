import type { NextFunction, Request, Response } from "express";
import { fromNodeHeaders } from "better-auth/node";
import type { AuthenticatedUser, Role } from "../types.js";
import { isAllowedLoginEmail } from "../config/env.js";
import { auth } from "../auth.js";
import { resolveAppUser } from "../services/user.service.js";

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session) return res.status(401).json({ error: "Authentication required" });

    const email = session.user.email.trim().toLowerCase();
    if (!isAllowedLoginEmail(email)) {
      return res.status(403).json({ error: "Microsoft account is not authorised", code: "email_not_allowed" });
    }

    const account = await resolveAppUser(email);
    if (!account.ok) return res.status(403).json({ error: account.message, code: account.code });

    req.user = account.user;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}
