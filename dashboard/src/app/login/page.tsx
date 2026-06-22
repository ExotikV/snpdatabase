"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormField, Input } from "@/components/ui/FormField";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Login failed");
      }

      const from = searchParams.get("from") || "/";
      router.push(from);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col bg-background">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-accent-muted/40 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-muted-bg blur-3xl" />
      </div>

      <div className="relative flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-sm font-bold tracking-wider text-white shadow-[var(--shadow-card)]">
              SNP
            </div>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
              SNP Detailing
            </h1>
            <p className="mt-1 text-sm text-muted">Internal SMS operations dashboard</p>
          </div>

          <Card padding="lg">
            <p className="text-sm text-muted">
              Sign in with the shared dashboard password to manage maintenance reminders.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <FormField label="Password">
                <Input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                />
              </FormField>

              {error ? <Alert variant="error">{error}</Alert> : null}

              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "Signing in..." : "Sign in"}
              </Button>
            </form>
          </Card>

          <p className="mt-6 text-center text-xs text-muted">
            snpdetailing.ca · Authorized team access only
          </p>
        </div>
      </div>
    </div>
  );
}
