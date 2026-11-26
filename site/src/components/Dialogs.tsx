import { Loader2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Modal } from "./Modal";

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirmar",
  tone = "danger",
  busy = false,
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  tone?: "danger" | "primary";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <button className="btn-ghost" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button className={tone === "danger" ? "btn-danger" : "btn-primary"} onClick={onConfirm} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-slate-300">{message}</p>
      {children}
    </Modal>
  );
}

export function PromptDialog({
  open,
  title,
  label,
  initialValue = "",
  placeholder,
  confirmLabel = "Guardar",
  hint,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  label: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  hint?: string;
  onClose: () => void;
  onSubmit: (value: string) => Promise<void> | void;
}) {
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setValue(initialValue);
    setError(null);
    onClose();
  };

  const submit = async () => {
    if (!value.trim()) {
      setError("Escribe un nombre");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(value.trim());
      setValue(initialValue);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo completar la operacion");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      size="sm"
      footer={
        <>
          <button className="btn-ghost" onClick={close} disabled={busy}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={submit} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </>
      }
    >
      <label className="label" htmlFor="prompt-value">
        {label}
      </label>
      <input
        id="prompt-value"
        className="field"
        autoFocus
        value={value}
        placeholder={placeholder}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") void submit();
        }}
      />
      {hint && !error && <p className="mt-2 text-xs text-slate-500">{hint}</p>}
      {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
    </Modal>
  );
}
