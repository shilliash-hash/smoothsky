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
          freelance_commission_pct: number
          home_base_icao: string
          icao_code: string
          id: string
          is_hiring: boolean
          is_personal: boolean
          is_supporter: boolean
          name: string
          next_dividend_at: string
          next_flight_sequence: number
          prev_week_rank: number | null
          roster_commission_pct: number
          stake_offer_pct: number
          user_id: string
        }
        Insert: {
          created_at?: string
          freelance_commission_pct?: number
          home_base_icao: string
          icao_code: string
          id?: string
          is_hiring?: boolean
          is_personal?: boolean
          is_supporter?: boolean
          name: string
          next_dividend_at?: string
          next_flight_sequence?: number
          prev_week_rank?: number | null
          roster_commission_pct?: number
          stake_offer_pct?: number
          user_id: string
        }
        Update: {
          created_at?: string
          freelance_commission_pct?: number
          home_base_icao?: string
          icao_code?: string
          id?: string
          is_hiring?: boolean
          is_personal?: boolean
          is_supporter?: boolean
          name?: string
          next_dividend_at?: string
          next_flight_sequence?: number
          prev_week_rank?: number | null
          roster_commission_pct?: number
          stake_offer_pct?: number
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
      company_fobs: {
        Row: {
          airport_icao: string
          base_type: string
          closed_at: string | null
          company_id: string
          created_at: string
          has_fuel_contract: boolean
          has_handling_desk: boolean
          has_maintenance_bay: boolean
          id: string
          next_payment_due: string
        }
        Insert: {
          airport_icao: string
          base_type: string
          closed_at?: string | null
          company_id: string
          created_at?: string
          has_fuel_contract?: boolean
          has_handling_desk?: boolean
          has_maintenance_bay?: boolean
          id?: string
          next_payment_due?: string
        }
        Update: {
          airport_icao?: string
          base_type?: string
          closed_at?: string | null
          company_id?: string
          created_at?: string
          has_fuel_contract?: boolean
          has_handling_desk?: boolean
          has_maintenance_bay?: boolean
          id?: string
          next_payment_due?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_fobs_airport_icao_fkey"
            columns: ["airport_icao"]
            isOneToOne: false
            referencedRelation: "airports"
            referencedColumns: ["icao"]
          },
          {
            foreignKeyName: "company_fobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
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
      company_stakes: {
        Row: {
          acquired_at: string
          company_id: string
          holder_id: string
          id: string
          locked_until: string
          pct: number
          price_paid: number
          sale_price: number | null
          sold_at: string | null
        }
        Insert: {
          acquired_at?: string
          company_id: string
          holder_id: string
          id?: string
          locked_until?: string
          pct: number
          price_paid: number
          sale_price?: number | null
          sold_at?: string | null
        }
        Update: {
          acquired_at?: string
          company_id?: string
          holder_id?: string
          id?: string
          locked_until?: string
          pct?: number
          price_paid?: number
          sale_price?: number | null
          sold_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_stakes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_stakes_holder_id_fkey"
            columns: ["holder_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          reserved_by: string | null
          reserved_until: string | null
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
          reserved_by?: string | null
          reserved_until?: string | null
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
          reserved_by?: string | null
          reserved_until?: string | null
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
          flight_number: string | null
          id: string
          origin_icao: string
          passengers: number
          pilot_commission_pct: number | null
          pilot_funding: number
          pilot_id: string | null
          pilot_mode: string | null
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
          flight_number?: string | null
          id?: string
          origin_icao: string
          passengers: number
          pilot_commission_pct?: number | null
          pilot_funding?: number
          pilot_id?: string | null
          pilot_mode?: string | null
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
          flight_number?: string | null
          id?: string
          origin_icao?: string
          passengers?: number
          pilot_commission_pct?: number | null
          pilot_funding?: number
          pilot_id?: string | null
          pilot_mode?: string | null
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
      leaderboard_weekly_snapshots: {
        Row: {
          company_id: string
          rank: number
          week_start: string
        }
        Insert: {
          company_id: string
          rank: number
          week_start: string
        }
        Update: {
          company_id?: string
          rank?: number
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "leaderboard_weekly_snapshots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
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
      pilot_ledger: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          description: string
          entry_type: string
          id: number
          user_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string
          description: string
          entry_type: string
          id?: number
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          description?: string
          entry_type?: string
          id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pilot_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          acars_api_key: string
          acars_last_seen: string | null
          callsign: string | null
          career_role: string | null
          created_at: string
          id: string
          last_position_at: string | null
          pilot_home_icao: string | null
          roster_company_id: string | null
          roster_joined_at: string | null
          simbrief_username: string | null
          type_ratings: number[]
        }
        Insert: {
          acars_api_key?: string
          acars_last_seen?: string | null
          callsign?: string | null
          career_role?: string | null
          created_at?: string
          id: string
          last_position_at?: string | null
          pilot_home_icao?: string | null
          roster_company_id?: string | null
          roster_joined_at?: string | null
          simbrief_username?: string | null
          type_ratings?: number[]
        }
        Update: {
          acars_api_key?: string
          acars_last_seen?: string | null
          callsign?: string | null
          career_role?: string | null
          created_at?: string
          id?: string
          last_position_at?: string | null
          pilot_home_icao?: string | null
          roster_company_id?: string | null
          roster_joined_at?: string | null
          simbrief_username?: string | null
          type_ratings?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "profiles_pilot_home_icao_fkey"
            columns: ["pilot_home_icao"]
            isOneToOne: false
            referencedRelation: "airports"
            referencedColumns: ["icao"]
          },
          {
            foreignKeyName: "profiles_roster_company_id_fkey"
            columns: ["roster_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
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
      acars_connect: { Args: { p_key: string }; Returns: Json }
      acars_flight_json: {
        Args: { f: Database["public"]["Tables"]["flights"]["Row"] }
        Returns: Json
      }
      acars_pilot: { Args: { p_key: string }; Returns: string }
      acars_pirep: { Args: { p: Json; p_key: string }; Returns: Json }
      acars_position: { Args: { p: Json; p_key: string }; Returns: Json }
      act_as: { Args: { p_user: string }; Returns: string }
      admin_company_supporters: {
        Args: never
        Returns: {
          company_id: string
          is_supporter: boolean
          user_id: string
        }[]
      }
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
      assert_company_investment: { Args: never; Returns: undefined }
      buy_personal_aircraft: {
        Args: { p_registration?: string; p_type: string }
        Returns: string
      }
      buy_stake: { Args: { p_company: string; p_pct: number }; Returns: string }
      buy_type_rating: { Args: { p_group: string }; Returns: undefined }
      cancel_test_flight: { Args: { p_flight: string }; Returns: undefined }
      choose_pilot_career: {
        Args: { p_callsign: string; p_home: string }
        Returns: undefined
      }
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
      company_financial_health: { Args: never; Returns: Json }
      company_net_worth: { Args: { p_company: string }; Returns: number }
      company_post: {
        Args: {
          p_company: string
          p_credit: string
          p_debit: string
          p_delta: number
          p_desc: string
          p_key: string
          p_ref: string
          p_type: string
        }
        Returns: number
      }
      create_company: {
        Args: { p_home_base: string; p_icao_code: string; p_name: string }
        Returns: string
      }
      csv_fields: { Args: { line: string }; Returns: string[] }
      dispatch_flight:
        | {
            Args: { p_aircraft: string; p_destination: string }
            Returns: string
          }
        | {
            Args: {
              p_aircraft: string
              p_destination: string
              p_flight_number: string
            }
            Returns: string
          }
      economy_number: { Args: { p_key: string }; Returns: number }
      ensure_my_profile: {
        Args: never
        Returns: {
          acars_api_key: string
          acars_last_seen: string | null
          callsign: string | null
          career_role: string | null
          created_at: string
          id: string
          last_position_at: string | null
          pilot_home_icao: string | null
          roster_company_id: string | null
          roster_joined_at: string | null
          simbrief_username: string | null
          type_ratings: number[]
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      flight_quote: {
        Args: { p_aircraft: string; p_destination: string }
        Returns: Json
      }
      flight_quote_without_fobs: {
        Args: { p_aircraft: string; p_destination: string }
        Returns: Json
      }
      fob_weekly_cost: { Args: { p_base: string }; Returns: number }
      get_pilot_leaderboard: {
        Args: never
        Returns: {
          career_role: string
          earned: number
          flight_count: number
          flight_hours: number
          is_me: boolean
          pilot_name: string
        }[]
      }
      get_public_leaderboard: {
        Args: never
        Returns: {
          company_name: string
          flight_count: number
          flight_hours: number
          home_base_icao: string
          home_base_name: string
          icao_code: string
          is_supporter: boolean
          net_worth: number
          passengers: number
          prev_week_rank: number
          rank: number
        }[]
      }
      hiring_companies: {
        Args: never
        Returns: {
          company_id: string
          fleet_count: number
          freelance_commission_pct: number
          home_base_icao: string
          icao_code: string
          name: string
          roster_commission_pct: number
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      is_company_code_available: { Args: { p_code: string }; Returns: boolean }
      join_roster: { Args: { p_company: string }; Returns: undefined }
      leaderboard_totals: {
        Args: never
        Returns: {
          company_id: string
          company_name: string
          flight_count: number
          flight_hours: number
          home_base_icao: string
          home_base_name: string
          icao_code: string
          is_supporter: boolean
          net_worth: number
          passengers: number
        }[]
      }
      lease_aircraft: { Args: { p_type: string }; Returns: string }
      leave_roster: { Args: never; Returns: undefined }
      manage_fob: {
        Args: {
          p_action: string
          p_airport?: string
          p_base?: string
          p_module?: string
          p_type?: string
        }
        Returns: string
      }
      manage_lease: {
        Args: { p_action: string; p_aircraft: string; p_weeks?: number }
        Returns: string
      }
      my_pilot_profile: { Args: never; Returns: Json }
      new_acars_key: { Args: never; Returns: string }
      next_flight_number: { Args: never; Returns: string }
      passenger_capacity: { Args: { p_airport: string }; Returns: number }
      passenger_stock: { Args: { p_airport: string }; Returns: number }
      pay_due_dividends: { Args: { p_company: string }; Returns: undefined }
      pilot_balance: { Args: { p_user: string }; Returns: number }
      pilot_flight_action: {
        Args: {
          p_action: string
          p_aircraft?: string
          p_destination?: string
          p_flight?: string
          p_flight_number?: string
        }
        Returns: Json
      }
      pilot_mode_for: {
        Args: { p_aircraft: string; p_user: string }
        Returns: string
      }
      pilot_operations: { Args: never; Returns: Json }
      pilot_post: {
        Args: {
          p_amount: number
          p_desc: string
          p_type: string
          p_user: string
        }
        Returns: number
      }
      process_due_obligations: { Args: never; Returns: undefined }
      process_due_obligations_core: { Args: never; Returns: undefined }
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
      regenerate_acars_key: { Args: never; Returns: string }
      reset_airports_state: { Args: never; Returns: Json }
      restructure_company: { Args: never; Returns: undefined }
      sell_stake: { Args: { p_stake: string }; Returns: number }
      set_company_hiring: {
        Args: { p_freelance: number; p_hiring: boolean; p_roster: number }
        Returns: undefined
      }
      set_company_supporter: {
        Args: { p_company: string; p_supporter: boolean }
        Returns: undefined
      }
      set_stake_offer: { Args: { p_pct: number }; Returns: undefined }
      settle_due_test_flights: { Args: never; Returns: undefined }
      settle_flight: {
        Args: { p_flight: string; p_telemetry?: Json }
        Returns: Json
      }
      sign_lease: {
        Args: { p_type: string; p_weeks?: number }
        Returns: string
      }
      stake_market: {
        Args: never
        Returns: {
          company_id: string
          icao_code: string
          name: string
          net_worth: number
          offered_pct: number
          price_per_pct: number
          sold_pct: number
        }[]
      }
      start_test_flight: { Args: { p_flight: string }; Returns: undefined }
      sync_lease_payments: { Args: never; Returns: undefined }
      transaction_history: {
        Args: { p_aircraft?: string; p_company: string }
        Returns: {
          aircraft_id: string
          balance_after: number
          company_delta: number
          created_at: string
          credit_account: string
          debit_account: string
          description: string
          destination_icao: string
          entry_type: string
          flight_id: string
          id: number
          origin_icao: string
          reference: string
          registration: string
        }[]
      }
      transaction_history_numbered: {
        Args: { p_aircraft?: string; p_company: string }
        Returns: {
          aircraft_id: string
          balance_after: number
          company_delta: number
          created_at: string
          credit_account: string
          debit_account: string
          description: string
          destination_icao: string
          entry_type: string
          flight_id: string
          flight_number: string
          id: number
          origin_icao: string
          reference: string
          registration: string
        }[]
      }
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
