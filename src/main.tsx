import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Recarrega a página quando um chunk lazy antigo falha ao carregar
// (acontece após deploy novo enquanto o usuário está com a aba aberta)
const handleChunkError = (message: string) => {
  if (
    message &&
    (message.includes("Importing a module script failed") ||
      message.includes("Failed to fetch dynamically imported module") ||
      message.includes("error loading dynamically imported module"))
  ) {
    const key = "__chunk_reload_at";
    const last = Number(sessionStorage.getItem(key) || 0);
    if (Date.now() - last > 10000) {
      sessionStorage.setItem(key, String(Date.now()));
      window.location.reload();
    }
  }
};

window.addEventListener("error", (e) => handleChunkError(e.message));
window.addEventListener("unhandledrejection", (e) =>
  handleChunkError(String(e.reason?.message || e.reason || ""))
);

createRoot(document.getElementById("root")!).render(<App />);
