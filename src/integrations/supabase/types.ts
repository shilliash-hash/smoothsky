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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      aircraft_types: {
        Row: {
          cargo_kg: number
          cruise_kts: number
          engine: string
          id: string
          manufacturer: string
          model: string
          pax: number
          range_nm: number
          security_deposit: number
          tier: number
          weekly_rate: number
        }
        Insert: {
          cargo_kg: number
          cruise_kts: number
          engine: string
          id: string
          manufacturer: string
          model: string
          pax: number
          range_nm: number
          security_deposit: number
          tier: number
          weekly_rate: number
        }
        Update: {
          cargo_kg?: number
          cruise_kts?: number
          engine?: string
          id?: string
          manufacturer?: string
          model?: string
          pax?: number
          range_nm?: number
          security_deposit?: number
          tier?: number
          weekly_rate?: number
        }
        Relationships: []
      }
      airports: {
        Row: {
          city: string
          country: string
          iata: string | null
          icao: string
          lat: number
          lon: number
          name: string
        }
        Insert: {
          city: string
          country: string
          iata?: string | null
          icao: string
          lat: number
          lon: number
          name: string
        }
        Update: {
          city?: string
          country?: string
          iata?: string | null
          icao?: string
          lat?: number
          lon?: number
          name?: string
        }
        Relationships: []
      }
      companies: {
        Row: {
          created_at: string
          home_base_icao: string
          icao_code: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          home_base_icao: string
          icao_code: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          home_base_icao?: string
          icao_code?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "companies_home_base_icao_fkey"
            columns: ["home_base_icao"]
            isOneToOne: false
            referencedRelation: "airports"
            referencedColumns: ["icao"]
          },
        ]
      }
      company_ledger: {
        Row: {
          amount: number
          balance_after: number
          company_delta: number
          company_id: string
          created_at: string
          credit_account: string
          debit_account: string
          description: string
          entry_type: string
          id: number
          idempotency_key: string
          reference: string | null
        }
        Insert: {
          amount: number
          balance_after: number
          company_delta: number
          company_id: string
          created_at?: string
          credit_account: string
          debit_account: string
          description: string
          entry_type: string
          id?: number
          idempotency_key: string
          reference?: string | null
        }
        Update: {
          amount?: number
          balance_after?: number
          company_delta?: number
          company_id?: string
          created_at?: string
          credit_account?: string
          debit_account?: string
          description?: string
          entry_type?: string
          id?: number
          idempotency_key?: string
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_ledger_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_aircraft: {
        Row: {
          aircraft_type_id: string
          company_id: string
          id: string
          lease_deposit: number
          leased_at: string
          location_icao: string
          next_payment_due: string
          registration: string
          status: string
          weekly_rate: number
        }
        Insert: {
          aircraft_type_id: string
          company_id: string
          id?: string
          lease_deposit: number
          leased_at?: string
          location_icao: string
          next_payment_due: string
          registration: string
          status?: string
          weekly_rate: number
        }
        Update: {
          aircraft_type_id?: string
          company_id?: string
          id?: string
          lease_deposit?: number
          leased_at?: string
          location_icao?: string
          next_payment_due?: string
          registration?: string
          status?: string
          weekly_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "fleet_aircraft_aircraft_type_id_fkey"
            columns: ["aircraft_type_id"]
            isOneToOne: false
            referencedRelation: "aircraft_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_aircraft_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_aircraft_location_icao_fkey"
            columns: ["location_icao"]
            isOneToOne: false
            referencedRelation: "airports"
            referencedColumns: ["icao"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      company_balance: { Args: { p_company: string }; Returns: number }
      create_company: {
        Args: { p_home_base: string; p_icao_code: string; p_name: string }
        Returns: string
      }
      is_company_code_available: { Args: { p_code: string }; Returns: boolean }
      lease_aircraft: { Args: { p_type: string }; Returns: string }
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
    Enums: {},
  },
} as const
