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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      account_lockouts: {
        Row: {
          created_at: string | null
          email: string
          failed_attempts: number | null
          id: string
          locked_until: string
          requires_email_unlock: boolean | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          failed_attempts?: number | null
          id?: string
          locked_until: string
          requires_email_unlock?: boolean | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          failed_attempts?: number | null
          id?: string
          locked_until?: string
          requires_email_unlock?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      admin_action_otp_tokens: {
        Row: {
          action_type: string
          attempts: number
          created_at: string
          email: string
          expires_at: string
          id: string
          otp_hash: string
          target_id: string | null
          used_at: string | null
        }
        Insert: {
          action_type: string
          attempts?: number
          created_at?: string
          email: string
          expires_at: string
          id?: string
          otp_hash: string
          target_id?: string | null
          used_at?: string | null
        }
        Update: {
          action_type?: string
          attempts?: number
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          otp_hash?: string
          target_id?: string | null
          used_at?: string | null
        }
        Relationships: []
      }
      admin_activity_logs: {
        Row: {
          action_category: string
          action_type: string
          admin_email: string
          admin_name: string | null
          admin_type: string | null
          admin_user_id: string
          created_at: string | null
          description: string
          id: string
          ip_address: string | null
          metadata: Json | null
          user_agent: string | null
        }
        Insert: {
          action_category: string
          action_type: string
          admin_email: string
          admin_name?: string | null
          admin_type?: string | null
          admin_user_id: string
          created_at?: string | null
          description: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          user_agent?: string | null
        }
        Update: {
          action_category?: string
          action_type?: string
          admin_email?: string
          admin_name?: string | null
          admin_type?: string | null
          admin_user_id?: string
          created_at?: string | null
          description?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          user_agent?: string | null
        }
        Relationships: []
      }
      admin_billing_events: {
        Row: {
          amount_cents: number | null
          client_id: string | null
          created_at: string
          currency: string | null
          event_type: string
          id: string
          metadata: Json
          stripe_event_id: string | null
          stripe_object_id: string
        }
        Insert: {
          amount_cents?: number | null
          client_id?: string | null
          created_at?: string
          currency?: string | null
          event_type: string
          id?: string
          metadata?: Json
          stripe_event_id?: string | null
          stripe_object_id: string
        }
        Update: {
          amount_cents?: number | null
          client_id?: string | null
          created_at?: string
          currency?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          stripe_event_id?: string | null
          stripe_object_id?: string
        }
        Relationships: []
      }
      admin_logging_information: {
        Row: {
          action_category: string
          action_type: string
          admin_email: string
          admin_name: string | null
          admin_user_id: string
          created_at: string
          description: string
          id: string
          ip_address: string | null
          metadata: Json | null
          resource_id: string | null
          resource_type: string | null
          target_client_id: string | null
          target_client_name: string | null
          user_agent: string | null
        }
        Insert: {
          action_category: string
          action_type: string
          admin_email: string
          admin_name?: string | null
          admin_user_id: string
          created_at?: string
          description: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          resource_id?: string | null
          resource_type?: string | null
          target_client_id?: string | null
          target_client_name?: string | null
          user_agent?: string | null
        }
        Update: {
          action_category?: string
          action_type?: string
          admin_email?: string
          admin_name?: string | null
          admin_user_id?: string
          created_at?: string
          description?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          resource_id?: string | null
          resource_type?: string | null
          target_client_id?: string | null
          target_client_name?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_logging_information_target_client_id_fkey"
            columns: ["target_client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_logging_information_target_client_id_fkey"
            columns: ["target_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_notifications: {
        Row: {
          category: string
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string | null
          metadata: Json | null
          title: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string | null
          metadata?: Json | null
          title: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string | null
          metadata?: Json | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      admin_staff_client_access: {
        Row: {
          admin_staff_id: string
          client_id: string
          created_at: string
          id: string
        }
        Insert: {
          admin_staff_id: string
          client_id: string
          created_at?: string
          id?: string
        }
        Update: {
          admin_staff_id?: string
          client_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_staff_client_access_admin_staff_id_fkey"
            columns: ["admin_staff_id"]
            isOneToOne: false
            referencedRelation: "admin_staff_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_staff_client_access_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_staff_client_access_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_staff_members: {
        Row: {
          created_at: string
          email: string
          id: string
          is_super_admin: boolean
          name: string
          phone: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          is_super_admin?: boolean
          name: string
          phone?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          is_super_admin?: boolean
          name?: string
          phone?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      agencies: {
        Row: {
          created_at: string | null
          id: string
          logo_url: string | null
          name: string
          primary_color: string | null
          secondary_color: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          logo_url?: string | null
          name: string
          primary_color?: string | null
          secondary_color?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          primary_color?: string | null
          secondary_color?: string | null
        }
        Relationships: []
      }
      ai_chat_messages: {
        Row: {
          content: string
          created_at: string | null
          id: string
          intent: string | null
          role: string
          session_id: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          intent?: string | null
          role: string
          session_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          intent?: string | null
          role?: string
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "ai_chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_chat_sessions: {
        Row: {
          client_id: string | null
          configuration_applied: boolean | null
          configuration_data: Json | null
          design_saved: boolean | null
          ended_at: string | null
          id: string
          message_count: number | null
          session_id: string
          started_at: string | null
        }
        Insert: {
          client_id?: string | null
          configuration_applied?: boolean | null
          configuration_data?: Json | null
          design_saved?: boolean | null
          ended_at?: string | null
          id?: string
          message_count?: number | null
          session_id: string
          started_at?: string | null
        }
        Update: {
          client_id?: string | null
          configuration_applied?: boolean | null
          configuration_data?: Json | null
          design_saved?: boolean | null
          ended_at?: string | null
          id?: string
          message_count?: number | null
          session_id?: string
          started_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_chat_sessions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_chat_sessions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_response_cache: {
        Row: {
          cache_key: string
          client_id: string
          created_at: string
          expires_at: string
          feature: string
          id: string
          response_data: Json
        }
        Insert: {
          cache_key: string
          client_id: string
          created_at?: string
          expires_at: string
          feature: string
          id?: string
          response_data: Json
        }
        Update: {
          cache_key?: string
          client_id?: string
          created_at?: string
          expires_at?: string
          feature?: string
          id?: string
          response_data?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ai_response_cache_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_response_cache_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_system_prompts: {
        Row: {
          description: string
          id: string
          label: string
          prompt_key: string
          prompt_text: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          description?: string
          id?: string
          label: string
          prompt_key: string
          prompt_text?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          description?: string
          id?: string
          label?: string
          prompt_key?: string
          prompt_text?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      ai_training_examples: {
        Row: {
          answer: string
          client_id: string | null
          created_at: string | null
          id: string
          question: string
        }
        Insert: {
          answer: string
          client_id?: string | null
          created_at?: string | null
          id?: string
          question: string
        }
        Update: {
          answer?: string
          client_id?: string | null
          created_at?: string | null
          id?: string
          question?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_training_examples_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_training_examples_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_logs: {
        Row: {
          cached: boolean | null
          client_id: string
          created_at: string
          feature: string
          id: string
          input_tokens: number | null
          model: string
          output_tokens: number | null
          over_quota: boolean
        }
        Insert: {
          cached?: boolean | null
          client_id: string
          created_at?: string
          feature: string
          id?: string
          input_tokens?: number | null
          model: string
          output_tokens?: number | null
          over_quota?: boolean
        }
        Update: {
          cached?: boolean | null
          client_id?: string
          created_at?: string
          feature?: string
          id?: string
          input_tokens?: number | null
          model?: string
          output_tokens?: number | null
          over_quota?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_monthly_summary: {
        Row: {
          cached_requests: number
          client_id: string
          created_at: string
          feature: string
          id: string
          month: string
          total_input_tokens: number
          total_output_tokens: number
          total_requests: number
        }
        Insert: {
          cached_requests?: number
          client_id: string
          created_at?: string
          feature: string
          id?: string
          month: string
          total_input_tokens?: number
          total_output_tokens?: number
          total_requests?: number
        }
        Update: {
          cached_requests?: number
          client_id?: string
          created_at?: string
          feature?: string
          id?: string
          month?: string
          total_input_tokens?: number
          total_output_tokens?: number
          total_requests?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_monthly_summary_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_monthly_summary_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_events: {
        Row: {
          client_id: string | null
          created_at: string | null
          event_type: Database["public"]["Enums"]["analytics_event_type"]
          id: string
          idempotency_key: string | null
          metadata: Json | null
          product_id: string | null
          variation_id: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          event_type: Database["public"]["Enums"]["analytics_event_type"]
          id?: string
          idempotency_key?: string | null
          metadata?: Json | null
          product_id?: string | null
          variation_id?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          event_type?: Database["public"]["Enums"]["analytics_event_type"]
          id?: string
          idempotency_key?: string | null
          metadata?: Json | null
          product_id?: string | null
          variation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_events_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_events_variation_id_fkey"
            columns: ["variation_id"]
            isOneToOne: false
            referencedRelation: "product_variations"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_bookings: {
        Row: {
          client_id: string | null
          created_at: string
          customer_email: string
          customer_name: string
          customer_phone: string | null
          customer_timezone: string | null
          device_info: Json | null
          follow_up_status: string | null
          id: string
          message: string | null
          preferred_date: string | null
          preferred_time: string | null
          ring_configuration: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          customer_email: string
          customer_name: string
          customer_phone?: string | null
          customer_timezone?: string | null
          device_info?: Json | null
          follow_up_status?: string | null
          id?: string
          message?: string | null
          preferred_date?: string | null
          preferred_time?: string | null
          ring_configuration?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          customer_email?: string
          customer_name?: string
          customer_phone?: string | null
          customer_timezone?: string | null
          device_info?: Json | null
          follow_up_status?: string | null
          id?: string
          message?: string | null
          preferred_date?: string | null
          preferred_time?: string | null
          ring_configuration?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_bookings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_bookings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action_type: string
          changes: Json | null
          id: string
          ip_address: unknown
          metadata: Json | null
          resource_id: string | null
          resource_type: string | null
          severity: string | null
          timestamp: string
          user_agent: string | null
          user_email: string | null
          user_id: string | null
          user_role: string | null
        }
        Insert: {
          action_type: string
          changes?: Json | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          resource_id?: string | null
          resource_type?: string | null
          severity?: string | null
          timestamp?: string
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
          user_role?: string | null
        }
        Update: {
          action_type?: string
          changes?: Json | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          resource_id?: string | null
          resource_type?: string | null
          severity?: string | null
          timestamp?: string
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
          user_role?: string | null
        }
        Relationships: []
      }
      backup_logs: {
        Row: {
          backup_date: string | null
          backup_type: string
          created_at: string | null
          error_message: string | null
          file_path: string | null
          file_size_mb: number | null
          id: string
          metadata: Json | null
          status: string
          tables_backed_up: string[] | null
        }
        Insert: {
          backup_date?: string | null
          backup_type: string
          created_at?: string | null
          error_message?: string | null
          file_path?: string | null
          file_size_mb?: number | null
          id?: string
          metadata?: Json | null
          status?: string
          tables_backed_up?: string[] | null
        }
        Update: {
          backup_date?: string | null
          backup_type?: string
          created_at?: string | null
          error_message?: string | null
          file_path?: string | null
          file_size_mb?: number | null
          id?: string
          metadata?: Json | null
          status?: string
          tables_backed_up?: string[] | null
        }
        Relationships: []
      }
      band_type_options: {
        Row: {
          created_at: string
          display_order: number
          id: string
          image_url: string | null
          name: string
          option_value: string
          price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string | null
          name: string
          option_value: string
          price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string | null
          name?: string
          option_value?: string
          price?: number
          updated_at?: string
        }
        Relationships: []
      }
      band_width_options: {
        Row: {
          created_at: string
          display_order: number
          id: string
          image_url: string | null
          name: string
          option_value: string
          price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string | null
          name: string
          option_value: string
          price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string | null
          name?: string
          option_value?: string
          price?: number
          updated_at?: string
        }
        Relationships: []
      }
      cad_request_messages: {
        Row: {
          cad_request_id: string
          created_at: string | null
          file_urls: string[] | null
          id: string
          message: string | null
          sender_id: string
          sender_name: string
          sender_role: string
        }
        Insert: {
          cad_request_id: string
          created_at?: string | null
          file_urls?: string[] | null
          id?: string
          message?: string | null
          sender_id: string
          sender_name: string
          sender_role: string
        }
        Update: {
          cad_request_id?: string
          created_at?: string | null
          file_urls?: string[] | null
          id?: string
          message?: string | null
          sender_id?: string
          sender_name?: string
          sender_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "cad_request_messages_cad_request_id_fkey"
            columns: ["cad_request_id"]
            isOneToOne: false
            referencedRelation: "cad_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      cad_requests: {
        Row: {
          admin_notes: string | null
          band: string | null
          bottom_teeth: string | null
          budget: string | null
          cad_file_urls: string[] | null
          carat_size: string | null
          center_stone_specs: string | null
          chain_link_style: string | null
          clasp_bail_details: string | null
          client_feedback: string | null
          client_id: string
          client_notes: string | null
          created_at: string | null
          custom_description: string | null
          customer_email: string | null
          customer_name: string | null
          delivered_at: string | null
          dental_impression_type: string | null
          engraving_text: string | null
          gallery_comfort: string | null
          grillz_type: string | null
          halo_pave_layout: string | null
          id: string
          is_custom_ring: boolean | null
          jeweler_reference_source: string | null
          jeweler_reference_urls: string[] | null
          jewelry_type: string | null
          lead_id: string | null
          lead_table: string | null
          length_width: string | null
          metal_purity: string | null
          metal_type: string | null
          order_id: string | null
          pattern_design: string | null
          priority: string | null
          reference_images: string[] | null
          request_number: number
          requested_by: string
          ring_combination_id: string | null
          ring_product_name: string | null
          ring_size: string | null
          setting: string | null
          shank_width: string | null
          shape: string | null
          source: string
          status: string
          style: string | null
          timeline: string | null
          tooth_coverage: string | null
          top_teeth: string | null
          updated_at: string | null
        }
        Insert: {
          admin_notes?: string | null
          band?: string | null
          bottom_teeth?: string | null
          budget?: string | null
          cad_file_urls?: string[] | null
          carat_size?: string | null
          center_stone_specs?: string | null
          chain_link_style?: string | null
          clasp_bail_details?: string | null
          client_feedback?: string | null
          client_id: string
          client_notes?: string | null
          created_at?: string | null
          custom_description?: string | null
          customer_email?: string | null
          customer_name?: string | null
          delivered_at?: string | null
          dental_impression_type?: string | null
          engraving_text?: string | null
          gallery_comfort?: string | null
          grillz_type?: string | null
          halo_pave_layout?: string | null
          id?: string
          is_custom_ring?: boolean | null
          jeweler_reference_source?: string | null
          jeweler_reference_urls?: string[] | null
          jewelry_type?: string | null
          lead_id?: string | null
          lead_table?: string | null
          length_width?: string | null
          metal_purity?: string | null
          metal_type?: string | null
          order_id?: string | null
          pattern_design?: string | null
          priority?: string | null
          reference_images?: string[] | null
          request_number?: number
          requested_by: string
          ring_combination_id?: string | null
          ring_product_name?: string | null
          ring_size?: string | null
          setting?: string | null
          shank_width?: string | null
          shape?: string | null
          source?: string
          status?: string
          style?: string | null
          timeline?: string | null
          tooth_coverage?: string | null
          top_teeth?: string | null
          updated_at?: string | null
        }
        Update: {
          admin_notes?: string | null
          band?: string | null
          bottom_teeth?: string | null
          budget?: string | null
          cad_file_urls?: string[] | null
          carat_size?: string | null
          center_stone_specs?: string | null
          chain_link_style?: string | null
          clasp_bail_details?: string | null
          client_feedback?: string | null
          client_id?: string
          client_notes?: string | null
          created_at?: string | null
          custom_description?: string | null
          customer_email?: string | null
          customer_name?: string | null
          delivered_at?: string | null
          dental_impression_type?: string | null
          engraving_text?: string | null
          gallery_comfort?: string | null
          grillz_type?: string | null
          halo_pave_layout?: string | null
          id?: string
          is_custom_ring?: boolean | null
          jeweler_reference_source?: string | null
          jeweler_reference_urls?: string[] | null
          jewelry_type?: string | null
          lead_id?: string | null
          lead_table?: string | null
          length_width?: string | null
          metal_purity?: string | null
          metal_type?: string | null
          order_id?: string | null
          pattern_design?: string | null
          priority?: string | null
          reference_images?: string[] | null
          request_number?: number
          requested_by?: string
          ring_combination_id?: string | null
          ring_product_name?: string | null
          ring_size?: string | null
          setting?: string | null
          shank_width?: string | null
          shape?: string | null
          source?: string
          status?: string
          style?: string | null
          timeline?: string | null
          tooth_coverage?: string | null
          top_teeth?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cad_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cad_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cad_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      cad_resize_requests: {
        Row: {
          admin_notes: string | null
          client_id: string
          created_at: string | null
          current_size: string
          id: string
          metal_type: string | null
          order_id: string
          product_name: string | null
          requested_by: string
          requested_size: string
          shape: string | null
          status: string
          style: string | null
          updated_at: string | null
        }
        Insert: {
          admin_notes?: string | null
          client_id: string
          created_at?: string | null
          current_size?: string
          id?: string
          metal_type?: string | null
          order_id: string
          product_name?: string | null
          requested_by: string
          requested_size: string
          shape?: string | null
          status?: string
          style?: string | null
          updated_at?: string | null
        }
        Update: {
          admin_notes?: string | null
          client_id?: string
          created_at?: string | null
          current_size?: string
          id?: string
          metal_type?: string | null
          order_id?: string
          product_name?: string | null
          requested_by?: string
          requested_size?: string
          shape?: string | null
          status?: string
          style?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cad_resize_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cad_resize_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cad_resize_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      carat_size_images: {
        Row: {
          created_at: string
          diamond_shape: string
          folder_path: string | null
          id: string
          image_0_filename: string | null
          image_1_filename: string | null
          image_2_filename: string | null
          image_3_filename: string | null
          image_4_filename: string | null
          image_5_filename: string | null
          image_6_filename: string | null
          image_7_filename: string | null
          image_8_filename: string | null
        }
        Insert: {
          created_at?: string
          diamond_shape: string
          folder_path?: string | null
          id?: string
          image_0_filename?: string | null
          image_1_filename?: string | null
          image_2_filename?: string | null
          image_3_filename?: string | null
          image_4_filename?: string | null
          image_5_filename?: string | null
          image_6_filename?: string | null
          image_7_filename?: string | null
          image_8_filename?: string | null
        }
        Update: {
          created_at?: string
          diamond_shape?: string
          folder_path?: string | null
          id?: string
          image_0_filename?: string | null
          image_1_filename?: string | null
          image_2_filename?: string | null
          image_3_filename?: string | null
          image_4_filename?: string | null
          image_5_filename?: string | null
          image_6_filename?: string | null
          image_7_filename?: string | null
          image_8_filename?: string | null
        }
        Relationships: []
      }
      client_access_events: {
        Row: {
          actor: string | null
          after_state: Json
          before_state: Json
          client_id: string
          created_at: string
          event_type: string
          granted_keys: string[]
          id: string
          notified_at: string | null
          notify_error: string | null
          revoked_keys: string[]
          severity: string
          source: string | null
        }
        Insert: {
          actor?: string | null
          after_state?: Json
          before_state?: Json
          client_id: string
          created_at?: string
          event_type: string
          granted_keys?: string[]
          id?: string
          notified_at?: string | null
          notify_error?: string | null
          revoked_keys?: string[]
          severity?: string
          source?: string | null
        }
        Update: {
          actor?: string | null
          after_state?: Json
          before_state?: Json
          client_id?: string
          created_at?: string
          event_type?: string
          granted_keys?: string[]
          id?: string
          notified_at?: string | null
          notify_error?: string | null
          revoked_keys?: string[]
          severity?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_access_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_access_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_activity_logs: {
        Row: {
          action_category: string
          action_type: string
          client_id: string
          created_at: string
          description: string
          id: string
          ip_address: string | null
          metadata: Json | null
          user_agent: string | null
          user_email: string
          user_id: string
          user_name: string | null
          user_type: string
        }
        Insert: {
          action_category: string
          action_type: string
          client_id: string
          created_at?: string
          description: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          user_agent?: string | null
          user_email: string
          user_id: string
          user_name?: string | null
          user_type: string
        }
        Update: {
          action_category?: string
          action_type?: string
          client_id?: string
          created_at?: string
          description?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          user_agent?: string | null
          user_email?: string
          user_id?: string
          user_name?: string | null
          user_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_activity_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_activity_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_ai_quotas: {
        Row: {
          chat_quota: number
          chat_rpm: number | null
          client_id: string
          cost_estimate_rpm: number | null
          created_at: string
          id: string
          image_quota: number
          image_rpm: number | null
          is_custom: boolean
          updated_at: string
        }
        Insert: {
          chat_quota?: number
          chat_rpm?: number | null
          client_id: string
          cost_estimate_rpm?: number | null
          created_at?: string
          id?: string
          image_quota?: number
          image_rpm?: number | null
          is_custom?: boolean
          updated_at?: string
        }
        Update: {
          chat_quota?: number
          chat_rpm?: number | null
          client_id?: string
          cost_estimate_rpm?: number | null
          created_at?: string
          id?: string
          image_quota?: number
          image_rpm?: number | null
          is_custom?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_ai_quotas_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_ai_quotas_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_auto_recharge_settings: {
        Row: {
          client_id: string
          created_at: string
          enabled: boolean
          id: string
          last_failed_at: string | null
          last_failure_reason: string | null
          last_recharged_at: string | null
          payment_method_brand: string | null
          payment_method_last4: string | null
          recharge_amount: number
          stripe_payment_method_id: string | null
          threshold_amount: number
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          enabled?: boolean
          id?: string
          last_failed_at?: string | null
          last_failure_reason?: string | null
          last_recharged_at?: string | null
          payment_method_brand?: string | null
          payment_method_last4?: string | null
          recharge_amount?: number
          stripe_payment_method_id?: string | null
          threshold_amount?: number
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          enabled?: boolean
          id?: string
          last_failed_at?: string | null
          last_failure_reason?: string | null
          last_recharged_at?: string | null
          payment_method_brand?: string | null
          payment_method_last4?: string | null
          recharge_amount?: number
          stripe_payment_method_id?: string | null
          threshold_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_auto_recharge_settings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_auto_recharge_settings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_availability_schedule: {
        Row: {
          client_id: string
          created_at: string
          date_overrides: Json
          slot_duration_minutes: number
          timezone: string
          updated_at: string
          weekly_hours: Json
        }
        Insert: {
          client_id: string
          created_at?: string
          date_overrides?: Json
          slot_duration_minutes?: number
          timezone?: string
          updated_at?: string
          weekly_hours?: Json
        }
        Update: {
          client_id?: string
          created_at?: string
          date_overrides?: Json
          slot_duration_minutes?: number
          timezone?: string
          updated_at?: string
          weekly_hours?: Json
        }
        Relationships: [
          {
            foreignKeyName: "client_availability_schedule_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_availability_schedule_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_cad_addons: {
        Row: {
          addon_kind: string
          amount_cents: number
          client_id: string
          consumed_at: string | null
          consumed_by_cad_request_id: string | null
          currency: string
          granted_at: string
          id: string
          metadata: Json
          stripe_price_id: string | null
          stripe_session_id: string
        }
        Insert: {
          addon_kind: string
          amount_cents?: number
          client_id: string
          consumed_at?: string | null
          consumed_by_cad_request_id?: string | null
          currency?: string
          granted_at?: string
          id?: string
          metadata?: Json
          stripe_price_id?: string | null
          stripe_session_id: string
        }
        Update: {
          addon_kind?: string
          amount_cents?: number
          client_id?: string
          consumed_at?: string | null
          consumed_by_cad_request_id?: string | null
          currency?: string
          granted_at?: string
          id?: string
          metadata?: Json
          stripe_price_id?: string | null
          stripe_session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_cad_addons_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_cad_addons_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_carat_options: {
        Row: {
          carat_value: number
          client_id: string
          created_at: string | null
          display_name: string
          id: string
          image_filename_0: string | null
          image_filename_1: string | null
          image_filename_2: string | null
          image_filename_3: string | null
          image_filename_4: string | null
          image_filename_5: string | null
          image_filename_6: string | null
          image_filename_7: string | null
          images_filepath: string | null
          is_enabled: boolean | null
          price_adjustment: number | null
        }
        Insert: {
          carat_value: number
          client_id: string
          created_at?: string | null
          display_name: string
          id?: string
          image_filename_0?: string | null
          image_filename_1?: string | null
          image_filename_2?: string | null
          image_filename_3?: string | null
          image_filename_4?: string | null
          image_filename_5?: string | null
          image_filename_6?: string | null
          image_filename_7?: string | null
          images_filepath?: string | null
          is_enabled?: boolean | null
          price_adjustment?: number | null
        }
        Update: {
          carat_value?: number
          client_id?: string
          created_at?: string | null
          display_name?: string
          id?: string
          image_filename_0?: string | null
          image_filename_1?: string | null
          image_filename_2?: string | null
          image_filename_3?: string | null
          image_filename_4?: string | null
          image_filename_5?: string | null
          image_filename_6?: string | null
          image_filename_7?: string | null
          images_filepath?: string | null
          is_enabled?: boolean | null
          price_adjustment?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "client_carat_options_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_carat_options_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_catalog_health: {
        Row: {
          catalog_version: string | null
          client_id: string
          filter_hash: string | null
          last_error: string | null
          last_refresh_at: string
          missing_combinations: number
          pool_coverage_pct: number
          presets_count: number
          updated_at: string
        }
        Insert: {
          catalog_version?: string | null
          client_id: string
          filter_hash?: string | null
          last_error?: string | null
          last_refresh_at?: string
          missing_combinations?: number
          pool_coverage_pct?: number
          presets_count?: number
          updated_at?: string
        }
        Update: {
          catalog_version?: string | null
          client_id?: string
          filter_hash?: string | null
          last_error?: string | null
          last_refresh_at?: string
          missing_combinations?: number
          pool_coverage_pct?: number
          presets_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      client_contacts: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          client_id: string
          company: string | null
          country: string | null
          created_at: string
          email: string | null
          first_name: string
          id: string
          last_name: string | null
          notes: string | null
          phone: string | null
          postal_code: string | null
          state: string | null
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          client_id: string
          company?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          first_name: string
          id?: string
          last_name?: string | null
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          state?: string | null
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          client_id?: string
          company?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string | null
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          state?: string | null
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_custom_enquiry_config: {
        Row: {
          ai_image_delivery: string
          ai_image_enabled: boolean
          budget_options: string[] | null
          client_id: string
          created_at: string
          deposit_amount: number | null
          design_option_catalog: Json | null
          design_option_notes: Json | null
          diamond_qualities: string[] | null
          diamond_setup_options: string[] | null
          enabled_steps: Json | null
          form_colors: Json | null
          gold_colors: Json | null
          id: string
          jewelry_types: string[] | null
          karat_options: string[] | null
          onboarding_completed: boolean | null
          option_image_overrides: Json
          required_contact_fields: Json
          shopify_product_id: string | null
          shopify_variant_id: string | null
          step_groups: Json | null
          step_labels: Json | null
          step_order: Json | null
          submission_mode: string
          thank_you_contact: Json | null
          timeline_options: string[]
          updated_at: string
        }
        Insert: {
          ai_image_delivery?: string
          ai_image_enabled?: boolean
          budget_options?: string[] | null
          client_id: string
          created_at?: string
          deposit_amount?: number | null
          design_option_catalog?: Json | null
          design_option_notes?: Json | null
          diamond_qualities?: string[] | null
          diamond_setup_options?: string[] | null
          enabled_steps?: Json | null
          form_colors?: Json | null
          gold_colors?: Json | null
          id?: string
          jewelry_types?: string[] | null
          karat_options?: string[] | null
          onboarding_completed?: boolean | null
          option_image_overrides?: Json
          required_contact_fields?: Json
          shopify_product_id?: string | null
          shopify_variant_id?: string | null
          step_groups?: Json | null
          step_labels?: Json | null
          step_order?: Json | null
          submission_mode?: string
          thank_you_contact?: Json | null
          timeline_options?: string[]
          updated_at?: string
        }
        Update: {
          ai_image_delivery?: string
          ai_image_enabled?: boolean
          budget_options?: string[] | null
          client_id?: string
          created_at?: string
          deposit_amount?: number | null
          design_option_catalog?: Json | null
          design_option_notes?: Json | null
          diamond_qualities?: string[] | null
          diamond_setup_options?: string[] | null
          enabled_steps?: Json | null
          form_colors?: Json | null
          gold_colors?: Json | null
          id?: string
          jewelry_types?: string[] | null
          karat_options?: string[] | null
          onboarding_completed?: boolean | null
          option_image_overrides?: Json
          required_contact_fields?: Json
          shopify_product_id?: string | null
          shopify_variant_id?: string | null
          step_groups?: Json | null
          step_labels?: Json | null
          step_order?: Json | null
          submission_mode?: string
          thank_you_contact?: Json | null
          timeline_options?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_custom_enquiry_config_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_custom_enquiry_config_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_custom_enquiry_questions: {
        Row: {
          client_id: string
          created_at: string
          display_order: number | null
          has_file_followup: boolean | null
          has_text_followup: boolean | null
          id: string
          is_default: boolean | null
          is_enabled: boolean | null
          is_required: boolean
          option_images: Json | null
          options: Json | null
          question_key: string
          question_text: string
          question_type: string
          subtitle: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          display_order?: number | null
          has_file_followup?: boolean | null
          has_text_followup?: boolean | null
          id?: string
          is_default?: boolean | null
          is_enabled?: boolean | null
          is_required?: boolean
          option_images?: Json | null
          options?: Json | null
          question_key: string
          question_text: string
          question_type?: string
          subtitle?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          display_order?: number | null
          has_file_followup?: boolean | null
          has_text_followup?: boolean | null
          id?: string
          is_default?: boolean | null
          is_enabled?: boolean | null
          is_required?: boolean
          option_images?: Json | null
          options?: Json | null
          question_key?: string
          question_text?: string
          question_type?: string
          subtitle?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_custom_enquiry_questions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_custom_enquiry_questions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_diamond_availability_cache: {
        Row: {
          availability: Json
          client_id: string
          computed_at: string | null
          created_at: string
          duration_ms: number | null
          is_stale: boolean
          updated_at: string
        }
        Insert: {
          availability?: Json
          client_id: string
          computed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          is_stale?: boolean
          updated_at?: string
        }
        Update: {
          availability?: Json
          client_id?: string
          computed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          is_stale?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_diamond_availability_cache_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_diamond_availability_cache_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_diamond_catalog_filter: {
        Row: {
          applied_at: string | null
          catalog_version: string | null
          client_id: string
          confirmed_at: string | null
          created_at: string
          filter: Json
          is_confirmed: boolean
          markup_lab: number
          markup_natural: number
          updated_at: string
        }
        Insert: {
          applied_at?: string | null
          catalog_version?: string | null
          client_id: string
          confirmed_at?: string | null
          created_at?: string
          filter?: Json
          is_confirmed?: boolean
          markup_lab?: number
          markup_natural?: number
          updated_at?: string
        }
        Update: {
          applied_at?: string | null
          catalog_version?: string | null
          client_id?: string
          confirmed_at?: string | null
          created_at?: string
          filter?: Json
          is_confirmed?: boolean
          markup_lab?: number
          markup_natural?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_diamond_catalog_filter_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_diamond_catalog_filter_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_diamond_presets: {
        Row: {
          base_price: number
          carat_range: string
          carat_value: number
          catalog_version: string | null
          certification: string | null
          clarity: string
          client_id: string
          color: string
          compare_at_price: number | null
          created_at: string
          currency: string | null
          custom_price: number | null
          cut_grade: string | null
          fluorescence: string | null
          id: string
          is_enabled: boolean | null
          markup_percentage: number | null
          origin: string | null
          polish: string | null
          pool_stock_count: number
          product_title: string | null
          report_no: string | null
          shape_id: string
          sku: string | null
          source_pool_id: string | null
          stone_type: string
          symmetry: string | null
          updated_at: string
        }
        Insert: {
          base_price?: number
          carat_range: string
          carat_value: number
          catalog_version?: string | null
          certification?: string | null
          clarity: string
          client_id: string
          color: string
          compare_at_price?: number | null
          created_at?: string
          currency?: string | null
          custom_price?: number | null
          cut_grade?: string | null
          fluorescence?: string | null
          id?: string
          is_enabled?: boolean | null
          markup_percentage?: number | null
          origin?: string | null
          polish?: string | null
          pool_stock_count?: number
          product_title?: string | null
          report_no?: string | null
          shape_id: string
          sku?: string | null
          source_pool_id?: string | null
          stone_type: string
          symmetry?: string | null
          updated_at?: string
        }
        Update: {
          base_price?: number
          carat_range?: string
          carat_value?: number
          catalog_version?: string | null
          certification?: string | null
          clarity?: string
          client_id?: string
          color?: string
          compare_at_price?: number | null
          created_at?: string
          currency?: string | null
          custom_price?: number | null
          cut_grade?: string | null
          fluorescence?: string | null
          id?: string
          is_enabled?: boolean | null
          markup_percentage?: number | null
          origin?: string | null
          polish?: string | null
          pool_stock_count?: number
          product_title?: string | null
          report_no?: string | null
          shape_id?: string
          sku?: string | null
          source_pool_id?: string | null
          stone_type?: string
          symmetry?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_diamond_presets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_diamond_presets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_diamond_presets_source_pool_id_fkey"
            columns: ["source_pool_id"]
            isOneToOne: false
            referencedRelation: "diamond_inventory_pool"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_diamond_presets_source_pool_id_fkey"
            columns: ["source_pool_id"]
            isOneToOne: false
            referencedRelation: "diamond_pool_group_reps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_diamond_presets_source_pool_id_fkey"
            columns: ["source_pool_id"]
            isOneToOne: false
            referencedRelation: "diamond_pool_group_reps_engine"
            referencedColumns: ["id"]
          },
        ]
      }
      client_diamond_step_overrides: {
        Row: {
          client_id: string
          created_at: string
          custom_image_url: string | null
          custom_name: string | null
          custom_price: number | null
          display_order: number | null
          id: string
          is_enabled: boolean | null
          option_id: string
          step_type: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          custom_image_url?: string | null
          custom_name?: string | null
          custom_price?: number | null
          display_order?: number | null
          id?: string
          is_enabled?: boolean | null
          option_id: string
          step_type: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          custom_image_url?: string | null
          custom_name?: string | null
          custom_price?: number | null
          display_order?: number | null
          id?: string
          is_enabled?: boolean | null
          option_id?: string
          step_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_diamond_step_overrides_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_diamond_step_overrides_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_dtt_form_config: {
        Row: {
          block_disposable_email: boolean
          client_id: string
          created_at: string
          dedupe_window_minutes: number
          deposit_amount: number | null
          enable_lead_quality_scoring: boolean
          enabled_steps: Json | null
          form_colors: Json | null
          form_content: Json | null
          id: string
          live_version: string
          onboarding_completed: boolean
          step_order: Json | null
          submission_mode: string
          updated_at: string
          welcome_subtitle: string | null
          welcome_title: string | null
        }
        Insert: {
          block_disposable_email?: boolean
          client_id: string
          created_at?: string
          dedupe_window_minutes?: number
          deposit_amount?: number | null
          enable_lead_quality_scoring?: boolean
          enabled_steps?: Json | null
          form_colors?: Json | null
          form_content?: Json | null
          id?: string
          live_version?: string
          onboarding_completed?: boolean
          step_order?: Json | null
          submission_mode?: string
          updated_at?: string
          welcome_subtitle?: string | null
          welcome_title?: string | null
        }
        Update: {
          block_disposable_email?: boolean
          client_id?: string
          created_at?: string
          dedupe_window_minutes?: number
          deposit_amount?: number | null
          enable_lead_quality_scoring?: boolean
          enabled_steps?: Json | null
          form_colors?: Json | null
          form_content?: Json | null
          id?: string
          live_version?: string
          onboarding_completed?: boolean
          step_order?: Json | null
          submission_mode?: string
          updated_at?: string
          welcome_subtitle?: string | null
          welcome_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_dtt_form_config_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_dtt_form_config_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_feature_change_log: {
        Row: {
          changed_by: string | null
          changed_keys: string[] | null
          client_id: string
          created_at: string
          db_role: string | null
          id: string
          new_features: Json | null
          old_features: Json | null
        }
        Insert: {
          changed_by?: string | null
          changed_keys?: string[] | null
          client_id: string
          created_at?: string
          db_role?: string | null
          id?: string
          new_features?: Json | null
          old_features?: Json | null
        }
        Update: {
          changed_by?: string | null
          changed_keys?: string[] | null
          client_id?: string
          created_at?: string
          db_role?: string | null
          id?: string
          new_features?: Json | null
          old_features?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "client_feature_change_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_feature_change_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_free_credits: {
        Row: {
          client_id: string
          created_at: string
          dollars_granted: number
          dollars_remaining: number
          expires_at: string
          granted_at: string
          id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          dollars_granted?: number
          dollars_remaining?: number
          expires_at?: string
          granted_at?: string
          id?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          dollars_granted?: number
          dollars_remaining?: number
          expires_at?: string
          granted_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_free_credits_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_free_credits_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_ghl_credentials: {
        Row: {
          client_id: string
          created_at: string
          private_token: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          private_token: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          private_token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_ghl_credentials_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_ghl_credentials_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_ghl_field_mappings: {
        Row: {
          client_id: string
          created_at: string
          display_order: number
          form_type: string
          ghl_custom_field_id: string
          id: string
          label: string | null
          question_key: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          display_order?: number
          form_type?: string
          ghl_custom_field_id: string
          id?: string
          label?: string | null
          question_key: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          display_order?: number
          form_type?: string
          ghl_custom_field_id?: string
          id?: string
          label?: string | null
          question_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_ghl_field_mappings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_ghl_field_mappings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_ghl_integrations: {
        Row: {
          allow_duplicate_opportunities: boolean
          client_id: string
          connection_verified_at: string | null
          contact_source: string | null
          contact_tags: string[] | null
          create_note: boolean
          create_opportunity: boolean
          created_at: string
          enabled: boolean
          fixed_value: number | null
          form_type: string
          id: string
          location_id: string | null
          opportunity_name_template: string
          opportunity_status: string
          pipeline_id: string | null
          stage_id: string | null
          token_last4: string | null
          updated_at: string
          value_source: string
        }
        Insert: {
          allow_duplicate_opportunities?: boolean
          client_id: string
          connection_verified_at?: string | null
          contact_source?: string | null
          contact_tags?: string[] | null
          create_note?: boolean
          create_opportunity?: boolean
          created_at?: string
          enabled?: boolean
          fixed_value?: number | null
          form_type?: string
          id?: string
          location_id?: string | null
          opportunity_name_template?: string
          opportunity_status?: string
          pipeline_id?: string | null
          stage_id?: string | null
          token_last4?: string | null
          updated_at?: string
          value_source?: string
        }
        Update: {
          allow_duplicate_opportunities?: boolean
          client_id?: string
          connection_verified_at?: string | null
          contact_source?: string | null
          contact_tags?: string[] | null
          create_note?: boolean
          create_opportunity?: boolean
          created_at?: string
          enabled?: boolean
          fixed_value?: number | null
          form_type?: string
          id?: string
          location_id?: string | null
          opportunity_name_template?: string
          opportunity_status?: string
          pipeline_id?: string | null
          stage_id?: string | null
          token_last4?: string | null
          updated_at?: string
          value_source?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_ghl_integrations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_ghl_integrations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_grill_config: {
        Row: {
          ai_image_delivery: string
          ai_image_enabled: boolean
          bottom_teeth_options: string[]
          budget_options: Json | null
          client_id: string
          created_at: string
          deposit_amount: number | null
          enabled_metals: Json
          enabled_options: Json | null
          enabled_steps: Json | null
          form_colors: Json | null
          grill_type_options: Json | null
          id: string
          metal_order: Json | null
          onboarding_completed: boolean
          option_image_overrides: Json
          required_contact_fields: Json
          shopify_product_id: string | null
          shopify_variant_id: string | null
          step_groups: Json | null
          step_labels: Json | null
          step_order: Json | null
          submission_mode: string
          thank_you_contact: Json | null
          top_teeth_options: string[]
          updated_at: string
        }
        Insert: {
          ai_image_delivery?: string
          ai_image_enabled?: boolean
          bottom_teeth_options?: string[]
          budget_options?: Json | null
          client_id: string
          created_at?: string
          deposit_amount?: number | null
          enabled_metals?: Json
          enabled_options?: Json | null
          enabled_steps?: Json | null
          form_colors?: Json | null
          grill_type_options?: Json | null
          id?: string
          metal_order?: Json | null
          onboarding_completed?: boolean
          option_image_overrides?: Json
          required_contact_fields?: Json
          shopify_product_id?: string | null
          shopify_variant_id?: string | null
          step_groups?: Json | null
          step_labels?: Json | null
          step_order?: Json | null
          submission_mode?: string
          thank_you_contact?: Json | null
          top_teeth_options?: string[]
          updated_at?: string
        }
        Update: {
          ai_image_delivery?: string
          ai_image_enabled?: boolean
          bottom_teeth_options?: string[]
          budget_options?: Json | null
          client_id?: string
          created_at?: string
          deposit_amount?: number | null
          enabled_metals?: Json
          enabled_options?: Json | null
          enabled_steps?: Json | null
          form_colors?: Json | null
          grill_type_options?: Json | null
          id?: string
          metal_order?: Json | null
          onboarding_completed?: boolean
          option_image_overrides?: Json
          required_contact_fields?: Json
          shopify_product_id?: string | null
          shopify_variant_id?: string | null
          step_groups?: Json | null
          step_labels?: Json | null
          step_order?: Json | null
          submission_mode?: string
          thank_you_contact?: Json | null
          top_teeth_options?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_grill_config_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_grill_config_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_grill_questions: {
        Row: {
          client_id: string
          created_at: string
          display_order: number
          has_file_followup: boolean
          has_text_followup: boolean
          id: string
          is_default: boolean
          is_enabled: boolean
          is_required: boolean
          option_images: Json | null
          options: Json | null
          question_key: string
          question_text: string
          question_type: string
          subtitle: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          display_order?: number
          has_file_followup?: boolean
          has_text_followup?: boolean
          id?: string
          is_default?: boolean
          is_enabled?: boolean
          is_required?: boolean
          option_images?: Json | null
          options?: Json | null
          question_key: string
          question_text: string
          question_type?: string
          subtitle?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          display_order?: number
          has_file_followup?: boolean
          has_text_followup?: boolean
          id?: string
          is_default?: boolean
          is_enabled?: boolean
          is_required?: boolean
          option_images?: Json | null
          options?: Json | null
          question_key?: string
          question_text?: string
          question_type?: string
          subtitle?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_grill_questions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_grill_questions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_low_balance_alerts: {
        Row: {
          client_id: string
          created_at: string
          id: string
          last_alerted_at: string
          last_alerted_balance: number
          tier: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          last_alerted_at?: string
          last_alerted_balance: number
          tier: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          last_alerted_at?: string
          last_alerted_balance?: number
          tier?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_low_balance_alerts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_low_balance_alerts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_metal_buying_config: {
        Row: {
          client_id: string
          created_at: string
          cta_config: Json
          deposit_amount: number | null
          dont_know_enabled: boolean
          form_colors: Json | null
          id: string
          metals_config: Json
          onboarding_completed: boolean
          refinery_sell_pct: number
          required_contact_fields: Json
          step_labels: Json | null
          step_order: string[] | null
          submission_mode: string
          updated_at: string
          volume_tier_config: Json | null
        }
        Insert: {
          client_id: string
          created_at?: string
          cta_config?: Json
          deposit_amount?: number | null
          dont_know_enabled?: boolean
          form_colors?: Json | null
          id?: string
          metals_config?: Json
          onboarding_completed?: boolean
          refinery_sell_pct?: number
          required_contact_fields?: Json
          step_labels?: Json | null
          step_order?: string[] | null
          submission_mode?: string
          updated_at?: string
          volume_tier_config?: Json | null
        }
        Update: {
          client_id?: string
          created_at?: string
          cta_config?: Json
          deposit_amount?: number | null
          dont_know_enabled?: boolean
          form_colors?: Json | null
          id?: string
          metals_config?: Json
          onboarding_completed?: boolean
          refinery_sell_pct?: number
          required_contact_fields?: Json
          step_labels?: Json | null
          step_order?: string[] | null
          submission_mode?: string
          updated_at?: string
          volume_tier_config?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "client_metal_buying_config_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_metal_buying_config_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_metal_buying_questions: {
        Row: {
          client_id: string
          created_at: string
          display_order: number
          has_file_followup: boolean
          has_text_followup: boolean
          id: string
          is_default: boolean
          is_enabled: boolean
          is_required: boolean
          option_images: Json | null
          options: Json | null
          question_key: string
          question_text: string
          question_type: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          display_order?: number
          has_file_followup?: boolean
          has_text_followup?: boolean
          id?: string
          is_default?: boolean
          is_enabled?: boolean
          is_required?: boolean
          option_images?: Json | null
          options?: Json | null
          question_key: string
          question_text: string
          question_type?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          display_order?: number
          has_file_followup?: boolean
          has_text_followup?: boolean
          id?: string
          is_default?: boolean
          is_enabled?: boolean
          is_required?: boolean
          option_images?: Json | null
          options?: Json | null
          question_key?: string
          question_text?: string
          question_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_metal_buying_questions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_metal_buying_questions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_metal_variants: {
        Row: {
          client_id: string
          color_family: string
          created_at: string | null
          display_order: number | null
          id: string
          price: number
          price_cad: number | null
          price_gbp: number | null
          price_usd: number | null
          updated_at: string | null
          variant_name: string
        }
        Insert: {
          client_id: string
          color_family: string
          created_at?: string | null
          display_order?: number | null
          id?: string
          price?: number
          price_cad?: number | null
          price_gbp?: number | null
          price_usd?: number | null
          updated_at?: string | null
          variant_name: string
        }
        Update: {
          client_id?: string
          color_family?: string
          created_at?: string | null
          display_order?: number | null
          id?: string
          price?: number
          price_cad?: number | null
          price_gbp?: number | null
          price_usd?: number | null
          updated_at?: string | null
          variant_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_metal_variants_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_metal_variants_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_notification_preferences: {
        Row: {
          client_id: string
          created_at: string
          id: string
          is_enabled: boolean
          notification_type: string
          recipient_emails: string[]
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          notification_type: string
          recipient_emails?: string[]
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          notification_type?: string
          recipient_emails?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_notification_preferences_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_notification_preferences_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_notifications: {
        Row: {
          category: string
          client_id: string
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string
          metadata: Json | null
          title: string
        }
        Insert: {
          category: string
          client_id: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          metadata?: Json | null
          title: string
        }
        Update: {
          category?: string
          client_id?: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          metadata?: Json | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_notifications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_notifications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_onboarding_preferences: {
        Row: {
          client_id: string
          completed_at: string | null
          created_at: string | null
          id: string
          onboarding_completed: boolean | null
          selected_diamond_types: string[] | null
          selected_metals: string[]
          selected_shanks: string[]
          selected_shapes: string[]
          selected_styles: string[]
          updated_at: string | null
          widget_deposit_amount: number | null
          widget_pricing_mode: string
          widget_shopify_product_id: string | null
          widget_shopify_variant_id: string | null
        }
        Insert: {
          client_id: string
          completed_at?: string | null
          created_at?: string | null
          id?: string
          onboarding_completed?: boolean | null
          selected_diamond_types?: string[] | null
          selected_metals?: string[]
          selected_shanks?: string[]
          selected_shapes?: string[]
          selected_styles?: string[]
          updated_at?: string | null
          widget_deposit_amount?: number | null
          widget_pricing_mode?: string
          widget_shopify_product_id?: string | null
          widget_shopify_variant_id?: string | null
        }
        Update: {
          client_id?: string
          completed_at?: string | null
          created_at?: string | null
          id?: string
          onboarding_completed?: boolean | null
          selected_diamond_types?: string[] | null
          selected_metals?: string[]
          selected_shanks?: string[]
          selected_shapes?: string[]
          selected_styles?: string[]
          updated_at?: string | null
          widget_deposit_amount?: number | null
          widget_pricing_mode?: string
          widget_shopify_product_id?: string | null
          widget_shopify_variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_onboarding_preferences_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_onboarding_preferences_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_option_prices: {
        Row: {
          client_id: string
          created_at: string | null
          id: string
          option_id: string
          option_type: string
          price: number
          price_cad: number | null
          price_gbp: number | null
          price_usd: number | null
          updated_at: string | null
        }
        Insert: {
          client_id: string
          created_at?: string | null
          id?: string
          option_id: string
          option_type: string
          price?: number
          price_cad?: number | null
          price_gbp?: number | null
          price_usd?: number | null
          updated_at?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string | null
          id?: string
          option_id?: string
          option_type?: string
          price?: number
          price_cad?: number | null
          price_gbp?: number | null
          price_usd?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_option_prices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_option_prices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_products: {
        Row: {
          allow_jewelx_manufacturing: boolean | null
          allow_self_manufacturing: boolean | null
          client_id: string
          created_at: string | null
          custom_retail_price: number | null
          id: string
          is_enabled: boolean | null
          markup_percentage: number | null
          product_id: string
        }
        Insert: {
          allow_jewelx_manufacturing?: boolean | null
          allow_self_manufacturing?: boolean | null
          client_id: string
          created_at?: string | null
          custom_retail_price?: number | null
          id?: string
          is_enabled?: boolean | null
          markup_percentage?: number | null
          product_id: string
        }
        Update: {
          allow_jewelx_manufacturing?: boolean | null
          allow_self_manufacturing?: boolean | null
          client_id?: string
          created_at?: string | null
          custom_retail_price?: number | null
          id?: string
          is_enabled?: boolean | null
          markup_percentage?: number | null
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_products_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_products_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      client_ring_catalog: {
        Row: {
          client_id: string
          created_at: string | null
          custom_price: number | null
          id: string
          is_enabled: boolean | null
          markup_percentage: number | null
          master_db_id: string | null
          shopify_product_id: string | null
          shopify_sync_status: string | null
          shopify_synced_at: string | null
          shopify_variant_id: string | null
          shopify_variants_map: Json | null
          updated_at: string | null
        }
        Insert: {
          client_id: string
          created_at?: string | null
          custom_price?: number | null
          id?: string
          is_enabled?: boolean | null
          markup_percentage?: number | null
          master_db_id?: string | null
          shopify_product_id?: string | null
          shopify_sync_status?: string | null
          shopify_synced_at?: string | null
          shopify_variant_id?: string | null
          shopify_variants_map?: Json | null
          updated_at?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string | null
          custom_price?: number | null
          id?: string
          is_enabled?: boolean | null
          markup_percentage?: number | null
          master_db_id?: string | null
          shopify_product_id?: string | null
          shopify_sync_status?: string | null
          shopify_synced_at?: string | null
          shopify_variant_id?: string | null
          shopify_variants_map?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_ring_catalog_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_ring_catalog_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_ring_catalog_master_db_id_fkey"
            columns: ["master_db_id"]
            isOneToOne: false
            referencedRelation: "master_products_with_urls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_ring_catalog_master_db_id_fkey"
            columns: ["master_db_id"]
            isOneToOne: false
            referencedRelation: "my_master_db_data"
            referencedColumns: ["id"]
          },
        ]
      }
      client_ring_form_config: {
        Row: {
          ai_image_delivery: string
          ai_image_enabled: boolean
          budget_options: Json | null
          client_id: string
          created_at: string
          deposit_amount: number | null
          enabled_steps: Json
          form_colors: Json | null
          id: string
          onboarding_completed: boolean
          option_image_overrides: Json
          required_contact_fields: Json
          shopify_product_id: string | null
          shopify_variant_id: string | null
          step_groups: Json | null
          step_labels: Json | null
          step_options: Json | null
          step_order: Json | null
          submission_mode: string
          thank_you_contact: Json | null
          timeline_options: string[] | null
          updated_at: string
        }
        Insert: {
          ai_image_delivery?: string
          ai_image_enabled?: boolean
          budget_options?: Json | null
          client_id: string
          created_at?: string
          deposit_amount?: number | null
          enabled_steps?: Json
          form_colors?: Json | null
          id?: string
          onboarding_completed?: boolean
          option_image_overrides?: Json
          required_contact_fields?: Json
          shopify_product_id?: string | null
          shopify_variant_id?: string | null
          step_groups?: Json | null
          step_labels?: Json | null
          step_options?: Json | null
          step_order?: Json | null
          submission_mode?: string
          thank_you_contact?: Json | null
          timeline_options?: string[] | null
          updated_at?: string
        }
        Update: {
          ai_image_delivery?: string
          ai_image_enabled?: boolean
          budget_options?: Json | null
          client_id?: string
          created_at?: string
          deposit_amount?: number | null
          enabled_steps?: Json
          form_colors?: Json | null
          id?: string
          onboarding_completed?: boolean
          option_image_overrides?: Json
          required_contact_fields?: Json
          shopify_product_id?: string | null
          shopify_variant_id?: string | null
          step_groups?: Json | null
          step_labels?: Json | null
          step_options?: Json | null
          step_order?: Json | null
          submission_mode?: string
          thank_you_contact?: Json | null
          timeline_options?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_ring_form_config_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_ring_form_config_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_ring_form_questions: {
        Row: {
          client_id: string
          created_at: string
          display_order: number
          has_file_followup: boolean
          has_text_followup: boolean
          id: string
          is_default: boolean
          is_enabled: boolean
          is_required: boolean
          option_images: Json | null
          options: Json | null
          question_key: string
          question_text: string
          question_type: string
          subtitle: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          display_order?: number
          has_file_followup?: boolean
          has_text_followup?: boolean
          id?: string
          is_default?: boolean
          is_enabled?: boolean
          is_required?: boolean
          option_images?: Json | null
          options?: Json | null
          question_key: string
          question_text: string
          question_type?: string
          subtitle?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          display_order?: number
          has_file_followup?: boolean
          has_text_followup?: boolean
          id?: string
          is_default?: boolean
          is_enabled?: boolean
          is_required?: boolean
          option_images?: Json | null
          options?: Json | null
          question_key?: string
          question_text?: string
          question_type?: string
          subtitle?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_ring_form_questions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_ring_form_questions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_size_options: {
        Row: {
          client_id: string
          created_at: string | null
          id: string
          is_enabled: boolean | null
          price_adjustment: number | null
          size_value: string
        }
        Insert: {
          client_id: string
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          price_adjustment?: number | null
          size_value: string
        }
        Update: {
          client_id?: string
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          price_adjustment?: number | null
          size_value?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_size_options_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_size_options_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_status_tags: {
        Row: {
          client_id: string
          context: string
          created_at: string
          display_order: number
          id: string
          is_default: boolean
          tag_color: string
          tag_name: string
        }
        Insert: {
          client_id: string
          context: string
          created_at?: string
          display_order?: number
          id?: string
          is_default?: boolean
          tag_color?: string
          tag_name: string
        }
        Update: {
          client_id?: string
          context?: string
          created_at?: string
          display_order?: number
          id?: string
          is_default?: boolean
          tag_color?: string
          tag_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_status_tags_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_status_tags_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          client_id: string
          created_at: string
          current_period_end: string | null
          has_license_fee: boolean
          id: string
          license_currency: string | null
          license_last_paid_at: string | null
          license_payments: Json
          license_total_paid: number | null
          plan_id: string | null
          plan_name: string | null
          scheduled_start_at: string | null
          status: string
          stripe_customer_id: string | null
          stripe_schedule_id: string | null
          stripe_subscription_id: string | null
          trial_end: string | null
          updated_at: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          client_id: string
          created_at?: string
          current_period_end?: string | null
          has_license_fee?: boolean
          id?: string
          license_currency?: string | null
          license_last_paid_at?: string | null
          license_payments?: Json
          license_total_paid?: number | null
          plan_id?: string | null
          plan_name?: string | null
          scheduled_start_at?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_schedule_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          updated_at?: string
        }
        Update: {
          cancel_at_period_end?: boolean
          client_id?: string
          created_at?: string
          current_period_end?: string | null
          has_license_fee?: boolean
          id?: string
          license_currency?: string | null
          license_last_paid_at?: string | null
          license_payments?: Json
          license_total_paid?: number | null
          plan_id?: string | null
          plan_name?: string | null
          scheduled_start_at?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_schedule_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_subscriptions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_subscriptions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      client_wallets: {
        Row: {
          balance: number
          client_id: string
          created_at: string
          id: string
          lifetime_credits: number
          lifetime_debits: number
          purchased_expires_at: string | null
          updated_at: string
        }
        Insert: {
          balance?: number
          client_id: string
          created_at?: string
          id?: string
          lifetime_credits?: number
          lifetime_debits?: number
          purchased_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          balance?: number
          client_id?: string
          created_at?: string
          id?: string
          lifetime_credits?: number
          lifetime_debits?: number
          purchased_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_wallets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_wallets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          account_tags: string[] | null
          address_line1: string | null
          address_line2: string | null
          agency_id: string
          allowed_domains: string[] | null
          billing_override_by: string | null
          billing_override_reason: string | null
          billing_override_until: string | null
          branding_config: Json | null
          city: string | null
          company_name: string
          country: string | null
          created_at: string | null
          currency: string
          custom_commission_rate: number | null
          customer_email_cta_label: string | null
          customer_email_cta_url: string | null
          customer_email_header_appearance: string
          email: string
          email_logo_url: string | null
          enabled_features: Json
          enabled_features_backup: Json | null
          exclude_from_admin_revenue: boolean
          google_ads_conversion_id: string | null
          google_ads_conversion_labels: Json
          gtm_container_id: string | null
          id: string
          license_fee_payment_ref: string[]
          logo_url: string | null
          meta_capi_access_token: string | null
          meta_pixel_id: string | null
          password_set: boolean
          phone: string | null
          plan_id: string | null
          postal_code: string | null
          privacy_url: string | null
          ring_catalog_currency: string | null
          scheduling_provider: string | null
          scheduling_url: string | null
          shopify_access_token_encrypted: string | null
          shopify_admin_access_token_encrypted: string | null
          shopify_checkout_domain: string | null
          shopify_store_url: string | null
          shopify_storefront_token_encrypted: string | null
          shopify_webhook_secret_encrypted: string | null
          state: string | null
          status: string | null
          stripe_customer_id: string | null
          subscription_ends_at: string | null
          terms_url: string | null
          timezone: string | null
          user_id: string
          widget_theme: string | null
        }
        Insert: {
          account_tags?: string[] | null
          address_line1?: string | null
          address_line2?: string | null
          agency_id: string
          allowed_domains?: string[] | null
          billing_override_by?: string | null
          billing_override_reason?: string | null
          billing_override_until?: string | null
          branding_config?: Json | null
          city?: string | null
          company_name: string
          country?: string | null
          created_at?: string | null
          currency?: string
          custom_commission_rate?: number | null
          customer_email_cta_label?: string | null
          customer_email_cta_url?: string | null
          customer_email_header_appearance?: string
          email: string
          email_logo_url?: string | null
          enabled_features?: Json
          enabled_features_backup?: Json | null
          exclude_from_admin_revenue?: boolean
          google_ads_conversion_id?: string | null
          google_ads_conversion_labels?: Json
          gtm_container_id?: string | null
          id?: string
          license_fee_payment_ref?: string[]
          logo_url?: string | null
          meta_capi_access_token?: string | null
          meta_pixel_id?: string | null
          password_set?: boolean
          phone?: string | null
          plan_id?: string | null
          postal_code?: string | null
          privacy_url?: string | null
          ring_catalog_currency?: string | null
          scheduling_provider?: string | null
          scheduling_url?: string | null
          shopify_access_token_encrypted?: string | null
          shopify_admin_access_token_encrypted?: string | null
          shopify_checkout_domain?: string | null
          shopify_store_url?: string | null
          shopify_storefront_token_encrypted?: string | null
          shopify_webhook_secret_encrypted?: string | null
          state?: string | null
          status?: string | null
          stripe_customer_id?: string | null
          subscription_ends_at?: string | null
          terms_url?: string | null
          timezone?: string | null
          user_id: string
          widget_theme?: string | null
        }
        Update: {
          account_tags?: string[] | null
          address_line1?: string | null
          address_line2?: string | null
          agency_id?: string
          allowed_domains?: string[] | null
          billing_override_by?: string | null
          billing_override_reason?: string | null
          billing_override_until?: string | null
          branding_config?: Json | null
          city?: string | null
          company_name?: string
          country?: string | null
          created_at?: string | null
          currency?: string
          custom_commission_rate?: number | null
          customer_email_cta_label?: string | null
          customer_email_cta_url?: string | null
          customer_email_header_appearance?: string
          email?: string
          email_logo_url?: string | null
          enabled_features?: Json
          enabled_features_backup?: Json | null
          exclude_from_admin_revenue?: boolean
          google_ads_conversion_id?: string | null
          google_ads_conversion_labels?: Json
          gtm_container_id?: string | null
          id?: string
          license_fee_payment_ref?: string[]
          logo_url?: string | null
          meta_capi_access_token?: string | null
          meta_pixel_id?: string | null
          password_set?: boolean
          phone?: string | null
          plan_id?: string | null
          postal_code?: string | null
          privacy_url?: string | null
          ring_catalog_currency?: string | null
          scheduling_provider?: string | null
          scheduling_url?: string | null
          shopify_access_token_encrypted?: string | null
          shopify_admin_access_token_encrypted?: string | null
          shopify_checkout_domain?: string | null
          shopify_store_url?: string | null
          shopify_storefront_token_encrypted?: string | null
          shopify_webhook_secret_encrypted?: string | null
          state?: string | null
          status?: string | null
          stripe_customer_id?: string | null
          subscription_ends_at?: string | null
          terms_url?: string | null
          timezone?: string | null
          user_id?: string
          widget_theme?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_packs: {
        Row: {
          active: boolean
          amount_usd: number
          bonus_credits: number
          bonus_usd: number
          created_at: string
          credits: number
          id: number
          label: string
          pack_key: string
          popular: boolean
          sort_order: number
          stripe_price_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          amount_usd: number
          bonus_credits?: number
          bonus_usd?: number
          created_at?: string
          credits: number
          id?: number
          label: string
          pack_key: string
          popular?: boolean
          sort_order?: number
          stripe_price_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          amount_usd?: number
          bonus_credits?: number
          bonus_usd?: number
          created_at?: string
          credits?: number
          id?: number
          label?: string
          pack_key?: string
          popular?: boolean
          sort_order?: number
          stripe_price_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_integrations: {
        Row: {
          api_key_encrypted: string | null
          client_id: string
          created_at: string | null
          id: string
          is_active: boolean | null
          last_synced_at: string | null
          provider: string
          updated_at: string | null
          webhook_url: string | null
        }
        Insert: {
          api_key_encrypted?: string | null
          client_id: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_synced_at?: string | null
          provider: string
          updated_at?: string | null
          webhook_url?: string | null
        }
        Update: {
          api_key_encrypted?: string | null
          client_id?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_synced_at?: string | null
          provider?: string
          updated_at?: string | null
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_integrations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_integrations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      cron_config: {
        Row: {
          key: string
          updated_at: string | null
          value: string
        }
        Insert: {
          key: string
          updated_at?: string | null
          value: string
        }
        Update: {
          key?: string
          updated_at?: string | null
          value?: string
        }
        Relationships: []
      }
      custom_enquiry_leads: {
        Row: {
          additional_notes: string | null
          ai_preview_url: string | null
          back_option: string | null
          budget: string | null
          client_id: string
          created_at: string
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          description: string | null
          desired_size: string | null
          device_info: Json | null
          diamond_quality: string | null
          diamond_setup: string | null
          edit_history: Json[] | null
          engraving_text: string | null
          follow_up_status: string | null
          gold_color: string | null
          id: string
          inspiration_image_url: string | null
          jewelry_type: string | null
          karat: string | null
          question_answers: Json | null
          timeline: string | null
          updated_at: string
          uploaded_image_urls: string[] | null
        }
        Insert: {
          additional_notes?: string | null
          ai_preview_url?: string | null
          back_option?: string | null
          budget?: string | null
          client_id: string
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          description?: string | null
          desired_size?: string | null
          device_info?: Json | null
          diamond_quality?: string | null
          diamond_setup?: string | null
          edit_history?: Json[] | null
          engraving_text?: string | null
          follow_up_status?: string | null
          gold_color?: string | null
          id?: string
          inspiration_image_url?: string | null
          jewelry_type?: string | null
          karat?: string | null
          question_answers?: Json | null
          timeline?: string | null
          updated_at?: string
          uploaded_image_urls?: string[] | null
        }
        Update: {
          additional_notes?: string | null
          ai_preview_url?: string | null
          back_option?: string | null
          budget?: string | null
          client_id?: string
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          description?: string | null
          desired_size?: string | null
          device_info?: Json | null
          diamond_quality?: string | null
          diamond_setup?: string | null
          edit_history?: Json[] | null
          engraving_text?: string | null
          follow_up_status?: string | null
          gold_color?: string | null
          id?: string
          inspiration_image_url?: string | null
          jewelry_type?: string | null
          karat?: string | null
          question_answers?: Json | null
          timeline?: string | null
          updated_at?: string
          uploaded_image_urls?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_enquiry_leads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_enquiry_leads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_enquiry_preview_images: {
        Row: {
          created_at: string
          custom_instruction: string | null
          feedback: string | null
          generation_number: number
          id: string
          image_url: string
          lead_id: string
        }
        Insert: {
          created_at?: string
          custom_instruction?: string | null
          feedback?: string | null
          generation_number?: number
          id?: string
          image_url: string
          lead_id: string
        }
        Update: {
          created_at?: string
          custom_instruction?: string | null
          feedback?: string | null
          generation_number?: number
          id?: string
          image_url?: string
          lead_id?: string
        }
        Relationships: []
      }
      data_cleanup_logs: {
        Row: {
          client_id: string | null
          error_message: string | null
          executed_at: string
          execution_time_ms: number | null
          id: string
          records_deleted: number
          retention_days: number
          status: string | null
          table_name: string
        }
        Insert: {
          client_id?: string | null
          error_message?: string | null
          executed_at?: string
          execution_time_ms?: number | null
          id?: string
          records_deleted?: number
          retention_days: number
          status?: string | null
          table_name: string
        }
        Update: {
          client_id?: string | null
          error_message?: string | null
          executed_at?: string
          execution_time_ms?: number | null
          id?: string
          records_deleted?: number
          retention_days?: number
          status?: string | null
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_cleanup_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_cleanup_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      design_comparisons: {
        Row: {
          client_id: string | null
          configurations: Json[]
          created_at: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          client_id?: string | null
          configurations: Json[]
          created_at?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          client_id?: string | null
          configurations?: Json[]
          created_at?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "design_comparisons_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_comparisons_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      design_requests: {
        Row: {
          admin_notes: string | null
          ai_preview_url: string | null
          budget_range: string | null
          client_id: string
          completed_at: string | null
          created_at: string | null
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          description: string
          device_info: Json | null
          engraving_text: string | null
          estimated_completion: string | null
          follow_up_status: string | null
          id: string
          metal_preference: string | null
          preferred_metal: string | null
          preferred_stone: string | null
          preferred_style: string | null
          priority: string | null
          reference_images: string[] | null
          request_type: string
          size: string | null
          special_requirements: string | null
          status: string
          stone_preference: string | null
          timeline: string | null
          updated_at: string | null
        }
        Insert: {
          admin_notes?: string | null
          ai_preview_url?: string | null
          budget_range?: string | null
          client_id: string
          completed_at?: string | null
          created_at?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          description: string
          device_info?: Json | null
          engraving_text?: string | null
          estimated_completion?: string | null
          follow_up_status?: string | null
          id?: string
          metal_preference?: string | null
          preferred_metal?: string | null
          preferred_stone?: string | null
          preferred_style?: string | null
          priority?: string | null
          reference_images?: string[] | null
          request_type: string
          size?: string | null
          special_requirements?: string | null
          status?: string
          stone_preference?: string | null
          timeline?: string | null
          updated_at?: string | null
        }
        Update: {
          admin_notes?: string | null
          ai_preview_url?: string | null
          budget_range?: string | null
          client_id?: string
          completed_at?: string | null
          created_at?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          description?: string
          device_info?: Json | null
          engraving_text?: string | null
          estimated_completion?: string | null
          follow_up_status?: string | null
          id?: string
          metal_preference?: string | null
          preferred_metal?: string | null
          preferred_stone?: string | null
          preferred_style?: string | null
          priority?: string | null
          reference_images?: string[] | null
          request_type?: string
          size?: string | null
          special_requirements?: string | null
          status?: string
          stone_preference?: string | null
          timeline?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "design_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      diamond_catalog_config: {
        Row: {
          client_id: string
          config: Json
          created_at: string
          id: string
          is_active: boolean
          product_count: number | null
          updated_at: string
        }
        Insert: {
          client_id: string
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          product_count?: number | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          product_count?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "diamond_catalog_config_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diamond_catalog_config_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      diamond_form_leads: {
        Row: {
          claim_phone: string | null
          claim_phone_at: string | null
          client_id: string
          country_code: string | null
          created_at: string
          device_info: Json | null
          diamond_band: string | null
          diamond_band_width: string[] | null
          diamond_holder: string | null
          diamond_metal: string | null
          diamond_metal_karat: string | null
          diamond_personalization: string[] | null
          diamond_quality: string | null
          diamond_setting: string | null
          diamond_shape: string | null
          diamond_size: string | null
          diamond_timeline: string | null
          diamond_two_tone_metals: string | null
          diamond_type: string | null
          edit_history: Json[] | null
          email: string
          engraving_text: string | null
          estimated_total: number | null
          first_name: string
          follow_up_status: string | null
          id: string
          inspiration_image_urls: string[] | null
          is_test_preview: boolean
          marketing_consent: boolean | null
          other_details: string | null
          phone_number: string | null
          phone_quality: string | null
          phone_quality_reasons: Json | null
          quote_version: string | null
          ring_size: string | null
          selected_diamond: Json | null
          selected_gemstone: Json | null
          sms_consent: boolean | null
          submission_ms: number | null
          updated_at: string
        }
        Insert: {
          claim_phone?: string | null
          claim_phone_at?: string | null
          client_id: string
          country_code?: string | null
          created_at?: string
          device_info?: Json | null
          diamond_band?: string | null
          diamond_band_width?: string[] | null
          diamond_holder?: string | null
          diamond_metal?: string | null
          diamond_metal_karat?: string | null
          diamond_personalization?: string[] | null
          diamond_quality?: string | null
          diamond_setting?: string | null
          diamond_shape?: string | null
          diamond_size?: string | null
          diamond_timeline?: string | null
          diamond_two_tone_metals?: string | null
          diamond_type?: string | null
          edit_history?: Json[] | null
          email: string
          engraving_text?: string | null
          estimated_total?: number | null
          first_name: string
          follow_up_status?: string | null
          id?: string
          inspiration_image_urls?: string[] | null
          is_test_preview?: boolean
          marketing_consent?: boolean | null
          other_details?: string | null
          phone_number?: string | null
          phone_quality?: string | null
          phone_quality_reasons?: Json | null
          quote_version?: string | null
          ring_size?: string | null
          selected_diamond?: Json | null
          selected_gemstone?: Json | null
          sms_consent?: boolean | null
          submission_ms?: number | null
          updated_at?: string
        }
        Update: {
          claim_phone?: string | null
          claim_phone_at?: string | null
          client_id?: string
          country_code?: string | null
          created_at?: string
          device_info?: Json | null
          diamond_band?: string | null
          diamond_band_width?: string[] | null
          diamond_holder?: string | null
          diamond_metal?: string | null
          diamond_metal_karat?: string | null
          diamond_personalization?: string[] | null
          diamond_quality?: string | null
          diamond_setting?: string | null
          diamond_shape?: string | null
          diamond_size?: string | null
          diamond_timeline?: string | null
          diamond_two_tone_metals?: string | null
          diamond_type?: string | null
          edit_history?: Json[] | null
          email?: string
          engraving_text?: string | null
          estimated_total?: number | null
          first_name?: string
          follow_up_status?: string | null
          id?: string
          inspiration_image_urls?: string[] | null
          is_test_preview?: boolean
          marketing_consent?: boolean | null
          other_details?: string | null
          phone_number?: string | null
          phone_quality?: string | null
          phone_quality_reasons?: Json | null
          quote_version?: string | null
          ring_size?: string | null
          selected_diamond?: Json | null
          selected_gemstone?: Json | null
          sms_consent?: boolean | null
          submission_ms?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "diamond_form_leads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diamond_form_leads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      diamond_fx_price_versions: {
        Row: {
          api_fetched_at: string | null
          approval_note: string | null
          cad_buffer_pct: number
          cad_effective_rate: number
          cancel_requested: boolean
          error_summary: string | null
          expected_count: number
          fetch_id: number | null
          fetched_usd_to_cad: number | null
          fetched_usd_to_gbp: number | null
          finished_at: string | null
          gbp_buffer_pct: number
          gbp_effective_rate: number
          id: number
          idempotency_key: string | null
          last_pool_id: string | null
          last_step_at: string | null
          previous_version_id: number | null
          processed_count: number
          published_at: string | null
          rate_source: string
          requested_at: string
          requested_by: string | null
          rounding_policy: string
          rows_cleaned: boolean
          scanned_count: number
          skipped_count: number
          started_at: string | null
          status: string
          steps_done: number
          usd_to_cad: number
          usd_to_gbp: number
          verified_count: number | null
        }
        Insert: {
          api_fetched_at?: string | null
          approval_note?: string | null
          cad_buffer_pct: number
          cad_effective_rate: number
          cancel_requested?: boolean
          error_summary?: string | null
          expected_count?: number
          fetch_id?: number | null
          fetched_usd_to_cad?: number | null
          fetched_usd_to_gbp?: number | null
          finished_at?: string | null
          gbp_buffer_pct: number
          gbp_effective_rate: number
          id?: number
          idempotency_key?: string | null
          last_pool_id?: string | null
          last_step_at?: string | null
          previous_version_id?: number | null
          processed_count?: number
          published_at?: string | null
          rate_source: string
          requested_at?: string
          requested_by?: string | null
          rounding_policy?: string
          rows_cleaned?: boolean
          scanned_count?: number
          skipped_count?: number
          started_at?: string | null
          status?: string
          steps_done?: number
          usd_to_cad: number
          usd_to_gbp: number
          verified_count?: number | null
        }
        Update: {
          api_fetched_at?: string | null
          approval_note?: string | null
          cad_buffer_pct?: number
          cad_effective_rate?: number
          cancel_requested?: boolean
          error_summary?: string | null
          expected_count?: number
          fetch_id?: number | null
          fetched_usd_to_cad?: number | null
          fetched_usd_to_gbp?: number | null
          finished_at?: string | null
          gbp_buffer_pct?: number
          gbp_effective_rate?: number
          id?: number
          idempotency_key?: string | null
          last_pool_id?: string | null
          last_step_at?: string | null
          previous_version_id?: number | null
          processed_count?: number
          published_at?: string | null
          rate_source?: string
          requested_at?: string
          requested_by?: string | null
          rounding_policy?: string
          rows_cleaned?: boolean
          scanned_count?: number
          skipped_count?: number
          started_at?: string | null
          status?: string
          steps_done?: number
          usd_to_cad?: number
          usd_to_gbp?: number
          verified_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "diamond_fx_price_versions_fetch_id_fkey"
            columns: ["fetch_id"]
            isOneToOne: false
            referencedRelation: "diamond_fx_rate_fetches"
            referencedColumns: ["id"]
          },
        ]
      }
      diamond_fx_rate_fetches: {
        Row: {
          base_currency: string
          fetched_at: string
          fetched_by: string | null
          id: number
          provider: string
          provider_timestamp: string | null
          usd_to_cad: number
          usd_to_gbp: number
        }
        Insert: {
          base_currency?: string
          fetched_at?: string
          fetched_by?: string | null
          id?: number
          provider: string
          provider_timestamp?: string | null
          usd_to_cad: number
          usd_to_gbp: number
        }
        Update: {
          base_currency?: string
          fetched_at?: string
          fetched_by?: string | null
          id?: number
          provider?: string
          provider_timestamp?: string | null
          usd_to_cad?: number
          usd_to_gbp?: number
        }
        Relationships: []
      }
      diamond_fx_state: {
        Row: {
          active_version_id: number | null
          id: number
          updated_at: string
        }
        Insert: {
          active_version_id?: number | null
          id?: number
          updated_at?: string
        }
        Update: {
          active_version_id?: number | null
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
      diamond_holder_options: {
        Row: {
          created_at: string
          display_order: number
          id: string
          image_url: string | null
          name: string
          option_value: string
          price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string | null
          name: string
          option_value: string
          price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string | null
          name?: string
          option_value?: string
          price?: number
          updated_at?: string
        }
        Relationships: []
      }
      diamond_imports: {
        Row: {
          completed_at: string | null
          error: string | null
          file_name: string | null
          file_path: string | null
          id: string
          row_count: number | null
          rows_processed: number
          started_at: string
          status: string
          uploaded_by: string | null
        }
        Insert: {
          completed_at?: string | null
          error?: string | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          row_count?: number | null
          rows_processed?: number
          started_at?: string
          status?: string
          uploaded_by?: string | null
        }
        Update: {
          completed_at?: string | null
          error?: string | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          row_count?: number | null
          rows_processed?: number
          started_at?: string
          status?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      diamond_inventory_pool: {
        Row: {
          brown: boolean | null
          canada_mark_eligible: boolean | null
          carats: number | null
          clar: string | null
          col: string | null
          country: string | null
          culet: string | null
          cut: string | null
          delivered_price: number | null
          depth: number | null
          diamond_id: string | null
          discount: number | null
          external_id: string | null
          eye_clean: string | null
          flo: string | null
          flo_col: number | null
          girdle: string | null
          green: boolean | null
          height: number | null
          id: string
          image: string | null
          import_batch_id: string | null
          imported_at: string
          is_returnable: boolean | null
          lab: string | null
          labgrown_type: string | null
          length: number | null
          lg: string | null
          markup_currency: string | null
          markup_price: number | null
          max_delivery_days: number | null
          milky: boolean | null
          min_delivery_days: number | null
          mine_of_origin: string | null
          pdf: string | null
          pol: string | null
          price: number | null
          price_per_carat: number | null
          report_no: string | null
          shape: string | null
          stock_id: string | null
          symm: string | null
          table: number | null
          video: string | null
          videos_frame: number | null
          videos_image_uri: string | null
          width: number | null
        }
        Insert: {
          brown?: boolean | null
          canada_mark_eligible?: boolean | null
          carats?: number | null
          clar?: string | null
          col?: string | null
          country?: string | null
          culet?: string | null
          cut?: string | null
          delivered_price?: number | null
          depth?: number | null
          diamond_id?: string | null
          discount?: number | null
          external_id?: string | null
          eye_clean?: string | null
          flo?: string | null
          flo_col?: number | null
          girdle?: string | null
          green?: boolean | null
          height?: number | null
          id?: string
          image?: string | null
          import_batch_id?: string | null
          imported_at?: string
          is_returnable?: boolean | null
          lab?: string | null
          labgrown_type?: string | null
          length?: number | null
          lg?: string | null
          markup_currency?: string | null
          markup_price?: number | null
          max_delivery_days?: number | null
          milky?: boolean | null
          min_delivery_days?: number | null
          mine_of_origin?: string | null
          pdf?: string | null
          pol?: string | null
          price?: number | null
          price_per_carat?: number | null
          report_no?: string | null
          shape?: string | null
          stock_id?: string | null
          symm?: string | null
          table?: number | null
          video?: string | null
          videos_frame?: number | null
          videos_image_uri?: string | null
          width?: number | null
        }
        Update: {
          brown?: boolean | null
          canada_mark_eligible?: boolean | null
          carats?: number | null
          clar?: string | null
          col?: string | null
          country?: string | null
          culet?: string | null
          cut?: string | null
          delivered_price?: number | null
          depth?: number | null
          diamond_id?: string | null
          discount?: number | null
          external_id?: string | null
          eye_clean?: string | null
          flo?: string | null
          flo_col?: number | null
          girdle?: string | null
          green?: boolean | null
          height?: number | null
          id?: string
          image?: string | null
          import_batch_id?: string | null
          imported_at?: string
          is_returnable?: boolean | null
          lab?: string | null
          labgrown_type?: string | null
          length?: number | null
          lg?: string | null
          markup_currency?: string | null
          markup_price?: number | null
          max_delivery_days?: number | null
          milky?: boolean | null
          min_delivery_days?: number | null
          mine_of_origin?: string | null
          pdf?: string | null
          pol?: string | null
          price?: number | null
          price_per_carat?: number | null
          report_no?: string | null
          shape?: string | null
          stock_id?: string | null
          symm?: string | null
          table?: number | null
          video?: string | null
          videos_frame?: number | null
          videos_image_uri?: string | null
          width?: number | null
        }
        Relationships: []
      }
      diamond_inventory_pool_staging: {
        Row: {
          brown: boolean | null
          canada_mark_eligible: boolean | null
          carats: number | null
          clar: string | null
          col: string | null
          country: string | null
          culet: string | null
          cut: string | null
          delivered_price: number | null
          depth: number | null
          diamond_id: string | null
          discount: number | null
          external_id: string | null
          eye_clean: string | null
          flo: string | null
          flo_col: number | null
          girdle: string | null
          green: boolean | null
          height: number | null
          id: string
          image: string | null
          import_batch_id: string | null
          imported_at: string
          is_returnable: boolean | null
          lab: string | null
          labgrown_type: string | null
          length: number | null
          lg: string | null
          markup_currency: string | null
          markup_price: number | null
          max_delivery_days: number | null
          milky: boolean | null
          min_delivery_days: number | null
          mine_of_origin: string | null
          pdf: string | null
          pol: string | null
          price: number | null
          price_per_carat: number | null
          report_no: string | null
          shape: string | null
          stock_id: string | null
          symm: string | null
          table: number | null
          video: string | null
          videos_frame: number | null
          videos_image_uri: string | null
          width: number | null
        }
        Insert: {
          brown?: boolean | null
          canada_mark_eligible?: boolean | null
          carats?: number | null
          clar?: string | null
          col?: string | null
          country?: string | null
          culet?: string | null
          cut?: string | null
          delivered_price?: number | null
          depth?: number | null
          diamond_id?: string | null
          discount?: number | null
          external_id?: string | null
          eye_clean?: string | null
          flo?: string | null
          flo_col?: number | null
          girdle?: string | null
          green?: boolean | null
          height?: number | null
          id?: string
          image?: string | null
          import_batch_id?: string | null
          imported_at?: string
          is_returnable?: boolean | null
          lab?: string | null
          labgrown_type?: string | null
          length?: number | null
          lg?: string | null
          markup_currency?: string | null
          markup_price?: number | null
          max_delivery_days?: number | null
          milky?: boolean | null
          min_delivery_days?: number | null
          mine_of_origin?: string | null
          pdf?: string | null
          pol?: string | null
          price?: number | null
          price_per_carat?: number | null
          report_no?: string | null
          shape?: string | null
          stock_id?: string | null
          symm?: string | null
          table?: number | null
          video?: string | null
          videos_frame?: number | null
          videos_image_uri?: string | null
          width?: number | null
        }
        Update: {
          brown?: boolean | null
          canada_mark_eligible?: boolean | null
          carats?: number | null
          clar?: string | null
          col?: string | null
          country?: string | null
          culet?: string | null
          cut?: string | null
          delivered_price?: number | null
          depth?: number | null
          diamond_id?: string | null
          discount?: number | null
          external_id?: string | null
          eye_clean?: string | null
          flo?: string | null
          flo_col?: number | null
          girdle?: string | null
          green?: boolean | null
          height?: number | null
          id?: string
          image?: string | null
          import_batch_id?: string | null
          imported_at?: string
          is_returnable?: boolean | null
          lab?: string | null
          labgrown_type?: string | null
          length?: number | null
          lg?: string | null
          markup_currency?: string | null
          markup_price?: number | null
          max_delivery_days?: number | null
          milky?: boolean | null
          min_delivery_days?: number | null
          mine_of_origin?: string | null
          pdf?: string | null
          pol?: string | null
          price?: number | null
          price_per_carat?: number | null
          report_no?: string | null
          shape?: string | null
          stock_id?: string | null
          symm?: string | null
          table?: number | null
          video?: string | null
          videos_frame?: number | null
          videos_image_uri?: string | null
          width?: number | null
        }
        Relationships: []
      }
      diamond_nature_options: {
        Row: {
          created_at: string
          display_order: number
          id: string
          image_url: string | null
          name: string
          option_value: string
          price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string | null
          name: string
          option_value: string
          price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string | null
          name?: string
          option_value?: string
          price?: number
          updated_at?: string
        }
        Relationships: []
      }
      diamond_outlier_config: {
        Row: {
          availability_per_step: number
          batch_rows: number
          cheap_z: number
          dear_mode: string
          dear_z: number
          debounce_minutes: number
          emergency_min_group: number
          emergency_mult: number
          id: number
          live_client_ids: string[]
          live_scope: string
          mode: string
          n_min: number
          n_target: number
          rap_min_broad: number
          rap_min_lab: number
          rap_min_lab_cut: number
          rap_min_shelf: number
          shadow_mode: boolean
          spread_floor: number
          step_gap_minutes: number
          trim_rounds: number
          trim_sigma: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          availability_per_step?: number
          batch_rows?: number
          cheap_z?: number
          dear_mode?: string
          dear_z?: number
          debounce_minutes?: number
          emergency_min_group?: number
          emergency_mult?: number
          id?: number
          live_client_ids?: string[]
          live_scope?: string
          mode?: string
          n_min?: number
          n_target?: number
          rap_min_broad?: number
          rap_min_lab?: number
          rap_min_lab_cut?: number
          rap_min_shelf?: number
          shadow_mode?: boolean
          spread_floor?: number
          step_gap_minutes?: number
          trim_rounds?: number
          trim_sigma?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          availability_per_step?: number
          batch_rows?: number
          cheap_z?: number
          dear_mode?: string
          dear_z?: number
          debounce_minutes?: number
          emergency_min_group?: number
          emergency_mult?: number
          id?: number
          live_client_ids?: string[]
          live_scope?: string
          mode?: string
          n_min?: number
          n_target?: number
          rap_min_broad?: number
          rap_min_lab?: number
          rap_min_lab_cut?: number
          rap_min_shelf?: number
          shadow_mode?: boolean
          spread_floor?: number
          step_gap_minutes?: number
          trim_rounds?: number
          trim_sigma?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      diamond_pipeline_jobs: {
        Row: {
          cancel_requested: boolean
          created_at: string
          cursor_n: number
          cursor_text: string | null
          error: string | null
          finished_at: string | null
          id: string
          lab_rows: number | null
          last_step_at: string | null
          last_step_ms: number | null
          natural_rows: number | null
          next_step_not_before: string | null
          phase: string
          pool_rows: number | null
          requested_by: string | null
          rows_done: number
          run_id: string | null
          started_at: string | null
          status: string
          steps_done: number
          stone_type: string | null
          timings: Json
          trigger_source: string | null
        }
        Insert: {
          cancel_requested?: boolean
          created_at?: string
          cursor_n?: number
          cursor_text?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          lab_rows?: number | null
          last_step_at?: string | null
          last_step_ms?: number | null
          natural_rows?: number | null
          next_step_not_before?: string | null
          phase?: string
          pool_rows?: number | null
          requested_by?: string | null
          rows_done?: number
          run_id?: string | null
          started_at?: string | null
          status?: string
          steps_done?: number
          stone_type?: string | null
          timings?: Json
          trigger_source?: string | null
        }
        Update: {
          cancel_requested?: boolean
          created_at?: string
          cursor_n?: number
          cursor_text?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          lab_rows?: number | null
          last_step_at?: string | null
          last_step_ms?: number | null
          natural_rows?: number | null
          next_step_not_before?: string | null
          phase?: string
          pool_rows?: number | null
          requested_by?: string | null
          rows_done?: number
          run_id?: string | null
          started_at?: string | null
          status?: string
          steps_done?: number
          stone_type?: string | null
          timings?: Json
          trigger_source?: string | null
        }
        Relationships: []
      }
      diamond_pipeline_state: {
        Row: {
          id: number
          last_error: string | null
          last_pool_change_at: string | null
          last_run_finished_at: string | null
          last_run_id: string | null
          last_run_started_at: string | null
          pending: boolean
          status: string
          updated_at: string
        }
        Insert: {
          id?: number
          last_error?: string | null
          last_pool_change_at?: string | null
          last_run_finished_at?: string | null
          last_run_id?: string | null
          last_run_started_at?: string | null
          pending?: boolean
          status?: string
          updated_at?: string
        }
        Update: {
          id?: number
          last_error?: string | null
          last_pool_change_at?: string | null
          last_run_finished_at?: string | null
          last_run_id?: string | null
          last_run_started_at?: string | null
          pending?: boolean
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      diamond_pool_distinct_values_cache: {
        Row: {
          id: number
          pool_rows: number
          refreshed_at: string
          values: Json
        }
        Insert: {
          id?: number
          pool_rows?: number
          refreshed_at?: string
          values?: Json
        }
        Update: {
          id?: number
          pool_rows?: number
          refreshed_at?: string
          values?: Json
        }
        Relationships: []
      }
      diamond_pool_fx_prices: {
        Row: {
          pool_id: string
          price_cad: number
          price_gbp: number
          source_usd_price: number
          version_id: number
        }
        Insert: {
          pool_id: string
          price_cad: number
          price_gbp: number
          source_usd_price: number
          version_id: number
        }
        Update: {
          pool_id?: string
          price_cad?: number
          price_gbp?: number
          source_usd_price?: number
          version_id?: number
        }
        Relationships: []
      }
      diamond_pool_rep_changes: {
        Row: {
          carat_bucket: number
          clarity: string
          color: string
          id: number
          new_carats: number | null
          new_pool_id: string | null
          new_price: number | null
          old_carats: number | null
          old_pool_id: string | null
          old_price: number | null
          old_z_model: number | null
          old_z_rap: number | null
          run_id: string | null
          shape_id: string
          shelf_hidden: boolean
          shelf_n: number | null
          stone_type: string
          uplift_pct: number | null
        }
        Insert: {
          carat_bucket: number
          clarity: string
          color: string
          id?: number
          new_carats?: number | null
          new_pool_id?: string | null
          new_price?: number | null
          old_carats?: number | null
          old_pool_id?: string | null
          old_price?: number | null
          old_z_model?: number | null
          old_z_rap?: number | null
          run_id?: string | null
          shape_id: string
          shelf_hidden?: boolean
          shelf_n?: number | null
          stone_type: string
          uplift_pct?: number | null
        }
        Update: {
          carat_bucket?: number
          clarity?: string
          color?: string
          id?: number
          new_carats?: number | null
          new_pool_id?: string | null
          new_price?: number | null
          old_carats?: number | null
          old_pool_id?: string | null
          old_price?: number | null
          old_z_model?: number | null
          old_z_rap?: number | null
          run_id?: string | null
          shape_id?: string
          shelf_hidden?: boolean
          shelf_n?: number | null
          stone_type?: string
          uplift_pct?: number | null
        }
        Relationships: []
      }
      diamond_pool_scores: {
        Row: {
          blocked: boolean
          carat_bucket: number
          carats: number | null
          clarity: string
          color: string
          confidence: string | null
          expected_price: number | null
          is_cheap: boolean
          is_emergency: boolean
          is_expensive: boolean
          model_cohort_n: number | null
          model_level: string | null
          model_slope: number | null
          pool_id: string
          ppc: number | null
          rap_group_median_disc: number | null
          rap_group_n: number | null
          rap_rung: number | null
          raw_price: number | null
          run_id: string | null
          scored_at: string
          shape_id: string
          shelf_median_ppc: number | null
          shelf_n: number | null
          side: string | null
          stone_type: string
          z_model: number
          z_rap: number
        }
        Insert: {
          blocked?: boolean
          carat_bucket: number
          carats?: number | null
          clarity: string
          color: string
          confidence?: string | null
          expected_price?: number | null
          is_cheap?: boolean
          is_emergency?: boolean
          is_expensive?: boolean
          model_cohort_n?: number | null
          model_level?: string | null
          model_slope?: number | null
          pool_id: string
          ppc?: number | null
          rap_group_median_disc?: number | null
          rap_group_n?: number | null
          rap_rung?: number | null
          raw_price?: number | null
          run_id?: string | null
          scored_at?: string
          shape_id: string
          shelf_median_ppc?: number | null
          shelf_n?: number | null
          side?: string | null
          stone_type: string
          z_model?: number
          z_rap?: number
        }
        Update: {
          blocked?: boolean
          carat_bucket?: number
          carats?: number | null
          clarity?: string
          color?: string
          confidence?: string | null
          expected_price?: number | null
          is_cheap?: boolean
          is_emergency?: boolean
          is_expensive?: boolean
          model_cohort_n?: number | null
          model_level?: string | null
          model_slope?: number | null
          pool_id?: string
          ppc?: number | null
          rap_group_median_disc?: number | null
          rap_group_n?: number | null
          rap_rung?: number | null
          raw_price?: number | null
          run_id?: string | null
          scored_at?: string
          shape_id?: string
          shelf_median_ppc?: number | null
          shelf_n?: number | null
          side?: string | null
          stone_type?: string
          z_model?: number
          z_rap?: number
        }
        Relationships: []
      }
      diamond_quality_options: {
        Row: {
          created_at: string
          display_order: number
          id: string
          image_url: string | null
          name: string
          option_value: string
          price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string | null
          name: string
          option_value: string
          price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string | null
          name?: string
          option_value?: string
          price?: number
          updated_at?: string
        }
        Relationships: []
      }
      diamond_scoring_runs: {
        Row: {
          config_snapshot: Json | null
          error: string | null
          finished_at: string | null
          id: string
          lab_blocked: number | null
          lab_cheap: number | null
          lab_emergency: number | null
          lab_expensive: number | null
          lab_rows: number | null
          natural_blocked: number | null
          natural_cheap: number | null
          natural_emergency: number | null
          natural_expensive: number | null
          natural_rows: number | null
          pool_rows: number | null
          refresh_mode: string | null
          reps_changed: number | null
          shadow_mode: boolean | null
          shelves_fully_blocked: number | null
          shelves_total: number | null
          started_at: string
          status: string
          step_timings: Json
          trigger_source: string | null
        }
        Insert: {
          config_snapshot?: Json | null
          error?: string | null
          finished_at?: string | null
          id?: string
          lab_blocked?: number | null
          lab_cheap?: number | null
          lab_emergency?: number | null
          lab_expensive?: number | null
          lab_rows?: number | null
          natural_blocked?: number | null
          natural_cheap?: number | null
          natural_emergency?: number | null
          natural_expensive?: number | null
          natural_rows?: number | null
          pool_rows?: number | null
          refresh_mode?: string | null
          reps_changed?: number | null
          shadow_mode?: boolean | null
          shelves_fully_blocked?: number | null
          shelves_total?: number | null
          started_at?: string
          status?: string
          step_timings?: Json
          trigger_source?: string | null
        }
        Update: {
          config_snapshot?: Json | null
          error?: string | null
          finished_at?: string | null
          id?: string
          lab_blocked?: number | null
          lab_cheap?: number | null
          lab_emergency?: number | null
          lab_expensive?: number | null
          lab_rows?: number | null
          natural_blocked?: number | null
          natural_cheap?: number | null
          natural_emergency?: number | null
          natural_expensive?: number | null
          natural_rows?: number | null
          pool_rows?: number | null
          refresh_mode?: string | null
          reps_changed?: number | null
          shadow_mode?: boolean | null
          shelves_fully_blocked?: number | null
          shelves_total?: number | null
          started_at?: string
          status?: string
          step_timings?: Json
          trigger_source?: string | null
        }
        Relationships: []
      }
      diamond_shape_options: {
        Row: {
          created_at: string
          display_order: number
          id: string
          image_url: string | null
          name: string
          option_value: string
          price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string | null
          name: string
          option_value: string
          price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string | null
          name?: string
          option_value?: string
          price?: number
          updated_at?: string
        }
        Relationships: []
      }
      diamond_size_options: {
        Row: {
          created_at: string
          display_order: number
          id: string
          image_url: string | null
          name: string
          option_value: string
          price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string | null
          name: string
          option_value: string
          price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string | null
          name?: string
          option_value?: string
          price?: number
          updated_at?: string
        }
        Relationships: []
      }
      diamond_work_base: {
        Row: {
          bucket: number | null
          carats: number | null
          clarity: string | null
          color: string | null
          crank: number | null
          cutq: string | null
          disc: number | null
          flq: string | null
          lab: string | null
          lnc: number | null
          lnp: number | null
          mband: number | null
          pool_id: string
          ppc: number | null
          price: number | null
          qrank: number | null
          rband: number | null
          rshape: string | null
          shape_id: string | null
          stone_type: string | null
        }
        Insert: {
          bucket?: number | null
          carats?: number | null
          clarity?: string | null
          color?: string | null
          crank?: number | null
          cutq?: string | null
          disc?: number | null
          flq?: string | null
          lab?: string | null
          lnc?: number | null
          lnp?: number | null
          mband?: number | null
          pool_id: string
          ppc?: number | null
          price?: number | null
          qrank?: number | null
          rband?: number | null
          rshape?: string | null
          shape_id?: string | null
          stone_type?: string | null
        }
        Update: {
          bucket?: number | null
          carats?: number | null
          clarity?: string | null
          color?: string | null
          crank?: number | null
          cutq?: string | null
          disc?: number | null
          flq?: string | null
          lab?: string | null
          lnc?: number | null
          lnp?: number | null
          mband?: number | null
          pool_id?: string
          ppc?: number | null
          price?: number | null
          qrank?: number | null
          rband?: number | null
          rshape?: string | null
          shape_id?: string | null
          stone_type?: string | null
        }
        Relationships: []
      }
      diamond_work_fit: {
        Row: {
          a: number | null
          b: number | null
          k: string | null
          n_all: number | null
        }
        Insert: {
          a?: number | null
          b?: number | null
          k?: string | null
          n_all?: number | null
        }
        Update: {
          a?: number | null
          b?: number | null
          k?: string | null
          n_all?: number | null
        }
        Relationships: []
      }
      diamond_work_m: {
        Row: {
          k: string | null
          keep: boolean | null
          lnc: number | null
          pool_id: string | null
          r: number | null
          y: number | null
        }
        Insert: {
          k?: string | null
          keep?: boolean | null
          lnc?: number | null
          pool_id?: string | null
          r?: number | null
          y?: number | null
        }
        Update: {
          k?: string | null
          keep?: boolean | null
          lnc?: number | null
          pool_id?: string | null
          r?: number | null
          y?: number | null
        }
        Relationships: []
      }
      diamond_work_model: {
        Row: {
          dev: number | null
          expv: number | null
          lvl: string | null
          mad: number | null
          mad_hi: number | null
          mad_lo: number | null
          n: number | null
          pool_id: string
          slope: number | null
        }
        Insert: {
          dev?: number | null
          expv?: number | null
          lvl?: string | null
          mad?: number | null
          mad_hi?: number | null
          mad_lo?: number | null
          n?: number | null
          pool_id: string
          slope?: number | null
        }
        Update: {
          dev?: number | null
          expv?: number | null
          lvl?: string | null
          mad?: number | null
          mad_hi?: number | null
          mad_lo?: number | null
          n?: number | null
          pool_id?: string
          slope?: number | null
        }
        Relationships: []
      }
      diamond_work_off_c: {
        Row: {
          color: string | null
          off: number | null
          shape_id: string | null
        }
        Insert: {
          color?: string | null
          off?: number | null
          shape_id?: string | null
        }
        Update: {
          color?: string | null
          off?: number | null
          shape_id?: string | null
        }
        Relationships: []
      }
      diamond_work_off_q: {
        Row: {
          clarity: string | null
          off: number | null
          shape_id: string | null
        }
        Insert: {
          clarity?: string | null
          off?: number | null
          shape_id?: string | null
        }
        Update: {
          clarity?: string | null
          off?: number | null
          shape_id?: string | null
        }
        Relationships: []
      }
      diamond_work_rap: {
        Row: {
          bucket: number | null
          clarity: string | null
          color: string | null
          cutq: string | null
          dev: number | null
          lab: string | null
          mad: number | null
          mad_hi: number | null
          mad_lo: number | null
          med: number | null
          n: number | null
          pool_id: string
          rband: number | null
          rshape: string | null
          rung: number
          shape_id: string | null
          x: number | null
        }
        Insert: {
          bucket?: number | null
          clarity?: string | null
          color?: string | null
          cutq?: string | null
          dev?: number | null
          lab?: string | null
          mad?: number | null
          mad_hi?: number | null
          mad_lo?: number | null
          med?: number | null
          n?: number | null
          pool_id: string
          rband?: number | null
          rshape?: string | null
          rung?: number
          shape_id?: string | null
          x?: number | null
        }
        Update: {
          bucket?: number | null
          clarity?: string | null
          color?: string | null
          cutq?: string | null
          dev?: number | null
          lab?: string | null
          mad?: number | null
          mad_hi?: number | null
          mad_lo?: number | null
          med?: number | null
          n?: number | null
          pool_id?: string
          rband?: number | null
          rshape?: string | null
          rung?: number
          shape_id?: string | null
          x?: number | null
        }
        Relationships: []
      }
      diamond_work_res: {
        Row: {
          dev: number | null
          expv: number | null
          k: string | null
          mad: number | null
          mad_hi: number | null
          mad_lo: number | null
          n: number | null
          pool_id: string | null
          slope: number | null
        }
        Insert: {
          dev?: number | null
          expv?: number | null
          k?: string | null
          mad?: number | null
          mad_hi?: number | null
          mad_lo?: number | null
          n?: number | null
          pool_id?: string | null
          slope?: number | null
        }
        Update: {
          dev?: number | null
          expv?: number | null
          k?: string | null
          mad?: number | null
          mad_hi?: number | null
          mad_lo?: number | null
          n?: number | null
          pool_id?: string | null
          slope?: number | null
        }
        Relationships: []
      }
      diamond_work_scores: {
        Row: {
          blocked: boolean
          carat_bucket: number
          carats: number | null
          clarity: string
          color: string
          confidence: string | null
          expected_price: number | null
          is_cheap: boolean
          is_emergency: boolean
          is_expensive: boolean
          model_cohort_n: number | null
          model_level: string | null
          model_slope: number | null
          pool_id: string
          ppc: number | null
          rap_group_median_disc: number | null
          rap_group_n: number | null
          rap_rung: number | null
          raw_price: number | null
          run_id: string | null
          scored_at: string
          shape_id: string
          shelf_median_ppc: number | null
          shelf_n: number | null
          side: string | null
          stone_type: string
          z_model: number
          z_rap: number
        }
        Insert: {
          blocked?: boolean
          carat_bucket: number
          carats?: number | null
          clarity: string
          color: string
          confidence?: string | null
          expected_price?: number | null
          is_cheap?: boolean
          is_emergency?: boolean
          is_expensive?: boolean
          model_cohort_n?: number | null
          model_level?: string | null
          model_slope?: number | null
          pool_id: string
          ppc?: number | null
          rap_group_median_disc?: number | null
          rap_group_n?: number | null
          rap_rung?: number | null
          raw_price?: number | null
          run_id?: string | null
          scored_at?: string
          shape_id: string
          shelf_median_ppc?: number | null
          shelf_n?: number | null
          side?: string | null
          stone_type: string
          z_model?: number
          z_rap?: number
        }
        Update: {
          blocked?: boolean
          carat_bucket?: number
          carats?: number | null
          clarity?: string
          color?: string
          confidence?: string | null
          expected_price?: number | null
          is_cheap?: boolean
          is_emergency?: boolean
          is_expensive?: boolean
          model_cohort_n?: number | null
          model_level?: string | null
          model_slope?: number | null
          pool_id?: string
          ppc?: number | null
          rap_group_median_disc?: number | null
          rap_group_n?: number | null
          rap_rung?: number | null
          raw_price?: number | null
          run_id?: string | null
          scored_at?: string
          shape_id?: string
          shelf_median_ppc?: number | null
          shelf_n?: number | null
          side?: string | null
          stone_type?: string
          z_model?: number
          z_rap?: number
        }
        Relationships: []
      }
      diamond_work_shape_fit: {
        Row: {
          a: number | null
          b: number | null
          shape_id: string | null
        }
        Insert: {
          a?: number | null
          b?: number | null
          shape_id?: string | null
        }
        Update: {
          a?: number | null
          b?: number | null
          shape_id?: string | null
        }
        Relationships: []
      }
      diamond_work_shelf: {
        Row: {
          bucket: number | null
          clarity: string | null
          color: string | null
          shape_id: string | null
          shelf_med: number | null
          shelf_n: number | null
        }
        Insert: {
          bucket?: number | null
          clarity?: string | null
          color?: string | null
          shape_id?: string | null
          shelf_med?: number | null
          shelf_n?: number | null
        }
        Update: {
          bucket?: number | null
          clarity?: string | null
          color?: string | null
          shape_id?: string | null
          shelf_med?: number | null
          shelf_n?: number | null
        }
        Relationships: []
      }
      diamond_work_stat: {
        Row: {
          k: string | null
          mad: number | null
          mad_hi: number | null
          mad_lo: number | null
          rmed: number | null
        }
        Insert: {
          k?: string | null
          mad?: number | null
          mad_hi?: number | null
          mad_lo?: number | null
          rmed?: number | null
        }
        Update: {
          k?: string | null
          mad?: number | null
          mad_hi?: number | null
          mad_lo?: number | null
          rmed?: number | null
        }
        Relationships: []
      }
      email_logs: {
        Row: {
          created_at: string
          email_type: string
          error_message: string | null
          id: string
          metadata: Json | null
          recipient_email: string
          resend_id: string | null
          status: string
          subject: string
        }
        Insert: {
          created_at?: string
          email_type: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          recipient_email: string
          resend_id?: string | null
          status?: string
          subject: string
        }
        Update: {
          created_at?: string
          email_type?: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          recipient_email?: string
          resend_id?: string | null
          status?: string
          subject?: string
        }
        Relationships: []
      }
      email_queue: {
        Row: {
          attempt_count: number
          client_id: string | null
          created_at: string
          email_type: string
          html_body: string
          id: string
          last_attempted_at: string | null
          max_attempts: number
          metadata: Json
          next_attempt_at: string
          status: string
          subject: string
          to_email: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          client_id?: string | null
          created_at?: string
          email_type: string
          html_body: string
          id?: string
          last_attempted_at?: string | null
          max_attempts?: number
          metadata?: Json
          next_attempt_at?: string
          status?: string
          subject: string
          to_email: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          client_id?: string | null
          created_at?: string
          email_type?: string
          html_body?: string
          id?: string
          last_attempted_at?: string | null
          max_attempts?: number
          metadata?: Json
          next_attempt_at?: string
          status?: string
          subject?: string
          to_email?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_queue_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_queue_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      email_verification_tokens: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          token: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          expires_at: string
          id?: string
          token: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          token?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      failed_login_attempts: {
        Row: {
          attempted_at: string | null
          email: string
          failure_reason: string | null
          id: string
          ip_address: string | null
          user_agent: string | null
        }
        Insert: {
          attempted_at?: string | null
          email: string
          failure_reason?: string | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
        }
        Update: {
          attempted_at?: string | null
          email?: string
          failure_reason?: string | null
          id?: string
          ip_address?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      gemstone_inventory_pool: {
        Row: {
          carats: number | null
          clarity: string | null
          color: string | null
          color_shade: string | null
          cut: string | null
          external_id: string | null
          gem_type: string | null
          id: string
          image: string | null
          import_batch_id: string | null
          imported_at: string
          lab: string | null
          length: number | null
          markup_currency: string | null
          markup_price: number | null
          mine_of_origin: string | null
          pdf_url: string | null
          price: number | null
          price_per_carat: number | null
          report_no: string | null
          return_days: number | null
          shape: string | null
          stock_id: string | null
          treatment: string | null
          video: string | null
          width: number | null
        }
        Insert: {
          carats?: number | null
          clarity?: string | null
          color?: string | null
          color_shade?: string | null
          cut?: string | null
          external_id?: string | null
          gem_type?: string | null
          id?: string
          image?: string | null
          import_batch_id?: string | null
          imported_at?: string
          lab?: string | null
          length?: number | null
          markup_currency?: string | null
          markup_price?: number | null
          mine_of_origin?: string | null
          pdf_url?: string | null
          price?: number | null
          price_per_carat?: number | null
          report_no?: string | null
          return_days?: number | null
          shape?: string | null
          stock_id?: string | null
          treatment?: string | null
          video?: string | null
          width?: number | null
        }
        Update: {
          carats?: number | null
          clarity?: string | null
          color?: string | null
          color_shade?: string | null
          cut?: string | null
          external_id?: string | null
          gem_type?: string | null
          id?: string
          image?: string | null
          import_batch_id?: string | null
          imported_at?: string
          lab?: string | null
          length?: number | null
          markup_currency?: string | null
          markup_price?: number | null
          mine_of_origin?: string | null
          pdf_url?: string | null
          price?: number | null
          price_per_carat?: number | null
          report_no?: string | null
          return_days?: number | null
          shape?: string | null
          stock_id?: string | null
          treatment?: string | null
          video?: string | null
          width?: number | null
        }
        Relationships: []
      }
      gemstone_inventory_pool_staging: {
        Row: {
          carats: number | null
          clarity: string | null
          color: string | null
          color_shade: string | null
          cut: string | null
          external_id: string | null
          gem_type: string | null
          id: string
          image: string | null
          import_batch_id: string | null
          imported_at: string
          lab: string | null
          length: number | null
          markup_currency: string | null
          markup_price: number | null
          mine_of_origin: string | null
          pdf_url: string | null
          price: number | null
          price_per_carat: number | null
          report_no: string | null
          return_days: number | null
          shape: string | null
          stock_id: string | null
          treatment: string | null
          video: string | null
          width: number | null
        }
        Insert: {
          carats?: number | null
          clarity?: string | null
          color?: string | null
          color_shade?: string | null
          cut?: string | null
          external_id?: string | null
          gem_type?: string | null
          id?: string
          image?: string | null
          import_batch_id?: string | null
          imported_at?: string
          lab?: string | null
          length?: number | null
          markup_currency?: string | null
          markup_price?: number | null
          mine_of_origin?: string | null
          pdf_url?: string | null
          price?: number | null
          price_per_carat?: number | null
          report_no?: string | null
          return_days?: number | null
          shape?: string | null
          stock_id?: string | null
          treatment?: string | null
          video?: string | null
          width?: number | null
        }
        Update: {
          carats?: number | null
          clarity?: string | null
          color?: string | null
          color_shade?: string | null
          cut?: string | null
          external_id?: string | null
          gem_type?: string | null
          id?: string
          image?: string | null
          import_batch_id?: string | null
          imported_at?: string
          lab?: string | null
          length?: number | null
          markup_currency?: string | null
          markup_price?: number | null
          mine_of_origin?: string | null
          pdf_url?: string | null
          price?: number | null
          price_per_carat?: number | null
          report_no?: string | null
          return_days?: number | null
          shape?: string | null
          stock_id?: string | null
          treatment?: string | null
          video?: string | null
          width?: number | null
        }
        Relationships: []
      }
      ghl_sync_logs: {
        Row: {
          client_id: string
          created_at: string
          error: string | null
          form_type: string
          ghl_contact_id: string | null
          ghl_response: Json | null
          id: string
          lead_id: string | null
          stage: string
          status: string
        }
        Insert: {
          client_id: string
          created_at?: string
          error?: string | null
          form_type?: string
          ghl_contact_id?: string | null
          ghl_response?: Json | null
          id?: string
          lead_id?: string | null
          stage: string
          status: string
        }
        Update: {
          client_id?: string
          created_at?: string
          error?: string | null
          form_type?: string
          ghl_contact_id?: string | null
          ghl_response?: Json | null
          id?: string
          lead_id?: string | null
          stage?: string
          status?: string
        }
        Relationships: []
      }
      grill_form_leads: {
        Row: {
          additional_notes: string | null
          ai_preview_url: string | null
          bottom_teeth: string | null
          budget: string | null
          client_id: string
          created_at: string
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          device_info: Json | null
          edit_history: Json[] | null
          engraving_text: string | null
          follow_up_status: string | null
          grillz_type: string | null
          id: string
          logo_file_url: string | null
          metal_purity: string | null
          metal_type: string
          question_answers: Json | null
          top_teeth: string | null
          updated_at: string
          uploaded_image_urls: string[] | null
        }
        Insert: {
          additional_notes?: string | null
          ai_preview_url?: string | null
          bottom_teeth?: string | null
          budget?: string | null
          client_id: string
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          device_info?: Json | null
          edit_history?: Json[] | null
          engraving_text?: string | null
          follow_up_status?: string | null
          grillz_type?: string | null
          id?: string
          logo_file_url?: string | null
          metal_purity?: string | null
          metal_type: string
          question_answers?: Json | null
          top_teeth?: string | null
          updated_at?: string
          uploaded_image_urls?: string[] | null
        }
        Update: {
          additional_notes?: string | null
          ai_preview_url?: string | null
          bottom_teeth?: string | null
          budget?: string | null
          client_id?: string
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          device_info?: Json | null
          edit_history?: Json[] | null
          engraving_text?: string | null
          follow_up_status?: string | null
          grillz_type?: string | null
          id?: string
          logo_file_url?: string | null
          metal_purity?: string | null
          metal_type?: string
          question_answers?: Json | null
          top_teeth?: string | null
          updated_at?: string
          uploaded_image_urls?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "grill_form_leads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grill_form_leads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      grill_preview_images: {
        Row: {
          created_at: string
          custom_instruction: string | null
          feedback: string | null
          generation_number: number
          id: string
          image_url: string
          lead_id: string
        }
        Insert: {
          created_at?: string
          custom_instruction?: string | null
          feedback?: string | null
          generation_number?: number
          id?: string
          image_url: string
          lead_id: string
        }
        Update: {
          created_at?: string
          custom_instruction?: string | null
          feedback?: string | null
          generation_number?: number
          id?: string
          image_url?: string
          lead_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grill_preview_images_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "grill_form_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      impersonation_sessions: {
        Row: {
          actions_performed: number | null
          admin_user_id: string
          client_id: string
          duration_seconds: number | null
          ended_at: string | null
          id: string
          started_at: string
        }
        Insert: {
          actions_performed?: number | null
          admin_user_id: string
          client_id: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          started_at?: string
        }
        Update: {
          actions_performed?: number | null
          admin_user_id?: string
          client_id?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "impersonation_sessions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impersonation_sessions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_cost_estimates: {
        Row: {
          client_id: string
          confidence: string | null
          created_at: string | null
          currency: string | null
          feedback: string | null
          id: string
          labor_estimate: number | null
          lead_id: string
          lead_source: string
          material_cost: number | null
          reasoning: string | null
          suggested_retail_high: number | null
          suggested_retail_low: number | null
        }
        Insert: {
          client_id: string
          confidence?: string | null
          created_at?: string | null
          currency?: string | null
          feedback?: string | null
          id?: string
          labor_estimate?: number | null
          lead_id: string
          lead_source: string
          material_cost?: number | null
          reasoning?: string | null
          suggested_retail_high?: number | null
          suggested_retail_low?: number | null
        }
        Update: {
          client_id?: string
          confidence?: string | null
          created_at?: string | null
          currency?: string | null
          feedback?: string | null
          id?: string
          labor_estimate?: number | null
          lead_id?: string
          lead_source?: string
          material_cost?: number | null
          reasoning?: string | null
          suggested_retail_high?: number | null
          suggested_retail_low?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_cost_estimates_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_cost_estimates_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_follow_up_notes: {
        Row: {
          author_email: string | null
          author_name: string | null
          client_id: string
          content: string
          created_at: string | null
          id: string
          lead_id: string
          lead_source: string
          note_type: string
        }
        Insert: {
          author_email?: string | null
          author_name?: string | null
          client_id: string
          content: string
          created_at?: string | null
          id?: string
          lead_id: string
          lead_source: string
          note_type?: string
        }
        Update: {
          author_email?: string | null
          author_name?: string | null
          client_id?: string
          content?: string
          created_at?: string | null
          id?: string
          lead_id?: string
          lead_source?: string
          note_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_follow_up_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_follow_up_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_quote_history: {
        Row: {
          client_id: string
          currency: string | null
          customer_email: string
          customer_name: string | null
          id: string
          lead_id: string
          lead_source: string
          message: string | null
          quote_amount: number
          sent_at: string | null
          status: string | null
        }
        Insert: {
          client_id: string
          currency?: string | null
          customer_email: string
          customer_name?: string | null
          id?: string
          lead_id: string
          lead_source: string
          message?: string | null
          quote_amount: number
          sent_at?: string | null
          status?: string | null
        }
        Update: {
          client_id?: string
          currency?: string | null
          customer_email?: string
          customer_name?: string | null
          id?: string
          lead_id?: string
          lead_source?: string
          message?: string | null
          quote_amount?: number
          sent_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_quote_history_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_quote_history_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      license_products: {
        Row: {
          created_at: string
          label: string | null
          stripe_product_id: string
        }
        Insert: {
          created_at?: string
          label?: string | null
          stripe_product_id: string
        }
        Update: {
          created_at?: string
          label?: string | null
          stripe_product_id?: string
        }
        Relationships: []
      }
      login_otp_tokens: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          otp_hash: string
          used: boolean
        }
        Insert: {
          created_at?: string
          email: string
          expires_at: string
          id?: string
          otp_hash: string
          used?: boolean
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          otp_hash?: string
          used?: boolean
        }
        Relationships: []
      }
      lookup_metals: {
        Row: {
          base_price: number | null
          color_family: string | null
          color_hex: string | null
          created_at: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          metal_id: string
          metal_name: string
        }
        Insert: {
          base_price?: number | null
          color_family?: string | null
          color_hex?: string | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          metal_id: string
          metal_name: string
        }
        Update: {
          base_price?: number | null
          color_family?: string | null
          color_hex?: string | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          metal_id?: string
          metal_name?: string
        }
        Relationships: []
      }
      lookup_shanks: {
        Row: {
          base_price: number | null
          created_at: string | null
          description: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          shank_id: string
          shank_name: string
        }
        Insert: {
          base_price?: number | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          shank_id: string
          shank_name: string
        }
        Update: {
          base_price?: number | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          shank_id?: string
          shank_name?: string
        }
        Relationships: []
      }
      lookup_shapes: {
        Row: {
          created_at: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          shape_id: string
          shape_name: string
        }
        Insert: {
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          shape_id: string
          shape_name: string
        }
        Update: {
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          shape_id?: string
          shape_name?: string
        }
        Relationships: []
      }
      lookup_styles: {
        Row: {
          base_price: number | null
          created_at: string | null
          description: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          style_id: string
          style_name: string
        }
        Insert: {
          base_price?: number | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          style_id: string
          style_name: string
        }
        Update: {
          base_price?: number | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          style_id?: string
          style_name?: string
        }
        Relationships: []
      }
      lookup_visual_colors: {
        Row: {
          color_hex: string | null
          color_id: string
          color_name: string
          created_at: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
        }
        Insert: {
          color_hex?: string | null
          color_id: string
          color_name: string
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
        }
        Update: {
          color_hex?: string | null
          color_id?: string
          color_name?: string
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
        }
        Relationships: []
      }
      marketing_campaign_recipients: {
        Row: {
          bounced_at: string | null
          campaign_id: string
          clicked_at: string | null
          complained_at: string | null
          created_at: string
          delivered_at: string | null
          email: string
          error: string | null
          id: string
          lead_id: string
          opened_at: string | null
          resend_id: string | null
          sent_at: string | null
          status: string
          unsubscribed_at: string | null
        }
        Insert: {
          bounced_at?: string | null
          campaign_id: string
          clicked_at?: string | null
          complained_at?: string | null
          created_at?: string
          delivered_at?: string | null
          email: string
          error?: string | null
          id?: string
          lead_id: string
          opened_at?: string | null
          resend_id?: string | null
          sent_at?: string | null
          status?: string
          unsubscribed_at?: string | null
        }
        Update: {
          bounced_at?: string | null
          campaign_id?: string
          clicked_at?: string | null
          complained_at?: string | null
          created_at?: string
          delivered_at?: string | null
          email?: string
          error?: string | null
          id?: string
          lead_id?: string
          opened_at?: string | null
          resend_id?: string | null
          sent_at?: string | null
          status?: string
          unsubscribed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_campaign_recipients_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "marketing_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_campaigns: {
        Row: {
          batch_size: number
          created_at: string
          created_by: string | null
          daily_cap: number | null
          id: string
          interval_minutes: number
          last_batch_at: string | null
          list_ids: string[]
          max_bounce_rate: number
          max_complaint_rate: number
          name: string
          pause_reason: string | null
          preview_text: string
          rendered_html: string | null
          start_at: string | null
          status: string
          subject: string
          template_id: string | null
          timezone: string
          updated_at: string
          window_end: string | null
          window_start: string | null
        }
        Insert: {
          batch_size?: number
          created_at?: string
          created_by?: string | null
          daily_cap?: number | null
          id?: string
          interval_minutes?: number
          last_batch_at?: string | null
          list_ids?: string[]
          max_bounce_rate?: number
          max_complaint_rate?: number
          name: string
          pause_reason?: string | null
          preview_text?: string
          rendered_html?: string | null
          start_at?: string | null
          status?: string
          subject?: string
          template_id?: string | null
          timezone?: string
          updated_at?: string
          window_end?: string | null
          window_start?: string | null
        }
        Update: {
          batch_size?: number
          created_at?: string
          created_by?: string | null
          daily_cap?: number | null
          id?: string
          interval_minutes?: number
          last_batch_at?: string | null
          list_ids?: string[]
          max_bounce_rate?: number
          max_complaint_rate?: number
          name?: string
          pause_reason?: string | null
          preview_text?: string
          rendered_html?: string | null
          start_at?: string | null
          status?: string
          subject?: string
          template_id?: string | null
          timezone?: string
          updated_at?: string
          window_end?: string | null
          window_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "marketing_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_leads: {
        Row: {
          city: string | null
          company: string | null
          country: string | null
          created_at: string
          custom_fields: Json
          email: string
          first_name: string | null
          id: string
          last_name: string | null
          phone: string | null
          source: string | null
          status: string
          unsubscribe_token: string
          updated_at: string
        }
        Insert: {
          city?: string | null
          company?: string | null
          country?: string | null
          created_at?: string
          custom_fields?: Json
          email: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          source?: string | null
          status?: string
          unsubscribe_token?: string
          updated_at?: string
        }
        Update: {
          city?: string | null
          company?: string | null
          country?: string | null
          created_at?: string
          custom_fields?: Json
          email?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          source?: string | null
          status?: string
          unsubscribe_token?: string
          updated_at?: string
        }
        Relationships: []
      }
      marketing_list_members: {
        Row: {
          added_at: string
          lead_id: string
          list_id: string
        }
        Insert: {
          added_at?: string
          lead_id: string
          list_id: string
        }
        Update: {
          added_at?: string
          lead_id?: string
          list_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_list_members_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "marketing_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_list_members_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "marketing_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_lists: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      marketing_templates: {
        Row: {
          blocks: Json
          created_at: string
          created_by: string | null
          html: string
          id: string
          mode: string
          name: string
          preview_text: string
          subject: string
          updated_at: string
        }
        Insert: {
          blocks?: Json
          created_at?: string
          created_by?: string | null
          html?: string
          id?: string
          mode?: string
          name: string
          preview_text?: string
          subject?: string
          updated_at?: string
        }
        Update: {
          blocks?: Json
          created_at?: string
          created_by?: string | null
          html?: string
          id?: string
          mode?: string
          name?: string
          preview_text?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      metal_buying_leads: {
        Row: {
          buy_percentage: number | null
          client_id: string
          competitor_offer: number | null
          condition: string | null
          country_code: string | null
          country_iso: string | null
          created_at: string
          currency: string
          custom_answers: Json | null
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          device_info: Json | null
          estimated_offer: number | null
          estimated_profit: number | null
          follow_up_status: string | null
          id: string
          is_authentic: boolean | null
          items: Json | null
          karat: string | null
          knows_authentic: boolean
          knows_karat: boolean
          knows_weight: boolean
          lead_score: string
          location: string | null
          metal_type: string
          photo_urls: string[] | null
          spot_price_at_time: number | null
          spot_price_date: string | null
          status: string
          weight_grams: number | null
        }
        Insert: {
          buy_percentage?: number | null
          client_id: string
          competitor_offer?: number | null
          condition?: string | null
          country_code?: string | null
          country_iso?: string | null
          created_at?: string
          currency?: string
          custom_answers?: Json | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          device_info?: Json | null
          estimated_offer?: number | null
          estimated_profit?: number | null
          follow_up_status?: string | null
          id?: string
          is_authentic?: boolean | null
          items?: Json | null
          karat?: string | null
          knows_authentic?: boolean
          knows_karat?: boolean
          knows_weight?: boolean
          lead_score?: string
          location?: string | null
          metal_type: string
          photo_urls?: string[] | null
          spot_price_at_time?: number | null
          spot_price_date?: string | null
          status?: string
          weight_grams?: number | null
        }
        Update: {
          buy_percentage?: number | null
          client_id?: string
          competitor_offer?: number | null
          condition?: string | null
          country_code?: string | null
          country_iso?: string | null
          created_at?: string
          currency?: string
          custom_answers?: Json | null
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          device_info?: Json | null
          estimated_offer?: number | null
          estimated_profit?: number | null
          follow_up_status?: string | null
          id?: string
          is_authentic?: boolean | null
          items?: Json | null
          karat?: string | null
          knows_authentic?: boolean
          knows_karat?: boolean
          knows_weight?: boolean
          lead_score?: string
          location?: string | null
          metal_type?: string
          photo_urls?: string[] | null
          spot_price_at_time?: number | null
          spot_price_date?: string | null
          status?: string
          weight_grams?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "metal_buying_leads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metal_buying_leads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      metal_price_snapshots: {
        Row: {
          client_id: string
          created_at: string
          gold_price: number
          id: string
          platinum_price: number
          silver_price: number
          source: string
        }
        Insert: {
          client_id: string
          created_at?: string
          gold_price: number
          id?: string
          platinum_price: number
          silver_price: number
          source?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          gold_price?: number
          id?: string
          platinum_price?: number
          silver_price?: number
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "metal_price_snapshots_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metal_price_snapshots_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_report_runs: {
        Row: {
          client_id: string
          created_at: string
          error_message: string | null
          id: string
          metrics: Json | null
          period_month: string
          recipient_email: string | null
          resend_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          metrics?: Json | null
          period_month: string
          recipient_email?: string | null
          resend_id?: string | null
          status: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          metrics?: Json | null
          period_month?: string
          recipient_email?: string | null
          resend_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_report_runs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_report_runs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      my_master_db_data: {
        Row: {
          all_upload_complete: boolean | null
          base_price: number | null
          carot_image_0_filename: string | null
          carot_image_1_filename: string | null
          carot_image_2_filename: string | null
          carot_image_3_filename: string | null
          carot_image_4_filename: string | null
          carot_image_5_filename: string | null
          carot_image_6_filename: string | null
          carot_image_7_filename: string | null
          carotimages_folder_path: string | null
          combination_id: string
          created_at: string | null
          drive_link: string | null
          files_uploaded: string | null
          folder_path: string | null
          glb_model_filename: string | null
          glb_model_status: boolean | null
          id: string
          image_0_filename: string | null
          image_0_status: boolean | null
          image_1_filename: string | null
          image_1_status: boolean | null
          image_2_filename: string | null
          image_2_status: boolean | null
          image_3_filename: string | null
          image_3_status: boolean | null
          image_4_filename: string | null
          image_url_0: string | null
          image_url_1: string | null
          image_url_2: string | null
          image_url_3: string | null
          last_updated: string | null
          manufacture_cad_filename: string | null
          manufacture_cad_status: boolean | null
          manufacture_cad_url: string | null
          model_3d_url: string | null
          model_photo_filename: string | null
          model_photo_status: boolean | null
          model_photo_url: string | null
          notes: string | null
          product_name: string | null
          rendered_cad_filename: string | null
          rendered_cad_status: boolean | null
          rendered_cad_url: string | null
          shank_id: string | null
          shank_name: string | null
          shape_id: string | null
          shape_name: string | null
          style: string | null
          style_id: string | null
          style_name: string | null
          total_files: number | null
          transparent_0_filename: string | null
          transparent_0_status: boolean | null
          transparent_1_filename: string | null
          transparent_1_status: boolean | null
          transparent_2_filename: string | null
          transparent_2_status: boolean | null
          transparent_3_filename: string | null
          transparent_3_status: boolean | null
          transparent_url_0: string | null
          transparent_url_1: string | null
          transparent_url_2: string | null
          transparent_url_3: string | null
          unique_id: string
          updated_at: string | null
          video_filename: string | null
          video_status: boolean | null
          video_url: string | null
          visual_color: string | null
          visual_color_name: string | null
        }
        Insert: {
          all_upload_complete?: boolean | null
          base_price?: number | null
          carot_image_0_filename?: string | null
          carot_image_1_filename?: string | null
          carot_image_2_filename?: string | null
          carot_image_3_filename?: string | null
          carot_image_4_filename?: string | null
          carot_image_5_filename?: string | null
          carot_image_6_filename?: string | null
          carot_image_7_filename?: string | null
          carotimages_folder_path?: string | null
          combination_id: string
          created_at?: string | null
          drive_link?: string | null
          files_uploaded?: string | null
          folder_path?: string | null
          glb_model_filename?: string | null
          glb_model_status?: boolean | null
          id?: string
          image_0_filename?: string | null
          image_0_status?: boolean | null
          image_1_filename?: string | null
          image_1_status?: boolean | null
          image_2_filename?: string | null
          image_2_status?: boolean | null
          image_3_filename?: string | null
          image_3_status?: boolean | null
          image_4_filename?: string | null
          image_url_0?: string | null
          image_url_1?: string | null
          image_url_2?: string | null
          image_url_3?: string | null
          last_updated?: string | null
          manufacture_cad_filename?: string | null
          manufacture_cad_status?: boolean | null
          manufacture_cad_url?: string | null
          model_3d_url?: string | null
          model_photo_filename?: string | null
          model_photo_status?: boolean | null
          model_photo_url?: string | null
          notes?: string | null
          product_name?: string | null
          rendered_cad_filename?: string | null
          rendered_cad_status?: boolean | null
          rendered_cad_url?: string | null
          shank_id?: string | null
          shank_name?: string | null
          shape_id?: string | null
          shape_name?: string | null
          style?: string | null
          style_id?: string | null
          style_name?: string | null
          total_files?: number | null
          transparent_0_filename?: string | null
          transparent_0_status?: boolean | null
          transparent_1_filename?: string | null
          transparent_1_status?: boolean | null
          transparent_2_filename?: string | null
          transparent_2_status?: boolean | null
          transparent_3_filename?: string | null
          transparent_3_status?: boolean | null
          transparent_url_0?: string | null
          transparent_url_1?: string | null
          transparent_url_2?: string | null
          transparent_url_3?: string | null
          unique_id: string
          updated_at?: string | null
          video_filename?: string | null
          video_status?: boolean | null
          video_url?: string | null
          visual_color?: string | null
          visual_color_name?: string | null
        }
        Update: {
          all_upload_complete?: boolean | null
          base_price?: number | null
          carot_image_0_filename?: string | null
          carot_image_1_filename?: string | null
          carot_image_2_filename?: string | null
          carot_image_3_filename?: string | null
          carot_image_4_filename?: string | null
          carot_image_5_filename?: string | null
          carot_image_6_filename?: string | null
          carot_image_7_filename?: string | null
          carotimages_folder_path?: string | null
          combination_id?: string
          created_at?: string | null
          drive_link?: string | null
          files_uploaded?: string | null
          folder_path?: string | null
          glb_model_filename?: string | null
          glb_model_status?: boolean | null
          id?: string
          image_0_filename?: string | null
          image_0_status?: boolean | null
          image_1_filename?: string | null
          image_1_status?: boolean | null
          image_2_filename?: string | null
          image_2_status?: boolean | null
          image_3_filename?: string | null
          image_3_status?: boolean | null
          image_4_filename?: string | null
          image_url_0?: string | null
          image_url_1?: string | null
          image_url_2?: string | null
          image_url_3?: string | null
          last_updated?: string | null
          manufacture_cad_filename?: string | null
          manufacture_cad_status?: boolean | null
          manufacture_cad_url?: string | null
          model_3d_url?: string | null
          model_photo_filename?: string | null
          model_photo_status?: boolean | null
          model_photo_url?: string | null
          notes?: string | null
          product_name?: string | null
          rendered_cad_filename?: string | null
          rendered_cad_status?: boolean | null
          rendered_cad_url?: string | null
          shank_id?: string | null
          shank_name?: string | null
          shape_id?: string | null
          shape_name?: string | null
          style?: string | null
          style_id?: string | null
          style_name?: string | null
          total_files?: number | null
          transparent_0_filename?: string | null
          transparent_0_status?: boolean | null
          transparent_1_filename?: string | null
          transparent_1_status?: boolean | null
          transparent_2_filename?: string | null
          transparent_2_status?: boolean | null
          transparent_3_filename?: string | null
          transparent_3_status?: boolean | null
          transparent_url_0?: string | null
          transparent_url_1?: string | null
          transparent_url_2?: string | null
          transparent_url_3?: string | null
          unique_id?: string
          updated_at?: string | null
          video_filename?: string | null
          video_status?: boolean | null
          video_url?: string | null
          visual_color?: string | null
          visual_color_name?: string | null
        }
        Relationships: []
      }
      order_items: {
        Row: {
          configuration: Json
          created_at: string
          id: string
          order_id: string | null
          product_id: string | null
          quantity: number
          subtotal: number
          unit_price: number
          variation_id: string | null
        }
        Insert: {
          configuration?: Json
          created_at?: string
          id?: string
          order_id?: string | null
          product_id?: string | null
          quantity?: number
          subtotal: number
          unit_price: number
          variation_id?: string | null
        }
        Update: {
          configuration?: Json
          created_at?: string
          id?: string
          order_id?: string | null
          product_id?: string | null
          quantity?: number
          subtotal?: number
          unit_price?: number
          variation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variation_id_fkey"
            columns: ["variation_id"]
            isOneToOne: false
            referencedRelation: "product_variations"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          client_id: string
          configuration: Json
          created_at: string | null
          customer_email: string
          customer_name: string | null
          customer_requested_manufacturing: boolean | null
          customer_shipping: Json | null
          delivered_at: string | null
          estimated_delivery_date: string | null
          id: string
          manufacture_files_sent_at: string | null
          manufacturing_cad_files: string[] | null
          manufacturing_notes: string | null
          manufacturing_status: string | null
          order_source: string | null
          product_id: string | null
          shipping_carrier: string | null
          shipping_status: string | null
          shopify_order_id: string | null
          status: string | null
          total_amount: number
          tracking_number: string | null
          variation_id: string | null
        }
        Insert: {
          client_id: string
          configuration: Json
          created_at?: string | null
          customer_email: string
          customer_name?: string | null
          customer_requested_manufacturing?: boolean | null
          customer_shipping?: Json | null
          delivered_at?: string | null
          estimated_delivery_date?: string | null
          id?: string
          manufacture_files_sent_at?: string | null
          manufacturing_cad_files?: string[] | null
          manufacturing_notes?: string | null
          manufacturing_status?: string | null
          order_source?: string | null
          product_id?: string | null
          shipping_carrier?: string | null
          shipping_status?: string | null
          shopify_order_id?: string | null
          status?: string | null
          total_amount: number
          tracking_number?: string | null
          variation_id?: string | null
        }
        Update: {
          client_id?: string
          configuration?: Json
          created_at?: string | null
          customer_email?: string
          customer_name?: string | null
          customer_requested_manufacturing?: boolean | null
          customer_shipping?: Json | null
          delivered_at?: string | null
          estimated_delivery_date?: string | null
          id?: string
          manufacture_files_sent_at?: string | null
          manufacturing_cad_files?: string[] | null
          manufacturing_notes?: string | null
          manufacturing_status?: string | null
          order_source?: string | null
          product_id?: string | null
          shipping_carrier?: string | null
          shipping_status?: string | null
          shopify_order_id?: string | null
          status?: string | null
          total_amount?: number
          tracking_number?: string | null
          variation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_variation_id_fkey"
            columns: ["variation_id"]
            isOneToOne: false
            referencedRelation: "product_variations"
            referencedColumns: ["id"]
          },
        ]
      }
      password_reset_tokens: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          token: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          expires_at: string
          id?: string
          token: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          token?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      pending_render_emails: {
        Row: {
          client_id: string
          created_at: string
          customer_email: string
          customer_name: string | null
          details: Json | null
          form_type: string
          id: string
          lead_id: string
          send_after: string
          status: string
        }
        Insert: {
          client_id: string
          created_at?: string
          customer_email: string
          customer_name?: string | null
          details?: Json | null
          form_type: string
          id?: string
          lead_id: string
          send_after?: string
          status?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          customer_email?: string
          customer_name?: string | null
          details?: Json | null
          form_type?: string
          id?: string
          lead_id?: string
          send_after?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_render_emails_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_render_emails_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      personalization_options: {
        Row: {
          created_at: string
          display_order: number
          id: string
          image_url: string | null
          name: string
          option_value: string
          price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string | null
          name: string
          option_value: string
          price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string | null
          name?: string
          option_value?: string
          price?: number
          updated_at?: string
        }
        Relationships: []
      }
      plan_ai_defaults: {
        Row: {
          chat_quota: number
          chat_rpm: number
          cost_estimate_rpm: number
          created_at: string
          id: string
          image_quota: number
          image_rpm: number
          plan_id: string
          updated_at: string
        }
        Insert: {
          chat_quota?: number
          chat_rpm?: number
          cost_estimate_rpm?: number
          created_at?: string
          id?: string
          image_quota?: number
          image_rpm?: number
          plan_id: string
          updated_at?: string
        }
        Update: {
          chat_quota?: number
          chat_rpm?: number
          cost_estimate_rpm?: number
          created_at?: string
          id?: string
          image_quota?: number
          image_rpm?: number
          plan_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_ai_defaults_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: true
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_ai_config: {
        Row: {
          allow_quota_overage_from_credits: boolean
          chat_base_cost: number
          chat_multiplier: number
          global_chat_rpm: number
          global_cost_estimate_rpm: number
          global_image_rpm: number
          id: string
          image_base_cost: number
          image_multiplier: number
          monthly_free_credits_dollars: number
          updated_at: string
        }
        Insert: {
          allow_quota_overage_from_credits?: boolean
          chat_base_cost?: number
          chat_multiplier?: number
          global_chat_rpm?: number
          global_cost_estimate_rpm?: number
          global_image_rpm?: number
          id?: string
          image_base_cost?: number
          image_multiplier?: number
          monthly_free_credits_dollars?: number
          updated_at?: string
        }
        Update: {
          allow_quota_overage_from_credits?: boolean
          chat_base_cost?: number
          chat_multiplier?: number
          global_chat_rpm?: number
          global_cost_estimate_rpm?: number
          global_image_rpm?: number
          id?: string
          image_base_cost?: number
          image_multiplier?: number
          monthly_free_credits_dollars?: number
          updated_at?: string
        }
        Relationships: []
      }
      platform_health_alerts: {
        Row: {
          alert_key: string
          alert_type: string
          component: string | null
          created_at: string
          details: Json
          email_error: string | null
          email_status: string
          id: string
          message: string | null
          recipients: string[]
          resend_id: string | null
          severity: string
          title: string
        }
        Insert: {
          alert_key: string
          alert_type: string
          component?: string | null
          created_at?: string
          details?: Json
          email_error?: string | null
          email_status?: string
          id?: string
          message?: string | null
          recipients?: string[]
          resend_id?: string | null
          severity?: string
          title: string
        }
        Update: {
          alert_key?: string
          alert_type?: string
          component?: string | null
          created_at?: string
          details?: Json
          email_error?: string | null
          email_status?: string
          id?: string
          message?: string | null
          recipients?: string[]
          resend_id?: string | null
          severity?: string
          title?: string
        }
        Relationships: []
      }
      platform_health_checks: {
        Row: {
          category: string
          checked_at: string
          component: string
          details: Json
          id: string
          latency_ms: number | null
          message: string | null
          run_id: string
          source: string
          status: string
        }
        Insert: {
          category: string
          checked_at?: string
          component: string
          details?: Json
          id?: string
          latency_ms?: number | null
          message?: string | null
          run_id: string
          source?: string
          status: string
        }
        Update: {
          category?: string
          checked_at?: string
          component?: string
          details?: Json
          id?: string
          latency_ms?: number | null
          message?: string | null
          run_id?: string
          source?: string
          status?: string
        }
        Relationships: []
      }
      platform_health_daily: {
        Row: {
          avg_latency_ms: number | null
          category: string
          checks_degraded: number
          checks_down: number
          checks_ok: number
          checks_total: number
          component: string
          day: string
          healthy_pct: number | null
          max_latency_ms: number | null
          p95_latency_ms: number | null
          updated_at: string
          uptime_pct: number | null
        }
        Insert: {
          avg_latency_ms?: number | null
          category: string
          checks_degraded?: number
          checks_down?: number
          checks_ok?: number
          checks_total?: number
          component: string
          day: string
          healthy_pct?: number | null
          max_latency_ms?: number | null
          p95_latency_ms?: number | null
          updated_at?: string
          uptime_pct?: number | null
        }
        Update: {
          avg_latency_ms?: number | null
          category?: string
          checks_degraded?: number
          checks_down?: number
          checks_ok?: number
          checks_total?: number
          component?: string
          day?: string
          healthy_pct?: number | null
          max_latency_ms?: number | null
          p95_latency_ms?: number | null
          updated_at?: string
          uptime_pct?: number | null
        }
        Relationships: []
      }
      platform_health_incidents: {
        Row: {
          category: string
          checks_failed: number
          component: string
          created_at: string
          first_message: string | null
          id: string
          last_message: string | null
          notified_at: string | null
          resolved_at: string | null
          resolved_notified_at: string | null
          started_at: string
          status: string
          updated_at: string
        }
        Insert: {
          category: string
          checks_failed?: number
          component: string
          created_at?: string
          first_message?: string | null
          id?: string
          last_message?: string | null
          notified_at?: string | null
          resolved_at?: string | null
          resolved_notified_at?: string | null
          started_at?: string
          status: string
          updated_at?: string
        }
        Update: {
          category?: string
          checks_failed?: number
          component?: string
          created_at?: string
          first_message?: string | null
          id?: string
          last_message?: string | null
          notified_at?: string | null
          resolved_at?: string | null
          resolved_notified_at?: string | null
          started_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      platform_health_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      platform_quota_snapshots: {
        Row: {
          captured_at: string
          details: Json
          id: string
          label: string
          level: string
          metric: string
          pct: number | null
          quota_limit: number | null
          service: string
          unit: string
          used: number
        }
        Insert: {
          captured_at?: string
          details?: Json
          id?: string
          label: string
          level?: string
          metric: string
          pct?: number | null
          quota_limit?: number | null
          service: string
          unit?: string
          used?: number
        }
        Update: {
          captured_at?: string
          details?: Json
          id?: string
          label?: string
          level?: string
          metric?: string
          pct?: number | null
          quota_limit?: number | null
          service?: string
          unit?: string
          used?: number
        }
        Relationships: []
      }
      product_variations: {
        Row: {
          additional_cost: number | null
          carat: number | null
          created_at: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          metal: string | null
          product_id: string
          shank: string | null
          shape: string | null
          stone_type: string | null
          style: string | null
        }
        Insert: {
          additional_cost?: number | null
          carat?: number | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          metal?: string | null
          product_id: string
          shank?: string | null
          shape?: string | null
          stone_type?: string | null
          style?: string | null
        }
        Update: {
          additional_cost?: number | null
          carat?: number | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          metal?: string | null
          product_id?: string
          shank?: string | null
          shape?: string | null
          stone_type?: string | null
          style?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_variations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          agency_id: string
          base_cost: number
          cad_file_url: string | null
          category: string
          created_at: string | null
          created_by_admin_id: string | null
          description: string | null
          id: string
          image_urls: string[] | null
          manufacturing_cost: number | null
          model_3d_url: string | null
          name: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          agency_id: string
          base_cost: number
          cad_file_url?: string | null
          category: string
          created_at?: string | null
          created_by_admin_id?: string | null
          description?: string | null
          id?: string
          image_urls?: string[] | null
          manufacturing_cost?: number | null
          model_3d_url?: string | null
          name: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          agency_id?: string
          base_cost?: number
          cad_file_url?: string | null
          category?: string
          created_at?: string | null
          created_by_admin_id?: string | null
          description?: string | null
          id?: string
          image_urls?: string[] | null
          manufacturing_cost?: number | null
          model_3d_url?: string | null
          name?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          created_at: string | null
          endpoint: string
          id: string
          identifier: string
          request_count: number
          window_start: string
        }
        Insert: {
          created_at?: string | null
          endpoint: string
          id?: string
          identifier: string
          request_count?: number
          window_start?: string
        }
        Update: {
          created_at?: string | null
          endpoint?: string
          id?: string
          identifier?: string
          request_count?: number
          window_start?: string
        }
        Relationships: []
      }
      reconciliation_logs: {
        Row: {
          created_at: string
          details: Json
          duration_ms: number | null
          errors: number
          id: string
          mismatches_fixed: number
          subscriptions_checked: number
        }
        Insert: {
          created_at?: string
          details?: Json
          duration_ms?: number | null
          errors?: number
          id?: string
          mismatches_fixed?: number
          subscriptions_checked?: number
        }
        Update: {
          created_at?: string
          details?: Json
          duration_ms?: number | null
          errors?: number
          id?: string
          mismatches_fixed?: number
          subscriptions_checked?: number
        }
        Relationships: []
      }
      retention_policies: {
        Row: {
          auto_cleanup: boolean | null
          client_id: string | null
          created_at: string | null
          id: string
          last_cleanup_at: string | null
          retention_days: number
          table_name: string
          updated_at: string | null
        }
        Insert: {
          auto_cleanup?: boolean | null
          client_id?: string | null
          created_at?: string | null
          id?: string
          last_cleanup_at?: string | null
          retention_days?: number
          table_name: string
          updated_at?: string | null
        }
        Update: {
          auto_cleanup?: boolean | null
          client_id?: string | null
          created_at?: string | null
          id?: string
          last_cleanup_at?: string | null
          retention_days?: number
          table_name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "retention_policies_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retention_policies_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      ring_configured_by_client: {
        Row: {
          carat_price: number | null
          carat_value: string | null
          client_id: string | null
          combination_id: string | null
          created_at: string
          engraving_enabled: boolean | null
          engraving_text: string | null
          id: string
          is_custom_pricing: boolean | null
          metal_id: string | null
          metal_name: string | null
          metal_price: number | null
          product_name: string | null
          session_id: string | null
          shank_id: string | null
          shank_name: string | null
          shank_price: number | null
          shape_id: string | null
          shape_name: string | null
          shape_price: number | null
          size: string | null
          size_price: number | null
          status: string | null
          style_id: string | null
          style_name: string | null
          style_price: number | null
          total_amount: number | null
          updated_at: string
          visual_color_id: string | null
          visual_color_name: string | null
          visual_color_price: number | null
        }
        Insert: {
          carat_price?: number | null
          carat_value?: string | null
          client_id?: string | null
          combination_id?: string | null
          created_at?: string
          engraving_enabled?: boolean | null
          engraving_text?: string | null
          id?: string
          is_custom_pricing?: boolean | null
          metal_id?: string | null
          metal_name?: string | null
          metal_price?: number | null
          product_name?: string | null
          session_id?: string | null
          shank_id?: string | null
          shank_name?: string | null
          shank_price?: number | null
          shape_id?: string | null
          shape_name?: string | null
          shape_price?: number | null
          size?: string | null
          size_price?: number | null
          status?: string | null
          style_id?: string | null
          style_name?: string | null
          style_price?: number | null
          total_amount?: number | null
          updated_at?: string
          visual_color_id?: string | null
          visual_color_name?: string | null
          visual_color_price?: number | null
        }
        Update: {
          carat_price?: number | null
          carat_value?: string | null
          client_id?: string | null
          combination_id?: string | null
          created_at?: string
          engraving_enabled?: boolean | null
          engraving_text?: string | null
          id?: string
          is_custom_pricing?: boolean | null
          metal_id?: string | null
          metal_name?: string | null
          metal_price?: number | null
          product_name?: string | null
          session_id?: string | null
          shank_id?: string | null
          shank_name?: string | null
          shank_price?: number | null
          shape_id?: string | null
          shape_name?: string | null
          shape_price?: number | null
          size?: string | null
          size_price?: number | null
          status?: string | null
          style_id?: string | null
          style_name?: string | null
          style_price?: number | null
          total_amount?: number | null
          updated_at?: string
          visual_color_id?: string | null
          visual_color_name?: string | null
          visual_color_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ring_configured_by_client_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ring_configured_by_client_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      ring_metal_options: {
        Row: {
          created_at: string
          display_order: number
          id: string
          image_url: string | null
          name: string
          option_value: string
          price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string | null
          name: string
          option_value: string
          price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string | null
          name?: string
          option_value?: string
          price?: number
          updated_at?: string
        }
        Relationships: []
      }
      ring_preview_images: {
        Row: {
          created_at: string
          custom_instruction: string | null
          feedback: string | null
          generation_number: number
          id: string
          image_url: string
          lead_id: string
        }
        Insert: {
          created_at?: string
          custom_instruction?: string | null
          feedback?: string | null
          generation_number?: number
          id?: string
          image_url: string
          lead_id: string
        }
        Update: {
          created_at?: string
          custom_instruction?: string | null
          feedback?: string | null
          generation_number?: number
          id?: string
          image_url?: string
          lead_id?: string
        }
        Relationships: []
      }
      ring_setting_options: {
        Row: {
          created_at: string
          display_order: number
          id: string
          image_url: string | null
          name: string
          option_value: string
          price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string | null
          name: string
          option_value: string
          price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string | null
          name?: string
          option_value?: string
          price?: number
          updated_at?: string
        }
        Relationships: []
      }
      sandbox_quote_v1_config: {
        Row: {
          block_disposable_email: boolean
          client_id: string
          created_at: string
          dedupe_window_minutes: number
          deposit_amount: number | null
          enable_lead_quality_scoring: boolean
          enabled_steps: Json | null
          form_colors: Json | null
          form_content: Json | null
          id: string
          live_version: string
          onboarding_completed: boolean
          step_order: Json | null
          submission_mode: string
          updated_at: string
          welcome_subtitle: string | null
          welcome_title: string | null
        }
        Insert: {
          block_disposable_email?: boolean
          client_id: string
          created_at?: string
          dedupe_window_minutes?: number
          deposit_amount?: number | null
          enable_lead_quality_scoring?: boolean
          enabled_steps?: Json | null
          form_colors?: Json | null
          form_content?: Json | null
          id?: string
          live_version?: string
          onboarding_completed?: boolean
          step_order?: Json | null
          submission_mode?: string
          updated_at?: string
          welcome_subtitle?: string | null
          welcome_title?: string | null
        }
        Update: {
          block_disposable_email?: boolean
          client_id?: string
          created_at?: string
          dedupe_window_minutes?: number
          deposit_amount?: number | null
          enable_lead_quality_scoring?: boolean
          enabled_steps?: Json | null
          form_colors?: Json | null
          form_content?: Json | null
          id?: string
          live_version?: string
          onboarding_completed?: boolean
          step_order?: Json | null
          submission_mode?: string
          updated_at?: string
          welcome_subtitle?: string | null
          welcome_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sandbox_quote_v1_config_client_fk"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sandbox_quote_v1_config_client_fk"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      sandbox_quote_v1_overrides: {
        Row: {
          client_id: string
          created_at: string
          custom_image_url: string | null
          custom_name: string | null
          custom_price: number | null
          display_order: number | null
          id: string
          is_enabled: boolean | null
          option_id: string
          step_type: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          custom_image_url?: string | null
          custom_name?: string | null
          custom_price?: number | null
          display_order?: number | null
          id?: string
          is_enabled?: boolean | null
          option_id: string
          step_type: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          custom_image_url?: string | null
          custom_name?: string | null
          custom_price?: number | null
          display_order?: number | null
          id?: string
          is_enabled?: boolean | null
          option_id?: string
          step_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sandbox_quote_v1_override_client_fk"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sandbox_quote_v1_override_client_fk"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      sandbox_quote_v3_config: {
        Row: {
          block_disposable_email: boolean
          client_id: string
          created_at: string
          dedupe_window_minutes: number
          deposit_amount: number | null
          enable_lead_quality_scoring: boolean
          enabled_steps: Json | null
          form_colors: Json | null
          form_content: Json | null
          id: string
          live_version: string
          onboarding_completed: boolean
          step_order: Json | null
          submission_mode: string
          updated_at: string
          welcome_subtitle: string | null
          welcome_title: string | null
        }
        Insert: {
          block_disposable_email?: boolean
          client_id: string
          created_at?: string
          dedupe_window_minutes?: number
          deposit_amount?: number | null
          enable_lead_quality_scoring?: boolean
          enabled_steps?: Json | null
          form_colors?: Json | null
          form_content?: Json | null
          id?: string
          live_version?: string
          onboarding_completed?: boolean
          step_order?: Json | null
          submission_mode?: string
          updated_at?: string
          welcome_subtitle?: string | null
          welcome_title?: string | null
        }
        Update: {
          block_disposable_email?: boolean
          client_id?: string
          created_at?: string
          dedupe_window_minutes?: number
          deposit_amount?: number | null
          enable_lead_quality_scoring?: boolean
          enabled_steps?: Json | null
          form_colors?: Json | null
          form_content?: Json | null
          id?: string
          live_version?: string
          onboarding_completed?: boolean
          step_order?: Json | null
          submission_mode?: string
          updated_at?: string
          welcome_subtitle?: string | null
          welcome_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sandbox_quote_v3_config_client_fk"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sandbox_quote_v3_config_client_fk"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      sandbox_quote_v3_overrides: {
        Row: {
          client_id: string
          created_at: string
          custom_image_url: string | null
          custom_name: string | null
          custom_price: number | null
          display_order: number | null
          id: string
          is_enabled: boolean | null
          option_id: string
          step_type: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          custom_image_url?: string | null
          custom_name?: string | null
          custom_price?: number | null
          display_order?: number | null
          id?: string
          is_enabled?: boolean | null
          option_id: string
          step_type: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          custom_image_url?: string | null
          custom_name?: string | null
          custom_price?: number | null
          display_order?: number | null
          id?: string
          is_enabled?: boolean | null
          option_id?: string
          step_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sandbox_quote_v3_override_client_fk"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sandbox_quote_v3_override_client_fk"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_designs: {
        Row: {
          client_id: string
          configuration: Json
          created_at: string | null
          customer_email: string
          customer_name: string
          customer_phone: string | null
          device_info: Json | null
          edit_history: Json[] | null
          follow_up_status: string | null
          id: string
          notes: string | null
          product_id: string | null
          product_name: string | null
          updated_at: string | null
        }
        Insert: {
          client_id: string
          configuration: Json
          created_at?: string | null
          customer_email: string
          customer_name: string
          customer_phone?: string | null
          device_info?: Json | null
          edit_history?: Json[] | null
          follow_up_status?: string | null
          id?: string
          notes?: string | null
          product_id?: string | null
          product_name?: string | null
          updated_at?: string | null
        }
        Update: {
          client_id?: string
          configuration?: Json
          created_at?: string | null
          customer_email?: string
          customer_name?: string
          customer_phone?: string | null
          device_info?: Json | null
          edit_history?: Json[] | null
          follow_up_status?: string | null
          id?: string
          notes?: string | null
          product_id?: string | null
          product_name?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saved_designs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_designs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_designs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      shopify_oauth_states: {
        Row: {
          client_id: string
          created_at: string
          expires_at: string
          impersonating: boolean
          return_url: string | null
          shop: string
          state: string
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          expires_at?: string
          impersonating?: boolean
          return_url?: string | null
          shop: string
          state: string
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          expires_at?: string
          impersonating?: boolean
          return_url?: string | null
          shop?: string
          state?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopify_oauth_states_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopify_oauth_states_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_members: {
        Row: {
          client_id: string
          created_at: string
          email: string
          id: string
          name: string
          permissions: Json
          phone: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          email: string
          id?: string
          name: string
          permissions?: Json
          phone?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          email?: string
          id?: string
          name?: string
          permissions?: Json
          phone?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_members_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_members_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_webhook_events: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string | null
          id: string
          payload: Json
          processed_at: string
          processing_error: string | null
          status: string | null
          stripe_event_id: string | null
          type: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type?: string | null
          id: string
          payload: Json
          processed_at?: string
          processing_error?: string | null
          status?: string | null
          stripe_event_id?: string | null
          type: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string | null
          id?: string
          payload?: Json
          processed_at?: string
          processing_error?: string | null
          status?: string | null
          stripe_event_id?: string | null
          type?: string
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          auto_created: boolean
          commission_rate: number | null
          created_at: string | null
          cta_text: string | null
          display_order: number
          feature_set: Json | null
          features: Json | null
          id: string
          include_license: boolean
          is_highlighted: boolean
          is_visible: boolean | null
          legacy_stripe_price_ids: string[] | null
          max_orders_per_month: number | null
          max_products: number | null
          name: string
          payment_link_url: string | null
          price_monthly: number
          price_note: string | null
          source: string | null
          stripe_license_price_id: string | null
          stripe_payment_link_id: string | null
          stripe_payment_link_url: string | null
          stripe_price_id: string | null
          stripe_product_ids: string[]
          tagline: string | null
        }
        Insert: {
          auto_created?: boolean
          commission_rate?: number | null
          created_at?: string | null
          cta_text?: string | null
          display_order?: number
          feature_set?: Json | null
          features?: Json | null
          id?: string
          include_license?: boolean
          is_highlighted?: boolean
          is_visible?: boolean | null
          legacy_stripe_price_ids?: string[] | null
          max_orders_per_month?: number | null
          max_products?: number | null
          name: string
          payment_link_url?: string | null
          price_monthly: number
          price_note?: string | null
          source?: string | null
          stripe_license_price_id?: string | null
          stripe_payment_link_id?: string | null
          stripe_payment_link_url?: string | null
          stripe_price_id?: string | null
          stripe_product_ids?: string[]
          tagline?: string | null
        }
        Update: {
          auto_created?: boolean
          commission_rate?: number | null
          created_at?: string | null
          cta_text?: string | null
          display_order?: number
          feature_set?: Json | null
          features?: Json | null
          id?: string
          include_license?: boolean
          is_highlighted?: boolean
          is_visible?: boolean | null
          legacy_stripe_price_ids?: string[] | null
          max_orders_per_month?: number | null
          max_products?: number | null
          name?: string
          payment_link_url?: string | null
          price_monthly?: number
          price_note?: string | null
          source?: string | null
          stripe_license_price_id?: string | null
          stripe_payment_link_id?: string | null
          stripe_payment_link_url?: string | null
          stripe_price_id?: string | null
          stripe_product_ids?: string[]
          tagline?: string | null
        }
        Relationships: []
      }
      support_ticket_messages: {
        Row: {
          author_email: string | null
          author_name: string | null
          author_role: string
          author_user_id: string
          body: string
          created_at: string
          id: string
          ticket_id: string
        }
        Insert: {
          author_email?: string | null
          author_name?: string | null
          author_role: string
          author_user_id: string
          body: string
          created_at?: string
          id?: string
          ticket_id: string
        }
        Update: {
          author_email?: string | null
          author_name?: string | null
          author_role?: string
          author_user_id?: string
          body?: string
          created_at?: string
          id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          category: string
          client_id: string
          created_at: string
          created_by_email: string
          created_by_name: string | null
          created_by_user_id: string
          id: string
          initial_message: string
          last_admin_reply_at: string | null
          last_client_reply_at: string | null
          priority: string
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          category?: string
          client_id: string
          created_at?: string
          created_by_email: string
          created_by_name?: string | null
          created_by_user_id: string
          id?: string
          initial_message: string
          last_admin_reply_at?: string | null
          last_client_reply_at?: string | null
          priority?: string
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          category?: string
          client_id?: string
          created_at?: string
          created_by_email?: string
          created_by_name?: string | null
          created_by_user_id?: string
          id?: string
          initial_message?: string
          last_admin_reply_at?: string | null
          last_client_reply_at?: string | null
          priority?: string
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      system_error_alerts: {
        Row: {
          alert_name: string
          condition_type: string
          created_at: string
          function_filter: string | null
          id: string
          is_active: boolean
          last_triggered_at: string | null
          notification_channels: string[] | null
          severity_filter: string[] | null
          threshold_value: number
          time_window_minutes: number
          updated_at: string
        }
        Insert: {
          alert_name: string
          condition_type: string
          created_at?: string
          function_filter?: string | null
          id?: string
          is_active?: boolean
          last_triggered_at?: string | null
          notification_channels?: string[] | null
          severity_filter?: string[] | null
          threshold_value?: number
          time_window_minutes?: number
          updated_at?: string
        }
        Update: {
          alert_name?: string
          condition_type?: string
          created_at?: string
          function_filter?: string | null
          id?: string
          is_active?: boolean
          last_triggered_at?: string | null
          notification_channels?: string[] | null
          severity_filter?: string[] | null
          threshold_value?: number
          time_window_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      system_errors: {
        Row: {
          client_id: string | null
          created_at: string
          endpoint: string | null
          error_message: string
          error_source: string
          error_stack: string | null
          error_type: string
          function_name: string
          id: string
          request_metadata: Json | null
          resolution_notes: string | null
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          timestamp: string
          user_id: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          endpoint?: string | null
          error_message: string
          error_source: string
          error_stack?: string | null
          error_type: string
          function_name: string
          id?: string
          request_metadata?: Json | null
          resolution_notes?: string | null
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          timestamp?: string
          user_id?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string
          endpoint?: string | null
          error_message?: string
          error_source?: string
          error_stack?: string | null
          error_type?: string
          function_name?: string
          id?: string
          request_metadata?: Json | null
          resolution_notes?: string | null
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          timestamp?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_errors_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_errors_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_snapshots: {
        Row: {
          ai_tokens_used: number | null
          analytics_events_count: number | null
          bandwidth_mb: number | null
          client_id: string | null
          created_at: string | null
          database_rows: number | null
          database_size_mb: number | null
          function_invocations: number | null
          id: string
          snapshot_date: string
          storage_files_count: number | null
          storage_size_mb: number | null
        }
        Insert: {
          ai_tokens_used?: number | null
          analytics_events_count?: number | null
          bandwidth_mb?: number | null
          client_id?: string | null
          created_at?: string | null
          database_rows?: number | null
          database_size_mb?: number | null
          function_invocations?: number | null
          id?: string
          snapshot_date: string
          storage_files_count?: number | null
          storage_size_mb?: number | null
        }
        Update: {
          ai_tokens_used?: number | null
          analytics_events_count?: number | null
          bandwidth_mb?: number | null
          client_id?: string | null
          created_at?: string | null
          database_rows?: number | null
          database_size_mb?: number | null
          function_invocations?: number | null
          id?: string
          snapshot_date?: string
          storage_files_count?: number | null
          storage_size_mb?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "usage_snapshots_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_snapshots_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wallet_transactions: {
        Row: {
          amount: number
          balance_after: number
          client_id: string
          created_at: string
          description: string
          id: string
          metadata: Json | null
          reference_id: string | null
          type: string
        }
        Insert: {
          amount: number
          balance_after: number
          client_id: string
          created_at?: string
          description?: string
          id?: string
          metadata?: Json | null
          reference_id?: string | null
          type: string
        }
        Update: {
          amount?: number
          balance_after?: number
          client_id?: string
          created_at?: string
          description?: string
          id?: string
          metadata?: Json | null
          reference_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      wishlist_items: {
        Row: {
          configuration: Json | null
          created_at: string
          id: string
          notes: string | null
          product_id: string | null
          user_id: string | null
        }
        Insert: {
          configuration?: Json | null
          created_at?: string
          id?: string
          notes?: string | null
          product_id?: string | null
          user_id?: string | null
        }
        Update: {
          configuration?: Json | null
          created_at?: string
          id?: string
          notes?: string | null
          product_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wishlist_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      client_branding: {
        Row: {
          allowed_domains: string[] | null
          branding_config: Json | null
          company_name: string | null
          id: string | null
          logo_url: string | null
        }
        Insert: {
          allowed_domains?: string[] | null
          branding_config?: Json | null
          company_name?: string | null
          id?: string | null
          logo_url?: string | null
        }
        Update: {
          allowed_domains?: string[] | null
          branding_config?: Json | null
          company_name?: string | null
          id?: string | null
          logo_url?: string | null
        }
        Relationships: []
      }
      crm_integrations_safe: {
        Row: {
          client_id: string | null
          created_at: string | null
          id: string | null
          is_active: boolean | null
          last_synced_at: string | null
          provider: string | null
          updated_at: string | null
          webhook_url: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          last_synced_at?: string | null
          provider?: string | null
          updated_at?: string | null
          webhook_url?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          last_synced_at?: string | null
          provider?: string | null
          updated_at?: string | null
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_integrations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_branding"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_integrations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      diamond_pool_grade_stats: {
        Row: {
          carat_bucket: number | null
          clarity: string | null
          color: string | null
          currency: string | null
          group_size: number | null
          median_ppc: number | null
          refreshed_at: string | null
          shape_id: string | null
          stone_type: string | null
        }
        Relationships: []
      }
      diamond_pool_group_reps: {
        Row: {
          carat_bucket: number | null
          carat_value: number | null
          clarity: string | null
          color: string | null
          currency: string | null
          id: string | null
          raw_price: number | null
          report_no: string | null
          shape_id: string | null
          stone_type: string | null
        }
        Relationships: []
      }
      diamond_pool_group_reps_engine: {
        Row: {
          carat_bucket: number | null
          carat_value: number | null
          clarity: string | null
          color: string | null
          currency: string | null
          id: string | null
          raw_price: number | null
          report_no: string | null
          shape_id: string | null
          stone_type: string | null
        }
        Relationships: []
      }
      form_leads_unified: {
        Row: {
          client_id: string | null
          created_at: string | null
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          form_payload: Json | null
          form_type: string | null
          id: string | null
        }
        Relationships: []
      }
      master_products_with_urls: {
        Row: {
          all_upload_complete: boolean | null
          base_price: number | null
          carot_image_0_filename: string | null
          carot_image_1_filename: string | null
          carot_image_2_filename: string | null
          carot_image_3_filename: string | null
          carot_image_4_filename: string | null
          carot_image_5_filename: string | null
          carot_image_6_filename: string | null
          carot_image_7_filename: string | null
          carotimages_folder_path: string | null
          cdn_carat_image_url_0: string | null
          cdn_carat_image_url_1: string | null
          cdn_carat_image_url_2: string | null
          cdn_carat_image_url_3: string | null
          cdn_carat_image_url_4: string | null
          cdn_carat_image_url_5: string | null
          cdn_carat_image_url_6: string | null
          cdn_carat_image_url_7: string | null
          cdn_image_url_0: string | null
          cdn_image_url_1: string | null
          cdn_image_url_2: string | null
          cdn_image_url_3: string | null
          cdn_model_photo_url: string | null
          cdn_model_url: string | null
          cdn_transparent_url_0: string | null
          cdn_transparent_url_1: string | null
          cdn_transparent_url_2: string | null
          cdn_transparent_url_3: string | null
          cdn_video_url: string | null
          combination_id: string | null
          created_at: string | null
          drive_link: string | null
          files_uploaded: string | null
          folder_path: string | null
          glb_model_filename: string | null
          glb_model_status: boolean | null
          id: string | null
          image_0_filename: string | null
          image_0_status: boolean | null
          image_1_filename: string | null
          image_1_status: boolean | null
          image_2_filename: string | null
          image_2_status: boolean | null
          image_3_filename: string | null
          image_3_status: boolean | null
          image_url_0: string | null
          image_url_1: string | null
          image_url_2: string | null
          image_url_3: string | null
          last_updated: string | null
          manufacture_cad_filename: string | null
          manufacture_cad_status: boolean | null
          manufacture_cad_url: string | null
          model_3d_url: string | null
          model_photo_filename: string | null
          model_photo_status: boolean | null
          model_photo_url: string | null
          notes: string | null
          product_name: string | null
          rendered_cad_filename: string | null
          rendered_cad_status: boolean | null
          rendered_cad_url: string | null
          shank_id: string | null
          shank_name: string | null
          shape_id: string | null
          shape_name: string | null
          style: string | null
          style_id: string | null
          style_name: string | null
          total_files: number | null
          transparent_0_filename: string | null
          transparent_0_status: boolean | null
          transparent_1_filename: string | null
          transparent_1_status: boolean | null
          transparent_2_filename: string | null
          transparent_2_status: boolean | null
          transparent_3_filename: string | null
          transparent_3_status: boolean | null
          transparent_url_0: string | null
          transparent_url_1: string | null
          transparent_url_2: string | null
          transparent_url_3: string | null
          unique_id: string | null
          updated_at: string | null
          video_filename: string | null
          video_status: boolean | null
          video_url: string | null
          visual_color: string | null
          visual_color_name: string | null
        }
        Insert: {
          all_upload_complete?: boolean | null
          base_price?: number | null
          carot_image_0_filename?: string | null
          carot_image_1_filename?: string | null
          carot_image_2_filename?: string | null
          carot_image_3_filename?: string | null
          carot_image_4_filename?: string | null
          carot_image_5_filename?: string | null
          carot_image_6_filename?: string | null
          carot_image_7_filename?: string | null
          carotimages_folder_path?: string | null
          cdn_carat_image_url_0?: never
          cdn_carat_image_url_1?: never
          cdn_carat_image_url_2?: never
          cdn_carat_image_url_3?: never
          cdn_carat_image_url_4?: never
          cdn_carat_image_url_5?: never
          cdn_carat_image_url_6?: never
          cdn_carat_image_url_7?: never
          cdn_image_url_0?: never
          cdn_image_url_1?: never
          cdn_image_url_2?: never
          cdn_image_url_3?: never
          cdn_model_photo_url?: never
          cdn_model_url?: never
          cdn_transparent_url_0?: never
          cdn_transparent_url_1?: never
          cdn_transparent_url_2?: never
          cdn_transparent_url_3?: never
          cdn_video_url?: never
          combination_id?: string | null
          created_at?: string | null
          drive_link?: string | null
          files_uploaded?: string | null
          folder_path?: string | null
          glb_model_filename?: string | null
          glb_model_status?: boolean | null
          id?: string | null
          image_0_filename?: string | null
          image_0_status?: boolean | null
          image_1_filename?: string | null
          image_1_status?: boolean | null
          image_2_filename?: string | null
          image_2_status?: boolean | null
          image_3_filename?: string | null
          image_3_status?: boolean | null
          image_url_0?: string | null
          image_url_1?: string | null
          image_url_2?: string | null
          image_url_3?: string | null
          last_updated?: string | null
          manufacture_cad_filename?: string | null
          manufacture_cad_status?: boolean | null
          manufacture_cad_url?: string | null
          model_3d_url?: string | null
          model_photo_filename?: string | null
          model_photo_status?: boolean | null
          model_photo_url?: string | null
          notes?: string | null
          product_name?: string | null
          rendered_cad_filename?: string | null
          rendered_cad_status?: boolean | null
          rendered_cad_url?: string | null
          shank_id?: string | null
          shank_name?: string | null
          shape_id?: string | null
          shape_name?: string | null
          style?: string | null
          style_id?: string | null
          style_name?: string | null
          total_files?: number | null
          transparent_0_filename?: string | null
          transparent_0_status?: boolean | null
          transparent_1_filename?: string | null
          transparent_1_status?: boolean | null
          transparent_2_filename?: string | null
          transparent_2_status?: boolean | null
          transparent_3_filename?: string | null
          transparent_3_status?: boolean | null
          transparent_url_0?: string | null
          transparent_url_1?: string | null
          transparent_url_2?: string | null
          transparent_url_3?: string | null
          unique_id?: string | null
          updated_at?: string | null
          video_filename?: string | null
          video_status?: boolean | null
          video_url?: string | null
          visual_color?: string | null
          visual_color_name?: string | null
        }
        Update: {
          all_upload_complete?: boolean | null
          base_price?: number | null
          carot_image_0_filename?: string | null
          carot_image_1_filename?: string | null
          carot_image_2_filename?: string | null
          carot_image_3_filename?: string | null
          carot_image_4_filename?: string | null
          carot_image_5_filename?: string | null
          carot_image_6_filename?: string | null
          carot_image_7_filename?: string | null
          carotimages_folder_path?: string | null
          cdn_carat_image_url_0?: never
          cdn_carat_image_url_1?: never
          cdn_carat_image_url_2?: never
          cdn_carat_image_url_3?: never
          cdn_carat_image_url_4?: never
          cdn_carat_image_url_5?: never
          cdn_carat_image_url_6?: never
          cdn_carat_image_url_7?: never
          cdn_image_url_0?: never
          cdn_image_url_1?: never
          cdn_image_url_2?: never
          cdn_image_url_3?: never
          cdn_model_photo_url?: never
          cdn_model_url?: never
          cdn_transparent_url_0?: never
          cdn_transparent_url_1?: never
          cdn_transparent_url_2?: never
          cdn_transparent_url_3?: never
          cdn_video_url?: never
          combination_id?: string | null
          created_at?: string | null
          drive_link?: string | null
          files_uploaded?: string | null
          folder_path?: string | null
          glb_model_filename?: string | null
          glb_model_status?: boolean | null
          id?: string | null
          image_0_filename?: string | null
          image_0_status?: boolean | null
          image_1_filename?: string | null
          image_1_status?: boolean | null
          image_2_filename?: string | null
          image_2_status?: boolean | null
          image_3_filename?: string | null
          image_3_status?: boolean | null
          image_url_0?: string | null
          image_url_1?: string | null
          image_url_2?: string | null
          image_url_3?: string | null
          last_updated?: string | null
          manufacture_cad_filename?: string | null
          manufacture_cad_status?: boolean | null
          manufacture_cad_url?: string | null
          model_3d_url?: string | null
          model_photo_filename?: string | null
          model_photo_status?: boolean | null
          model_photo_url?: string | null
          notes?: string | null
          product_name?: string | null
          rendered_cad_filename?: string | null
          rendered_cad_status?: boolean | null
          rendered_cad_url?: string | null
          shank_id?: string | null
          shank_name?: string | null
          shape_id?: string | null
          shape_name?: string | null
          style?: string | null
          style_id?: string | null
          style_name?: string | null
          total_files?: number | null
          transparent_0_filename?: string | null
          transparent_0_status?: boolean | null
          transparent_1_filename?: string | null
          transparent_1_status?: boolean | null
          transparent_2_filename?: string | null
          transparent_2_status?: boolean | null
          transparent_3_filename?: string | null
          transparent_3_status?: boolean | null
          transparent_url_0?: string | null
          transparent_url_1?: string | null
          transparent_url_2?: string | null
          transparent_url_3?: string | null
          unique_id?: string | null
          updated_at?: string | null
          video_filename?: string | null
          video_status?: boolean | null
          video_url?: string | null
          visual_color?: string | null
          visual_color_name?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _carat_display_name: { Args: { p_carat: number }; Returns: string }
      _diamond_fit_cohorts: {
        Args: { p_rounds: number; p_sigma: number }
        Returns: undefined
      }
      _diamond_fit_cohorts_work: {
        Args: { p_rounds: number; p_sigma: number }
        Returns: undefined
      }
      _diamond_fx_check_rates: {
        Args: { p_cad: number; p_gbp: number }
        Returns: undefined
      }
      _diamond_fx_cron: { Args: { p_on: boolean }; Returns: undefined }
      _diamond_outlier_require_admin: {
        Args: { p_write?: boolean }
        Returns: undefined
      }
      _diamond_pipeline_cron: { Args: { p_on: boolean }; Returns: undefined }
      _diamond_preset_carat_range: {
        Args: { p_carat: number }
        Returns: string
      }
      _diamond_preset_shape_id: { Args: { p_shape: string }; Returns: string }
      _diamond_preset_shape_name: {
        Args: { p_shape_id: string }
        Returns: string
      }
      _diamond_preset_tier_value: {
        Args: { p_carat: number; p_field: string; p_tiers: Json }
        Returns: number
      }
      _diamond_work_truncate: { Args: { p_all: boolean }; Returns: undefined }
      admin_get_subscription_overview: {
        Args: { p_end?: string; p_include_internal?: boolean; p_start?: string }
        Returns: {
          billed_periods: number
          cancel_at_period_end: boolean
          client_id: string
          company_name: string
          current_period_end: string
          is_internal: boolean
          lifetime_revenue: number
          mrr: number
          paid_since: string
          plan_name: string
          plan_price_monthly: number
          started_at: string
          status: string
          trial_end: string
        }[]
      }
      admin_get_usage_overview: {
        Args: {
          p_end?: string
          p_include_internal?: boolean
          p_resold_only?: boolean
          p_start?: string
        }
        Returns: {
          admin_credit_dollars: number
          chat_cost_dollars: number
          chat_count: number
          client_id: string
          company_name: string
          cost_dollars: number
          estimate_cost_dollars: number
          estimate_count: number
          free_credit_cost_dollars: number
          free_credits_remaining: number
          image_cost_dollars: number
          image_count: number
          is_internal: boolean
          margin_pct: number
          other_debit_dollars: number
          paid_dollars: number
          plan_name: string
          profit_dollars: number
          purchased_expires_at: string
          refund_dollars: number
          revenue_dollars: number
          wallet_balance: number
        }[]
      }
      admin_write_allowed: { Args: never; Returns: boolean }
      apply_client_diamond_catalog: {
        Args: {
          p_client_id: string
          p_markup_lab?: number
          p_markup_natural?: number
          p_wizard_config: Json
        }
        Returns: Json
      }
      apply_diamond_fx_rates: {
        Args: {
          p_cad_buffer_pct: number
          p_confirm?: boolean
          p_fetch_id?: number
          p_gbp_buffer_pct: number
          p_idempotency_key?: string
          p_note?: string
          p_usd_to_cad: number
          p_usd_to_gbp: number
        }
        Returns: Json
      }
      archive_old_ai_usage_logs: { Args: never; Returns: number }
      cancel_diamond_fx_job: { Args: never; Returns: Json }
      cancel_diamond_pipeline: { Args: never; Returns: Json }
      cleanup_expired_shopify_oauth_states: { Args: never; Returns: number }
      cleanup_expired_tokens: { Args: never; Returns: undefined }
      cleanup_old_rate_limits: { Args: never; Returns: undefined }
      cleanup_orphan_ai_previews: { Args: never; Returns: Json }
      client_exists: { Args: { p_client_id: string }; Returns: boolean }
      compute_client_diamond_catalog_availability: {
        Args: { p_client_id: string }
        Returns: Json
      }
      consume_cad_addon: {
        Args: {
          p_addon_kind: string
          p_cad_request_id: string
          p_client_id: string
          p_fallback_kinds?: string[]
        }
        Returns: Json
      }
      count_diamond_presets_estimate: {
        Args: { p_wizard_config: Json }
        Returns: Json
      }
      credit_wallet: {
        Args: {
          p_amount: number
          p_client_id: string
          p_description?: string
          p_reference_id?: string
          p_type?: string
        }
        Returns: Json
      }
      debit_wallet: {
        Args: {
          p_amount: number
          p_client_id: string
          p_description?: string
          p_metadata?: Json
          p_reference_id?: string
        }
        Returns: Json
      }
      decrypt_crm_api_key: { Args: { integration_id: string }; Returns: string }
      decrypt_shopify_token: {
        Args: { client_user_id: string }
        Returns: string
      }
      decrypt_storefront_token: {
        Args: { client_user_id: string }
        Returns: string
      }
      decrypt_webhook_secret: {
        Args: { client_user_id: string }
        Returns: string
      }
      delete_client_diamond_chunk: {
        Args: { p_client_id: string }
        Returns: number
      }
      diamond_clarity_rank: { Args: { q: string }; Returns: number }
      diamond_color_rank: { Args: { c: string }; Returns: number }
      diamond_engine_live_for: {
        Args: { p_client_id: string }
        Returns: boolean
      }
      diamond_filter_values: {
        Args: { p_filter: Json; p_key: string; p_upper?: boolean }
        Returns: string[]
      }
      diamond_fx_assert_admin_write: { Args: never; Returns: string }
      diamond_fx_is_usd_row: {
        Args: { p_markup_currency: string }
        Returns: boolean
      }
      diamond_fx_step: { Args: never; Returns: string }
      diamond_magic_band: { Args: { c: number }; Returns: number }
      diamond_pipeline_step: { Args: never; Returns: string }
      diamond_pipeline_tick: { Args: never; Returns: string }
      diamond_pool_filter_currency: {
        Args: { p_filter: Json }
        Returns: string
      }
      diamond_pool_row_currency: {
        Args: { p_markup_currency: string }
        Returns: string
      }
      diamond_pool_row_matches: {
        Args: {
          p_filter: Json
          p_row: Database["public"]["Tables"]["diamond_inventory_pool"]["Row"]
        }
        Returns: boolean
      }
      diamond_pool_stone_type: { Args: { p_lg: string }; Returns: string }
      diamond_rap_band: { Args: { c: number }; Returns: number }
      diamond_robust_z: {
        Args: {
          dev: number
          floor_val: number
          mad: number
          mad_hi: number
          mad_lo: number
        }
        Returns: number
      }
      encrypt_crm_api_key: {
        Args: { integration_id: string; key: string }
        Returns: undefined
      }
      encrypt_shopify_token: {
        Args: { client_user_id: string; token: string }
        Returns: undefined
      }
      encrypt_storefront_token: {
        Args: { client_user_id: string; token: string }
        Returns: undefined
      }
      encrypt_webhook_secret: {
        Args: { client_user_id: string; secret: string }
        Returns: undefined
      }
      ensure_free_credits: {
        Args: { p_client_id: string }
        Returns: {
          client_id: string
          created_at: string
          dollars_granted: number
          dollars_remaining: number
          expires_at: string
          granted_at: string
          id: string
        }
        SetofOptions: {
          from: "*"
          to: "client_free_credits"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      expire_purchased_credits: { Args: never; Returns: number }
      force_client_auth_email_update: {
        Args: { p_new_email: string; p_user_id: string }
        Returns: undefined
      }
      gate_ai_request: {
        Args: { p_client_id: string; p_feature: string }
        Returns: Json
      }
      gemstone_type_key: { Args: { p_gem_type: string }; Returns: string }
      generate_client_diamond_presets_chunk_db: {
        Args: {
          p_clear_existing?: boolean
          p_client_id: string
          p_shape_ids?: string[]
          p_stone_types_filter?: string[]
          p_wizard_config: Json
        }
        Returns: Json
      }
      generate_client_diamond_presets_db: {
        Args: { p_client_id: string; p_wizard_config: Json }
        Returns: Json
      }
      get_admin_lead_aggregates: {
        Args: { p_client_id?: string; p_end?: string; p_start?: string }
        Returns: Json
      }
      get_asset_cdn_url: {
        Args: { p_bucket?: string; p_filename: string; p_folder_path: string }
        Returns: string
      }
      get_client_availability: {
        Args: { client_uuid: string }
        Returns: {
          date_overrides: Json
          slot_duration_minutes: number
          timezone: string
          weekly_hours: Json
        }[]
      }
      get_client_branding: {
        Args: { client_uuid: string }
        Returns: {
          allowed_domains: string[]
          branding_config: Json
          company_name: string
          currency: string
          enabled_features: Json
          google_ads_conversion_id: string
          google_ads_conversion_labels: Json
          gtm_container_id: string
          id: string
          logo_url: string
          meta_pixel_id: string
          privacy_url: string
          subscription_active: boolean
          terms_url: string
          widget_theme: string
        }[]
      }
      get_client_crm_integrations: {
        Args: { p_client_id: string }
        Returns: {
          client_id: string
          created_at: string
          id: string
          is_active: boolean
          last_synced_at: string
          provider: string
          updated_at: string
          webhook_url: string
        }[]
      }
      get_client_diamond_catalog_availability: {
        Args: { p_client_id: string }
        Returns: Json
      }
      get_client_diamond_display_currency: {
        Args: { p_client_id: string }
        Returns: string
      }
      get_client_diamond_form_options: {
        Args: { client_uuid: string }
        Returns: {
          display_order: number
          extra_data: Json
          has_custom_price: boolean
          id: string
          image_url: string
          is_enabled: boolean
          name: string
          option_value: string
          price: number
          step_type: string
        }[]
      }
      get_client_diamond_presets: {
        Args: { client_uuid: string }
        Returns: {
          base_price: number
          carat_range: string
          carat_value: number
          clarity: string
          color: string
          custom_price: number
          cut_grade: string
          fluorescence: string
          id: string
          is_enabled: boolean
          shape_id: string
          stone_type: string
        }[]
      }
      get_client_scheduling: {
        Args: { client_uuid: string }
        Returns: {
          scheduling_provider: string
          scheduling_url: string
        }[]
      }
      get_client_subscription_active: {
        Args: { client_uuid: string }
        Returns: boolean
      }
      get_cron_job_health: { Args: never; Returns: Json }
      get_daily_leads_report: {
        Args: { p_end: string; p_start: string }
        Returns: {
          client_id: string
          lead_count: number
          source: string
        }[]
      }
      get_diamond_catalog_attributes: {
        Args: { p_client_id: string }
        Returns: Json
      }
      get_diamond_fx_overview: { Args: never; Returns: Json }
      get_diamond_fx_prices_for_pool_ids: {
        Args: { p_currency: string; p_pool_ids: string[] }
        Returns: {
          pool_id: string
          price: number
        }[]
      }
      get_diamond_fx_published_rates: { Args: never; Returns: Json }
      get_diamond_outlier_blocked: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_side?: string
          p_stone_type?: string
        }
        Returns: {
          carat_bucket: number
          carats: number
          clarity: string
          color: string
          confidence: string
          cut: string
          discount: number
          expected_price: number
          flo: string
          lab: string
          model_cohort_n: number
          model_level: string
          pdf: string
          pool_id: string
          ppc: number
          rap_group_median_disc: number
          rap_group_n: number
          rap_rung: number
          raw_price: number
          report_no: string
          shape_id: string
          shelf_median_ppc: number
          shelf_n: number
          side: string
          stone_type: string
          total_count: number
          video: string
          z_model: number
          z_rap: number
        }[]
      }
      get_diamond_outlier_overview: { Args: never; Returns: Json }
      get_diamond_outlier_rep_changes: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: {
          carat_bucket: number
          clarity: string
          color: string
          new_carats: number
          new_pool_id: string
          new_price: number
          old_carats: number
          old_pool_id: string
          old_price: number
          old_z_model: number
          old_z_rap: number
          shape_id: string
          shelf_hidden: boolean
          shelf_n: number
          stone_type: string
          total_count: number
          uplift_pct: number
        }[]
      }
      get_diamond_pool_distinct_values: { Args: never; Returns: Json }
      get_diamond_pool_filter_count: {
        Args: { p_filter: Json }
        Returns: number
      }
      get_diamond_pool_preview: {
        Args: {
          p_filter: Json
          p_markup_lab?: number
          p_markup_natural?: number
          p_offset?: number
          p_page_size?: number
        }
        Returns: {
          base_price: number
          carat_range: string
          carat_value: number
          clarity: string
          color: string
          custom_price: number
          id: string
          is_enabled: boolean
          shape_id: string
          stone_type: string
          total_count: number
        }[]
      }
      get_diamond_pool_price_range: { Args: never; Returns: Json }
      get_diamond_pool_price_range_for_filter: {
        Args: { p_filter: Json }
        Returns: Json
      }
      get_diamond_pool_shape_counts: { Args: { p_filter: Json }; Returns: Json }
      get_diamond_preset_filter_options: {
        Args: { p_client_id: string }
        Returns: Json
      }
      get_diamond_presets_filtered: {
        Args: {
          p_carat_range?: string
          p_clarity?: string
          p_client_id: string
          p_color?: string
          p_offset?: number
          p_page_size?: number
          p_shape_id?: string
          p_stone_type?: string
        }
        Returns: {
          base_price: number
          carat_range: string
          carat_value: number
          clarity: string
          color: string
          custom_price: number
          id: string
          is_enabled: boolean
          pool_id: string
          report_no: string
          shape_id: string
          stone_type: string
          total_count: number
        }[]
      }
      get_diamond_presets_filtered_base: {
        Args: {
          p_carat_range?: string
          p_clarity?: string
          p_client_id: string
          p_color?: string
          p_offset?: number
          p_page_size?: number
          p_shape_id?: string
          p_stone_type?: string
        }
        Returns: {
          base_price: number
          carat_range: string
          carat_value: number
          clarity: string
          color: string
          custom_price: number
          id: string
          is_enabled: boolean
          pool_id: string
          report_no: string
          shape_id: string
          stone_type: string
          total_count: number
        }[]
      }
      get_encryption_key: { Args: never; Returns: string }
      get_gemstone_pool_gem_types: {
        Args: never
        Returns: {
          gem_key: string
          gem_type: string
          max_price: number
          min_price: number
          stone_count: number
        }[]
      }
      get_lead_device_breakdown: {
        Args: { p_client_id?: string; p_end?: string; p_start?: string }
        Returns: Json
      }
      get_platform_db_size_bytes: { Args: never; Returns: number }
      get_platform_health_latest: {
        Args: never
        Returns: {
          category: string
          checked_at: string
          component: string
          details: Json
          id: string
          latency_ms: number | null
          message: string | null
          run_id: string
          source: string
          status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "platform_health_checks"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_platform_health_overview: {
        Args: { p_days?: number }
        Returns: {
          avg_latency_ms: number
          category: string
          checks_degraded: number
          checks_down: number
          checks_total: number
          component: string
          downtime_seconds: number
          healthy_pct: number
          incidents: number
          p95_latency_ms: number
          uptime_pct: number
        }[]
      }
      get_platform_health_trend: {
        Args: { p_days?: number }
        Returns: {
          avg_latency_ms: number
          category: string
          checks_degraded: number
          checks_down: number
          checks_total: number
          component: string
          day: string
          healthy_pct: number
          uptime_pct: number
        }[]
      }
      get_platform_quota_latest: {
        Args: never
        Returns: {
          captured_at: string
          details: Json
          id: string
          label: string
          level: string
          metric: string
          pct: number | null
          quota_limit: number | null
          service: string
          unit: string
          used: number
        }[]
        SetofOptions: {
          from: "*"
          to: "platform_quota_snapshots"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_platform_storage_size_bytes: { Args: never; Returns: number }
      get_product_revenue: {
        Args: {
          p_client_id?: string
          p_end?: string
          p_exclude_internal?: boolean
          p_start?: string
        }
        Returns: {
          client_id: string
          company_name: string
          currency: string
          order_count: number
          product: string
          revenue: number
        }[]
      }
      get_quote_estimator_diamonds: {
        Args: {
          p_carat_max?: number
          p_carat_min?: number
          p_client_id: string
          p_limit?: number
          p_shape_id?: string
          p_stone_type?: string
          p_version?: string
        }
        Returns: {
          carat_value: number
          clarity: string
          color: string
          lab: string
          pdf: string
          pool_id: string
          price: number
          report_no: string
          shape_id: string
          source: string
          stone_type: string
        }[]
      }
      get_quote_estimator_gemstones: {
        Args: {
          p_carat_max?: number
          p_carat_min?: number
          p_client_id: string
          p_gem_key: string
          p_offset?: number
          p_page_size?: number
          p_sort?: string
          p_version?: string
        }
        Returns: {
          carats: number
          clarity: string
          color: string
          color_shade: string
          cut: string
          gem_key: string
          gem_type: string
          image: string
          lab: string
          length: number
          mine_of_origin: string
          pdf_url: string
          pool_id: string
          price: number
          price_per_carat: number
          report_no: string
          shape: string
          stock_id: string
          total_count: number
          treatment: string
          video: string
          width: number
        }[]
      }
      get_ring_os_currency: { Args: { p_client_id: string }; Returns: string }
      get_ringos_revenue: {
        Args: {
          p_client_id?: string
          p_end?: string
          p_exclude_internal?: boolean
          p_start?: string
        }
        Returns: {
          client_id: string
          company_name: string
          currency: string
          order_count: number
          revenue: number
        }[]
      }
      get_safe_client_data: {
        Args: { client_user_id: string }
        Returns: {
          agency_id: string
          branding_config: Json
          company_name: string
          created_at: string
          custom_commission_rate: number
          email: string
          id: string
          logo_url: string
          plan_id: string
          shopify_store_url: string
          status: string
          subscription_ends_at: string
          user_id: string
        }[]
      }
      get_sandbox_quote_v1_options: {
        Args: { client_uuid: string }
        Returns: {
          display_order: number
          extra_data: Json
          has_custom_price: boolean
          id: string
          image_url: string
          is_enabled: boolean
          name: string
          option_value: string
          price: number
          step_type: string
        }[]
      }
      get_sandbox_quote_v3_options: {
        Args: { client_uuid: string }
        Returns: {
          display_order: number
          extra_data: Json
          has_custom_price: boolean
          id: string
          image_url: string
          is_enabled: boolean
          name: string
          option_value: string
          price: number
          step_type: string
        }[]
      }
      get_user_client_id: { Args: { _user_id: string }; Returns: string }
      get_widget_view_daily: {
        Args: {
          p_client_id?: string
          p_end_date?: string
          p_start_date?: string
          p_timezone?: string
        }
        Returns: {
          day: string
          total_count: number
        }[]
      }
      get_widget_view_stats: {
        Args: {
          p_client_id: string
          p_end_date?: string
          p_start_date?: string
        }
        Returns: {
          source: string
          total_count: number
          unique_sessions: number
        }[]
      }
      get_widget_view_stats_all: {
        Args: { p_end_date?: string; p_start_date?: string }
        Returns: {
          source: string
          total_count: number
          unique_sessions: number
        }[]
      }
      grant_monthly_free_credits: { Args: never; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_client_active: { Args: { p_client_id: string }; Returns: boolean }
      is_readonly_admin: { Args: { _user_id: string }; Returns: boolean }
      is_staff_of_client: {
        Args: { _client_id: string; _user_id: string }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      is_valid_client_id: { Args: { _client_id: string }; Returns: boolean }
      list_public_tables: {
        Args: never
        Returns: {
          table_name: string
        }[]
      }
      marketing_claim_recipients: {
        Args: { _campaign: string; _limit: number }
        Returns: {
          bounced_at: string | null
          campaign_id: string
          clicked_at: string | null
          complained_at: string | null
          created_at: string
          delivered_at: string | null
          email: string
          error: string | null
          id: string
          lead_id: string
          opened_at: string | null
          resend_id: string | null
          sent_at: string | null
          status: string
          unsubscribed_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "marketing_campaign_recipients"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      mass_update_diamond_prices: {
        Args: {
          p_addend?: number
          p_carat_range?: string
          p_clarity?: string
          p_client_id: string
          p_color?: string
          p_multiplier?: number
          p_shape_id?: string
          p_stone_type?: string
        }
        Returns: number
      }
      match_document_chunks: {
        Args: {
          match_client_id: string
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          content: string
          document_id: string
          id: string
          metadata: Json
          similarity: number
        }[]
      }
      merge_diamond_inventory_pool_staging: {
        Args: { p_batch_id: string }
        Returns: Json
      }
      order_items_amount: {
        Args: { p_configuration: Json; p_total_amount: number }
        Returns: number
      }
      pause_client_widgets: { Args: { client_uuid: string }; Returns: boolean }
      prune_platform_health_data: { Args: never; Returns: undefined }
      record_diamond_fx_fetch: {
        Args: {
          p_fetched_by: string
          p_provider: string
          p_provider_timestamp: string
          p_usd_to_cad: number
          p_usd_to_gbp: number
        }
        Returns: Json
      }
      refresh_all_client_catalogs: { Args: never; Returns: Json }
      refresh_client_diamond_availability: {
        Args: { p_client_id: string }
        Returns: Json
      }
      refresh_diamond_pool_distinct_values: { Args: never; Returns: Json }
      refresh_stale_diamond_availability: {
        Args: { p_limit?: number }
        Returns: number
      }
      reset_client_diamond_presets: {
        Args: { p_client_id: string }
        Returns: number
      }
      resume_client_widgets: { Args: { client_uuid: string }; Returns: boolean }
      ring_os_currency_client_allowed: {
        Args: { p_client_id: string }
        Returns: boolean
      }
      ringos_order_amount: {
        Args: { p_configuration: Json; p_total_amount: number }
        Returns: number
      }
      rollup_platform_health_daily: {
        Args: { p_day: string }
        Returns: undefined
      }
      score_diamond_pool: { Args: { p_trigger?: string }; Returns: string }
      staff_has_catalog_edit: {
        Args: { _client_id: string; _user_id: string }
        Returns: boolean
      }
      staff_has_custom_x_edit: {
        Args: { _client_id: string; _user_id: string }
        Returns: boolean
      }
      staff_has_metal_buying_edit: {
        Args: { _client_id: string; _user_id: string }
        Returns: boolean
      }
      subscription_status_allows_widgets: {
        Args: { p_status: string }
        Returns: boolean
      }
      swap_diamond_inventory_pool: {
        Args: { p_batch_id: string }
        Returns: Json
      }
      swap_gemstone_inventory_pool: {
        Args: { p_batch_id: string }
        Returns: Json
      }
      sync_client_diamond_catalog_from_filter: {
        Args: { p_client_id: string }
        Returns: Json
      }
      trigger_daily_leads_report: {
        Args: { p_body?: Json }
        Returns: undefined
      }
      trigger_database_backup: {
        Args: { p_backup_type?: string }
        Returns: undefined
      }
      trigger_diamond_pipeline: { Args: never; Returns: Json }
      trigger_marketing_campaign_tick: { Args: never; Returns: undefined }
      trigger_monthly_client_report: { Args: never; Returns: undefined }
      trigger_platform_health_monitor: {
        Args: { p_body?: Json }
        Returns: undefined
      }
      trigger_subscription_grace_enforcement: {
        Args: never
        Returns: undefined
      }
      trim_old_log_tables: { Args: never; Returns: Json }
      truncate_log_tables: { Args: never; Returns: Json }
      update_diamond_outlier_config: { Args: { p_patch: Json }; Returns: Json }
      uuid_larger: { Args: { a: string; b: string }; Returns: string }
    }
    Enums: {
      analytics_event_type:
        | "configurator_load"
        | "add_to_cart"
        | "purchase"
        | "page_view"
        | "embed_view"
        | "ring_view"
        | "config_started"
        | "config_completed"
        | "design_saved"
        | "widget_view"
        | "form_started"
        | "form_step_advanced"
        | "form_abandoned"
      app_role: "agency_admin" | "client" | "staff"
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
      analytics_event_type: [
        "configurator_load",
        "add_to_cart",
        "purchase",
        "page_view",
        "embed_view",
        "ring_view",
        "config_started",
        "config_completed",
        "design_saved",
        "widget_view",
        "form_started",
        "form_step_advanced",
        "form_abandoned",
      ],
      app_role: ["agency_admin", "client", "staff"],
    },
  },
} as const
