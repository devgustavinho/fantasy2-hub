import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig({
  server: { port: 5173 },
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  // Alguns iPhones mais antigos rodam Safari < 13.1, que não suporta optional chaining (?.)
  // nem nullish coalescing (??) nativamente. Sem transpilar pra um alvo mais antigo, o bundle
  // inteiro falha ao ser parseado nesses aparelhos — a página fica em branco, sem erro visível
  // (o script nem chega a rodar). "es2015" força o esbuild a rebaixar essa sintaxe.
  build: {
    target: "es2015",
  },
});
