// ─── LeitorCodigoBarras.tsx ──────────────────────────────────────────────
//
// Pedido da Telma (15/09/2026): "câmera ou leitor de código de barras" —
// além de colar os 47 números da linha digitável à mão (já existia,
// `lib/boleto.ts`), ler a listra do boleto com a câmera do celular/webcam.
//
// ZXing (`@zxing/browser` + `@zxing/library`) decodifica os dois formatos
// que interessam aqui sem configuração extra — `BrowserMultiFormatReader`
// tenta todos os formatos que suporta a cada frame, incluindo:
//   - Interleaved 2 of 5 (a listra 1D impressa no boleto, 44 dígitos)
//   - QR Code (2D — cobre o caso de apontar pra um QR que carregue os
//     mesmos números, ex. alguns boletos híbridos)
// `decodificarBoleto` (lib/boleto.ts) já aceita os dois tamanhos (44 ou
// 47 dígitos) e decide sozinho qual conversão aplicar.
//
// Não tenta decodificar Pix copia-e-cola nem QR de nota fiscal (NFC-e)
// aqui — pedido explícito foi só boleto/código de barras; ver a nota em
// `docs/` (se abrir) sobre por que NFC-e é mais frágil (QR da nota só tem
// link pro portal da Sefaz do estado, sem API unificada, e o Diakonia não
// tem servidor próprio pra buscar isso sem esbarrar em CORS).
import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import type { IScannerControls } from "@zxing/browser";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, X, AlertTriangle } from "lucide-react";
import { decodificarBoleto, type BoletoDecodificado } from "@/lib/boleto";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onLido: (boleto: BoletoDecodificado, textoBruto: string) => void;
}

export function LeitorCodigoBarras({ open, onOpenChange, onLido }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [erroPermissao, setErroPermissao] = useState<string | null>(null);
  const [avisoLeitura, setAvisoLeitura] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErroPermissao(null);
    setAvisoLeitura(null);

    const reader = new BrowserMultiFormatReader();
    let cancelado = false;

    // `facingMode: "environment"` pede a câmera TRASEIRA por padrão — é a
    // que aponta pro boleto físico; a frontal (selfie) seria o padrão sem
    // isto na maioria dos celulares.
    reader
      .decodeFromConstraints(
        { video: { facingMode: "environment" } },
        videoRef.current!,
        (resultado, erro, controls) => {
          controlsRef.current = controls;
          if (cancelado) return;
          if (!resultado) return; // erro por frame sem código nenhum é normal, não é falha

          const texto = resultado.getText();
          try {
            const boleto = decodificarBoleto(texto);
            controls.stop();
            onLido(boleto, texto);
          } catch {
            // Achou um código, mas não é boleto (44/47 dígitos) — não
            // fecha nem trava, deixa a câmera tentar o próximo frame; só
            // avisa, pro caso de ter apontado pro código errado.
            setAvisoLeitura("Achei um código, mas não é um boleto (44 ou 47 números). Aponte pra listra ou pra linha digitável.");
          }
        },
      )
      .catch((e: any) => {
        if (cancelado) return;
        setErroPermissao(
          e?.name === "NotAllowedError"
            ? "Permissão da câmera negada — autorize o navegador a usar a câmera pra ler o código."
            : e?.name === "NotFoundError"
              ? "Nenhuma câmera encontrada neste dispositivo."
              : (e?.message ?? "Não consegui abrir a câmera."),
        );
      });

    return () => {
      cancelado = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [open, onLido]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg flex items-center gap-2">
            <Camera className="w-4 h-4 text-gold" /> Ler código de barras do boleto
          </DialogTitle>
          <DialogDescription>
            Aponte a câmera pra listra (código de barras) impressa no boleto, ou pra linha digitável.
          </DialogDescription>
        </DialogHeader>

        {erroPermissao ? (
          <div className="rounded-md border border-destructive-line bg-destructive-soft/30 p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-destructive-text shrink-0 mt-0.5" />
            <p className="text-sm text-destructive-text">{erroPermissao}</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="relative rounded-md overflow-hidden bg-black aspect-video">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
            </div>
            {avisoLeitura && (
              <p className="text-xs text-warning-text text-center">{avisoLeitura}</p>
            )}
          </div>
        )}

        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="gap-1.5">
          <X className="w-3.5 h-3.5" /> Cancelar
        </Button>
      </DialogContent>
    </Dialog>
  );
}
