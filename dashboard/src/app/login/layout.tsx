import { Suspense } from "react";
import LoginPage from "./page";

export default function LoginRoute() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-full items-center justify-center bg-zinc-50 px-4">
          <p className="text-sm text-zinc-500">Loading...</p>
        </div>
      }
    >
      <LoginPage />
    </Suspense>
  );
}
