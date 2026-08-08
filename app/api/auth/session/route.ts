import {
  SESSION_COOKIE_NAME,
  createSessionToken,
  createUserId,
  getSessionFromRequest,
  getSessionMaxAgeSeconds,
} from "@/lib/server/auth-session";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const signInSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(40, "Name must be at most 40 characters"),
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

    const name = parsedPayload.data.name;
    const session = {
      userId: createUserId(name),
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
