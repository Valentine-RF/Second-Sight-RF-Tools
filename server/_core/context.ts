import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { Request, Response, NextFunction } from "express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: User | null;
    }
  }
}

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}

/**
 * Express middleware to attach authenticated user to request object
 * Used for non-tRPC routes that need authentication
 */
export async function attachUserToRequest(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    req.user = await sdk.authenticateRequest(req);
  } catch (error) {
    req.user = null;
  }
  next();
}
