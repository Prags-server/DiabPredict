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

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      return NextResponse.json(
        { error: "Secure authentication is not configured." },
        { status: 503 }
      );
    }

    const supabase = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await supabase.auth.signInWithPassword(parsedPayload.data);
    if (error || !data.user) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
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
