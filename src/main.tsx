import { createRoot } from "react-dom/client";
// Fuentes empaquetadas con la app: no se pide nada a servidores de terceros.
import "@fontsource-variable/anybody/standard.css";
import "@fontsource-variable/familjen-grotesk";
import "@fontsource-variable/martian-mono/standard.css";
import { App } from "./App.tsx";
import "./styles.css";

createRoot(document.getElementById("root")!).render(<App />);
