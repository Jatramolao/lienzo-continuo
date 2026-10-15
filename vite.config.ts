import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Las librerías van en trozos aparte para que el navegador las mantenga en caché
// entre versiones: solo cambia el trozo de la app cuando se publica una actualización.
export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: "konva", test: /node_modules[\\/](konva|react-konva)[\\/]/ },
            { name: "react", test: /node_modules[\\/](react|react-dom|scheduler|react-reconciler)[\\/]/ },
          ],
        },
      },
    },
  },
});
