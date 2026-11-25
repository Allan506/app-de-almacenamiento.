import {
  File,
  FileArchive,
  FileSpreadsheet,
  FileText,
  FileType2,
  Folder,
  Image as ImageIcon,
  Music,
  Video,
} from "lucide-react";
import { CATEGORY_STYLES, categoryOf } from "../lib/format";

const ICONS = {
  image: ImageIcon,
  video: Video,
  audio: Music,
  pdf: FileType2,
  text: FileText,
  archive: FileArchive,
  sheet: FileSpreadsheet,
  doc: FileText,
  folder: Folder,
  other: File,
};

export function FileIcon({
  name,
  mime,
  kind,
  size = "md",
}: {
  name: string;
  mime: string;
  kind: string;
  size?: "sm" | "md" | "lg";
}) {
  const category = categoryOf(name, mime, kind);
  const style = CATEGORY_STYLES[category];
  const Icon = ICONS[category];
  const box = size === "sm" ? "h-9 w-9 rounded-lg" : size === "lg" ? "h-14 w-14 rounded-2xl" : "h-11 w-11 rounded-xl";
  const glyph = size === "sm" ? "h-4 w-4" : size === "lg" ? "h-7 w-7" : "h-5 w-5";
  return (
    <div className={`${box} ${style.bg} grid shrink-0 place-items-center ${style.text}`}>
      <Icon className={glyph} strokeWidth={1.9} />
    </div>
  );
}
