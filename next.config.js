const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
    ],
  },
  webpack: (config, { dev }) => {
    // pdf.js tenta carregar "canvas" (só existe em Node); no navegador não é usado
    config.resolve.alias.canvas = false;
    // Remoção de fundo da foto (@imgly/background-removal) roda só no navegador:
    // força a versão "web" do onnxruntime — a versão "node" quebra a minificação do build.
    config.resolve.alias["onnxruntime-web$"] = path.join(__dirname, "node_modules/onnxruntime-web/dist/ort.bundle.min.mjs");
    // os .mjs do onnxruntime já vêm minificados e usam import.meta — o minificador do build quebra neles.
    // Marcar como "minimized" faz o minificador pular esses arquivos.
    if (!dev) {
      config.plugins.push({
        apply(compiler) {
          compiler.hooks.thisCompilation.tap("PularMinificacaoOnnx", (compilation) => {
            const { Compilation } = compiler.webpack;
            compilation.hooks.processAssets.tap(
              { name: "PularMinificacaoOnnx", stage: Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE },
              (assets) => {
                for (const nome of Object.keys(assets)) {
                  if (/(^|\/)ort[.-][^/]*\.m?js$/.test(nome)) {
                    compilation.updateAsset(nome, assets[nome], { minimized: true });
                  }
                }
              }
            );
          });
        },
      });
    }
    return config;
  },
};

module.exports = nextConfig;
