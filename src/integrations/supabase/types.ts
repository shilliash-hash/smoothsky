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
          empty_weight_kg: number
          engine: string
          fuel_burn_gph: number
          fuel_capacity_gal: number
          fuel_type: string
          id: string
          manufacturer: string
          minimum_runway_ft: number
          model: string
          mtow_kg: number
          pax: number
          purchase_price: number
          range_nm: number
          security_deposit: number
          tier: number
          unpaved_capable: boolean
          weekly_rate: number
        }
        Insert: {
          active?: boolean
          cargo_kg: number
          cruise_kts: number
          empty_weight_kg?: number
          engine: string
          fuel_burn_gph?: number
          fuel_capacity_gal?: number
          fuel_type?: string
          id: string
          manufacturer: string
          minimum_runway_ft?: number
          model: string
          mtow_kg?: number
          pax: number
          purchase_price?: number
          range_nm: number
          security_deposit: number
          tier: number
          unpaved_capable?: boolean
          weekly_rate: number
        }
        Update: {
          active?: boolean
          cargo_kg?: number
          cruise_kts?: number
          empty_weight_kg?: number
          engine?: string
          fuel_burn_gph?: number
          fuel_capacity_gal?: number
          fuel_type?: string
          id?: string
          manufacturer?: string
          minimum_runway_ft?: number
          model?: string
          mtow_kg?: number
          pax?: number
          purchase_price?: number
          range_nm?: number
          security_deposit?: number
          tier?: number
          unpaved_capable?: boolean
          weekly_rate?: number
        }
        Relationships: []
      }
      airport_cargo_pools: {
        Row: {
          airport_icao: string
          cargo_pool_kg: number
          updated_at: string
        }
        Insert: {
          airport_icao: string
          cargo_pool_kg?: number
          updated_at?: string
        }
        Update: {
          airport_icao?: string
          cargo_pool_kg?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "airport_cargo_pools_airport_icao_fkey"
            columns: ["airport_icao"]
            isOneToOne: true
            referencedRelation: "airports"
            referencedColumns: ["icao"]
          },
        ]
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
          airframe_hours: number
          company_id: string
          current_fuel_gal: number
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
          airframe_hours?: number
          company_id: string
          current_fuel_gal?: number
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
          airframe_hours?: number
          company_id?: string
          current_fuel_gal?: number
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
          cumulative_fuel_used_gal: number
          departed_at: string | null
          destination_icao: string
          distance_nm: number
          divert_state: Json | null
          estimate: Json
          estimated_minutes: number
          execution_source: string
          flight_number: string | null
          fuel_tracking_started: boolean
          id: string
          last_observed_fuel_gal: number | null
          origin_icao: string
          passengers: number
          pilot_commission_pct: number | null
          pilot_funding: number
          pilot_id: string | null
          pilot_mode: string | null
          route_waypoints: Json | null
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
          cumulative_fuel_used_gal?: number
          departed_at?: string | null
          destination_icao: string
          distance_nm: number
          divert_state?: Json | null
          estimate: Json
          estimated_minutes: number
          execution_source?: string
          flight_number?: string | null
          fuel_tracking_started?: boolean
          id?: string
          last_observed_fuel_gal?: number | null
          origin_icao: string
          passengers: number
          pilot_commission_pct?: number | null
          pilot_funding?: number
          pilot_id?: string | null
          pilot_mode?: string | null
          route_waypoints?: Json | null
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
          cumulative_fuel_used_gal?: number
          departed_at?: string | null
          destination_icao?: string
          distance_nm?: number
          divert_state?: Json | null
          estimate?: Json
          estimated_minutes?: number
          execution_source?: string
          flight_number?: string | null
          fuel_tracking_started?: boolean
          id?: string
          last_observed_fuel_gal?: number | null
          origin_icao?: string
          passengers?: number
          pilot_commission_pct?: number | null
          pilot_funding?: number
          pilot_id?: string | null
          pilot_mode?: string | null
          route_waypoints?: Json | null
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
          ended_at: string | null
          ends_at: string
          id: string
          paid_weeks: number
          renewal: boolean
          starts_at: string
          term_weeks: number
          termination_status: string | null
          weekly_rate: number
        }
        Insert: {
          aircraft_id: string
          base_weekly_rate: number
          company_id: string
          ended_at?: string | null
          ends_at: string
          id?: string
          paid_weeks?: number
          renewal?: boolean
          starts_at: string
          term_weeks: number
          termination_status?: string | null
          weekly_rate: number
        }
        Update: {
          aircraft_id?: string
          base_weekly_rate?: number
          company_id?: string
          ended_at?: string | null
          ends_at?: string
          id?: string
          paid_weeks?: number
          renewal?: boolean
          starts_at?: string
          term_weeks?: number
          termination_status?: string | null
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
          all_cargo_capacity_bonus: number
          avgas_kg_per_litre: number
          butter_landing_max_fpm: number
          butter_tip_rate: number
          cargo_airport_fee_discount: number
          cargo_pax_rate_ratio: number
          default_lease_weeks: number
          depreciation_floor_pct: number
          depreciation_pct_per_100h: number
          jeta_kg_per_litre: number
          lease_termination_penalty_rate: number
          renewal_discount: number
          singleton: boolean
          smooth_landing_max_fpm: number
          smooth_landing_min_fpm: number
          smooth_tip_rate: number
        }
        Insert: {
          all_cargo_capacity_bonus?: number
          avgas_kg_per_litre?: number
          butter_landing_max_fpm?: number
          butter_tip_rate?: number
          cargo_airport_fee_discount?: number
          cargo_pax_rate_ratio?: number
          default_lease_weeks?: number
          depreciation_floor_pct?: number
          depreciation_pct_per_100h?: number
          jeta_kg_per_litre?: number
          lease_termination_penalty_rate?: number
          renewal_discount?: number
          singleton?: boolean
          smooth_landing_max_fpm?: number
          smooth_landing_min_fpm?: number
          smooth_tip_rate?: number
        }
        Update: {
          all_cargo_capacity_bonus?: number
          avgas_kg_per_litre?: number
          butter_landing_max_fpm?: number
          butter_tip_rate?: number
          cargo_airport_fee_discount?: number
          cargo_pax_rate_ratio?: number
          default_lease_weeks?: number
          depreciation_floor_pct?: number
          depreciation_pct_per_100h?: number
          jeta_kg_per_litre?: number
          lease_termination_penalty_rate?: number
          renewal_discount?: number
          singleton?: boolean
          smooth_landing_max_fpm?: number
          smooth_landing_min_fpm?: number
          smooth_tip_rate?: number
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
      special_missions: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          cargo_kg: number
          category: string
          completed_at: string | null
          created_at: string
          deadline_at: string | null
          deadline_hours: number
          delivered_late: boolean
          destination_icao: string
          distance_nm: number
          expires_at: string
          final_payout: number | null
          flight_id: string | null
          id: string
          origin_icao: string
          payout: number
          status: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          cargo_kg: number
          category: string
          completed_at?: string | null
          created_at?: string
          deadline_at?: string | null
          deadline_hours: number
          delivered_late?: boolean
          destination_icao: string
          distance_nm: number
          expires_at?: string
          final_payout?: number | null
          flight_id?: string | null
          id?: string
          origin_icao: string
          payout: number
          status?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          cargo_kg?: number
          category?: string
          completed_at?: string | null
          created_at?: string
          deadline_at?: string | null
          deadline_hours?: number
          delivered_late?: boolean
          destination_icao?: string
          distance_nm?: number
          expires_at?: string
          final_payout?: number | null
          flight_id?: string | null
          id?: string
          origin_icao?: string
          payout?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "special_missions_destination_icao_fkey"
            columns: ["destination_icao"]
            isOneToOne: false
            referencedRelation: "airports"
            referencedColumns: ["icao"]
          },
          {
            foreignKeyName: "special_missions_flight_id_fkey"
            columns: ["flight_id"]
            isOneToOne: false
            referencedRelation: "flights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "special_missions_origin_icao_fkey"
            columns: ["origin_icao"]
            isOneToOne: false
            referencedRelation: "airports"
            referencedColumns: ["icao"]
          },
        ]
      }
      used_aircraft_listings: {
        Row: {
          aircraft_type_id: string
          airframe_hours: number
          asking_price: number
          buyer_company_id: string | null
          catalog_price: number
          closed_at: string | null
          created_at: string
          depreciated_value: number
          fleet_aircraft_id: string | null
          id: string
          is_broker: boolean
          location_icao: string
          registration: string
          seller_company_id: string | null
          status: string
        }
        Insert: {
          aircraft_type_id: string
          airframe_hours: number
          asking_price: number
          buyer_company_id?: string | null
          catalog_price: number
          closed_at?: string | null
          created_at?: string
          depreciated_value: number
          fleet_aircraft_id?: string | null
          id?: string
          is_broker?: boolean
          location_icao: string
          registration: string
          seller_company_id?: string | null
          status?: string
        }
        Update: {
          aircraft_type_id?: string
          airframe_hours?: number
          asking_price?: number
          buyer_company_id?: string | null
          catalog_price?: number
          closed_at?: string | null
          created_at?: string
          depreciated_value?: number
          fleet_aircraft_id?: string | null
          id?: string
          is_broker?: boolean
          location_icao?: string
          registration?: string
          seller_company_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "used_aircraft_listings_aircraft_type_id_fkey"
            columns: ["aircraft_type_id"]
            isOneToOne: false
            referencedRelation: "aircraft_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "used_aircraft_listings_buyer_company_id_fkey"
            columns: ["buyer_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "used_aircraft_listings_fleet_aircraft_id_fkey"
            columns: ["fleet_aircraft_id"]
            isOneToOne: false
            referencedRelation: "fleet_aircraft"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "used_aircraft_listings_location_icao_fkey"
            columns: ["location_icao"]
            isOneToOne: false
            referencedRelation: "airports"
            referencedColumns: ["icao"]
          },
          {
            foreignKeyName: "used_aircraft_listings_seller_company_id_fkey"
            columns: ["seller_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
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
      accept_special_mission: {
        Args: { p_mission: string }
        Returns: undefined
      }
      act_as: { Args: { p_user: string }; Returns: string }
      admin_cancel_cleanup_flights: {
        Args: { p_flight_ids: string[] }
        Returns: undefined
      }
      admin_cleanup_company: {
        Args: { p_company_id: string }
        Returns: undefined
      }
      admin_company_supporters: {
        Args: never
        Returns: {
          company_id: string
          is_supporter: boolean
          user_id: string
        }[]
      }
      admin_delete_user_and_company: {
        Args: { p_user_id: string }
        Returns: Json
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
      admin_reset_company: { Args: { p_company_id: string }; Returns: Json }
      aircraft_finance: { Args: { p_aircraft: string }; Returns: Json }
      aircraft_physical_range_nm: { Args: { p_type: string }; Returns: number }
      aircraft_registration: {
        Args: { p_requested?: string; p_type: string }
        Returns: string
      }
      airport_distance_nm: {
        Args: { a_lat: number; a_lon: number; b_lat: number; b_lon: number }
        Returns: number
      }
      airport_fuel_capacity: {
        Args: { p_airport: string; p_fuel: string }
        Returns: number
      }
      airport_fuel_market_multiplier: {
        Args: { p_day?: string; p_icao: string }
        Returns: number
      }
      airport_fuel_market_price: {
        Args: { p_fuel: string; p_icao: string }
        Returns: number
      }
      airport_fuel_stock: {
        Args: { p_airport: string; p_fuel: string }
        Returns: number
      }
      assert_aircraft_tier_license: {
        Args: { p_tier: number }
        Returns: undefined
      }
      assert_company_investment: { Args: never; Returns: undefined }
      buy_personal_aircraft: {
        Args: { p_registration?: string; p_type: string }
        Returns: string
      }
      buy_stake: { Args: { p_company: string; p_pct: number }; Returns: string }
      buy_type_rating: { Args: { p_group: string }; Returns: undefined }
      buy_used_aircraft: { Args: { p_listing: string }; Returns: string }
      cancel_continuation: {
        Args: { f: Database["public"]["Tables"]["flights"]["Row"] }
        Returns: undefined
      }
      cancel_test_flight: { Args: { p_flight: string }; Returns: undefined }
      cancel_used_listing: { Args: { p_listing: string }; Returns: undefined }
      cargo_capacity: { Args: { p_airport: string }; Returns: number }
      cargo_stock: { Args: { p_airport: string }; Returns: number }
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
      depreciated_value: {
        Args: { p_hours: number; p_price: number }
        Returns: number
      }
      dispatch_destination_estimate: {
        Args: {
          p_aircraft_id: string
          p_all_cargo?: boolean
          p_cargo_kg?: number
          p_destination: string
        }
        Returns: Json
      }
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
      dispatch_flight_fueled: {
        Args: {
          p_aircraft: string
          p_all_cargo?: boolean
          p_cargo_kg?: number
          p_destination: string
          p_flight_number: string
          p_mission?: string
          p_target_fuel_gal?: number
        }
        Returns: string
      }
      dispatch_flight_full: {
        Args: {
          p_aircraft: string
          p_all_cargo?: boolean
          p_cargo_kg?: number
          p_destination: string
          p_flight_number: string
          p_mission?: string
        }
        Returns: string
      }
      dispatch_usable_range_pct: { Args: never; Returns: number }
      divert_action: {
        Args: { p_action: string; p_flight: string; p_target_fuel_gal?: number }
        Returns: Json
      }
      divert_leg_quote: {
        Args: {
          dest: string
          f: Database["public"]["Tables"]["flights"]["Row"]
          landing_only?: boolean
          target?: number
        }
        Returns: Json
      }
      economy_number: { Args: { p_key: string }; Returns: number }
      economy_number_or: {
        Args: { p_default: number; p_key: string }
        Returns: number
      }
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
      finalize_flight_weight: { Args: { q: Json }; Returns: Json }
      flight_fuel_billing: {
        Args: { p_source: string; p_telemetry: Json; q: Json }
        Returns: Json
      }
      flight_fuel_market: {
        Args: {
          p_company: string
          p_destination: string
          p_fuel: string
          p_origin: string
        }
        Returns: Json
      }
      flight_quote: {
        Args: { p_aircraft: string; p_destination: string }
        Returns: Json
      }
      flight_quote_cargo: {
        Args: { p_aircraft: string; p_destination: string }
        Returns: Json
      }
      flight_quote_fueled: {
        Args: {
          p_aircraft: string
          p_all_cargo?: boolean
          p_cargo_kg?: number
          p_destination: string
          p_mission?: string
          p_target_fuel_gal?: number
        }
        Returns: Json
      }
      flight_quote_full: {
        Args: {
          p_aircraft: string
          p_all_cargo?: boolean
          p_cargo_kg?: number
          p_destination: string
          p_mission?: string
        }
        Returns: Json
      }
      flight_quote_without_fobs: {
        Args: { p_aircraft: string; p_destination: string }
        Returns: Json
      }
      flight_tank_plan: {
        Args: { p_current: number; p_persistent: boolean; q: Json }
        Returns: Json
      }
      flight_weight_budget: {
        Args: { p_distance_nm: number; p_type: string }
        Returns: Json
      }
      fob_size_multiplier: { Args: { p_icao: string }; Returns: number }
      fob_weekly_cost: { Args: { p_base: string }; Returns: number }
      get_destination_alternatives: {
        Args: {
          p_aircraft_id: string
          p_all_cargo?: boolean
          p_cargo_kg?: number
          p_radius_nm?: number
          p_target_icao: string
          p_tiers?: number[]
        }
        Returns: {
          airport: Json
          distance_from_target_nm: number
          distance_nm: number
          estimate_error: string
          estimated_margin: number
          estimated_revenue: number
          margin_diff_vs_target: number
        }[]
      }
      get_dispatch_destination_deals: {
        Args: {
          p_aircraft_id: string
          p_all_cargo?: boolean
          p_cargo_kg?: number
          p_query?: string
          p_tiers?: number[]
        }
        Returns: {
          airport: Json
          distance_nm: number
          estimate_error: string
          estimated_margin: number
          estimated_revenue: number
          is_fbo: boolean
        }[]
      }
      get_dispatch_nearby_airports: {
        Args: { p_aircraft_id: string; p_tiers?: number[] }
        Returns: {
          airport: Json
          distance_nm: number
          is_fbo: boolean
        }[]
      }
      get_live_radar_flights: {
        Args: never
        Returns: {
          aircraft_model: string
          airline_name: string
          departed_at: string
          destination_icao: string
          destination_lat: number
          destination_lon: number
          eta_at: string
          execution_source: string
          flight_number: string
          id: string
          is_own: boolean
          last_altitude_ft: number
          last_groundspeed_kts: number
          last_heading: number
          last_lat: number
          last_lon: number
          last_telemetry_at: string
          origin_icao: string
          origin_lat: number
          origin_lon: number
          registration: string
          route_waypoints: Json
          status: string
        }[]
      }
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
      get_radar_world_activity: {
        Args: never
        Returns: {
          flights_7d: number
          grounded_aircraft_count: number
          icao: string
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
      lease_termination_quote: {
        Args: { p_aircraft_id: string }
        Returns: Json
      }
      leave_roster: { Args: never; Returns: undefined }
      list_used_aircraft: {
        Args: { p_aircraft: string; p_price: number }
        Returns: string
      }
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
      mark_flight_acars: { Args: { p_flight: string }; Returns: undefined }
      my_pilot_profile: { Args: never; Returns: Json }
      new_acars_key: { Args: never; Returns: string }
      next_flight_number: { Args: never; Returns: string }
      passenger_capacity: { Args: { p_airport: string }; Returns: number }
      passenger_landing_tip: {
        Args: {
          p_pax: number
          p_rules: Json
          p_source: string
          p_telemetry: Json
          p_tickets: number
        }
        Returns: Json
      }
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
      radar_airport_metrics:
        | {
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
        | {
            Args: { p_icaos: string[] }
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
      ramp_fuel_adjust: { Args: { p: Json; p_flight: string }; Returns: Json }
      record_divert: {
        Args: {
          dest: string
          evidence: Json
          f: Database["public"]["Tables"]["flights"]["Row"]
        }
        Returns: Json
      }
      recruitment_commission_settings: { Args: never; Returns: Json }
      refresh_special_missions: { Args: never; Returns: undefined }
      regenerate_acars_key: { Args: never; Returns: string }
      rent_aircraft: {
        Args: { p_registration?: string; p_type: string }
        Returns: string
      }
      replenish_broker_market: { Args: never; Returns: undefined }
      reset_airports_state: { Args: never; Returns: Json }
      restructure_company: { Args: never; Returns: undefined }
      runway_is_unpaved: {
        Args: { p_runway_ft: number; p_size: number; p_surface: string }
        Returns: boolean
      }
      search_airports: {
        Args: {
          p_limit?: number
          p_min_runway_ft?: number
          p_origin_icao?: string
          p_query: string
          p_tiers?: number[]
        }
        Returns: {
          airport: Json
          distance_nm: number
          is_fbo: boolean
        }[]
      }
      sell_stake: { Args: { p_stake: string }; Returns: number }
      set_company_hiring: {
        Args: { p_freelance: number; p_hiring: boolean; p_roster: number }
        Returns: undefined
      }
      set_company_supporter: {
        Args: { p_company: string; p_supporter: boolean }
        Returns: undefined
      }
      set_flight_route: {
        Args: { p_flight: string; p_waypoints: Json }
        Returns: undefined
      }
      set_stake_offer: { Args: { p_pct: number }; Returns: undefined }
      set_target_fuel: {
        Args: { p_aircraft: string; p_target: number }
        Returns: {
          cur: number
          persistent: boolean
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
      spot_rental_price: { Args: { p_weekly: number }; Returns: number }
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
      terminate_lease_early: { Args: { p_aircraft_id: string }; Returns: Json }
      test_divert: {
        Args: { p_airport: string; p_flight: string }
        Returns: Json
      }
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
      used_market: {
        Args: never
        Returns: {
          aircraft_type_id: string
          airframe_hours: number
          airport_name: string
          asking_price: number
          catalog_price: number
          created_at: string
          depreciated_value: number
          id: string
          is_broker: boolean
          is_mine: boolean
          location_icao: string
          manufacturer: string
          model: string
          registration: string
          seller_name: string
          tier: number
        }[]
      }
      world_registration_defaults: {
        Args: never
        Returns: {
          alphabet: string
          country: string
          prefix: string
          source: string
          suffix_length: number
          suffix_pattern: string
        }[]
      }
      world_telemetry: { Args: never; Returns: Json }
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
