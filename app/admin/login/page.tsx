import { login } from "./actions";

export const instant = false;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto max-w-sm px-5 py-20">
      <p className="text-sm font-medium tracking-wide text-brand">Area admin</p>
      <h1 className="mt-3 font-serif text-3xl leading-tight">Masuk</h1>

      {error && (
        <p
          role="alert"
          className="mt-5 rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger"
        >
          Kata sandi salah.
        </p>
      )}

      <form action={login} className="mt-6 space-y-4">
        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
            Kata sandi
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="h-12 w-full rounded-lg border border-line bg-white px-3.5 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        </div>
        <button
          type="submit"
          className="h-12 w-full rounded-lg bg-brand font-semibold text-white transition hover:bg-brand-dark"
        >
          Masuk
        </button>
      </form>
    </main>
  );
}