import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    // Instalável como app no celular — o "atalho que abre como aplicativo"
    // que existia na época do AppSheet e não veio junto na migração pra
    // este app React. `registerType: "autoUpdate"` é de propósito: um
    // sistema de uso diário não pode deixar alguém preso numa versão
    // velha porque esqueceu de atualizar manualmente — o service worker
    // novo assume sozinho na próxima abertura, sem pedir confirmação.
    //
    // `injectRegister: "auto"` cuida de registrar o service worker sem
    // precisar mexer em main.tsx. Nenhuma chamada da rede (Supabase
    // incluído) é interceptada — só os arquivos do próprio app (JS, CSS,
    // ícones) entram no cache, listados em `globPatterns` abaixo; dados
    // continuam sempre vindo da rede.
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["favicon.svg", "favicon.ico", "apple-touch-icon.png"],
      manifest: {
        id: "/",
        name: "DiakoniaApp — Sistema de Gestão Ministerial",
        short_name: "Diakonia",
        description: "Sistema completo de gestão eclesiástica: membros, ministérios, agenda, finanças e campanhas.",
        lang: "pt-BR",
        start_url: "/",
        scope: "/",
        display: "standalone",
        // Mesmos tokens de src/index.css (tema claro): --background
        // "Algodão Egípcio" e --primary, convertidos de HSL pra hex.
        background_color: "#F5F3F0",
        theme_color: "#9d6125",
        icons: [
          { src: "/pwa-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webp,woff,woff2}"],
        // O bundle principal passa de 3 MB (o projeto já tem um aviso de
        // build sobre isso, código-fonte, não deste plugin) — acima do
        // limite padrão do Workbox de 2 MiB por arquivo pré-cacheado.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // SPA: qualquer rota não encontrada no cache cai no index.html,
        // igual ao rewrite que o vercel.json já faz em produção.
        navigateFallback: "/index.html",
        // Sem isso, quem já tinha a aba aberta continuava no service
        // worker antigo até fechar e reabrir o app inteiro — na prática,
        // nunca. Com isso, a versão nova assume assim que instala.
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
});
