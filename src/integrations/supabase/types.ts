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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      atividades: {
        Row: {
          concluida: boolean
          conteudo: string | null
          created_at: string
          criar_meet: boolean
          data_atividade: string
          data_conclusao: string | null
          data_inicio: string | null
          descricao: string | null
          duracao_minutos: number | null
          erro_sincronizacao: string | null
          evento_automatico: boolean
          google_calendar_id: string | null
          google_event_id: string | null
          google_meet_link: string | null
          id: string
          oportunidade_id: string | null
          organizacao_id: string | null
          pessoa_id: string | null
          responsavel_id: string | null
          resultado: string | null
          sincronizado_em: string | null
          tipo: string
          tipo_id: string | null
          titulo: string
          updated_at: string
        }
        Insert: {
          concluida?: boolean
          conteudo?: string | null
          created_at?: string
          criar_meet?: boolean
          data_atividade?: string
          data_conclusao?: string | null
          data_inicio?: string | null
          descricao?: string | null
          duracao_minutos?: number | null
          erro_sincronizacao?: string | null
          evento_automatico?: boolean
          google_calendar_id?: string | null
          google_event_id?: string | null
          google_meet_link?: string | null
          id?: string
          oportunidade_id?: string | null
          organizacao_id?: string | null
          pessoa_id?: string | null
          responsavel_id?: string | null
          resultado?: string | null
          sincronizado_em?: string | null
          tipo: string
          tipo_id?: string | null
          titulo: string
          updated_at?: string
        }
        Update: {
          concluida?: boolean
          conteudo?: string | null
          created_at?: string
          criar_meet?: boolean
          data_atividade?: string
          data_conclusao?: string | null
          data_inicio?: string | null
          descricao?: string | null
          duracao_minutos?: number | null
          erro_sincronizacao?: string | null
          evento_automatico?: boolean
          google_calendar_id?: string | null
          google_event_id?: string | null
          google_meet_link?: string | null
          id?: string
          oportunidade_id?: string | null
          organizacao_id?: string | null
          pessoa_id?: string | null
          responsavel_id?: string | null
          resultado?: string | null
          sincronizado_em?: string | null
          tipo?: string
          tipo_id?: string | null
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "atividades_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "atividades_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "tipos_atividade"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          acao: string
          created_at: string | null
          dados_antes: Json | null
          dados_depois: Json | null
          id: string
          registro_id: string | null
          tabela: string
          user_id: string | null
        }
        Insert: {
          acao: string
          created_at?: string | null
          dados_antes?: Json | null
          dados_depois?: Json | null
          id?: string
          registro_id?: string | null
          tabela: string
          user_id?: string | null
        }
        Update: {
          acao?: string
          created_at?: string | null
          dados_antes?: Json | null
          dados_depois?: Json | null
          id?: string
          registro_id?: string | null
          tabela?: string
          user_id?: string | null
        }
        Relationships: []
      }
      config_montagem: {
        Row: {
          cidade_origem: string
          diaria_alimentacao: number
          diaria_hospedagem: number
          id: string
          margem_percentual: number
          updated_at: string
          updated_by: string | null
          valor_dia_colaborador: number
          valor_km: number
        }
        Insert: {
          cidade_origem?: string
          diaria_alimentacao?: number
          diaria_hospedagem?: number
          id?: string
          margem_percentual?: number
          updated_at?: string
          updated_by?: string | null
          valor_dia_colaborador?: number
          valor_km?: number
        }
        Update: {
          cidade_origem?: string
          diaria_alimentacao?: number
          diaria_hospedagem?: number
          id?: string
          margem_percentual?: number
          updated_at?: string
          updated_by?: string | null
          valor_dia_colaborador?: number
          valor_km?: number
        }
        Relationships: []
      }
      dossie_contatos: {
        Row: {
          atualizado_em: string
          cargo: string | null
          criado_em: string
          decisor_nivel: number | null
          dossie_id: string
          email: string | null
          id: string
          nome: string
          observacoes: string | null
          telefone: string | null
        }
        Insert: {
          atualizado_em?: string
          cargo?: string | null
          criado_em?: string
          decisor_nivel?: number | null
          dossie_id: string
          email?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          telefone?: string | null
        }
        Update: {
          atualizado_em?: string
          cargo?: string | null
          criado_em?: string
          decisor_nivel?: number | null
          dossie_id?: string
          email?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          telefone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dossie_contatos_dossie_id_fkey"
            columns: ["dossie_id"]
            isOneToOne: false
            referencedRelation: "dossies_sementeiras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossie_contatos_dossie_id_fkey"
            columns: ["dossie_id"]
            isOneToOne: false
            referencedRelation: "vw_dossie_resumo"
            referencedColumns: ["id"]
          },
        ]
      }
      dossie_equipamentos: {
        Row: {
          ano_aproximado: number | null
          capacidade: string | null
          criado_em: string
          dossie_id: string
          estado_conservacao:
            | Database["public"]["Enums"]["equipamento_estado"]
            | null
          id: string
          marca: string | null
          modelo: string | null
          observacoes: string | null
        }
        Insert: {
          ano_aproximado?: number | null
          capacidade?: string | null
          criado_em?: string
          dossie_id: string
          estado_conservacao?:
            | Database["public"]["Enums"]["equipamento_estado"]
            | null
          id?: string
          marca?: string | null
          modelo?: string | null
          observacoes?: string | null
        }
        Update: {
          ano_aproximado?: number | null
          capacidade?: string | null
          criado_em?: string
          dossie_id?: string
          estado_conservacao?:
            | Database["public"]["Enums"]["equipamento_estado"]
            | null
          id?: string
          marca?: string | null
          modelo?: string | null
          observacoes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dossie_equipamentos_dossie_id_fkey"
            columns: ["dossie_id"]
            isOneToOne: false
            referencedRelation: "dossies_sementeiras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossie_equipamentos_dossie_id_fkey"
            columns: ["dossie_id"]
            isOneToOne: false
            referencedRelation: "vw_dossie_resumo"
            referencedColumns: ["id"]
          },
        ]
      }
      dossie_interacoes: {
        Row: {
          autor_id: string | null
          confianca_extracao: number | null
          conteudo_bruto: string | null
          conteudo_estruturado: Json | null
          criada_em: string
          dossie_id: string
          id: string
          mensagem_whatsapp_id: string | null
          ocorrida_em: string
          tipo: Database["public"]["Enums"]["interacao_tipo"]
        }
        Insert: {
          autor_id?: string | null
          confianca_extracao?: number | null
          conteudo_bruto?: string | null
          conteudo_estruturado?: Json | null
          criada_em?: string
          dossie_id: string
          id?: string
          mensagem_whatsapp_id?: string | null
          ocorrida_em?: string
          tipo: Database["public"]["Enums"]["interacao_tipo"]
        }
        Update: {
          autor_id?: string | null
          confianca_extracao?: number | null
          conteudo_bruto?: string | null
          conteudo_estruturado?: Json | null
          criada_em?: string
          dossie_id?: string
          id?: string
          mensagem_whatsapp_id?: string | null
          ocorrida_em?: string
          tipo?: Database["public"]["Enums"]["interacao_tipo"]
        }
        Relationships: [
          {
            foreignKeyName: "dossie_interacoes_dossie_id_fkey"
            columns: ["dossie_id"]
            isOneToOne: false
            referencedRelation: "dossies_sementeiras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossie_interacoes_dossie_id_fkey"
            columns: ["dossie_id"]
            isOneToOne: false
            referencedRelation: "vw_dossie_resumo"
            referencedColumns: ["id"]
          },
        ]
      }
      dossie_midias: {
        Row: {
          criada_em: string
          dossie_id: string
          id: string
          interacao_id: string | null
          legenda: string | null
          metadados: Json | null
          tipo_midia: string
          url_publica: string | null
          url_storage: string
        }
        Insert: {
          criada_em?: string
          dossie_id: string
          id?: string
          interacao_id?: string | null
          legenda?: string | null
          metadados?: Json | null
          tipo_midia: string
          url_publica?: string | null
          url_storage: string
        }
        Update: {
          criada_em?: string
          dossie_id?: string
          id?: string
          interacao_id?: string | null
          legenda?: string | null
          metadados?: Json | null
          tipo_midia?: string
          url_publica?: string | null
          url_storage?: string
        }
        Relationships: [
          {
            foreignKeyName: "dossie_midias_dossie_id_fkey"
            columns: ["dossie_id"]
            isOneToOne: false
            referencedRelation: "dossies_sementeiras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossie_midias_dossie_id_fkey"
            columns: ["dossie_id"]
            isOneToOne: false
            referencedRelation: "vw_dossie_resumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dossie_midias_interacao_id_fkey"
            columns: ["interacao_id"]
            isOneToOne: false
            referencedRelation: "dossie_interacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      dossies_sementeiras: {
        Row: {
          ano_fundacao: number | null
          atualizado_em: string
          cidade: string | null
          cnpj: string | null
          confianca_dados: number
          criado_em: string
          criado_por: string | null
          culturas: string[] | null
          endereco: string | null
          estado: string
          faturamento_bucket: string | null
          id: string
          interesse_smartcycle: boolean | null
          latitude: number | null
          longitude: number | null
          maturidade_lead: Database["public"]["Enums"]["dossie_maturidade"]
          motivo_revisao: string | null
          nome_fantasia: string
          numero_funcionarios_bucket: string | null
          observacoes: string | null
          origem: string
          pipedrive_enviado_em: string | null
          pipedrive_lead_id: string | null
          precisa_revisao: boolean
          prioridade: Database["public"]["Enums"]["dossie_prioridade"] | null
          razao_social: string | null
          responsavel_id: string | null
          status: Database["public"]["Enums"]["dossie_status"]
          ultima_interacao_em: string | null
          volume_anual_sacos: number | null
          volume_eh_estimativa: boolean | null
        }
        Insert: {
          ano_fundacao?: number | null
          atualizado_em?: string
          cidade?: string | null
          cnpj?: string | null
          confianca_dados?: number
          criado_em?: string
          criado_por?: string | null
          culturas?: string[] | null
          endereco?: string | null
          estado?: string
          faturamento_bucket?: string | null
          id?: string
          interesse_smartcycle?: boolean | null
          latitude?: number | null
          longitude?: number | null
          maturidade_lead?: Database["public"]["Enums"]["dossie_maturidade"]
          motivo_revisao?: string | null
          nome_fantasia: string
          numero_funcionarios_bucket?: string | null
          observacoes?: string | null
          origem?: string
          pipedrive_enviado_em?: string | null
          pipedrive_lead_id?: string | null
          precisa_revisao?: boolean
          prioridade?: Database["public"]["Enums"]["dossie_prioridade"] | null
          razao_social?: string | null
          responsavel_id?: string | null
          status?: Database["public"]["Enums"]["dossie_status"]
          ultima_interacao_em?: string | null
          volume_anual_sacos?: number | null
          volume_eh_estimativa?: boolean | null
        }
        Update: {
          ano_fundacao?: number | null
          atualizado_em?: string
          cidade?: string | null
          cnpj?: string | null
          confianca_dados?: number
          criado_em?: string
          criado_por?: string | null
          culturas?: string[] | null
          endereco?: string | null
          estado?: string
          faturamento_bucket?: string | null
          id?: string
          interesse_smartcycle?: boolean | null
          latitude?: number | null
          longitude?: number | null
          maturidade_lead?: Database["public"]["Enums"]["dossie_maturidade"]
          motivo_revisao?: string | null
          nome_fantasia?: string
          numero_funcionarios_bucket?: string | null
          observacoes?: string | null
          origem?: string
          pipedrive_enviado_em?: string | null
          pipedrive_lead_id?: string | null
          precisa_revisao?: boolean
          prioridade?: Database["public"]["Enums"]["dossie_prioridade"] | null
          razao_social?: string | null
          responsavel_id?: string | null
          status?: Database["public"]["Enums"]["dossie_status"]
          ultima_interacao_em?: string | null
          volume_anual_sacos?: number | null
          volume_eh_estimativa?: boolean | null
        }
        Relationships: []
      }
      equipamento_contidos: {
        Row: {
          created_at: string
          equipamento_filho_id: string
          equipamento_pai_id: string
          id: string
        }
        Insert: {
          created_at?: string
          equipamento_filho_id: string
          equipamento_pai_id: string
          id?: string
        }
        Update: {
          created_at?: string
          equipamento_filho_id?: string
          equipamento_pai_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipamento_contidos_equipamento_filho_id_fkey"
            columns: ["equipamento_filho_id"]
            isOneToOne: false
            referencedRelation: "equipamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipamento_contidos_equipamento_filho_id_fkey"
            columns: ["equipamento_filho_id"]
            isOneToOne: false
            referencedRelation: "vw_layout_completo"
            referencedColumns: ["equipamento_id"]
          },
          {
            foreignKeyName: "equipamento_contidos_equipamento_pai_id_fkey"
            columns: ["equipamento_pai_id"]
            isOneToOne: false
            referencedRelation: "equipamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipamento_contidos_equipamento_pai_id_fkey"
            columns: ["equipamento_pai_id"]
            isOneToOne: false
            referencedRelation: "vw_layout_completo"
            referencedColumns: ["equipamento_id"]
          },
        ]
      }
      equipamentos: {
        Row: {
          altura_mm: number | null
          ativo: boolean | null
          categoria: string | null
          codigo: string
          comprimento_mm: number | null
          cor_categoria: string | null
          created_at: string | null
          descricao: string
          dias_montagem_padrao: number
          glb_rotacao_x: number
          glb_rotacao_z: number
          id: string
          imagem_url: string | null
          largura_mm: number | null
          modelo_3d_url: string | null
          valor_custo: number
          valor_venda: number | null
        }
        Insert: {
          altura_mm?: number | null
          ativo?: boolean | null
          categoria?: string | null
          codigo: string
          comprimento_mm?: number | null
          cor_categoria?: string | null
          created_at?: string | null
          descricao: string
          dias_montagem_padrao?: number
          glb_rotacao_x?: number
          glb_rotacao_z?: number
          id?: string
          imagem_url?: string | null
          largura_mm?: number | null
          modelo_3d_url?: string | null
          valor_custo: number
          valor_venda?: number | null
        }
        Update: {
          altura_mm?: number | null
          ativo?: boolean | null
          categoria?: string | null
          codigo?: string
          comprimento_mm?: number | null
          cor_categoria?: string | null
          created_at?: string | null
          descricao?: string
          dias_montagem_padrao?: number
          glb_rotacao_x?: number
          glb_rotacao_z?: number
          id?: string
          imagem_url?: string | null
          largura_mm?: number | null
          modelo_3d_url?: string | null
          valor_custo?: number
          valor_venda?: number | null
        }
        Relationships: []
      }
      estados: {
        Row: {
          ativo: boolean | null
          codigo_ibge: string | null
          created_at: string | null
          id: string
          nome: string
          regiao: string | null
          sigla: string
        }
        Insert: {
          ativo?: boolean | null
          codigo_ibge?: string | null
          created_at?: string | null
          id?: string
          nome: string
          regiao?: string | null
          sigla: string
        }
        Update: {
          ativo?: boolean | null
          codigo_ibge?: string | null
          created_at?: string | null
          id?: string
          nome?: string
          regiao?: string | null
          sigla?: string
        }
        Relationships: []
      }
      etapas_pipeline: {
        Row: {
          cor: string | null
          created_at: string
          e_final: boolean
          e_ganho: boolean
          id: string
          nome: string
          ordem: number
          pipeline_id: string
          probabilidade_default: number
          rotting_days: number
        }
        Insert: {
          cor?: string | null
          created_at?: string
          e_final?: boolean
          e_ganho?: boolean
          id?: string
          nome: string
          ordem: number
          pipeline_id: string
          probabilidade_default?: number
          rotting_days?: number
        }
        Update: {
          cor?: string | null
          created_at?: string
          e_final?: boolean
          e_ganho?: boolean
          id?: string
          nome?: string
          ordem?: number
          pipeline_id?: string
          probabilidade_default?: number
          rotting_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "etapas_pipeline_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      formas_pagamento: {
        Row: {
          ativo: boolean
          created_at: string
          desconto_padrao_pct: number | null
          descricao_proposta: string
          id: string
          nome: string
          ordem: number
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          desconto_padrao_pct?: number | null
          descricao_proposta: string
          id?: string
          nome: string
          ordem?: number
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          desconto_padrao_pct?: number | null
          descricao_proposta?: string
          id?: string
          nome?: string
          ordem?: number
          updated_at?: string
        }
        Relationships: []
      }
      google_integration_tokens: {
        Row: {
          access_token: string
          created_at: string
          expires_at: string
          google_email: string | null
          id: string
          refresh_token: string
          scope: string | null
          token_type: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          expires_at: string
          google_email?: string | null
          id?: string
          refresh_token: string
          scope?: string | null
          token_type?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          expires_at?: string
          google_email?: string | null
          id?: string
          refresh_token?: string
          scope?: string | null
          token_type?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      historico_oportunidade: {
        Row: {
          created_at: string
          id: string
          oportunidade_id: string
          tipo_mudanca: string
          usuario_id: string | null
          valor_anterior: Json | null
          valor_novo: Json | null
        }
        Insert: {
          created_at?: string
          id?: string
          oportunidade_id: string
          tipo_mudanca: string
          usuario_id?: string | null
          valor_anterior?: Json | null
          valor_novo?: Json | null
        }
        Update: {
          created_at?: string
          id?: string
          oportunidade_id?: string
          tipo_mudanca?: string
          usuario_id?: string | null
          valor_anterior?: Json | null
          valor_novo?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "historico_oportunidade_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "oportunidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historico_oportunidade_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "oportunidades_sem_valores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historico_oportunidade_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "v_oportunidades_kanban"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historico_oportunidade_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "v_oportunidades_kanban_sem_valores"
            referencedColumns: ["id"]
          },
        ]
      }
      itens_reforma: {
        Row: {
          ativo: boolean
          categoria: string
          codigo: string
          created_at: string
          descricao: string
          id: string
          ordem: number
          updated_at: string
          valor: number
        }
        Insert: {
          ativo?: boolean
          categoria: string
          codigo: string
          created_at?: string
          descricao: string
          id?: string
          ordem?: number
          updated_at?: string
          valor?: number
        }
        Update: {
          ativo?: boolean
          categoria?: string
          codigo?: string
          created_at?: string
          descricao?: string
          id?: string
          ordem?: number
          updated_at?: string
          valor?: number
        }
        Relationships: []
      }
      layout_conexoes: {
        Row: {
          created_at: string
          id: string
          item_destino_id: string
          item_origem_id: string
          layout_id: string
          ponto_destino_x_mm: number
          ponto_destino_y_mm: number
          ponto_destino_z_mm: number
          ponto_origem_x_mm: number
          ponto_origem_y_mm: number
          ponto_origem_z_mm: number
        }
        Insert: {
          created_at?: string
          id?: string
          item_destino_id: string
          item_origem_id: string
          layout_id: string
          ponto_destino_x_mm?: number
          ponto_destino_y_mm?: number
          ponto_destino_z_mm?: number
          ponto_origem_x_mm?: number
          ponto_origem_y_mm?: number
          ponto_origem_z_mm?: number
        }
        Update: {
          created_at?: string
          id?: string
          item_destino_id?: string
          item_origem_id?: string
          layout_id?: string
          ponto_destino_x_mm?: number
          ponto_destino_y_mm?: number
          ponto_destino_z_mm?: number
          ponto_origem_x_mm?: number
          ponto_origem_y_mm?: number
          ponto_origem_z_mm?: number
        }
        Relationships: [
          {
            foreignKeyName: "layout_conexoes_item_destino_id_fkey"
            columns: ["item_destino_id"]
            isOneToOne: false
            referencedRelation: "layout_equipamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "layout_conexoes_item_destino_id_fkey"
            columns: ["item_destino_id"]
            isOneToOne: false
            referencedRelation: "vw_layout_completo"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "layout_conexoes_item_origem_id_fkey"
            columns: ["item_origem_id"]
            isOneToOne: false
            referencedRelation: "layout_equipamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "layout_conexoes_item_origem_id_fkey"
            columns: ["item_origem_id"]
            isOneToOne: false
            referencedRelation: "vw_layout_completo"
            referencedColumns: ["item_id"]
          },
          {
            foreignKeyName: "layout_conexoes_layout_id_fkey"
            columns: ["layout_id"]
            isOneToOne: false
            referencedRelation: "layouts"
            referencedColumns: ["id"]
          },
        ]
      }
      layout_equipamentos: {
        Row: {
          created_at: string
          equipamento_id: string
          id: string
          layout_id: string
          ordem: number
          pos_x_mm: number
          pos_y_mm: number
          pos_z_mm: number
          rotacao: number
          rotulo_customizado: string | null
        }
        Insert: {
          created_at?: string
          equipamento_id: string
          id?: string
          layout_id: string
          ordem?: number
          pos_x_mm?: number
          pos_y_mm?: number
          pos_z_mm?: number
          rotacao?: number
          rotulo_customizado?: string | null
        }
        Update: {
          created_at?: string
          equipamento_id?: string
          id?: string
          layout_id?: string
          ordem?: number
          pos_x_mm?: number
          pos_y_mm?: number
          pos_z_mm?: number
          rotacao?: number
          rotulo_customizado?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "layout_equipamentos_equipamento_id_fkey"
            columns: ["equipamento_id"]
            isOneToOne: false
            referencedRelation: "equipamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "layout_equipamentos_equipamento_id_fkey"
            columns: ["equipamento_id"]
            isOneToOne: false
            referencedRelation: "vw_layout_completo"
            referencedColumns: ["equipamento_id"]
          },
          {
            foreignKeyName: "layout_equipamentos_layout_id_fkey"
            columns: ["layout_id"]
            isOneToOne: false
            referencedRelation: "layouts"
            referencedColumns: ["id"]
          },
        ]
      }
      layouts: {
        Row: {
          cidade: string | null
          cliente: string | null
          created_at: string
          created_by: string | null
          id: string
          observacoes: string | null
          organizacao_id: string | null
          origem_id: string
          origem_tipo: string
          piso_comprimento_mm: number
          piso_imagem_opacidade: number
          piso_imagem_url: string | null
          piso_largura_mm: number
          revisao: string
          status: string
          unidade: string | null
          updated_at: string
        }
        Insert: {
          cidade?: string | null
          cliente?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          observacoes?: string | null
          organizacao_id?: string | null
          origem_id: string
          origem_tipo: string
          piso_comprimento_mm?: number
          piso_imagem_opacidade?: number
          piso_imagem_url?: string | null
          piso_largura_mm?: number
          revisao?: string
          status?: string
          unidade?: string | null
          updated_at?: string
        }
        Update: {
          cidade?: string | null
          cliente?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          observacoes?: string | null
          organizacao_id?: string | null
          origem_id?: string
          origem_tipo?: string
          piso_comprimento_mm?: number
          piso_imagem_opacidade?: number
          piso_imagem_url?: string | null
          piso_largura_mm?: number
          revisao?: string
          status?: string
          unidade?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "layouts_organizacao_id_fkey"
            columns: ["organizacao_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      leads_rd: {
        Row: {
          cargo: string | null
          cidade: string | null
          conversion_identifier: string | null
          convertido_em: string | null
          convertido_por: string | null
          created_at: string
          criado_em_rd: string | null
          descartado_motivo: string | null
          email: string | null
          empresa: string | null
          estado: string | null
          id: string
          nome: string | null
          oportunidade_id: string | null
          organizacao_id: string | null
          payload: Json | null
          rd_uuid: string | null
          recebido_em: string
          status: string
          telefone: string | null
          updated_at: string
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          cargo?: string | null
          cidade?: string | null
          conversion_identifier?: string | null
          convertido_em?: string | null
          convertido_por?: string | null
          created_at?: string
          criado_em_rd?: string | null
          descartado_motivo?: string | null
          email?: string | null
          empresa?: string | null
          estado?: string | null
          id?: string
          nome?: string | null
          oportunidade_id?: string | null
          organizacao_id?: string | null
          payload?: Json | null
          rd_uuid?: string | null
          recebido_em?: string
          status?: string
          telefone?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          cargo?: string | null
          cidade?: string | null
          conversion_identifier?: string | null
          convertido_em?: string | null
          convertido_por?: string | null
          created_at?: string
          criado_em_rd?: string | null
          descartado_motivo?: string | null
          email?: string | null
          empresa?: string | null
          estado?: string | null
          id?: string
          nome?: string | null
          oportunidade_id?: string | null
          organizacao_id?: string | null
          payload?: Json | null
          rd_uuid?: string | null
          recebido_em?: string
          status?: string
          telefone?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: []
      }
      migracao_clientes_log: {
        Row: {
          cliente_data: Json | null
          cliente_id: string | null
          id: string
          migrado_em: string
          organizacao_id: string | null
        }
        Insert: {
          cliente_data?: Json | null
          cliente_id?: string | null
          id?: string
          migrado_em?: string
          organizacao_id?: string | null
        }
        Update: {
          cliente_data?: Json | null
          cliente_id?: string | null
          id?: string
          migrado_em?: string
          organizacao_id?: string | null
        }
        Relationships: []
      }
      oportunidade_pessoas: {
        Row: {
          created_at: string
          id: string
          oportunidade_id: string
          papel: string | null
          pessoa_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          oportunidade_id: string
          papel?: string | null
          pessoa_id: string
        }
        Update: {
          created_at?: string
          id?: string
          oportunidade_id?: string
          papel?: string | null
          pessoa_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oportunidade_pessoas_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "oportunidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidade_pessoas_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "oportunidades_sem_valores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidade_pessoas_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "v_oportunidades_kanban"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidade_pessoas_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "v_oportunidades_kanban_sem_valores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidade_pessoas_pessoa_id_fkey"
            columns: ["pessoa_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
        ]
      }
      oportunidades: {
        Row: {
          concorrente_vencedor: string | null
          created_at: string
          data_fechamento_prevista: string | null
          data_fechamento_real: string | null
          etapa_id: string
          id: string
          motivo_perda: string | null
          notas: string | null
          observacoes: string | null
          ordem_coluna: number | null
          organizacao_id: string
          pipeline_id: string
          probabilidade: number
          proposta_id: string | null
          proxima_atividade_em: string | null
          responsavel_id: string | null
          status: string
          titulo: string
          ultima_atividade_em: string | null
          updated_at: string
          valor_estimado: number
        }
        Insert: {
          concorrente_vencedor?: string | null
          created_at?: string
          data_fechamento_prevista?: string | null
          data_fechamento_real?: string | null
          etapa_id: string
          id?: string
          motivo_perda?: string | null
          notas?: string | null
          observacoes?: string | null
          ordem_coluna?: number | null
          organizacao_id: string
          pipeline_id: string
          probabilidade?: number
          proposta_id?: string | null
          proxima_atividade_em?: string | null
          responsavel_id?: string | null
          status?: string
          titulo: string
          ultima_atividade_em?: string | null
          updated_at?: string
          valor_estimado?: number
        }
        Update: {
          concorrente_vencedor?: string | null
          created_at?: string
          data_fechamento_prevista?: string | null
          data_fechamento_real?: string | null
          etapa_id?: string
          id?: string
          motivo_perda?: string | null
          notas?: string | null
          observacoes?: string | null
          ordem_coluna?: number | null
          organizacao_id?: string
          pipeline_id?: string
          probabilidade?: number
          proposta_id?: string | null
          proxima_atividade_em?: string | null
          responsavel_id?: string | null
          status?: string
          titulo?: string
          ultima_atividade_em?: string | null
          updated_at?: string
          valor_estimado?: number
        }
        Relationships: [
          {
            foreignKeyName: "oportunidades_etapa_id_fkey"
            columns: ["etapa_id"]
            isOneToOne: false
            referencedRelation: "etapas_pipeline"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidades_etapa_id_fkey"
            columns: ["etapa_id"]
            isOneToOne: false
            referencedRelation: "v_relatorio_tempo_etapa"
            referencedColumns: ["etapa_id"]
          },
          {
            foreignKeyName: "oportunidades_organizacao_id_fkey"
            columns: ["organizacao_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidades_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidades_proposta_id_fkey"
            columns: ["proposta_id"]
            isOneToOne: false
            referencedRelation: "propostas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidades_proposta_id_fkey"
            columns: ["proposta_id"]
            isOneToOne: false
            referencedRelation: "propostas_sem_valores"
            referencedColumns: ["id"]
          },
        ]
      }
      orcamentos: {
        Row: {
          cliente_cnpj: string | null
          cliente_email: string | null
          cliente_endereco: string | null
          cliente_telefone: string | null
          condicoes_pagamento: string | null
          contato_nome: string | null
          created_at: string
          dados_congelados: boolean
          desconto_tipo: string
          desconto_valor: number
          forma_pagamento_id: string | null
          frete: number
          id: string
          itens: Json
          local_entrega: string | null
          montagem_custo_total: number
          montagem_dias: number
          montagem_eh_fazenda: boolean
          montagem_km_hotel_local: number
          montagem_km_origem_destino: number
          montagem_margem_aplicada: number
          montagem_numero_colaboradores: number
          montagem_numero_veiculos: number
          montagem_observacoes: string | null
          montagem_preco_total: number
          nome_cliente: string
          numero_orcamento: string | null
          observacoes: string | null
          oportunidade_id: string | null
          organizacao_id: string | null
          pessoa_contato_id: string | null
          prazo_entrega: string | null
          responsavel_id: string | null
          status: string | null
          subtotal: number
          total: number
          updated_at: string
          validade_dias: number | null
        }
        Insert: {
          cliente_cnpj?: string | null
          cliente_email?: string | null
          cliente_endereco?: string | null
          cliente_telefone?: string | null
          condicoes_pagamento?: string | null
          contato_nome?: string | null
          created_at?: string
          dados_congelados?: boolean
          desconto_tipo?: string
          desconto_valor?: number
          forma_pagamento_id?: string | null
          frete?: number
          id?: string
          itens?: Json
          local_entrega?: string | null
          montagem_custo_total?: number
          montagem_dias?: number
          montagem_eh_fazenda?: boolean
          montagem_km_hotel_local?: number
          montagem_km_origem_destino?: number
          montagem_margem_aplicada?: number
          montagem_numero_colaboradores?: number
          montagem_numero_veiculos?: number
          montagem_observacoes?: string | null
          montagem_preco_total?: number
          nome_cliente: string
          numero_orcamento?: string | null
          observacoes?: string | null
          oportunidade_id?: string | null
          organizacao_id?: string | null
          pessoa_contato_id?: string | null
          prazo_entrega?: string | null
          responsavel_id?: string | null
          status?: string | null
          subtotal?: number
          total?: number
          updated_at?: string
          validade_dias?: number | null
        }
        Update: {
          cliente_cnpj?: string | null
          cliente_email?: string | null
          cliente_endereco?: string | null
          cliente_telefone?: string | null
          condicoes_pagamento?: string | null
          contato_nome?: string | null
          created_at?: string
          dados_congelados?: boolean
          desconto_tipo?: string
          desconto_valor?: number
          forma_pagamento_id?: string | null
          frete?: number
          id?: string
          itens?: Json
          local_entrega?: string | null
          montagem_custo_total?: number
          montagem_dias?: number
          montagem_eh_fazenda?: boolean
          montagem_km_hotel_local?: number
          montagem_km_origem_destino?: number
          montagem_margem_aplicada?: number
          montagem_numero_colaboradores?: number
          montagem_numero_veiculos?: number
          montagem_observacoes?: string | null
          montagem_preco_total?: number
          nome_cliente?: string
          numero_orcamento?: string | null
          observacoes?: string | null
          oportunidade_id?: string | null
          organizacao_id?: string | null
          pessoa_contato_id?: string | null
          prazo_entrega?: string | null
          responsavel_id?: string | null
          status?: string | null
          subtotal?: number
          total?: number
          updated_at?: string
          validade_dias?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orcamentos_forma_pagamento_id_fkey"
            columns: ["forma_pagamento_id"]
            isOneToOne: false
            referencedRelation: "formas_pagamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orcamentos_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "oportunidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orcamentos_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "oportunidades_sem_valores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orcamentos_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "v_oportunidades_kanban"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orcamentos_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "v_oportunidades_kanban_sem_valores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orcamentos_organizacao_id_fkey"
            columns: ["organizacao_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orcamentos_pessoa_contato_id_fkey"
            columns: ["pessoa_contato_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
        ]
      }
      orcamentos_reforma: {
        Row: {
          cliente_cnpj: string | null
          cliente_email: string | null
          cliente_endereco: string | null
          cliente_telefone: string | null
          condicoes_pagamento: string | null
          contato_nome: string | null
          created_at: string
          dados_congelados: boolean
          desconto_tipo: string
          desconto_valor: number
          frete: number
          id: string
          itens: Json
          local_entrega: string | null
          nome_cliente: string
          numero_orcamento: string | null
          observacoes: string | null
          oportunidade_id: string | null
          organizacao_id: string | null
          prazo_entrega: string | null
          responsavel_id: string | null
          status: string | null
          subtotal: number
          total: number
          updated_at: string
          validade_dias: number | null
        }
        Insert: {
          cliente_cnpj?: string | null
          cliente_email?: string | null
          cliente_endereco?: string | null
          cliente_telefone?: string | null
          condicoes_pagamento?: string | null
          contato_nome?: string | null
          created_at?: string
          dados_congelados?: boolean
          desconto_tipo?: string
          desconto_valor?: number
          frete?: number
          id?: string
          itens?: Json
          local_entrega?: string | null
          nome_cliente: string
          numero_orcamento?: string | null
          observacoes?: string | null
          oportunidade_id?: string | null
          organizacao_id?: string | null
          prazo_entrega?: string | null
          responsavel_id?: string | null
          status?: string | null
          subtotal?: number
          total?: number
          updated_at?: string
          validade_dias?: number | null
        }
        Update: {
          cliente_cnpj?: string | null
          cliente_email?: string | null
          cliente_endereco?: string | null
          cliente_telefone?: string | null
          condicoes_pagamento?: string | null
          contato_nome?: string | null
          created_at?: string
          dados_congelados?: boolean
          desconto_tipo?: string
          desconto_valor?: number
          frete?: number
          id?: string
          itens?: Json
          local_entrega?: string | null
          nome_cliente?: string
          numero_orcamento?: string | null
          observacoes?: string | null
          oportunidade_id?: string | null
          organizacao_id?: string | null
          prazo_entrega?: string | null
          responsavel_id?: string | null
          status?: string | null
          subtotal?: number
          total?: number
          updated_at?: string
          validade_dias?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orcamentos_reforma_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "oportunidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orcamentos_reforma_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "oportunidades_sem_valores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orcamentos_reforma_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "v_oportunidades_kanban"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orcamentos_reforma_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "v_oportunidades_kanban_sem_valores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orcamentos_reforma_organizacao_id_fkey"
            columns: ["organizacao_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      organizacoes: {
        Row: {
          cidade: string | null
          cnpj: string | null
          created_at: string
          email_principal: string | null
          endereco: string | null
          estado: string | null
          estado_id: string | null
          id: string
          nome: string
          nome_fantasia: string | null
          observacoes: string | null
          porte: string | null
          regiao: string | null
          responsavel_id: string | null
          segmento: string | null
          site: string | null
          status: string
          tags: string[]
          telefone_principal: string | null
          updated_at: string
        }
        Insert: {
          cidade?: string | null
          cnpj?: string | null
          created_at?: string
          email_principal?: string | null
          endereco?: string | null
          estado?: string | null
          estado_id?: string | null
          id?: string
          nome: string
          nome_fantasia?: string | null
          observacoes?: string | null
          porte?: string | null
          regiao?: string | null
          responsavel_id?: string | null
          segmento?: string | null
          site?: string | null
          status?: string
          tags?: string[]
          telefone_principal?: string | null
          updated_at?: string
        }
        Update: {
          cidade?: string | null
          cnpj?: string | null
          created_at?: string
          email_principal?: string | null
          endereco?: string | null
          estado?: string | null
          estado_id?: string | null
          id?: string
          nome?: string
          nome_fantasia?: string | null
          observacoes?: string | null
          porte?: string | null
          regiao?: string | null
          responsavel_id?: string | null
          segmento?: string | null
          site?: string | null
          status?: string
          tags?: string[]
          telefone_principal?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizacoes_estado_id_fkey"
            columns: ["estado_id"]
            isOneToOne: false
            referencedRelation: "estados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizacoes_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      pessoas: {
        Row: {
          cargo: string | null
          celular: string | null
          created_at: string
          e_decisor: boolean
          email: string | null
          id: string
          linkedin: string | null
          nome: string
          observacoes: string | null
          organizacao_id: string | null
          responsavel_id: string | null
          telefone: string | null
          updated_at: string
        }
        Insert: {
          cargo?: string | null
          celular?: string | null
          created_at?: string
          e_decisor?: boolean
          email?: string | null
          id?: string
          linkedin?: string | null
          nome: string
          observacoes?: string | null
          organizacao_id?: string | null
          responsavel_id?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          cargo?: string | null
          celular?: string | null
          created_at?: string
          e_decisor?: boolean
          email?: string | null
          id?: string
          linkedin?: string | null
          nome?: string
          observacoes?: string | null
          organizacao_id?: string | null
          responsavel_id?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pessoas_organizacao_id_fkey"
            columns: ["organizacao_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pessoas_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      pipelines: {
        Row: {
          ativo: boolean
          cor: string
          created_at: string
          descricao: string | null
          id: string
          nome: string
          ordem: number | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cor?: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          ordem?: number | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cor?: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          ordem?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          email: string
          id: string
          nome: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          email: string
          id?: string
          nome?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          email?: string
          id?: string
          nome?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      propostas: {
        Row: {
          cliente_cnpj: string | null
          cliente_email: string | null
          cliente_endereco: string | null
          cliente_telefone: string | null
          contato_nome: string | null
          created_at: string
          dados_congelados: boolean
          divida: number
          entrada: number
          id: string
          itens_projeto: Json | null
          local_entrega: string | null
          mensalidade_f1: number
          mensalidade_f2: number
          nome_cliente: string
          numero_proposta: string | null
          observacoes: string | null
          oportunidade_id: string | null
          organizacao_id: string | null
          peso_saco: number
          pessoa_contato_id: string | null
          reajuste_anual: number
          responsavel_id: string | null
          status: string | null
          tarifa_excedente: number
          tarifa_f1: number
          tarifa_f2: number
          total_10_anos: number
          updated_at: string
          validade_dias: number | null
          valor_projeto: number
          vol_min_f2_pct: number
          volume_minimo_calculado: number
        }
        Insert: {
          cliente_cnpj?: string | null
          cliente_email?: string | null
          cliente_endereco?: string | null
          cliente_telefone?: string | null
          contato_nome?: string | null
          created_at?: string
          dados_congelados?: boolean
          divida: number
          entrada: number
          id?: string
          itens_projeto?: Json | null
          local_entrega?: string | null
          mensalidade_f1: number
          mensalidade_f2: number
          nome_cliente: string
          numero_proposta?: string | null
          observacoes?: string | null
          oportunidade_id?: string | null
          organizacao_id?: string | null
          peso_saco?: number
          pessoa_contato_id?: string | null
          reajuste_anual: number
          responsavel_id?: string | null
          status?: string | null
          tarifa_excedente: number
          tarifa_f1: number
          tarifa_f2: number
          total_10_anos: number
          updated_at?: string
          validade_dias?: number | null
          valor_projeto: number
          vol_min_f2_pct?: number
          volume_minimo_calculado: number
        }
        Update: {
          cliente_cnpj?: string | null
          cliente_email?: string | null
          cliente_endereco?: string | null
          cliente_telefone?: string | null
          contato_nome?: string | null
          created_at?: string
          dados_congelados?: boolean
          divida?: number
          entrada?: number
          id?: string
          itens_projeto?: Json | null
          local_entrega?: string | null
          mensalidade_f1?: number
          mensalidade_f2?: number
          nome_cliente?: string
          numero_proposta?: string | null
          observacoes?: string | null
          oportunidade_id?: string | null
          organizacao_id?: string | null
          peso_saco?: number
          pessoa_contato_id?: string | null
          reajuste_anual?: number
          responsavel_id?: string | null
          status?: string | null
          tarifa_excedente?: number
          tarifa_f1?: number
          tarifa_f2?: number
          total_10_anos?: number
          updated_at?: string
          validade_dias?: number | null
          valor_projeto?: number
          vol_min_f2_pct?: number
          volume_minimo_calculado?: number
        }
        Relationships: [
          {
            foreignKeyName: "propostas_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "oportunidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propostas_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "oportunidades_sem_valores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propostas_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "v_oportunidades_kanban"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propostas_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "v_oportunidades_kanban_sem_valores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propostas_organizacao_id_fkey"
            columns: ["organizacao_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propostas_pessoa_contato_id_fkey"
            columns: ["pessoa_contato_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
        ]
      }
      rd_sync_log: {
        Row: {
          erro: string | null
          finalizado_em: string | null
          id: string
          iniciado_em: string
          origem: string
          total_atualizados: number
          total_novos: number
          total_recebidos: number
        }
        Insert: {
          erro?: string | null
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string
          origem?: string
          total_atualizados?: number
          total_novos?: number
          total_recebidos?: number
        }
        Update: {
          erro?: string | null
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string
          origem?: string
          total_atualizados?: number
          total_novos?: number
          total_recebidos?: number
        }
        Relationships: []
      }
      tipicos: {
        Row: {
          arquivado: boolean
          capacidade_sacos_ano: number
          codigos: string[]
          created_at: string
          created_by: string | null
          descricao: string | null
          destacado: boolean
          id: string
          itens: Json
          nome: string
          tipo: Database["public"]["Enums"]["tipico_tipo"]
          updated_at: string
          valor_referencia: number
        }
        Insert: {
          arquivado?: boolean
          capacidade_sacos_ano: number
          codigos?: string[]
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          destacado?: boolean
          id?: string
          itens?: Json
          nome: string
          tipo: Database["public"]["Enums"]["tipico_tipo"]
          updated_at?: string
          valor_referencia: number
        }
        Update: {
          arquivado?: boolean
          capacidade_sacos_ano?: number
          codigos?: string[]
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          destacado?: boolean
          id?: string
          itens?: Json
          nome?: string
          tipo?: Database["public"]["Enums"]["tipico_tipo"]
          updated_at?: string
          valor_referencia?: number
        }
        Relationships: []
      }
      tipos_atividade: {
        Row: {
          ativo: boolean
          cor: string | null
          created_at: string
          icone: string | null
          id: string
          nome: string
          ordem: number | null
        }
        Insert: {
          ativo?: boolean
          cor?: string | null
          created_at?: string
          icone?: string | null
          id?: string
          nome: string
          ordem?: number | null
        }
        Update: {
          ativo?: boolean
          cor?: string | null
          created_at?: string
          icone?: string | null
          id?: string
          nome?: string
          ordem?: number | null
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
      usuario_estados: {
        Row: {
          created_at: string | null
          estado_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          estado_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          estado_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuario_estados_estado_id_fkey"
            columns: ["estado_id"]
            isOneToOne: false
            referencedRelation: "estados"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_mensagens_recebidas: {
        Row: {
          conteudo_texto: string | null
          de_nome: string | null
          de_telefone: string
          dossie_id: string | null
          erro_processamento: string | null
          id: string
          interacao_id: string | null
          latitude: number | null
          longitude: number | null
          midia_url_origem: string | null
          midia_url_storage: string | null
          payload_raw: Json
          processada: boolean
          processada_em: string | null
          recebida_em: string
          tentativas: number
          tipo: string
          transcricao: string | null
          zapi_message_id: string
        }
        Insert: {
          conteudo_texto?: string | null
          de_nome?: string | null
          de_telefone: string
          dossie_id?: string | null
          erro_processamento?: string | null
          id?: string
          interacao_id?: string | null
          latitude?: number | null
          longitude?: number | null
          midia_url_origem?: string | null
          midia_url_storage?: string | null
          payload_raw: Json
          processada?: boolean
          processada_em?: string | null
          recebida_em?: string
          tentativas?: number
          tipo: string
          transcricao?: string | null
          zapi_message_id: string
        }
        Update: {
          conteudo_texto?: string | null
          de_nome?: string | null
          de_telefone?: string
          dossie_id?: string | null
          erro_processamento?: string | null
          id?: string
          interacao_id?: string | null
          latitude?: number | null
          longitude?: number | null
          midia_url_origem?: string | null
          midia_url_storage?: string | null
          payload_raw?: Json
          processada?: boolean
          processada_em?: string | null
          recebida_em?: string
          tentativas?: number
          tipo?: string
          transcricao?: string | null
          zapi_message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_mensagens_recebidas_dossie_id_fkey"
            columns: ["dossie_id"]
            isOneToOne: false
            referencedRelation: "dossies_sementeiras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_mensagens_recebidas_dossie_id_fkey"
            columns: ["dossie_id"]
            isOneToOne: false
            referencedRelation: "vw_dossie_resumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_mensagens_recebidas_interacao_id_fkey"
            columns: ["interacao_id"]
            isOneToOne: false
            referencedRelation: "dossie_interacoes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      oportunidades_sem_valores: {
        Row: {
          concorrente_vencedor: string | null
          created_at: string | null
          data_fechamento_prevista: string | null
          data_fechamento_real: string | null
          etapa_id: string | null
          id: string | null
          motivo_perda: string | null
          notas: string | null
          observacoes: string | null
          ordem_coluna: number | null
          organizacao_id: string | null
          pipeline_id: string | null
          probabilidade: number | null
          proxima_atividade_em: string | null
          responsavel_id: string | null
          status: string | null
          titulo: string | null
          ultima_atividade_em: string | null
          updated_at: string | null
        }
        Insert: {
          concorrente_vencedor?: string | null
          created_at?: string | null
          data_fechamento_prevista?: string | null
          data_fechamento_real?: string | null
          etapa_id?: string | null
          id?: string | null
          motivo_perda?: string | null
          notas?: string | null
          observacoes?: string | null
          ordem_coluna?: number | null
          organizacao_id?: string | null
          pipeline_id?: string | null
          probabilidade?: number | null
          proxima_atividade_em?: string | null
          responsavel_id?: string | null
          status?: string | null
          titulo?: string | null
          ultima_atividade_em?: string | null
          updated_at?: string | null
        }
        Update: {
          concorrente_vencedor?: string | null
          created_at?: string | null
          data_fechamento_prevista?: string | null
          data_fechamento_real?: string | null
          etapa_id?: string | null
          id?: string | null
          motivo_perda?: string | null
          notas?: string | null
          observacoes?: string | null
          ordem_coluna?: number | null
          organizacao_id?: string | null
          pipeline_id?: string | null
          probabilidade?: number | null
          proxima_atividade_em?: string | null
          responsavel_id?: string | null
          status?: string | null
          titulo?: string | null
          ultima_atividade_em?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "oportunidades_etapa_id_fkey"
            columns: ["etapa_id"]
            isOneToOne: false
            referencedRelation: "etapas_pipeline"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidades_etapa_id_fkey"
            columns: ["etapa_id"]
            isOneToOne: false
            referencedRelation: "v_relatorio_tempo_etapa"
            referencedColumns: ["etapa_id"]
          },
          {
            foreignKeyName: "oportunidades_organizacao_id_fkey"
            columns: ["organizacao_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidades_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      orcamentos_reforma_sem_valores: {
        Row: {
          cliente_cnpj: string | null
          cliente_email: string | null
          cliente_endereco: string | null
          cliente_telefone: string | null
          condicoes_pagamento: string | null
          contato_nome: string | null
          created_at: string | null
          dados_congelados: boolean | null
          id: string | null
          local_entrega: string | null
          nome_cliente: string | null
          numero_orcamento: string | null
          observacoes: string | null
          oportunidade_id: string | null
          organizacao_id: string | null
          prazo_entrega: string | null
          responsavel_id: string | null
          status: string | null
          updated_at: string | null
          validade_dias: number | null
        }
        Insert: {
          cliente_cnpj?: string | null
          cliente_email?: string | null
          cliente_endereco?: string | null
          cliente_telefone?: string | null
          condicoes_pagamento?: string | null
          contato_nome?: string | null
          created_at?: string | null
          dados_congelados?: boolean | null
          id?: string | null
          local_entrega?: string | null
          nome_cliente?: string | null
          numero_orcamento?: string | null
          observacoes?: string | null
          oportunidade_id?: string | null
          organizacao_id?: string | null
          prazo_entrega?: string | null
          responsavel_id?: string | null
          status?: string | null
          updated_at?: string | null
          validade_dias?: number | null
        }
        Update: {
          cliente_cnpj?: string | null
          cliente_email?: string | null
          cliente_endereco?: string | null
          cliente_telefone?: string | null
          condicoes_pagamento?: string | null
          contato_nome?: string | null
          created_at?: string | null
          dados_congelados?: boolean | null
          id?: string | null
          local_entrega?: string | null
          nome_cliente?: string | null
          numero_orcamento?: string | null
          observacoes?: string | null
          oportunidade_id?: string | null
          organizacao_id?: string | null
          prazo_entrega?: string | null
          responsavel_id?: string | null
          status?: string | null
          updated_at?: string | null
          validade_dias?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orcamentos_reforma_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "oportunidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orcamentos_reforma_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "oportunidades_sem_valores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orcamentos_reforma_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "v_oportunidades_kanban"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orcamentos_reforma_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "v_oportunidades_kanban_sem_valores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orcamentos_reforma_organizacao_id_fkey"
            columns: ["organizacao_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      orcamentos_sem_valores: {
        Row: {
          cliente_cnpj: string | null
          cliente_email: string | null
          cliente_endereco: string | null
          cliente_telefone: string | null
          condicoes_pagamento: string | null
          contato_nome: string | null
          created_at: string | null
          dados_congelados: boolean | null
          id: string | null
          local_entrega: string | null
          nome_cliente: string | null
          numero_orcamento: string | null
          observacoes: string | null
          oportunidade_id: string | null
          organizacao_id: string | null
          prazo_entrega: string | null
          responsavel_id: string | null
          status: string | null
          updated_at: string | null
          validade_dias: number | null
        }
        Insert: {
          cliente_cnpj?: string | null
          cliente_email?: string | null
          cliente_endereco?: string | null
          cliente_telefone?: string | null
          condicoes_pagamento?: string | null
          contato_nome?: string | null
          created_at?: string | null
          dados_congelados?: boolean | null
          id?: string | null
          local_entrega?: string | null
          nome_cliente?: string | null
          numero_orcamento?: string | null
          observacoes?: string | null
          oportunidade_id?: string | null
          organizacao_id?: string | null
          prazo_entrega?: string | null
          responsavel_id?: string | null
          status?: string | null
          updated_at?: string | null
          validade_dias?: number | null
        }
        Update: {
          cliente_cnpj?: string | null
          cliente_email?: string | null
          cliente_endereco?: string | null
          cliente_telefone?: string | null
          condicoes_pagamento?: string | null
          contato_nome?: string | null
          created_at?: string | null
          dados_congelados?: boolean | null
          id?: string | null
          local_entrega?: string | null
          nome_cliente?: string | null
          numero_orcamento?: string | null
          observacoes?: string | null
          oportunidade_id?: string | null
          organizacao_id?: string | null
          prazo_entrega?: string | null
          responsavel_id?: string | null
          status?: string | null
          updated_at?: string | null
          validade_dias?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orcamentos_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "oportunidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orcamentos_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "oportunidades_sem_valores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orcamentos_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "v_oportunidades_kanban"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orcamentos_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "v_oportunidades_kanban_sem_valores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orcamentos_organizacao_id_fkey"
            columns: ["organizacao_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      propostas_sem_valores: {
        Row: {
          cliente_cnpj: string | null
          cliente_email: string | null
          cliente_endereco: string | null
          cliente_telefone: string | null
          contato_nome: string | null
          created_at: string | null
          dados_congelados: boolean | null
          id: string | null
          local_entrega: string | null
          nome_cliente: string | null
          numero_proposta: string | null
          observacoes: string | null
          oportunidade_id: string | null
          organizacao_id: string | null
          peso_saco: number | null
          pessoa_contato_id: string | null
          responsavel_id: string | null
          status: string | null
          updated_at: string | null
          validade_dias: number | null
          vol_min_f2_pct: number | null
          volume_minimo_calculado: number | null
        }
        Insert: {
          cliente_cnpj?: string | null
          cliente_email?: string | null
          cliente_endereco?: string | null
          cliente_telefone?: string | null
          contato_nome?: string | null
          created_at?: string | null
          dados_congelados?: boolean | null
          id?: string | null
          local_entrega?: string | null
          nome_cliente?: string | null
          numero_proposta?: string | null
          observacoes?: string | null
          oportunidade_id?: string | null
          organizacao_id?: string | null
          peso_saco?: number | null
          pessoa_contato_id?: string | null
          responsavel_id?: string | null
          status?: string | null
          updated_at?: string | null
          validade_dias?: number | null
          vol_min_f2_pct?: number | null
          volume_minimo_calculado?: number | null
        }
        Update: {
          cliente_cnpj?: string | null
          cliente_email?: string | null
          cliente_endereco?: string | null
          cliente_telefone?: string | null
          contato_nome?: string | null
          created_at?: string | null
          dados_congelados?: boolean | null
          id?: string | null
          local_entrega?: string | null
          nome_cliente?: string | null
          numero_proposta?: string | null
          observacoes?: string | null
          oportunidade_id?: string | null
          organizacao_id?: string | null
          peso_saco?: number | null
          pessoa_contato_id?: string | null
          responsavel_id?: string | null
          status?: string | null
          updated_at?: string | null
          validade_dias?: number | null
          vol_min_f2_pct?: number | null
          volume_minimo_calculado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "propostas_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "oportunidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propostas_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "oportunidades_sem_valores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propostas_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "v_oportunidades_kanban"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propostas_oportunidade_id_fkey"
            columns: ["oportunidade_id"]
            isOneToOne: false
            referencedRelation: "v_oportunidades_kanban_sem_valores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propostas_organizacao_id_fkey"
            columns: ["organizacao_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propostas_pessoa_contato_id_fkey"
            columns: ["pessoa_contato_id"]
            isOneToOne: false
            referencedRelation: "pessoas"
            referencedColumns: ["id"]
          },
        ]
      }
      v_oportunidades_kanban: {
        Row: {
          created_at: string | null
          data_fechamento_prevista: string | null
          data_fechamento_real: string | null
          dias_sem_atividade: number | null
          etapa_cor: string | null
          etapa_id: string | null
          etapa_rotting_days: number | null
          id: string | null
          motivo_perda: string | null
          ordem_coluna: number | null
          organizacao_id: string | null
          organizacao_nome: string | null
          pipeline_id: string | null
          probabilidade: number | null
          proxima_atividade_em: string | null
          responsavel_email: string | null
          responsavel_id: string | null
          responsavel_nome: string | null
          rotting_status: string | null
          status: string | null
          titulo: string | null
          ultima_atividade_em: string | null
          updated_at: string | null
          valor_estimado: number | null
        }
        Relationships: [
          {
            foreignKeyName: "oportunidades_etapa_id_fkey"
            columns: ["etapa_id"]
            isOneToOne: false
            referencedRelation: "etapas_pipeline"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidades_etapa_id_fkey"
            columns: ["etapa_id"]
            isOneToOne: false
            referencedRelation: "v_relatorio_tempo_etapa"
            referencedColumns: ["etapa_id"]
          },
          {
            foreignKeyName: "oportunidades_organizacao_id_fkey"
            columns: ["organizacao_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidades_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      v_oportunidades_kanban_sem_valores: {
        Row: {
          created_at: string | null
          data_fechamento_prevista: string | null
          data_fechamento_real: string | null
          dias_sem_atividade: number | null
          etapa_cor: string | null
          etapa_id: string | null
          etapa_rotting_days: number | null
          id: string | null
          motivo_perda: string | null
          ordem_coluna: number | null
          organizacao_id: string | null
          organizacao_nome: string | null
          pipeline_id: string | null
          proxima_atividade_em: string | null
          responsavel_email: string | null
          responsavel_id: string | null
          responsavel_nome: string | null
          rotting_status: string | null
          status: string | null
          titulo: string | null
          ultima_atividade_em: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "oportunidades_etapa_id_fkey"
            columns: ["etapa_id"]
            isOneToOne: false
            referencedRelation: "etapas_pipeline"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidades_etapa_id_fkey"
            columns: ["etapa_id"]
            isOneToOne: false
            referencedRelation: "v_relatorio_tempo_etapa"
            referencedColumns: ["etapa_id"]
          },
          {
            foreignKeyName: "oportunidades_organizacao_id_fkey"
            columns: ["organizacao_id"]
            isOneToOne: false
            referencedRelation: "organizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidades_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      v_relatorio_forecast_mensal: {
        Row: {
          etapa_cor: string | null
          etapa_id: string | null
          etapa_nome: string | null
          etapa_ordem: number | null
          forecast_ponderado: number | null
          mes: string | null
          pipeline_id: string | null
          qtd: number | null
          responsavel_id: string | null
          valor_total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "oportunidades_etapa_id_fkey"
            columns: ["etapa_id"]
            isOneToOne: false
            referencedRelation: "etapas_pipeline"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidades_etapa_id_fkey"
            columns: ["etapa_id"]
            isOneToOne: false
            referencedRelation: "v_relatorio_tempo_etapa"
            referencedColumns: ["etapa_id"]
          },
          {
            foreignKeyName: "oportunidades_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      v_relatorio_motivos_perda: {
        Row: {
          motivo: string | null
          pipeline_id: string | null
          qtd: number | null
          valor_total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "oportunidades_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      v_relatorio_performance_vendedor: {
        Row: {
          ciclo_medio_dias: number | null
          deals_fechados: number | null
          deals_ganhos: number | null
          deals_perdidos: number | null
          pipeline_id: string | null
          responsavel_id: string | null
          valor_ganho: number | null
          vendedor_email: string | null
          vendedor_nome: string | null
          win_rate: number | null
        }
        Relationships: [
          {
            foreignKeyName: "oportunidades_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      v_relatorio_tempo_etapa: {
        Row: {
          amostras: number | null
          etapa_cor: string | null
          etapa_id: string | null
          etapa_nome: string | null
          etapa_ordem: number | null
          pipeline_id: string | null
          tempo_medio_dias: number | null
        }
        Relationships: [
          {
            foreignKeyName: "etapas_pipeline_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_dias_montagem_sugerido: {
        Row: {
          detalhe_maquinas: Json | null
          dias_sugeridos: number | null
          orcamento_id: string | null
          tem_maquina_tratamento: boolean | null
        }
        Relationships: []
      }
      vw_dossie_resumo: {
        Row: {
          cidade: string | null
          cnpj: string | null
          confianca_dados: number | null
          criado_em: string | null
          culturas: string[] | null
          estado: string | null
          id: string | null
          maturidade_lead:
            | Database["public"]["Enums"]["dossie_maturidade"]
            | null
          nome_fantasia: string | null
          precisa_revisao: boolean | null
          prioridade: Database["public"]["Enums"]["dossie_prioridade"] | null
          qtd_contatos: number | null
          qtd_equipamentos: number | null
          qtd_interacoes: number | null
          qtd_midias: number | null
          responsavel_id: string | null
          status: Database["public"]["Enums"]["dossie_status"] | null
          ultima_interacao_em: string | null
          volume_anual_sacos: number | null
        }
        Insert: {
          cidade?: string | null
          cnpj?: string | null
          confianca_dados?: number | null
          criado_em?: string | null
          culturas?: string[] | null
          estado?: string | null
          id?: string | null
          maturidade_lead?:
            | Database["public"]["Enums"]["dossie_maturidade"]
            | null
          nome_fantasia?: string | null
          precisa_revisao?: boolean | null
          prioridade?: Database["public"]["Enums"]["dossie_prioridade"] | null
          qtd_contatos?: never
          qtd_equipamentos?: never
          qtd_interacoes?: never
          qtd_midias?: never
          responsavel_id?: string | null
          status?: Database["public"]["Enums"]["dossie_status"] | null
          ultima_interacao_em?: string | null
          volume_anual_sacos?: number | null
        }
        Update: {
          cidade?: string | null
          cnpj?: string | null
          confianca_dados?: number | null
          criado_em?: string | null
          culturas?: string[] | null
          estado?: string | null
          id?: string | null
          maturidade_lead?:
            | Database["public"]["Enums"]["dossie_maturidade"]
            | null
          nome_fantasia?: string | null
          precisa_revisao?: boolean | null
          prioridade?: Database["public"]["Enums"]["dossie_prioridade"] | null
          qtd_contatos?: never
          qtd_equipamentos?: never
          qtd_interacoes?: never
          qtd_midias?: never
          responsavel_id?: string | null
          status?: Database["public"]["Enums"]["dossie_status"] | null
          ultima_interacao_em?: string | null
          volume_anual_sacos?: number | null
        }
        Relationships: []
      }
      vw_layout_completo: {
        Row: {
          altura_mm: number | null
          categoria: string | null
          codigo: string | null
          comprimento_mm: number | null
          cor_categoria: string | null
          equipamento_id: string | null
          glb_rotacao_x: number | null
          glb_rotacao_z: number | null
          imagem_url: string | null
          item_id: string | null
          largura_mm: number | null
          layout_id: string | null
          modelo_3d_url: string | null
          nome: string | null
          ordem: number | null
          pos_x_mm: number | null
          pos_y_mm: number | null
          pos_z_mm: number | null
          rotacao: number | null
          rotulo_customizado: string | null
        }
        Relationships: [
          {
            foreignKeyName: "layout_equipamentos_layout_id_fkey"
            columns: ["layout_id"]
            isOneToOne: false
            referencedRelation: "layouts"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_orcamento_montagem: {
        Row: {
          alimentacao: number | null
          colaboradores: number | null
          custo_total: number | null
          deslocamento_diario: number | null
          deslocamento_inicial: number | null
          diaria_alimentacao: number | null
          diaria_hospedagem: number | null
          dias: number | null
          eh_fazenda: boolean | null
          hospedagem: number | null
          km_hotel_local: number | null
          km_origem_destino: number | null
          mao_de_obra: number | null
          margem_aplicada_pct: number | null
          margem_aplicada_rs: number | null
          margem_atual_config: number | null
          numero_veiculos: number | null
          orcamento_id: string | null
          preco_total: number | null
          valor_dia_colaborador: number | null
          valor_km: number | null
        }
        Relationships: []
      }
      vw_ultima_sessao_telefone: {
        Row: {
          cidade: string | null
          de_telefone: string | null
          dossie_id: string | null
          nome_fantasia: string | null
          recebida_em: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_mensagens_recebidas_dossie_id_fkey"
            columns: ["dossie_id"]
            isOneToOne: false
            referencedRelation: "dossies_sementeiras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_mensagens_recebidas_dossie_id_fkey"
            columns: ["dossie_id"]
            isOneToOne: false
            referencedRelation: "vw_dossie_resumo"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      buscar_dossies_similares: {
        Args: { limite?: number; texto_busca: string }
        Returns: {
          cidade: string
          estado: string
          id: string
          nome_fantasia: string
          similaridade: number
        }[]
      }
      fn_oportunidade_rotting: { Args: { opp_id: string }; Returns: string }
      fn_proximo_comercial_para_estado: {
        Args: { _estado_id: string }
        Returns: string
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
      is_approved: { Args: { _user_id: string }; Returns: boolean }
      pode_inserir_planta: {
        Args: { _name: string; _user: string }
        Returns: boolean
      }
      pode_ver_oportunidade: {
        Args: { _opp_id: string; _user_id: string }
        Returns: boolean
      }
      pode_ver_organizacao: {
        Args: {
          _org_estado_id: string
          _org_responsavel_id: string
          _user_id: string
        }
        Returns: boolean
      }
      pode_ver_planta: {
        Args: { _path: string; _user: string }
        Returns: boolean
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      user_cobre_estado: {
        Args: { _estado_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "user"
        | "gerente_comercial"
        | "comercial"
        | "rtv"
        | "marketing"
        | "engenharia"
        | "financeiro"
        | "operacao"
        | "viewer"
        | "agente_leitor"
      dossie_maturidade: "frio" | "morno" | "quente" | "qualificado"
      dossie_prioridade: "A" | "B" | "C"
      dossie_status:
        | "rascunho"
        | "em_qualificacao"
        | "qualificado"
        | "enviado_pipedrive"
        | "arquivado"
      equipamento_estado: "novo" | "bom" | "usado" | "precario" | "sucata"
      interacao_tipo:
        | "whatsapp_texto"
        | "whatsapp_audio"
        | "whatsapp_foto"
        | "whatsapp_video"
        | "whatsapp_localizacao"
        | "whatsapp_documento"
        | "visita_presencial"
        | "reuniao_video"
        | "ligacao"
        | "email"
        | "evento"
        | "nota_manual"
      tipico_tipo: "orcamento" | "aluguel"
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
      app_role: [
        "admin",
        "user",
        "gerente_comercial",
        "comercial",
        "rtv",
        "marketing",
        "engenharia",
        "financeiro",
        "operacao",
        "viewer",
        "agente_leitor",
      ],
      dossie_maturidade: ["frio", "morno", "quente", "qualificado"],
      dossie_prioridade: ["A", "B", "C"],
      dossie_status: [
        "rascunho",
        "em_qualificacao",
        "qualificado",
        "enviado_pipedrive",
        "arquivado",
      ],
      equipamento_estado: ["novo", "bom", "usado", "precario", "sucata"],
      interacao_tipo: [
        "whatsapp_texto",
        "whatsapp_audio",
        "whatsapp_foto",
        "whatsapp_video",
        "whatsapp_localizacao",
        "whatsapp_documento",
        "visita_presencial",
        "reuniao_video",
        "ligacao",
        "email",
        "evento",
        "nota_manual",
      ],
      tipico_tipo: ["orcamento", "aluguel"],
    },
  },
} as const
