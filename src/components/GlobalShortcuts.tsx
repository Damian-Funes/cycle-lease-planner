import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import NovaOportunidadeModal from "./NovaOportunidadeModal";

export default function GlobalShortcuts() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [user]);

  if (!user) return null;
  return <NovaOportunidadeModal open={open} onOpenChange={setOpen} />;
}
