export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      acolhimento_tarefas: {
        Row: {
          area_id: string | null
          atualizado_em: string
          concluida: boolean
          criado_em: string
          data: string
          data_conclusao: string | null
          id: string
          titulo: string
          visitante_id: string
        }
        Insert: {
          area_id?: string | null
          atualizado_em?: string
          concluida?: boolean
          criado_em?: string
          data: string
          data_conclusao?: string | null
          id?: string
          titulo: string
          visitante_id: string
        }
        Update: {
          area_id?: string | null
          atualizado_em?: string
          concluida?: boolean
          criado_em?: string
          data?: string
          data_conclusao?: string | null
          id?: string
          titulo?: string
          visitante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "acolhimento_tarefas_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acolhimento_tarefas_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "v_voluntarios_completo"
            referencedColumns: ["area_id"]
          },
          {
            foreignKeyName: "acolhimento_tarefas_visitante_id_fkey"
            columns: ["visitante_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acolhimento_tarefas_visitante_id_fkey"
            columns: ["visitante_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acolhimento_tarefas_visitante_id_fkey"
            columns: ["visitante_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acolhimento_tarefas_visitante_id_fkey"
            columns: ["visitante_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acolhimento_tarefas_visitante_id_fkey"
            columns: ["visitante_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
        ]
      }
      acompanhamentos_visitante: {
        Row: {
          contato_feito: boolean
          created_at: string
          data_contato: string | null
          data_visita: string | null
          id: string
          membro_id: string
          observacoes: string | null
          proximo_passo: string | null
          registrado_por: string | null
          responsavel_id: string | null
          status: Database["public"]["Enums"]["acompanhamento_status"]
          updated_at: string
          visita_realizada: boolean
        }
        Insert: {
          contato_feito?: boolean
          created_at?: string
          data_contato?: string | null
          data_visita?: string | null
          id?: string
          membro_id: string
          observacoes?: string | null
          proximo_passo?: string | null
          registrado_por?: string | null
          responsavel_id?: string | null
          status?: Database["public"]["Enums"]["acompanhamento_status"]
          updated_at?: string
          visita_realizada?: boolean
        }
        Update: {
          contato_feito?: boolean
          created_at?: string
          data_contato?: string | null
          data_visita?: string | null
          id?: string
          membro_id?: string
          observacoes?: string | null
          proximo_passo?: string | null
          registrado_por?: string | null
          responsavel_id?: string | null
          status?: Database["public"]["Enums"]["acompanhamento_status"]
          updated_at?: string
          visita_realizada?: boolean
        }
        Relationships: []
      }
      area_funcoes: {
        Row: {
          area_id: string
          ativo: boolean
          created_at: string
          descricao: string | null
          id: string
          min_por_escala: number
          nome: string
          ordem: number
          updated_at: string
        }
        Insert: {
          area_id: string
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          min_por_escala?: number
          nome: string
          ordem?: number
          updated_at?: string
        }
        Update: {
          area_id?: string
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          min_por_escala?: number
          nome?: string
          ordem?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "area_funcoes_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "area_funcoes_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "v_voluntarios_completo"
            referencedColumns: ["area_id"]
          },
        ]
      }
      area_voluntario_funcoes: {
        Row: {
          area_funcao_id: string
          area_voluntario_id: string
          confirmada_em: string | null
          confirmada_por: string | null
          created_at: string
          id: string
          observacoes: string | null
          origem: string
          principal: boolean
        }
        Insert: {
          area_funcao_id: string
          area_voluntario_id: string
          confirmada_em?: string | null
          confirmada_por?: string | null
          created_at?: string
          id?: string
          observacoes?: string | null
          origem?: string
          principal?: boolean
        }
        Update: {
          area_funcao_id?: string
          area_voluntario_id?: string
          confirmada_em?: string | null
          confirmada_por?: string | null
          created_at?: string
          id?: string
          observacoes?: string | null
          origem?: string
          principal?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "area_voluntario_funcoes_area_funcao_id_fkey"
            columns: ["area_funcao_id"]
            isOneToOne: false
            referencedRelation: "area_funcoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "area_voluntario_funcoes_area_voluntario_id_fkey"
            columns: ["area_voluntario_id"]
            isOneToOne: false
            referencedRelation: "area_voluntarios"
            referencedColumns: ["id"]
          },
        ]
      }
      area_voluntarios: {
        Row: {
          area_id: string
          created_at: string
          data_fim: string | null
          data_inicio: string
          funcao: string
          habilidades: string[] | null
          id: string
          membro_id: string
          ministerio_id: string
          nivel_experiencia: number | null
          nota_pastoral: number | null
          observacoes: string | null
          status: Database["public"]["Enums"]["atuacao_status"]
          status_voluntario: Database["public"]["Enums"]["status_voluntario"]
          total_escalas: number | null
          ultima_escala_em: string | null
          updated_at: string
        }
        Insert: {
          area_id: string
          created_at?: string
          data_fim?: string | null
          data_inicio?: string
          funcao: string
          habilidades?: string[] | null
          id?: string
          membro_id: string
          ministerio_id: string
          nivel_experiencia?: number | null
          nota_pastoral?: number | null
          observacoes?: string | null
          status?: Database["public"]["Enums"]["atuacao_status"]
          status_voluntario?: Database["public"]["Enums"]["status_voluntario"]
          total_escalas?: number | null
          ultima_escala_em?: string | null
          updated_at?: string
        }
        Update: {
          area_id?: string
          created_at?: string
          data_fim?: string | null
          data_inicio?: string
          funcao?: string
          habilidades?: string[] | null
          id?: string
          membro_id?: string
          ministerio_id?: string
          nivel_experiencia?: number | null
          nota_pastoral?: number | null
          observacoes?: string | null
          status?: Database["public"]["Enums"]["atuacao_status"]
          status_voluntario?: Database["public"]["Enums"]["status_voluntario"]
          total_escalas?: number | null
          ultima_escala_em?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "area_voluntarios_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "area_voluntarios_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "v_voluntarios_completo"
            referencedColumns: ["area_id"]
          },
          {
            foreignKeyName: "area_voluntarios_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "area_voluntarios_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "area_voluntarios_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "area_voluntarios_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "area_voluntarios_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "area_voluntarios_ministerio_id_fkey"
            columns: ["ministerio_id"]
            isOneToOne: false
            referencedRelation: "ministerios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "area_voluntarios_ministerio_id_fkey"
            columns: ["ministerio_id"]
            isOneToOne: false
            referencedRelation: "v_voluntarios_completo"
            referencedColumns: ["ministerio_id"]
          },
        ]
      }
      areas: {
        Row: {
          ativo: boolean
          co_lider_id: string | null
          cor_identidade: string | null
          created_at: string
          descricao: string | null
          dia_reuniao: string | null
          horario_reuniao: string | null
          id: string
          igreja_id: string | null
          lider_id: string | null
          max_voluntarios: number | null
          min_voluntarios: number | null
          ministerio_id: string
          nome: string
          objetivo: string | null
          sigla: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          co_lider_id?: string | null
          cor_identidade?: string | null
          created_at?: string
          descricao?: string | null
          dia_reuniao?: string | null
          horario_reuniao?: string | null
          id?: string
          igreja_id?: string | null
          lider_id?: string | null
          max_voluntarios?: number | null
          min_voluntarios?: number | null
          ministerio_id: string
          nome: string
          objetivo?: string | null
          sigla?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          co_lider_id?: string | null
          cor_identidade?: string | null
          created_at?: string
          descricao?: string | null
          dia_reuniao?: string | null
          horario_reuniao?: string | null
          id?: string
          igreja_id?: string | null
          lider_id?: string | null
          max_voluntarios?: number | null
          min_voluntarios?: number | null
          ministerio_id?: string
          nome?: string
          objetivo?: string | null
          sigla?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "areas_co_lider_id_fkey"
            columns: ["co_lider_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "areas_co_lider_id_fkey"
            columns: ["co_lider_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "areas_co_lider_id_fkey"
            columns: ["co_lider_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "areas_co_lider_id_fkey"
            columns: ["co_lider_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "areas_co_lider_id_fkey"
            columns: ["co_lider_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "areas_igreja_id_fkey"
            columns: ["igreja_id"]
            isOneToOne: false
            referencedRelation: "igrejas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "areas_igreja_id_fkey"
            columns: ["igreja_id"]
            isOneToOne: false
            referencedRelation: "v_igrejas_ativas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "areas_lider_id_fkey"
            columns: ["lider_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "areas_lider_id_fkey"
            columns: ["lider_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "areas_lider_id_fkey"
            columns: ["lider_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "areas_lider_id_fkey"
            columns: ["lider_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "areas_lider_id_fkey"
            columns: ["lider_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "areas_ministerio_id_fkey"
            columns: ["ministerio_id"]
            isOneToOne: false
            referencedRelation: "ministerios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "areas_ministerio_id_fkey"
            columns: ["ministerio_id"]
            isOneToOne: false
            referencedRelation: "v_voluntarios_completo"
            referencedColumns: ["ministerio_id"]
          },
        ]
      }
      arr_acordo_template: {
        Row: {
          ativo: boolean
          created_at: string
          espaco_id: string | null
          id: string
          texto: string
          titulo: string
          versao: number
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          espaco_id?: string | null
          id?: string
          texto: string
          titulo: string
          versao?: number
        }
        Update: {
          ativo?: boolean
          created_at?: string
          espaco_id?: string | null
          id?: string
          texto?: string
          titulo?: string
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "arr_acordo_template_espaco_id_fkey"
            columns: ["espaco_id"]
            isOneToOne: false
            referencedRelation: "arr_espacos"
            referencedColumns: ["id"]
          },
        ]
      }
      arr_caixa_operadores: {
        Row: {
          caixa_id: string
          designado_em: string | null
          designado_por: string | null
          id: string
          membro_id: string
          papel: string
        }
        Insert: {
          caixa_id: string
          designado_em?: string | null
          designado_por?: string | null
          id?: string
          membro_id: string
          papel?: string
        }
        Update: {
          caixa_id?: string
          designado_em?: string | null
          designado_por?: string | null
          id?: string
          membro_id?: string
          papel?: string
        }
        Relationships: [
          {
            foreignKeyName: "arr_caixa_operadores_caixa_id_fkey"
            columns: ["caixa_id"]
            isOneToOne: false
            referencedRelation: "arr_caixa_resumo"
            referencedColumns: ["caixa_id"]
          },
          {
            foreignKeyName: "arr_caixa_operadores_caixa_id_fkey"
            columns: ["caixa_id"]
            isOneToOne: false
            referencedRelation: "arr_caixas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arr_caixa_operadores_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arr_caixa_operadores_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arr_caixa_operadores_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arr_caixa_operadores_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arr_caixa_operadores_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
        ]
      }
      arr_caixas: {
        Row: {
          aberto_em: string
          arquivado_em: string | null
          conciliado_por: string | null
          conciliando_desde: string | null
          estado: Database["public"]["Enums"]["arr_caixa_estado"]
          fechado_em: string | null
          fechado_por: string | null
          id: string
          observacao: string | null
          reserva_id: string
          taxa_credito_pct: number
          taxa_debito_pct: number
          taxa_pix_pct: number
        }
        Insert: {
          aberto_em?: string
          arquivado_em?: string | null
          conciliado_por?: string | null
          conciliando_desde?: string | null
          estado?: Database["public"]["Enums"]["arr_caixa_estado"]
          fechado_em?: string | null
          fechado_por?: string | null
          id?: string
          observacao?: string | null
          reserva_id: string
          taxa_credito_pct: number
          taxa_debito_pct: number
          taxa_pix_pct: number
        }
        Update: {
          aberto_em?: string
          arquivado_em?: string | null
          conciliado_por?: string | null
          conciliando_desde?: string | null
          estado?: Database["public"]["Enums"]["arr_caixa_estado"]
          fechado_em?: string | null
          fechado_por?: string | null
          id?: string
          observacao?: string | null
          reserva_id?: string
          taxa_credito_pct?: number
          taxa_debito_pct?: number
          taxa_pix_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "arr_caixas_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: true
            referencedRelation: "arr_reservas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arr_caixas_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: true
            referencedRelation: "vw_arr_reservas_publica"
            referencedColumns: ["id"]
          },
        ]
      }
      arr_checklist_template: {
        Row: {
          ativo: boolean
          created_at: string | null
          espaco_id: string | null
          id: string
          item: string
          obrigatorio: boolean
          ordem: number
          tipo: Database["public"]["Enums"]["arr_checklist_tipo"]
        }
        Insert: {
          ativo?: boolean
          created_at?: string | null
          espaco_id?: string | null
          id?: string
          item: string
          obrigatorio?: boolean
          ordem?: number
          tipo?: Database["public"]["Enums"]["arr_checklist_tipo"]
        }
        Update: {
          ativo?: boolean
          created_at?: string | null
          espaco_id?: string | null
          id?: string
          item?: string
          obrigatorio?: boolean
          ordem?: number
          tipo?: Database["public"]["Enums"]["arr_checklist_tipo"]
        }
        Relationships: [
          {
            foreignKeyName: "arr_checklist_template_espaco_id_fkey"
            columns: ["espaco_id"]
            isOneToOne: false
            referencedRelation: "arr_espacos"
            referencedColumns: ["id"]
          },
        ]
      }
      arr_espacos: {
        Row: {
          ativo: boolean
          codigo: string
          created_at: string
          descricao: string | null
          dono_ministerio_id: string
          id: string
          local_id: string | null
          nome: string
          recomendacoes_default: string | null
          responsavel_manutencao_nome: string | null
          taxa_credito_pct: number
          taxa_debito_pct: number
          taxa_pix_pct: number
          updated_at: string
          whatsapp_manutencao: string | null
        }
        Insert: {
          ativo?: boolean
          codigo: string
          created_at?: string
          descricao?: string | null
          dono_ministerio_id: string
          id?: string
          local_id?: string | null
          nome: string
          recomendacoes_default?: string | null
          responsavel_manutencao_nome?: string | null
          taxa_credito_pct?: number
          taxa_debito_pct?: number
          taxa_pix_pct?: number
          updated_at?: string
          whatsapp_manutencao?: string | null
        }
        Update: {
          ativo?: boolean
          codigo?: string
          created_at?: string
          descricao?: string | null
          dono_ministerio_id?: string
          id?: string
          local_id?: string | null
          nome?: string
          recomendacoes_default?: string | null
          responsavel_manutencao_nome?: string | null
          taxa_credito_pct?: number
          taxa_debito_pct?: number
          taxa_pix_pct?: number
          updated_at?: string
          whatsapp_manutencao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "arr_espacos_dono_ministerio_id_fkey"
            columns: ["dono_ministerio_id"]
            isOneToOne: false
            referencedRelation: "ministerios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arr_espacos_dono_ministerio_id_fkey"
            columns: ["dono_ministerio_id"]
            isOneToOne: false
            referencedRelation: "v_voluntarios_completo"
            referencedColumns: ["ministerio_id"]
          },
          {
            foreignKeyName: "arr_espacos_local_id_fkey"
            columns: ["local_id"]
            isOneToOne: false
            referencedRelation: "locais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arr_espacos_local_id_fkey"
            columns: ["local_id"]
            isOneToOne: false
            referencedRelation: "v_estrutura_fisica"
            referencedColumns: ["local_id"]
          },
        ]
      }
      arr_estoque_movimentos: {
        Row: {
          id: string
          motivo: string | null
          produto_id: string
          qtd: number
          ref_id: string | null
          ref_tipo: string | null
          registrado_em: string | null
          registrado_por: string | null
          tipo: Database["public"]["Enums"]["arr_estoque_mov_tipo"]
        }
        Insert: {
          id?: string
          motivo?: string | null
          produto_id: string
          qtd: number
          ref_id?: string | null
          ref_tipo?: string | null
          registrado_em?: string | null
          registrado_por?: string | null
          tipo: Database["public"]["Enums"]["arr_estoque_mov_tipo"]
        }
        Update: {
          id?: string
          motivo?: string | null
          produto_id?: string
          qtd?: number
          ref_id?: string | null
          ref_tipo?: string | null
          registrado_em?: string | null
          registrado_por?: string | null
          tipo?: Database["public"]["Enums"]["arr_estoque_mov_tipo"]
        }
        Relationships: [
          {
            foreignKeyName: "arr_estoque_movimentos_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "arr_produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      arr_itens_venda: {
        Row: {
          descricao: string
          id: string
          preco_unit: number
          produto_id: string | null
          qtd: number
          subtotal: number
          venda_id: string
        }
        Insert: {
          descricao: string
          id?: string
          preco_unit: number
          produto_id?: string | null
          qtd?: number
          subtotal: number
          venda_id: string
        }
        Update: {
          descricao?: string
          id?: string
          preco_unit?: number
          produto_id?: string | null
          qtd?: number
          subtotal?: number
          venda_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "arr_itens_venda_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "arr_produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arr_itens_venda_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "arr_vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      arr_movimentos: {
        Row: {
          ajuste_positivo: boolean | null
          arquivado_em: string | null
          beneficiario_membro_id: string | null
          caixa_id: string
          data_movimento: string
          descricao: string
          fin_lancamento_id: string | null
          id: string
          nf_anexo_path: string | null
          nf_cnpj_emitente: string | null
          nf_emitida_em: string | null
          nf_numero: string | null
          nf_serie: string | null
          registrado_em: string | null
          registrado_por: string | null
          tipo: Database["public"]["Enums"]["arr_mov_tipo"]
          valor: number
        }
        Insert: {
          ajuste_positivo?: boolean | null
          arquivado_em?: string | null
          beneficiario_membro_id?: string | null
          caixa_id: string
          data_movimento?: string
          descricao: string
          fin_lancamento_id?: string | null
          id?: string
          nf_anexo_path?: string | null
          nf_cnpj_emitente?: string | null
          nf_emitida_em?: string | null
          nf_numero?: string | null
          nf_serie?: string | null
          registrado_em?: string | null
          registrado_por?: string | null
          tipo: Database["public"]["Enums"]["arr_mov_tipo"]
          valor: number
        }
        Update: {
          ajuste_positivo?: boolean | null
          arquivado_em?: string | null
          beneficiario_membro_id?: string | null
          caixa_id?: string
          data_movimento?: string
          descricao?: string
          fin_lancamento_id?: string | null
          id?: string
          nf_anexo_path?: string | null
          nf_cnpj_emitente?: string | null
          nf_emitida_em?: string | null
          nf_numero?: string | null
          nf_serie?: string | null
          registrado_em?: string | null
          registrado_por?: string | null
          tipo?: Database["public"]["Enums"]["arr_mov_tipo"]
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "arr_movimentos_beneficiario_membro_id_fkey"
            columns: ["beneficiario_membro_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arr_movimentos_beneficiario_membro_id_fkey"
            columns: ["beneficiario_membro_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arr_movimentos_beneficiario_membro_id_fkey"
            columns: ["beneficiario_membro_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arr_movimentos_beneficiario_membro_id_fkey"
            columns: ["beneficiario_membro_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arr_movimentos_beneficiario_membro_id_fkey"
            columns: ["beneficiario_membro_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arr_movimentos_caixa_id_fkey"
            columns: ["caixa_id"]
            isOneToOne: false
            referencedRelation: "arr_caixa_resumo"
            referencedColumns: ["caixa_id"]
          },
          {
            foreignKeyName: "arr_movimentos_caixa_id_fkey"
            columns: ["caixa_id"]
            isOneToOne: false
            referencedRelation: "arr_caixas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arr_movimentos_fin_lancamento_id_fkey"
            columns: ["fin_lancamento_id"]
            isOneToOne: false
            referencedRelation: "fin_lancamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arr_movimentos_fin_lancamento_id_fkey"
            columns: ["fin_lancamento_id"]
            isOneToOne: false
            referencedRelation: "vw_fin_proximos_vencimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      arr_problemas_manutencao: {
        Row: {
          categoria: string | null
          descricao: string | null
          espaco_id: string
          id: string
          prioridade: string
          reportado_em: string
          reportado_por: string | null
          reserva_checklist_id: string | null
          reserva_id: string | null
          resolucao_descricao: string | null
          resolvido_em: string | null
          resolvido_por: string | null
          status: string
          titulo: string
        }
        Insert: {
          categoria?: string | null
          descricao?: string | null
          espaco_id: string
          id?: string
          prioridade?: string
          reportado_em?: string
          reportado_por?: string | null
          reserva_checklist_id?: string | null
          reserva_id?: string | null
          resolucao_descricao?: string | null
          resolvido_em?: string | null
          resolvido_por?: string | null
          status?: string
          titulo: string
        }
        Update: {
          categoria?: string | null
          descricao?: string | null
          espaco_id?: string
          id?: string
          prioridade?: string
          reportado_em?: string
          reportado_por?: string | null
          reserva_checklist_id?: string | null
          reserva_id?: string | null
          resolucao_descricao?: string | null
          resolvido_em?: string | null
          resolvido_por?: string | null
          status?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "arr_problemas_manutencao_espaco_id_fkey"
            columns: ["espaco_id"]
            isOneToOne: false
            referencedRelation: "arr_espacos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arr_problemas_manutencao_reserva_checklist_id_fkey"
            columns: ["reserva_checklist_id"]
            isOneToOne: false
            referencedRelation: "arr_reserva_checklist"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arr_problemas_manutencao_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "arr_reservas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arr_problemas_manutencao_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "vw_arr_reservas_publica"
            referencedColumns: ["id"]
          },
        ]
      }
      arr_produtos: {
        Row: {
          arquivado_em: string | null
          ativo: boolean
          categoria: Database["public"]["Enums"]["arr_produto_categoria"]
          codigo: string | null
          created_at: string | null
          espaco_id: string
          estoque_atual: number | null
          estoque_minimo: number | null
          id: string
          nome: string
          observacao: string | null
          preco_sugerido: number
          reserva_id: string | null
          subcategoria: string | null
          updated_at: string | null
        }
        Insert: {
          arquivado_em?: string | null
          ativo?: boolean
          categoria: Database["public"]["Enums"]["arr_produto_categoria"]
          codigo?: string | null
          created_at?: string | null
          espaco_id: string
          estoque_atual?: number | null
          estoque_minimo?: number | null
          id?: string
          nome: string
          observacao?: string | null
          preco_sugerido: number
          reserva_id?: string | null
          subcategoria?: string | null
          updated_at?: string | null
        }
        Update: {
          arquivado_em?: string | null
          ativo?: boolean
          categoria?: Database["public"]["Enums"]["arr_produto_categoria"]
          codigo?: string | null
          created_at?: string | null
          espaco_id?: string
          estoque_atual?: number | null
          estoque_minimo?: number | null
          id?: string
          nome?: string
          observacao?: string | null
          preco_sugerido?: number
          reserva_id?: string | null
          subcategoria?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "arr_produtos_espaco_id_fkey"
            columns: ["espaco_id"]
            isOneToOne: false
            referencedRelation: "arr_espacos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arr_produtos_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "arr_reservas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arr_produtos_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "vw_arr_reservas_publica"
            referencedColumns: ["id"]
          },
        ]
      }
      arr_reserva_checklist: {
        Row: {
          id: string
          item: string
          obrigatorio: boolean
          observacao: string | null
          ok: boolean
          ok_em: string | null
          ok_por: string | null
          ordem: number
          problema_reportado: boolean
          reserva_id: string
          template_id: string | null
          tipo: Database["public"]["Enums"]["arr_checklist_tipo"]
        }
        Insert: {
          id?: string
          item: string
          obrigatorio?: boolean
          observacao?: string | null
          ok?: boolean
          ok_em?: string | null
          ok_por?: string | null
          ordem?: number
          problema_reportado?: boolean
          reserva_id: string
          template_id?: string | null
          tipo?: Database["public"]["Enums"]["arr_checklist_tipo"]
        }
        Update: {
          id?: string
          item?: string
          obrigatorio?: boolean
          observacao?: string | null
          ok?: boolean
          ok_em?: string | null
          ok_por?: string | null
          ordem?: number
          problema_reportado?: boolean
          reserva_id?: string
          template_id?: string | null
          tipo?: Database["public"]["Enums"]["arr_checklist_tipo"]
        }
        Relationships: [
          {
            foreignKeyName: "arr_reserva_checklist_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "arr_reservas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arr_reserva_checklist_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "vw_arr_reservas_publica"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arr_reserva_checklist_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "arr_checklist_template"
            referencedColumns: ["id"]
          },
        ]
      }
      arr_reservas: {
        Row: {
          acordo_enviado_em: string | null
          acordo_enviado_por: string | null
          acordo_template_id: string | null
          acordo_texto: string | null
          aprovada_em: string | null
          aprovada_por: string | null
          area_solicitante_id: string
          arquivado_em: string | null
          centro_custo_id: string
          created_at: string
          espaco_id: string
          finalidade: string
          id: string
          motivo_recusa: string | null
          observacoes: string | null
          periodo: unknown
          responsavel_id: string
          solicitada_em: string
          solicitada_por: string
          status: Database["public"]["Enums"]["arr_reserva_status"]
          updated_at: string
        }
        Insert: {
          acordo_enviado_em?: string | null
          acordo_enviado_por?: string | null
          acordo_template_id?: string | null
          acordo_texto?: string | null
          aprovada_em?: string | null
          aprovada_por?: string | null
          area_solicitante_id: string
          arquivado_em?: string | null
          centro_custo_id: string
          created_at?: string
          espaco_id: string
          finalidade: string
          id?: string
          motivo_recusa?: string | null
          observacoes?: string | null
          periodo: unknown
          responsavel_id: string
          solicitada_em?: string
          solicitada_por: string
          status?: Database["public"]["Enums"]["arr_reserva_status"]
          updated_at?: string
        }
        Update: {
          acordo_enviado_em?: string | null
          acordo_enviado_por?: string | null
          acordo_template_id?: string | null
          acordo_texto?: string | null
          aprovada_em?: string | null
          aprovada_por?: string | null
          area_solicitante_id?: string
          arquivado_em?: string | null
          centro_custo_id?: string
          created_at?: string
          espaco_id?: string
          finalidade?: string
          id?: string
          motivo_recusa?: string | null
          observacoes?: string | null
          periodo?: unknown
          responsavel_id?: string
          solicitada_em?: string
          solicitada_por?: string
          status?: Database["public"]["Enums"]["arr_reserva_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "arr_reservas_acordo_template_id_fkey"
            columns: ["acordo_template_id"]
            isOneToOne: false
            referencedRelation: "arr_acordo_template"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arr_reservas_area_solicitante_id_fkey"
            columns: ["area_solicitante_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arr_reservas_area_solicitante_id_fkey"
            columns: ["area_solicitante_id"]
            isOneToOne: false
            referencedRelation: "v_voluntarios_completo"
            referencedColumns: ["area_id"]
          },
          {
            foreignKeyName: "arr_reservas_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "fin_centros_custo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arr_reservas_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "vw_fin_centros_resumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arr_reservas_espaco_id_fkey"
            columns: ["espaco_id"]
            isOneToOne: false
            referencedRelation: "arr_espacos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arr_reservas_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arr_reservas_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arr_reservas_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arr_reservas_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arr_reservas_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
        ]
      }
      arr_vendas: {
        Row: {
          arquivado_em: string | null
          caixa_id: string
          cancelada: boolean
          cancelada_em: string | null
          cancelada_por: string | null
          cliente_nome: string | null
          data_venda: string
          forma_pagamento: Database["public"]["Enums"]["arr_forma_pgto"]
          id: string
          motivo_cancelamento: string | null
          observacao: string | null
          operador_id: string | null
          registrada_por: string | null
          valor_total: number
        }
        Insert: {
          arquivado_em?: string | null
          caixa_id: string
          cancelada?: boolean
          cancelada_em?: string | null
          cancelada_por?: string | null
          cliente_nome?: string | null
          data_venda?: string
          forma_pagamento: Database["public"]["Enums"]["arr_forma_pgto"]
          id?: string
          motivo_cancelamento?: string | null
          observacao?: string | null
          operador_id?: string | null
          registrada_por?: string | null
          valor_total: number
        }
        Update: {
          arquivado_em?: string | null
          caixa_id?: string
          cancelada?: boolean
          cancelada_em?: string | null
          cancelada_por?: string | null
          cliente_nome?: string | null
          data_venda?: string
          forma_pagamento?: Database["public"]["Enums"]["arr_forma_pgto"]
          id?: string
          motivo_cancelamento?: string | null
          observacao?: string | null
          operador_id?: string | null
          registrada_por?: string | null
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "arr_vendas_caixa_id_fkey"
            columns: ["caixa_id"]
            isOneToOne: false
            referencedRelation: "arr_caixa_resumo"
            referencedColumns: ["caixa_id"]
          },
          {
            foreignKeyName: "arr_vendas_caixa_id_fkey"
            columns: ["caixa_id"]
            isOneToOne: false
            referencedRelation: "arr_caixas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arr_vendas_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arr_vendas_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arr_vendas_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arr_vendas_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arr_vendas_operador_id_fkey"
            columns: ["operador_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
        ]
      }
      assinaturas_oficiais: {
        Row: {
          ativo: boolean
          cargo: string
          created_at: string
          id: string
          imagem_url: string | null
          observacao: string | null
          ordem: number | null
          pessoa_id: string | null
          pessoa_nome: string
        }
        Insert: {
          ativo?: boolean
          cargo: string
          created_at?: string
          id?: string
          imagem_url?: string | null
          observacao?: string | null
          ordem?: number | null
          pessoa_id?: string | null
          pessoa_nome: string
        }
        Update: {
          ativo?: boolean
          cargo?: string
          created_at?: string
          id?: string
          imagem_url?: string | null
          observacao?: string | null
          ordem?: number | null
          pessoa_id?: string | null
          pessoa_nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "assinaturas_oficiais_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assinaturas_oficiais_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assinaturas_oficiais_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assinaturas_oficiais_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assinaturas_oficiais_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
        ]
      }
      assuntos: {
        Row: {
          created_at: string
          created_by: string | null
          data_conclusao: string | null
          data_criacao: string
          descricao: string | null
          id: string
          observacao_conclusao: string | null
          origem: string
          prazo: string | null
          prioridade: Database["public"]["Enums"]["assunto_prioridade"]
          responsavel_id: string | null
          responsavel_nome: string | null
          reuniao_origem_id: string | null
          status: Database["public"]["Enums"]["assunto_status"]
          titulo: string
          ultima_atualizacao_em: string | null
          updated_at: string
          vezes_discutido: number
          vinculo_descricao: string | null
          vinculo_id: string | null
          vinculo_tipo: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data_conclusao?: string | null
          data_criacao?: string
          descricao?: string | null
          id?: string
          observacao_conclusao?: string | null
          origem?: string
          prazo?: string | null
          prioridade?: Database["public"]["Enums"]["assunto_prioridade"]
          responsavel_id?: string | null
          responsavel_nome?: string | null
          reuniao_origem_id?: string | null
          status?: Database["public"]["Enums"]["assunto_status"]
          titulo: string
          ultima_atualizacao_em?: string | null
          updated_at?: string
          vezes_discutido?: number
          vinculo_descricao?: string | null
          vinculo_id?: string | null
          vinculo_tipo?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data_conclusao?: string | null
          data_criacao?: string
          descricao?: string | null
          id?: string
          observacao_conclusao?: string | null
          origem?: string
          prazo?: string | null
          prioridade?: Database["public"]["Enums"]["assunto_prioridade"]
          responsavel_id?: string | null
          responsavel_nome?: string | null
          reuniao_origem_id?: string | null
          status?: Database["public"]["Enums"]["assunto_status"]
          titulo?: string
          ultima_atualizacao_em?: string | null
          updated_at?: string
          vezes_discutido?: number
          vinculo_descricao?: string | null
          vinculo_id?: string | null
          vinculo_tipo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assuntos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assuntos_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assuntos_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assuntos_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assuntos_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assuntos_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assuntos_reuniao_origem_id_fkey"
            columns: ["reuniao_origem_id"]
            isOneToOne: false
            referencedRelation: "gov_reunioes"
            referencedColumns: ["id"]
          },
        ]
      }
      assuntos_historico: {
        Row: {
          acao: string
          assunto_id: string
          created_at: string
          descricao: string | null
          id: string
          metadata: Json | null
          user_id: string | null
          user_nome: string | null
        }
        Insert: {
          acao: string
          assunto_id: string
          created_at?: string
          descricao?: string | null
          id?: string
          metadata?: Json | null
          user_id?: string | null
          user_nome?: string | null
        }
        Update: {
          acao?: string
          assunto_id?: string
          created_at?: string
          descricao?: string | null
          id?: string
          metadata?: Json | null
          user_id?: string | null
          user_nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assuntos_historico_assunto_id_fkey"
            columns: ["assunto_id"]
            isOneToOne: false
            referencedRelation: "assuntos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assuntos_historico_assunto_id_fkey"
            columns: ["assunto_id"]
            isOneToOne: false
            referencedRelation: "vw_assuntos_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assuntos_historico_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          acao: string
          data: string
          detalhes: Json | null
          executado_por: string | null
          id: string
          ip: string | null
          pessoa_id: string | null
          user_id: string | null
        }
        Insert: {
          acao: string
          data?: string
          detalhes?: Json | null
          executado_por?: string | null
          id?: string
          ip?: string | null
          pessoa_id?: string | null
          user_id?: string | null
        }
        Update: {
          acao?: string
          data?: string
          detalhes?: Json | null
          executado_por?: string | null
          id?: string
          ip?: string | null
          pessoa_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
        ]
      }
      bazar_reservas: {
        Row: {
          area_id: string | null
          created_at: string | null
          data: string
          id: string
          ministerio_id: string | null
          responsavel: string | null
          status: string | null
          tipo: string | null
        }
        Insert: {
          area_id?: string | null
          created_at?: string | null
          data: string
          id?: string
          ministerio_id?: string | null
          responsavel?: string | null
          status?: string | null
          tipo?: string | null
        }
        Update: {
          area_id?: string | null
          created_at?: string | null
          data?: string
          id?: string
          ministerio_id?: string | null
          responsavel?: string | null
          status?: string | null
          tipo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bazar_reservas_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bazar_reservas_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "v_voluntarios_completo"
            referencedColumns: ["area_id"]
          },
          {
            foreignKeyName: "bazar_reservas_ministerio_id_fkey"
            columns: ["ministerio_id"]
            isOneToOne: false
            referencedRelation: "ministerios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bazar_reservas_ministerio_id_fkey"
            columns: ["ministerio_id"]
            isOneToOne: false
            referencedRelation: "v_voluntarios_completo"
            referencedColumns: ["ministerio_id"]
          },
        ]
      }
      campanha_materiais: {
        Row: {
          campanha_id: string
          created_at: string
          dia_numero: number | null
          id: string
          nome_arquivo: string
          ordem: number
          storage_path: string
          tema: string | null
          tipo_arquivo: string
          url_publica: string | null
        }
        Insert: {
          campanha_id: string
          created_at?: string
          dia_numero?: number | null
          id?: string
          nome_arquivo: string
          ordem?: number
          storage_path: string
          tema?: string | null
          tipo_arquivo?: string
          url_publica?: string | null
        }
        Update: {
          campanha_id?: string
          created_at?: string
          dia_numero?: number | null
          id?: string
          nome_arquivo?: string
          ordem?: number
          storage_path?: string
          tema?: string | null
          tipo_arquivo?: string
          url_publica?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campanha_materiais_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "campanhas"
            referencedColumns: ["id"]
          },
        ]
      }
      campanha_notificacoes: {
        Row: {
          campanha_id: string
          created_at: string
          data_envio: string
          enviada: boolean
          enviada_em: string | null
          id: string
          mensagem: string | null
          tipo: string
        }
        Insert: {
          campanha_id: string
          created_at?: string
          data_envio: string
          enviada?: boolean
          enviada_em?: string | null
          id?: string
          mensagem?: string | null
          tipo?: string
        }
        Update: {
          campanha_id?: string
          created_at?: string
          data_envio?: string
          enviada?: boolean
          enviada_em?: string | null
          id?: string
          mensagem?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "campanha_notificacoes_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "campanhas"
            referencedColumns: ["id"]
          },
        ]
      }
      campanhas: {
        Row: {
          contexto_espiritual: string | null
          cor_tema: string | null
          created_at: string
          criado_por: string | null
          data_fim: string
          data_inicio: string
          descricao: string | null
          id: string
          ministerio_id: string | null
          nome: string
          origem_identidade: string | null
          origem_valor_id: string | null
          prioridade: number
          status: string
          tipo: string
          updated_at: string
        }
        Insert: {
          contexto_espiritual?: string | null
          cor_tema?: string | null
          created_at?: string
          criado_por?: string | null
          data_fim: string
          data_inicio: string
          descricao?: string | null
          id?: string
          ministerio_id?: string | null
          nome: string
          origem_identidade?: string | null
          origem_valor_id?: string | null
          prioridade?: number
          status?: string
          tipo?: string
          updated_at?: string
        }
        Update: {
          contexto_espiritual?: string | null
          cor_tema?: string | null
          created_at?: string
          criado_por?: string | null
          data_fim?: string
          data_inicio?: string
          descricao?: string | null
          id?: string
          ministerio_id?: string | null
          nome?: string
          origem_identidade?: string | null
          origem_valor_id?: string | null
          prioridade?: number
          status?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campanhas_ministerio_id_fkey"
            columns: ["ministerio_id"]
            isOneToOne: false
            referencedRelation: "ministerios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campanhas_ministerio_id_fkey"
            columns: ["ministerio_id"]
            isOneToOne: false
            referencedRelation: "v_voluntarios_completo"
            referencedColumns: ["ministerio_id"]
          },
          {
            foreignKeyName: "campanhas_origem_valor_id_fkey"
            columns: ["origem_valor_id"]
            isOneToOne: false
            referencedRelation: "identidade_valores"
            referencedColumns: ["id"]
          },
        ]
      }
      cargos_estatutarios: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          descricao: string | null
          id: string
          nivel: number
          nome: string
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          descricao?: string | null
          id?: string
          nivel?: number
          nome: string
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          descricao?: string | null
          id?: string
          nivel?: number
          nome?: string
        }
        Relationships: []
      }
      cargos_institucionais: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string | null
          eletivo: boolean
          id: string
          mandato_anos: number | null
          nivel_id: number
          nome: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          eletivo?: boolean
          id?: string
          mandato_anos?: number | null
          nivel_id: number
          nome: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          eletivo?: boolean
          id?: string
          mandato_anos?: number | null
          nivel_id?: number
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "cargos_institucionais_nivel_id_fkey"
            columns: ["nivel_id"]
            isOneToOne: false
            referencedRelation: "niveis_organizacionais"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_area: {
        Row: {
          area_id: string
          ativo: boolean
          created_at: string
          descricao: string | null
          id: string
          nome_tarefa: string
          obrigatoria: boolean
          ordem: number
        }
        Insert: {
          area_id: string
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          nome_tarefa: string
          obrigatoria?: boolean
          ordem?: number
        }
        Update: {
          area_id?: string
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          id?: string
          nome_tarefa?: string
          obrigatoria?: boolean
          ordem?: number
        }
        Relationships: [
          {
            foreignKeyName: "checklist_area_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_area_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "v_voluntarios_completo"
            referencedColumns: ["area_id"]
          },
        ]
      }
      checklist_execucao: {
        Row: {
          created_at: string
          escala_id: string
          executado_em: string | null
          executado_por: string | null
          id: string
          observacao: string | null
          status: Database["public"]["Enums"]["status_checklist"]
          tarefa_id: string
        }
        Insert: {
          created_at?: string
          escala_id: string
          executado_em?: string | null
          executado_por?: string | null
          id?: string
          observacao?: string | null
          status?: Database["public"]["Enums"]["status_checklist"]
          tarefa_id: string
        }
        Update: {
          created_at?: string
          escala_id?: string
          executado_em?: string | null
          executado_por?: string | null
          id?: string
          observacao?: string | null
          status?: Database["public"]["Enums"]["status_checklist"]
          tarefa_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_execucao_escala_id_fkey"
            columns: ["escala_id"]
            isOneToOne: false
            referencedRelation: "escalas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_execucao_escala_id_fkey"
            columns: ["escala_id"]
            isOneToOne: false
            referencedRelation: "v_minha_escala"
            referencedColumns: ["escala_id"]
          },
          {
            foreignKeyName: "checklist_execucao_escala_id_fkey"
            columns: ["escala_id"]
            isOneToOne: false
            referencedRelation: "v_proximas_escalas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_execucao_executado_por_fkey"
            columns: ["executado_por"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_execucao_executado_por_fkey"
            columns: ["executado_por"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_execucao_executado_por_fkey"
            columns: ["executado_por"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_execucao_executado_por_fkey"
            columns: ["executado_por"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_execucao_executado_por_fkey"
            columns: ["executado_por"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_execucao_tarefa_id_fkey"
            columns: ["tarefa_id"]
            isOneToOne: false
            referencedRelation: "checklist_area"
            referencedColumns: ["id"]
          },
        ]
      }
      classificacao_campos: {
        Row: {
          campo: string
          descricao: string | null
          id: string
          nivel: string
          tabela: string
        }
        Insert: {
          campo: string
          descricao?: string | null
          id?: string
          nivel: string
          tabela: string
        }
        Update: {
          campo?: string
          descricao?: string | null
          id?: string
          nivel?: string
          tabela?: string
        }
        Relationships: []
      }
      congregacoes: {
        Row: {
          ativa: boolean
          bairro: string | null
          cep: string | null
          cidade: string | null
          created_at: string
          endereco: string | null
          id: string
          nome: string
          pastor_responsavel: string | null
          sede_principal: boolean
          sigla: string | null
          telefone: string | null
          updated_at: string
        }
        Insert: {
          ativa?: boolean
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          created_at?: string
          endereco?: string | null
          id?: string
          nome: string
          pastor_responsavel?: string | null
          sede_principal?: boolean
          sigla?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          ativa?: boolean
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          created_at?: string
          endereco?: string | null
          id?: string
          nome?: string
          pastor_responsavel?: string | null
          sede_principal?: boolean
          sigla?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      consentimento: {
        Row: {
          aceito: boolean
          auth_user_id: string | null
          base_legal: string
          canal: string | null
          created_at: string | null
          finalidade: string | null
          id: string
          ip_origem: string | null
          pessoa_id: string | null
          registrado_em: string
          registrado_por: string | null
          revogado_em: string | null
          texto_politica: string | null
          texto_versao: string
          tipo: string
        }
        Insert: {
          aceito?: boolean
          auth_user_id?: string | null
          base_legal?: string
          canal?: string | null
          created_at?: string | null
          finalidade?: string | null
          id?: string
          ip_origem?: string | null
          pessoa_id?: string | null
          registrado_em?: string
          registrado_por?: string | null
          revogado_em?: string | null
          texto_politica?: string | null
          texto_versao?: string
          tipo?: string
        }
        Update: {
          aceito?: boolean
          auth_user_id?: string | null
          base_legal?: string
          canal?: string | null
          created_at?: string | null
          finalidade?: string | null
          id?: string
          ip_origem?: string | null
          pessoa_id?: string | null
          registrado_em?: string
          registrado_por?: string | null
          revogado_em?: string | null
          texto_politica?: string | null
          texto_versao?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "consentimento_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
        ]
      }
      convites_acesso: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string
          pessoa_id: string | null
          role: Database["public"]["Enums"]["app_role"] | null
          tipo: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at: string
          pessoa_id?: string | null
          role?: Database["public"]["Enums"]["app_role"] | null
          tipo: string
          token?: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          pessoa_id?: string | null
          role?: Database["public"]["Enums"]["app_role"] | null
          tipo?: string
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "convites_acesso_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "convites_acesso_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "convites_acesso_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "convites_acesso_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "convites_acesso_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
        ]
      }
      documento_estrutura: {
        Row: {
          ativo: boolean
          base_institucional: string | null
          created_at: string
          criado_por: string | null
          descricao: string | null
          documento_id: string | null
          id: string
          igreja_id: string
          nivel: string
          nome: string
          ordem: number
          referencia_documento: string | null
          responsabilidades: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          base_institucional?: string | null
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          documento_id?: string | null
          id?: string
          igreja_id: string
          nivel?: string
          nome: string
          ordem?: number
          referencia_documento?: string | null
          responsabilidades?: string | null
          tipo?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          base_institucional?: string | null
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          documento_id?: string | null
          id?: string
          igreja_id?: string
          nivel?: string
          nome?: string
          ordem?: number
          referencia_documento?: string | null
          responsabilidades?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documento_estrutura_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documento_estrutura_igreja_id_fkey"
            columns: ["igreja_id"]
            isOneToOne: false
            referencedRelation: "identidade_igreja"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          arquivo_mime: string | null
          arquivo_nome: string | null
          arquivo_storage_path: string | null
          arquivo_tamanho_bytes: number | null
          arquivo_url: string | null
          conteudo: string | null
          created_at: string
          id: string
          igreja_id: string
          ingestao_em: string | null
          ingestao_erro: string | null
          ingestao_status: string | null
          texto_extraido: string | null
          tipo: string
          titulo: string
          updated_at: string
          versao: string
          vigente: boolean
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          arquivo_mime?: string | null
          arquivo_nome?: string | null
          arquivo_storage_path?: string | null
          arquivo_tamanho_bytes?: number | null
          arquivo_url?: string | null
          conteudo?: string | null
          created_at?: string
          id?: string
          igreja_id?: string
          ingestao_em?: string | null
          ingestao_erro?: string | null
          ingestao_status?: string | null
          texto_extraido?: string | null
          tipo: string
          titulo: string
          updated_at?: string
          versao?: string
          vigente?: boolean
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          arquivo_mime?: string | null
          arquivo_nome?: string | null
          arquivo_storage_path?: string | null
          arquivo_tamanho_bytes?: number | null
          arquivo_url?: string | null
          conteudo?: string | null
          created_at?: string
          id?: string
          igreja_id?: string
          ingestao_em?: string | null
          ingestao_erro?: string | null
          ingestao_status?: string | null
          texto_extraido?: string | null
          tipo?: string
          titulo?: string
          updated_at?: string
          versao?: string
          vigente?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "documentos_igreja_id_fkey"
            columns: ["igreja_id"]
            isOneToOne: false
            referencedRelation: "igrejas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_igreja_id_fkey"
            columns: ["igreja_id"]
            isOneToOne: false
            referencedRelation: "v_igrejas_ativas"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos_fiscais: {
        Row: {
          arquivo_url: string | null
          data_emissao: string | null
          fornecedor: string | null
          id: string
          solicitacao_id: string | null
          tipo: string | null
          valor: number | null
        }
        Insert: {
          arquivo_url?: string | null
          data_emissao?: string | null
          fornecedor?: string | null
          id?: string
          solicitacao_id?: string | null
          tipo?: string | null
          valor?: number | null
        }
        Update: {
          arquivo_url?: string | null
          data_emissao?: string | null
          fornecedor?: string | null
          id?: string
          solicitacao_id?: string | null
          tipo?: string | null
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "documentos_fiscais_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "fin_solicitacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos_historico: {
        Row: {
          acao: string
          created_at: string
          documento_id: string
          id: string
          observacao: string | null
          titulo_doc: string | null
          usuario_email: string | null
          usuario_id: string | null
          versao_de: string | null
          versao_para: string | null
        }
        Insert: {
          acao: string
          created_at?: string
          documento_id: string
          id?: string
          observacao?: string | null
          titulo_doc?: string | null
          usuario_email?: string | null
          usuario_id?: string | null
          versao_de?: string | null
          versao_para?: string | null
        }
        Update: {
          acao?: string
          created_at?: string
          documento_id?: string
          id?: string
          observacao?: string | null
          titulo_doc?: string | null
          usuario_email?: string | null
          usuario_id?: string | null
          versao_de?: string | null
          versao_para?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documentos_historico_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
        ]
      }
      ebd_aulas: {
        Row: {
          classe_id: string
          created_at: string | null
          created_by: string | null
          data: string
          foto_url: string | null
          id: string
          observacoes: string | null
          professor_id: string | null
          tema: string | null
        }
        Insert: {
          classe_id: string
          created_at?: string | null
          created_by?: string | null
          data: string
          foto_url?: string | null
          id?: string
          observacoes?: string | null
          professor_id?: string | null
          tema?: string | null
        }
        Update: {
          classe_id?: string
          created_at?: string | null
          created_by?: string | null
          data?: string
          foto_url?: string | null
          id?: string
          observacoes?: string | null
          professor_id?: string | null
          tema?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ebd_aulas_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "ebd_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ebd_aulas_professor_id_fkey"
            columns: ["professor_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ebd_aulas_professor_id_fkey"
            columns: ["professor_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ebd_aulas_professor_id_fkey"
            columns: ["professor_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ebd_aulas_professor_id_fkey"
            columns: ["professor_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ebd_aulas_professor_id_fkey"
            columns: ["professor_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
        ]
      }
      ebd_campanhas: {
        Row: {
          ativo: boolean
          classe_id: string | null
          created_at: string | null
          created_by: string | null
          data_fim: string
          data_inicio: string
          descricao: string | null
          id: string
          meta_valor: number
          nome: string
        }
        Insert: {
          ativo?: boolean
          classe_id?: string | null
          created_at?: string | null
          created_by?: string | null
          data_fim: string
          data_inicio: string
          descricao?: string | null
          id?: string
          meta_valor: number
          nome: string
        }
        Update: {
          ativo?: boolean
          classe_id?: string | null
          created_at?: string | null
          created_by?: string | null
          data_fim?: string
          data_inicio?: string
          descricao?: string | null
          id?: string
          meta_valor?: number
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "ebd_campanhas_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "ebd_classes"
            referencedColumns: ["id"]
          },
        ]
      }
      ebd_classes: {
        Row: {
          ativo: boolean
          cor: string | null
          created_at: string | null
          descricao: string | null
          genero: string
          id: string
          idade_max: number | null
          idade_min: number | null
          nome: string
          ordem: number
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean
          cor?: string | null
          created_at?: string | null
          descricao?: string | null
          genero?: string
          id?: string
          idade_max?: number | null
          idade_min?: number | null
          nome: string
          ordem?: number
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean
          cor?: string | null
          created_at?: string | null
          descricao?: string | null
          genero?: string
          id?: string
          idade_max?: number | null
          idade_min?: number | null
          nome?: string
          ordem?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      ebd_entradas: {
        Row: {
          campanha_id: string
          comprovante_url: string | null
          created_at: string | null
          data: string
          descricao: string | null
          forma: string
          id: string
          registrado_por: string | null
          tipo: string
          valor: number
        }
        Insert: {
          campanha_id: string
          comprovante_url?: string | null
          created_at?: string | null
          data?: string
          descricao?: string | null
          forma: string
          id?: string
          registrado_por?: string | null
          tipo: string
          valor: number
        }
        Update: {
          campanha_id?: string
          comprovante_url?: string | null
          created_at?: string | null
          data?: string
          descricao?: string | null
          forma?: string
          id?: string
          registrado_por?: string | null
          tipo?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "ebd_entradas_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "ebd_campanhas"
            referencedColumns: ["id"]
          },
        ]
      }
      ebd_matriculas: {
        Row: {
          ativo: boolean
          classe_id: string
          created_at: string | null
          data_matricula: string
          id: string
          pessoa_id: string
          progressao_dispensada_em: string | null
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean
          classe_id: string
          created_at?: string | null
          data_matricula?: string
          id?: string
          pessoa_id: string
          progressao_dispensada_em?: string | null
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean
          classe_id?: string
          created_at?: string | null
          data_matricula?: string
          id?: string
          pessoa_id?: string
          progressao_dispensada_em?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ebd_matriculas_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "ebd_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ebd_matriculas_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ebd_matriculas_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ebd_matriculas_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ebd_matriculas_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ebd_matriculas_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
        ]
      }
      ebd_presencas: {
        Row: {
          aula_id: string
          created_at: string | null
          eh_visitante: boolean
          id: string
          observacao: string | null
          pessoa_id: string
          presente: boolean
          registrado_por: string | null
        }
        Insert: {
          aula_id: string
          created_at?: string | null
          eh_visitante?: boolean
          id?: string
          observacao?: string | null
          pessoa_id: string
          presente?: boolean
          registrado_por?: string | null
        }
        Update: {
          aula_id?: string
          created_at?: string | null
          eh_visitante?: boolean
          id?: string
          observacao?: string | null
          pessoa_id?: string
          presente?: boolean
          registrado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ebd_presencas_aula_id_fkey"
            columns: ["aula_id"]
            isOneToOne: false
            referencedRelation: "ebd_aulas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ebd_presencas_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ebd_presencas_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ebd_presencas_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ebd_presencas_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ebd_presencas_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
        ]
      }
      ebd_professores: {
        Row: {
          ativo: boolean
          classe_id: string
          created_at: string | null
          desde: string
          id: string
          pessoa_id: string
          tipo: string
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean
          classe_id: string
          created_at?: string | null
          desde?: string
          id?: string
          pessoa_id: string
          tipo?: string
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean
          classe_id?: string
          created_at?: string | null
          desde?: string
          id?: string
          pessoa_id?: string
          tipo?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ebd_professores_classe_id_fkey"
            columns: ["classe_id"]
            isOneToOne: false
            referencedRelation: "ebd_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ebd_professores_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ebd_professores_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ebd_professores_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ebd_professores_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ebd_professores_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
        ]
      }
      escala_participantes: {
        Row: {
          confirmado: boolean | null
          created_at: string | null
          data_slot: string | null
          escala_id: string
          funcao: string | null
          id: string
          observacao: string | null
          pessoa_id: string
        }
        Insert: {
          confirmado?: boolean | null
          created_at?: string | null
          data_slot?: string | null
          escala_id: string
          funcao?: string | null
          id?: string
          observacao?: string | null
          pessoa_id: string
        }
        Update: {
          confirmado?: boolean | null
          created_at?: string | null
          data_slot?: string | null
          escala_id?: string
          funcao?: string | null
          id?: string
          observacao?: string | null
          pessoa_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "escala_participantes_escala_id_fkey"
            columns: ["escala_id"]
            isOneToOne: false
            referencedRelation: "escalas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escala_participantes_escala_id_fkey"
            columns: ["escala_id"]
            isOneToOne: false
            referencedRelation: "v_minha_escala"
            referencedColumns: ["escala_id"]
          },
          {
            foreignKeyName: "escala_participantes_escala_id_fkey"
            columns: ["escala_id"]
            isOneToOne: false
            referencedRelation: "v_proximas_escalas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escala_participantes_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escala_participantes_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escala_participantes_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escala_participantes_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escala_participantes_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
        ]
      }
      escala_voluntarios: {
        Row: {
          area_id: string | null
          confirmado_presenca: boolean | null
          created_at: string
          escala_id: string
          funcao: string | null
          hora_chegada: string | null
          id: string
          motivo_recusa: string | null
          notificado_em: string | null
          observacoes: string | null
          pessoa_id: string
          respondido_em: string | null
          score_sugestao: number | null
          status: Database["public"]["Enums"]["status_presenca_escala"]
          sugerido_automaticamente: boolean
          updated_at: string
        }
        Insert: {
          area_id?: string | null
          confirmado_presenca?: boolean | null
          created_at?: string
          escala_id: string
          funcao?: string | null
          hora_chegada?: string | null
          id?: string
          motivo_recusa?: string | null
          notificado_em?: string | null
          observacoes?: string | null
          pessoa_id: string
          respondido_em?: string | null
          score_sugestao?: number | null
          status?: Database["public"]["Enums"]["status_presenca_escala"]
          sugerido_automaticamente?: boolean
          updated_at?: string
        }
        Update: {
          area_id?: string | null
          confirmado_presenca?: boolean | null
          created_at?: string
          escala_id?: string
          funcao?: string | null
          hora_chegada?: string | null
          id?: string
          motivo_recusa?: string | null
          notificado_em?: string | null
          observacoes?: string | null
          pessoa_id?: string
          respondido_em?: string | null
          score_sugestao?: number | null
          status?: Database["public"]["Enums"]["status_presenca_escala"]
          sugerido_automaticamente?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "escala_voluntarios_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escala_voluntarios_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "v_voluntarios_completo"
            referencedColumns: ["area_id"]
          },
          {
            foreignKeyName: "escala_voluntarios_escala_id_fkey"
            columns: ["escala_id"]
            isOneToOne: false
            referencedRelation: "escalas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escala_voluntarios_escala_id_fkey"
            columns: ["escala_id"]
            isOneToOne: false
            referencedRelation: "v_minha_escala"
            referencedColumns: ["escala_id"]
          },
          {
            foreignKeyName: "escala_voluntarios_escala_id_fkey"
            columns: ["escala_id"]
            isOneToOne: false
            referencedRelation: "v_proximas_escalas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escala_voluntarios_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escala_voluntarios_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escala_voluntarios_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escala_voluntarios_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escala_voluntarios_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
        ]
      }
      escalas: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          area_id: string
          created_at: string
          criado_por: string | null
          data_evento: string
          descricao: string | null
          evento_id: string | null
          hora_fim: string | null
          hora_inicio: string | null
          id: string
          igreja_id: string | null
          lembrete_enviado_em: string | null
          local: string | null
          ministerio_id: string | null
          notificacao_enviada_em: string | null
          status: Database["public"]["Enums"]["status_escala"]
          titulo: string
          updated_at: string
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          area_id: string
          created_at?: string
          criado_por?: string | null
          data_evento: string
          descricao?: string | null
          evento_id?: string | null
          hora_fim?: string | null
          hora_inicio?: string | null
          id?: string
          igreja_id?: string | null
          lembrete_enviado_em?: string | null
          local?: string | null
          ministerio_id?: string | null
          notificacao_enviada_em?: string | null
          status?: Database["public"]["Enums"]["status_escala"]
          titulo: string
          updated_at?: string
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          area_id?: string
          created_at?: string
          criado_por?: string | null
          data_evento?: string
          descricao?: string | null
          evento_id?: string | null
          hora_fim?: string | null
          hora_inicio?: string | null
          id?: string
          igreja_id?: string | null
          lembrete_enviado_em?: string | null
          local?: string | null
          ministerio_id?: string | null
          notificacao_enviada_em?: string | null
          status?: Database["public"]["Enums"]["status_escala"]
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "escalas_aprovado_por_fkey"
            columns: ["aprovado_por"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalas_aprovado_por_fkey"
            columns: ["aprovado_por"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalas_aprovado_por_fkey"
            columns: ["aprovado_por"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalas_aprovado_por_fkey"
            columns: ["aprovado_por"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalas_aprovado_por_fkey"
            columns: ["aprovado_por"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalas_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalas_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "v_voluntarios_completo"
            referencedColumns: ["area_id"]
          },
          {
            foreignKeyName: "escalas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalas_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "eventos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalas_igreja_id_fkey"
            columns: ["igreja_id"]
            isOneToOne: false
            referencedRelation: "igrejas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalas_igreja_id_fkey"
            columns: ["igreja_id"]
            isOneToOne: false
            referencedRelation: "v_igrejas_ativas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalas_ministerio_id_fkey"
            columns: ["ministerio_id"]
            isOneToOne: false
            referencedRelation: "ministerios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalas_ministerio_id_fkey"
            columns: ["ministerio_id"]
            isOneToOne: false
            referencedRelation: "v_voluntarios_completo"
            referencedColumns: ["ministerio_id"]
          },
        ]
      }
      evento_areas: {
        Row: {
          area_id: string
          created_at: string
          evento_id: string
          id: string
        }
        Insert: {
          area_id: string
          created_at?: string
          evento_id: string
          id?: string
        }
        Update: {
          area_id?: string
          created_at?: string
          evento_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evento_areas_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "eventos"
            referencedColumns: ["id"]
          },
        ]
      }
      evento_ministerios: {
        Row: {
          created_at: string
          evento_id: string
          id: string
          ministerio_id: string
          responsabilidade: Database["public"]["Enums"]["evento_responsabilidade"]
        }
        Insert: {
          created_at?: string
          evento_id: string
          id?: string
          ministerio_id: string
          responsabilidade?: Database["public"]["Enums"]["evento_responsabilidade"]
        }
        Update: {
          created_at?: string
          evento_id?: string
          id?: string
          ministerio_id?: string
          responsabilidade?: Database["public"]["Enums"]["evento_responsabilidade"]
        }
        Relationships: [
          {
            foreignKeyName: "evento_ministerios_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "eventos"
            referencedColumns: ["id"]
          },
        ]
      }
      eventos: {
        Row: {
          campanha_id: string | null
          cor: string | null
          created_at: string
          data: string
          descricao: string | null
          hora_fim: string | null
          hora_inicio: string | null
          id: string
          igreja_id: string
          is_excecao: boolean
          local: string | null
          local_id: string | null
          ministerio_principal_id: string | null
          ocorrencia_original_data: string | null
          recorrencia_id: string | null
          recorrencia_regra: Json | null
          serie_origem_id: string | null
          status: Database["public"]["Enums"]["evento_status"]
          tipo: Database["public"]["Enums"]["evento_tipo"]
          titulo: string
          transmissao_online: boolean
          transmissao_url: string | null
          updated_at: string
          visitante_id: string | null
        }
        Insert: {
          campanha_id?: string | null
          cor?: string | null
          created_at?: string
          data: string
          descricao?: string | null
          hora_fim?: string | null
          hora_inicio?: string | null
          id?: string
          igreja_id?: string
          is_excecao?: boolean
          local?: string | null
          local_id?: string | null
          ministerio_principal_id?: string | null
          ocorrencia_original_data?: string | null
          recorrencia_id?: string | null
          recorrencia_regra?: Json | null
          serie_origem_id?: string | null
          status?: Database["public"]["Enums"]["evento_status"]
          tipo?: Database["public"]["Enums"]["evento_tipo"]
          titulo: string
          transmissao_online?: boolean
          transmissao_url?: string | null
          updated_at?: string
          visitante_id?: string | null
        }
        Update: {
          campanha_id?: string | null
          cor?: string | null
          created_at?: string
          data?: string
          descricao?: string | null
          hora_fim?: string | null
          hora_inicio?: string | null
          id?: string
          igreja_id?: string
          is_excecao?: boolean
          local?: string | null
          local_id?: string | null
          ministerio_principal_id?: string | null
          ocorrencia_original_data?: string | null
          recorrencia_id?: string | null
          recorrencia_regra?: Json | null
          serie_origem_id?: string | null
          status?: Database["public"]["Enums"]["evento_status"]
          tipo?: Database["public"]["Enums"]["evento_tipo"]
          titulo?: string
          transmissao_online?: boolean
          transmissao_url?: string | null
          updated_at?: string
          visitante_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eventos_campanha_id_fkey"
            columns: ["campanha_id"]
            isOneToOne: false
            referencedRelation: "campanhas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventos_igreja_id_fkey"
            columns: ["igreja_id"]
            isOneToOne: false
            referencedRelation: "igrejas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventos_igreja_id_fkey"
            columns: ["igreja_id"]
            isOneToOne: false
            referencedRelation: "v_igrejas_ativas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventos_visitante_id_fkey"
            columns: ["visitante_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventos_visitante_id_fkey"
            columns: ["visitante_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventos_visitante_id_fkey"
            columns: ["visitante_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventos_visitante_id_fkey"
            columns: ["visitante_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventos_visitante_id_fkey"
            columns: ["visitante_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
        ]
      }
      exportacoes_log: {
        Row: {
          campos_incluidos: string[] | null
          created_at: string
          filtro_tipo: string | null
          filtro_valor: string | null
          formato: string
          id: string
          ip_address: string | null
          total_registros: number
          usuario_email: string | null
          usuario_id: string | null
        }
        Insert: {
          campos_incluidos?: string[] | null
          created_at?: string
          filtro_tipo?: string | null
          filtro_valor?: string | null
          formato?: string
          id?: string
          ip_address?: string | null
          total_registros?: number
          usuario_email?: string | null
          usuario_id?: string | null
        }
        Update: {
          campos_incluidos?: string[] | null
          created_at?: string
          filtro_tipo?: string | null
          filtro_valor?: string | null
          formato?: string
          id?: string
          ip_address?: string | null
          total_registros?: number
          usuario_email?: string | null
          usuario_id?: string | null
        }
        Relationships: []
      }
      familias: {
        Row: {
          bairro: string | null
          cep: string | null
          cidade: string | null
          complemento: string | null
          congregacao_id: string | null
          created_at: string
          data_casamento: string | null
          endereco: string | null
          geo_precisao: string | null
          geocodificado_em: string | null
          id: string
          igreja_id: string
          latitude: number | null
          longitude: number | null
          nome_familia: string
          numero: string | null
          observacoes: string | null
          updated_at: string
        }
        Insert: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          congregacao_id?: string | null
          created_at?: string
          data_casamento?: string | null
          endereco?: string | null
          geo_precisao?: string | null
          geocodificado_em?: string | null
          id?: string
          igreja_id?: string
          latitude?: number | null
          longitude?: number | null
          nome_familia: string
          numero?: string | null
          observacoes?: string | null
          updated_at?: string
        }
        Update: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          congregacao_id?: string | null
          created_at?: string
          data_casamento?: string | null
          endereco?: string | null
          geo_precisao?: string | null
          geocodificado_em?: string | null
          id?: string
          igreja_id?: string
          latitude?: number | null
          longitude?: number | null
          nome_familia?: string
          numero?: string | null
          observacoes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "familias_congregacao_id_fkey"
            columns: ["congregacao_id"]
            isOneToOne: false
            referencedRelation: "congregacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "familias_igreja_id_fkey"
            columns: ["igreja_id"]
            isOneToOne: false
            referencedRelation: "igrejas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "familias_igreja_id_fkey"
            columns: ["igreja_id"]
            isOneToOne: false
            referencedRelation: "v_igrejas_ativas"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_categorias: {
        Row: {
          ativo: boolean
          conta_contabil: string | null
          cor: string | null
          created_at: string
          icone: string | null
          id: string
          nome: string
          observacao: string | null
          ordem: number | null
          pai_id: string | null
          sistema: boolean
          tipo: Database["public"]["Enums"]["fin_movimento_tipo"]
        }
        Insert: {
          ativo?: boolean
          conta_contabil?: string | null
          cor?: string | null
          created_at?: string
          icone?: string | null
          id?: string
          nome: string
          observacao?: string | null
          ordem?: number | null
          pai_id?: string | null
          sistema?: boolean
          tipo: Database["public"]["Enums"]["fin_movimento_tipo"]
        }
        Update: {
          ativo?: boolean
          conta_contabil?: string | null
          cor?: string | null
          created_at?: string
          icone?: string | null
          id?: string
          nome?: string
          observacao?: string | null
          ordem?: number | null
          pai_id?: string | null
          sistema?: boolean
          tipo?: Database["public"]["Enums"]["fin_movimento_tipo"]
        }
        Relationships: [
          {
            foreignKeyName: "fin_categorias_pai_id_fkey"
            columns: ["pai_id"]
            isOneToOne: false
            referencedRelation: "fin_categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_centros_custo: {
        Row: {
          ativo: boolean
          centro_pai_id: string | null
          cor: string | null
          created_at: string
          descricao: string | null
          icone: string | null
          id: string
          nome: string
          orcamento_anual: number | null
          vinculo_id: string | null
          vinculo_nome: string | null
          vinculo_tipo: Database["public"]["Enums"]["fin_centro_vinculo"]
        }
        Insert: {
          ativo?: boolean
          centro_pai_id?: string | null
          cor?: string | null
          created_at?: string
          descricao?: string | null
          icone?: string | null
          id?: string
          nome: string
          orcamento_anual?: number | null
          vinculo_id?: string | null
          vinculo_nome?: string | null
          vinculo_tipo?: Database["public"]["Enums"]["fin_centro_vinculo"]
        }
        Update: {
          ativo?: boolean
          centro_pai_id?: string | null
          cor?: string | null
          created_at?: string
          descricao?: string | null
          icone?: string | null
          id?: string
          nome?: string
          orcamento_anual?: number | null
          vinculo_id?: string | null
          vinculo_nome?: string | null
          vinculo_tipo?: Database["public"]["Enums"]["fin_centro_vinculo"]
        }
        Relationships: [
          {
            foreignKeyName: "fin_centros_custo_centro_pai_id_fkey"
            columns: ["centro_pai_id"]
            isOneToOne: false
            referencedRelation: "fin_centros_custo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_centros_custo_centro_pai_id_fkey"
            columns: ["centro_pai_id"]
            isOneToOne: false
            referencedRelation: "vw_fin_centros_resumo"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_contas: {
        Row: {
          agencia: string | null
          ativo: boolean
          banco_codigo: string | null
          banco_nome: string | null
          conta_numero: string | null
          cor: string | null
          created_at: string
          dia_fechamento: number | null
          dia_vencimento: number | null
          id: string
          is_principal: boolean
          limite_credito: number | null
          nome: string
          observacao: string | null
          ordem: number | null
          saldo_atual: number
          saldo_inicial: number
          tipo: Database["public"]["Enums"]["fin_conta_tipo"]
          updated_at: string
        }
        Insert: {
          agencia?: string | null
          ativo?: boolean
          banco_codigo?: string | null
          banco_nome?: string | null
          conta_numero?: string | null
          cor?: string | null
          created_at?: string
          dia_fechamento?: number | null
          dia_vencimento?: number | null
          id?: string
          is_principal?: boolean
          limite_credito?: number | null
          nome: string
          observacao?: string | null
          ordem?: number | null
          saldo_atual?: number
          saldo_inicial?: number
          tipo: Database["public"]["Enums"]["fin_conta_tipo"]
          updated_at?: string
        }
        Update: {
          agencia?: string | null
          ativo?: boolean
          banco_codigo?: string | null
          banco_nome?: string | null
          conta_numero?: string | null
          cor?: string | null
          created_at?: string
          dia_fechamento?: number | null
          dia_vencimento?: number | null
          id?: string
          is_principal?: boolean
          limite_credito?: number | null
          nome?: string
          observacao?: string | null
          ordem?: number | null
          saldo_atual?: number
          saldo_inicial?: number
          tipo?: Database["public"]["Enums"]["fin_conta_tipo"]
          updated_at?: string
        }
        Relationships: []
      }
      fin_contratados: {
        Row: {
          ativo: boolean
          cargo: string | null
          cnpj: string | null
          cpf: string | null
          created_at: string
          data_fim: string | null
          data_inicio: string
          id: string
          igreja_tem_cebas: boolean
          jornada_horas_semana: number | null
          mei_atividade: string | null
          mei_valor_mensal: number | null
          nome: string
          num_dependentes: number | null
          observacao: string | null
          pastor_contribui_inss: boolean | null
          pessoa_id: string | null
          prebenda_aux_aluguel: number | null
          prebenda_aux_outros: number | null
          prebenda_valor: number | null
          rpa_valor_padrao: number | null
          salario_base: number | null
          updated_at: string
          vale_alimentacao_dia: number | null
          vale_transporte_dias: number | null
          vinculo: Database["public"]["Enums"]["fin_vinculo_tipo"]
          vt_passagem_valor: number | null
        }
        Insert: {
          ativo?: boolean
          cargo?: string | null
          cnpj?: string | null
          cpf?: string | null
          created_at?: string
          data_fim?: string | null
          data_inicio?: string
          id?: string
          igreja_tem_cebas?: boolean
          jornada_horas_semana?: number | null
          mei_atividade?: string | null
          mei_valor_mensal?: number | null
          nome: string
          num_dependentes?: number | null
          observacao?: string | null
          pastor_contribui_inss?: boolean | null
          pessoa_id?: string | null
          prebenda_aux_aluguel?: number | null
          prebenda_aux_outros?: number | null
          prebenda_valor?: number | null
          rpa_valor_padrao?: number | null
          salario_base?: number | null
          updated_at?: string
          vale_alimentacao_dia?: number | null
          vale_transporte_dias?: number | null
          vinculo: Database["public"]["Enums"]["fin_vinculo_tipo"]
          vt_passagem_valor?: number | null
        }
        Update: {
          ativo?: boolean
          cargo?: string | null
          cnpj?: string | null
          cpf?: string | null
          created_at?: string
          data_fim?: string | null
          data_inicio?: string
          id?: string
          igreja_tem_cebas?: boolean
          jornada_horas_semana?: number | null
          mei_atividade?: string | null
          mei_valor_mensal?: number | null
          nome?: string
          num_dependentes?: number | null
          observacao?: string | null
          pastor_contribui_inss?: boolean | null
          pessoa_id?: string | null
          prebenda_aux_aluguel?: number | null
          prebenda_aux_outros?: number | null
          prebenda_valor?: number | null
          rpa_valor_padrao?: number | null
          salario_base?: number | null
          updated_at?: string
          vale_alimentacao_dia?: number | null
          vale_transporte_dias?: number | null
          vinculo?: Database["public"]["Enums"]["fin_vinculo_tipo"]
          vt_passagem_valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fin_contratados_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_contratados_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_contratados_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_contratados_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_contratados_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_decisoes_reuniao: {
        Row: {
          assunto_id: string | null
          criada_em: string | null
          descricao: string
          id: string
          prazo: string | null
          responsavel_id: string | null
          responsavel_nome: string | null
          reuniao_id: string
          status: string | null
        }
        Insert: {
          assunto_id?: string | null
          criada_em?: string | null
          descricao: string
          id?: string
          prazo?: string | null
          responsavel_id?: string | null
          responsavel_nome?: string | null
          reuniao_id: string
          status?: string | null
        }
        Update: {
          assunto_id?: string | null
          criada_em?: string | null
          descricao?: string
          id?: string
          prazo?: string | null
          responsavel_id?: string | null
          responsavel_nome?: string | null
          reuniao_id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fin_decisoes_reuniao_assunto_id_fkey"
            columns: ["assunto_id"]
            isOneToOne: false
            referencedRelation: "assuntos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_decisoes_reuniao_assunto_id_fkey"
            columns: ["assunto_id"]
            isOneToOne: false
            referencedRelation: "vw_assuntos_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_decisoes_reuniao_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_decisoes_reuniao_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_decisoes_reuniao_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_decisoes_reuniao_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_decisoes_reuniao_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_decisoes_reuniao_reuniao_id_fkey"
            columns: ["reuniao_id"]
            isOneToOne: false
            referencedRelation: "fin_reunioes_financeiras"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_estoque_itens: {
        Row: {
          ativo: boolean
          categoria: string | null
          centro_custo_id: string | null
          created_at: string
          custo_medio: number | null
          descricao: string | null
          estoque_atual: number
          estoque_minimo: number
          fornecedor_padrao_id: string | null
          id: string
          imagem_url: string | null
          nome: string
          observacao: string | null
          ponto_pedido: number | null
          unidade: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          categoria?: string | null
          centro_custo_id?: string | null
          created_at?: string
          custo_medio?: number | null
          descricao?: string | null
          estoque_atual?: number
          estoque_minimo?: number
          fornecedor_padrao_id?: string | null
          id?: string
          imagem_url?: string | null
          nome: string
          observacao?: string | null
          ponto_pedido?: number | null
          unidade?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          categoria?: string | null
          centro_custo_id?: string | null
          created_at?: string
          custo_medio?: number | null
          descricao?: string | null
          estoque_atual?: number
          estoque_minimo?: number
          fornecedor_padrao_id?: string | null
          id?: string
          imagem_url?: string | null
          nome?: string
          observacao?: string | null
          ponto_pedido?: number | null
          unidade?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_estoque_itens_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "fin_centros_custo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_estoque_itens_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "vw_fin_centros_resumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_estoque_itens_fornecedor_padrao_id_fkey"
            columns: ["fornecedor_padrao_id"]
            isOneToOne: false
            referencedRelation: "fin_fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_estoque_movimentos: {
        Row: {
          created_at: string
          data: string
          fornecedor_id: string | null
          id: string
          item_id: string
          lancamento_id: string | null
          motivo: string | null
          quantidade: number
          tipo: Database["public"]["Enums"]["fin_estoque_movimento_tipo"]
          user_id: string | null
          valor_total: number | null
          valor_unitario: number | null
        }
        Insert: {
          created_at?: string
          data?: string
          fornecedor_id?: string | null
          id?: string
          item_id: string
          lancamento_id?: string | null
          motivo?: string | null
          quantidade: number
          tipo: Database["public"]["Enums"]["fin_estoque_movimento_tipo"]
          user_id?: string | null
          valor_total?: number | null
          valor_unitario?: number | null
        }
        Update: {
          created_at?: string
          data?: string
          fornecedor_id?: string | null
          id?: string
          item_id?: string
          lancamento_id?: string | null
          motivo?: string | null
          quantidade?: number
          tipo?: Database["public"]["Enums"]["fin_estoque_movimento_tipo"]
          user_id?: string | null
          valor_total?: number | null
          valor_unitario?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fin_estoque_movimentos_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fin_fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_estoque_movimentos_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "fin_estoque_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_estoque_movimentos_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "vw_fin_estoque_alertas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_estoque_movimentos_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "fin_lancamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_estoque_movimentos_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "vw_fin_proximos_vencimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_estoque_movimentos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_folha_competencias: {
        Row: {
          ano: number
          created_at: string
          data_processamento: string | null
          id: string
          mes: number
          observacao: string | null
          processado_por: string | null
          status: string
        }
        Insert: {
          ano: number
          created_at?: string
          data_processamento?: string | null
          id?: string
          mes: number
          observacao?: string | null
          processado_por?: string | null
          status?: string
        }
        Update: {
          ano?: number
          created_at?: string
          data_processamento?: string | null
          id?: string
          mes?: number
          observacao?: string | null
          processado_por?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_folha_competencias_processado_por_fkey"
            columns: ["processado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_folha_lancamentos: {
        Row: {
          base_calculo: number | null
          competencia_id: string
          contratado_id: string
          created_at: string
          custo_total: number | null
          data_pagamento: string | null
          fgts: number | null
          id: string
          inss_empregado: number | null
          inss_patronal: number | null
          irrf: number | null
          lancamento_id: string | null
          liquido: number | null
          observacoes: string | null
          outros_descontos: number | null
          outros_proventos: number | null
          pago: boolean
          rat: number | null
          salario_base: number | null
          terceiros: number | null
          total_descontos: number | null
          total_proventos: number | null
          vale_alimentacao: number | null
          vale_transporte: number | null
          vinculo_snapshot: Database["public"]["Enums"]["fin_vinculo_tipo"]
          vt_desconto: number | null
        }
        Insert: {
          base_calculo?: number | null
          competencia_id: string
          contratado_id: string
          created_at?: string
          custo_total?: number | null
          data_pagamento?: string | null
          fgts?: number | null
          id?: string
          inss_empregado?: number | null
          inss_patronal?: number | null
          irrf?: number | null
          lancamento_id?: string | null
          liquido?: number | null
          observacoes?: string | null
          outros_descontos?: number | null
          outros_proventos?: number | null
          pago?: boolean
          rat?: number | null
          salario_base?: number | null
          terceiros?: number | null
          total_descontos?: number | null
          total_proventos?: number | null
          vale_alimentacao?: number | null
          vale_transporte?: number | null
          vinculo_snapshot: Database["public"]["Enums"]["fin_vinculo_tipo"]
          vt_desconto?: number | null
        }
        Update: {
          base_calculo?: number | null
          competencia_id?: string
          contratado_id?: string
          created_at?: string
          custo_total?: number | null
          data_pagamento?: string | null
          fgts?: number | null
          id?: string
          inss_empregado?: number | null
          inss_patronal?: number | null
          irrf?: number | null
          lancamento_id?: string | null
          liquido?: number | null
          observacoes?: string | null
          outros_descontos?: number | null
          outros_proventos?: number | null
          pago?: boolean
          rat?: number | null
          salario_base?: number | null
          terceiros?: number | null
          total_descontos?: number | null
          total_proventos?: number | null
          vale_alimentacao?: number | null
          vale_transporte?: number | null
          vinculo_snapshot?: Database["public"]["Enums"]["fin_vinculo_tipo"]
          vt_desconto?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fin_folha_lancamentos_competencia_id_fkey"
            columns: ["competencia_id"]
            isOneToOne: false
            referencedRelation: "fin_folha_competencias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_folha_lancamentos_contratado_id_fkey"
            columns: ["contratado_id"]
            isOneToOne: false
            referencedRelation: "fin_contratados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_folha_lancamentos_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "fin_lancamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_folha_lancamentos_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "vw_fin_proximos_vencimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_fornecedores: {
        Row: {
          agencia: string | null
          ativo: boolean
          bairro: string | null
          banco_nome: string | null
          categoria_padrao_id: string | null
          cep: string | null
          chave_pix: string | null
          cidade: string | null
          cnpj_cpf: string | null
          conta: string | null
          created_at: string
          email: string | null
          endereco: string | null
          id: string
          nome: string
          observacao: string | null
          telefone: string | null
          tipo: string | null
          uf: string | null
          updated_at: string
        }
        Insert: {
          agencia?: string | null
          ativo?: boolean
          bairro?: string | null
          banco_nome?: string | null
          categoria_padrao_id?: string | null
          cep?: string | null
          chave_pix?: string | null
          cidade?: string | null
          cnpj_cpf?: string | null
          conta?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          id?: string
          nome: string
          observacao?: string | null
          telefone?: string | null
          tipo?: string | null
          uf?: string | null
          updated_at?: string
        }
        Update: {
          agencia?: string | null
          ativo?: boolean
          bairro?: string | null
          banco_nome?: string | null
          categoria_padrao_id?: string | null
          cep?: string | null
          chave_pix?: string | null
          cidade?: string | null
          cnpj_cpf?: string | null
          conta?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          id?: string
          nome?: string
          observacao?: string | null
          telefone?: string | null
          tipo?: string | null
          uf?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fin_fornecedores_categoria_padrao_id_fkey"
            columns: ["categoria_padrao_id"]
            isOneToOne: false
            referencedRelation: "fin_categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_lancamento_rateio: {
        Row: {
          centro_custo_id: string
          id: string
          lancamento_id: string
          observacao: string | null
          percentual: number | null
          valor: number | null
        }
        Insert: {
          centro_custo_id: string
          id?: string
          lancamento_id: string
          observacao?: string | null
          percentual?: number | null
          valor?: number | null
        }
        Update: {
          centro_custo_id?: string
          id?: string
          lancamento_id?: string
          observacao?: string | null
          percentual?: number | null
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fin_lancamento_rateio_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "fin_centros_custo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_lancamento_rateio_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "vw_fin_centros_resumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_lancamento_rateio_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "fin_lancamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_lancamento_rateio_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "vw_fin_proximos_vencimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_lancamentos: {
        Row: {
          audit_em: string | null
          audit_user_id: string | null
          categoria_id: string | null
          centro_custo_id: string | null
          comprovante_url: string | null
          conta_id: string
          created_at: string
          data: string
          data_competencia: string | null
          data_pagamento: string | null
          descricao: string | null
          documento_numero: string | null
          familia_id: string | null
          forma_pagamento:
            | Database["public"]["Enums"]["fin_forma_pagamento"]
            | null
          fornecedor_id: string | null
          id: string
          lancamento_pai_id: string | null
          observacoes: string | null
          origem: string | null
          pessoa_id: string | null
          status: Database["public"]["Enums"]["fin_lancamento_status"]
          tipo: Database["public"]["Enums"]["fin_movimento_tipo"]
          updated_at: string
          valor: number
        }
        Insert: {
          audit_em?: string | null
          audit_user_id?: string | null
          categoria_id?: string | null
          centro_custo_id?: string | null
          comprovante_url?: string | null
          conta_id: string
          created_at?: string
          data: string
          data_competencia?: string | null
          data_pagamento?: string | null
          descricao?: string | null
          documento_numero?: string | null
          familia_id?: string | null
          forma_pagamento?:
            | Database["public"]["Enums"]["fin_forma_pagamento"]
            | null
          fornecedor_id?: string | null
          id?: string
          lancamento_pai_id?: string | null
          observacoes?: string | null
          origem?: string | null
          pessoa_id?: string | null
          status?: Database["public"]["Enums"]["fin_lancamento_status"]
          tipo: Database["public"]["Enums"]["fin_movimento_tipo"]
          updated_at?: string
          valor: number
        }
        Update: {
          audit_em?: string | null
          audit_user_id?: string | null
          categoria_id?: string | null
          centro_custo_id?: string | null
          comprovante_url?: string | null
          conta_id?: string
          created_at?: string
          data?: string
          data_competencia?: string | null
          data_pagamento?: string | null
          descricao?: string | null
          documento_numero?: string | null
          familia_id?: string | null
          forma_pagamento?:
            | Database["public"]["Enums"]["fin_forma_pagamento"]
            | null
          fornecedor_id?: string | null
          id?: string
          lancamento_pai_id?: string | null
          observacoes?: string | null
          origem?: string | null
          pessoa_id?: string | null
          status?: Database["public"]["Enums"]["fin_lancamento_status"]
          tipo?: Database["public"]["Enums"]["fin_movimento_tipo"]
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "fin_lancamentos_audit_user_id_fkey"
            columns: ["audit_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_lancamentos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "fin_categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_lancamentos_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "fin_centros_custo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_lancamentos_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "vw_fin_centros_resumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_lancamentos_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "fin_contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_lancamentos_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fin_fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_lancamentos_lancamento_pai_id_fkey"
            columns: ["lancamento_pai_id"]
            isOneToOne: false
            referencedRelation: "fin_lancamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_lancamentos_lancamento_pai_id_fkey"
            columns: ["lancamento_pai_id"]
            isOneToOne: false
            referencedRelation: "vw_fin_proximos_vencimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_lancamentos_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_lancamentos_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_lancamentos_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_lancamentos_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_lancamentos_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_orcamentos: {
        Row: {
          ano: number
          categoria_id: string | null
          centro_custo_id: string
          created_at: string
          id: string
          mes: number | null
          observacao: string | null
          updated_at: string
          valor_planejado: number
        }
        Insert: {
          ano: number
          categoria_id?: string | null
          centro_custo_id: string
          created_at?: string
          id?: string
          mes?: number | null
          observacao?: string | null
          updated_at?: string
          valor_planejado: number
        }
        Update: {
          ano?: number
          categoria_id?: string | null
          centro_custo_id?: string
          created_at?: string
          id?: string
          mes?: number | null
          observacao?: string | null
          updated_at?: string
          valor_planejado?: number
        }
        Relationships: [
          {
            foreignKeyName: "fin_orcamentos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "fin_categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_orcamentos_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "fin_centros_custo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_orcamentos_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "vw_fin_centros_resumo"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_recorrencias: {
        Row: {
          ajusta_dia_util: boolean
          ativo: boolean
          categoria_id: string | null
          centro_custo_id: string | null
          conta_id: string
          created_at: string
          data_fim: string | null
          data_inicio: string
          descricao: string
          dia_vencimento: number
          fornecedor_id: string | null
          frequencia: Database["public"]["Enums"]["fin_frequencia"]
          id: string
          lembrar_1d: boolean
          lembrar_5d: boolean
          lembrar_dia: boolean
          observacao: string | null
          tipo: Database["public"]["Enums"]["fin_movimento_tipo"]
          ultimo_gerado_ate: string | null
          updated_at: string
          valor: number
          valor_variavel: boolean
        }
        Insert: {
          ajusta_dia_util?: boolean
          ativo?: boolean
          categoria_id?: string | null
          centro_custo_id?: string | null
          conta_id: string
          created_at?: string
          data_fim?: string | null
          data_inicio?: string
          descricao: string
          dia_vencimento: number
          fornecedor_id?: string | null
          frequencia?: Database["public"]["Enums"]["fin_frequencia"]
          id?: string
          lembrar_1d?: boolean
          lembrar_5d?: boolean
          lembrar_dia?: boolean
          observacao?: string | null
          tipo: Database["public"]["Enums"]["fin_movimento_tipo"]
          ultimo_gerado_ate?: string | null
          updated_at?: string
          valor: number
          valor_variavel?: boolean
        }
        Update: {
          ajusta_dia_util?: boolean
          ativo?: boolean
          categoria_id?: string | null
          centro_custo_id?: string | null
          conta_id?: string
          created_at?: string
          data_fim?: string | null
          data_inicio?: string
          descricao?: string
          dia_vencimento?: number
          fornecedor_id?: string | null
          frequencia?: Database["public"]["Enums"]["fin_frequencia"]
          id?: string
          lembrar_1d?: boolean
          lembrar_5d?: boolean
          lembrar_dia?: boolean
          observacao?: string | null
          tipo?: Database["public"]["Enums"]["fin_movimento_tipo"]
          ultimo_gerado_ate?: string | null
          updated_at?: string
          valor?: number
          valor_variavel?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "fin_recorrencias_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "fin_categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_recorrencias_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "fin_centros_custo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_recorrencias_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "vw_fin_centros_resumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_recorrencias_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "fin_contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_recorrencias_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fin_fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_reunioes_financeiras: {
        Row: {
          ata: string | null
          atualizado_em: string | null
          competencia_fim: string
          competencia_inicio: string
          criado_em: string | null
          criado_por: string | null
          data_reuniao: string
          id: string
          local: string | null
          pauta_jsonb: Json | null
          periodicidade: string
          reuniao_gov_id: string | null
          saldo_final: number | null
          status: string
          titulo: string
          total_entradas_periodo: number | null
          total_saidas_periodo: number | null
        }
        Insert: {
          ata?: string | null
          atualizado_em?: string | null
          competencia_fim: string
          competencia_inicio: string
          criado_em?: string | null
          criado_por?: string | null
          data_reuniao: string
          id?: string
          local?: string | null
          pauta_jsonb?: Json | null
          periodicidade?: string
          reuniao_gov_id?: string | null
          saldo_final?: number | null
          status?: string
          titulo: string
          total_entradas_periodo?: number | null
          total_saidas_periodo?: number | null
        }
        Update: {
          ata?: string | null
          atualizado_em?: string | null
          competencia_fim?: string
          competencia_inicio?: string
          criado_em?: string | null
          criado_por?: string | null
          data_reuniao?: string
          id?: string
          local?: string | null
          pauta_jsonb?: Json | null
          periodicidade?: string
          reuniao_gov_id?: string | null
          saldo_final?: number | null
          status?: string
          titulo?: string
          total_entradas_periodo?: number | null
          total_saidas_periodo?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fin_reunioes_financeiras_reuniao_gov_id_fkey"
            columns: ["reuniao_gov_id"]
            isOneToOne: false
            referencedRelation: "gov_reunioes"
            referencedColumns: ["id"]
          },
        ]
      }
      fin_solicitacoes: {
        Row: {
          area_id: string | null
          data_aprovacao: string | null
          data_pagamento: string | null
          data_solicitacao: string | null
          descricao: string | null
          id: string
          ministerio_id: string | null
          status: string | null
          valor: number | null
        }
        Insert: {
          area_id?: string | null
          data_aprovacao?: string | null
          data_pagamento?: string | null
          data_solicitacao?: string | null
          descricao?: string | null
          id?: string
          ministerio_id?: string | null
          status?: string | null
          valor?: number | null
        }
        Update: {
          area_id?: string | null
          data_aprovacao?: string | null
          data_pagamento?: string | null
          data_solicitacao?: string | null
          descricao?: string | null
          id?: string
          ministerio_id?: string | null
          status?: string | null
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fin_solicitacoes_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_solicitacoes_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "v_voluntarios_completo"
            referencedColumns: ["area_id"]
          },
          {
            foreignKeyName: "fin_solicitacoes_ministerio_id_fkey"
            columns: ["ministerio_id"]
            isOneToOne: false
            referencedRelation: "ministerios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_solicitacoes_ministerio_id_fkey"
            columns: ["ministerio_id"]
            isOneToOne: false
            referencedRelation: "v_voluntarios_completo"
            referencedColumns: ["ministerio_id"]
          },
        ]
      }
      fin_tabela_inss_empregado: {
        Row: {
          aliquota: number
          faixa_max: number | null
          faixa_min: number
          id: string
          ordem: number
          vigencia: string
        }
        Insert: {
          aliquota: number
          faixa_max?: number | null
          faixa_min: number
          id?: string
          ordem: number
          vigencia: string
        }
        Update: {
          aliquota?: number
          faixa_max?: number | null
          faixa_min?: number
          id?: string
          ordem?: number
          vigencia?: string
        }
        Relationships: []
      }
      fin_tabela_irrf: {
        Row: {
          aliquota: number
          deducao_dependente: number
          faixa_max: number | null
          faixa_min: number
          id: string
          ordem: number
          parcela_deduzir: number
          vigencia: string
        }
        Insert: {
          aliquota: number
          deducao_dependente?: number
          faixa_max?: number | null
          faixa_min: number
          id?: string
          ordem: number
          parcela_deduzir?: number
          vigencia: string
        }
        Update: {
          aliquota?: number
          deducao_dependente?: number
          faixa_max?: number | null
          faixa_min?: number
          id?: string
          ordem?: number
          parcela_deduzir?: number
          vigencia?: string
        }
        Relationships: []
      }
      fiscal_agenda: {
        Row: {
          atualizado_em: string | null
          codigo_obrigacao: string
          competencia: string
          criado_em: string | null
          data_pagamento: string | null
          id: string
          lancamento_id: string | null
          observacao: string | null
          status: string
          valor_esperado: number | null
          valor_pago: number | null
          vencimento: string
        }
        Insert: {
          atualizado_em?: string | null
          codigo_obrigacao: string
          competencia: string
          criado_em?: string | null
          data_pagamento?: string | null
          id?: string
          lancamento_id?: string | null
          observacao?: string | null
          status?: string
          valor_esperado?: number | null
          valor_pago?: number | null
          vencimento: string
        }
        Update: {
          atualizado_em?: string | null
          codigo_obrigacao?: string
          competencia?: string
          criado_em?: string | null
          data_pagamento?: string | null
          id?: string
          lancamento_id?: string | null
          observacao?: string | null
          status?: string
          valor_esperado?: number | null
          valor_pago?: number | null
          vencimento?: string
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_agenda_codigo_obrigacao_fkey"
            columns: ["codigo_obrigacao"]
            isOneToOne: false
            referencedRelation: "fiscal_tipos_obrigacao"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "fiscal_agenda_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "fin_lancamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_agenda_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: false
            referencedRelation: "vw_fin_proximos_vencimentos"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_config: {
        Row: {
          alerta_dias_antes: number | null
          atualizado_em: string | null
          cnae_principal: string | null
          dia_iss_municipal: number | null
          id: number
          inscricao_municipal: string | null
          municipio: string | null
          possui_funcionarios: boolean | null
          tipo_entidade: string | null
          uf: string | null
          whatsapp_tesouraria: string | null
        }
        Insert: {
          alerta_dias_antes?: number | null
          atualizado_em?: string | null
          cnae_principal?: string | null
          dia_iss_municipal?: number | null
          id?: number
          inscricao_municipal?: string | null
          municipio?: string | null
          possui_funcionarios?: boolean | null
          tipo_entidade?: string | null
          uf?: string | null
          whatsapp_tesouraria?: string | null
        }
        Update: {
          alerta_dias_antes?: number | null
          atualizado_em?: string | null
          cnae_principal?: string | null
          dia_iss_municipal?: number | null
          id?: number
          inscricao_municipal?: string | null
          municipio?: string | null
          possui_funcionarios?: boolean | null
          tipo_entidade?: string | null
          uf?: string | null
          whatsapp_tesouraria?: string | null
        }
        Relationships: []
      }
      fiscal_documentos: {
        Row: {
          agenda_id: string
          enviado_em: string | null
          enviado_por: string | null
          id: string
          mime_type: string | null
          nome_arquivo: string
          observacao: string | null
          storage_path: string
          tamanho_bytes: number | null
          tipo: string
        }
        Insert: {
          agenda_id: string
          enviado_em?: string | null
          enviado_por?: string | null
          id?: string
          mime_type?: string | null
          nome_arquivo: string
          observacao?: string | null
          storage_path: string
          tamanho_bytes?: number | null
          tipo: string
        }
        Update: {
          agenda_id?: string
          enviado_em?: string | null
          enviado_por?: string | null
          id?: string
          mime_type?: string | null
          nome_arquivo?: string
          observacao?: string | null
          storage_path?: string
          tamanho_bytes?: number | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_documentos_agenda_id_fkey"
            columns: ["agenda_id"]
            isOneToOne: false
            referencedRelation: "fiscal_agenda"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_obrigacoes_ativas: {
        Row: {
          ativa: boolean | null
          atualizado_em: string | null
          categoria_financeira_id: string | null
          centro_custo_id: string | null
          codigo_obrigacao: string
          conta_pagadora_id: string | null
          dia_vencimento_custom: number | null
          observacao: string | null
        }
        Insert: {
          ativa?: boolean | null
          atualizado_em?: string | null
          categoria_financeira_id?: string | null
          centro_custo_id?: string | null
          codigo_obrigacao: string
          conta_pagadora_id?: string | null
          dia_vencimento_custom?: number | null
          observacao?: string | null
        }
        Update: {
          ativa?: boolean | null
          atualizado_em?: string | null
          categoria_financeira_id?: string | null
          centro_custo_id?: string | null
          codigo_obrigacao?: string
          conta_pagadora_id?: string | null
          dia_vencimento_custom?: number | null
          observacao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_obrigacoes_ativas_categoria_financeira_id_fkey"
            columns: ["categoria_financeira_id"]
            isOneToOne: false
            referencedRelation: "fin_categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_obrigacoes_ativas_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "fin_centros_custo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_obrigacoes_ativas_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "vw_fin_centros_resumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_obrigacoes_ativas_codigo_obrigacao_fkey"
            columns: ["codigo_obrigacao"]
            isOneToOne: true
            referencedRelation: "fiscal_tipos_obrigacao"
            referencedColumns: ["codigo"]
          },
          {
            foreignKeyName: "fiscal_obrigacoes_ativas_conta_pagadora_id_fkey"
            columns: ["conta_pagadora_id"]
            isOneToOne: false
            referencedRelation: "fin_contas"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_tipos_obrigacao: {
        Row: {
          codigo: string
          cor: string | null
          descricao: string | null
          dia_vencimento: number | null
          esfera: string
          icone: string | null
          mes_anual: number | null
          nome: string
          periodicidade: string
          requer_funcionarios: boolean | null
        }
        Insert: {
          codigo: string
          cor?: string | null
          descricao?: string | null
          dia_vencimento?: number | null
          esfera: string
          icone?: string | null
          mes_anual?: number | null
          nome: string
          periodicidade: string
          requer_funcionarios?: boolean | null
        }
        Update: {
          codigo?: string
          cor?: string | null
          descricao?: string | null
          dia_vencimento?: number | null
          esfera?: string
          icone?: string | null
          mes_anual?: number | null
          nome?: string
          periodicidade?: string
          requer_funcionarios?: boolean | null
        }
        Relationships: []
      }
      gov_assembleia_presentes: {
        Row: {
          assembleia_id: string
          created_at: string
          hora_chegada: string | null
          id: string
          observacao: string | null
          pessoa_id: string
          pessoa_nome: string
          presente: boolean
        }
        Insert: {
          assembleia_id: string
          created_at?: string
          hora_chegada?: string | null
          id?: string
          observacao?: string | null
          pessoa_id: string
          pessoa_nome: string
          presente?: boolean
        }
        Update: {
          assembleia_id?: string
          created_at?: string
          hora_chegada?: string | null
          id?: string
          observacao?: string | null
          pessoa_id?: string
          pessoa_nome?: string
          presente?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "gov_assembleia_presentes_assembleia_id_fkey"
            columns: ["assembleia_id"]
            isOneToOne: false
            referencedRelation: "gov_assembleias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_assembleia_presentes_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_assembleia_presentes_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_assembleia_presentes_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_assembleia_presentes_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_assembleia_presentes_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
        ]
      }
      gov_assembleias: {
        Row: {
          ata_url: string | null
          ata_versao: number
          convocacao_enviada: boolean
          created_at: string
          data_assembleia: string
          horario: string | null
          id: string
          local: string | null
          observacoes: string | null
          presidente_id: string | null
          presidente_nome: string | null
          quorum_atingido: boolean | null
          quorum_minimo_pct: number | null
          reuniao_origem_id: string | null
          secretaria_id: string | null
          secretaria_nome: string | null
          status: Database["public"]["Enums"]["gov_reuniao_status"]
          titulo: string
          total_membros_aptos: number | null
          total_presentes: number | null
          updated_at: string
        }
        Insert: {
          ata_url?: string | null
          ata_versao?: number
          convocacao_enviada?: boolean
          created_at?: string
          data_assembleia: string
          horario?: string | null
          id?: string
          local?: string | null
          observacoes?: string | null
          presidente_id?: string | null
          presidente_nome?: string | null
          quorum_atingido?: boolean | null
          quorum_minimo_pct?: number | null
          reuniao_origem_id?: string | null
          secretaria_id?: string | null
          secretaria_nome?: string | null
          status?: Database["public"]["Enums"]["gov_reuniao_status"]
          titulo: string
          total_membros_aptos?: number | null
          total_presentes?: number | null
          updated_at?: string
        }
        Update: {
          ata_url?: string | null
          ata_versao?: number
          convocacao_enviada?: boolean
          created_at?: string
          data_assembleia?: string
          horario?: string | null
          id?: string
          local?: string | null
          observacoes?: string | null
          presidente_id?: string | null
          presidente_nome?: string | null
          quorum_atingido?: boolean | null
          quorum_minimo_pct?: number | null
          reuniao_origem_id?: string | null
          secretaria_id?: string | null
          secretaria_nome?: string | null
          status?: Database["public"]["Enums"]["gov_reuniao_status"]
          titulo?: string
          total_membros_aptos?: number | null
          total_presentes?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gov_assembleias_presidente_id_fkey"
            columns: ["presidente_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_assembleias_presidente_id_fkey"
            columns: ["presidente_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_assembleias_presidente_id_fkey"
            columns: ["presidente_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_assembleias_presidente_id_fkey"
            columns: ["presidente_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_assembleias_presidente_id_fkey"
            columns: ["presidente_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_assembleias_reuniao_origem_id_fkey"
            columns: ["reuniao_origem_id"]
            isOneToOne: false
            referencedRelation: "gov_reunioes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_assembleias_secretaria_id_fkey"
            columns: ["secretaria_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_assembleias_secretaria_id_fkey"
            columns: ["secretaria_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_assembleias_secretaria_id_fkey"
            columns: ["secretaria_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_assembleias_secretaria_id_fkey"
            columns: ["secretaria_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_assembleias_secretaria_id_fkey"
            columns: ["secretaria_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
        ]
      }
      gov_historico: {
        Row: {
          acao: string
          created_at: string
          descricao: string | null
          entidade_id: string
          entidade_tipo: string
          id: string
          metadata: Json | null
          user_id: string | null
          user_nome: string | null
        }
        Insert: {
          acao: string
          created_at?: string
          descricao?: string | null
          entidade_id: string
          entidade_tipo: string
          id?: string
          metadata?: Json | null
          user_id?: string | null
          user_nome?: string | null
        }
        Update: {
          acao?: string
          created_at?: string
          descricao?: string | null
          entidade_id?: string
          entidade_tipo?: string
          id?: string
          metadata?: Json | null
          user_id?: string | null
          user_nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gov_historico_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gov_participantes: {
        Row: {
          convocado: boolean
          created_at: string
          id: string
          justificativa: string | null
          papel: string | null
          pessoa_id: string | null
          pessoa_nome: string
          presente: boolean
          reuniao_id: string
        }
        Insert: {
          convocado?: boolean
          created_at?: string
          id?: string
          justificativa?: string | null
          papel?: string | null
          pessoa_id?: string | null
          pessoa_nome: string
          presente?: boolean
          reuniao_id: string
        }
        Update: {
          convocado?: boolean
          created_at?: string
          id?: string
          justificativa?: string | null
          papel?: string | null
          pessoa_id?: string | null
          pessoa_nome?: string
          presente?: boolean
          reuniao_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gov_participantes_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_participantes_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_participantes_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_participantes_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_participantes_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_participantes_reuniao_id_fkey"
            columns: ["reuniao_id"]
            isOneToOne: false
            referencedRelation: "gov_reunioes"
            referencedColumns: ["id"]
          },
        ]
      }
      gov_pautas: {
        Row: {
          assembleia_id: string | null
          classificacao: Database["public"]["Enums"]["gov_pauta_classificacao"]
          created_at: string
          data_decisao: string | null
          data_execucao: string | null
          decisao: string | null
          descricao: string | null
          executada: boolean
          id: string
          observacao_decisao: string | null
          observacao_execucao: string | null
          ordem: number | null
          proposto_por: string | null
          proposto_por_id: string | null
          reuniao_id: string | null
          status: Database["public"]["Enums"]["gov_pauta_status"]
          titulo: string
          updated_at: string
          vinculo_id: string | null
          vinculo_nome: string | null
          vinculo_tipo: Database["public"]["Enums"]["gov_pauta_vinculo"] | null
          votos_abstencao: number | null
          votos_impedimento: number | null
          votos_nao: number | null
          votos_sim: number | null
        }
        Insert: {
          assembleia_id?: string | null
          classificacao?: Database["public"]["Enums"]["gov_pauta_classificacao"]
          created_at?: string
          data_decisao?: string | null
          data_execucao?: string | null
          decisao?: string | null
          descricao?: string | null
          executada?: boolean
          id?: string
          observacao_decisao?: string | null
          observacao_execucao?: string | null
          ordem?: number | null
          proposto_por?: string | null
          proposto_por_id?: string | null
          reuniao_id?: string | null
          status?: Database["public"]["Enums"]["gov_pauta_status"]
          titulo: string
          updated_at?: string
          vinculo_id?: string | null
          vinculo_nome?: string | null
          vinculo_tipo?: Database["public"]["Enums"]["gov_pauta_vinculo"] | null
          votos_abstencao?: number | null
          votos_impedimento?: number | null
          votos_nao?: number | null
          votos_sim?: number | null
        }
        Update: {
          assembleia_id?: string | null
          classificacao?: Database["public"]["Enums"]["gov_pauta_classificacao"]
          created_at?: string
          data_decisao?: string | null
          data_execucao?: string | null
          decisao?: string | null
          descricao?: string | null
          executada?: boolean
          id?: string
          observacao_decisao?: string | null
          observacao_execucao?: string | null
          ordem?: number | null
          proposto_por?: string | null
          proposto_por_id?: string | null
          reuniao_id?: string | null
          status?: Database["public"]["Enums"]["gov_pauta_status"]
          titulo?: string
          updated_at?: string
          vinculo_id?: string | null
          vinculo_nome?: string | null
          vinculo_tipo?: Database["public"]["Enums"]["gov_pauta_vinculo"] | null
          votos_abstencao?: number | null
          votos_impedimento?: number | null
          votos_nao?: number | null
          votos_sim?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "gov_pautas_proposto_por_id_fkey"
            columns: ["proposto_por_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_pautas_proposto_por_id_fkey"
            columns: ["proposto_por_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_pautas_proposto_por_id_fkey"
            columns: ["proposto_por_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_pautas_proposto_por_id_fkey"
            columns: ["proposto_por_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_pautas_proposto_por_id_fkey"
            columns: ["proposto_por_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_pautas_reuniao_id_fkey"
            columns: ["reuniao_id"]
            isOneToOne: false
            referencedRelation: "gov_reunioes"
            referencedColumns: ["id"]
          },
        ]
      }
      gov_reunioes: {
        Row: {
          ata_url: string | null
          ata_versao: number
          created_at: string
          data_reuniao: string
          horario: string | null
          id: string
          link_online: string | null
          local: string | null
          observacoes: string | null
          online: boolean
          presidente_id: string | null
          presidente_nome: string | null
          proxima_sugerida: string | null
          recorrencia_id: string | null
          secretaria_id: string | null
          secretaria_nome: string | null
          status: Database["public"]["Enums"]["gov_reuniao_status"]
          tipo: Database["public"]["Enums"]["gov_reuniao_tipo"]
          titulo: string
          updated_at: string
        }
        Insert: {
          ata_url?: string | null
          ata_versao?: number
          created_at?: string
          data_reuniao: string
          horario?: string | null
          id?: string
          link_online?: string | null
          local?: string | null
          observacoes?: string | null
          online?: boolean
          presidente_id?: string | null
          presidente_nome?: string | null
          proxima_sugerida?: string | null
          recorrencia_id?: string | null
          secretaria_id?: string | null
          secretaria_nome?: string | null
          status?: Database["public"]["Enums"]["gov_reuniao_status"]
          tipo?: Database["public"]["Enums"]["gov_reuniao_tipo"]
          titulo: string
          updated_at?: string
        }
        Update: {
          ata_url?: string | null
          ata_versao?: number
          created_at?: string
          data_reuniao?: string
          horario?: string | null
          id?: string
          link_online?: string | null
          local?: string | null
          observacoes?: string | null
          online?: boolean
          presidente_id?: string | null
          presidente_nome?: string | null
          proxima_sugerida?: string | null
          recorrencia_id?: string | null
          secretaria_id?: string | null
          secretaria_nome?: string | null
          status?: Database["public"]["Enums"]["gov_reuniao_status"]
          tipo?: Database["public"]["Enums"]["gov_reuniao_tipo"]
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gov_reunioes_presidente_id_fkey"
            columns: ["presidente_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_reunioes_presidente_id_fkey"
            columns: ["presidente_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_reunioes_presidente_id_fkey"
            columns: ["presidente_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_reunioes_presidente_id_fkey"
            columns: ["presidente_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_reunioes_presidente_id_fkey"
            columns: ["presidente_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_reunioes_secretaria_id_fkey"
            columns: ["secretaria_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_reunioes_secretaria_id_fkey"
            columns: ["secretaria_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_reunioes_secretaria_id_fkey"
            columns: ["secretaria_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_reunioes_secretaria_id_fkey"
            columns: ["secretaria_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_reunioes_secretaria_id_fkey"
            columns: ["secretaria_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
        ]
      }
      gov_votos: {
        Row: {
          id: string
          pauta_id: string
          pessoa_id: string | null
          registrado_em: string
          voto: Database["public"]["Enums"]["gov_voto"]
        }
        Insert: {
          id?: string
          pauta_id: string
          pessoa_id?: string | null
          registrado_em?: string
          voto: Database["public"]["Enums"]["gov_voto"]
        }
        Update: {
          id?: string
          pauta_id?: string
          pessoa_id?: string | null
          registrado_em?: string
          voto?: Database["public"]["Enums"]["gov_voto"]
        }
        Relationships: [
          {
            foreignKeyName: "gov_votos_pauta_id_fkey"
            columns: ["pauta_id"]
            isOneToOne: false
            referencedRelation: "gov_pautas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_votos_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_votos_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_votos_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_votos_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_votos_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
        ]
      }
      historico_lideranca: {
        Row: {
          acao: string
          cargo: string
          created_at: string
          data: string
          entidade: string
          entidade_id: string
          id: string
          membro_anterior_id: string | null
          membro_novo_id: string | null
          observacoes: string | null
          registrado_por: string | null
        }
        Insert: {
          acao: string
          cargo: string
          created_at?: string
          data?: string
          entidade: string
          entidade_id: string
          id?: string
          membro_anterior_id?: string | null
          membro_novo_id?: string | null
          observacoes?: string | null
          registrado_por?: string | null
        }
        Update: {
          acao?: string
          cargo?: string
          created_at?: string
          data?: string
          entidade?: string
          entidade_id?: string
          id?: string
          membro_anterior_id?: string | null
          membro_novo_id?: string | null
          observacoes?: string | null
          registrado_por?: string | null
        }
        Relationships: []
      }
      historico_membro: {
        Row: {
          created_at: string
          data: string
          descricao: string | null
          id: string
          membro_id: string
          registrado_por: string | null
          tipo: string
        }
        Insert: {
          created_at?: string
          data?: string
          descricao?: string | null
          id?: string
          membro_id: string
          registrado_por?: string | null
          tipo: string
        }
        Update: {
          created_at?: string
          data?: string
          descricao?: string | null
          id?: string
          membro_id?: string
          registrado_por?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "historico_membro_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historico_membro_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historico_membro_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historico_membro_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historico_membro_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
        ]
      }
      identidade_igreja: {
        Row: {
          ativa: boolean
          cnpj: string | null
          created_at: string
          fundada_em: string | null
          id: string
          logo_url: string | null
          missao: string | null
          nome_igreja: string
          origem_missao_ref: string | null
          origem_missao_secao: string | null
          origem_visao_ref: string | null
          origem_visao_secao: string | null
          pastor_id: string | null
          redes_sociais: Json
          resumo: string | null
          site_oficial: string | null
          slug: string | null
          updated_at: string
          visao: string | null
        }
        Insert: {
          ativa?: boolean
          cnpj?: string | null
          created_at?: string
          fundada_em?: string | null
          id?: string
          logo_url?: string | null
          missao?: string | null
          nome_igreja: string
          origem_missao_ref?: string | null
          origem_missao_secao?: string | null
          origem_visao_ref?: string | null
          origem_visao_secao?: string | null
          pastor_id?: string | null
          redes_sociais?: Json
          resumo?: string | null
          site_oficial?: string | null
          slug?: string | null
          updated_at?: string
          visao?: string | null
        }
        Update: {
          ativa?: boolean
          cnpj?: string | null
          created_at?: string
          fundada_em?: string | null
          id?: string
          logo_url?: string | null
          missao?: string | null
          nome_igreja?: string
          origem_missao_ref?: string | null
          origem_missao_secao?: string | null
          origem_visao_ref?: string | null
          origem_visao_secao?: string | null
          pastor_id?: string | null
          redes_sociais?: Json
          resumo?: string | null
          site_oficial?: string | null
          slug?: string | null
          updated_at?: string
          visao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "identidade_igreja_origem_missao_secao_fkey"
            columns: ["origem_missao_secao"]
            isOneToOne: false
            referencedRelation: "secoes_documento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "identidade_igreja_origem_visao_secao_fkey"
            columns: ["origem_visao_secao"]
            isOneToOne: false
            referencedRelation: "secoes_documento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "identidade_igreja_pastor_id_fkey"
            columns: ["pastor_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "identidade_igreja_pastor_id_fkey"
            columns: ["pastor_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "identidade_igreja_pastor_id_fkey"
            columns: ["pastor_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "identidade_igreja_pastor_id_fkey"
            columns: ["pastor_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "identidade_igreja_pastor_id_fkey"
            columns: ["pastor_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
        ]
      }
      identidade_valores: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string | null
          icone: string | null
          id: string
          igreja_id: string
          ordem: number
          valor: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          icone?: string | null
          id?: string
          igreja_id: string
          ordem?: number
          valor: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          icone?: string | null
          id?: string
          igreja_id?: string
          ordem?: number
          valor?: string
        }
        Relationships: [
          {
            foreignKeyName: "identidade_valores_igreja_id_fkey"
            columns: ["igreja_id"]
            isOneToOne: false
            referencedRelation: "identidade_igreja"
            referencedColumns: ["id"]
          },
        ]
      }
      igreja_instituicoes: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          id: string
          igreja_id: string
          instituicao_id: string
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          id?: string
          igreja_id: string
          instituicao_id: string
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          id?: string
          igreja_id?: string
          instituicao_id?: string
        }
        Relationships: []
      }
      igrejas: {
        Row: {
          ativa: boolean
          cidade: string | null
          cnpj: string | null
          created_at: string
          estado: string | null
          id: string
          nome: string
        }
        Insert: {
          ativa?: boolean
          cidade?: string | null
          cnpj?: string | null
          created_at?: string
          estado?: string | null
          id?: string
          nome: string
        }
        Update: {
          ativa?: boolean
          cidade?: string | null
          cnpj?: string | null
          created_at?: string
          estado?: string | null
          id?: string
          nome?: string
        }
        Relationships: []
      }
      importacoes_membros: {
        Row: {
          concluido_em: string | null
          created_at: string
          duplicados: number
          enviado_por: string | null
          erros: number
          id: string
          ignorados: number
          igreja_id: string | null
          igreja_id_new: string
          importados: number
          mapeamento: Json | null
          nome_arquivo: string
          observacao: string | null
          preview_dados: Json | null
          status: string
          total_linhas: number
        }
        Insert: {
          concluido_em?: string | null
          created_at?: string
          duplicados?: number
          enviado_por?: string | null
          erros?: number
          id?: string
          ignorados?: number
          igreja_id?: string | null
          igreja_id_new?: string
          importados?: number
          mapeamento?: Json | null
          nome_arquivo: string
          observacao?: string | null
          preview_dados?: Json | null
          status?: string
          total_linhas?: number
        }
        Update: {
          concluido_em?: string | null
          created_at?: string
          duplicados?: number
          enviado_por?: string | null
          erros?: number
          id?: string
          ignorados?: number
          igreja_id?: string | null
          igreja_id_new?: string
          importados?: number
          mapeamento?: Json | null
          nome_arquivo?: string
          observacao?: string | null
          preview_dados?: Json | null
          status?: string
          total_linhas?: number
        }
        Relationships: [
          {
            foreignKeyName: "importacoes_membros_igreja_id_fkey"
            columns: ["igreja_id"]
            isOneToOne: false
            referencedRelation: "identidade_igreja"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "importacoes_membros_igreja_id_new_fkey"
            columns: ["igreja_id_new"]
            isOneToOne: false
            referencedRelation: "igrejas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "importacoes_membros_igreja_id_new_fkey"
            columns: ["igreja_id_new"]
            isOneToOne: false
            referencedRelation: "v_igrejas_ativas"
            referencedColumns: ["id"]
          },
        ]
      }
      instituicoes: {
        Row: {
          ativo: boolean
          created_at: string | null
          id: string
          nome: string
          oficial: boolean
          permite_integracao: boolean
          sigla: string | null
          site_oficial: string | null
          tipo_instituicao: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string | null
          id?: string
          nome: string
          oficial?: boolean
          permite_integracao?: boolean
          sigla?: string | null
          site_oficial?: string | null
          tipo_instituicao?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string | null
          id?: string
          nome?: string
          oficial?: boolean
          permite_integracao?: boolean
          sigla?: string | null
          site_oficial?: string | null
          tipo_instituicao?: string
        }
        Relationships: []
      }
      liderancas: {
        Row: {
          ativo: boolean
          created_at: string
          data_fim: string | null
          data_inicio: string
          funcao: Database["public"]["Enums"]["funcao_lideranca"]
          id: string
          observacoes: string | null
          pessoa_id: string
          referencia_id: string
          tipo: Database["public"]["Enums"]["tipo_lideranca_ref"]
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          data_fim?: string | null
          data_inicio?: string
          funcao?: Database["public"]["Enums"]["funcao_lideranca"]
          id?: string
          observacoes?: string | null
          pessoa_id: string
          referencia_id: string
          tipo: Database["public"]["Enums"]["tipo_lideranca_ref"]
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          data_fim?: string | null
          data_inicio?: string
          funcao?: Database["public"]["Enums"]["funcao_lideranca"]
          id?: string
          observacoes?: string | null
          pessoa_id?: string
          referencia_id?: string
          tipo?: Database["public"]["Enums"]["tipo_lideranca_ref"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "liderancas_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liderancas_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liderancas_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liderancas_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liderancas_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
        ]
      }
      locais: {
        Row: {
          acessibilidade: boolean
          ambiente: Database["public"]["Enums"]["local_ambiente"] | null
          area_m2: number | null
          capacidade: number | null
          codigo: string | null
          codigo_chave: string | null
          created_at: string
          descricao: string | null
          exclusivo_arrecadacao: boolean
          frequencia_limpeza: string | null
          id: string
          localizacao_interna:
            | Database["public"]["Enums"]["local_localizacao_interna"]
            | null
          mapa_url: string | null
          motivo_status: string | null
          nome: string
          nome_completo: string | null
          observacoes: string | null
          pavimento: Database["public"]["Enums"]["local_pavimento"] | null
          periodicidade_manutencao: number | null
          permite_agendamento: boolean
          predio: Database["public"]["Enums"]["local_predio"] | null
          predio_id: string | null
          proxima_manutencao: string | null
          referencia_visual: string | null
          responsavel_id: string | null
          responsavel_limpeza_id: string | null
          responsavel_manutencao_id: string | null
          restricao_acesso: Database["public"]["Enums"]["local_restricao_acesso"]
          status: Database["public"]["Enums"]["local_status"]
          status_operacional: Database["public"]["Enums"]["local_status_op"]
          tipo: Database["public"]["Enums"]["local_tipo"]
          tipos_evento_permitidos: Database["public"]["Enums"]["evento_tipo"][]
          ultima_limpeza: string | null
          ultima_manutencao: string | null
          updated_at: string
          uso_principal: Database["public"]["Enums"]["local_uso"] | null
        }
        Insert: {
          acessibilidade?: boolean
          ambiente?: Database["public"]["Enums"]["local_ambiente"] | null
          area_m2?: number | null
          capacidade?: number | null
          codigo?: string | null
          codigo_chave?: string | null
          created_at?: string
          descricao?: string | null
          exclusivo_arrecadacao?: boolean
          frequencia_limpeza?: string | null
          id?: string
          localizacao_interna?:
            | Database["public"]["Enums"]["local_localizacao_interna"]
            | null
          mapa_url?: string | null
          motivo_status?: string | null
          nome: string
          nome_completo?: string | null
          observacoes?: string | null
          pavimento?: Database["public"]["Enums"]["local_pavimento"] | null
          periodicidade_manutencao?: number | null
          permite_agendamento?: boolean
          predio?: Database["public"]["Enums"]["local_predio"] | null
          predio_id?: string | null
          proxima_manutencao?: string | null
          referencia_visual?: string | null
          responsavel_id?: string | null
          responsavel_limpeza_id?: string | null
          responsavel_manutencao_id?: string | null
          restricao_acesso?: Database["public"]["Enums"]["local_restricao_acesso"]
          status?: Database["public"]["Enums"]["local_status"]
          status_operacional?: Database["public"]["Enums"]["local_status_op"]
          tipo?: Database["public"]["Enums"]["local_tipo"]
          tipos_evento_permitidos?: Database["public"]["Enums"]["evento_tipo"][]
          ultima_limpeza?: string | null
          ultima_manutencao?: string | null
          updated_at?: string
          uso_principal?: Database["public"]["Enums"]["local_uso"] | null
        }
        Update: {
          acessibilidade?: boolean
          ambiente?: Database["public"]["Enums"]["local_ambiente"] | null
          area_m2?: number | null
          capacidade?: number | null
          codigo?: string | null
          codigo_chave?: string | null
          created_at?: string
          descricao?: string | null
          exclusivo_arrecadacao?: boolean
          frequencia_limpeza?: string | null
          id?: string
          localizacao_interna?:
            | Database["public"]["Enums"]["local_localizacao_interna"]
            | null
          mapa_url?: string | null
          motivo_status?: string | null
          nome?: string
          nome_completo?: string | null
          observacoes?: string | null
          pavimento?: Database["public"]["Enums"]["local_pavimento"] | null
          periodicidade_manutencao?: number | null
          permite_agendamento?: boolean
          predio?: Database["public"]["Enums"]["local_predio"] | null
          predio_id?: string | null
          proxima_manutencao?: string | null
          referencia_visual?: string | null
          responsavel_id?: string | null
          responsavel_limpeza_id?: string | null
          responsavel_manutencao_id?: string | null
          restricao_acesso?: Database["public"]["Enums"]["local_restricao_acesso"]
          status?: Database["public"]["Enums"]["local_status"]
          status_operacional?: Database["public"]["Enums"]["local_status_op"]
          tipo?: Database["public"]["Enums"]["local_tipo"]
          tipos_evento_permitidos?: Database["public"]["Enums"]["evento_tipo"][]
          ultima_limpeza?: string | null
          ultima_manutencao?: string | null
          updated_at?: string
          uso_principal?: Database["public"]["Enums"]["local_uso"] | null
        }
        Relationships: [
          {
            foreignKeyName: "locais_predio_id_fkey"
            columns: ["predio_id"]
            isOneToOne: false
            referencedRelation: "predios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locais_predio_id_fkey"
            columns: ["predio_id"]
            isOneToOne: false
            referencedRelation: "v_estrutura_fisica"
            referencedColumns: ["predio_id"]
          },
          {
            foreignKeyName: "locais_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locais_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locais_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locais_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locais_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locais_responsavel_limpeza_id_fkey"
            columns: ["responsavel_limpeza_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locais_responsavel_limpeza_id_fkey"
            columns: ["responsavel_limpeza_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locais_responsavel_limpeza_id_fkey"
            columns: ["responsavel_limpeza_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locais_responsavel_limpeza_id_fkey"
            columns: ["responsavel_limpeza_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locais_responsavel_limpeza_id_fkey"
            columns: ["responsavel_limpeza_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locais_responsavel_manutencao_id_fkey"
            columns: ["responsavel_manutencao_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locais_responsavel_manutencao_id_fkey"
            columns: ["responsavel_manutencao_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locais_responsavel_manutencao_id_fkey"
            columns: ["responsavel_manutencao_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locais_responsavel_manutencao_id_fkey"
            columns: ["responsavel_manutencao_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locais_responsavel_manutencao_id_fkey"
            columns: ["responsavel_manutencao_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
        ]
      }
      locais_historico_operacional: {
        Row: {
          created_at: string
          custo: number | null
          data: string
          descricao: string | null
          id: string
          local_id: string
          realizado_por: string | null
          tipo: string
        }
        Insert: {
          created_at?: string
          custo?: number | null
          data?: string
          descricao?: string | null
          id?: string
          local_id: string
          realizado_por?: string | null
          tipo: string
        }
        Update: {
          created_at?: string
          custo?: number | null
          data?: string
          descricao?: string | null
          id?: string
          local_id?: string
          realizado_por?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "locais_historico_operacional_local_id_fkey"
            columns: ["local_id"]
            isOneToOne: false
            referencedRelation: "locais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locais_historico_operacional_local_id_fkey"
            columns: ["local_id"]
            isOneToOne: false
            referencedRelation: "v_estrutura_fisica"
            referencedColumns: ["local_id"]
          },
          {
            foreignKeyName: "locais_historico_operacional_realizado_por_fkey"
            columns: ["realizado_por"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locais_historico_operacional_realizado_por_fkey"
            columns: ["realizado_por"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locais_historico_operacional_realizado_por_fkey"
            columns: ["realizado_por"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locais_historico_operacional_realizado_por_fkey"
            columns: ["realizado_por"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locais_historico_operacional_realizado_por_fkey"
            columns: ["realizado_por"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
        ]
      }
      log_auditoria: {
        Row: {
          acao: string
          campos_alt: Json | null
          created_at: string
          id: string
          ip_origem: string | null
          registro_id: string | null
          tabela: string
          usuario_email: string | null
          usuario_id: string | null
          valor_antes: Json | null
        }
        Insert: {
          acao: string
          campos_alt?: Json | null
          created_at?: string
          id?: string
          ip_origem?: string | null
          registro_id?: string | null
          tabela: string
          usuario_email?: string | null
          usuario_id?: string | null
          valor_antes?: Json | null
        }
        Update: {
          acao?: string
          campos_alt?: Json | null
          created_at?: string
          id?: string
          ip_origem?: string | null
          registro_id?: string | null
          tabela?: string
          usuario_email?: string | null
          usuario_id?: string | null
          valor_antes?: Json | null
        }
        Relationships: []
      }
      log_exclusoes: {
        Row: {
          confirmado_em: string | null
          created_at: string
          dados_antes: Json | null
          descricao: string | null
          id: string
          importacao_id: string | null
          ip_origem: string | null
          motivo: string | null
          quantidade: number
          registro_id: string | null
          tabela: string | null
          tipo: string
          usuario_email: string | null
          usuario_id: string | null
        }
        Insert: {
          confirmado_em?: string | null
          created_at?: string
          dados_antes?: Json | null
          descricao?: string | null
          id?: string
          importacao_id?: string | null
          ip_origem?: string | null
          motivo?: string | null
          quantidade?: number
          registro_id?: string | null
          tabela?: string | null
          tipo?: string
          usuario_email?: string | null
          usuario_id?: string | null
        }
        Update: {
          confirmado_em?: string | null
          created_at?: string
          dados_antes?: Json | null
          descricao?: string | null
          id?: string
          importacao_id?: string | null
          ip_origem?: string | null
          motivo?: string | null
          quantidade?: number
          registro_id?: string | null
          tabela?: string | null
          tipo?: string
          usuario_email?: string | null
          usuario_id?: string | null
        }
        Relationships: []
      }
      membros: {
        Row: {
          bairro: string | null
          cep: string | null
          cidade: string | null
          como_conheceu: string | null
          como_conheceu_descricao: string | null
          complemento: string | null
          congregacao_id: string | null
          convidado_nome: string | null
          convidado_por: string | null
          cpf: string | null
          created_at: string
          created_by: string | null
          data_aceite_lgpd: string | null
          data_batismo: string | null
          data_casamento: string | null
          data_congregado: string | null
          data_consagracao_missionaria: string | null
          data_consagracao_pastoral: string | null
          data_entrada: string | null
          data_membro: string | null
          data_nascimento: string | null
          data_ordenacao_diaconal: string | null
          data_ordenacao_presbiteral: string | null
          data_saida: string | null
          email: string | null
          endereco: string | null
          endereco_completo: string | null
          estado: string | null
          estado_civil: Database["public"]["Enums"]["estado_civil"] | null
          external_id: string | null
          familia_id: string | null
          first_login: boolean
          foto_url: string | null
          funcao_fim: string | null
          funcao_inicio: string | null
          funcao_ministerial: Database["public"]["Enums"]["funcao_ministerial"]
          funcao_na_igreja: string | null
          funcoes_ministeriais: Database["public"]["Enums"]["funcao_ministerial"][]
          geo_fonte: string | null
          geo_place_id: string | null
          id: string
          igreja_id: string
          importacao_id: string | null
          latitude: number | null
          lgpd_aceito: boolean
          longitude: number | null
          membro_igreja: boolean | null
          nascimento_dia_mes: string | null
          nome_completo: string
          nome_social: string | null
          numero: string | null
          numero_visitas: number
          observacoes: string | null
          observacoes_pastorais: string | null
          onboarding_completo: boolean
          origem_cadastro: string
          parentesco: string | null
          pequeno_grupo_id: string | null
          perfil_acesso: Database["public"]["Enums"]["perfil_acesso"] | null
          quem_convidou: string | null
          quem_convidou_id: string | null
          responsavel_familiar: boolean
          responsavel_id: string | null
          rg: string | null
          saida_registrada_em: string | null
          saida_registrada_por: string | null
          saida_registrada_por_funcao: string | null
          saida_registrada_por_nome: string | null
          score_engajamento: number
          sexo: Database["public"]["Enums"]["sexo"] | null
          status: Database["public"]["Enums"]["membro_status"]
          status_acolhimento:
            | Database["public"]["Enums"]["status_acolhimento_enum"]
            | null
          telefone_celular: string | null
          telefone_dispensado: boolean
          telefone_e164: string | null
          telefone_fixo: string | null
          tem_acesso_sistema: boolean
          tipo_entrada: Database["public"]["Enums"]["tipo_entrada_rol"] | null
          tipo_pessoa: Database["public"]["Enums"]["tipo_pessoa"]
          uf: string | null
          ultimo_contato_em: string | null
          ultimo_contato_observacao: string | null
          ultimo_contato_tipo: string | null
          updated_at: string
        }
        Insert: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          como_conheceu?: string | null
          como_conheceu_descricao?: string | null
          complemento?: string | null
          congregacao_id?: string | null
          convidado_nome?: string | null
          convidado_por?: string | null
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          data_aceite_lgpd?: string | null
          data_batismo?: string | null
          data_casamento?: string | null
          data_congregado?: string | null
          data_consagracao_missionaria?: string | null
          data_consagracao_pastoral?: string | null
          data_entrada?: string | null
          data_membro?: string | null
          data_nascimento?: string | null
          data_ordenacao_diaconal?: string | null
          data_ordenacao_presbiteral?: string | null
          data_saida?: string | null
          email?: string | null
          endereco?: string | null
          endereco_completo?: string | null
          estado?: string | null
          estado_civil?: Database["public"]["Enums"]["estado_civil"] | null
          external_id?: string | null
          familia_id?: string | null
          first_login?: boolean
          foto_url?: string | null
          funcao_fim?: string | null
          funcao_inicio?: string | null
          funcao_ministerial?: Database["public"]["Enums"]["funcao_ministerial"]
          funcao_na_igreja?: string | null
          funcoes_ministeriais?: Database["public"]["Enums"]["funcao_ministerial"][]
          geo_fonte?: string | null
          geo_place_id?: string | null
          id?: string
          igreja_id?: string
          importacao_id?: string | null
          latitude?: number | null
          lgpd_aceito?: boolean
          longitude?: number | null
          membro_igreja?: boolean | null
          nascimento_dia_mes?: string | null
          nome_completo: string
          nome_social?: string | null
          numero?: string | null
          numero_visitas?: number
          observacoes?: string | null
          observacoes_pastorais?: string | null
          onboarding_completo?: boolean
          origem_cadastro?: string
          parentesco?: string | null
          pequeno_grupo_id?: string | null
          perfil_acesso?: Database["public"]["Enums"]["perfil_acesso"] | null
          quem_convidou?: string | null
          quem_convidou_id?: string | null
          responsavel_familiar?: boolean
          responsavel_id?: string | null
          rg?: string | null
          saida_registrada_em?: string | null
          saida_registrada_por?: string | null
          saida_registrada_por_funcao?: string | null
          saida_registrada_por_nome?: string | null
          score_engajamento?: number
          sexo?: Database["public"]["Enums"]["sexo"] | null
          status?: Database["public"]["Enums"]["membro_status"]
          status_acolhimento?:
            | Database["public"]["Enums"]["status_acolhimento_enum"]
            | null
          telefone_celular?: string | null
          telefone_dispensado?: boolean
          telefone_e164?: string | null
          telefone_fixo?: string | null
          tem_acesso_sistema?: boolean
          tipo_entrada?: Database["public"]["Enums"]["tipo_entrada_rol"] | null
          tipo_pessoa?: Database["public"]["Enums"]["tipo_pessoa"]
          uf?: string | null
          ultimo_contato_em?: string | null
          ultimo_contato_observacao?: string | null
          ultimo_contato_tipo?: string | null
          updated_at?: string
        }
        Update: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          como_conheceu?: string | null
          como_conheceu_descricao?: string | null
          complemento?: string | null
          congregacao_id?: string | null
          convidado_nome?: string | null
          convidado_por?: string | null
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          data_aceite_lgpd?: string | null
          data_batismo?: string | null
          data_casamento?: string | null
          data_congregado?: string | null
          data_consagracao_missionaria?: string | null
          data_consagracao_pastoral?: string | null
          data_entrada?: string | null
          data_membro?: string | null
          data_nascimento?: string | null
          data_ordenacao_diaconal?: string | null
          data_ordenacao_presbiteral?: string | null
          data_saida?: string | null
          email?: string | null
          endereco?: string | null
          endereco_completo?: string | null
          estado?: string | null
          estado_civil?: Database["public"]["Enums"]["estado_civil"] | null
          external_id?: string | null
          familia_id?: string | null
          first_login?: boolean
          foto_url?: string | null
          funcao_fim?: string | null
          funcao_inicio?: string | null
          funcao_ministerial?: Database["public"]["Enums"]["funcao_ministerial"]
          funcao_na_igreja?: string | null
          funcoes_ministeriais?: Database["public"]["Enums"]["funcao_ministerial"][]
          geo_fonte?: string | null
          geo_place_id?: string | null
          id?: string
          igreja_id?: string
          importacao_id?: string | null
          latitude?: number | null
          lgpd_aceito?: boolean
          longitude?: number | null
          membro_igreja?: boolean | null
          nascimento_dia_mes?: string | null
          nome_completo?: string
          nome_social?: string | null
          numero?: string | null
          numero_visitas?: number
          observacoes?: string | null
          observacoes_pastorais?: string | null
          onboarding_completo?: boolean
          origem_cadastro?: string
          parentesco?: string | null
          pequeno_grupo_id?: string | null
          perfil_acesso?: Database["public"]["Enums"]["perfil_acesso"] | null
          quem_convidou?: string | null
          quem_convidou_id?: string | null
          responsavel_familiar?: boolean
          responsavel_id?: string | null
          rg?: string | null
          saida_registrada_em?: string | null
          saida_registrada_por?: string | null
          saida_registrada_por_funcao?: string | null
          saida_registrada_por_nome?: string | null
          score_engajamento?: number
          sexo?: Database["public"]["Enums"]["sexo"] | null
          status?: Database["public"]["Enums"]["membro_status"]
          status_acolhimento?:
            | Database["public"]["Enums"]["status_acolhimento_enum"]
            | null
          telefone_celular?: string | null
          telefone_dispensado?: boolean
          telefone_e164?: string | null
          telefone_fixo?: string | null
          tem_acesso_sistema?: boolean
          tipo_entrada?: Database["public"]["Enums"]["tipo_entrada_rol"] | null
          tipo_pessoa?: Database["public"]["Enums"]["tipo_pessoa"]
          uf?: string | null
          ultimo_contato_em?: string | null
          ultimo_contato_observacao?: string | null
          ultimo_contato_tipo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "membros_congregacao_id_fkey"
            columns: ["congregacao_id"]
            isOneToOne: false
            referencedRelation: "congregacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membros_convidado_por_fkey"
            columns: ["convidado_por"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membros_convidado_por_fkey"
            columns: ["convidado_por"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membros_convidado_por_fkey"
            columns: ["convidado_por"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membros_convidado_por_fkey"
            columns: ["convidado_por"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membros_convidado_por_fkey"
            columns: ["convidado_por"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membros_familia_id_fkey"
            columns: ["familia_id"]
            isOneToOne: false
            referencedRelation: "familias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membros_igreja_id_fkey"
            columns: ["igreja_id"]
            isOneToOne: false
            referencedRelation: "igrejas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membros_igreja_id_fkey"
            columns: ["igreja_id"]
            isOneToOne: false
            referencedRelation: "v_igrejas_ativas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membros_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "importacoes_membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membros_importacao_id_fkey"
            columns: ["importacao_id"]
            isOneToOne: false
            referencedRelation: "v_importacoes_resumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membros_quem_convidou_id_fkey"
            columns: ["quem_convidou_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membros_quem_convidou_id_fkey"
            columns: ["quem_convidou_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membros_quem_convidou_id_fkey"
            columns: ["quem_convidou_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membros_quem_convidou_id_fkey"
            columns: ["quem_convidou_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membros_quem_convidou_id_fkey"
            columns: ["quem_convidou_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
        ]
      }
      membros_detalhes: {
        Row: {
          cargo_ministerial: string | null
          conjuge_nome: string | null
          created_at: string
          data_batismo: string | null
          data_casamento: string | null
          data_entrada_rol: string | null
          data_ordenacao: string | null
          data_saida_rol: string | null
          estado_civil: string | null
          filhos_nomes: string[] | null
          forma_entrada: string | null
          historico_ministerial: string | null
          id: string
          local_batismo: string | null
          ministerio_ids: string[] | null
          motivo_saida: string | null
          observacoes_diakonais: string | null
          pessoa_id: string
          updated_at: string
        }
        Insert: {
          cargo_ministerial?: string | null
          conjuge_nome?: string | null
          created_at?: string
          data_batismo?: string | null
          data_casamento?: string | null
          data_entrada_rol?: string | null
          data_ordenacao?: string | null
          data_saida_rol?: string | null
          estado_civil?: string | null
          filhos_nomes?: string[] | null
          forma_entrada?: string | null
          historico_ministerial?: string | null
          id?: string
          local_batismo?: string | null
          ministerio_ids?: string[] | null
          motivo_saida?: string | null
          observacoes_diakonais?: string | null
          pessoa_id: string
          updated_at?: string
        }
        Update: {
          cargo_ministerial?: string | null
          conjuge_nome?: string | null
          created_at?: string
          data_batismo?: string | null
          data_casamento?: string | null
          data_entrada_rol?: string | null
          data_ordenacao?: string | null
          data_saida_rol?: string | null
          estado_civil?: string | null
          filhos_nomes?: string[] | null
          forma_entrada?: string | null
          historico_ministerial?: string | null
          id?: string
          local_batismo?: string | null
          ministerio_ids?: string[] | null
          motivo_saida?: string | null
          observacoes_diakonais?: string | null
          pessoa_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "membros_detalhes_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: true
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
        ]
      }
      membros_excluidos_backup: {
        Row: {
          dados: Json
          excluido_em: string
          id: string
          log_exclusao_id: string | null
          membro_id: string | null
        }
        Insert: {
          dados: Json
          excluido_em?: string
          id?: string
          log_exclusao_id?: string | null
          membro_id?: string | null
        }
        Update: {
          dados?: Json
          excluido_em?: string
          id?: string
          log_exclusao_id?: string | null
          membro_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "membros_excluidos_backup_log_exclusao_id_fkey"
            columns: ["log_exclusao_id"]
            isOneToOne: false
            referencedRelation: "log_exclusoes"
            referencedColumns: ["id"]
          },
        ]
      }
      ministerio_membros: {
        Row: {
          ativo: boolean
          created_at: string
          data_fim: string | null
          data_inicio: string
          funcao: string | null
          id: string
          membro_id: string
          ministerio_id: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          data_fim?: string | null
          data_inicio?: string
          funcao?: string | null
          id?: string
          membro_id: string
          ministerio_id: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          data_fim?: string | null
          data_inicio?: string
          funcao?: string | null
          id?: string
          membro_id?: string
          ministerio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ministerio_membros_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ministerio_membros_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ministerio_membros_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ministerio_membros_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ministerio_membros_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ministerio_membros_ministerio_id_fkey"
            columns: ["ministerio_id"]
            isOneToOne: false
            referencedRelation: "ministerios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ministerio_membros_ministerio_id_fkey"
            columns: ["ministerio_id"]
            isOneToOne: false
            referencedRelation: "v_voluntarios_completo"
            referencedColumns: ["ministerio_id"]
          },
        ]
      }
      ministerios: {
        Row: {
          area_acolhimento_id: string | null
          ativo: boolean
          co_lider_id: string | null
          congregacao_id: string | null
          cor: string | null
          cor_identidade: string | null
          created_at: string
          data_fundacao: string | null
          descricao: string | null
          dia_reuniao: string | null
          external_id: string | null
          horario_reuniao: string | null
          icone: string | null
          id: string
          igreja_id: string
          lider_id: string | null
          local_reuniao: string | null
          modulo: string | null
          nome: string
          objetivo: string | null
          publico_alvo: string | null
          sigla: string | null
          tipo: string | null
          updated_at: string
          vice_lider_id: string | null
        }
        Insert: {
          area_acolhimento_id?: string | null
          ativo?: boolean
          co_lider_id?: string | null
          congregacao_id?: string | null
          cor?: string | null
          cor_identidade?: string | null
          created_at?: string
          data_fundacao?: string | null
          descricao?: string | null
          dia_reuniao?: string | null
          external_id?: string | null
          horario_reuniao?: string | null
          icone?: string | null
          id?: string
          igreja_id?: string
          lider_id?: string | null
          local_reuniao?: string | null
          modulo?: string | null
          nome: string
          objetivo?: string | null
          publico_alvo?: string | null
          sigla?: string | null
          tipo?: string | null
          updated_at?: string
          vice_lider_id?: string | null
        }
        Update: {
          area_acolhimento_id?: string | null
          ativo?: boolean
          co_lider_id?: string | null
          congregacao_id?: string | null
          cor?: string | null
          cor_identidade?: string | null
          created_at?: string
          data_fundacao?: string | null
          descricao?: string | null
          dia_reuniao?: string | null
          external_id?: string | null
          horario_reuniao?: string | null
          icone?: string | null
          id?: string
          igreja_id?: string
          lider_id?: string | null
          local_reuniao?: string | null
          modulo?: string | null
          nome?: string
          objetivo?: string | null
          publico_alvo?: string | null
          sigla?: string | null
          tipo?: string | null
          updated_at?: string
          vice_lider_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ministerios_area_acolhimento_id_fkey"
            columns: ["area_acolhimento_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ministerios_area_acolhimento_id_fkey"
            columns: ["area_acolhimento_id"]
            isOneToOne: false
            referencedRelation: "v_voluntarios_completo"
            referencedColumns: ["area_id"]
          },
          {
            foreignKeyName: "ministerios_congregacao_id_fkey"
            columns: ["congregacao_id"]
            isOneToOne: false
            referencedRelation: "congregacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ministerios_igreja_id_fkey"
            columns: ["igreja_id"]
            isOneToOne: false
            referencedRelation: "igrejas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ministerios_igreja_id_fkey"
            columns: ["igreja_id"]
            isOneToOne: false
            referencedRelation: "v_igrejas_ativas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ministerios_lider_id_fkey"
            columns: ["lider_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ministerios_lider_id_fkey"
            columns: ["lider_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ministerios_lider_id_fkey"
            columns: ["lider_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ministerios_lider_id_fkey"
            columns: ["lider_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ministerios_lider_id_fkey"
            columns: ["lider_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ministerios_vice_lider_id_fkey"
            columns: ["vice_lider_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ministerios_vice_lider_id_fkey"
            columns: ["vice_lider_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ministerios_vice_lider_id_fkey"
            columns: ["vice_lider_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ministerios_vice_lider_id_fkey"
            columns: ["vice_lider_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ministerios_vice_lider_id_fkey"
            columns: ["vice_lider_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
        ]
      }
      modelos_ministerio: {
        Row: {
          ativo: boolean
          base_documental: string | null
          created_at: string
          descricao: string | null
          id: string
          igreja_id: string
          nivel_sugerido: number | null
          nome: string
          palavras_chave: string[] | null
          responsabilidades: string | null
          secao_id: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          base_documental?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          igreja_id?: string
          nivel_sugerido?: number | null
          nome: string
          palavras_chave?: string[] | null
          responsabilidades?: string | null
          secao_id?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          base_documental?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          igreja_id?: string
          nivel_sugerido?: number | null
          nome?: string
          palavras_chave?: string[] | null
          responsabilidades?: string | null
          secao_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "modelos_ministerio_igreja_id_fkey"
            columns: ["igreja_id"]
            isOneToOne: false
            referencedRelation: "igrejas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "modelos_ministerio_igreja_id_fkey"
            columns: ["igreja_id"]
            isOneToOne: false
            referencedRelation: "v_igrejas_ativas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "modelos_ministerio_secao_id_fkey"
            columns: ["secao_id"]
            isOneToOne: false
            referencedRelation: "secoes_documento"
            referencedColumns: ["id"]
          },
        ]
      }
      niveis_organizacionais: {
        Row: {
          descricao: string | null
          id: number
          nome: string
          ordem: number
        }
        Insert: {
          descricao?: string | null
          id: number
          nome: string
          ordem: number
        }
        Update: {
          descricao?: string | null
          id?: number
          nome?: string
          ordem?: number
        }
        Relationships: []
      }
      observacoes_pastorais_arquivadas: {
        Row: {
          arquivado_em: string
          id: string
          membro_id: string
          motivo: string
          nome_completo: string
          texto: string
        }
        Insert: {
          arquivado_em?: string
          id?: string
          membro_id: string
          motivo: string
          nome_completo: string
          texto: string
        }
        Update: {
          arquivado_em?: string
          id?: string
          membro_id?: string
          motivo?: string
          nome_completo?: string
          texto?: string
        }
        Relationships: [
          {
            foreignKeyName: "observacoes_pastorais_arquivadas_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "observacoes_pastorais_arquivadas_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "observacoes_pastorais_arquivadas_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "observacoes_pastorais_arquivadas_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "observacoes_pastorais_arquivadas_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_caixa: {
        Row: {
          abertura: string | null
          fechamento: string | null
          id: string
          ministerio_id: string | null
          operador: string | null
          reserva_id: string | null
          status: string | null
          valor_inicial: number | null
        }
        Insert: {
          abertura?: string | null
          fechamento?: string | null
          id?: string
          ministerio_id?: string | null
          operador?: string | null
          reserva_id?: string | null
          status?: string | null
          valor_inicial?: number | null
        }
        Update: {
          abertura?: string | null
          fechamento?: string | null
          id?: string
          ministerio_id?: string | null
          operador?: string | null
          reserva_id?: string | null
          status?: string | null
          valor_inicial?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pdv_caixa_ministerio_id_fkey"
            columns: ["ministerio_id"]
            isOneToOne: false
            referencedRelation: "ministerios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_caixa_ministerio_id_fkey"
            columns: ["ministerio_id"]
            isOneToOne: false
            referencedRelation: "v_voluntarios_completo"
            referencedColumns: ["ministerio_id"]
          },
          {
            foreignKeyName: "pdv_caixa_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: false
            referencedRelation: "bazar_reservas"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_estoque: {
        Row: {
          atualizado_em: string | null
          id: string
          produto_id: string | null
          quantidade: number | null
        }
        Insert: {
          atualizado_em?: string | null
          id?: string
          produto_id?: string | null
          quantidade?: number | null
        }
        Update: {
          atualizado_em?: string | null
          id?: string
          produto_id?: string | null
          quantidade?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pdv_estoque_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "pdv_produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_fechamento: {
        Row: {
          caixa_id: string | null
          created_at: string | null
          id: string
          total_bruto: number | null
          total_liquido: number | null
          total_taxa: number | null
        }
        Insert: {
          caixa_id?: string | null
          created_at?: string | null
          id?: string
          total_bruto?: number | null
          total_liquido?: number | null
          total_taxa?: number | null
        }
        Update: {
          caixa_id?: string | null
          created_at?: string | null
          id?: string
          total_bruto?: number | null
          total_liquido?: number | null
          total_taxa?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pdv_fechamento_caixa_id_fkey"
            columns: ["caixa_id"]
            isOneToOne: false
            referencedRelation: "pdv_caixa"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_formas_pagamento: {
        Row: {
          conta: string | null
          conta_financeira: string | null
          id: string
          nome: string | null
          taxa_percentual: number | null
        }
        Insert: {
          conta?: string | null
          conta_financeira?: string | null
          id?: string
          nome?: string | null
          taxa_percentual?: number | null
        }
        Update: {
          conta?: string | null
          conta_financeira?: string | null
          id?: string
          nome?: string | null
          taxa_percentual?: number | null
        }
        Relationships: []
      }
      pdv_itens_venda: {
        Row: {
          id: string
          preco_unitario: number | null
          produto_id: string | null
          quantidade: number | null
          venda_id: string | null
        }
        Insert: {
          id?: string
          preco_unitario?: number | null
          produto_id?: string | null
          quantidade?: number | null
          venda_id?: string | null
        }
        Update: {
          id?: string
          preco_unitario?: number | null
          produto_id?: string | null
          quantidade?: number | null
          venda_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pdv_itens_venda_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "pdv_produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_itens_venda_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "pdv_vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_pagamentos: {
        Row: {
          forma_pagamento_id: string | null
          id: string
          valor_bruto: number | null
          valor_liquido: number | null
          valor_taxa: number | null
          venda_id: string | null
        }
        Insert: {
          forma_pagamento_id?: string | null
          id?: string
          valor_bruto?: number | null
          valor_liquido?: number | null
          valor_taxa?: number | null
          venda_id?: string | null
        }
        Update: {
          forma_pagamento_id?: string | null
          id?: string
          valor_bruto?: number | null
          valor_liquido?: number | null
          valor_taxa?: number | null
          venda_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pdv_pagamentos_forma_pagamento_id_fkey"
            columns: ["forma_pagamento_id"]
            isOneToOne: false
            referencedRelation: "pdv_formas_pagamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdv_pagamentos_venda_id_fkey"
            columns: ["venda_id"]
            isOneToOne: false
            referencedRelation: "pdv_vendas"
            referencedColumns: ["id"]
          },
        ]
      }
      pdv_produtos: {
        Row: {
          ativo: boolean | null
          categoria: string | null
          id: string
          nome: string
          preco: number
        }
        Insert: {
          ativo?: boolean | null
          categoria?: string | null
          id?: string
          nome: string
          preco: number
        }
        Update: {
          ativo?: boolean | null
          categoria?: string | null
          id?: string
          nome?: string
          preco?: number
        }
        Relationships: []
      }
      pdv_vendas: {
        Row: {
          caixa_id: string | null
          data: string | null
          id: string
          total_bruto: number | null
          total_liquido: number | null
          total_taxa: number | null
        }
        Insert: {
          caixa_id?: string | null
          data?: string | null
          id?: string
          total_bruto?: number | null
          total_liquido?: number | null
          total_taxa?: number | null
        }
        Update: {
          caixa_id?: string | null
          data?: string | null
          id?: string
          total_bruto?: number | null
          total_liquido?: number | null
          total_taxa?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pdv_vendas_caixa_id_fkey"
            columns: ["caixa_id"]
            isOneToOne: false
            referencedRelation: "pdv_caixa"
            referencedColumns: ["id"]
          },
        ]
      }
      perfil_servico: {
        Row: {
          areas_evitar: string[] | null
          areas_preferidas: string[] | null
          ativo: boolean
          carga_atual_mes: number
          created_at: string
          descanso_ate: string | null
          dias_disponiveis: Database["public"]["Enums"]["dia_semana"][]
          em_descanso: boolean
          frequencia_maxima: Database["public"]["Enums"]["frequencia_servico"]
          id: string
          igreja_id: string | null
          max_escalas_mes: number
          motivo_descanso: string | null
          nivel_sobrecarga: number
          pessoa_id: string
          restricoes: string | null
          score_engajamento: number | null
          turnos_disponiveis: Database["public"]["Enums"]["turno_disponibilidade"][]
          updated_at: string
        }
        Insert: {
          areas_evitar?: string[] | null
          areas_preferidas?: string[] | null
          ativo?: boolean
          carga_atual_mes?: number
          created_at?: string
          descanso_ate?: string | null
          dias_disponiveis?: Database["public"]["Enums"]["dia_semana"][]
          em_descanso?: boolean
          frequencia_maxima?: Database["public"]["Enums"]["frequencia_servico"]
          id?: string
          igreja_id?: string | null
          max_escalas_mes?: number
          motivo_descanso?: string | null
          nivel_sobrecarga?: number
          pessoa_id: string
          restricoes?: string | null
          score_engajamento?: number | null
          turnos_disponiveis?: Database["public"]["Enums"]["turno_disponibilidade"][]
          updated_at?: string
        }
        Update: {
          areas_evitar?: string[] | null
          areas_preferidas?: string[] | null
          ativo?: boolean
          carga_atual_mes?: number
          created_at?: string
          descanso_ate?: string | null
          dias_disponiveis?: Database["public"]["Enums"]["dia_semana"][]
          em_descanso?: boolean
          frequencia_maxima?: Database["public"]["Enums"]["frequencia_servico"]
          id?: string
          igreja_id?: string | null
          max_escalas_mes?: number
          motivo_descanso?: string | null
          nivel_sobrecarga?: number
          pessoa_id?: string
          restricoes?: string | null
          score_engajamento?: number | null
          turnos_disponiveis?: Database["public"]["Enums"]["turno_disponibilidade"][]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "perfil_servico_igreja_id_fkey"
            columns: ["igreja_id"]
            isOneToOne: false
            referencedRelation: "igrejas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfil_servico_igreja_id_fkey"
            columns: ["igreja_id"]
            isOneToOne: false
            referencedRelation: "v_igrejas_ativas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfil_servico_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: true
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfil_servico_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: true
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfil_servico_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: true
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfil_servico_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: true
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfil_servico_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: true
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
        ]
      }
      permissoes: {
        Row: {
          codigo: string
          created_at: string
          descricao: string
          modulo: string
        }
        Insert: {
          codigo: string
          created_at?: string
          descricao: string
          modulo: string
        }
        Update: {
          codigo?: string
          created_at?: string
          descricao?: string
          modulo?: string
        }
        Relationships: []
      }
      pessoa_cargo_estatutario: {
        Row: {
          ativo: boolean | null
          cargo_id: string
          created_at: string | null
          data_fim: string | null
          data_inicio: string
          id: string
          mandato: string | null
          pessoa_id: string
        }
        Insert: {
          ativo?: boolean | null
          cargo_id: string
          created_at?: string | null
          data_fim?: string | null
          data_inicio?: string
          id?: string
          mandato?: string | null
          pessoa_id: string
        }
        Update: {
          ativo?: boolean | null
          cargo_id?: string
          created_at?: string | null
          data_fim?: string | null
          data_inicio?: string
          id?: string
          mandato?: string | null
          pessoa_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pessoa_cargo_estatutario_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "cargos_estatutarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pessoa_cargo_estatutario_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pessoa_cargo_estatutario_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pessoa_cargo_estatutario_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pessoa_cargo_estatutario_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pessoa_cargo_estatutario_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
        ]
      }
      pessoa_participacao: {
        Row: {
          area_id: string | null
          ativo: boolean | null
          created_at: string | null
          data_fim: string | null
          data_inicio: string
          funcao: string
          id: string
          ministerio_id: string | null
          observacao: string | null
          pessoa_id: string
          setor_id: string | null
        }
        Insert: {
          area_id?: string | null
          ativo?: boolean | null
          created_at?: string | null
          data_fim?: string | null
          data_inicio?: string
          funcao?: string
          id?: string
          ministerio_id?: string | null
          observacao?: string | null
          pessoa_id: string
          setor_id?: string | null
        }
        Update: {
          area_id?: string | null
          ativo?: boolean | null
          created_at?: string | null
          data_fim?: string | null
          data_inicio?: string
          funcao?: string
          id?: string
          ministerio_id?: string | null
          observacao?: string | null
          pessoa_id?: string
          setor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pessoa_participacao_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pessoa_participacao_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "v_voluntarios_completo"
            referencedColumns: ["area_id"]
          },
          {
            foreignKeyName: "pessoa_participacao_ministerio_id_fkey"
            columns: ["ministerio_id"]
            isOneToOne: false
            referencedRelation: "ministerios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pessoa_participacao_ministerio_id_fkey"
            columns: ["ministerio_id"]
            isOneToOne: false
            referencedRelation: "v_voluntarios_completo"
            referencedColumns: ["ministerio_id"]
          },
          {
            foreignKeyName: "pessoa_participacao_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pessoa_participacao_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pessoa_participacao_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pessoa_participacao_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pessoa_participacao_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pessoa_participacao_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      pessoas: {
        Row: {
          cidade: string | null
          created_at: string
          data_nascimento: string | null
          email: string | null
          endereco: string | null
          estado: string | null
          foto_url: string | null
          funcao_ministerial: Database["public"]["Enums"]["funcao_ministerial"]
          genero: string | null
          id: string
          membro_id: string | null
          nome_completo: string
          telefone: string | null
          tipo: Database["public"]["Enums"]["tipo_pessoa"]
          updated_at: string
        }
        Insert: {
          cidade?: string | null
          created_at?: string
          data_nascimento?: string | null
          email?: string | null
          endereco?: string | null
          estado?: string | null
          foto_url?: string | null
          funcao_ministerial?: Database["public"]["Enums"]["funcao_ministerial"]
          genero?: string | null
          id?: string
          membro_id?: string | null
          nome_completo: string
          telefone?: string | null
          tipo?: Database["public"]["Enums"]["tipo_pessoa"]
          updated_at?: string
        }
        Update: {
          cidade?: string | null
          created_at?: string
          data_nascimento?: string | null
          email?: string | null
          endereco?: string | null
          estado?: string | null
          foto_url?: string | null
          funcao_ministerial?: Database["public"]["Enums"]["funcao_ministerial"]
          genero?: string | null
          id?: string
          membro_id?: string | null
          nome_completo?: string
          telefone?: string | null
          tipo?: Database["public"]["Enums"]["tipo_pessoa"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pessoas_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pessoas_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pessoas_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pessoas_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pessoas_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
        ]
      }
      pessoas_cargos: {
        Row: {
          ativo: boolean
          cargo_id: string
          created_at: string
          fim_mandato: string | null
          id: string
          inicio_mandato: string
          membro_id: string
          observacao: string | null
        }
        Insert: {
          ativo?: boolean
          cargo_id: string
          created_at?: string
          fim_mandato?: string | null
          id?: string
          inicio_mandato: string
          membro_id: string
          observacao?: string | null
        }
        Update: {
          ativo?: boolean
          cargo_id?: string
          created_at?: string
          fim_mandato?: string | null
          id?: string
          inicio_mandato?: string
          membro_id?: string
          observacao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pessoas_cargos_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "cargos_institucionais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pessoas_cargos_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pessoas_cargos_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pessoas_cargos_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pessoas_cargos_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pessoas_cargos_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
        ]
      }
      pgm_grupos: {
        Row: {
          anfitriao_id: string | null
          ativo: boolean
          bairro: string | null
          cep: string | null
          cidade: string | null
          co_lider_id: string | null
          complemento: string | null
          created_at: string
          data_inicio: string | null
          descricao: string | null
          dia_semana: number | null
          endereco: string | null
          grupo_pai_id: string | null
          horario: string | null
          id: string
          igreja_id: string | null
          lider_id: string | null
          multiplicado_em: string | null
          nome: string
          numero: string | null
          uf: string | null
          updated_at: string
          whatsapp_link: string | null
        }
        Insert: {
          anfitriao_id?: string | null
          ativo?: boolean
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          co_lider_id?: string | null
          complemento?: string | null
          created_at?: string
          data_inicio?: string | null
          descricao?: string | null
          dia_semana?: number | null
          endereco?: string | null
          grupo_pai_id?: string | null
          horario?: string | null
          id?: string
          igreja_id?: string | null
          lider_id?: string | null
          multiplicado_em?: string | null
          nome: string
          numero?: string | null
          uf?: string | null
          updated_at?: string
          whatsapp_link?: string | null
        }
        Update: {
          anfitriao_id?: string | null
          ativo?: boolean
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          co_lider_id?: string | null
          complemento?: string | null
          created_at?: string
          data_inicio?: string | null
          descricao?: string | null
          dia_semana?: number | null
          endereco?: string | null
          grupo_pai_id?: string | null
          horario?: string | null
          id?: string
          igreja_id?: string | null
          lider_id?: string | null
          multiplicado_em?: string | null
          nome?: string
          numero?: string | null
          uf?: string | null
          updated_at?: string
          whatsapp_link?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pgm_grupos_anfitriao_id_fkey"
            columns: ["anfitriao_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_grupos_anfitriao_id_fkey"
            columns: ["anfitriao_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_grupos_anfitriao_id_fkey"
            columns: ["anfitriao_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_grupos_anfitriao_id_fkey"
            columns: ["anfitriao_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_grupos_anfitriao_id_fkey"
            columns: ["anfitriao_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_grupos_co_lider_id_fkey"
            columns: ["co_lider_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_grupos_co_lider_id_fkey"
            columns: ["co_lider_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_grupos_co_lider_id_fkey"
            columns: ["co_lider_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_grupos_co_lider_id_fkey"
            columns: ["co_lider_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_grupos_co_lider_id_fkey"
            columns: ["co_lider_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_grupos_grupo_pai_id_fkey"
            columns: ["grupo_pai_id"]
            isOneToOne: false
            referencedRelation: "pgm_grupos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_grupos_grupo_pai_id_fkey"
            columns: ["grupo_pai_id"]
            isOneToOne: false
            referencedRelation: "vw_pgm_grupos_resumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_grupos_grupo_pai_id_fkey"
            columns: ["grupo_pai_id"]
            isOneToOne: false
            referencedRelation: "vw_pgm_proxima_reuniao"
            referencedColumns: ["grupo_id"]
          },
          {
            foreignKeyName: "pgm_grupos_lider_id_fkey"
            columns: ["lider_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_grupos_lider_id_fkey"
            columns: ["lider_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_grupos_lider_id_fkey"
            columns: ["lider_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_grupos_lider_id_fkey"
            columns: ["lider_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_grupos_lider_id_fkey"
            columns: ["lider_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
        ]
      }
      pgm_marcos_discipulado: {
        Row: {
          batizado: boolean
          classe_descobrindo: boolean
          classe_novos_crentes: boolean
          data_batismo: string | null
          mentor_id: string | null
          observacao: string | null
          pessoa_id: string
          tem_mentor: boolean
          updated_at: string
        }
        Insert: {
          batizado?: boolean
          classe_descobrindo?: boolean
          classe_novos_crentes?: boolean
          data_batismo?: string | null
          mentor_id?: string | null
          observacao?: string | null
          pessoa_id: string
          tem_mentor?: boolean
          updated_at?: string
        }
        Update: {
          batizado?: boolean
          classe_descobrindo?: boolean
          classe_novos_crentes?: boolean
          data_batismo?: string | null
          mentor_id?: string | null
          observacao?: string | null
          pessoa_id?: string
          tem_mentor?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pgm_marcos_discipulado_mentor_id_fkey"
            columns: ["mentor_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_marcos_discipulado_mentor_id_fkey"
            columns: ["mentor_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_marcos_discipulado_mentor_id_fkey"
            columns: ["mentor_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_marcos_discipulado_mentor_id_fkey"
            columns: ["mentor_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_marcos_discipulado_mentor_id_fkey"
            columns: ["mentor_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_marcos_discipulado_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: true
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_marcos_discipulado_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: true
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_marcos_discipulado_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: true
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_marcos_discipulado_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: true
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_marcos_discipulado_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: true
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
        ]
      }
      pgm_membros: {
        Row: {
          ativo: boolean
          created_at: string
          data_entrada: string
          data_saida: string | null
          grupo_id: string
          id: string
          observacao: string | null
          papel: Database["public"]["Enums"]["pgm_papel"]
          pessoa_id: string
          principal: boolean
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          data_entrada?: string
          data_saida?: string | null
          grupo_id: string
          id?: string
          observacao?: string | null
          papel?: Database["public"]["Enums"]["pgm_papel"]
          pessoa_id: string
          principal?: boolean
        }
        Update: {
          ativo?: boolean
          created_at?: string
          data_entrada?: string
          data_saida?: string | null
          grupo_id?: string
          id?: string
          observacao?: string | null
          papel?: Database["public"]["Enums"]["pgm_papel"]
          pessoa_id?: string
          principal?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "pgm_membros_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "pgm_grupos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_membros_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "vw_pgm_grupos_resumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_membros_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "vw_pgm_proxima_reuniao"
            referencedColumns: ["grupo_id"]
          },
          {
            foreignKeyName: "pgm_membros_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_membros_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_membros_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_membros_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_membros_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
        ]
      }
      pgm_pedidos_oracao: {
        Row: {
          created_at: string
          criado_por: string | null
          grupo_id: string
          id: string
          nome_avulso: string | null
          pessoa_id: string | null
          respondido_em: string | null
          resposta: string | null
          status: Database["public"]["Enums"]["pgm_oracao_status"]
          texto: string
          updated_at: string
          visibilidade: Database["public"]["Enums"]["pgm_oracao_visibilidade"]
        }
        Insert: {
          created_at?: string
          criado_por?: string | null
          grupo_id: string
          id?: string
          nome_avulso?: string | null
          pessoa_id?: string | null
          respondido_em?: string | null
          resposta?: string | null
          status?: Database["public"]["Enums"]["pgm_oracao_status"]
          texto: string
          updated_at?: string
          visibilidade?: Database["public"]["Enums"]["pgm_oracao_visibilidade"]
        }
        Update: {
          created_at?: string
          criado_por?: string | null
          grupo_id?: string
          id?: string
          nome_avulso?: string | null
          pessoa_id?: string | null
          respondido_em?: string | null
          resposta?: string | null
          status?: Database["public"]["Enums"]["pgm_oracao_status"]
          texto?: string
          updated_at?: string
          visibilidade?: Database["public"]["Enums"]["pgm_oracao_visibilidade"]
        }
        Relationships: [
          {
            foreignKeyName: "pgm_pedidos_oracao_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_pedidos_oracao_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "pgm_grupos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_pedidos_oracao_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "vw_pgm_grupos_resumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_pedidos_oracao_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "vw_pgm_proxima_reuniao"
            referencedColumns: ["grupo_id"]
          },
          {
            foreignKeyName: "pgm_pedidos_oracao_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_pedidos_oracao_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_pedidos_oracao_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_pedidos_oracao_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_pedidos_oracao_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
        ]
      }
      pgm_presencas: {
        Row: {
          created_at: string
          id: string
          observacao: string | null
          pessoa_id: string
          presente: boolean
          reuniao_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          observacao?: string | null
          pessoa_id: string
          presente?: boolean
          reuniao_id: string
        }
        Update: {
          created_at?: string
          id?: string
          observacao?: string | null
          pessoa_id?: string
          presente?: boolean
          reuniao_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pgm_presencas_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_presencas_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_presencas_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_presencas_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_presencas_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_presencas_reuniao_id_fkey"
            columns: ["reuniao_id"]
            isOneToOne: false
            referencedRelation: "pgm_reunioes"
            referencedColumns: ["id"]
          },
        ]
      }
      pgm_reunioes: {
        Row: {
          created_at: string
          data: string
          fechada: boolean
          foto_url: string | null
          grupo_id: string
          id: string
          local_alterado: string | null
          observacoes: string | null
          registrada_por: string | null
          tema: string | null
          texto_base: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          data: string
          fechada?: boolean
          foto_url?: string | null
          grupo_id: string
          id?: string
          local_alterado?: string | null
          observacoes?: string | null
          registrada_por?: string | null
          tema?: string | null
          texto_base?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: string
          fechada?: boolean
          foto_url?: string | null
          grupo_id?: string
          id?: string
          local_alterado?: string | null
          observacoes?: string | null
          registrada_por?: string | null
          tema?: string | null
          texto_base?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pgm_reunioes_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "pgm_grupos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_reunioes_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "vw_pgm_grupos_resumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_reunioes_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "vw_pgm_proxima_reuniao"
            referencedColumns: ["grupo_id"]
          },
          {
            foreignKeyName: "pgm_reunioes_registrada_por_fkey"
            columns: ["registrada_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pgm_visitas: {
        Row: {
          bairro: string | null
          convidado_por: string | null
          created_at: string
          id: string
          nome: string
          observacao: string | null
          reuniao_id: string
          telefone: string | null
          virou_pessoa_id: string | null
        }
        Insert: {
          bairro?: string | null
          convidado_por?: string | null
          created_at?: string
          id?: string
          nome: string
          observacao?: string | null
          reuniao_id: string
          telefone?: string | null
          virou_pessoa_id?: string | null
        }
        Update: {
          bairro?: string | null
          convidado_por?: string | null
          created_at?: string
          id?: string
          nome?: string
          observacao?: string | null
          reuniao_id?: string
          telefone?: string | null
          virou_pessoa_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pgm_visitas_convidado_por_fkey"
            columns: ["convidado_por"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_visitas_convidado_por_fkey"
            columns: ["convidado_por"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_visitas_convidado_por_fkey"
            columns: ["convidado_por"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_visitas_convidado_por_fkey"
            columns: ["convidado_por"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_visitas_convidado_por_fkey"
            columns: ["convidado_por"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_visitas_reuniao_id_fkey"
            columns: ["reuniao_id"]
            isOneToOne: false
            referencedRelation: "pgm_reunioes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_visitas_virou_pessoa_id_fkey"
            columns: ["virou_pessoa_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_visitas_virou_pessoa_id_fkey"
            columns: ["virou_pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_visitas_virou_pessoa_id_fkey"
            columns: ["virou_pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_visitas_virou_pessoa_id_fkey"
            columns: ["virou_pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_visitas_virou_pessoa_id_fkey"
            columns: ["virou_pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
        ]
      }
      politica_privacidade: {
        Row: {
          conteudo: string
          publicado_em: string
          titulo: string
          versao: string
          vigente: boolean
        }
        Insert: {
          conteudo: string
          publicado_em?: string
          titulo: string
          versao: string
          vigente?: boolean
        }
        Update: {
          conteudo?: string
          publicado_em?: string
          titulo?: string
          versao?: string
          vigente?: boolean
        }
        Relationships: []
      }
      pre_cadastros: {
        Row: {
          ativado: boolean
          criado_em: string
          id: string
          nome: string
          role: Database["public"]["Enums"]["app_role"]
          telefone: string
        }
        Insert: {
          ativado?: boolean
          criado_em?: string
          id?: string
          nome: string
          role: Database["public"]["Enums"]["app_role"]
          telefone: string
        }
        Update: {
          ativado?: boolean
          criado_em?: string
          id?: string
          nome?: string
          role?: Database["public"]["Enums"]["app_role"]
          telefone?: string
        }
        Relationships: []
      }
      predios: {
        Row: {
          ativo: boolean
          bairro: string | null
          cep: string | null
          cidade: string | null
          complemento: string | null
          created_at: string
          descricao: string | null
          estado: string | null
          id: string
          logradouro: string | null
          nome: string
          numero: string | null
          referencia: string | null
          sigla: string | null
          tipo: Database["public"]["Enums"]["predio_tipo"]
          unidade_id: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          created_at?: string
          descricao?: string | null
          estado?: string | null
          id?: string
          logradouro?: string | null
          nome: string
          numero?: string | null
          referencia?: string | null
          sigla?: string | null
          tipo?: Database["public"]["Enums"]["predio_tipo"]
          unidade_id: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          created_at?: string
          descricao?: string | null
          estado?: string | null
          id?: string
          logradouro?: string | null
          nome?: string
          numero?: string | null
          referencia?: string | null
          sigla?: string | null
          tipo?: Database["public"]["Enums"]["predio_tipo"]
          unidade_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "predios_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "predios_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "v_estrutura_fisica"
            referencedColumns: ["unidade_id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          lgpd_aceito: boolean
          lgpd_data: string | null
          nome: string
          pessoa_id: string | null
          primeiro_acesso: boolean
          role: Database["public"]["Enums"]["app_role"] | null
          telefone: string | null
          telefone_e164: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          lgpd_aceito?: boolean
          lgpd_data?: string | null
          nome: string
          pessoa_id?: string | null
          primeiro_acesso?: boolean
          role?: Database["public"]["Enums"]["app_role"] | null
          telefone?: string | null
          telefone_e164?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          lgpd_aceito?: boolean
          lgpd_data?: string | null
          nome?: string
          pessoa_id?: string | null
          primeiro_acesso?: boolean
          role?: Database["public"]["Enums"]["app_role"] | null
          telefone?: string | null
          telefone_e164?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
        ]
      }
      recuperacao_senha: {
        Row: {
          email: string
          id: string
          nome: string | null
          observacao: string | null
          origem: string | null
          pessoa_id: string | null
          resolvido_em: string | null
          resolvido_por: string | null
          solicitado_em: string
          status: string
        }
        Insert: {
          email: string
          id?: string
          nome?: string | null
          observacao?: string | null
          origem?: string | null
          pessoa_id?: string | null
          resolvido_em?: string | null
          resolvido_por?: string | null
          solicitado_em?: string
          status?: string
        }
        Update: {
          email?: string
          id?: string
          nome?: string | null
          observacao?: string | null
          origem?: string | null
          pessoa_id?: string | null
          resolvido_em?: string | null
          resolvido_por?: string | null
          solicitado_em?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "recuperacao_senha_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recuperacao_senha_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recuperacao_senha_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recuperacao_senha_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recuperacao_senha_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
        ]
      }
      reuniao_assuntos: {
        Row: {
          assunto_id: string
          created_at: string
          decisao_reuniao: string | null
          id: string
          observacao_reuniao: string | null
          ordem: number | null
          reuniao_id: string
        }
        Insert: {
          assunto_id: string
          created_at?: string
          decisao_reuniao?: string | null
          id?: string
          observacao_reuniao?: string | null
          ordem?: number | null
          reuniao_id: string
        }
        Update: {
          assunto_id?: string
          created_at?: string
          decisao_reuniao?: string | null
          id?: string
          observacao_reuniao?: string | null
          ordem?: number | null
          reuniao_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reuniao_assuntos_assunto_id_fkey"
            columns: ["assunto_id"]
            isOneToOne: false
            referencedRelation: "assuntos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reuniao_assuntos_assunto_id_fkey"
            columns: ["assunto_id"]
            isOneToOne: false
            referencedRelation: "vw_assuntos_dashboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reuniao_assuntos_reuniao_id_fkey"
            columns: ["reuniao_id"]
            isOneToOne: false
            referencedRelation: "gov_reunioes"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissoes: {
        Row: {
          created_at: string
          permissao_codigo: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          created_at?: string
          permissao_codigo: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          created_at?: string
          permissao_codigo?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "role_permissoes_permissao_codigo_fkey"
            columns: ["permissao_codigo"]
            isOneToOne: false
            referencedRelation: "permissoes"
            referencedColumns: ["codigo"]
          },
        ]
      }
      secoes_documento: {
        Row: {
          conteudo: string
          created_at: string
          documento_id: string
          id: string
          ministerio_ref: string | null
          nivel_hierarquico: number | null
          ordem: number
          palavras_chave: string[] | null
          tags_conceituais: string[]
          tipo_secao: string | null
          titulo: string
        }
        Insert: {
          conteudo: string
          created_at?: string
          documento_id: string
          id?: string
          ministerio_ref?: string | null
          nivel_hierarquico?: number | null
          ordem?: number
          palavras_chave?: string[] | null
          tags_conceituais?: string[]
          tipo_secao?: string | null
          titulo: string
        }
        Update: {
          conteudo?: string
          created_at?: string
          documento_id?: string
          id?: string
          ministerio_ref?: string | null
          nivel_hierarquico?: number | null
          ordem?: number
          palavras_chave?: string[] | null
          tags_conceituais?: string[]
          tipo_secao?: string | null
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "secoes_documento_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos"
            referencedColumns: ["id"]
          },
        ]
      }
      setores: {
        Row: {
          area_id: string
          ativo: boolean | null
          created_at: string | null
          descricao: string | null
          id: string
          lider_id: string | null
          nome: string
        }
        Insert: {
          area_id: string
          ativo?: boolean | null
          created_at?: string | null
          descricao?: string | null
          id?: string
          lider_id?: string | null
          nome: string
        }
        Update: {
          area_id?: string
          ativo?: boolean | null
          created_at?: string | null
          descricao?: string | null
          id?: string
          lider_id?: string | null
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "setores_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "setores_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "v_voluntarios_completo"
            referencedColumns: ["area_id"]
          },
          {
            foreignKeyName: "setores_lider_id_fkey"
            columns: ["lider_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "setores_lider_id_fkey"
            columns: ["lider_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "setores_lider_id_fkey"
            columns: ["lider_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "setores_lider_id_fkey"
            columns: ["lider_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "setores_lider_id_fkey"
            columns: ["lider_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitacoes_documentos: {
        Row: {
          arquivo_nome: string | null
          arquivo_url: string
          created_at: string
          enviado_por: string | null
          id: string
          mime: string | null
          observacao: string | null
          solicitacao_id: string
          tipo: string
          versao: number
        }
        Insert: {
          arquivo_nome?: string | null
          arquivo_url: string
          created_at?: string
          enviado_por?: string | null
          id?: string
          mime?: string | null
          observacao?: string | null
          solicitacao_id: string
          tipo: string
          versao?: number
        }
        Update: {
          arquivo_nome?: string | null
          arquivo_url?: string
          created_at?: string
          enviado_por?: string | null
          id?: string
          mime?: string | null
          observacao?: string | null
          solicitacao_id?: string
          tipo?: string
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "solicitacoes_documentos_enviado_por_fkey"
            columns: ["enviado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_documentos_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "solicitacoes_membresia"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitacoes_historico: {
        Row: {
          acao: string
          created_at: string
          descricao: string | null
          id: string
          metadata: Json | null
          solicitacao_id: string
          user_id: string | null
          user_nome: string | null
        }
        Insert: {
          acao: string
          created_at?: string
          descricao?: string | null
          id?: string
          metadata?: Json | null
          solicitacao_id: string
          user_id?: string | null
          user_nome?: string | null
        }
        Update: {
          acao?: string
          created_at?: string
          descricao?: string | null
          id?: string
          metadata?: Json | null
          solicitacao_id?: string
          user_id?: string | null
          user_nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "solicitacoes_historico_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "solicitacoes_membresia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_historico_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitacoes_lgpd: {
        Row: {
          atendido_por: string | null
          concluido_em: string | null
          descricao: string | null
          email_solicitante: string
          id: string
          pessoa_id: string | null
          resposta: string | null
          solicitado_em: string
          status: string
          tipo: string
        }
        Insert: {
          atendido_por?: string | null
          concluido_em?: string | null
          descricao?: string | null
          email_solicitante: string
          id?: string
          pessoa_id?: string | null
          resposta?: string | null
          solicitado_em?: string
          status?: string
          tipo: string
        }
        Update: {
          atendido_por?: string | null
          concluido_em?: string | null
          descricao?: string | null
          email_solicitante?: string
          id?: string
          pessoa_id?: string | null
          resposta?: string | null
          solicitado_em?: string
          status?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "solicitacoes_lgpd_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitacoes_membresia: {
        Row: {
          aprovado_por: string | null
          carta_url: string | null
          carta_versao_atual: number | null
          created_at: string
          data_aprovacao: string | null
          data_assembleia: string | null
          data_conclusao: string | null
          data_solicitacao: string
          id: string
          igreja_destino: string | null
          igreja_origem: string | null
          motivo: string | null
          observacao_aprovacao: string | null
          observacao_rejeicao: string | null
          observacoes: string | null
          pastor_assinante_id: string | null
          pastor_assinante_nome: string | null
          pessoa_id: string | null
          pessoa_nome: string
          secretaria_assinante_id: string | null
          secretaria_assinante_nome: string | null
          solicitado_por: string | null
          status: Database["public"]["Enums"]["status_solicitacao_membresia"]
          tipo: Database["public"]["Enums"]["tipo_solicitacao_membresia"]
          updated_at: string
        }
        Insert: {
          aprovado_por?: string | null
          carta_url?: string | null
          carta_versao_atual?: number | null
          created_at?: string
          data_aprovacao?: string | null
          data_assembleia?: string | null
          data_conclusao?: string | null
          data_solicitacao?: string
          id?: string
          igreja_destino?: string | null
          igreja_origem?: string | null
          motivo?: string | null
          observacao_aprovacao?: string | null
          observacao_rejeicao?: string | null
          observacoes?: string | null
          pastor_assinante_id?: string | null
          pastor_assinante_nome?: string | null
          pessoa_id?: string | null
          pessoa_nome: string
          secretaria_assinante_id?: string | null
          secretaria_assinante_nome?: string | null
          solicitado_por?: string | null
          status?: Database["public"]["Enums"]["status_solicitacao_membresia"]
          tipo: Database["public"]["Enums"]["tipo_solicitacao_membresia"]
          updated_at?: string
        }
        Update: {
          aprovado_por?: string | null
          carta_url?: string | null
          carta_versao_atual?: number | null
          created_at?: string
          data_aprovacao?: string | null
          data_assembleia?: string | null
          data_conclusao?: string | null
          data_solicitacao?: string
          id?: string
          igreja_destino?: string | null
          igreja_origem?: string | null
          motivo?: string | null
          observacao_aprovacao?: string | null
          observacao_rejeicao?: string | null
          observacoes?: string | null
          pastor_assinante_id?: string | null
          pastor_assinante_nome?: string | null
          pessoa_id?: string | null
          pessoa_nome?: string
          secretaria_assinante_id?: string | null
          secretaria_assinante_nome?: string | null
          solicitado_por?: string | null
          status?: Database["public"]["Enums"]["status_solicitacao_membresia"]
          tipo?: Database["public"]["Enums"]["tipo_solicitacao_membresia"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "solicitacoes_membresia_aprovado_por_fkey"
            columns: ["aprovado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_membresia_pastor_assinante_id_fkey"
            columns: ["pastor_assinante_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_membresia_pastor_assinante_id_fkey"
            columns: ["pastor_assinante_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_membresia_pastor_assinante_id_fkey"
            columns: ["pastor_assinante_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_membresia_pastor_assinante_id_fkey"
            columns: ["pastor_assinante_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_membresia_pastor_assinante_id_fkey"
            columns: ["pastor_assinante_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_membresia_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_membresia_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_membresia_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_membresia_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_membresia_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_membresia_secretaria_assinante_id_fkey"
            columns: ["secretaria_assinante_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_membresia_secretaria_assinante_id_fkey"
            columns: ["secretaria_assinante_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_membresia_secretaria_assinante_id_fkey"
            columns: ["secretaria_assinante_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_membresia_secretaria_assinante_id_fkey"
            columns: ["secretaria_assinante_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_membresia_secretaria_assinante_id_fkey"
            columns: ["secretaria_assinante_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_membresia_solicitado_por_fkey"
            columns: ["solicitado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      unidades: {
        Row: {
          ativa: boolean
          congregacao_id: string | null
          created_at: string
          descricao: string | null
          id: string
          nome: string
          responsavel_id: string | null
          tipo: Database["public"]["Enums"]["unidade_tipo"]
          updated_at: string
        }
        Insert: {
          ativa?: boolean
          congregacao_id?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          responsavel_id?: string | null
          tipo?: Database["public"]["Enums"]["unidade_tipo"]
          updated_at?: string
        }
        Update: {
          ativa?: boolean
          congregacao_id?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          responsavel_id?: string | null
          tipo?: Database["public"]["Enums"]["unidade_tipo"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "unidades_congregacao_id_fkey"
            columns: ["congregacao_id"]
            isOneToOne: false
            referencedRelation: "congregacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unidades_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unidades_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unidades_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unidades_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unidades_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      valores_igreja: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string | null
          icone: string | null
          id: string
          ordem: number
          valor: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          icone?: string | null
          id?: string
          ordem?: number
          valor: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          icone?: string | null
          id?: string
          ordem?: number
          valor?: string
        }
        Relationships: []
      }
      vinculos_familiares: {
        Row: {
          created_at: string
          familia_id: string
          id: string
          membro_id: string
          parentesco: Database["public"]["Enums"]["parentesco_tipo"]
          responsavel_familia: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          familia_id: string
          id?: string
          membro_id: string
          parentesco: Database["public"]["Enums"]["parentesco_tipo"]
          responsavel_familia?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          familia_id?: string
          id?: string
          membro_id?: string
          parentesco?: Database["public"]["Enums"]["parentesco_tipo"]
          responsavel_familia?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vinculos_familiares_familia_id_fkey"
            columns: ["familia_id"]
            isOneToOne: false
            referencedRelation: "familias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vinculos_familiares_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vinculos_familiares_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vinculos_familiares_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vinculos_familiares_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vinculos_familiares_membro_id_fkey"
            columns: ["membro_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
        ]
      }
      visita_historico: {
        Row: {
          created_at: string
          id: string
          observacao: string | null
          registrado_por: string | null
          registrado_por_funcao: string | null
          registrado_por_nome: string | null
          tipo: string
          visitante_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          observacao?: string | null
          registrado_por?: string | null
          registrado_por_funcao?: string | null
          registrado_por_nome?: string | null
          tipo: string
          visitante_id: string
        }
        Update: {
          created_at?: string
          id?: string
          observacao?: string | null
          registrado_por?: string | null
          registrado_por_funcao?: string | null
          registrado_por_nome?: string | null
          tipo?: string
          visitante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visita_historico_visitante_id_fkey"
            columns: ["visitante_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visita_historico_visitante_id_fkey"
            columns: ["visitante_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visita_historico_visitante_id_fkey"
            columns: ["visitante_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visita_historico_visitante_id_fkey"
            columns: ["visitante_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visita_historico_visitante_id_fkey"
            columns: ["visitante_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
        ]
      }
      visitas: {
        Row: {
          acompanhado_por: string | null
          created_at: string
          data: string
          id: string
          igreja_id: string
          membro_id: string
          observacoes: string | null
          origem: string | null
          registrado_por: string | null
        }
        Insert: {
          acompanhado_por?: string | null
          created_at?: string
          data?: string
          id?: string
          igreja_id?: string
          membro_id: string
          observacoes?: string | null
          origem?: string | null
          registrado_por?: string | null
        }
        Update: {
          acompanhado_por?: string | null
          created_at?: string
          data?: string
          id?: string
          igreja_id?: string
          membro_id?: string
          observacoes?: string | null
          origem?: string | null
          registrado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visitas_igreja_id_fkey"
            columns: ["igreja_id"]
            isOneToOne: false
            referencedRelation: "igrejas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visitas_igreja_id_fkey"
            columns: ["igreja_id"]
            isOneToOne: false
            referencedRelation: "v_igrejas_ativas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      arr_caixa_resumo: {
        Row: {
          caixa_id: string | null
          estado: Database["public"]["Enums"]["arr_caixa_estado"] | null
          qtd_vendas: number | null
          reserva_id: string | null
          saldo_virtual: number | null
          taxa_credito_calc: number | null
          taxa_debito_calc: number | null
          taxa_pix_calc: number | null
          total_abate_cnpj: number | null
          total_ajustes: number | null
          total_bruto: number | null
          total_credito: number | null
          total_custos: number | null
          total_debito: number | null
          total_dinheiro: number | null
          total_outros: number | null
          total_pix: number | null
          total_reemb_pessoa: number | null
          total_revertido: number | null
        }
        Relationships: [
          {
            foreignKeyName: "arr_caixas_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: true
            referencedRelation: "arr_reservas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "arr_caixas_reserva_id_fkey"
            columns: ["reserva_id"]
            isOneToOne: true
            referencedRelation: "vw_arr_reservas_publica"
            referencedColumns: ["id"]
          },
        ]
      }
      v_conselho_da_igreja: {
        Row: {
          cargo: string | null
          contexto: string | null
          foto_url: string | null
          nivel_cargo: number | null
          nome_completo: string | null
          pessoa_id: string | null
          tipo_participacao: string | null
        }
        Relationships: []
      }
      v_dashboard_visitantes: {
        Row: {
          atrasados_7d: number | null
          origem_amigo: number | null
          origem_evento: number | null
          origem_membro: number | null
          origem_outros: number | null
          origem_projeto: number | null
          origem_redes: number | null
          retornaram: number | null
          sem_contato: number | null
          total_visitantes: number | null
          visitantes_semana: number | null
        }
        Relationships: []
      }
      v_diretoria_atual: {
        Row: {
          cargo: string | null
          email: string | null
          fim_mandato: string | null
          id: string | null
          inicio_mandato: string | null
          nivel_id: number | null
          nivel_nome: string | null
          nome_completo: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cargos_institucionais_nivel_id_fkey"
            columns: ["nivel_id"]
            isOneToOne: false
            referencedRelation: "niveis_organizacionais"
            referencedColumns: ["id"]
          },
        ]
      }
      v_estrutura_fisica: {
        Row: {
          bairro: string | null
          capacidade: number | null
          cidade: string | null
          local_id: string | null
          local_nome: string | null
          logradouro: string | null
          numero: string | null
          permite_agendamento: boolean | null
          predio_id: string | null
          predio_nome: string | null
          predio_tipo: Database["public"]["Enums"]["predio_tipo"] | null
          proxima_manutencao: string | null
          status_operacional:
            | Database["public"]["Enums"]["local_status_op"]
            | null
          unidade_id: string | null
          unidade_nome: string | null
          unidade_tipo: Database["public"]["Enums"]["unidade_tipo"] | null
        }
        Relationships: []
      }
      v_igrejas_ativas: {
        Row: {
          cidade: string | null
          estado: string | null
          id: string | null
          nome: string | null
        }
        Insert: {
          cidade?: string | null
          estado?: string | null
          id?: string | null
          nome?: string | null
        }
        Update: {
          cidade?: string | null
          estado?: string | null
          id?: string | null
          nome?: string | null
        }
        Relationships: []
      }
      v_importacoes_resumo: {
        Row: {
          concluido_em: string | null
          created_at: string | null
          duplicados: number | null
          enviado_por_email: string | null
          erros: number | null
          id: string | null
          ignorados: number | null
          importados: number | null
          nome_arquivo: string | null
          status: string | null
          total_linhas: number | null
        }
        Relationships: []
      }
      v_membros_mapa: {
        Row: {
          bairro: string | null
          cep: string | null
          cidade: string | null
          endereco_completo: string | null
          estado: string | null
          geo_fonte: string | null
          id: string | null
          latitude: number | null
          longitude: number | null
          nome_exibicao: string | null
          status: Database["public"]["Enums"]["membro_status"] | null
          telefone_celular: string | null
          tipo_pessoa: Database["public"]["Enums"]["tipo_pessoa"] | null
        }
        Insert: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          endereco_completo?: string | null
          estado?: string | null
          geo_fonte?: string | null
          id?: string | null
          latitude?: number | null
          longitude?: number | null
          nome_exibicao?: never
          status?: Database["public"]["Enums"]["membro_status"] | null
          telefone_celular?: string | null
          tipo_pessoa?: Database["public"]["Enums"]["tipo_pessoa"] | null
        }
        Update: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          endereco_completo?: string | null
          estado?: string | null
          geo_fonte?: string | null
          id?: string | null
          latitude?: number | null
          longitude?: number | null
          nome_exibicao?: never
          status?: Database["public"]["Enums"]["membro_status"] | null
          telefone_celular?: string | null
          tipo_pessoa?: Database["public"]["Enums"]["tipo_pessoa"] | null
        }
        Relationships: []
      }
      v_membros_perfil: {
        Row: {
          created_at: string | null
          email: string | null
          foto_url: string | null
          funcao_ministerial:
            | Database["public"]["Enums"]["funcao_ministerial"]
            | null
          funcao_ministerial_label: string | null
          id: string | null
          nome_completo: string | null
          perfil_acesso_label: string | null
          perfil_acesso_legado:
            | Database["public"]["Enums"]["perfil_acesso"]
            | null
          perfil_acesso_sistema: Database["public"]["Enums"]["app_role"] | null
          status_membro: Database["public"]["Enums"]["membro_status"] | null
          telefone_celular: string | null
          tem_acesso_sistema: boolean | null
          tipo_pessoa: Database["public"]["Enums"]["tipo_pessoa"] | null
          updated_at: string | null
        }
        Relationships: []
      }
      v_meu_contexto: {
        Row: {
          email: string | null
          foto_url: string | null
          funcao_ministerial:
            | Database["public"]["Enums"]["funcao_ministerial"]
            | null
          id: string | null
          is_admin: boolean | null
          ministerio_id: string | null
          ministerio_nome: string | null
          nome_completo: string | null
          perfil_acesso: Database["public"]["Enums"]["app_role"] | null
          perfil_label: string | null
          pode_cadastrar: boolean | null
          pode_configurar: boolean | null
          pode_excluir: boolean | null
          pode_gerir_ministerio: boolean | null
          pode_ver_tudo: boolean | null
        }
        Relationships: []
      }
      v_minha_escala: {
        Row: {
          area_cor: string | null
          area_nome: string | null
          data_evento: string | null
          escala_id: string | null
          escala_vol_id: string | null
          funcao: string | null
          hora_fim: string | null
          hora_inicio: string | null
          local: string | null
          ministerio_nome: string | null
          pessoa_id: string | null
          status: Database["public"]["Enums"]["status_presenca_escala"] | null
          sugerido_automaticamente: boolean | null
          titulo: string | null
        }
        Relationships: [
          {
            foreignKeyName: "escala_voluntarios_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escala_voluntarios_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escala_voluntarios_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escala_voluntarios_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escala_voluntarios_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
        ]
      }
      v_proximas_escalas: {
        Row: {
          area_cor: string | null
          area_id: string | null
          area_nome: string | null
          confirmados: number | null
          data_evento: string | null
          hora_fim: string | null
          hora_inicio: string | null
          id: string | null
          local: string | null
          ministerio_id: string | null
          ministerio_nome: string | null
          pendentes: number | null
          recusados: number | null
          status: Database["public"]["Enums"]["status_escala"] | null
          titulo: string | null
          total_escalados: number | null
        }
        Relationships: [
          {
            foreignKeyName: "escalas_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalas_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "v_voluntarios_completo"
            referencedColumns: ["area_id"]
          },
          {
            foreignKeyName: "escalas_ministerio_id_fkey"
            columns: ["ministerio_id"]
            isOneToOne: false
            referencedRelation: "ministerios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalas_ministerio_id_fkey"
            columns: ["ministerio_id"]
            isOneToOne: false
            referencedRelation: "v_voluntarios_completo"
            referencedColumns: ["ministerio_id"]
          },
        ]
      }
      v_ranking_convidadores: {
        Row: {
          convertidos: number | null
          id: string | null
          nome_completo: string | null
          retornaram: number | null
          score_convites: number | null
          tipo_pessoa: Database["public"]["Enums"]["tipo_pessoa"] | null
          total_convidados: number | null
        }
        Relationships: []
      }
      v_solicitacoes_lgpd: {
        Row: {
          atendido_por: string | null
          concluido_em: string | null
          descricao: string | null
          email_solicitante: string | null
          id: string | null
          pessoa_id: string | null
          prazo_legal: string | null
          prazo_vencido: boolean | null
          resposta: string | null
          solicitado_em: string | null
          status: string | null
          tipo: string | null
        }
        Insert: {
          atendido_por?: string | null
          concluido_em?: string | null
          descricao?: string | null
          email_solicitante?: string | null
          id?: string | null
          pessoa_id?: string | null
          prazo_legal?: never
          prazo_vencido?: never
          resposta?: string | null
          solicitado_em?: string | null
          status?: string | null
          tipo?: string | null
        }
        Update: {
          atendido_por?: string | null
          concluido_em?: string | null
          descricao?: string | null
          email_solicitante?: string | null
          id?: string | null
          pessoa_id?: string | null
          prazo_legal?: never
          prazo_vencido?: never
          resposta?: string | null
          solicitado_em?: string | null
          status?: string | null
          tipo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "solicitacoes_lgpd_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
        ]
      }
      v_visitantes_alerta: {
        Row: {
          alerta: string | null
          como_conheceu: string | null
          data_entrada: string | null
          dias_desde_visita: number | null
          id: string | null
          nome_completo: string | null
          numero_visitas: number | null
          prioridade: string | null
          quem_convidou_id: string | null
          score_engajamento: number | null
          status_acolhimento:
            | Database["public"]["Enums"]["status_acolhimento_enum"]
            | null
          sugestao: string | null
          telefone_celular: string | null
          ultimo_contato_em: string | null
        }
        Insert: {
          alerta?: never
          como_conheceu?: string | null
          data_entrada?: string | null
          dias_desde_visita?: never
          id?: string | null
          nome_completo?: string | null
          numero_visitas?: number | null
          prioridade?: never
          quem_convidou_id?: string | null
          score_engajamento?: number | null
          status_acolhimento?:
            | Database["public"]["Enums"]["status_acolhimento_enum"]
            | null
          sugestao?: never
          telefone_celular?: string | null
          ultimo_contato_em?: string | null
        }
        Update: {
          alerta?: never
          como_conheceu?: string | null
          data_entrada?: string | null
          dias_desde_visita?: never
          id?: string | null
          nome_completo?: string | null
          numero_visitas?: number | null
          prioridade?: never
          quem_convidou_id?: string | null
          score_engajamento?: number | null
          status_acolhimento?:
            | Database["public"]["Enums"]["status_acolhimento_enum"]
            | null
          sugestao?: never
          telefone_celular?: string | null
          ultimo_contato_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "membros_quem_convidou_id_fkey"
            columns: ["quem_convidou_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membros_quem_convidou_id_fkey"
            columns: ["quem_convidou_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membros_quem_convidou_id_fkey"
            columns: ["quem_convidou_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membros_quem_convidou_id_fkey"
            columns: ["quem_convidou_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membros_quem_convidou_id_fkey"
            columns: ["quem_convidou_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
        ]
      }
      v_voluntarios_completo: {
        Row: {
          area_cor: string | null
          area_id: string | null
          area_nome: string | null
          carga_atual_mes: number | null
          data_inicio: string | null
          descanso_ate: string | null
          dias_disponiveis: Database["public"]["Enums"]["dia_semana"][] | null
          em_descanso: boolean | null
          email: string | null
          foto_url: string | null
          frequencia_maxima:
            | Database["public"]["Enums"]["frequencia_servico"]
            | null
          funcao: string | null
          max_escalas_mes: number | null
          ministerio_cor: string | null
          ministerio_id: string | null
          ministerio_nome: string | null
          nivel_sobrecarga: number | null
          nome_completo: string | null
          pessoa_id: string | null
          restricoes: string | null
          status_voluntario:
            | Database["public"]["Enums"]["atuacao_status"]
            | null
          telefone_celular: string | null
          total_escalas: number | null
          turnos_disponiveis:
            | Database["public"]["Enums"]["turno_disponibilidade"][]
            | null
          ultima_escala_em: string | null
        }
        Relationships: [
          {
            foreignKeyName: "area_voluntarios_membro_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "area_voluntarios_membro_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "area_voluntarios_membro_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "area_voluntarios_membro_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "area_voluntarios_membro_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_agenda_igreja: {
        Row: {
          espaco_codigo: string | null
          fim: string | null
          inicio: string | null
          local_ou_espaco: string | null
          ministerio_id: string | null
          origem: string | null
          ref_id: string | null
          status: string | null
          tipo: string | null
          titulo: string | null
        }
        Relationships: []
      }
      vw_agenda_pastoral: {
        Row: {
          anos_vai_completar: number | null
          data_origem: string | null
          familia_id: string | null
          pessoa_id: string | null
          proxima_data: string | null
          ref_id: string | null
          subtitulo: string | null
          telefone: string | null
          telefone_secundario: string | null
          tipo: string | null
          tipo_pessoa: Database["public"]["Enums"]["tipo_pessoa"] | null
          titulo: string | null
        }
        Relationships: []
      }
      vw_arr_reservas_publica: {
        Row: {
          espaco_codigo: string | null
          espaco_id: string | null
          espaco_nome: string | null
          finalidade: string | null
          id: string | null
          periodo: unknown
          status: Database["public"]["Enums"]["arr_reserva_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "arr_reservas_espaco_id_fkey"
            columns: ["espaco_id"]
            isOneToOne: false
            referencedRelation: "arr_espacos"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_assuntos_dashboard: {
        Row: {
          created_at: string | null
          created_by: string | null
          data_conclusao: string | null
          data_criacao: string | null
          descricao: string | null
          dias_para_prazo: number | null
          id: string | null
          observacao_conclusao: string | null
          origem: string | null
          prazo: string | null
          prioridade: Database["public"]["Enums"]["assunto_prioridade"] | null
          responsavel_id: string | null
          responsavel_nome: string | null
          reuniao_origem_id: string | null
          situacao: string | null
          status: Database["public"]["Enums"]["assunto_status"] | null
          titulo: string | null
          ultima_atualizacao_em: string | null
          updated_at: string | null
          vezes_discutido: number | null
          vinculo_descricao: string | null
          vinculo_id: string | null
          vinculo_tipo: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          data_conclusao?: string | null
          data_criacao?: string | null
          descricao?: string | null
          dias_para_prazo?: never
          id?: string | null
          observacao_conclusao?: string | null
          origem?: string | null
          prazo?: string | null
          prioridade?: Database["public"]["Enums"]["assunto_prioridade"] | null
          responsavel_id?: string | null
          responsavel_nome?: string | null
          reuniao_origem_id?: string | null
          situacao?: never
          status?: Database["public"]["Enums"]["assunto_status"] | null
          titulo?: string | null
          ultima_atualizacao_em?: string | null
          updated_at?: string | null
          vezes_discutido?: number | null
          vinculo_descricao?: string | null
          vinculo_id?: string | null
          vinculo_tipo?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          data_conclusao?: string | null
          data_criacao?: string | null
          descricao?: string | null
          dias_para_prazo?: never
          id?: string | null
          observacao_conclusao?: string | null
          origem?: string | null
          prazo?: string | null
          prioridade?: Database["public"]["Enums"]["assunto_prioridade"] | null
          responsavel_id?: string | null
          responsavel_nome?: string | null
          reuniao_origem_id?: string | null
          situacao?: never
          status?: Database["public"]["Enums"]["assunto_status"] | null
          titulo?: string | null
          ultima_atualizacao_em?: string | null
          updated_at?: string | null
          vezes_discutido?: number | null
          vinculo_descricao?: string | null
          vinculo_id?: string | null
          vinculo_tipo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assuntos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assuntos_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assuntos_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assuntos_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assuntos_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assuntos_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assuntos_reuniao_origem_id_fkey"
            columns: ["reuniao_origem_id"]
            isOneToOne: false
            referencedRelation: "gov_reunioes"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_ebd_alertas_idade: {
        Row: {
          classe_atual: string | null
          classe_atual_id: string | null
          classe_sugerida_id: string | null
          data_nascimento: string | null
          idade_atual: number | null
          idade_max: number | null
          nome_completo: string | null
          passou_da_faixa_em: string | null
          pessoa_id: string | null
          sexo: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ebd_matriculas_classe_id_fkey"
            columns: ["classe_atual_id"]
            isOneToOne: false
            referencedRelation: "ebd_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ebd_matriculas_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ebd_matriculas_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ebd_matriculas_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ebd_matriculas_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ebd_matriculas_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_fin_centros_resumo: {
        Row: {
          ativo: boolean | null
          centro_pai_id: string | null
          cor: string | null
          gasto_90d: number | null
          gasto_mes: number | null
          id: string | null
          nome: string | null
          qtd_lancamentos_90d: number | null
          recebido_90d: number | null
          ultima_movimentacao: string | null
          vinculo_id: string | null
          vinculo_nome: string | null
          vinculo_tipo: Database["public"]["Enums"]["fin_centro_vinculo"] | null
        }
        Insert: {
          ativo?: boolean | null
          centro_pai_id?: string | null
          cor?: string | null
          gasto_90d?: never
          gasto_mes?: never
          id?: string | null
          nome?: string | null
          qtd_lancamentos_90d?: never
          recebido_90d?: never
          ultima_movimentacao?: never
          vinculo_id?: string | null
          vinculo_nome?: string | null
          vinculo_tipo?:
            | Database["public"]["Enums"]["fin_centro_vinculo"]
            | null
        }
        Update: {
          ativo?: boolean | null
          centro_pai_id?: string | null
          cor?: string | null
          gasto_90d?: never
          gasto_mes?: never
          id?: string | null
          nome?: string | null
          qtd_lancamentos_90d?: never
          recebido_90d?: never
          ultima_movimentacao?: never
          vinculo_id?: string | null
          vinculo_nome?: string | null
          vinculo_tipo?:
            | Database["public"]["Enums"]["fin_centro_vinculo"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "fin_centros_custo_centro_pai_id_fkey"
            columns: ["centro_pai_id"]
            isOneToOne: false
            referencedRelation: "fin_centros_custo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_centros_custo_centro_pai_id_fkey"
            columns: ["centro_pai_id"]
            isOneToOne: false
            referencedRelation: "vw_fin_centros_resumo"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_fin_estoque_alertas: {
        Row: {
          categoria: string | null
          consumo_medio_dia: number | null
          consumo_medio_mes: number | null
          custo_medio: number | null
          dias_restantes_estimados: number | null
          estoque_atual: number | null
          estoque_minimo: number | null
          fornecedor_padrao_id: string | null
          id: string | null
          nome: string | null
          ponto_pedido: number | null
          unidade: string | null
          urgencia: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fin_estoque_itens_fornecedor_padrao_id_fkey"
            columns: ["fornecedor_padrao_id"]
            isOneToOne: false
            referencedRelation: "fin_fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_fin_orcamento_vs_real: {
        Row: {
          ano: number | null
          categoria_id: string | null
          centro_custo_id: string | null
          centro_nome: string | null
          id: string | null
          mes: number | null
          percentual_consumido: number | null
          valor_planejado: number | null
          valor_real: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fin_orcamentos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "fin_categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_orcamentos_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "fin_centros_custo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_orcamentos_centro_custo_id_fkey"
            columns: ["centro_custo_id"]
            isOneToOne: false
            referencedRelation: "vw_fin_centros_resumo"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_fin_proximos_vencimentos: {
        Row: {
          categoria_cor: string | null
          categoria_id: string | null
          categoria_nome: string | null
          conta_id: string | null
          conta_nome: string | null
          data: string | null
          descricao: string | null
          dias_para_vencer: number | null
          fornecedor_id: string | null
          fornecedor_nome: string | null
          id: string | null
          status: Database["public"]["Enums"]["fin_lancamento_status"] | null
          tipo: Database["public"]["Enums"]["fin_movimento_tipo"] | null
          urgencia: string | null
          valor: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fin_lancamentos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "fin_categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_lancamentos_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "fin_contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fin_lancamentos_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fin_fornecedores"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_fin_resumo_mes: {
        Row: {
          entradas_mes: number | null
          previstas_mes: number | null
          saidas_mes: number | null
          saldo_total: number | null
        }
        Relationships: []
      }
      vw_gov_convocacao_lista: {
        Row: {
          assembleia_id: string | null
          email: string | null
          pessoa_id: string | null
          pessoa_nome: string | null
          telefone_celular: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gov_assembleia_presentes_assembleia_id_fkey"
            columns: ["assembleia_id"]
            isOneToOne: false
            referencedRelation: "gov_assembleias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_assembleia_presentes_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_assembleia_presentes_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_assembleia_presentes_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_assembleia_presentes_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gov_assembleia_presentes_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_ocupacao_local: {
        Row: {
          local_id: string | null
          origem: string | null
          periodo: unknown
          ref_id: string | null
        }
        Relationships: []
      }
      vw_pgm_grupos_resumo: {
        Row: {
          anfitriao_id: string | null
          anfitriao_nome: string | null
          ativo: boolean | null
          bairro: string | null
          cep: string | null
          cidade: string | null
          co_lider_id: string | null
          co_lider_nome: string | null
          complemento: string | null
          created_at: string | null
          data_inicio: string | null
          descricao: string | null
          dia_semana: number | null
          endereco: string | null
          grupo_pai_id: string | null
          horario: string | null
          id: string | null
          igreja_id: string | null
          lider_id: string | null
          lider_nome: string | null
          multiplicado_em: string | null
          nome: string | null
          numero: string | null
          qtd_filhos: number | null
          qtd_membros: number | null
          uf: string | null
          updated_at: string | null
          whatsapp_link: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pgm_grupos_anfitriao_id_fkey"
            columns: ["anfitriao_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_grupos_anfitriao_id_fkey"
            columns: ["anfitriao_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_grupos_anfitriao_id_fkey"
            columns: ["anfitriao_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_grupos_anfitriao_id_fkey"
            columns: ["anfitriao_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_grupos_anfitriao_id_fkey"
            columns: ["anfitriao_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_grupos_co_lider_id_fkey"
            columns: ["co_lider_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_grupos_co_lider_id_fkey"
            columns: ["co_lider_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_grupos_co_lider_id_fkey"
            columns: ["co_lider_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_grupos_co_lider_id_fkey"
            columns: ["co_lider_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_grupos_co_lider_id_fkey"
            columns: ["co_lider_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_grupos_grupo_pai_id_fkey"
            columns: ["grupo_pai_id"]
            isOneToOne: false
            referencedRelation: "pgm_grupos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_grupos_grupo_pai_id_fkey"
            columns: ["grupo_pai_id"]
            isOneToOne: false
            referencedRelation: "vw_pgm_grupos_resumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_grupos_grupo_pai_id_fkey"
            columns: ["grupo_pai_id"]
            isOneToOne: false
            referencedRelation: "vw_pgm_proxima_reuniao"
            referencedColumns: ["grupo_id"]
          },
          {
            foreignKeyName: "pgm_grupos_lider_id_fkey"
            columns: ["lider_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_grupos_lider_id_fkey"
            columns: ["lider_id"]
            isOneToOne: false
            referencedRelation: "v_membros_mapa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_grupos_lider_id_fkey"
            columns: ["lider_id"]
            isOneToOne: false
            referencedRelation: "v_membros_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_grupos_lider_id_fkey"
            columns: ["lider_id"]
            isOneToOne: false
            referencedRelation: "v_ranking_convidadores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pgm_grupos_lider_id_fkey"
            columns: ["lider_id"]
            isOneToOne: false
            referencedRelation: "v_visitantes_alerta"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_pgm_proxima_reuniao: {
        Row: {
          bairro: string | null
          dia_semana: number | null
          grupo_id: string | null
          horario: string | null
          nome: string | null
          proxima_data: string | null
        }
        Insert: {
          bairro?: string | null
          dia_semana?: number | null
          grupo_id?: string | null
          horario?: string | null
          nome?: string | null
          proxima_data?: never
        }
        Update: {
          bairro?: string | null
          dia_semana?: number | null
          grupo_id?: string | null
          horario?: string | null
          nome?: string | null
          proxima_data?: never
        }
        Relationships: []
      }
    }
    Functions: {
      aceitar_convite: {
        Args: { p_senha: string; p_token: string }
        Returns: {
          email: string
          erro: string
          ok: boolean
        }[]
      }
      agenda_pastoral_mes: {
        Args: { p_ano?: number; p_mes?: number }
        Returns: {
          anos_vai_completar: number
          familia_id: string
          passou: boolean
          pessoa_id: string
          proxima_data: string
          ref_id: string
          subtitulo: string
          telefone: string
          telefone_secundario: string
          tipo: string
          titulo: string
        }[]
      }
      agenda_pastoral_proximos_dias: {
        Args: { p_dias?: number }
        Returns: {
          anos_completar: number
          data_evento: string
          dias_ate_evento: number
          familia_id: string
          pessoa_id: string
          ref_id: string
          subtitulo: string
          telefone: string
          telefone_secundario: string
          tipo: string
          tipo_pessoa: Database["public"]["Enums"]["tipo_pessoa"]
          titulo: string
        }[]
      }
      anonimizar_pessoa: { Args: { p_pessoa_id: string }; Returns: undefined }
      arr_aprovar_reserva: { Args: { p_reserva_id: string }; Returns: Json }
      arr_categorizar_problema: { Args: { p_texto: string }; Returns: string }
      arr_problemas_resumo: { Args: never; Returns: Json }
      arr_produtos_vendaveis: {
        Args: { p_reserva_id: string }
        Returns: {
          categoria: Database["public"]["Enums"]["arr_produto_categoria"]
          codigo: string
          espaco_id: string
          estoque_atual: number
          estoque_minimo: number
          id: string
          is_acervo: boolean
          nome: string
          observacao: string
          preco_sugerido: number
          reserva_id: string
          subcategoria: string
        }[]
      }
      assuntos_alertas: {
        Args: never
        Returns: {
          acao_sugerida: string
          descricao: string
          entidade_id: string
          link: string
          prioridade: Database["public"]["Enums"]["prioridade_alerta"]
          tipo: string
          titulo: string
        }[]
      }
      assuntos_meus_resumo: {
        Args: never
        Returns: {
          proximos: Json
          total_abertos: number
          total_atrasados: number
          total_parados: number
          total_vence_breve: number
        }[]
      }
      assuntos_para_reuniao: { Args: { p_reuniao_id: string }; Returns: number }
      assuntos_por_responsavel: {
        Args: never
        Returns: {
          atrasados: number
          proximos: number
          responsavel_id: string
          responsavel_nome: string
          total_abertos: number
        }[]
      }
      assuntos_urgentes_igreja: {
        Args: never
        Returns: {
          lista: Json
          total_atrasados: number
          total_vence_semana: number
        }[]
      }
      autocomplete_instituicoes: {
        Args: { p_busca: string }
        Returns: {
          id: string
          nome: string
          oficial: boolean
          permite_integracao: boolean
          sigla: string
          site_oficial: string
          tipo_instituicao: string
        }[]
      }
      buscar_estrutura_documento: {
        Args: { p_limit?: number; p_nome: string; p_tipo?: string }
        Returns: Json
      }
      buscar_instituicao_similar: {
        Args: { p_nome: string; p_site?: string }
        Returns: {
          id: string
          nome: string
          oficial: boolean
          permite_integracao: boolean
          sigla: string
          site_oficial: string
          tipo_instituicao: string
        }[]
      }
      buscar_modelo_ministerio: { Args: { p_nome: string }; Returns: Json }
      buscar_secoes_por_tag: {
        Args: { p_tag: string }
        Returns: {
          documento_id: string
          documento_tipo: string
          documento_titulo: string
          secao_conteudo: string
          secao_id: string
          secao_titulo: string
          tags: string[]
        }[]
      }
      calcular_score_engajamento: { Args: { p_id: string }; Returns: number }
      criar_convite_acesso: {
        Args: {
          p_pessoa_id: string
          p_role: Database["public"]["Enums"]["app_role"]
        }
        Returns: {
          expires_at: string
          token: string
        }[]
      }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      dashboard_ministerios: { Args: { p_igreja_id?: string }; Returns: Json }
      definir_perfil: {
        Args: {
          p_role: Database["public"]["Enums"]["app_role"]
          p_user_id: string
        }
        Returns: string
      }
      domingo_da_semana: { Args: { p_data: string }; Returns: string }
      ebd_chamada_view: {
        Args: { p_aula_id: string }
        Returns: {
          eh_visitante: boolean
          idade: number
          nome_completo: string
          pessoa_id: string
          presente: boolean
          tipo: string
        }[]
      }
      ebd_classes_baixa_presenca: {
        Args: never
        Returns: {
          classe_id: string
          classe_nome: string
          qtd_aulas_recentes: number
          taxa_media: number
          total_matriculados: number
        }[]
      }
      ebd_marcar_presenca: {
        Args: {
          p_aula_id: string
          p_eh_visitante?: boolean
          p_pessoa_id: string
          p_presente: boolean
        }
        Returns: string
      }
      ebd_obter_ou_criar_aula: {
        Args: { p_classe_id: string; p_data: string }
        Returns: string
      }
      ebd_painel_alunos_ausentes: {
        Args: { p_limite?: number }
        Returns: {
          ausencias: number
          classe: string
          idade: number
          nome: string
          oportunidades: number
          pessoa_id: string
          presencas: number
          sexo: string
          taxa: number
        }[]
      }
      ebd_painel_por_classe: {
        Args: never
        Returns: {
          aulas_com_chamada: number
          aulas_sem_chamada: number
          classe: string
          classe_id: string
          cor: string
          homens: number
          matriculados: number
          mulheres: number
          presencas: number
          taxa: number
          ultima_aula: string
        }[]
      }
      ebd_painel_por_faixa: {
        Args: never
        Returns: {
          ausencias: number
          faixa: string
          matriculados: number
          ordem: number
          presencas: number
          taxa: number
        }[]
      }
      ebd_painel_resumo: {
        Args: never
        Returns: {
          alunos_matriculados: number
          alunos_sem_data_nasc: number
          aulas_com_chamada: number
          aulas_sem_chamada: number
          aulas_total: number
          classes_ativas: number
          homens_matriculados: number
          homens_presentes: number
          mulheres_matriculadas: number
          mulheres_presentes: number
          presencas_registradas: number
          presentes: number
          primeira_aula: string
          taxa_presenca: number
          ultima_aula: string
          visitantes: number
        }[]
      }
      esperados_da_classe: {
        Args: { p_classe_id: string }
        Returns: {
          data_nascimento: string
          idade: number
          ja_matriculado: boolean
          matricula_id: string
          nome_completo: string
          outra_classe_id: string
          outra_classe_nome: string
          outra_classe_papel: string
          pessoa_id: string
          sexo: string
        }[]
      }
      excluir_importacao: {
        Args: { p_deletar_dados?: boolean; p_importacao_id: string }
        Returns: Json
      }
      extrair_sobrenome: { Args: { p_nome: string }; Returns: string }
      familias_sem_responsavel: {
        Args: never
        Returns: {
          familia_id: string
          nome_familia: string
          primeiro_membro_id: string
          primeiro_membro_nome: string
          qtd_membros: number
        }[]
      }
      fin_alertas_centros: {
        Args: never
        Returns: {
          centro_id: string
          centro_nome: string
          descricao: string
          severidade: string
          tipo_alerta: string
          titulo: string
        }[]
      }
      fin_alertas_financeiros: {
        Args: never
        Returns: {
          descricao: string
          link: string
          severidade: string
          tipo: string
          titulo: string
        }[]
      }
      fin_anomalias_mes: {
        Args: { p_ano?: number; p_mes?: number }
        Returns: {
          categoria_id: string
          categoria_nome: string
          media_6m: number
          severidade: string
          tipo: string
          valor_mes: number
          variacao_pct: number
        }[]
      }
      fin_calc_proxima_data: {
        Args: {
          p_dia: number
          p_freq: Database["public"]["Enums"]["fin_frequencia"]
          p_ultima: string
        }
        Returns: string
      }
      fin_comparativo_meses: {
        Args: { p_n?: number }
        Returns: {
          ano: number
          entradas: number
          mes: number
          resultado: number
          rotulo: string
          saidas: number
        }[]
      }
      fin_exec_alertas: {
        Args: never
        Returns: {
          categoria: string
          detalhe: string
          mensagem: string
          severidade: string
        }[]
      }
      fin_exec_centros_ano: {
        Args: never
        Returns: {
          centro_id: string
          nome: string
          orcado: number
          percentual: number
          realizado: number
        }[]
      }
      fin_exec_fluxo_12m: {
        Args: never
        Returns: {
          entradas: number
          mes: string
          rotulo: string
          saidas: number
          saldo: number
        }[]
      }
      fin_exec_indicadores_eclesiasticos: {
        Args: never
        Returns: {
          indicador: string
          total_ano: number
          total_mes_anterior: number
          total_mes_atual: number
          variacao_pct: number
        }[]
      }
      fin_exec_saldo_consolidado: { Args: never; Returns: Json }
      fin_gerar_recorrencias: {
        Args: { p_ate_data?: string; p_recorrencia_id?: string }
        Returns: number
      }
      fin_previsao_caixa: {
        Args: never
        Returns: {
          entradas_previstas_30d: number
          entradas_previstas_60d: number
          entradas_previstas_90d: number
          saidas_previstas_30d: number
          saidas_previstas_60d: number
          saidas_previstas_90d: number
          saldo_atual: number
          saldo_projetado_30d: number
          saldo_projetado_60d: number
          saldo_projetado_90d: number
        }[]
      }
      fin_recalc_saldo_conta: {
        Args: { p_conta_id: string }
        Returns: undefined
      }
      fin_seed_centros_custo: {
        Args: never
        Returns: {
          criados: number
          ja_existiam: number
        }[]
      }
      fin_sugerir_centro_por_categoria: {
        Args: { p_categoria_id: string }
        Returns: string
      }
      fin_top_fornecedores: {
        Args: { p_dias?: number; p_n?: number }
        Returns: {
          fornecedor_id: string
          fornecedor_nome: string
          qtd_lancamentos: number
          total: number
        }[]
      }
      fiscal_alertas_proximos: {
        Args: { p_dias?: number }
        Returns: {
          codigo_obrigacao: string
          competencia: string
          cor: string
          dias_para_vencer: number
          icone: string
          id: string
          nome: string
          severidade: string
          valor_esperado: number
          vencimento: string
        }[]
      }
      fiscal_criar_lancamento: {
        Args: { p_agenda_id: string; p_descricao?: string; p_valor: number }
        Returns: string
      }
      fiscal_documentos_mes: {
        Args: { p_ano: number; p_mes: number }
        Returns: {
          codigo_obrigacao: string
          competencia: string
          data_pagamento: string
          documento_id: string
          mime_type: string
          nome_arquivo: string
          nome_obrigacao: string
          observacao: string
          status_obrigacao: string
          storage_path: string
          tipo_doc: string
          valor_pago: number
          vencimento: string
        }[]
      }
      fiscal_gerar_agenda: {
        Args: { p_fim: string; p_inicio: string }
        Returns: {
          codigo: string
          competencia: string
          novo: boolean
          vencimento: string
        }[]
      }
      fiscal_historico_medio: {
        Args: never
        Returns: {
          codigo_obrigacao: string
          desvio_padrao: number
          media_paga: number
          qtd_pagamentos: number
          ultimo_pago: number
        }[]
      }
      fiscal_inconsistencias: {
        Args: never
        Returns: {
          agenda_id: string
          codigo_obrigacao: string
          competencia: string
          detalhes: Json
          mensagem: string
          nome_obrigacao: string
          severidade: string
          tipo: string
        }[]
      }
      fiscal_insights: { Args: never; Returns: Json }
      fiscal_marcar_atrasados: { Args: never; Returns: number }
      fiscal_resumo_dashboard: {
        Args: never
        Returns: {
          proximos: Json
          total_atrasados: number
          total_pagos_mes: number
          total_proximos: number
          total_urgentes: number
        }[]
      }
      fiscal_resumo_malote: {
        Args: { p_ano: number; p_mes: number }
        Returns: Json
      }
      fn_area_do_vinculo: { Args: { p_vinculo: string }; Returns: string }
      fn_areas_do_ministerio: { Args: { min_id: string }; Returns: string[] }
      fn_areas_do_voluntario: { Args: { uid: string }; Returns: string[] }
      fn_contexto_usuario: { Args: never; Returns: Json }
      fn_escalas_do_voluntario: { Args: { uid: string }; Returns: string[] }
      fn_listar_acessos_sistema: {
        Args: never
        Returns: {
          desde: string
          email: string
          membro_id: string
          nome: string
          role: Database["public"]["Enums"]["app_role"]
          role_label: string
        }[]
      }
      fn_meu_membro_id: { Args: never; Returns: string }
      fn_meu_ministerio_id: { Args: never; Returns: string }
      fn_meu_perfil_acesso: {
        Args: never
        Returns: {
          email: string
          nome: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }[]
      }
      fn_meus_ministerios: { Args: never; Returns: string[] }
      fn_minha_permissao: {
        Args: { p_modulo: string }
        Returns: {
          apenas_ministerio: boolean
          apenas_proprio: boolean
          pode_criar: boolean
          pode_editar: boolean
          pode_excluir: boolean
          pode_exportar: boolean
          pode_ver: boolean
          role: Database["public"]["Enums"]["app_role"]
        }[]
      }
      fn_minhas_areas: { Args: never; Returns: string[] }
      fn_permissao: {
        Args: { p_acao: string; p_modulo: string }
        Returns: boolean
      }
      fn_pessoa_do_vinculo: { Args: { p_vinculo: string }; Returns: string }
      fn_pode_editar_obs_pastoral: { Args: never; Returns: boolean }
      fn_pode_executar: { Args: { acao: string }; Returns: boolean }
      fn_todas_minhas_permissoes: {
        Args: never
        Returns: {
          apenas_ministerio: boolean
          apenas_proprio: boolean
          modulo: string
          pode_criar: boolean
          pode_editar: boolean
          pode_excluir: boolean
          pode_exportar: boolean
          pode_ver: boolean
        }[]
      }
      gerar_notificacoes_campanha: {
        Args: { p_campanha_id: string }
        Returns: undefined
      }
      get_user_email: { Args: { target_user_id: string }; Returns: string }
      gov_alertas: {
        Args: never
        Returns: {
          acao_sugerida: string
          descricao: string
          entidade_id: string
          link: string
          prioridade: Database["public"]["Enums"]["prioridade_alerta"]
          tipo: string
          titulo: string
        }[]
      }
      gov_executar_assembleia: {
        Args: { p_assembleia_id: string }
        Returns: {
          pauta_id: string
          resultado: string
          titulo: string
        }[]
      }
      gov_executar_pauta: { Args: { p_pauta_id: string }; Returns: string }
      gov_sugerir_participantes: {
        Args: { p_reuniao_id: string }
        Returns: {
          papel: string
          pessoa_id: string
          pessoa_nome: string
        }[]
      }
      gov_sugerir_pautas: {
        Args: never
        Returns: {
          classificacao: Database["public"]["Enums"]["gov_pauta_classificacao"]
          descricao: string
          titulo: string
          vinculo_id: string
          vinculo_tipo: Database["public"]["Enums"]["gov_pauta_vinculo"]
        }[]
      }
      has_any_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_admin_or_any: {
        Args: { roles: Database["public"]["Enums"]["app_role"][] }
        Returns: boolean
      }
      is_lider_ou_superior: { Args: never; Returns: boolean }
      is_operador_ou_superior: { Args: never; Returns: boolean }
      lidero_ministerio_do_modulo: {
        Args: { p_modulo: string }
        Returns: boolean
      }
      minha_pessoa_id: { Args: never; Returns: string }
      minhas_permissoes: {
        Args: never
        Returns: {
          codigo: string
          modulo: string
        }[]
      }
      montar_pauta_financeira: {
        Args: { p_competencia_fim: string; p_competencia_inicio: string }
        Returns: Json
      }
      mover_aluno_classe: {
        Args: { p_classe_nova: string; p_pessoa_id: string }
        Returns: string
      }
      normalizar_site: { Args: { p_url: string }; Returns: string }
      normalizar_telefone: { Args: { tel: string }; Returns: string }
      painel_de_acessos: {
        Args: never
        Returns: {
          bloqueado: boolean
          criado_em: string
          login: string
          nome: string
          papeis: string[]
          pessoa_id: string
          telefone: string
          ultimo_acesso: string
          user_id: string
        }[]
      }
      pedir_recuperacao_senha: {
        Args: { p_telefone: string }
        Returns: undefined
      }
      pessoa_atual: { Args: never; Returns: string }
      pessoas_sem_familia_sobrenome_conhecido: {
        Args: never
        Returns: {
          familia_sugerida_id: string
          familia_sugerida_nome: string
          nome_completo: string
          pessoa_id: string
          qtd_pessoas_mesmo_sobrenome: number
          sobrenome: string
        }[]
      }
      pgm_alertas_ausencia: {
        Args: { p_grupo_id?: string }
        Returns: {
          faltas_seguidas: number
          grupo_id: string
          grupo_nome: string
          nome: string
          pessoa_id: string
          ultima_presenca: string
        }[]
      }
      pgm_iniciar_reuniao: {
        Args: { p_data: string; p_grupo_id: string; p_tema?: string }
        Returns: string
      }
      pgm_multiplicar_grupo: {
        Args: {
          p_lider_id: string
          p_nome_filho: string
          p_pai_id: string
          p_pessoas_ids?: string[]
        }
        Returns: string
      }
      pgm_resumo_geral: {
        Args: never
        Returns: {
          grupos_ativos: number
          multiplicadores: number
          pedidos_ativos: number
          presenca_media_pct: number
          reunioes_semana: number
          total_grupos: number
          total_membros: number
        }[]
      }
      pgm_resumo_presenca: {
        Args: { p_grupo_id: string; p_n?: number }
        Returns: {
          data: string
          percentual: number
          presentes: number
          reuniao_id: string
          tema: string
          total: number
        }[]
      }
      pgm_sugerir_por_bairro: {
        Args: { p_bairro: string }
        Returns: {
          bairro: string
          dia_semana: number
          horario: string
          id: string
          lider_nome: string
          nome: string
          qtd_membros: number
        }[]
      }
      proximo_aniversario: {
        Args: { p_ano?: number; p_data: string }
        Returns: string
      }
      redefinir_senha: {
        Args: { p_senha: string; p_token: string }
        Returns: {
          email: string
          erro: string
          ok: boolean
        }[]
      }
      registrar_audit_log: {
        Args: {
          p_detalhes?: Json
          p_pessoa_id?: string
          p_tipo_evento: string
          p_user_id?: string
        }
        Returns: undefined
      }
      registrar_contato: {
        Args: { p_obs: string; p_pessoa: string; p_tipo: string }
        Returns: boolean
      }
      registrar_exportacao: {
        Args: {
          p_campos?: string[]
          p_filtro_tipo?: string
          p_filtro_valor?: string
          p_formato?: string
          p_total_registros?: number
        }
        Returns: string
      }
      registrar_financeiro_pdv: {
        Args: {
          p_conta: string
          p_ministerio_id: string
          p_valor_bruto: number
          p_valor_taxa: number
          p_venda_id: string
        }
        Returns: undefined
      }
      registrar_historico_documento: {
        Args: {
          p_acao: string
          p_documento_id: string
          p_observacao?: string
          p_titulo?: string
          p_versao_de?: string
          p_versao_para?: string
        }
        Returns: undefined
      }
      reset_user_password: {
        Args: { new_password: string; target_user_id: string }
        Returns: undefined
      }
      resumo_campanha_ebd: {
        Args: { p_campanha_id: string }
        Returns: {
          arrecadado: number
          dias_decorridos: number
          dias_totais: number
          esperado_ate_hoje: number
          meta: number
          meta_diaria: number
          percentual: number
          status: string
        }[]
      }
      resumo_ebd_dashboard: {
        Args: never
        Returns: {
          classes_com_aula_ult: number
          domingo_anterior: string
          matriculados_classes_ant: number
          matriculados_classes_ult: number
          presentes_ant: number
          presentes_ult: number
          taxa_presenca_ant: number
          taxa_presenca_ult: number
          total_alunos: number
          total_classes_ativas: number
          ultimo_domingo: string
          variacao_presenca: number
        }[]
      }
      resumo_meus_dados: { Args: never; Returns: Json }
      resumo_painel_pastoral: {
        Args: never
        Returns: {
          aniversarios_hoje: number
          aniversarios_semana: number
          bodas_hoje: number
          bodas_semana: number
          familias_sem_resp: number
          pessoas_sem_familia_sugerida: number
        }[]
      }
      revogar_acesso: { Args: { p_user_id: string }; Returns: string }
      salvar_meus_dados: {
        Args: {
          p_bairro: string
          p_cep: string
          p_cidade: string
          p_complemento: string
          p_data_casamento: string
          p_data_nascimento: string
          p_email: string
          p_endereco: string
          p_nome_completo: string
          p_numero: string
          p_telefone_celular: string
          p_uf: string
        }
        Returns: {
          atualizado_em: string
          id: string
          nome_completo: string
        }[]
      }
      secretaria_alertas: {
        Args: never
        Returns: {
          acao_sugerida: string
          descricao: string
          link: string
          prioridade: Database["public"]["Enums"]["prioridade_alerta"]
          solicitacao_id: string
          tipo: string
          titulo: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      solicitar_lgpd: {
        Args: { p_descricao?: string; p_email: string; p_tipo: string }
        Returns: string
      }
      solicitar_reset_senha: {
        Args: { p_telefone: string }
        Returns: {
          ok: boolean
          pessoa_id: string
          token: string
        }[]
      }
      sugerir_classe_ebd: {
        Args: { p_data_nascimento: string; p_sexo?: string }
        Returns: string
      }
      sugerir_identidade_por_tag: {
        Args: { p_limite?: number; p_tag: string }
        Returns: Json
      }
      sugerir_vinculos_familiares: {
        Args: { p_nome_completo?: string; p_pessoa_id?: string }
        Returns: {
          familia_id: string
          familia_nome: string
          nome_completo: string
          parentesco: string
          pessoa_id: string
          responsavel: boolean
          sobrenome: string
        }[]
      }
      sugerir_voluntarios_escala: {
        Args: {
          p_area_id: string
          p_data_evento: string
          p_dia_semana?: string
          p_hora_fim?: string
          p_hora_inicio?: string
          p_limite?: number
          p_turno?: string
        }
        Returns: {
          carga_atual: number
          disponivel: boolean
          em_descanso: boolean
          motivo: string
          nivel_sobrecarga: number
          nome_completo: string
          pessoa_id: string
          score: number
          total_escalas_mes: number
          ultima_escala_em: string
        }[]
      }
      telefone_canonico: { Args: { p_telefone: string }; Returns: string }
      tem_permissao: { Args: { p_codigo: string }; Returns: boolean }
      validar_convite: {
        Args: { p_token: string }
        Returns: {
          motivo: string
          nome_completo: string
          pessoa_id: string
          role: string
          telefone: string
          tipo: string
          valido: boolean
        }[]
      }
      verifica_conflito_ocupacao: {
        Args: {
          p_excluir_ref_id?: string
          p_local_id: string
          p_origem: string
          p_periodo: unknown
        }
        Returns: Json
      }
      vincular_pessoa_familia: {
        Args: {
          p_copiar_endereco_para_familia?: boolean
          p_familia_id: string
          p_parentesco: string
          p_pessoa_id: string
          p_responsavel?: boolean
        }
        Returns: string
      }
    }
    Enums: {
      acompanhamento_status:
        | "pendente"
        | "em_andamento"
        | "concluido"
        | "sem_retorno"
      agendamentos_salas_status_agendamento_enum:
        | "Confirmado"
        | "Pendente"
        | "Cancelado"
      agendamentos_salas_tipo_agendamento_enum:
        | "Evento"
        | "Reunião"
        | "Ensaio"
        | "EBD"
        | "Outro"
      app_role:
        | "admin"
        | "secretaria"
        | "diakonia"
        | "lideranca"
        | "operador"
        | "voluntario"
        | "pastor"
        | "membro"
        | "visualizador"
        | "lider"
        | "tesouraria"
      areas_ministerio_dia_reuniao_enum:
        | "Segunda"
        | "Terça"
        | "Quarta"
        | "Quinta"
        | "Sexta"
        | "Sábado"
        | "Domingo"
      arr_caixa_estado: "aberto" | "conciliando" | "fechado"
      arr_checklist_tipo: "pre_uso" | "pos_uso"
      arr_estoque_mov_tipo:
        | "inicial"
        | "venda"
        | "ajuste"
        | "reabastecimento"
        | "perda"
      arr_forma_pgto: "dinheiro" | "pix" | "debito" | "credito" | "outros"
      arr_mov_tipo:
        | "custo"
        | "reembolso_pessoa"
        | "abate_compra_cnpj"
        | "reversao_admin"
        | "ajuste"
      arr_produto_categoria: "bazar" | "cantina_prato" | "outro"
      arr_reserva_status:
        | "solicitada"
        | "aprovada"
        | "recusada"
        | "em_uso"
        | "encerrada"
        | "cancelada"
      assunto_prioridade: "alta" | "media" | "baixa"
      assunto_status:
        | "aberto"
        | "em_andamento"
        | "concluido"
        | "cancelado"
        | "aguardando_terceiro"
      atuacao_status: "ativa" | "encerrada"
      calculos_rpa_status_rpa_enum:
        | "Rascunho"
        | "Emitido"
        | "Pago"
        | "Cancelado"
      campanhas_financeiras_status_campanha_enum:
        | "Ativa"
        | "Encerrada"
        | "Meta Atingida"
        | "Cancelada"
      cartas_transferencia_status_carta_enum:
        | "Emitida"
        | "Entregue"
        | "Vencida"
        | "Cancelada"
        | "Recebida"
      comunicados_publico_alvo_enum:
        | "Todos"
        | "Membros"
        | "Liderança"
        | "Voluntários"
        | "Jovens"
        | "EBD"
      comunicados_tipo_comunicado_enum:
        | "Aviso"
        | "Evento"
        | "Culto"
        | "Urgente"
        | "Boletim"
        | "Outro"
      congregacoes_status_congregacao_enum:
        | "Ativa"
        | "Inativa"
        | "Em Plantação"
        | "Encerrada"
      contratos_rh_status_contrato_enum:
        | "Ativo"
        | "Vencido"
        | "Renovado"
        | "Cancelado"
      controle_chaves_status_chave_enum:
        | "Disponível"
        | "Emprestada"
        | "Extraviada"
        | "Desativada"
      cursos_discipulado_status_curso_enum:
        | "Aberto"
        | "Em Andamento"
        | "Concluído"
        | "Cancelado"
      custos_projetos_sociais_tipo_custo_enum:
        | "Alimentação"
        | "Material"
        | "Medicamentos"
        | "Transporte"
        | "Outro"
      dia_semana:
        | "domingo"
        | "segunda"
        | "terca"
        | "quarta"
        | "quinta"
        | "sexta"
        | "sabado"
      dizimistas_forma_pagamento_enum:
        | "PIX"
        | "Transferência"
        | "Dinheiro"
        | "Débito"
        | "Crédito"
        | "Boleto"
      dizimos_historico_forma_pagamento_enum:
        | "PIX"
        | "Transferência"
        | "Dinheiro"
        | "Débito"
        | "Crédito"
        | "Boleto"
      documentos_secretaria_status_documento_enum:
        | "Emitido"
        | "Entregue"
        | "Vencido"
        | "Cancelado"
      emprestimos_biblioteca_status_emprestimo_enum:
        | "Em Curso"
        | "Devolvido"
        | "Em Atraso"
        | "Renovado"
      escalas_louvor_tom_base_enum:
        | "C"
        | "C#"
        | "D"
        | "D#"
        | "E"
        | "F"
        | "F#"
        | "G"
        | "G#"
        | "A"
        | "A#"
        | "B"
      escalas_voluntarios_status_confirmacao_enum:
        | "Pendente"
        | "Confirmado"
        | "Recusado"
      estado_civil:
        | "solteiro"
        | "casado"
        | "divorciado"
        | "viuvo"
        | "uniao_estavel"
        | "separado"
      evangelismo_campanhas_tipo_evangelismo_enum:
        | "Porta a Porta"
        | "Evento"
        | "Online"
        | "Telefonema"
        | "Outro"
      evento_recorrencia_freq:
        | "diario"
        | "semanal"
        | "mensal"
        | "anual"
        | "personalizado"
      evento_responsabilidade: "principal" | "apoio"
      evento_status: "agendado" | "realizado" | "cancelado"
      evento_tipo:
        | "culto"
        | "reuniao"
        | "ensaio"
        | "acao_social"
        | "curso"
        | "outro"
        | "live"
        | "palestra"
        | "comunhao"
      eventos_status_evento_enum:
        | "Planejado"
        | "Em Andamento"
        | "Realizado"
        | "Cancelado"
        | "Reagendado"
      fin_centro_vinculo:
        | "ministerio"
        | "area"
        | "ebd_classe"
        | "pgm_grupo"
        | "campanha"
        | "geral"
        | "evento"
      fin_conta_tipo:
        | "caixa"
        | "banco"
        | "pix"
        | "envelope"
        | "cartao"
        | "aplicacao"
        | "cofre"
      fin_estoque_movimento_tipo: "entrada" | "saida" | "ajuste"
      fin_forma_pagamento:
        | "pix"
        | "dinheiro"
        | "cartao_debito"
        | "cartao_credito"
        | "transferencia"
        | "boleto"
        | "envelope"
        | "outro"
      fin_frequencia:
        | "mensal"
        | "bimestral"
        | "trimestral"
        | "semestral"
        | "anual"
      fin_lancamento_status:
        | "previsto"
        | "realizado"
        | "conciliado"
        | "cancelado"
        | "aguardando_aprovacao"
      fin_movimento_tipo: "entrada" | "saida"
      fin_vinculo_tipo:
        | "clt"
        | "mei"
        | "rpa"
        | "prebenda"
        | "estagio"
        | "voluntario_remunerado"
      frequencia_servico:
        | "toda_semana"
        | "quinzenal"
        | "mensal"
        | "eventual"
        | "sob_demanda"
      funcao_lideranca: "lider" | "co_lider" | "vice_lider" | "auxiliar"
      funcao_ministerial:
        | "membro"
        | "voluntario"
        | "lider"
        | "pastor"
        | "professor_ebd"
        | "tesoureiro"
        | "secretario"
        | "evangelista"
        | "missionario"
        | "diacono"
        | "presbitero"
        | "coordenador"
        | "obreiro"
        | "presidente"
        | "pastor_auxiliar"
        | "pastor_missionario"
        | "vice_presidente_1"
        | "vice_presidente_2"
        | "tesoureiro_1"
        | "tesoureiro_2"
        | "secretaria_1"
        | "secretaria_2"
        | "ministro"
        | "lider_area"
        | "auditor"
        | "juridico_parlamentar"
      gov_pauta_classificacao: "informativa" | "deliberativa"
      gov_pauta_status:
        | "rascunho"
        | "aprovada_em_pauta"
        | "para_assembleia"
        | "aprovada_assembleia"
        | "rejeitada"
        | "adiada"
        | "executada"
      gov_pauta_vinculo:
        | "solicitacao_membresia"
        | "compra"
        | "financeiro"
        | "administrativo"
        | "espiritual"
        | "outro"
      gov_reuniao_status:
        | "agendada"
        | "em_andamento"
        | "concluida"
        | "cancelada"
        | "adiada"
      gov_reuniao_tipo:
        | "diretoria"
        | "lideranca"
        | "conselho"
        | "extraordinaria"
        | "outra"
      gov_voto: "sim" | "nao" | "abstencao" | "impedimento"
      inscricoes_cursos_status_inscricao_enum:
        | "Ativa"
        | "Concluída"
        | "Cancelada"
        | "Desistência"
      local_ambiente:
        | "templo"
        | "sala"
        | "administrativo"
        | "tecnico"
        | "area_social"
        | "circulacao"
        | "deposito"
      local_localizacao_interna:
        | "frente"
        | "fundos"
        | "lado_esquerdo"
        | "lado_direito"
        | "centro"
        | "area_externa"
      local_pavimento:
        | "subsolo"
        | "terreo"
        | "galeria"
        | "andares_superiores"
        | "area_tecnica"
      local_predio: "rp" | "sf"
      local_restricao_acesso: "livre" | "restrito" | "tecnico"
      local_status: "ativo" | "inativo"
      local_status_op:
        | "disponivel"
        | "em_uso"
        | "em_manutencao"
        | "interditado"
        | "inativo"
      local_tipo:
        | "templo"
        | "sala"
        | "gabinete"
        | "auditorio"
        | "area_externa"
        | "outro"
      local_uso:
        | "culto"
        | "ensino"
        | "musica"
        | "comunicacao"
        | "administrativo"
        | "manutencao"
        | "apoio_tecnico"
        | "armazenamento"
      manutencoes_status_manutencao_enum:
        | "Pendente"
        | "Em Andamento"
        | "Concluída"
        | "Cancelada"
      manutencoes_tipo_manutencao_enum:
        | "Preventiva"
        | "Corretiva"
        | "Emergencial"
      membro_status:
        | "ativo"
        | "inativo"
        | "transferido"
        | "falecido"
        | "desligado"
      mentoria_status_mentoria_enum:
        | "Ativo"
        | "Em Pausa"
        | "Concluído"
        | "Encerrado"
      midia_digital_plataforma_enum:
        | "YouTube"
        | "Instagram"
        | "Facebook"
        | "TikTok"
        | "WhatsApp"
        | "Outro"
      midia_digital_tipo_conteudo_enum:
        | "Culto"
        | "Devocional"
        | "Testemunho"
        | "Evento"
        | "Informe"
        | "Outro"
      movimentacoes_formais_status_processo_enum:
        | "Iniciado"
        | "Em Andamento"
        | "Concluído"
        | "Cancelado"
      musica_repertorio_tom_original_enum:
        | "C"
        | "C#"
        | "D"
        | "D#"
        | "E"
        | "F"
        | "F#"
        | "G"
        | "G#"
        | "A"
        | "A#"
        | "B"
      musica_repertorio_tom_preferido_enum:
        | "C"
        | "C#"
        | "D"
        | "D#"
        | "E"
        | "F"
        | "F#"
        | "G"
        | "G#"
        | "A"
        | "A#"
        | "B"
      musicas_escala_tom_usado_enum:
        | "C"
        | "C#"
        | "D"
        | "D#"
        | "E"
        | "F"
        | "F#"
        | "G"
        | "G#"
        | "A"
        | "A#"
        | "B"
      novos_convertidos_status_acompanhamento_enum:
        | "Em Acompanhamento"
        | "Batizado"
        | "Transferido"
        | "Encerrado"
      novos_convertidos_tipo_decisao_enum:
        | "Conversão"
        | "Rededição"
        | "Batismo"
        | "Outro"
      parceiros_missoes_status_apoio_enum:
        | "Ativo"
        | "Suspenso"
        | "Encerrado"
        | "Em Avaliação"
      parentesco_tipo:
        | "pai_mae"
        | "conjuge"
        | "filho"
        | "avo"
        | "neto"
        | "enteado"
        | "tutelado"
        | "irmao"
        | "outro"
      patrimonio_bens_estado_conservacao_enum:
        | "Ótimo"
        | "Bom"
        | "Regular"
        | "Ruim"
        | "Inativo"
      pedidos_oracao_status_oracao_enum:
        | "Em Oração"
        | "Respondido"
        | "Arquivado"
      pequenos_grupos_dia_reuniao_enum:
        | "Segunda"
        | "Terça"
        | "Quarta"
        | "Quinta"
        | "Sexta"
        | "Sábado"
        | "Domingo"
      pequenos_grupos_tipo_local_enum:
        | "Residência"
        | "Igreja"
        | "Online"
        | "Misto"
        | "Outro"
      perfil_acesso:
        | "admin"
        | "pastor"
        | "secretaria"
        | "tesoureiro"
        | "lideranca"
        | "professor_ebd"
        | "voluntario"
        | "membro"
      pessoas_sexo_enum: "Masculino" | "Feminino" | "Não informado"
      pgm_oracao_status: "ativo" | "respondido" | "arquivado"
      pgm_oracao_visibilidade: "privada" | "lideranca" | "grupo"
      pgm_papel: "participante" | "lider" | "colider" | "anfitriao"
      planejamento_estrategico_perspectiva_enum:
        | "Financeira"
        | "Crescimento"
        | "Processos"
        | "Aprendizado"
      planejamento_estrategico_status_plano_enum:
        | "Em Andamento"
        | "Concluído"
        | "Atrasado"
        | "Cancelado"
      predio_tipo:
        | "templo"
        | "anexo"
        | "residencia_pastoral"
        | "administrativo"
        | "apoio"
        | "outro"
      prioridade_alerta: "urgente" | "atencao" | "informativo"
      projetos_sociais_periodicidade_enum:
        | "Semanal"
        | "Quinzenal"
        | "Mensal"
        | "Bimestral"
        | "Trimestral"
        | "Sob Demanda"
      recursos_humanos_status_rh_enum:
        | "Ativo"
        | "Afastado"
        | "Desligado"
        | "Em Experiência"
      recursos_humanos_tipo_vinculo_enum:
        | "CLT"
        | "PJ/Prestador"
        | "Estágio"
        | "Voluntário Remunerado"
        | "Pró-labore"
      relatorios_mensais_status_relatorio_enum:
        | "Pendente"
        | "Em Revisão"
        | "Concluído"
      repasse_congregacoes_status_repasse_enum:
        | "Pendente"
        | "Realizado"
        | "Cancelado"
        | "Em Análise"
      sexo: "masculino" | "feminino"
      situacoes_especiais_status_situacao_enum:
        | "Ativo"
        | "Em Acompanhamento"
        | "Encerrado"
        | "Arquivado"
      status_acolhimento_enum:
        | "novo"
        | "contatar"
        | "contatado"
        | "retornou"
        | "em_relacionamento"
        | "em_acompanhamento"
        | "congregado"
        | "membro"
      status_checklist:
        | "pendente"
        | "em_andamento"
        | "concluido"
        | "nao_aplicavel"
      status_escala: "planejada" | "confirmada" | "realizada" | "cancelada"
      status_presenca_escala:
        | "pendente"
        | "confirmado"
        | "recusado"
        | "ausente"
        | "presente"
      status_solicitacao_membresia:
        | "rascunho"
        | "aguardando_documento"
        | "pronta_assembleia"
        | "aprovada"
        | "rejeitada"
        | "concluida"
        | "cancelada"
      status_voluntario: "ativo" | "em_descanso" | "inativo" | "afastado"
      tipo_entrada_rol:
        | "aclamacao"
        | "batismo"
        | "reconciliacao"
        | "transferencia"
      tipo_lideranca_ref: "ministerio" | "area"
      tipo_pessoa: "membro" | "congregado" | "visitante" | "ex_membro"
      tipo_solicitacao_membresia:
        | "entrada_batismo"
        | "entrada_profissao_fe"
        | "entrada_aclamacao"
        | "transferencia_recebida"
        | "transferencia_emitida"
        | "desligamento_pedido"
        | "desligamento_disciplinar"
        | "falecimento"
      transferencias_inter_congregacao_status_transferencia_enum:
        | "Pendente"
        | "Em Análise"
        | "Aprovada"
        | "Concluída"
        | "Cancelada"
      turno_disponibilidade: "manha" | "tarde" | "noite" | "dia_todo"
      unidade_tipo:
        | "sede"
        | "congregacao"
        | "missao"
        | "ponto_de_pregacao"
        | "outro"
      vinculos_familiares_parentesco_enum:
        | "Cônjuge"
        | "Filho(a)"
        | "Pai"
        | "Mãe"
        | "Irmão(ã)"
        | "Avô/Avó"
        | "Outro"
      visitacao_domiciliar_status_visita_enum:
        | "Solicitada"
        | "Agendada"
        | "Realizada"
        | "Cancelada"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      acompanhamento_status: [
        "pendente",
        "em_andamento",
        "concluido",
        "sem_retorno",
      ],
      agendamentos_salas_status_agendamento_enum: [
        "Confirmado",
        "Pendente",
        "Cancelado",
      ],
      agendamentos_salas_tipo_agendamento_enum: [
        "Evento",
        "Reunião",
        "Ensaio",
        "EBD",
        "Outro",
      ],
      app_role: [
        "admin",
        "secretaria",
        "diakonia",
        "lideranca",
        "operador",
        "voluntario",
        "pastor",
        "membro",
        "visualizador",
        "lider",
        "tesouraria",
      ],
      areas_ministerio_dia_reuniao_enum: [
        "Segunda",
        "Terça",
        "Quarta",
        "Quinta",
        "Sexta",
        "Sábado",
        "Domingo",
      ],
      arr_caixa_estado: ["aberto", "conciliando", "fechado"],
      arr_checklist_tipo: ["pre_uso", "pos_uso"],
      arr_estoque_mov_tipo: [
        "inicial",
        "venda",
        "ajuste",
        "reabastecimento",
        "perda",
      ],
      arr_forma_pgto: ["dinheiro", "pix", "debito", "credito", "outros"],
      arr_mov_tipo: [
        "custo",
        "reembolso_pessoa",
        "abate_compra_cnpj",
        "reversao_admin",
        "ajuste",
      ],
      arr_produto_categoria: ["bazar", "cantina_prato", "outro"],
      arr_reserva_status: [
        "solicitada",
        "aprovada",
        "recusada",
        "em_uso",
        "encerrada",
        "cancelada",
      ],
      assunto_prioridade: ["alta", "media", "baixa"],
      assunto_status: [
        "aberto",
        "em_andamento",
        "concluido",
        "cancelado",
        "aguardando_terceiro",
      ],
      atuacao_status: ["ativa", "encerrada"],
      calculos_rpa_status_rpa_enum: [
        "Rascunho",
        "Emitido",
        "Pago",
        "Cancelado",
      ],
      campanhas_financeiras_status_campanha_enum: [
        "Ativa",
        "Encerrada",
        "Meta Atingida",
        "Cancelada",
      ],
      cartas_transferencia_status_carta_enum: [
        "Emitida",
        "Entregue",
        "Vencida",
        "Cancelada",
        "Recebida",
      ],
      comunicados_publico_alvo_enum: [
        "Todos",
        "Membros",
        "Liderança",
        "Voluntários",
        "Jovens",
        "EBD",
      ],
      comunicados_tipo_comunicado_enum: [
        "Aviso",
        "Evento",
        "Culto",
        "Urgente",
        "Boletim",
        "Outro",
      ],
      congregacoes_status_congregacao_enum: [
        "Ativa",
        "Inativa",
        "Em Plantação",
        "Encerrada",
      ],
      contratos_rh_status_contrato_enum: [
        "Ativo",
        "Vencido",
        "Renovado",
        "Cancelado",
      ],
      controle_chaves_status_chave_enum: [
        "Disponível",
        "Emprestada",
        "Extraviada",
        "Desativada",
      ],
      cursos_discipulado_status_curso_enum: [
        "Aberto",
        "Em Andamento",
        "Concluído",
        "Cancelado",
      ],
      custos_projetos_sociais_tipo_custo_enum: [
        "Alimentação",
        "Material",
        "Medicamentos",
        "Transporte",
        "Outro",
      ],
      dia_semana: [
        "domingo",
        "segunda",
        "terca",
        "quarta",
        "quinta",
        "sexta",
        "sabado",
      ],
      dizimistas_forma_pagamento_enum: [
        "PIX",
        "Transferência",
        "Dinheiro",
        "Débito",
        "Crédito",
        "Boleto",
      ],
      dizimos_historico_forma_pagamento_enum: [
        "PIX",
        "Transferência",
        "Dinheiro",
        "Débito",
        "Crédito",
        "Boleto",
      ],
      documentos_secretaria_status_documento_enum: [
        "Emitido",
        "Entregue",
        "Vencido",
        "Cancelado",
      ],
      emprestimos_biblioteca_status_emprestimo_enum: [
        "Em Curso",
        "Devolvido",
        "Em Atraso",
        "Renovado",
      ],
      escalas_louvor_tom_base_enum: [
        "C",
        "C#",
        "D",
        "D#",
        "E",
        "F",
        "F#",
        "G",
        "G#",
        "A",
        "A#",
        "B",
      ],
      escalas_voluntarios_status_confirmacao_enum: [
        "Pendente",
        "Confirmado",
        "Recusado",
      ],
      estado_civil: [
        "solteiro",
        "casado",
        "divorciado",
        "viuvo",
        "uniao_estavel",
        "separado",
      ],
      evangelismo_campanhas_tipo_evangelismo_enum: [
        "Porta a Porta",
        "Evento",
        "Online",
        "Telefonema",
        "Outro",
      ],
      evento_recorrencia_freq: [
        "diario",
        "semanal",
        "mensal",
        "anual",
        "personalizado",
      ],
      evento_responsabilidade: ["principal", "apoio"],
      evento_status: ["agendado", "realizado", "cancelado"],
      evento_tipo: [
        "culto",
        "reuniao",
        "ensaio",
        "acao_social",
        "curso",
        "outro",
        "live",
        "palestra",
        "comunhao",
      ],
      eventos_status_evento_enum: [
        "Planejado",
        "Em Andamento",
        "Realizado",
        "Cancelado",
        "Reagendado",
      ],
      fin_centro_vinculo: [
        "ministerio",
        "area",
        "ebd_classe",
        "pgm_grupo",
        "campanha",
        "geral",
        "evento",
      ],
      fin_conta_tipo: [
        "caixa",
        "banco",
        "pix",
        "envelope",
        "cartao",
        "aplicacao",
        "cofre",
      ],
      fin_estoque_movimento_tipo: ["entrada", "saida", "ajuste"],
      fin_forma_pagamento: [
        "pix",
        "dinheiro",
        "cartao_debito",
        "cartao_credito",
        "transferencia",
        "boleto",
        "envelope",
        "outro",
      ],
      fin_frequencia: [
        "mensal",
        "bimestral",
        "trimestral",
        "semestral",
        "anual",
      ],
      fin_lancamento_status: [
        "previsto",
        "realizado",
        "conciliado",
        "cancelado",
        "aguardando_aprovacao",
      ],
      fin_movimento_tipo: ["entrada", "saida"],
      fin_vinculo_tipo: [
        "clt",
        "mei",
        "rpa",
        "prebenda",
        "estagio",
        "voluntario_remunerado",
      ],
      frequencia_servico: [
        "toda_semana",
        "quinzenal",
        "mensal",
        "eventual",
        "sob_demanda",
      ],
      funcao_lideranca: ["lider", "co_lider", "vice_lider", "auxiliar"],
      funcao_ministerial: [
        "membro",
        "voluntario",
        "lider",
        "pastor",
        "professor_ebd",
        "tesoureiro",
        "secretario",
        "evangelista",
        "missionario",
        "diacono",
        "presbitero",
        "coordenador",
        "obreiro",
        "presidente",
        "pastor_auxiliar",
        "pastor_missionario",
        "vice_presidente_1",
        "vice_presidente_2",
        "tesoureiro_1",
        "tesoureiro_2",
        "secretaria_1",
        "secretaria_2",
        "ministro",
        "lider_area",
        "auditor",
        "juridico_parlamentar",
      ],
      gov_pauta_classificacao: ["informativa", "deliberativa"],
      gov_pauta_status: [
        "rascunho",
        "aprovada_em_pauta",
        "para_assembleia",
        "aprovada_assembleia",
        "rejeitada",
        "adiada",
        "executada",
      ],
      gov_pauta_vinculo: [
        "solicitacao_membresia",
        "compra",
        "financeiro",
        "administrativo",
        "espiritual",
        "outro",
      ],
      gov_reuniao_status: [
        "agendada",
        "em_andamento",
        "concluida",
        "cancelada",
        "adiada",
      ],
      gov_reuniao_tipo: [
        "diretoria",
        "lideranca",
        "conselho",
        "extraordinaria",
        "outra",
      ],
      gov_voto: ["sim", "nao", "abstencao", "impedimento"],
      inscricoes_cursos_status_inscricao_enum: [
        "Ativa",
        "Concluída",
        "Cancelada",
        "Desistência",
      ],
      local_ambiente: [
        "templo",
        "sala",
        "administrativo",
        "tecnico",
        "area_social",
        "circulacao",
        "deposito",
      ],
      local_localizacao_interna: [
        "frente",
        "fundos",
        "lado_esquerdo",
        "lado_direito",
        "centro",
        "area_externa",
      ],
      local_pavimento: [
        "subsolo",
        "terreo",
        "galeria",
        "andares_superiores",
        "area_tecnica",
      ],
      local_predio: ["rp", "sf"],
      local_restricao_acesso: ["livre", "restrito", "tecnico"],
      local_status: ["ativo", "inativo"],
      local_status_op: [
        "disponivel",
        "em_uso",
        "em_manutencao",
        "interditado",
        "inativo",
      ],
      local_tipo: [
        "templo",
        "sala",
        "gabinete",
        "auditorio",
        "area_externa",
        "outro",
      ],
      local_uso: [
        "culto",
        "ensino",
        "musica",
        "comunicacao",
        "administrativo",
        "manutencao",
        "apoio_tecnico",
        "armazenamento",
      ],
      manutencoes_status_manutencao_enum: [
        "Pendente",
        "Em Andamento",
        "Concluída",
        "Cancelada",
      ],
      manutencoes_tipo_manutencao_enum: [
        "Preventiva",
        "Corretiva",
        "Emergencial",
      ],
      membro_status: [
        "ativo",
        "inativo",
        "transferido",
        "falecido",
        "desligado",
      ],
      mentoria_status_mentoria_enum: [
        "Ativo",
        "Em Pausa",
        "Concluído",
        "Encerrado",
      ],
      midia_digital_plataforma_enum: [
        "YouTube",
        "Instagram",
        "Facebook",
        "TikTok",
        "WhatsApp",
        "Outro",
      ],
      midia_digital_tipo_conteudo_enum: [
        "Culto",
        "Devocional",
        "Testemunho",
        "Evento",
        "Informe",
        "Outro",
      ],
      movimentacoes_formais_status_processo_enum: [
        "Iniciado",
        "Em Andamento",
        "Concluído",
        "Cancelado",
      ],
      musica_repertorio_tom_original_enum: [
        "C",
        "C#",
        "D",
        "D#",
        "E",
        "F",
        "F#",
        "G",
        "G#",
        "A",
        "A#",
        "B",
      ],
      musica_repertorio_tom_preferido_enum: [
        "C",
        "C#",
        "D",
        "D#",
        "E",
        "F",
        "F#",
        "G",
        "G#",
        "A",
        "A#",
        "B",
      ],
      musicas_escala_tom_usado_enum: [
        "C",
        "C#",
        "D",
        "D#",
        "E",
        "F",
        "F#",
        "G",
        "G#",
        "A",
        "A#",
        "B",
      ],
      novos_convertidos_status_acompanhamento_enum: [
        "Em Acompanhamento",
        "Batizado",
        "Transferido",
        "Encerrado",
      ],
      novos_convertidos_tipo_decisao_enum: [
        "Conversão",
        "Rededição",
        "Batismo",
        "Outro",
      ],
      parceiros_missoes_status_apoio_enum: [
        "Ativo",
        "Suspenso",
        "Encerrado",
        "Em Avaliação",
      ],
      parentesco_tipo: [
        "pai_mae",
        "conjuge",
        "filho",
        "avo",
        "neto",
        "enteado",
        "tutelado",
        "irmao",
        "outro",
      ],
      patrimonio_bens_estado_conservacao_enum: [
        "Ótimo",
        "Bom",
        "Regular",
        "Ruim",
        "Inativo",
      ],
      pedidos_oracao_status_oracao_enum: [
        "Em Oração",
        "Respondido",
        "Arquivado",
      ],
      pequenos_grupos_dia_reuniao_enum: [
        "Segunda",
        "Terça",
        "Quarta",
        "Quinta",
        "Sexta",
        "Sábado",
        "Domingo",
      ],
      pequenos_grupos_tipo_local_enum: [
        "Residência",
        "Igreja",
        "Online",
        "Misto",
        "Outro",
      ],
      perfil_acesso: [
        "admin",
        "pastor",
        "secretaria",
        "tesoureiro",
        "lideranca",
        "professor_ebd",
        "voluntario",
        "membro",
      ],
      pessoas_sexo_enum: ["Masculino", "Feminino", "Não informado"],
      pgm_oracao_status: ["ativo", "respondido", "arquivado"],
      pgm_oracao_visibilidade: ["privada", "lideranca", "grupo"],
      pgm_papel: ["participante", "lider", "colider", "anfitriao"],
      planejamento_estrategico_perspectiva_enum: [
        "Financeira",
        "Crescimento",
        "Processos",
        "Aprendizado",
      ],
      planejamento_estrategico_status_plano_enum: [
        "Em Andamento",
        "Concluído",
        "Atrasado",
        "Cancelado",
      ],
      predio_tipo: [
        "templo",
        "anexo",
        "residencia_pastoral",
        "administrativo",
        "apoio",
        "outro",
      ],
      prioridade_alerta: ["urgente", "atencao", "informativo"],
      projetos_sociais_periodicidade_enum: [
        "Semanal",
        "Quinzenal",
        "Mensal",
        "Bimestral",
        "Trimestral",
        "Sob Demanda",
      ],
      recursos_humanos_status_rh_enum: [
        "Ativo",
        "Afastado",
        "Desligado",
        "Em Experiência",
      ],
      recursos_humanos_tipo_vinculo_enum: [
        "CLT",
        "PJ/Prestador",
        "Estágio",
        "Voluntário Remunerado",
        "Pró-labore",
      ],
      relatorios_mensais_status_relatorio_enum: [
        "Pendente",
        "Em Revisão",
        "Concluído",
      ],
      repasse_congregacoes_status_repasse_enum: [
        "Pendente",
        "Realizado",
        "Cancelado",
        "Em Análise",
      ],
      sexo: ["masculino", "feminino"],
      situacoes_especiais_status_situacao_enum: [
        "Ativo",
        "Em Acompanhamento",
        "Encerrado",
        "Arquivado",
      ],
      status_acolhimento_enum: [
        "novo",
        "contatar",
        "contatado",
        "retornou",
        "em_relacionamento",
        "em_acompanhamento",
        "congregado",
        "membro",
      ],
      status_checklist: [
        "pendente",
        "em_andamento",
        "concluido",
        "nao_aplicavel",
      ],
      status_escala: ["planejada", "confirmada", "realizada", "cancelada"],
      status_presenca_escala: [
        "pendente",
        "confirmado",
        "recusado",
        "ausente",
        "presente",
      ],
      status_solicitacao_membresia: [
        "rascunho",
        "aguardando_documento",
        "pronta_assembleia",
        "aprovada",
        "rejeitada",
        "concluida",
        "cancelada",
      ],
      status_voluntario: ["ativo", "em_descanso", "inativo", "afastado"],
      tipo_entrada_rol: [
        "aclamacao",
        "batismo",
        "reconciliacao",
        "transferencia",
      ],
      tipo_lideranca_ref: ["ministerio", "area"],
      tipo_pessoa: ["membro", "congregado", "visitante", "ex_membro"],
      tipo_solicitacao_membresia: [
        "entrada_batismo",
        "entrada_profissao_fe",
        "entrada_aclamacao",
        "transferencia_recebida",
        "transferencia_emitida",
        "desligamento_pedido",
        "desligamento_disciplinar",
        "falecimento",
      ],
      transferencias_inter_congregacao_status_transferencia_enum: [
        "Pendente",
        "Em Análise",
        "Aprovada",
        "Concluída",
        "Cancelada",
      ],
      turno_disponibilidade: ["manha", "tarde", "noite", "dia_todo"],
      unidade_tipo: [
        "sede",
        "congregacao",
        "missao",
        "ponto_de_pregacao",
        "outro",
      ],
      vinculos_familiares_parentesco_enum: [
        "Cônjuge",
        "Filho(a)",
        "Pai",
        "Mãe",
        "Irmão(ã)",
        "Avô/Avó",
        "Outro",
      ],
      visitacao_domiciliar_status_visita_enum: [
        "Solicitada",
        "Agendada",
        "Realizada",
        "Cancelada",
      ],
    },
  },
} as const
