import { Check, Folder, HardDrive } from "lucide-react";
import { useMemo, useState } from "react";
import { folderOptions, subtreeIds } from "../lib/tree";
import type { VaultNode } from "../lib/types";
import { Modal } from "./Modal";

export function MoveModal({
  node,
  nodes,
  onClose,
  onMove,
}: {
  node: VaultNode | null;
  nodes: VaultNode[];
  onClose: () => void;
  onMove: (targetId: string | null) => Promise<void>;
}) {
  const [target, setTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = useMemo(() => {
    if (!node) return [];
    const blocked = new Set([node.id, ...subtreeIds(nodes, node.id)]);
    return folderOptions(nodes).filter((option) => !option.id || !blocked.has(option.id));
  }, [node, nodes]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onMove(target);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo mover");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={Boolean(node)}
      onClose={onClose}
      title="Mover a otra carpeta"
      subtitle={node ? `Elige el destino de "${node.name}"` : undefined}
      size="sm"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={submit} disabled={busy || (node?.parent_id ?? null) === target}>
            Mover aqui
          </button>
        </>
      }
    >
      <div className="max-h-72 space-y-1 overflow-y-auto">
        {options.map((option) => {
          const active = target === option.id;
          return (
            <button
              key={option.id ?? "root"}
              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition ${
                active ? "bg-cloud-500/15 text-white ring-1 ring-cloud-400/40" : "text-slate-300 hover:bg-white/[0.05]"
              }`}
              style={{ paddingLeft: `${option.depth * 14 + 10}px` }}
              onClick={() => setTarget(option.id)}
            >
              {option.id ? <Folder className="h-4 w-4 shrink-0 text-cloud-300" /> : <HardDrive className="h-4 w-4 shrink-0 text-cloud-300" />}
              <span className="min-w-0 flex-1 truncate">{option.name}</span>
              {active && <Check className="h-4 w-4 shrink-0 text-cloud-300" />}
            </button>
          );
        })}
      </div>
      {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
    </Modal>
  );
}
