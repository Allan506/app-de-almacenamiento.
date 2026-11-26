import {
  Check,
  ChevronLeft,
  ChevronRight,
  Gauge,
  ListMusic,
  Loader2,
  Maximize,
  Minimize,
  Music4,
  Pause,
  PictureInPicture2,
  Play,
  Repeat,
  Repeat1,
  RotateCcw,
  RotateCw,
  Shuffle,
  SkipBack,
  SkipForward,
  TriangleAlert,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { formatBytes } from "../lib/format";
import type { Vault } from "../lib/library";
import {
  RATES,
  buildPlaylist,
  clampVolume,
  createResumeStore,
  formatDuration,
  loopLabel,
  mediaKindOf,
  nextLoopMode,
  nextRate,
  readNumber,
  stepPlaylist,
  writeNumber,
  type LoopMode,
} from "../lib/media";
import type { VaultNode } from "../lib/types";

const VOLUME_KEY = "nube-lite.player.volume";
const RATE_KEY = "nube-lite.player.rate";
const CACHE_LIMIT = 4;

type Source = {
  url: string | null;
  loading: boolean;
  progress: number;
  error: string | null;
  /** true cuando se reproduce directo desde Telegram (sin pasar por fetch). */
  streamed: boolean;
};

function friendly(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : "";
  if (/failed to fetch|networkerror|load failed|network error/i.test(message)) {
    return "Se corto la conexion con Telegram. Comprueba tu red y pulsa Reintentar.";
  }
  if (/abort/i.test(message)) return "Se cancelo la descarga.";
  return message || "No se pudo cargar el archivo";
}

function useMediaSource(vault: Vault, node: VaultNode, cache: MutableRefObject<Map<string, string>>) {
  const [state, setState] = useState<Source>({ url: null, loading: true, progress: 0, error: null, streamed: false });
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    const cached = cache.current.get(node.id);
    if (cached) {
      setState({ url: cached, loading: false, progress: 1, error: null, streamed: false });
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setState({ url: null, loading: true, progress: 0, error: null, streamed: false });

    void vault
      .readFile(
        node,
        (loaded, total) => {
          if (!cancelled) setState((current) => ({ ...current, progress: total ? loaded / total : 0 }));
        },
        controller.signal,
      )
      .then((blob) => {
        if (cancelled) return;
        const url = URL.createObjectURL(new Blob([blob], { type: node.mime_type || "application/octet-stream" }));
        cache.current.set(node.id, url);
        for (const [key, value] of cache.current) {
          if (cache.current.size <= CACHE_LIMIT) break;
          if (key === node.id) continue;
          URL.revokeObjectURL(value);
          cache.current.delete(key);
        }
        setState({ url, loading: false, progress: 1, error: null, streamed: false });
      })
      .catch(async (cause: unknown) => {
        if (cancelled || controller.signal.aborted) return;
        // Plan B: dejar que el propio navegador descargue del tiron desde Telegram.
        const direct = await vault.directUrl(node).catch(() => null);
        if (cancelled) return;
        if (direct) {
          setState({ url: direct, loading: false, progress: 1, error: null, streamed: true });
          return;
        }
        setState({ url: null, loading: false, progress: 0, error: friendly(cause), streamed: false });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [vault, node, cache, attempt]);

  return { ...state, retry };
}

type Graph = { ctx: AudioContext; source: MediaElementAudioSourceNode; analyser: AnalyserNode };

const MEDIA_GRAPHS = new WeakMap<HTMLMediaElement, Graph>();

/** Conecta el elemento al analizador una sola vez: crear dos fuentes lanza una excepcion. */
function ensureGraph(element: HTMLMediaElement): Graph | null {
  const existing = MEDIA_GRAPHS.get(element);
  if (existing) return existing;
  try {
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return null;
    const ctx = new Context();
    const source = ctx.createMediaElementSource(element);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.72;
    source.connect(analyser);
    analyser.connect(ctx.destination);
    const graph = { ctx, source, analyser };
    MEDIA_GRAPHS.set(element, graph);
    return graph;
  } catch {
    return null;
  }
}

const BARS = 40;

/** Espectro en vivo del audio. Si el navegador no deja analizarlo, dibuja un patrón animado. */
function AudioVisualizer({ media, playing }: { media: HTMLMediaElement | null; playing: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Un origen externo (URL de Telegram) queda "tainted": el analizador devolveria
    // silencio, asi que solo se conecta cuando el audio viene de un blob local.
    const local = Boolean(media && media.currentSrc.startsWith("blob:"));
    const graph = media && local ? ensureGraph(media) : null;
    if (graph) void graph.ctx.resume().catch(() => undefined);
    if (media && !local) {
      const previous = MEDIA_GRAPHS.get(media);
      if (previous) {
        previous.source.disconnect();
        previous.source.connect(previous.ctx.destination);
      }
    }

    const analyser = graph?.analyser ?? null;
    const data = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
    let frame = 0;
    let stopped = false;

    const paint = (time: number) => {
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const width = canvas.clientWidth || 240;
      const height = canvas.clientHeight || 64;
      if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
      }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      if (analyser && data) analyser.getByteFrequencyData(data);

      const gap = 2;
      const inset = 8;
      const barWidth = Math.max(2, (width - gap * (BARS - 1)) / BARS);
      for (let index = 0; index < BARS; index += 1) {
        let value: number;
        if (data) {
          const from = Math.floor((index / BARS) * data.length * 0.72);
          const to = Math.max(from + 1, Math.floor(((index + 1) / BARS) * data.length * 0.72));
          let sum = 0;
          for (let cursor = from; cursor < to; cursor += 1) sum += data[cursor];
          value = sum / (to - from) / 255;
        } else if (playing) {
          value = 0.16 + 0.55 * Math.abs(Math.sin(time / 340 + index * 0.5)) * Math.abs(Math.cos(time / 1100 + index * 0.17));
        } else {
          value = 0.1;
        }
        const barHeight = Math.max(3, Math.min(1, value) * (height - inset));
        const gradient = ctx.createLinearGradient(0, height, 0, height - barHeight);
        gradient.addColorStop(0, "#8b5cf6");
        gradient.addColorStop(1, "#5eead4");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(index * (barWidth + gap), height - barHeight, barWidth, barHeight, barWidth / 2);
        ctx.fill();
      }
      if (!stopped && playing) frame = requestAnimationFrame(paint);
    };

    paint(performance.now());
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
    };
  }, [media, playing]);

  return <canvas ref={canvasRef} className="h-16 w-full" aria-hidden="true" />;
}

