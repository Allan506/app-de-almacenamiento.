import { Cloud, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Landing } from "./components/Landing";
import { Setup } from "./components/Setup";
import { ToastProvider, useToast } from "./components/Toasts";
import { clearConfig, normalizeConfig, readConfig, writeConfig } from "./lib/config";
import { Vault } from "./lib/library";
import type { VaultConfig } from "./lib/types";
import { Drive } from "./pages/Drive";

type Session = { config: VaultConfig; vault: Vault };
type Visitor = "landing" | "onboarding";

function Splash() {
  return (
    <div className="grid h-full place-items-center">
      <div className="flex flex-col items-center gap-4">
        <div className="grid h-14 w-14 place-items-center rounded-3xl bg-gradient-to-br from-cloud-400 via-cloud-500 to-violet-500 text-white shadow-xl shadow-cloud-600/30">
          <Cloud className="h-7 w-7" strokeWidth={2.2} />
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Abriendo tu nube...
        </div>
      </div>
    </div>
  );
}

function Shell() {
  const toast = useToast();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [visitor, setVisitor] = useState<Visitor>("landing");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stored = await readConfig();
        if (!stored) {
          if (!cancelled) setSession(null);
          return;
        }
        const config = normalizeConfig(stored);
        const vault = await Vault.open(config);
        if (!cancelled) setSession({ config, vault });
      } catch (error) {
        if (cancelled) return;
        toast.error("No se pudo abrir tu nube", error instanceof Error ? error.message : undefined);
        setSession(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const start = useCallback(async (config: VaultConfig) => {
    await writeConfig(config);
    const vault = await Vault.open(config);
    setSession({ config, vault });
  }, []);

  const update = useCallback(async (config: VaultConfig) => {
    await writeConfig(config);
    const vault = await Vault.open(config);
    setSession({ config, vault });
  }, []);

  const disconnect = useCallback(async () => {
    if (session) await session.vault.wipe();
    else await clearConfig();
    setVisitor("landing");
    setSession(null);
    toast.info("Datos borrados", "Ya puedes crear otra nube en este navegador.");
  }, [session, toast]);

  if (session === undefined) return <Splash />;

  if (session === null) {
    return visitor === "landing" ? (
      <Landing
        onStart={() => {
          setVisitor("onboarding");
          window.scrollTo({ top: 0 });
        }}
      />
    ) : (
      <Setup onReady={start} />
    );
  }

  return (
    <Drive
      key={`${session.config.driver}-${session.config.chat_id}-${session.config.chunk_bytes}`}
      vault={session.vault}
      config={session.config}
      onConfigChange={update}
      onDisconnect={disconnect}
    />
  );
}

export function App() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  );
}
