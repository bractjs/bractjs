import { GoogleIcon, MicrosoftIcon } from "./BrandIcons.tsx";

/** "or" divider + Google/Microsoft buttons, rendered only for configured providers. */
export function OAuthButtons({ providers }: { providers: { google: boolean; microsoft: boolean } }) {
  if (!providers.google && !providers.microsoft) return null;
  return (
    <>
      <div className="my-5 flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-200" />
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">or</span>
        <div className="h-px flex-1 bg-slate-200" />
      </div>
      <div className="grid gap-2.5">
        {providers.google && (
          <a
            href="/api/auth/google/start"
            className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <GoogleIcon /> Continue with Google
          </a>
        )}
        {providers.microsoft && (
          <a
            href="/api/auth/microsoft/start"
            className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <MicrosoftIcon /> Continue with Microsoft
          </a>
        )}
      </div>
    </>
  );
}
