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
          id?: string
          imagem_url?: string | null
          largura_mm?: number | null
          modelo_3d_url?: string | null
          valor_custo?: number
          valor_venda?: number | null
        }
        Relationships: []
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
      layout_equipamentos: {
        Row: {
          created_at: string
          equipamento_id: string
          id: string
          layout_id: string
          ordem: number
          pos_x_mm: number
          pos_y_mm: number
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
          imagem_url: string | null
          item_id: string | null
          largura_mm: number | null
          layout_id: string | null
          modelo_3d_url: string | null
          nome: string | null
          ordem: number | null
          pos_x_mm: number | null
          pos_y_mm: number | null
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
