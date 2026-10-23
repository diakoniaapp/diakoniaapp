-- ─── A linha digitável pode ser INFORMADA no lançamento, sem anexar o arquivo — 23/10/2026 ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- Pedido dela: "a linha digitável só aparece no botão PAGAR quando o arquivo foi anexado. Preciso visualizar o código digitável, mesmo que o arquivo da fatura não tenha sido anexado — exemplo real: fatura AMIL."
-- Medido no código: o botão Pagar, o "Preparar envio" e o e-mail diário só leem a linha de dentro dos ANEXOS (`fin_lancamento_anexos.dados_extraidos`). O campo "Ler boleto (linha digitável)" do formulário só preenche valor e
-- vencimento e nunca guarda o código. Sem anexo, a fatura da Amil cai em "sem meio automático" e a tesoureira não tem de onde copiar o código.
--
-- O que esta migration faz: guarda o código NO LANÇAMENTO (`fin_lancamentos.linha_digitavel`, só dígitos; boleto 47, conta de consumo/guia 48 ou código de barras 44) e o entrega ao e-mail diário em `resumo_diario_dados()`
-- (única mudança nela: a chave nova `linha_digitavel` em cada item). Coluna nula por padrão: nada do que existe muda. A leitura do DOCUMENTO continua mandando — a linha informada só entra quando o anexo não traz uma.
-- Quem pode gravar é quem já pode editar lançamentos (a RLS de `fin_lancamentos` não muda). Reverter: ALTER TABLE public.fin_lancamentos DROP COLUMN linha_digitavel; e reaplicar `resumo_diario_dados` de 20261022210000.

ALTER TABLE public.fin_lancamentos ADD COLUMN IF NOT EXISTS linha_digitavel text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fin_lancamentos_linha_digitavel_formato') THEN
    ALTER TABLE public.fin_lancamentos ADD CONSTRAINT fin_lancamentos_linha_digitavel_formato
      CHECK (linha_digitavel IS NULL OR linha_digitavel ~ '^[0-9]{44}$|^[0-9]{47}$|^[0-9]{48}$');
  END IF;
END $$;
COMMENT ON COLUMN public.fin_lancamentos.linha_digitavel IS 'Linha digitável (47), código de conta de consumo/guia (48) ou código de barras (44) informado no lançamento, só dígitos. Vale quando não há anexo que a traga.';

CREATE OR REPLACE FUNCTION public.resumo_diario_dados()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET "TimeZone" = 'America/Sao_Paulo'
AS $$
DECLARE
  v_cfg resumo_diario_config; v_itens jsonb; v_dest jsonb;
BEGIN
  SELECT * INTO v_cfg FROM resumo_diario_config WHERE id = 1;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', l.id, 'data', l.data, 'valor', l.valor, 'dias_para_vencer', (l.data - CURRENT_DATE),
           'fornecedor_id', l.fornecedor_id, 'fornecedor_nome', f.nome, 'pessoa_nome', m.nome_completo, 'descricao', l.descricao,
           'categoria', c.nome, 'centro', ce.nome, 'chave_pix', NULLIF(btrim(f.chave_pix), ''), 'tipo_chave_pix', f.tipo_chave_pix,
           'linha_digitavel', NULLIF(btrim(l.linha_digitavel), ''),
           'ultimo_envio', (SELECT max(e.enviado_em) FROM resumo_diario_enviados e WHERE e.lancamento_id = l.id),
           'anexos', COALESCE((SELECT jsonb_agg(jsonb_build_object('tipo', a.tipo, 'nome', a.nome, 'dados', a.dados_extraidos) ORDER BY a.enviado_em DESC)
                                 FROM fin_lancamento_anexos a WHERE a.lancamento_id = l.id), '[]'::jsonb)
         ) ORDER BY l.data, l.valor DESC), '[]'::jsonb)
    INTO v_itens
    FROM fin_lancamentos l
    LEFT JOIN fin_fornecedores f ON f.id = l.fornecedor_id
    LEFT JOIN membros m ON m.id = l.pessoa_id
    LEFT JOIN fin_categorias c ON c.id = l.categoria_id
    LEFT JOIN fin_centros_custo ce ON ce.id = l.centro_custo_id
   WHERE l.tipo::text = 'saida' AND l.status::text = 'previsto' AND l.origem::text IS DISTINCT FROM 'transferencia'
     AND COALESCE(l.forma_liquidacao::text, 'manual') NOT IN ('debito_automatico', 'pix_recorrente', 'transferencia_programada')
     AND l.data <= CURRENT_DATE + v_cfg.janela_dias
     AND NOT EXISTS (SELECT 1 FROM vw_fin_quitacao q WHERE q.obrigacao_id = COALESCE(l.obrigacao_id, l.id) AND q.intencao = 'reembolso');

  SELECT COALESCE(jsonb_agg(jsonb_build_object('nome', d.nome, 'email', d.email) ORDER BY d.nome), '[]'::jsonb) INTO v_dest FROM resumo_diario_destinatarios d;

  RETURN jsonb_build_object(
    'hoje', CURRENT_DATE, 'dow', extract(dow FROM CURRENT_DATE)::int, 'gerado_em', now(),
    'config', to_jsonb(v_cfg) - 'id' - 'atualizado_em' - 'atualizado_por', 'destinatarios', v_dest, 'itens', v_itens,
    -- o último envio de qualquer item: a Edge Function não repete o envio se o agendamento disparar duas vezes (ou alguém chamar a URL de novo)
    'ultimo_envio_geral', (SELECT max(enviado_em) FROM resumo_diario_enviados)
  );
END;
$$;
