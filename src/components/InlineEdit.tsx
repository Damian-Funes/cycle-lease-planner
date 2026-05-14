import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  value: string | null | undefined;
  onSave: (v: string | null) => Promise<void> | void;
  placeholder?: string;
  multiline?: boolean;
  type?: string;
  className?: string;
}

export default function InlineEdit({ value, onSave, placeholder = "—", multiline, type, className }: Props) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value ?? "");
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => { setVal(value ?? ""); }, [value]);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  async function save() {
    setEditing(false);
    const next = val.trim();
    const cur = (value ?? "").toString().trim();
    if (next === cur) return;
    await onSave(next || null);
  }

  if (editing) {
    return multiline ? (
      <Textarea
        ref={ref as any}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={save}
        rows={3}
        className={className}
      />
    ) : (
      <Input
        ref={ref as any}
        type={type}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        className={cn("h-8", className)}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={cn(
        "group w-full text-left px-2 py-1 rounded hover:bg-muted/60 flex items-start justify-between gap-2 min-h-[28px]",
        className,
      )}
    >
      <span className={cn("text-sm break-words", !value && "text-muted-foreground")}>
        {value || placeholder}
      </span>
      <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-50 shrink-0 mt-1" />
    </button>
  );
}
