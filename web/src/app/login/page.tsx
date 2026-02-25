"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, setToken } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleRequestOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await apiFetch("/portal/auth/magic-link", {
        method: "POST",
        body: { email },
      });
      setStep("otp");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/portal/auth/verify", {
        method: "POST",
        body: { email, otp },
      });
      setToken(res.token);
      // Redirect based on whether user is new
      if (res.is_new) {
        router.push("/onboarding");
      } else {
        router.push("/dashboard");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <div className="card max-w-sm w-full mx-4">
        <div className="text-center mb-8">
          <a href="/" className="font-serif text-2xl font-medium">
            know.help
          </a>
          <p className="text-sm text-muted mt-2">Sign in to your account</p>
        </div>

        {step === "email" ? (
          <form onSubmit={handleRequestOtp}>
            <label className="label">Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              className="input mb-4"
              autoFocus
            />
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full"
            >
              {loading ? "Sending..." : "Send magic link"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp}>
            <p className="text-sm text-muted mb-4">
              We sent a 6-digit code to <strong>{email}</strong>
            </p>
            <label className="label">Verification code</label>
            <input
              type="text"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              required
              maxLength={6}
              className="input mb-4 text-center text-2xl tracking-[0.5em]"
              autoFocus
            />
            <button
              type="submit"
              disabled={loading || otp.length < 6}
              className="btn-primary w-full"
            >
              {loading ? "Verifying..." : "Verify"}
            </button>
            <button
              type="button"
              onClick={() => setStep("email")}
              className="text-sm text-muted hover:text-text mt-3 block mx-auto"
            >
              Use a different email
            </button>
          </form>
        )}

        {error && <p className="text-red-600 text-sm mt-3 text-center">{error}</p>}
      </div>
    </div>
  );
}
