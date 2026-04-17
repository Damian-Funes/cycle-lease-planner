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
          ativo: boolean | null
          codigo: string
          created_at: string | null
          descricao: string
          id: string
          valor_custo: number
          valor_venda: number | null
        }
        Insert: {
          ativo?: boolean | null
          codigo: string
          created_at?: string | null
          descricao: string
          id?: string
          valor_custo: number
          valor_venda?: number | null
        }
        Update: {
          ativo?: boolean | null
          codigo?: string
          created_at?: string | null
          descricao?: string
          id?: string
          valor_custo?: number
          valor_venda?: number | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
