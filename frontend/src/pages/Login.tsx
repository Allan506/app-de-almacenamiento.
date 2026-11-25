import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Fingerprint,
  HardDrive,
  Link2,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { api, ApiError, type AuthConfig } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { Logo } from "../components/Logo";

const FEATURES = [
  { icon: HardDrive, title: "Espacio sin limites", text: "Sin cuotas artificiales: guarda todo lo que necesites." },
  { icon: Lock, title: "Acceso sin contrasenas", text: "Codigos de un solo uso enviados a tu correo." },
  { icon: Link2, title: "Comparte en un clic", text: "Enlaces con contrasena, caducidad y control de descargas." },
];

export function Login() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const toast = useToast();
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [digits, setDigits] = useState<string[]>([]);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [isNewUser, setIsNewUser] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  const length = config?.otp_length ?? 6;

  useEffect(() => {
    api
      .config()
      .then((value) => {
        setConfig(value);
        setDigits(Array.from({ length: value.otp_length }, () => ""));
      })
      .catch(() => setDigits(Array.from({ length: 6 }, () => "")));
  }, []);

  useEffect(() => {
    if (seconds <= 0) return;
    const timer = window.setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [seconds]);

  const channelLabel = useMemo(() => {
    switch (config?.channel) {
      case "email":
        return "correo electronico";
      case "telegram":
        return "Telegram";
      default:
        return "la consola del servidor";
    }
  }, [config?.channel]);

  const requestCode = async (event?: React.FormEvent) => {
    event?.preventDefault();
    setError(null);
    if (!/^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$/.test(email.trim())) {
      setError("Introduce un correo electronico valido");
      return;
    }
    setBusy(true);
    try {
      const result = await api.requestOtp(email.trim().toLowerCase());
      setStep("code");
      setDevCode(result.dev_code);
      setIsNewUser(result.is_new_user);
      setSeconds(result.resend_after);
      setDigits(Array.from({ length }, () => ""));
      toast.success("Codigo enviado", result.dev_code ? "Modo desarrollo: usa el codigo que aparece abajo." : `Revisa ${channelLabel} para continuar.`);
      window.setTimeout(() => inputs.current[0]?.focus(), 120);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo enviar el codigo");
    } finally {
      setBusy(false);
    }
  };

  const verify = async (code: string) => {
    setError(null);
    setBusy(true);
    try {
      const result = await api.verifyOtp(email.trim().toLowerCase(), code);
      signIn(result.access_token, result.user);
      toast.success(
        result.is_new_user ? `Bienvenido, ${result.user.display_name}` : `Hola de nuevo, ${result.user.display_name}`,
        result.is_new_user ? "Tu espacio personal ya esta listo." : "Tu sesion se ha restaurado.",
      );
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo verificar el codigo");
      setDigits(Array.from({ length }, () => ""));
      inputs.current[0]?.focus();
    } finally {
      setBusy(false);
    }
  };

  const handleDigit = (index: number, value: string) => {
    const clean = value.replace(/\D/g, "");
    if (!clean) {
      const next = [...digits];
      next[index] = "";
      setDigits(next);
      return;
    }
    const next = [...digits];
    clean.split("").forEach((char, offset) => {
      if (index + offset < length) next[index + offset] = char;
    });
    setDigits(next);
    const target = Math.min(index + clean.length, length - 1);
    inputs.current[target]?.focus();

    const joined = next.join("");
    if (joined.length === length && !joined.includes("")) void verify(joined);
  };

  const handleKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && !digits[index] && index > 0) inputs.current[index - 1]?.focus();
    if (event.key === "ArrowLeft" && index > 0) inputs.current[index - 1]?.focus();
    if (event.key === "ArrowRight" && index < length - 1) inputs.current[index + 1]?.focus();
    if (event.key === "Enter" && digits.join("").length === length) void verify(digits.join(""));
  };

  const handlePaste = (event: React.ClipboardEvent) => {
    const text = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!text) return;
    event.preventDefault();
    const next = Array.from({ length }, (_, index) => text[index] ?? "");
    setDigits(next);
    if (text.length === length) void verify(text);
  };

  return (
    <div className="relative min-h-full overflow-hidden">
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-cloud-500/25 blur-[120px]" />
      <div className="pointer-events-none absolute -right-24 top-1/3 h-80 w-80 rounded-full bg-violet-500/20 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-sky-500/15 blur-[110px]" />

      <div className="relative mx-auto grid min-h-screen w-full max-w-6xl items-center gap-12 px-5 py-10 lg:grid-cols-[1.05fr_.95fr] lg:px-8">
        <section className="hidden flex-col justify-center lg:flex">
          <Logo size="lg" />
          <h1 className="mt-10 text-4xl font-bold leading-[1.15] tracking-tight text-white xl:text-[44px]">
            Tu nube personal,
            <br />
            <span className="bg-gradient-to-r from-cloud-300 via-violet-300 to-sky-300 bg-clip-text text-transparent">
              sin limites y sin friccion.
            </span>
          </h1>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-slate-400">
            Sube, organiza y comparte archivos con un acceso moderno basado en codigos de un solo uso. Sin contrasenas que
            recordar, sin cuotas que te frenen.
          </p>

          <div className="mt-10 space-y-4">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex items-start gap-3.5">
                <div className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-cloud-300">
                  <Icon className="h-[18px] w-[18px]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-100">{title}</p>
                  <p className="text-[13px] leading-relaxed text-slate-500">{text}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> Cifrado en transito
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1">
              <Zap className="h-3.5 w-3.5 text-amber-300" /> Subidas reanudables
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1">
              <Sparkles className="h-3.5 w-3.5 text-violet-300" /> Sin publicidad
            </span>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[430px]">
          <div className="mb-7 flex justify-center lg:hidden">
            <Logo size="lg" />
          </div>

          <div className="card relative overflow-hidden p-6 shadow-glow sm:p-8">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cloud-400/60 to-transparent" />

            <div className="mb-6 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-cloud-300">
              <Fingerprint className="h-4 w-4" />
              Acceso seguro
            </div>

            {step === "email" ? (
              <form onSubmit={requestCode} className="space-y-5">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-white">Entra en tu nube</h2>
                  <p className="mt-1.5 text-sm text-slate-400">
                    Te enviaremos un codigo de un solo uso. Si es tu primera vez, creamos tu cuenta al instante.
                  </p>
                </div>

                <div>
                  <label className="label" htmlFor="email">
                    Correo electronico
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-500" />
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      autoFocus
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="tu@correo.com"
                      className="field pl-11"
                      required
                    />
                  </div>
                </div>

                {error && (
                  <p className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</p>
                )}

                <button type="submit" className="btn-primary w-full" disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  {busy ? "Enviando codigo..." : "Continuar con el codigo"}
                </button>

                <p className="text-center text-[11px] leading-relaxed text-slate-500">
                  Al continuar aceptas el uso de cookies tecnicas para mantener tu sesion activa.
                </p>
              </form>
            ) : (
              <div className="space-y-5">
                <button
                  onClick={() => {
                    setStep("email");
                    setError(null);
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 transition hover:text-white"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Cambiar correo
                </button>

                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-white">Revisa tu codigo</h2>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
                    Enviamos un codigo de {length} digitos a <span className="font-medium text-slate-200">{email}</span> por{" "}
                    {channelLabel}.
                    {isNewUser && " Crearemos tu cuenta al verificar."}
                  </p>
                </div>

                {devCode && (
                  <div className="rounded-xl border border-amber-400/25 bg-amber-400/10 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-300">Modo desarrollo</p>
                    <div className="mt-1.5 flex items-center justify-between gap-3">
                      <p className="font-mono text-lg font-bold tracking-[0.3em] text-amber-100">{devCode}</p>
                      <button
                        type="button"
                        className="rounded-lg bg-amber-400/20 px-2.5 py-1 text-[11px] font-semibold text-amber-100 transition hover:bg-amber-400/30"
                        onClick={() => {
                          setDigits(devCode.split("").slice(0, length));
                          void verify(devCode);
                        }}
                      >
                        Usar codigo
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex justify-between gap-2" onPaste={handlePaste}>
                  {Array.from({ length }).map((_, index) => (
                    <input
                      key={index}
                      ref={(element) => {
                        inputs.current[index] = element;
                      }}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={1}
                      value={digits[index] ?? ""}
                      onChange={(event) => handleDigit(index, event.target.value)}
                      onKeyDown={(event) => handleKeyDown(index, event)}
                      className="h-14 w-full rounded-xl border border-white/10 bg-ink-900/80 text-center text-xl font-bold text-white
                        transition focus:border-cloud-400/70 focus:outline-none focus:ring-2 focus:ring-cloud-500/25"
                      aria-label={`Digito ${index + 1}`}
                    />
                  ))}
                </div>

                {error && (
                  <p className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</p>
                )}

                <button
                  className="btn-primary w-full"
                  onClick={() => void verify(digits.join(""))}
                  disabled={busy || digits.join("").length !== length}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {busy ? "Verificando..." : "Verificar y entrar"}
                </button>

                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>{seconds > 0 ? `Puedes reenviar en ${seconds}s` : "No recibiste el codigo?"}</span>
                  <button
                    className="font-semibold text-cloud-300 transition hover:text-cloud-200 disabled:opacity-40"
                    onClick={() => void requestCode()}
                    disabled={seconds > 0 || busy}
                  >
                    Reenviar
                  </button>
                </div>
              </div>
            )}
          </div>

          <p className="mt-6 text-center text-[11px] text-slate-600">
            Nube · Almacenamiento personal con acceso por OTP
          </p>
        </section>
      </div>
    </div>
  );
}
