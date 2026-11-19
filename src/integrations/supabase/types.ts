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
          active: boolean
          cargo_kg: number
          cruise_kts: number
          engine: string
          fuel_burn_gph: number
          fuel_capacity_gal: number
          fuel_type: string
          id: string
          manufacturer: string
          minimum_runway_ft: number
          model: string
          pax: number
          purchase_price: number
          range_nm: number
          security_deposit: number
          tier: number
          weekly_rate: number
        }
        Insert: {
          active?: boolean
          cargo_kg: number
          cruise_kts: number
          engine: string
          fuel_burn_gph?: number
          fuel_capacity_gal?: number
          fuel_type?: string
          id: string
          manufacturer: string
          minimum_runway_ft?: number
          model: string
          pax: number
          purchase_price?: number
          range_nm: number
          security_deposit: number
          tier: number
          weekly_rate: number
        }
        Update: {
          active?: boolean
          cargo_kg?: number
          cruise_kts?: number
          engine?: string
          fuel_burn_gph?: number
          fuel_capacity_gal?: number
          fuel_type?: string
          id?: string
          manufacturer?: string
          minimum_runway_ft?: number
          model?: string
          pax?: number
          purchase_price?: number
          range_nm?: number
          security_deposit?: number
          tier?: number
          weekly_rate?: number
        }
        Relationships: []
      }
      airport_fuel_pools: {
        Row: {
          airport_icao: string
          fuel_type: string
          stock_gal: number
          updated_at: string
        }
        Insert: {
          airport_icao: string
          fuel_type: string
          stock_gal?: number
          updated_at?: string
        }
        Update: {
          airport_icao?: string
          fuel_type?: string
          stock_gal?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "airport_fuel_pools_airport_icao_fkey"
            columns: ["airport_icao"]
            isOneToOne: false
            referencedRelation: "airports"
            referencedColumns: ["icao"]
          },
        ]
      }
      airport_fuel_rules: {
        Row: {
          capacity_gal: number
          development_multiplier: number
          fuel_type: string
          refill_per_hour: number
          size: number
        }
        Insert: {
          capacity_gal: number
          development_multiplier?: number
          fuel_type: string
          refill_per_hour?: number
          size: number
        }
        Update: {
          capacity_gal?: number
          development_multiplier?: number
          fuel_type?: string
          refill_per_hour?: number
          size?: number
        }
        Relationships: []
      }
      airport_import_sources: {
        Row: {
          request_id: number | null
          source: string
        }
        Insert: {
          request_id?: number | null
          source: string
        }
        Update: {
          request_id?: number | null
          source?: string
        }
        Relationships: []
      }
      airport_passenger_pools: {
        Row: {
          airport_icao: string
          last_departure_at: string
          stock: number
          updated_at: string
        }
        Insert: {
          airport_icao: string
          last_departure_at?: string
          stock?: number
          updated_at?: string
        }
        Update: {
          airport_icao?: string
          last_departure_at?: string
          stock?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "airport_passenger_pools_airport_icao_fkey"
            columns: ["airport_icao"]
            isOneToOne: true
            referencedRelation: "airports"
            referencedColumns: ["icao"]
          },
        ]
      }
      airports: {
        Row: {
          airport_type: string
          city: string
          classification_source: string
          country: string
          data_source: string
          development_level: number
          elevation_ft: number | null
          fuel_100ll_available: boolean | null
          fuel_jeta_available: boolean | null
          iata: string | null
          icao: string
          lat: number
          lon: number
          longest_runway_ft: number | null
          name: string
          runway_surface: string | null
          size: number
        }
        Insert: {
          airport_type?: string
          city: string
          classification_source?: string
          country: string
          data_source?: string
          development_level?: number
          elevation_ft?: number | null
          fuel_100ll_available?: boolean | null
          fuel_jeta_available?: boolean | null
          iata?: string | null
          icao: string
          lat: number
          lon: number
          longest_runway_ft?: number | null
          name: string
          runway_surface?: string | null
          size?: number
        }
        Update: {
          airport_type?: string
          city?: string
          classification_source?: string
          country?: string
          data_source?: string
          development_level?: number
          elevation_ft?: number | null
          fuel_100ll_available?: boolean | null
          fuel_jeta_available?: boolean | null
          iata?: string | null
          icao?: string
          lat?: number
          lon?: number
          longest_runway_ft?: number | null
          name?: string
          runway_surface?: string | null
          size?: number
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
      economy_config: {
        Row: {
          description: string
          key: string
          value: Json
        }
        Insert: {
          description?: string
          key: string
          value: Json
        }
        Update: {
          description?: string
          key?: string
          value?: Json
        }
        Relationships: []
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
          ownership: string
          purchase_price: number
          registration: string
          returned_at: string | null
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
          ownership?: string
          purchase_price?: number
          registration: string
          returned_at?: string | null
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
          ownership?: string
          purchase_price?: number
          registration?: string
          returned_at?: string | null
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
      flights: {
        Row: {
          aircraft_id: string
          company_id: string
          completed_at: string | null
          created_at: string
          departed_at: string | null
          destination_icao: string
          distance_nm: number
          estimate: Json
          estimated_minutes: number
          execution_source: string
          id: string
          origin_icao: string
          passengers: number
          rules_snapshot: Json
          settlement: Json | null
          status: string
          telemetry: Json | null
        }
        Insert: {
          aircraft_id: string
          company_id: string
          completed_at?: string | null
          created_at?: string
          departed_at?: string | null
          destination_icao: string
          distance_nm: number
          estimate: Json
          estimated_minutes: number
          execution_source?: string
          id?: string
          origin_icao: string
          passengers: number
          rules_snapshot: Json
          settlement?: Json | null
          status?: string
          telemetry?: Json | null
        }
        Update: {
          aircraft_id?: string
          company_id?: string
          completed_at?: string | null
          created_at?: string
          departed_at?: string | null
          destination_icao?: string
          distance_nm?: number
          estimate?: Json
          estimated_minutes?: number
          execution_source?: string
          id?: string
          origin_icao?: string
          passengers?: number
          rules_snapshot?: Json
          settlement?: Json | null
          status?: string
          telemetry?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "flights_aircraft_id_fkey"
            columns: ["aircraft_id"]
            isOneToOne: false
            referencedRelation: "fleet_aircraft"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flights_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flights_destination_icao_fkey"
            columns: ["destination_icao"]
            isOneToOne: false
            referencedRelation: "airports"
            referencedColumns: ["icao"]
          },
          {
            foreignKeyName: "flights_origin_icao_fkey"
            columns: ["origin_icao"]
            isOneToOne: false
            referencedRelation: "airports"
            referencedColumns: ["icao"]
          },
        ]
      }
      lease_contracts: {
        Row: {
          aircraft_id: string
          base_weekly_rate: number
          company_id: string
          ends_at: string
          id: string
          paid_weeks: number
          renewal: boolean
          starts_at: string
          term_weeks: number
          weekly_rate: number
        }
        Insert: {
          aircraft_id: string
          base_weekly_rate: number
          company_id: string
          ends_at: string
          id?: string
          paid_weeks?: number
          renewal?: boolean
          starts_at: string
          term_weeks: number
          weekly_rate: number
        }
        Update: {
          aircraft_id?: string
          base_weekly_rate?: number
          company_id?: string
          ends_at?: string
          id?: string
          paid_weeks?: number
          renewal?: boolean
          starts_at?: string
          term_weeks?: number
          weekly_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "lease_contracts_aircraft_id_fkey"
            columns: ["aircraft_id"]
            isOneToOne: false
            referencedRelation: "fleet_aircraft"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lease_contracts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      operating_rules: {
        Row: {
          avgas_kg_per_litre: number
          default_lease_weeks: number
          jeta_kg_per_litre: number
          renewal_discount: number
          singleton: boolean
        }
        Insert: {
          avgas_kg_per_litre?: number
          default_lease_weeks?: number
          jeta_kg_per_litre?: number
          renewal_discount?: number
          singleton?: boolean
        }
        Update: {
          avgas_kg_per_litre?: number
          default_lease_weeks?: number
          jeta_kg_per_litre?: number
          renewal_discount?: number
          singleton?: boolean
        }
        Relationships: []
      }
      registration_rules: {
        Row: {
          alphabet: string
          country: string
          prefix: string
          source: string
          suffix_length: number
          suffix_pattern: string
        }
        Insert: {
          alphabet?: string
          country: string
          prefix: string
          source?: string
          suffix_length: number
          suffix_pattern: string
        }
        Update: {
          alphabet?: string
          country?: string
          prefix?: string
          source?: string
          suffix_length?: number
          suffix_pattern?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_players: {
        Args: never
        Returns: {
          balance: number
          company_name: string
          email: string
          fleet_count: number
          icao_code: string
          joined_at: string
          user_id: string
          username: string
        }[]
      }
      aircraft_finance: { Args: { p_aircraft: string }; Returns: Json }
      aircraft_registration: {
        Args: { p_requested?: string; p_type: string }
        Returns: string
      }
      airport_fuel_capacity: {
        Args: { p_airport: string; p_fuel: string }
        Returns: number
      }
      airport_fuel_stock: {
        Args: { p_airport: string; p_fuel: string }
        Returns: number
      }
      cancel_test_flight: { Args: { p_flight: string }; Returns: undefined }
      company_balance: { Args: { p_company: string }; Returns: number }
      company_daily_results: {
        Args: never
        Returns: {
          cash_flow: number
          day: string
          expenses: number
          net: number
          revenue: number
        }[]
      }
      create_company: {
        Args: { p_home_base: string; p_icao_code: string; p_name: string }
        Returns: string
      }
      csv_fields: { Args: { line: string }; Returns: string[] }
      dispatch_flight: {
        Args: { p_aircraft: string; p_destination: string }
        Returns: string
      }
      economy_number: { Args: { p_key: string }; Returns: number }
      flight_quote: {
        Args: { p_aircraft: string; p_destination: string }
        Returns: Json
      }
      is_admin: { Args: never; Returns: boolean }
      is_company_code_available: { Args: { p_code: string }; Returns: boolean }
      lease_aircraft: { Args: { p_type: string }; Returns: string }
      manage_lease: {
        Args: { p_action: string; p_aircraft: string; p_weeks?: number }
        Returns: string
      }
      passenger_capacity: { Args: { p_airport: string }; Returns: number }
      passenger_stock: { Args: { p_airport: string }; Returns: number }
      purchase_aircraft: {
        Args: { p_registration?: string; p_type: string }
        Returns: string
      }
      radar_airport_metrics: {
        Args: never
        Returns: {
          avgas_capacity: number
          avgas_stock: number
          icao: string
          jeta_capacity: number
          jeta_stock: number
          operations_7d: number
          pax_capacity: number
          pax_stock: number
        }[]
      }
      settle_due_test_flights: { Args: never; Returns: undefined }
      settle_flight: {
        Args: { p_flight: string; p_telemetry?: Json }
        Returns: Json
      }
      sign_lease: {
        Args: { p_type: string; p_weeks?: number }
        Returns: string
      }
      start_test_flight: { Args: { p_flight: string }; Returns: undefined }
      sync_lease_payments: { Args: never; Returns: undefined }
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
      app_role: ["admin", "user"],
    },
  },
} as const
