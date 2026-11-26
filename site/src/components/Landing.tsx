import {
  ArrowRight,
  Check,
  Cloud,
  Download,
  FolderTree,
  Infinity as InfinityIcon,
  Layers,
  Lock,
  MonitorSmartphone,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  WifiOff,
  Zap,
} from "lucide-react";
import { useInstallPrompt, promptInstall } from "../lib/pwa";

const FEATURES = [
  {
    icon: InfinityIcon,
    title: "Espacio sin limite",
    text: "No hay planes ni cuotas. Tu nube usa el almacenamiento que ya tienes en tu cuenta de Telegram.",
  },
  {
    icon: Zap,
    title: "Sin ancho de banda",
    text: "Las descargas van de los servidores de Telegram a tu navegador. Nube no intermedia ni limita el trafico.",
  },
  {
    icon: FolderTree,
    title: "Carpetas de verdad",
    text: "Arrastra carpetas enteras, mueve archivos, renombra y ordena como en tu explorador de siempre.",
  },
  {
    icon: Search,
    title: "Todo a mano",
    text: "Busqueda instantanea, favoritos y recientes. La papelera guarda lo borrado antes de eliminarlo.",
  },
  {
    icon: Download,
    title: "Descargas y ZIP",
    text: "Descarga un archivo o una carpeta completa comprimida en el navegador, sin servidores intermedios.",
  },
  {
    icon: MonitorSmartphone,
    title: "En todos tus equipos",
    text: "Instalala como app y usa el mismo chat en movil y escritorio. El indice se puede exportar.",
  },
];

const STEPS = [
  {
    title: "Crea tu espacio",
    text: "En menos de un minuto. Nube te guia para conectar tu disco en la nube; no hay registro ni tarjeta.",
  },
  {
    title: "Sube lo que quieras",
    text: "Arrastra archivos o carpetas. Los grandes se trocean automaticamente y se guardan en tu espacio.",
  },
  {
    title: "Accede desde donde estes",
    text: "Vista previa, descargas y ZIP. Instala Nube en tu pantalla de inicio y olvidate de cables y discos.",
  },
];

const FAQ = [
  {
    q: "Nube es un bot?",
    a: "No. Nube es una aplicacion web (instalable) con carpetas, busqueda, papelera y vista previa. Detras usa tu propio espacio de Telegram como disco, porque es el almacenamiento gratuito e ilimitado mas fiable que existe. Tu no hablas con ningun bot: usas la app.",
  },
  {
    q: "Donde estan mis archivos?",
    a: "En un chat privado de tu cuenta de Telegram. Nube solo guarda el indice (nombres, carpetas, favoritos) en tu navegador. Si quieres, puedes abrir ese chat y ver los archivos directamente.",
  },
  {
    q: "Hay limite de espacio o de descargas?",
    a: "No. El limite es tu cuenta de Telegram, no un plan de Nube. Las descargas se hacen desde los servidores de Telegram, asi que no consumen ancho de banda de ningun servidor nuestro.",
  },
  {
    q: "Cuanto cuesta?",
    a: "Nada. La app es estatica y vive en GitHub Pages; el disco es tu cuenta gratuita de Telegram. No hay suscripciones ni anuncios.",
  },
];

