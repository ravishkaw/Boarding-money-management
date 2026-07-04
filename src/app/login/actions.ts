"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { setSessionCookie, verifyPin } from "@/lib/auth";

export type LoginState = { error?: string };

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const personId = Number(formData.get("personId"));
  const pin = String(formData.get("pin") ?? "");

  if (!Number.isInteger(personId) || !/^\d{4,6}$/.test(pin)) {
    return { error: "Pick your name and enter your PIN." };
  }

  const person = db
    .select()
    .from(schema.persons)
    .where(eq(schema.persons.id, personId))
    .get();

  if (!person || !verifyPin(pin, person.pinHash)) {
    return { error: "Wrong PIN. Try again." };
  }

  await setSessionCookie({ personId: person.id, name: person.name });
  redirect("/");
}

export async function logout(): Promise<void> {
  const { clearSessionCookie } = await import("@/lib/auth");
  await clearSessionCookie();
  redirect("/login");
}
