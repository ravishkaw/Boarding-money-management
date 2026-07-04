import { ImportForm } from "./import-form";

export default function ImportPage() {
  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Import a bill</h1>
      <ImportForm />
    </main>
  );
}
