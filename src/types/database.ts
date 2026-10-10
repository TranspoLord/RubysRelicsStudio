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
      exp_admin_audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_user_id: string | null
          branch: string
          created_at: string
          details: Json
          entity_id: string | null
          entity_type: string
          id: string
          request_ip: string | null
          route: string
          status: string
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_user_id?: string | null
          branch: string
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type: string
          id?: string
          request_ip?: string | null
          route: string
          status: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_user_id?: string | null
          branch?: string
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type?: string
          id?: string
          request_ip?: string | null
          route?: string
          status?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      exp_admin_notifications: {
        Row: {
          body: string | null
          created_at: string
          event_type: string
          href: string | null
          id: string
          is_read: boolean
          metadata: Json
          read_at: string | null
          source_id: string
          source_type: string
          title: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          event_type: string
          href?: string | null
          id?: string
          is_read?: boolean
          metadata?: Json
          read_at?: string | null
          source_id: string
          source_type: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          event_type?: string
          href?: string | null
          id?: string
          is_read?: boolean
          metadata?: Json
          read_at?: string | null
          source_id?: string
          source_type?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      exp_admin_users: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          is_active: boolean
          last_login_at: string | null
          revoked_at: string | null
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          is_active?: boolean
          last_login_at?: string | null
          revoked_at?: string | null
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
          is_active?: boolean
          last_login_at?: string | null
          revoked_at?: string | null
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      exp_announcement: {
        Row: {
          created_at: string
          cta_href: string | null
          cta_label: string | null
          dismiss_key: string
          id: string
          is_active: boolean
          message: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          cta_href?: string | null
          cta_label?: string | null
          dismiss_key?: string
          id?: string
          is_active?: boolean
          message: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          cta_href?: string | null
          cta_label?: string | null
          dismiss_key?: string
          id?: string
          is_active?: boolean
          message?: string
          updated_at?: string
        }
        Relationships: []
      }
      exp_artwork_uploads: {
        Row: {
          content_type: string | null
          created_at: string
          expires_at: string
          file_path: string
          file_size_bytes: number | null
          id: string
          upload_token: string
        }
        Insert: {
          content_type?: string | null
          created_at?: string
          expires_at?: string
          file_path: string
          file_size_bytes?: number | null
          id?: string
          upload_token: string
        }
        Update: {
          content_type?: string | null
          created_at?: string
          expires_at?: string
          file_path?: string
          file_size_bytes?: number | null
          id?: string
          upload_token?: string
        }
        Relationships: []
      }
      exp_back_in_stock_alerts: {
        Row: {
          claimed_at: string | null
          consent_ip: string | null
          consent_user_agent: string | null
          created_at: string
          email: string
          id: string
          last_send_error: string | null
          notified_at: string | null
          product_id: string
          send_attempts: number
          source: string
          status: string
          subscribed_at: string
          updated_at: string
        }
        Insert: {
          claimed_at?: string | null
          consent_ip?: string | null
          consent_user_agent?: string | null
          created_at?: string
          email: string
          id?: string
          last_send_error?: string | null
          notified_at?: string | null
          product_id: string
          send_attempts?: number
          source?: string
          status?: string
          subscribed_at?: string
          updated_at?: string
        }
        Update: {
          claimed_at?: string | null
          consent_ip?: string | null
          consent_user_agent?: string | null
          created_at?: string
          email?: string
          id?: string
          last_send_error?: string | null
          notified_at?: string | null
          product_id?: string
          send_attempts?: number
          source?: string
          status?: string
          subscribed_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exp_back_in_stock_alerts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "exp_products"
            referencedColumns: ["id"]
          },
        ]
      }
      exp_budget_ranges: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          label: string
          max_amount: number | null
          min_amount: number | null
          sort_order: number
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          max_amount?: number | null
          min_amount?: number | null
          sort_order?: number
          updated_at?: string
          value: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          max_amount?: number | null
          min_amount?: number | null
          sort_order?: number
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      exp_bundle_deals: {
        Row: {
          code: string | null
          conditions_json: Json
          created_at: string
          description: string
          id: string
          is_active: boolean
          is_stackable: boolean
          name: string
          rewards_json: Json
          trigger_type: string
          updated_at: string
          usage_count: number
          usage_limit: number | null
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          code?: string | null
          conditions_json?: Json
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          is_stackable?: boolean
          name: string
          rewards_json?: Json
          trigger_type: string
          updated_at?: string
          usage_count?: number
          usage_limit?: number | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          code?: string | null
          conditions_json?: Json
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          is_stackable?: boolean
          name?: string
          rewards_json?: Json
          trigger_type?: string
          updated_at?: string
          usage_count?: number
          usage_limit?: number | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: []
      }
      exp_capacity_reopen_alerts: {
        Row: {
          category_key: string
          claimed_at: string | null
          created_at: string
          email: string
          id: string
          last_send_error: string | null
          notified_at: string | null
          send_attempts: number
          source: string
          status: string
          subscribed_at: string
          unsubscribed_at: string | null
          updated_at: string
        }
        Insert: {
          category_key: string
          claimed_at?: string | null
          created_at?: string
          email: string
          id?: string
          last_send_error?: string | null
          notified_at?: string | null
          send_attempts?: number
          source?: string
          status?: string
          subscribed_at?: string
          unsubscribed_at?: string | null
          updated_at?: string
        }
        Update: {
          category_key?: string
          claimed_at?: string | null
          created_at?: string
          email?: string
          id?: string
          last_send_error?: string | null
          notified_at?: string | null
          send_attempts?: number
          source?: string
          status?: string
          subscribed_at?: string
          unsubscribed_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      exp_cart_captures: {
        Row: {
          cart_json: Json
          created_at: string
          email: string
          id: string
          ip_hash: string | null
          order_id: string | null
          recovery_sent_at: string | null
          updated_at: string
        }
        Insert: {
          cart_json?: Json
          created_at?: string
          email: string
          id?: string
          ip_hash?: string | null
          order_id?: string | null
          recovery_sent_at?: string | null
          updated_at?: string
        }
        Update: {
          cart_json?: Json
          created_at?: string
          email?: string
          id?: string
          ip_hash?: string | null
          order_id?: string | null
          recovery_sent_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exp_cart_captures_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "exp_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      exp_custom_requests: {
        Row: {
          admin_notes: string | null
          age_confirmed: boolean
          branch: string
          budget_range: string | null
          created_at: string
          customer_access_expires_at: string | null
          customer_access_token: string | null
          customer_email: string
          customer_name: string
          deadline: string | null
          description: string
          design_document: Json | null
          design_help_needed: boolean
          design_id: string | null
          files: Json
          id: string
          ip_rights_confirmed: boolean
          item_type: string
          production_handoff_at: string | null
          quantity: number
          quote_amount: number | null
          quote_expires_at: string | null
          quote_last_resent_at: string | null
          quote_resend_count: number
          quote_sent_at: string | null
          recovery_reminder_sent_at: string | null
          square_payment_link_id: string | null
          square_payment_link_url: string | null
          status: string
          stripe_payment_link_id: string | null
          stripe_payment_link_url: string | null
          tos_accepted: boolean
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          age_confirmed?: boolean
          branch?: string
          budget_range?: string | null
          created_at?: string
          customer_access_expires_at?: string | null
          customer_access_token?: string | null
          customer_email: string
          customer_name: string
          deadline?: string | null
          description: string
          design_document?: Json | null
          design_help_needed?: boolean
          design_id?: string | null
          files?: Json
          id?: string
          ip_rights_confirmed?: boolean
          item_type: string
          production_handoff_at?: string | null
          quantity?: number
          quote_amount?: number | null
          quote_expires_at?: string | null
          quote_last_resent_at?: string | null
          quote_resend_count?: number
          quote_sent_at?: string | null
          recovery_reminder_sent_at?: string | null
          square_payment_link_id?: string | null
          square_payment_link_url?: string | null
          status?: string
          stripe_payment_link_id?: string | null
          stripe_payment_link_url?: string | null
          tos_accepted?: boolean
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          age_confirmed?: boolean
          branch?: string
          budget_range?: string | null
          created_at?: string
          customer_access_expires_at?: string | null
          customer_access_token?: string | null
          customer_email?: string
          customer_name?: string
          deadline?: string | null
          description?: string
          design_document?: Json | null
          design_help_needed?: boolean
          design_id?: string | null
          files?: Json
          id?: string
          ip_rights_confirmed?: boolean
          item_type?: string
          production_handoff_at?: string | null
          quantity?: number
          quote_amount?: number | null
          quote_expires_at?: string | null
          quote_last_resent_at?: string | null
          quote_resend_count?: number
          quote_sent_at?: string | null
          recovery_reminder_sent_at?: string | null
          square_payment_link_id?: string | null
          square_payment_link_url?: string | null
          status?: string
          stripe_payment_link_id?: string | null
          stripe_payment_link_url?: string | null
          tos_accepted?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exp_custom_requests_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "exp_product_designs"
            referencedColumns: ["id"]
          },
        ]
      }
      exp_faq: {
        Row: {
          answer: string
          created_at: string
          id: string
          is_visible: boolean
          link_href: string | null
          link_label: string | null
          question: string
          section: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          answer: string
          created_at?: string
          id?: string
          is_visible?: boolean
          link_href?: string | null
          link_label?: string | null
          question: string
          section?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          answer?: string
          created_at?: string
          id?: string
          is_visible?: boolean
          link_href?: string | null
          link_label?: string | null
          question?: string
          section?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      exp_featured_collections: {
        Row: {
          border_color: string
          created_at: string
          description: string
          emoji: string | null
          gradient: string
          id: string
          image_url: string | null
          is_visible: boolean
          slug: string
          sort_order: number
          tag_label: string | null
          tagline: string
          title: string
          updated_at: string
        }
        Insert: {
          border_color?: string
          created_at?: string
          description?: string
          emoji?: string | null
          gradient?: string
          id?: string
          image_url?: string | null
          is_visible?: boolean
          slug: string
          sort_order?: number
          tag_label?: string | null
          tagline: string
          title: string
          updated_at?: string
        }
        Update: {
          border_color?: string
          created_at?: string
          description?: string
          emoji?: string | null
          gradient?: string
          id?: string
          image_url?: string | null
          is_visible?: boolean
          slug?: string
          sort_order?: number
          tag_label?: string | null
          tagline?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      exp_future_product_statuses: {
        Row: {
          color: string
          created_at: string
          id: string
          is_default: boolean
          is_visible: boolean
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          is_default?: boolean
          is_visible?: boolean
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_default?: boolean
          is_visible?: boolean
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      exp_future_products: {
        Row: {
          category_key: string | null
          created_at: string
          description: string | null
          estimated_release: string | null
          id: string
          is_visible: boolean
          media_alt: string | null
          media_url: string | null
          sort_order: number
          status_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          category_key?: string | null
          created_at?: string
          description?: string | null
          estimated_release?: string | null
          id?: string
          is_visible?: boolean
          media_alt?: string | null
          media_url?: string | null
          sort_order?: number
          status_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          category_key?: string | null
          created_at?: string
          description?: string | null
          estimated_release?: string | null
          id?: string
          is_visible?: boolean
          media_alt?: string | null
          media_url?: string | null
          sort_order?: number
          status_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exp_future_products_category_key_fkey"
            columns: ["category_key"]
            isOneToOne: false
            referencedRelation: "exp_taxonomy"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "exp_future_products_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "exp_future_product_statuses"
            referencedColumns: ["id"]
          },
        ]
      }
      exp_gallery: {
        Row: {
          caption: string | null
          category_key: string | null
          created_at: string
          display_permission: boolean
          emoji: string | null
          gradient: string
          id: string
          material_used: string | null
          media_alt: string
          media_url: string
          moderation_status: string
          publish_date: string | null
          sort_order: number
          tags: string[]
          title: string
          turnaround_band: string | null
          updated_at: string
          visible: boolean
        }
        Insert: {
          caption?: string | null
          category_key?: string | null
          created_at?: string
          display_permission?: boolean
          emoji?: string | null
          gradient?: string
          id?: string
          material_used?: string | null
          media_alt?: string
          media_url?: string
          moderation_status?: string
          publish_date?: string | null
          sort_order?: number
          tags?: string[]
          title: string
          turnaround_band?: string | null
          updated_at?: string
          visible?: boolean
        }
        Update: {
          caption?: string | null
          category_key?: string | null
          created_at?: string
          display_permission?: boolean
          emoji?: string | null
          gradient?: string
          id?: string
          material_used?: string | null
          media_alt?: string
          media_url?: string
          moderation_status?: string
          publish_date?: string | null
          sort_order?: number
          tags?: string[]
          title?: string
          turnaround_band?: string | null
          updated_at?: string
          visible?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "exp_gallery_category_key_fkey"
            columns: ["category_key"]
            isOneToOne: false
            referencedRelation: "exp_taxonomy"
            referencedColumns: ["key"]
          },
        ]
      }
      exp_homepage_sections: {
        Row: {
          content: Json
          created_at: string
          id: string
          is_visible: boolean
          section_key: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          content?: Json
          created_at?: string
          id?: string
          is_visible?: boolean
          section_key: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          content?: Json
          created_at?: string
          id?: string
          is_visible?: boolean
          section_key?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      exp_inventory_adjustments: {
        Row: {
          adjusted_by: string | null
          change_qty: number
          created_at: string
          id: string
          inventory_id: string | null
          note: string | null
          order_id: string | null
          product_id: string | null
          quantity_after: number | null
          quantity_before: number | null
          reason_code: string
        }
        Insert: {
          adjusted_by?: string | null
          change_qty: number
          created_at?: string
          id?: string
          inventory_id?: string | null
          note?: string | null
          order_id?: string | null
          product_id?: string | null
          quantity_after?: number | null
          quantity_before?: number | null
          reason_code: string
        }
        Update: {
          adjusted_by?: string | null
          change_qty?: number
          created_at?: string
          id?: string
          inventory_id?: string | null
          note?: string | null
          order_id?: string | null
          product_id?: string | null
          quantity_after?: number | null
          quantity_before?: number | null
          reason_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "exp_inventory_adjustments_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "exp_product_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exp_inventory_adjustments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "exp_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exp_inventory_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "exp_products"
            referencedColumns: ["id"]
          },
        ]
      }
      exp_labor_time_entries: {
        Row: {
          created_at: string
          hourly_rate: number
          id: string
          logged_at: string
          logged_by: string | null
          minutes: number
          note: string | null
          order_id: string | null
          order_item_id: string | null
          stage: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          hourly_rate?: number
          id?: string
          logged_at?: string
          logged_by?: string | null
          minutes: number
          note?: string | null
          order_id?: string | null
          order_item_id?: string | null
          stage: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          hourly_rate?: number
          id?: string
          logged_at?: string
          logged_by?: string | null
          minutes?: number
          note?: string | null
          order_id?: string | null
          order_item_id?: string | null
          stage?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exp_labor_time_entries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "exp_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exp_labor_time_entries_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "exp_order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      exp_machine_schedule_blocks: {
        Row: {
          created_at: string
          created_by: string | null
          custom_request_id: string | null
          end_at: string
          estimated_hours: number
          id: string
          is_locked: boolean
          note: string | null
          order_id: string | null
          order_item_id: string | null
          stage: string
          start_at: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          custom_request_id?: string | null
          end_at: string
          estimated_hours: number
          id?: string
          is_locked?: boolean
          note?: string | null
          order_id?: string | null
          order_item_id?: string | null
          stage: string
          start_at: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          custom_request_id?: string | null
          end_at?: string
          estimated_hours?: number
          id?: string
          is_locked?: boolean
          note?: string | null
          order_id?: string | null
          order_item_id?: string | null
          stage?: string
          start_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exp_machine_schedule_blocks_custom_request_id_fkey"
            columns: ["custom_request_id"]
            isOneToOne: false
            referencedRelation: "exp_custom_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exp_machine_schedule_blocks_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "exp_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exp_machine_schedule_blocks_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "exp_order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      exp_material_catalog: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          key: string
          name: string
          notes: string | null
          unit_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          key: string
          name: string
          notes?: string | null
          unit_name?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          key?: string
          name?: string
          notes?: string | null
          unit_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      exp_material_cost_history: {
        Row: {
          cost_per_unit: number
          created_at: string
          effective_from: string
          id: string
          material_id: string
          notes: string | null
          supplier_label: string | null
        }
        Insert: {
          cost_per_unit: number
          created_at?: string
          effective_from?: string
          id?: string
          material_id: string
          notes?: string | null
          supplier_label?: string | null
        }
        Update: {
          cost_per_unit?: number
          created_at?: string
          effective_from?: string
          id?: string
          material_id?: string
          notes?: string | null
          supplier_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exp_material_cost_history_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "exp_material_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      exp_newsletter_subscribers: {
        Row: {
          consent_ip: string | null
          consent_user_agent: string | null
          created_at: string
          denial_reason: string | null
          email: string
          id: string
          interest_details: Json
          name: string | null
          response_status: string
          source: string | null
          subscribed: boolean
          subscribed_at: string
          unsubscribed_at: string | null
          updated_at: string
        }
        Insert: {
          consent_ip?: string | null
          consent_user_agent?: string | null
          created_at?: string
          denial_reason?: string | null
          email: string
          id?: string
          interest_details?: Json
          name?: string | null
          response_status?: string
          source?: string | null
          subscribed?: boolean
          subscribed_at?: string
          unsubscribed_at?: string | null
          updated_at?: string
        }
        Update: {
          consent_ip?: string | null
          consent_user_agent?: string | null
          created_at?: string
          denial_reason?: string | null
          email?: string
          id?: string
          interest_details?: Json
          name?: string | null
          response_status?: string
          source?: string | null
          subscribed?: boolean
          subscribed_at?: string
          unsubscribed_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      exp_order_internal_notes: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_pinned: boolean
          note: string
          order_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_pinned?: boolean
          note: string
          order_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_pinned?: boolean
          note?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exp_order_internal_notes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "exp_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      exp_order_item_material_usage: {
        Row: {
          created_at: string
          id: string
          material_id: string | null
          note: string | null
          order_item_id: string
          quantity_used: number
          total_cost_snapshot: number | null
          unit_cost_snapshot: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          material_id?: string | null
          note?: string | null
          order_item_id: string
          quantity_used: number
          total_cost_snapshot?: number | null
          unit_cost_snapshot: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          material_id?: string | null
          note?: string | null
          order_item_id?: string
          quantity_used?: number
          total_cost_snapshot?: number | null
          unit_cost_snapshot?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exp_order_item_material_usage_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "exp_material_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exp_order_item_material_usage_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "exp_order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      exp_order_items: {
        Row: {
          created_at: string
          design_id: string | null
          design_snapshot: Json | null
          id: string
          leave_unlocked: boolean
          line_discount: number
          line_subtotal: number
          line_total: number
          nfc: Json | null
          nfc_target_data: string | null
          order_id: string
          product_id: string | null
          product_title: string
          quantity: number
          selected_options: Json
          selected_process_keys: string[]
          source_file_url: string | null
          unit_price: number
          variant_label: string | null
        }
        Insert: {
          created_at?: string
          design_id?: string | null
          design_snapshot?: Json | null
          id?: string
          leave_unlocked?: boolean
          line_discount?: number
          line_subtotal?: number
          line_total?: number
          nfc?: Json | null
          nfc_target_data?: string | null
          order_id: string
          product_id?: string | null
          product_title: string
          quantity: number
          selected_options?: Json
          selected_process_keys?: string[]
          source_file_url?: string | null
          unit_price?: number
          variant_label?: string | null
        }
        Update: {
          created_at?: string
          design_id?: string | null
          design_snapshot?: Json | null
          id?: string
          leave_unlocked?: boolean
          line_discount?: number
          line_subtotal?: number
          line_total?: number
          nfc?: Json | null
          nfc_target_data?: string | null
          order_id?: string
          product_id?: string | null
          product_title?: string
          quantity?: number
          selected_options?: Json
          selected_process_keys?: string[]
          source_file_url?: string | null
          unit_price?: number
          variant_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exp_order_items_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "exp_product_designs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exp_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "exp_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      exp_order_production_hooks: {
        Row: {
          assignee: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          estimated_hours: number | null
          id: string
          is_completed: boolean
          note: string | null
          order_id: string
          scheduled_for: string | null
          stage: string
          updated_at: string
        }
        Insert: {
          assignee?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          estimated_hours?: number | null
          id?: string
          is_completed?: boolean
          note?: string | null
          order_id: string
          scheduled_for?: string | null
          stage: string
          updated_at?: string
        }
        Update: {
          assignee?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          estimated_hours?: number | null
          id?: string
          is_completed?: boolean
          note?: string | null
          order_id?: string
          scheduled_for?: string | null
          stage?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exp_order_production_hooks_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "exp_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      exp_order_status_events: {
        Row: {
          action_type: string
          created_at: string
          created_by: string | null
          id: string
          metadata: Json
          next_payment_status: string | null
          next_status: string | null
          note: string | null
          order_id: string
          previous_payment_status: string | null
          previous_status: string | null
        }
        Insert: {
          action_type: string
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json
          next_payment_status?: string | null
          next_status?: string | null
          note?: string | null
          order_id: string
          previous_payment_status?: string | null
          previous_status?: string | null
        }
        Update: {
          action_type?: string
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json
          next_payment_status?: string | null
          next_status?: string | null
          note?: string | null
          order_id?: string
          previous_payment_status?: string | null
          previous_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exp_order_status_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "exp_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      exp_orders: {
        Row: {
          branch: string
          bundle_deal_ids: string[]
          cancelled_at: string | null
          cart_recovery_email_sent_at: string | null
          cart_snapshot: Json
          checkout_attempt_id: string | null
          claimed_at: string | null
          created_at: string
          custom_request_id: string | null
          customer_email: string | null
          discount_amount: number
          guest_tracking_expires_at: string | null
          guest_tracking_token: string | null
          id: string
          inventory_released_at: string | null
          inventory_reserved_at: string | null
          order_path: string
          order_total: number
          paid_at: string | null
          payment_mode: string
          payment_status: string
          production_estimate_band: string
          promo_code_id: string | null
          refunded_amount: number | null
          refunded_at: string | null
          shipping_address: Json
          shipping_carrier: string | null
          shipping_cost: number
          shipping_discount: number
          shipping_method: string
          square_order_id: string | null
          square_payment_id: string | null
          square_payment_link_id: string | null
          square_payment_link_url: string | null
          status: string
          stripe_payment_intent_id: string | null
          stripe_payment_link_id: string | null
          stripe_session_id: string | null
          subtotal: number
          tax_amount: number
          tracking_number: string | null
          updated_at: string
        }
        Insert: {
          branch?: string
          bundle_deal_ids?: string[]
          cancelled_at?: string | null
          cart_recovery_email_sent_at?: string | null
          cart_snapshot?: Json
          checkout_attempt_id?: string | null
          claimed_at?: string | null
          created_at?: string
          custom_request_id?: string | null
          customer_email?: string | null
          discount_amount?: number
          guest_tracking_expires_at?: string | null
          guest_tracking_token?: string | null
          id?: string
          inventory_released_at?: string | null
          inventory_reserved_at?: string | null
          order_path?: string
          order_total?: number
          paid_at?: string | null
          payment_mode?: string
          payment_status?: string
          production_estimate_band?: string
          promo_code_id?: string | null
          refunded_amount?: number | null
          refunded_at?: string | null
          shipping_address?: Json
          shipping_carrier?: string | null
          shipping_cost?: number
          shipping_discount?: number
          shipping_method?: string
          square_order_id?: string | null
          square_payment_id?: string | null
          square_payment_link_id?: string | null
          square_payment_link_url?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_payment_link_id?: string | null
          stripe_session_id?: string | null
          subtotal?: number
          tax_amount?: number
          tracking_number?: string | null
          updated_at?: string
        }
        Update: {
          branch?: string
          bundle_deal_ids?: string[]
          cancelled_at?: string | null
          cart_recovery_email_sent_at?: string | null
          cart_snapshot?: Json
          checkout_attempt_id?: string | null
          claimed_at?: string | null
          created_at?: string
          custom_request_id?: string | null
          customer_email?: string | null
          discount_amount?: number
          guest_tracking_expires_at?: string | null
          guest_tracking_token?: string | null
          id?: string
          inventory_released_at?: string | null
          inventory_reserved_at?: string | null
          order_path?: string
          order_total?: number
          paid_at?: string | null
          payment_mode?: string
          payment_status?: string
          production_estimate_band?: string
          promo_code_id?: string | null
          refunded_amount?: number | null
          refunded_at?: string | null
          shipping_address?: Json
          shipping_carrier?: string | null
          shipping_cost?: number
          shipping_discount?: number
          shipping_method?: string
          square_order_id?: string | null
          square_payment_id?: string | null
          square_payment_link_id?: string | null
          square_payment_link_url?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_payment_link_id?: string | null
          stripe_session_id?: string | null
          subtotal?: number
          tax_amount?: number
          tracking_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exp_orders_custom_request_id_fkey"
            columns: ["custom_request_id"]
            isOneToOne: false
            referencedRelation: "exp_custom_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      exp_product_bulk_discounts: {
        Row: {
          created_at: string
          description: string | null
          discount_type: string
          discount_value: number
          id: string
          is_enabled: boolean
          label: string | null
          max_qty: number | null
          min_qty: number
          product_id: string
          sort_order: number
          step_qty: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          discount_type: string
          discount_value: number
          id?: string
          is_enabled?: boolean
          label?: string | null
          max_qty?: number | null
          min_qty: number
          product_id: string
          sort_order?: number
          step_qty?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          discount_type?: string
          discount_value?: number
          id?: string
          is_enabled?: boolean
          label?: string | null
          max_qty?: number | null
          min_qty?: number
          product_id?: string
          sort_order?: number
          step_qty?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exp_product_bulk_discounts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "exp_products"
            referencedColumns: ["id"]
          },
        ]
      }
      exp_product_combo_discounts: {
        Row: {
          created_at: string
          discount_type: string
          discount_value: number | null
          id: string
          is_enabled: boolean
          label: string | null
          min_processes: number
          product_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          discount_type: string
          discount_value?: number | null
          id?: string
          is_enabled?: boolean
          label?: string | null
          min_processes?: number
          product_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          discount_type?: string
          discount_value?: number | null
          id?: string
          is_enabled?: boolean
          label?: string | null
          min_processes?: number
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exp_product_combo_discounts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "exp_products"
            referencedColumns: ["id"]
          },
        ]
      }
      exp_product_design_assets: {
        Row: {
          asset_path: string
          created_at: string
          design_id: string
          expires_at: string | null
          id: string
          upload_token_hash: string
        }
        Insert: {
          asset_path: string
          created_at?: string
          design_id: string
          expires_at?: string | null
          id?: string
          upload_token_hash: string
        }
        Update: {
          asset_path?: string
          created_at?: string
          design_id?: string
          expires_at?: string | null
          id?: string
          upload_token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "exp_product_design_assets_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "exp_product_designs"
            referencedColumns: ["id"]
          },
        ]
      }
      exp_product_design_exports: {
        Row: {
          artifact_path: string | null
          artifact_sha256: string | null
          created_at: string
          design_id: string
          document_hash: string
          dpi: number
          error_code: string | null
          error_message: string | null
          format: string
          id: string
          idempotency_key: string | null
          render_ms: number | null
          status: string
        }
        Insert: {
          artifact_path?: string | null
          artifact_sha256?: string | null
          created_at?: string
          design_id: string
          document_hash: string
          dpi: number
          error_code?: string | null
          error_message?: string | null
          format: string
          id?: string
          idempotency_key?: string | null
          render_ms?: number | null
          status: string
        }
        Update: {
          artifact_path?: string | null
          artifact_sha256?: string | null
          created_at?: string
          design_id?: string
          document_hash?: string
          dpi?: number
          error_code?: string | null
          error_message?: string | null
          format?: string
          id?: string
          idempotency_key?: string | null
          render_ms?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "exp_product_design_exports_design_id_fkey"
            columns: ["design_id"]
            isOneToOne: false
            referencedRelation: "exp_product_designs"
            referencedColumns: ["id"]
          },
        ]
      }
      exp_product_designs: {
        Row: {
          created_at: string
          design_document: Json
          document_hash: string
          id: string
          product_id: string
          source: string
          template_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          design_document: Json
          document_hash: string
          id?: string
          product_id: string
          source: string
          template_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          design_document?: Json
          document_hash?: string
          id?: string
          product_id?: string
          source?: string
          template_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      exp_product_inventory: {
        Row: {
          availability_override: string
          available_qty: number
          created_at: string
          id: string
          is_track_inventory: boolean
          last_adjusted_at: string | null
          low_stock_threshold: number
          product_id: string
          updated_at: string
        }
        Insert: {
          availability_override?: string
          available_qty?: number
          created_at?: string
          id?: string
          is_track_inventory?: boolean
          last_adjusted_at?: string | null
          low_stock_threshold?: number
          product_id: string
          updated_at?: string
        }
        Update: {
          availability_override?: string
          available_qty?: number
          created_at?: string
          id?: string
          is_track_inventory?: boolean
          last_adjusted_at?: string | null
          low_stock_threshold?: number
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exp_product_inventory_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "exp_products"
            referencedColumns: ["id"]
          },
        ]
      }
      exp_product_media: {
        Row: {
          alt: string
          created_at: string
          emoji: string | null
          gradient: string | null
          id: string
          is_featured: boolean
          product_id: string
          sort_order: number
          url: string
        }
        Insert: {
          alt?: string
          created_at?: string
          emoji?: string | null
          gradient?: string | null
          id?: string
          is_featured?: boolean
          product_id: string
          sort_order?: number
          url?: string
        }
        Update: {
          alt?: string
          created_at?: string
          emoji?: string | null
          gradient?: string | null
          id?: string
          is_featured?: boolean
          product_id?: string
          sort_order?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "exp_product_media_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "exp_products"
            referencedColumns: ["id"]
          },
        ]
      }
      exp_product_option_values: {
        Row: {
          created_at: string
          id: string
          is_enabled: boolean
          label: string
          option_id: string
          price_delta: number
          sort_order: number
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          label: string
          option_id: string
          price_delta?: number
          sort_order?: number
          updated_at?: string
          value: string
        }
        Update: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          label?: string
          option_id?: string
          price_delta?: number
          sort_order?: number
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "exp_product_option_values_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "exp_product_options"
            referencedColumns: ["id"]
          },
        ]
      }
      exp_product_options: {
        Row: {
          allowed_colors: string[] | null
          created_at: string
          help_text: string | null
          id: string
          is_required: boolean
          label: string
          max_height: number | null
          max_width: number | null
          min_height: number | null
          min_width: number | null
          option_key: string
          option_type: string
          placeholder: string | null
          product_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          allowed_colors?: string[] | null
          created_at?: string
          help_text?: string | null
          id?: string
          is_required?: boolean
          label: string
          max_height?: number | null
          max_width?: number | null
          min_height?: number | null
          min_width?: number | null
          option_key: string
          option_type: string
          placeholder?: string | null
          product_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          allowed_colors?: string[] | null
          created_at?: string
          help_text?: string | null
          id?: string
          is_required?: boolean
          label?: string
          max_height?: number | null
          max_width?: number | null
          min_height?: number | null
          min_width?: number | null
          option_key?: string
          option_type?: string
          placeholder?: string | null
          product_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exp_product_options_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "exp_products"
            referencedColumns: ["id"]
          },
        ]
      }
      exp_product_process_pricing: {
        Row: {
          created_at: string
          id: string
          is_enabled: boolean
          price_delta: number
          process_type_key: string
          product_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          price_delta?: number
          process_type_key: string
          product_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          price_delta?: number
          process_type_key?: string
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exp_product_process_pricing_process_type_key_fkey"
            columns: ["process_type_key"]
            isOneToOne: false
            referencedRelation: "exp_taxonomy"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "exp_product_process_pricing_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "exp_products"
            referencedColumns: ["id"]
          },
        ]
      }
      exp_product_process_types: {
        Row: {
          process_type_key: string
          product_id: string
        }
        Insert: {
          process_type_key: string
          product_id: string
        }
        Update: {
          process_type_key?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exp_product_process_types_process_type_key_fkey"
            columns: ["process_type_key"]
            isOneToOne: false
            referencedRelation: "exp_taxonomy"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "exp_product_process_types_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "exp_products"
            referencedColumns: ["id"]
          },
        ]
      }
      exp_product_variants: {
        Row: {
          capacity_weight: number | null
          created_at: string
          id: string
          is_enabled: boolean
          label: string
          price_delta: number
          product_id: string
          sku: string | null
          sort_order: number
          updated_at: string
          weight_lb: number | null
        }
        Insert: {
          capacity_weight?: number | null
          created_at?: string
          id?: string
          is_enabled?: boolean
          label: string
          price_delta?: number
          product_id: string
          sku?: string | null
          sort_order?: number
          updated_at?: string
          weight_lb?: number | null
        }
        Update: {
          capacity_weight?: number | null
          created_at?: string
          id?: string
          is_enabled?: boolean
          label?: string
          price_delta?: number
          product_id?: string
          sku?: string | null
          sort_order?: number
          updated_at?: string
          weight_lb?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "exp_product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "exp_products"
            referencedColumns: ["id"]
          },
        ]
      }
      exp_products: {
        Row: {
          base_price: number
          category_key: string
          created_at: string
          description: string
          designer_mockup_url: string | null
          has_designer: boolean
          how_it_works_anchor: string | null
          id: string
          is_active: boolean
          is_archived: boolean
          is_customizable: boolean
          is_ready_made: boolean
          is_square_enabled: boolean
          nfc_price_delta: number
          production_estimate_band: string
          seo_description: string | null
          seo_title: string | null
          short_description: string
          slug: string
          sort_order: number
          square_variant_id: string | null
          title: string
          updated_at: string
          weight_lb: number
        }
        Insert: {
          base_price?: number
          category_key: string
          created_at?: string
          description?: string
          designer_mockup_url?: string | null
          has_designer?: boolean
          how_it_works_anchor?: string | null
          id?: string
          is_active?: boolean
          is_archived?: boolean
          is_customizable?: boolean
          is_ready_made?: boolean
          is_square_enabled?: boolean
          nfc_price_delta?: number
          production_estimate_band?: string
          seo_description?: string | null
          seo_title?: string | null
          short_description?: string
          slug: string
          sort_order?: number
          square_variant_id?: string | null
          title: string
          updated_at?: string
          weight_lb?: number
        }
        Update: {
          base_price?: number
          category_key?: string
          created_at?: string
          description?: string
          designer_mockup_url?: string | null
          has_designer?: boolean
          how_it_works_anchor?: string | null
          id?: string
          is_active?: boolean
          is_archived?: boolean
          is_customizable?: boolean
          is_ready_made?: boolean
          is_square_enabled?: boolean
          nfc_price_delta?: number
          production_estimate_band?: string
          seo_description?: string | null
          seo_title?: string | null
          short_description?: string
          slug?: string
          sort_order?: number
          square_variant_id?: string | null
          title?: string
          updated_at?: string
          weight_lb?: number
        }
        Relationships: [
          {
            foreignKeyName: "exp_products_category_key_fkey"
            columns: ["category_key"]
            isOneToOne: false
            referencedRelation: "exp_taxonomy"
            referencedColumns: ["key"]
          },
        ]
      }
      exp_promo_codes: {
        Row: {
          code: string
          created_at: string
          description: string
          discount_type: string
          discount_value: number
          id: string
          is_active: boolean
          updated_at: string
          usage_count: number
          usage_limit: number | null
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          code: string
          created_at?: string
          description?: string
          discount_type: string
          discount_value?: number
          id?: string
          is_active?: boolean
          updated_at?: string
          usage_count?: number
          usage_limit?: number | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          description?: string
          discount_type?: string
          discount_value?: number
          id?: string
          is_active?: boolean
          updated_at?: string
          usage_count?: number
          usage_limit?: number | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: []
      }
      exp_rate_limit_windows: {
        Row: {
          count: number
          expires_at: string
          key: string
          window_start: number
        }
        Insert: {
          count?: number
          expires_at: string
          key: string
          window_start: number
        }
        Update: {
          count?: number
          expires_at?: string
          key?: string
          window_start?: number
        }
        Relationships: []
      }
      exp_shippo_webhook_events: {
        Row: {
          event_type: string
          id: string
          processed: boolean
          received_at: string
        }
        Insert: {
          event_type: string
          id: string
          processed?: boolean
          received_at?: string
        }
        Update: {
          event_type?: string
          id?: string
          processed?: boolean
          received_at?: string
        }
        Relationships: []
      }
      exp_square_webhook_events: {
        Row: {
          event_type: string
          id: string
          processed: boolean
          received_at: string
        }
        Insert: {
          event_type: string
          id: string
          processed?: boolean
          received_at?: string
        }
        Update: {
          event_type?: string
          id?: string
          processed?: boolean
          received_at?: string
        }
        Relationships: []
      }
      exp_storefront_settings: {
        Row: {
          description: string | null
          setting_key: string
          setting_value: Json
          updated_at: string
        }
        Insert: {
          description?: string | null
          setting_key: string
          setting_value?: Json
          updated_at?: string
        }
        Update: {
          description?: string | null
          setting_key?: string
          setting_value?: Json
          updated_at?: string
        }
        Relationships: []
      }
      exp_stripe_webhook_events: {
        Row: {
          created_at: string
          event_id: string
          event_type: string
          last_error: string | null
          processed_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id: string
          event_type: string
          last_error?: string | null
          processed_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          event_type?: string
          last_error?: string | null
          processed_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      exp_taxonomy: {
        Row: {
          alias_keys: string | null
          created_at: string
          display_name: string
          emoji: string | null
          glow_color: string | null
          gradient: string | null
          how_it_works_anchor: string | null
          key: string
          parent_key: string | null
          slug: string
          sort_order: number
          tagline: string | null
          type: string
          updated_at: string
          visible: boolean
        }
        Insert: {
          alias_keys?: string | null
          created_at?: string
          display_name: string
          emoji?: string | null
          glow_color?: string | null
          gradient?: string | null
          how_it_works_anchor?: string | null
          key: string
          parent_key?: string | null
          slug: string
          sort_order?: number
          tagline?: string | null
          type: string
          updated_at?: string
          visible?: boolean
        }
        Update: {
          alias_keys?: string | null
          created_at?: string
          display_name?: string
          emoji?: string | null
          glow_color?: string | null
          gradient?: string | null
          how_it_works_anchor?: string | null
          key?: string
          parent_key?: string | null
          slug?: string
          sort_order?: number
          tagline?: string | null
          type?: string
          updated_at?: string
          visible?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "exp_taxonomy_parent_key_fkey"
            columns: ["parent_key"]
            isOneToOne: false
            referencedRelation: "exp_taxonomy"
            referencedColumns: ["key"]
          },
        ]
      }
      exp_testimonials: {
        Row: {
          author: string
          created_at: string
          emoji: string | null
          id: string
          is_visible: boolean
          location: string | null
          product_label: string | null
          quote: string
          sort_order: number
          source: string | null
          stars: number
          updated_at: string
        }
        Insert: {
          author: string
          created_at?: string
          emoji?: string | null
          id?: string
          is_visible?: boolean
          location?: string | null
          product_label?: string | null
          quote: string
          sort_order?: number
          source?: string | null
          stars?: number
          updated_at?: string
        }
        Update: {
          author?: string
          created_at?: string
          emoji?: string | null
          id?: string
          is_visible?: boolean
          location?: string | null
          product_label?: string | null
          quote?: string
          sort_order?: number
          source?: string | null
          stars?: number
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_expired_rate_limits: { Args: never; Returns: undefined }
      exp_increment_bundle_deal_usage: {
        Args: { p_deal_id: string }
        Returns: undefined
      }
      exp_increment_promo_code_usage: {
        Args: { p_code_id: string }
        Returns: undefined
      }
      exp_mark_order_paid: {
        Args: {
          p_amount_cents: number
          p_order_id: string
          p_paid_at: string
          p_source: string
          p_square_payment_id: string
        }
        Returns: Json
      }
      exp_release_bundle_deal: { Args: { p_id: string }; Returns: undefined }
      exp_release_order_inventory: {
        Args: { p_note?: string; p_order_id: string }
        Returns: Json
      }
      exp_release_promo_code: { Args: { p_id: string }; Returns: undefined }
      exp_reserve_order_inventory: {
        Args: { p_order_id: string }
        Returns: Json
      }
      exp_try_redeem_bundle_deal: { Args: { p_id: string }; Returns: boolean }
      exp_try_redeem_promo_code: { Args: { p_id: string }; Returns: boolean }
      increment_rate_limit: {
        Args: { p_expires_at: string; p_key: string }
        Returns: number
      }
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