function IconButton({
  label,
  onClick,
  active,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border transition sm:h-9 sm:w-9 ${
        active
          ? "border-cloud-400/40 bg-cloud-500/20 text-cloud-100"
          : "border-transparent text-slate-300 hover:border-white/10 hover:bg-white/[0.06] hover:text-white"
      } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
    >
      {children}
    </button>
  );
}

export function MediaPlayer({
  node,
  siblings,
  vault,
  onSelect,
}: {
  node: VaultNode;
  siblings: VaultNode[];
  vault: Vault;
  onSelect: (node: VaultNode) => void;
}) {
  const kind = mediaKindOf(node) ?? "audio";
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const [mediaEl, setMediaEl] = useState<HTMLMediaElement | null>(null);
  // Referencia estable: si cambia en cada render React la vuelve a llamar y entrariamos en bucle.
  const attachMedia = useCallback((element: HTMLMediaElement | null) => {
    mediaRef.current = element;
    if (element) setMediaEl(element);
  }, []);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const cacheRef = useRef<Map<string, string>>(new Map());
  const hideTimer = useRef<number | null>(null);
  const lastSaved = useRef(0);

  const source = useMediaSource(vault, node, cacheRef);
  const resume = useMemo(() => createResumeStore(typeof localStorage === "undefined" ? null : localStorage), []);
  const playlist = useMemo(() => buildPlaylist(siblings, node, kind), [siblings, node, kind]);
  const index = playlist.findIndex((item) => item.id === node.id);

  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(() =>
    clampVolume(readNumber(typeof localStorage === "undefined" ? null : localStorage, VOLUME_KEY, 1)),
  );
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(() =>
    readNumber(typeof localStorage === "undefined" ? null : localStorage, RATE_KEY, 1),
  );
  const [loop, setLoop] = useState<LoopMode>("off");
  const [shuffle, setShuffle] = useState(false);
  const [showList, setShowList] = useState(false);
  const [showRates, setShowRates] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [pip, setPip] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [failed, setFailed] = useState(false);

  const go = useCallback(
    (step: 1 | -1) => {
      const target = stepPlaylist(playlist, node.id, step, { shuffle });
      if (target) onSelect(target);
    },
    [loop, node.id, onSelect, playlist, shuffle],
  );

  useEffect(() => {
    setPlaying(false);
    setTime(0);
    setDuration(0);
    setBuffered(0);
    setFailed(false);
    lastSaved.current = 0;
  }, [node.id]);

  useEffect(() => {
    const element = mediaRef.current;
    if (!element) return;
    element.volume = volume;
    element.muted = muted;
    element.playbackRate = rate;
  }, [volume, muted, rate, source.url]);

  useEffect(() => {
    writeNumber(typeof localStorage === "undefined" ? null : localStorage, VOLUME_KEY, volume);
  }, [volume]);
  useEffect(() => {
    writeNumber(typeof localStorage === "undefined" ? null : localStorage, RATE_KEY, rate);
  }, [rate]);

  const toggle = useCallback(() => {
    const element = mediaRef.current;
    if (!element) return;
    if (element.paused) void element.play().catch(() => setPlaying(false));
    else element.pause();
  }, []);

  const seek = useCallback((seconds: number) => {
    const element = mediaRef.current;
    if (!element || !Number.isFinite(element.duration)) return;
    element.currentTime = Math.min(Math.max(0, seconds), element.duration);
    setTime(element.currentTime);
  }, []);

  const nudge = useCallback((delta: number) => seek((mediaRef.current?.currentTime ?? 0) + delta), [seek]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      switch (event.key) {
        case " ":
        case "k":
          event.preventDefault();
          toggle();
          break;
        case "ArrowRight":
        case "l":
          event.preventDefault();
          nudge(event.shiftKey ? 30 : 5);
          break;
        case "ArrowLeft":
        case "j":
          event.preventDefault();
          nudge(event.shiftKey ? -30 : -5);
          break;
        case "ArrowUp":
          event.preventDefault();
          setVolume((value) => clampVolume(value + 0.1));
          setMuted(false);
          break;
        case "ArrowDown":
          event.preventDefault();
          setVolume((value) => clampVolume(value - 0.1));
          break;
        case "m":
          setMuted((value) => !value);
          break;
        case "f":
          void toggleFullscreen();
          break;
        case "n":
          go(1);
          break;
        case "p":
          go(-1);
          break;
        case "<":
          setRate((value) => nextRate(value, -1));
          break;
        case ">":
          setRate((value) => nextRate(value, 1));
          break;
        case "s":
          setShuffle((value) => !value);
          break;
        case "r":
          setLoop((value) => nextLoopMode(value));
          break;
        default:
          if (/^[0-9]$/.test(event.key)) {
            const element = mediaRef.current;
            if (element && Number.isFinite(element.duration)) seek((Number(event.key) / 10) * element.duration);
          }
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, nudge, seek, toggle]);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    return () => {
      const element = mediaRef.current;
      if (element && element.currentTime > 1) resume.write(node.id, element.currentTime);
    };
  }, [node.id, resume]);

  async function toggleFullscreen() {
    if (!stageRef.current) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stageRef.current.requestFullscreen();
    } catch {
      /* El navegador puede bloquearlo. */
    }
  }

  async function togglePip() {
    const element = mediaRef.current as HTMLVideoElement | null;
    if (!element || !("requestPictureInPicture" in element)) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await element.requestPictureInPicture();
      setPip(Boolean(document.pictureInPictureElement));
    } catch {
      setPip(false);
    }
  }

  const revealControls = () => {
    setControlsVisible(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      if (mediaRef.current && !mediaRef.current.paused) setControlsVisible(false);
    }, 2600);
  };

  useEffect(() => {
    setControlsVisible(true);
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, [node.id]);

  const onLoaded = () => {
    const element = mediaRef.current;
    if (!element) return;
    setDuration(element.duration || 0);
    const saved = resume.read(node.id);
    if (saved > 3 && (!element.duration || saved < element.duration - 5)) {
      element.currentTime = saved;
      setTime(saved);
    }
    void element.play().catch(() => setPlaying(false));
  };

  const onTime = () => {
    const element = mediaRef.current;
    if (!element) return;
    setTime(element.currentTime);
    if (element.currentTime - lastSaved.current > 4) {
      lastSaved.current = element.currentTime;
      resume.write(node.id, element.currentTime);
    }
  };

  const onEnded = () => {
    setPlaying(false);
    resume.clear(node.id);
    const element = mediaRef.current;
    if (loop === "one" && element) {
      element.currentTime = 0;
      void element.play();
      return;
    }
    const target = stepPlaylist(playlist, node.id, 1, { wrap: loop === "all", shuffle });
    if (target) onSelect(target);
  };

  const onScrub = (event: React.PointerEvent<HTMLDivElement>) => {
    const element = mediaRef.current;
    const bar = event.currentTarget;
    if (!element || !Number.isFinite(element.duration)) return;
    const ratio = Math.min(1, Math.max(0, (event.clientX - bar.getBoundingClientRect().left) / bar.offsetWidth));
    seek(ratio * element.duration);
  };

  const progress = duration ? Math.min(100, (time / duration) * 100) : 0;
  const bufferedPct = duration ? Math.min(100, (buffered / duration) * 100) : 0;
  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  const progressBar = (
    <div
      role="slider"
      aria-label="Progreso"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(time)}
      tabIndex={0}
      onPointerDown={onScrub}
      onPointerMove={(event) => {
        if (event.buttons === 1) onScrub(event);
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") nudge(5);
        if (event.key === "ArrowLeft") nudge(-5);
      }}
      className="group relative h-5 w-full cursor-pointer touch-none select-none"
    >
      <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-white/15">
        <div className="h-full rounded-full bg-white/25" style={{ width: `${bufferedPct}%` }} />
        <div className="absolute inset-y-0 left-0 rounded-full bg-cloud-400" style={{ width: `${progress}%` }} />
      </div>
      <span
        className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow transition-transform group-hover:scale-125"
        style={{ left: `${progress}%` }}
      />
    </div>
  );

  const controls = (
    <div className="w-full">
      {progressBar}
      <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px] text-slate-400">
        <span className="font-mono tabular-nums">
          {formatDuration(time)} <span className="text-slate-600">/</span> {formatDuration(duration)}
        </span>
        <span className="flex items-center gap-1">
          <span className="hidden items-center gap-1 sm:flex">
            <IconButton label={muted ? "Activar sonido (m)" : "Silenciar (m)"} onClick={() => setMuted((value) => !value)}>
              <VolumeIcon className="h-4 w-4" />
            </IconButton>
            <input
              type="range"
              aria-label="Volumen"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(event) => {
                setVolume(clampVolume(Number(event.target.value)));
                setMuted(false);
              }}
              className="h-1 w-14 cursor-pointer appearance-none rounded-full bg-white/20 accent-cloud-400"
            />
          </span>
          <span className="hidden items-center gap-1 md:flex">
            <IconButton label="Aleatorio (s)" onClick={() => setShuffle((value) => !value)} active={shuffle}>
              <Shuffle className="h-4 w-4" />
            </IconButton>
          </span>
        </span>
      </div>

      <div className="mt-1 flex items-center gap-1">
        <IconButton label="Anterior (p)" onClick={() => go(-1)} disabled={playlist.length < 2}>
          <SkipBack className="h-4 w-4" />
        </IconButton>
        <span className="hidden sm:block">
          <IconButton label="Retroceder 10 s (j)" onClick={() => nudge(-10)}>
            <RotateCcw className="h-4 w-4" />
          </IconButton>
        </span>
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? "Pausar (espacio)" : "Reproducir (espacio)"}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-cloud-500 text-white transition hover:bg-cloud-400"
        >
          {playing ? <Pause className="h-4 w-4" fill="currentColor" /> : <Play className="ml-0.5 h-4 w-4" fill="currentColor" />}
        </button>
        <span className="hidden sm:block">
          <IconButton label="Avanzar 10 s (l)" onClick={() => nudge(10)}>
            <RotateCw className="h-4 w-4" />
          </IconButton>
        </span>
        <IconButton label="Siguiente (n)" onClick={() => go(1)} disabled={playlist.length < 2}>
          <SkipForward className="h-4 w-4" />
        </IconButton>

        <div className="ml-auto flex items-center gap-1">
          <div className="relative">
            <IconButton label="Velocidad (< y >)" onClick={() => setShowRates((value) => !value)} active={showRates || rate !== 1}>
              <span className="text-[10px] font-bold">{rate}x</span>
            </IconButton>
            {showRates && (
              <div className="absolute bottom-10 right-0 z-30 w-24 animate-scale-in overflow-hidden rounded-xl border border-white/10 bg-ink-900/95 py-1 shadow-2xl backdrop-blur-xl">
                {RATES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setRate(value);
                      setShowRates(false);
                    }}
                    className="flex w-full items-center justify-between px-3 py-1.5 text-[11px] text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
                  >
                    {value}x {Math.abs(rate - value) < 0.01 && <Check className="h-3 w-3 text-cloud-300" />}
                  </button>
                ))}
              </div>
            )}
          </div>
          <IconButton label={`${loopLabel(loop)} (r)`} onClick={() => setLoop((value) => nextLoopMode(value))} active={loop !== "off"}>
            {loop === "one" ? <Repeat1 className="h-4 w-4" /> : <Repeat className="h-4 w-4" />}
          </IconButton>
          <IconButton label="Lista de reproduccion" onClick={() => setShowList((value) => !value)} active={showList}>
            <ListMusic className="h-4 w-4" />
          </IconButton>
          {kind === "video" && "requestPictureInPicture" in HTMLVideoElement.prototype && (
            <span className="hidden md:block">
              <IconButton label="Ventana flotante" onClick={() => void togglePip()} active={pip}>
                <PictureInPicture2 className="h-4 w-4" />
              </IconButton>
            </span>
          )}
          {kind === "video" && (
            <IconButton label="Pantalla completa (f)" onClick={() => void toggleFullscreen()}>
              {fullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </IconButton>
          )}
        </div>
      </div>
    </div>
  );

  const loadingOverlay = source.loading && (
    <div className="absolute inset-0 grid place-items-center rounded-xl bg-ink-950/80 backdrop-blur-sm">
      <div className="flex w-full max-w-xs flex-col items-center gap-3 px-6">
        <Loader2 className="h-6 w-6 animate-spin text-cloud-300" />
        <p className="text-xs text-slate-300">Descargando desde Telegram... {Math.round(source.progress * 100)}%</p>
        <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-cloud-400 transition-all" style={{ width: `${source.progress * 100}%` }} />
        </div>
      </div>
    </div>
  );

  const errorOverlay = (source.error || failed) && !source.loading && (
    <div className="absolute inset-0 grid place-items-center rounded-xl bg-ink-950/85 px-6 text-center">
      <div className="flex flex-col items-center gap-2">
        <TriangleAlert className="h-6 w-6 text-amber-300" />
        <p className="max-w-sm text-xs text-slate-300">
          {source.error ?? "El navegador no puede reproducir este formato. Descargalo para abrirlo con otra app."}
        </p>
        {source.error && (
          <button
            type="button"
            className="btn-ghost mt-1 text-xs"
            onClick={() => {
              setFailed(false);
              source.retry();
            }}
          >
            <RotateCw className="h-3.5 w-3.5" /> Reintentar
          </button>
        )}
      </div>
    </div>
  );

  const audioElement = (
    <audio
      ref={attachMedia}
      src={source.url ?? undefined}
      onLoadedMetadata={onLoaded}
      onTimeUpdate={onTime}
      onProgress={() => {
        const element = mediaRef.current;
        if (element && element.buffered.length) setBuffered(element.buffered.end(element.buffered.length - 1));
      }}
      onPlay={() => setPlaying(true)}
      onPause={() => setPlaying(false)}
      onEnded={onEnded}
      onError={() => setFailed(true)}
    />
  );

  const stage = (
    <div ref={stageRef} className={`relative ${fullscreen ? "flex h-full w-full flex-col justify-center bg-black p-4" : ""}`}>
      {kind === "video" ? (
        <div className="relative" onMouseMove={revealControls} onPointerDown={revealControls}>
          <video
            ref={attachMedia}
            src={source.url ?? undefined}
            className="max-h-[62vh] w-full rounded-xl bg-black object-contain"
            playsInline
            onLoadedMetadata={onLoaded}
            onTimeUpdate={onTime}
            onProgress={() => {
              const element = mediaRef.current;
              if (element && element.buffered.length) setBuffered(element.buffered.end(element.buffered.length - 1));
            }}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={onEnded}
            onError={() => setFailed(true)}
            onClick={toggle}
          />
          {loadingOverlay}
          {errorOverlay}
          {!playing && !source.loading && !source.error && !failed && (
            <button
              type="button"
              onClick={toggle}
              aria-label="Reproducir"
              className="absolute inset-0 grid place-items-center rounded-xl bg-ink-950/30 transition hover:bg-ink-950/10"
            >
              <span className="grid h-16 w-16 place-items-center rounded-full bg-white/90 text-ink-900 shadow-glow">
                <Play className="ml-1 h-7 w-7" fill="currentColor" />
              </span>
            </button>
          )}
          <div
            className={`absolute inset-x-0 bottom-0 rounded-b-xl bg-gradient-to-t from-ink-950/95 via-ink-950/85 to-transparent px-2 pb-1.5 pt-8 transition-opacity ${
              controlsVisible || !playing ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            {controls}
          </div>
        </div>
      ) : (
        <>
          <div className="relative overflow-hidden rounded-xl border border-white/[0.07] bg-gradient-to-br from-ink-800 via-ink-900 to-ink-950 px-4 py-5 sm:px-6">
            <div className="flex flex-col items-center gap-3">
              <div
                className={`relative grid h-20 w-20 place-items-center rounded-3xl border border-white/10 bg-cloud-500/15 text-cloud-200 ${
                  playing ? "shadow-glow" : ""
                }`}
              >
                <Music4 className="h-8 w-8" />
              </div>
              <div className="text-center">
                <p className="mx-auto max-w-md truncate text-sm font-semibold text-white">{node.name}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {formatBytes(node.size)}
                  {duration ? ` · ${formatDuration(duration)}` : ""}
                  {source.streamed ? " · en directo" : ""}
                </p>
              </div>
              <div className="w-full rounded-lg border border-white/[0.06] bg-black/25 px-2 pb-1.5 pt-1">
                <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-slate-500">
                  <span>Vista previa</span>
                  <span className={playing ? "text-emerald-300" : ""}>
                    {playing ? "En vivo" : source.loading ? "Cargando" : "En pausa"}
                  </span>
                </div>
                <AudioVisualizer media={mediaEl} playing={playing} />
              </div>
            </div>
            {loadingOverlay}
            {errorOverlay}
          </div>
          {audioElement}
          <div className="mt-2 rounded-xl border border-white/10 bg-ink-900/70 px-2 py-1.5">{controls}</div>
        </>
      )}
    </div>
  );

  return (
    <div className="relative">
      {stage}

      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-slate-500">
        <span className="hidden items-center gap-1.5 sm:inline-flex">
          <Gauge className="h-3.5 w-3.5" />
          Espacio: reproducir o pausar · flechas: mover 5 s · J/L: 10 s · N/P: cambiar · R: repetir · S: aleatorio
        </span>
        <span className="hidden shrink-0 items-center gap-1 sm:inline-flex">
          <ChevronLeft className="h-3.5 w-3.5" />
          {index >= 0 ? `${index + 1} de ${playlist.length}` : `${playlist.length} archivos`}
          <ChevronRight className="h-3.5 w-3.5" />
        </span>
      </div>

      {showList && (
        <div className="absolute right-0 top-2 z-30 max-h-[70%] w-64 animate-scale-in overflow-auto rounded-xl border border-white/10 bg-ink-900/95 p-1.5 shadow-2xl backdrop-blur-xl">
          <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            {kind === "video" ? "Videos" : "Audios"} de esta carpeta
          </p>
          {playlist.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelect(item);
                setShowList(false);
              }}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] transition ${
                item.id === node.id ? "bg-cloud-500/20 text-cloud-100" : "text-slate-300 hover:bg-white/[0.06] hover:text-white"
              }`}
            >
              {item.id === node.id && playing ? <Pause className="h-3 w-3 shrink-0" /> : <Play className="h-3 w-3 shrink-0" />}
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              <span className="shrink-0 text-[10px] text-slate-500">{formatBytes(item.size)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
