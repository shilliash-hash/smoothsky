import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/game/Logo";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Nowe hasło — SmoothSky" },
      { name: "description", content: "Ustaw nowe hasło do konta SmoothSky." },
      { property: "og:title", content: "Nowe hasło — SmoothSky" },
      { property: "og:description", content: "Ustaw nowe hasło do konta SmoothSky." },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return toast.error("Hasło musi mieć co najmniej 8 znaków");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Hasło zmienione");
    navigate({ to: "/dashboard" });
  }
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <form onSubmit={submit} className="instrument w-full max-w-md space-y-4 p-6">
        <Logo />
        <h1 className="text-xl font-semibold">Ustaw nowe hasło</h1>
        <div className="space-y-2">
          <Label htmlFor="pw">Nowe hasło</Label>
          <Input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <Button type="submit" className="w-full" disabled={busy}>Zapisz hasło</Button>
      </form>
    </div>
  );
}
