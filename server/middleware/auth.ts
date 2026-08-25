import { Request, Response, NextFunction } from "express";
import { adminAuth } from "../firebaseAdmin";

declare global {
  namespace Express {
    interface Request {
      uid?: string;
      userEmail?: string | null;
    }
  }
}

async function resolveBearerUid(req: Request): Promise<{ uid: string; email: string | null } | null> {
  const header = req.headers.authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(match[1]);
    return { uid: decoded.uid, email: decoded.email || null };
  } catch (err: any) {
    console.warn("verifyIdToken failed:", err?.message || err);
    return null;
  }
}

// Rejects the request unless a valid Firebase ID token is present.
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const resolved = await resolveBearerUid(req);
  if (!resolved) {
    return res.status(401).json({ error: "Missing or invalid authentication token." });
  }
  req.uid = resolved.uid;
  req.userEmail = resolved.email;
  next();
}

// Attaches req.uid when a valid token is present, but never rejects the request.
// Used for endpoints that must remain accessible to guests (e.g. public trip codes).
export async function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const resolved = await resolveBearerUid(req);
  if (resolved) {
    req.uid = resolved.uid;
    req.userEmail = resolved.email;
  }
  next();
}
