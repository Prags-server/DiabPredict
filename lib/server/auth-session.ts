import { createHash, createHmac, timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";

export type UserSession = {
  userId: string;
  name: string;
};

export const SESSION_COOKIE_NAME = "diabpredict_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const SESSION_MAX_AGE_MILLISECONDS = SESSION_MAX_AGE_SECONDS * 1000;
const DEV_FALLBACK_SECRET = "dev-only-session-secret-change-in-production";

type SessionPayload = UserSession & {
  iat: number;
  exp: number;
};

function getSessionSecret(): string {
  const configuredSecret = process.env.SESSION_SECRET;

  if (process.env.NODE_ENV === "production" && !configuredSecret) {
    throw new Error("SESSION_SECRET must be set in production.");
  }

  return configuredSecret || DEV_FALLBACK_SECRET;
}

function signPayload(payload: string): string {
  return createHmac("sha256", getSessionSecret())
    .update(payload)
    .digest("base64url");
}

export function createUserId(name: string): string {
  return createHash("sha256")
    .update(name.trim().toLowerCase())
    .digest("hex")
    .slice(0, 24);
}

export function createSessionToken(session: UserSession): string {
  const payload: SessionPayload = {
    userId: session.userId,
    name: session.name,
    iat: Date.now(),
    exp: Date.now() + SESSION_MAX_AGE_MILLISECONDS,
  };

  const payloadBase64 = Buffer.from(JSON.stringify(payload), "utf-8").toString(
    "base64url"
  );
  const signature = signPayload(payloadBase64);
  return `${payloadBase64}.${signature}`;
}

export function parseSessionToken(token: string): UserSession | null {
  const [payloadBase64, signature] = token.split(".");
  if (!payloadBase64 || !signature) {
    return null;
  }

  const expectedSignature = signPayload(payloadBase64);
  const providedBuffer = Buffer.from(signature, "utf-8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf-8");

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const decodedPayload = JSON.parse(
      Buffer.from(payloadBase64, "base64url").toString("utf-8")
    ) as SessionPayload;

    if (
      !decodedPayload.userId ||
      !decodedPayload.name ||
      typeof decodedPayload.exp !== "number"
    ) {
      return null;
    }

    if (Date.now() > decodedPayload.exp) {
      return null;
    }

    return {
      userId: decodedPayload.userId,
      name: decodedPayload.name,
    };
  } catch {
    return null;
  }
}

export function getSessionFromRequest(request: NextRequest): UserSession | null {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }

  return parseSessionToken(token);
}

export function getSessionMaxAgeSeconds(): number {
  return SESSION_MAX_AGE_SECONDS;
}