export function Landing({ onStart }: { onStart: () => void }) {
  const canInstall = useInstallPrompt();

  return (
    <div className="h-full overflow-y-auto">
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-ink-950/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-2xl bg-gradient-to-br from-cloud-400 via-cloud-500 to-violet-500 text-white shadow-lg shadow-cloud-600/30">
              <Cloud className="h-4.5 w-4.5" strokeWidth={2.2} />
            </div>
            <div className="leading-tight">
              <p className="text-[15px] font-bold tracking-tight text-white">Nube</p>
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">Almacenamiento</p>
            </div>
          </div>

          <nav className="ml-6 hidden items-center gap-5 text-[13px] font-medium text-slate-400 md:flex">
            <a className="transition hover:text-white" href="#funciones">
              Funciones
            </a>
            <a className="transition hover:text-white" href="#como-funciona">
              Como funciona
            </a>
            <a className="transition hover:text-white" href="#preguntas">
              Preguntas
            </a>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {canInstall && (
              <button className="btn-ghost hidden px-3 py-2 text-[13px] sm:inline-flex" onClick={() => void promptInstall()}>
                <Smartphone className="h-4 w-4" /> Instalar
              </button>
            )}
            <button className="btn-primary px-3.5 py-2 text-[13px]" onClick={onStart}>
              Abrir mi nube <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-10 px-4 pb-14 pt-10 sm:px-6 lg:grid-cols-[1.03fr_0.97fr] lg:items-center lg:pt-16">
        <div className="animate-fade-up">
          <span className="inline-flex items-center gap-2 rounded-full border border-cloud-400/30 bg-cloud-500/10 px-3 py-1 text-[11px] font-semibold text-cloud-200">
            <Sparkles className="h-3.5 w-3.5" /> Gratis, sin cuotas y sin anuncios
          </span>

          <h1 className="mt-5 text-4xl font-extrabold leading-[1.04] tracking-tight text-white sm:text-5xl lg:text-[56px]">
            Tu nube personal,
            <br />
            <span className="bg-gradient-to-r from-cloud-300 via-cloud-400 to-violet-400 bg-clip-text text-transparent">
              ilimitada de verdad.
            </span>
          </h1>

          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-slate-400">
            Una aplicacion completa para guardar, ordenar y descargar tus archivos sin pagar por espacio ni por
            trafico. Sin cuentas nuevas, sin servidores propios y sin limites artificiales.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <button className="btn-primary px-5 py-3 text-sm" onClick={onStart}>
              Crear mi nube gratis <ArrowRight className="h-4 w-4" />
            </button>
            <a className="btn-ghost px-5 py-3 text-sm" href="#como-funciona">
              Ver como funciona
            </a>
          </div>

          <ul className="mt-6 grid gap-1.5 text-[12px] text-slate-400 sm:grid-cols-2">
            {["Sin tarjeta ni registro", "Carpetas, papelera y favoritos", "Descargas directas, sin esperas", "Instalable como app"].map(
              (item) => (
                <li key={item} className="flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" /> {item}
                </li>
              ),
            )}
          </ul>
        </div>

        <div className="animate-scale-in">
          <div className="relative rounded-[26px] border border-white/10 bg-ink-900/70 p-2 shadow-2xl shadow-ink-950/60">
            <div className="flex items-center gap-1.5 px-2 pb-2 pt-1">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-400/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
              <span className="ml-2 truncate rounded-md bg-white/[0.04] px-2 py-0.5 text-[10px] text-slate-500">
                nube.app/mi-unidad
              </span>
            </div>
            <img
              src="./app-preview.png"
              alt="Interfaz de Nube con carpetas y archivos"
              className="w-full rounded-[18px] border border-white/[0.06]"
              loading="eager"
            />
            <div className="absolute -bottom-4 left-6 flex items-center gap-2 rounded-xl border border-white/10 bg-ink-850/95 px-3 py-2 shadow-xl backdrop-blur">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500/15 text-emerald-300">
                <InfinityIcon className="h-4 w-4" />
              </span>
              <div className="leading-tight">
                <p className="text-[11px] font-semibold text-white">Espacio ilimitado</p>
                <p className="text-[10px] text-slate-500">Sin cuotas mensuales</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-white/[0.06] bg-white/[0.015]">
        <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-8 sm:px-6 lg:grid-cols-4">
          {[
            { value: "0 EUR", label: "de cuota mensual" },
            { value: "Ilimitado", label: "espacio y descargas" },
            { value: "100 %", label: "en tu navegador" },
            { value: "1 min", label: "para empezar" },
          ].map((item) => (
            <div key={item.label}>
              <dt className="text-2xl font-extrabold tracking-tight text-white">{item.value}</dt>
              <dd className="mt-0.5 text-[11px] uppercase tracking-wider text-slate-500">{item.label}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section id="funciones" className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Todo lo que esperas de una nube</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          Nube no es un experimento: es una app de almacenamiento con las funciones que usas cada dia.
        </p>
        <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <article key={title} className="card p-4 transition hover:border-cloud-400/25 hover:bg-ink-800/60">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-cloud-500/12 text-cloud-300">
                <Icon className="h-4.5 w-4.5" />
              </span>
              <h3 className="mt-3 text-sm font-semibold text-white">{title}</h3>
              <p className="mt-1 text-[12px] leading-relaxed text-slate-500">{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="como-funciona" className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Tres pasos y listo</h2>
            <p className="mt-2 text-sm text-slate-400">
              Sin instalar nada en un servidor, sin configurar DNS y sin pagar hosting. Tu navegador hace todo el trabajo.
            </p>

            <div className="mt-5 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
              <div className="flex items-center gap-2 text-[12px] font-semibold text-white">
                <ShieldCheck className="h-4 w-4 text-emerald-300" /> Nube es una app, no un bot
              </div>
              <p className="mt-1.5 text-[12px] leading-relaxed text-slate-400">
                Detras de la interfaz hay un disco en la nube que ya tienes: tu espacio de Telegram. Nube lo usa como
                almacenamiento porque es gratuito e ilimitado, pero tu nunca chateas con nada. La app gestiona carpetas,
                busquedas, papelera y descargas.
              </p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1">
                <Lock className="h-3 w-3" /> Solo tu cuenta
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1">
                <WifiOff className="h-3 w-3" /> Abre sin conexion
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1">
                <Layers className="h-3 w-3" /> Archivos de cualquier tamano
              </span>
            </div>
          </div>

          <ol className="space-y-3">
            {STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-3 rounded-2xl border border-white/[0.07] bg-ink-850/50 p-4">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-cloud-500 to-violet-500 text-sm font-bold text-white">
                  {index + 1}
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{step.title}</p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-slate-400">{step.text}</p>
                </div>
              </li>
            ))}
            <li className="rounded-2xl border border-cloud-400/25 bg-cloud-500/10 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">Listo para probar</p>
                  <p className="mt-0.5 text-[12px] text-slate-400">La primera vez se tarda menos que en crear una cuenta.</p>
                </div>
                <button className="btn-primary shrink-0 px-4 py-2 text-[13px]" onClick={onStart}>
                  Empezar <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </li>
          </ol>
        </div>
      </section>

      <section id="preguntas" className="border-t border-white/[0.06] bg-white/[0.015]">
        <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
          <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Preguntas frecuentes</h2>
          <div className="mt-5 space-y-2">
            {FAQ.map((item) => (
              <details key={item.q} className="group rounded-xl border border-white/[0.07] bg-ink-900/40 px-4 py-3">
                <summary className="cursor-pointer list-none text-sm font-medium text-slate-200 marker:hidden">
                  <span className="flex items-center justify-between gap-3">
                    {item.q}
                    <span className="text-slate-500 transition group-open:rotate-45">+</span>
                  </span>
                </summary>
                <p className="mt-2 text-[12px] leading-relaxed text-slate-400">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-6 text-[11px] text-slate-600">
          <p>Nube: almacenamiento ilimitado, sin cuotas y sin servidores propios.</p>
          <p>No esta afiliada a Telegram ni a GitHub.</p>
        </div>
      </footer>
    </div>
  );
}
