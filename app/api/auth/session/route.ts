import {
  SESSION_COOKIE_NAME,
  createSessionToken,
  getSessionFromRequest,
  getSessionMaxAgeSeconds,
} from "@/lib/server/auth-session";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const signInSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(200),
});

function getSupabaseAuthConfig() {
  const url =
    process.env.SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    "";
  const anonKey =
    process.env.SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    "";

  return { url: url.trim(), anonKey: anonKey.trim() };
}

const DEMO_PROFILES = [
  {
    email: "professional@diabpredict.local",
    password: "DiabPredict2025!",
    name: "Demo Professional",
  },
  {
    email: "admin@diabpredict.local",
    password: "ClinicalAdmin2025!",
    name: "Clinical Admin",
  },
] as const;

function getLocalDemoSession(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const profile = DEMO_PROFILES.find((entry) => entry.email === normalizedEmail);
  if (!profile) return null;
  return {
    userId: `local-${profile.email.replace(/[^a-z0-9]/gi, "").slice(0, 20)}`,
    name: profile.name,
  };
}

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request);
  return NextResponse.json({ session });
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const parsedPayload = signInSchema.safeParse(payload);

    if (!parsedPayload.success) {
      return NextResponse.json({ error: "Invalid sign-in payload" }, { status: 400 });
    }

    const email = parsedPayload.data.email.trim().toLowerCase();
    const password = parsedPayload.data.password;

    const { url, anonKey } = getSupabaseAuthConfig();
    const isProduction = process.env.NODE_ENV === "production";
    if (!url || !anonKey) {
      if (!isProduction) {
        const demoProfile = DEMO_PROFILES.find(
          (entry) => entry.email === email && entry.password === password
        );
        if (demoProfile) {
          const session = {
            userId: `local-${demoProfile.email.replace(/[^a-z0-9]/gi, "").slice(0, 20)}`,
            name: demoProfile.name,
          };
          const token = createSessionToken(session);
          const response = NextResponse.json({ session }, { status: 201 });
          response.cookies.set({
            name: SESSION_COOKIE_NAME,
            value: token,
            httpOnly: true,
            sameSite: "lax",
            secure: isProduction,
            path: "/",
            maxAge: getSessionMaxAgeSeconds(),
          });
          return response;
        }
      }

      const fallbackMessage =
        process.env.NODE_ENV === "production"
          ? "Secure authentication is not configured in this deployment. Add SUPABASE_URL and SUPABASE_ANON_KEY, or configure the professional sign-in provider before continuing."
          : "Secure authentication is not configured for this environment. Use the local demo profile or add the Supabase values in your environment.";

      return NextResponse.json({ error: fallbackMessage }, { status: 503 });
    }

    const supabase = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error || !data.user) {
      if (error?.status === 400 || error?.code === "invalid_credentials") {
        return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
      }

      console.error("Supabase sign-in failed:", {
        message: error?.message,
        status: error?.status,
        code: error?.code,
      });
      return NextResponse.json(
        {
          error:
            "Supabase authentication is temporarily unavailable. Check that the Supabase project is active and that its URL and anon key are current.",
        },
        { status: 503 }
      );
    }

    const name =
      typeof data.user.user_metadata?.full_name === "string"
        ? data.user.user_metadata.full_name
        : data.user.email || "Professional";
    const session = {
      userId: data.user.id,
      name,
    };
    const token = createSessionToken(session);

    const response = NextResponse.json({ session }, { status: 201 });
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: getSessionMaxAgeSeconds(),
    });

    return response;
  } catch (error) {
    console.error("Failed to create session:", error);
    return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
