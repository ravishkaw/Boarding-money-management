import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const people = db
    .select({ id: schema.persons.id, name: schema.persons.name })
    .from(schema.persons)
    .orderBy(asc(schema.persons.displayOrder))
    .all();

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 p-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold">Boarding</h1>
        <p className="mt-1 text-zinc-500">Who are you?</p>
      </div>
      <LoginForm people={people} />
    </main>
  );
}
