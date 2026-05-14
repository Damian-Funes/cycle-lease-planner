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
          cliente_id: string
          concluida: boolean
          conteudo: string | null
          created_at: string
          data_atividade: string
          id: string
          oportunidade_id: string | null
          responsavel_id: string | null
          tipo: string
          titulo: string
        }
        Insert: {
          cliente_id: string
          concluida?: boolean
          conteudo?: string | null
          created_at?: string
          data_atividade?: string
          id?: string
          oportunidade_id?: string | null
          responsavel_id?: string | null
          tipo: string
          titulo: string
        }
        Update: {
          cliente_id?: string
          concluida?: boolean
          conteudo?: string | null
          created_at?: string
          data_atividade?: string
          id?: string
          oportunidade_id?: string | null
          responsavel_id?: string | null
          tipo?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "atividades_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atividades_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          cnpj: string | null
          created_at: string
          id: string
          nome_fantasia: string | null
          observacoes: string | null
          porte: string | null
          razao_social: string
          regiao: string | null
          responsavel_id: string | null
          segmento: string | null
          status: string
          updated_at: string
        }
        Insert: {
          cnpj?: string | null
          created_at?: string
          id?: string
          nome_fantasia?: string | null
          observacoes?: string | null
          porte?: string | null
          razao_social: string
          regiao?: string | null
          responsavel_id?: string | null
          segmento?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          cnpj?: string | null
          created_at?: string
          id?: string
          nome_fantasia?: string | null
          observacoes?: string | null
          porte?: string | null
          razao_social?: string
          regiao?: string | null
          responsavel_id?: string | null
          segmento?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clientes_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contatos: {
        Row: {
          cargo: string | null
          cliente_id: string
          created_at: string
          e_decisor: boolean
          email: string | null
          id: string
          nome: string
          observacoes: string | null
          telefone: string | null
          updated_at: string
        }
        Insert: {
          cargo?: string | null
          cliente_id: string
          created_at?: string
          e_decisor?: boolean
          email?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          cargo?: string | null
          cliente_id?: string
          created_at?: string
          e_decisor?: boolean
          email?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contatos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
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
            foreignKeyName: "historico_oportunidade_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
            foreignKeyName: "oportunidades_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          desconto_tipo: string
          desconto_valor: number
          frete: number
          id: string
          itens: Json
          local_entrega: string | null
          nome_cliente: string
          numero_orcamento: string | null
          observacoes: string | null
          prazo_entrega: string | null
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
          desconto_tipo?: string
          desconto_valor?: number
          frete?: number
          id?: string
          itens?: Json
          local_entrega?: string | null
          nome_cliente: string
          numero_orcamento?: string | null
          observacoes?: string | null
          prazo_entrega?: string | null
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
          desconto_tipo?: string
          desconto_valor?: number
          frete?: number
          id?: string
          itens?: Json
          local_entrega?: string | null
          nome_cliente?: string
          numero_orcamento?: string | null
          observacoes?: string | null
          prazo_entrega?: string | null
          status?: string | null
          subtotal?: number
          total?: number
          updated_at?: string
          validade_dias?: number | null
        }
        Relationships: []
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
          desconto_tipo: string
          desconto_valor: number
          frete: number
          id: string
          itens: Json
          local_entrega: string | null
          nome_cliente: string
          numero_orcamento: string | null
          observacoes: string | null
          prazo_entrega: string | null
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
          desconto_tipo?: string
          desconto_valor?: number
          frete?: number
          id?: string
          itens?: Json
          local_entrega?: string | null
          nome_cliente: string
          numero_orcamento?: string | null
          observacoes?: string | null
          prazo_entrega?: string | null
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
          desconto_tipo?: string
          desconto_valor?: number
          frete?: number
          id?: string
          itens?: Json
          local_entrega?: string | null
          nome_cliente?: string
          numero_orcamento?: string | null
          observacoes?: string | null
          prazo_entrega?: string | null
          status?: string | null
          subtotal?: number
          total?: number
          updated_at?: string
          validade_dias?: number | null
        }
        Relationships: []
      }
      organizacoes: {
        Row: {
          cidade: string | null
          cnpj: string | null
          created_at: string
          email_principal: string | null
          endereco: string | null
          estado: string | null
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
            foreignKeyName: "organizacoes_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
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
            referencedColumns: ["id"]
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
          cliente_id: string | null
          cliente_telefone: string | null
          contato_nome: string | null
          created_at: string
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
          peso_saco: number
          reajuste_anual: number
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
          cliente_id?: string | null
          cliente_telefone?: string | null
          contato_nome?: string | null
          created_at?: string
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
          peso_saco?: number
          reajuste_anual: number
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
          cliente_id?: string | null
          cliente_telefone?: string | null
          contato_nome?: string | null
          created_at?: string
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
          peso_saco?: number
          reajuste_anual?: number
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
            foreignKeyName: "propostas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
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
    }
    Views: {
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
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_approved: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
