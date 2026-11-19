import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Logo } from "@/components/game/Logo";
import { GoogleButton } from "@/components/game/GoogleButton";

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  head: () => ({
    meta: [
      { title: "Logowanie — SmoothSky" },
      { name: "description", content: "Zaloguj się lub zarejestruj, aby zarządzać swoją linią lotniczą w SmoothSky." },
      { property: "og:title", content: "Logowanie — SmoothSky" },
      { property: "og:description", content: "Dostęp do panelu linii lotniczej SmoothSky." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) navigate({ to: "/dashboard", replace: true });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) toast.error(error.message === "Invalid login credentials" ? "Nieprawidłowy email lub hasło" : error.message);
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { toast.error("Hasło musi mieć co najmniej 8 znaków"); return; }
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + "/auth" } });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    if (!data.session) setSent(true);
  }

  async function forgot() {
    if (!email) { toast.error("Wpisz najpierw adres email"); return; }
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + "/reset-password" });
    if (error) toast.error(error.message);
    else toast.success("Wysłaliśmy link do zmiany hasła");
  }

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center"><Logo /></div>
        <div className="instrument p-6">
          {sent ? (
            <div className="space-y-3 text-center">
              <p className="readout text-xs uppercase text-amber">Oczekiwanie na potwierdzenie</p>
              <h2 className="text-xl font-semibold">Sprawdź skrzynkę email</h2>
              <p className="text-sm text-muted-foreground">Wysłaliśmy link aktywacyjny na <span className="text-foreground">{email}</span>. Po kliknięciu wrócisz tutaj zalogowany.</p>
            </div>
          ) : (
            <Tabs defaultValue="signin">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Logowanie</TabsTrigger>
                <TabsTrigger value="signup">Rejestracja</TabsTrigger>
              </TabsList>
              {(["signin", "signup"] as const).map((mode) => (
                <TabsContent key={mode} value={mode}>
                  <form onSubmit={mode === "signin" ? signIn : signUp} className="mt-4 space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor={`${mode}-email`}>Email</Label>
                      <Input id={`${mode}-email`} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`${mode}-pw`}>Hasło</Label>
                      <Input id={`${mode}-pw`} type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                    </div>
                    <Button type="submit" className="w-full" disabled={busy}>
                      {mode === "signin" ? "Zaloguj się" : "Utwórz konto"}
                    </Button>
                    {mode === "signin" && (
                      <button type="button" onClick={forgot} className="w-full text-xs text-muted-foreground hover:text-primary">Nie pamiętasz hasła?</button>
                    )}
                  </form>
                </TabsContent>
              ))}
              <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground"><div className="h-px flex-1 bg-border" />lub<div className="h-px flex-1 bg-border" /></div>
              <GoogleButton />
            </Tabs>
          )}
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground"><Link to="/" className="hover:text-primary">← Powrót</Link></p>
      </div>
    </div>
  );
}
