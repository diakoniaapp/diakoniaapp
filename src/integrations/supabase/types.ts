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
            foreignKeyName: "acolhimento_tarefas_visitante_id_fkey"
            columns: ["visitante_id"]
            isOneToOne: false
            referencedRelation: "membros"
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
      area_voluntarios: {
        Row: {
          area_id: string
          created_at: string
          data_fim: string | null
          data_inicio: string
          funcao: string
          id: string
          membro_id: string
          ministerio_id: string
          observacoes: string | null
          status: Database["public"]["Enums"]["atuacao_status"]
          updated_at: string
        }
        Insert: {
          area_id: string
          created_at?: string
          data_fim?: string | null
          data_inicio?: string
          funcao: string
          id?: string
          membro_id: string
          ministerio_id: string
          observacoes?: string | null
          status?: Database["public"]["Enums"]["atuacao_status"]
          updated_at?: string
        }
        Update: {
          area_id?: string
          created_at?: string
          data_fim?: string | null
          data_inicio?: string
          funcao?: string
          id?: string
          membro_id?: string
          ministerio_id?: string
          observacoes?: string | null
          status?: Database["public"]["Enums"]["atuacao_status"]
          updated_at?: string
        }
        Relationships: []
      }
      areas: {
        Row: {
          ativo: boolean
          co_lider_id: string | null
          created_at: string
          descricao: string | null
          id: string
          lider_id: string | null
          ministerio_id: string
          nome: string
          sigla: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          co_lider_id?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          lider_id?: string | null
          ministerio_id: string
          nome: string
          sigla?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          co_lider_id?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          lider_id?: string | null
          ministerio_id?: string
          nome?: string
          sigla?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "areas_ministerio_id_fkey"
            columns: ["ministerio_id"]
            isOneToOne: false
            referencedRelation: "ministerios"
            referencedColumns: ["id"]
          },
        ]
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
          cor: string | null
          created_at: string
          data: string
          descricao: string | null
          hora_fim: string | null
          hora_inicio: string | null
          id: string
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
          updated_at: string
          visitante_id: string | null
        }
        Insert: {
          cor?: string | null
          created_at?: string
          data: string
          descricao?: string | null
          hora_fim?: string | null
          hora_inicio?: string | null
          id?: string
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
          updated_at?: string
          visitante_id?: string | null
        }
        Update: {
          cor?: string | null
          created_at?: string
          data?: string
          descricao?: string | null
          hora_fim?: string | null
          hora_inicio?: string | null
          id?: string
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
          updated_at?: string
          visitante_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eventos_visitante_id_fkey"
            columns: ["visitante_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
        ]
      }
      familias: {
        Row: {
          bairro: string | null
          cep: string | null
          cidade: string | null
          complemento: string | null
          congregacao_id: string | null
          created_at: string
          endereco: string | null
          id: string
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
          endereco?: string | null
          id?: string
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
          endereco?: string | null
          id?: string
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
        ]
      }
      locais: {
        Row: {
          acessibilidade: boolean
          ambiente: Database["public"]["Enums"]["local_ambiente"] | null
          area_m2: number | null
          capacidade: number | null
          created_at: string
          descricao: string | null
          id: string
          localizacao_interna:
            | Database["public"]["Enums"]["local_localizacao_interna"]
            | null
          mapa_url: string | null
          nome: string
          nome_completo: string | null
          observacoes: string | null
          pavimento: Database["public"]["Enums"]["local_pavimento"] | null
          permite_agendamento: boolean
          predio: Database["public"]["Enums"]["local_predio"] | null
          referencia_visual: string | null
          restricao_acesso: Database["public"]["Enums"]["local_restricao_acesso"]
          status: Database["public"]["Enums"]["local_status"]
          tipo: Database["public"]["Enums"]["local_tipo"]
          tipos_evento_permitidos: Database["public"]["Enums"]["evento_tipo"][]
          updated_at: string
          uso_principal: Database["public"]["Enums"]["local_uso"] | null
        }
        Insert: {
          acessibilidade?: boolean
          ambiente?: Database["public"]["Enums"]["local_ambiente"] | null
          area_m2?: number | null
          capacidade?: number | null
          created_at?: string
          descricao?: string | null
          id?: string
          localizacao_interna?:
            | Database["public"]["Enums"]["local_localizacao_interna"]
            | null
          mapa_url?: string | null
          nome: string
          nome_completo?: string | null
          observacoes?: string | null
          pavimento?: Database["public"]["Enums"]["local_pavimento"] | null
          permite_agendamento?: boolean
          predio?: Database["public"]["Enums"]["local_predio"] | null
          referencia_visual?: string | null
          restricao_acesso?: Database["public"]["Enums"]["local_restricao_acesso"]
          status?: Database["public"]["Enums"]["local_status"]
          tipo?: Database["public"]["Enums"]["local_tipo"]
          tipos_evento_permitidos?: Database["public"]["Enums"]["evento_tipo"][]
          updated_at?: string
          uso_principal?: Database["public"]["Enums"]["local_uso"] | null
        }
        Update: {
          acessibilidade?: boolean
          ambiente?: Database["public"]["Enums"]["local_ambiente"] | null
          area_m2?: number | null
          capacidade?: number | null
          created_at?: string
          descricao?: string | null
          id?: string
          localizacao_interna?:
            | Database["public"]["Enums"]["local_localizacao_interna"]
            | null
          mapa_url?: string | null
          nome?: string
          nome_completo?: string | null
          observacoes?: string | null
          pavimento?: Database["public"]["Enums"]["local_pavimento"] | null
          permite_agendamento?: boolean
          predio?: Database["public"]["Enums"]["local_predio"] | null
          referencia_visual?: string | null
          restricao_acesso?: Database["public"]["Enums"]["local_restricao_acesso"]
          status?: Database["public"]["Enums"]["local_status"]
          tipo?: Database["public"]["Enums"]["local_tipo"]
          tipos_evento_permitidos?: Database["public"]["Enums"]["evento_tipo"][]
          updated_at?: string
          uso_principal?: Database["public"]["Enums"]["local_uso"] | null
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
          cpf: string | null
          created_at: string
          created_by: string | null
          data_batismo: string | null
          data_casamento: string | null
          data_entrada: string | null
          data_nascimento: string | null
          email: string | null
          endereco: string | null
          estado_civil: Database["public"]["Enums"]["estado_civil"] | null
          external_id: string | null
          familia_id: string | null
          foto_url: string | null
          id: string
          nome_completo: string
          nome_social: string | null
          numero: string | null
          observacoes_pastorais: string | null
          parentesco: string | null
          perfil_acesso: Database["public"]["Enums"]["perfil_acesso"]
          quem_convidou_id: string | null
          responsavel_familiar: boolean
          responsavel_id: string | null
          rg: string | null
          sexo: Database["public"]["Enums"]["sexo"] | null
          status: Database["public"]["Enums"]["membro_status"]
          status_acolhimento:
            | Database["public"]["Enums"]["status_acolhimento_enum"]
            | null
          telefone_celular: string | null
          telefone_fixo: string | null
          tipo_pessoa: Database["public"]["Enums"]["tipo_pessoa"]
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
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          data_batismo?: string | null
          data_casamento?: string | null
          data_entrada?: string | null
          data_nascimento?: string | null
          email?: string | null
          endereco?: string | null
          estado_civil?: Database["public"]["Enums"]["estado_civil"] | null
          external_id?: string | null
          familia_id?: string | null
          foto_url?: string | null
          id?: string
          nome_completo: string
          nome_social?: string | null
          numero?: string | null
          observacoes_pastorais?: string | null
          parentesco?: string | null
          perfil_acesso?: Database["public"]["Enums"]["perfil_acesso"]
          quem_convidou_id?: string | null
          responsavel_familiar?: boolean
          responsavel_id?: string | null
          rg?: string | null
          sexo?: Database["public"]["Enums"]["sexo"] | null
          status?: Database["public"]["Enums"]["membro_status"]
          status_acolhimento?:
            | Database["public"]["Enums"]["status_acolhimento_enum"]
            | null
          telefone_celular?: string | null
          telefone_fixo?: string | null
          tipo_pessoa?: Database["public"]["Enums"]["tipo_pessoa"]
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
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          data_batismo?: string | null
          data_casamento?: string | null
          data_entrada?: string | null
          data_nascimento?: string | null
          email?: string | null
          endereco?: string | null
          estado_civil?: Database["public"]["Enums"]["estado_civil"] | null
          external_id?: string | null
          familia_id?: string | null
          foto_url?: string | null
          id?: string
          nome_completo?: string
          nome_social?: string | null
          numero?: string | null
          observacoes_pastorais?: string | null
          parentesco?: string | null
          perfil_acesso?: Database["public"]["Enums"]["perfil_acesso"]
          quem_convidou_id?: string | null
          responsavel_familiar?: boolean
          responsavel_id?: string | null
          rg?: string | null
          sexo?: Database["public"]["Enums"]["sexo"] | null
          status?: Database["public"]["Enums"]["membro_status"]
          status_acolhimento?:
            | Database["public"]["Enums"]["status_acolhimento_enum"]
            | null
          telefone_celular?: string | null
          telefone_fixo?: string | null
          tipo_pessoa?: Database["public"]["Enums"]["tipo_pessoa"]
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
            foreignKeyName: "membros_familia_id_fkey"
            columns: ["familia_id"]
            isOneToOne: false
            referencedRelation: "familias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membros_quem_convidou_id_fkey"
            columns: ["quem_convidou_id"]
            isOneToOne: false
            referencedRelation: "membros"
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
            foreignKeyName: "ministerio_membros_ministerio_id_fkey"
            columns: ["ministerio_id"]
            isOneToOne: false
            referencedRelation: "ministerios"
            referencedColumns: ["id"]
          },
        ]
      }
      ministerios: {
        Row: {
          ativo: boolean
          co_lider_id: string | null
          congregacao_id: string | null
          created_at: string
          data_fundacao: string | null
          descricao: string | null
          external_id: string | null
          id: string
          lider_id: string | null
          nome: string
          sigla: string | null
          updated_at: string
          vice_lider_id: string | null
        }
        Insert: {
          ativo?: boolean
          co_lider_id?: string | null
          congregacao_id?: string | null
          created_at?: string
          data_fundacao?: string | null
          descricao?: string | null
          external_id?: string | null
          id?: string
          lider_id?: string | null
          nome: string
          sigla?: string | null
          updated_at?: string
          vice_lider_id?: string | null
        }
        Update: {
          ativo?: boolean
          co_lider_id?: string | null
          congregacao_id?: string | null
          created_at?: string
          data_fundacao?: string | null
          descricao?: string | null
          external_id?: string | null
          id?: string
          lider_id?: string | null
          nome?: string
          sigla?: string | null
          updated_at?: string
          vice_lider_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ministerios_congregacao_id_fkey"
            columns: ["congregacao_id"]
            isOneToOne: false
            referencedRelation: "congregacoes"
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
            foreignKeyName: "ministerios_vice_lider_id_fkey"
            columns: ["vice_lider_id"]
            isOneToOne: false
            referencedRelation: "membros"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          nome: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
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
        ]
      }
      visitas: {
        Row: {
          acompanhado_por: string | null
          created_at: string
          data: string
          id: string
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
          membro_id?: string
          observacoes?: string | null
          origem?: string | null
          registrado_por?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
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
      app_role: "admin" | "secretaria" | "diakonia" | "lideranca"
      areas_ministerio_dia_reuniao_enum:
        | "Segunda"
        | "Terça"
        | "Quarta"
        | "Quinta"
        | "Sexta"
        | "Sábado"
        | "Domingo"
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
      eventos_status_evento_enum:
        | "Planejado"
        | "Em Andamento"
        | "Realizado"
        | "Cancelado"
        | "Reagendado"
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
      membro_status: "ativo" | "inativo" | "transferido" | "falecido"
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
        | "enteado"
        | "tutelado"
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
      tipo_pessoa: "membro" | "congregado" | "visitante" | "ex_membro"
      transferencias_inter_congregacao_status_transferencia_enum:
        | "Pendente"
        | "Em Análise"
        | "Aprovada"
        | "Concluída"
        | "Cancelada"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["admin", "secretaria", "diakonia", "lideranca"],
      areas_ministerio_dia_reuniao_enum: [
        "Segunda",
        "Terça",
        "Quarta",
        "Quinta",
        "Sexta",
        "Sábado",
        "Domingo",
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
      ],
      eventos_status_evento_enum: [
        "Planejado",
        "Em Andamento",
        "Realizado",
        "Cancelado",
        "Reagendado",
      ],
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
      membro_status: ["ativo", "inativo", "transferido", "falecido"],
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
        "enteado",
        "tutelado",
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
      tipo_pessoa: ["membro", "congregado", "visitante", "ex_membro"],
      transferencias_inter_congregacao_status_transferencia_enum: [
        "Pendente",
        "Em Análise",
        "Aprovada",
        "Concluída",
        "Cancelada",
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
