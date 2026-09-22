export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      calendar_event_attendees: {
        Row: {
          created_at: string
          event_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_event_attendees_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_event_attendees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_event_invites: {
        Row: {
          created_at: string
          event_id: string
          id: string
          invited_by: string
          responded_at: string | null
          status: Database["public"]["Enums"]["calendar_event_invitation_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          invited_by: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["calendar_event_invitation_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          invited_by?: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["calendar_event_invitation_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_event_invites_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_event_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_event_invites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_event_participants: {
        Row: {
          assigned_by: string
          created_at: string
          event_id: string
          user_id: string
        }
        Insert: {
          assigned_by: string
          created_at?: string
          event_id: string
          user_id: string
        }
        Update: {
          assigned_by?: string
          created_at?: string
          event_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_event_participants_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_event_participants_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_event_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          all_day: boolean
          assignee_id: string | null
          cancelled_at: string | null
          compensates_time_off_request_id: string | null
          created_at: string
          created_by: string
          description: string | null
          ends_at: string
          event_type: Database["public"]["Enums"]["calendar_event_type"]
          id: string
          location: string | null
          meeting_mode: string | null
          meeting_url: string | null
          occurrence_start: string | null
          organizer_id: string
          project_id: string | null
          recurrence_rule: Json | null
          series_id: string | null
          starts_at: string
          studio_id: string
          title: string
          updated_at: string
        }
        Insert: {
          all_day?: boolean
          assignee_id?: string | null
          cancelled_at?: string | null
          compensates_time_off_request_id?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          ends_at: string
          event_type: Database["public"]["Enums"]["calendar_event_type"]
          id?: string
          location?: string | null
          meeting_mode?: string | null
          meeting_url?: string | null
          occurrence_start?: string | null
          organizer_id: string
          project_id?: string | null
          recurrence_rule?: Json | null
          series_id?: string | null
          starts_at: string
          studio_id: string
          title: string
          updated_at?: string
        }
        Update: {
          all_day?: boolean
          assignee_id?: string | null
          cancelled_at?: string | null
          compensates_time_off_request_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          ends_at?: string
          event_type?: Database["public"]["Enums"]["calendar_event_type"]
          id?: string
          location?: string | null
          meeting_mode?: string | null
          meeting_url?: string | null
          occurrence_start?: string | null
          organizer_id?: string
          project_id?: string | null
          recurrence_rule?: Json | null
          series_id?: string | null
          starts_at?: string
          studio_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_compensates_time_off_request_id_fkey"
            columns: ["compensates_time_off_request_id"]
            isOneToOne: false
            referencedRelation: "time_off_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_template_items: {
        Row: {
          created_at: string
          id: string
          position: number
          template_id: string
          title: string
          updated_at: string
          weight: number
        }
        Insert: {
          created_at?: string
          id?: string
          position: number
          template_id: string
          title: string
          updated_at?: string
          weight: number
        }
        Update: {
          created_at?: string
          id?: string
          position?: number
          template_id?: string
          title?: string
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "checklist_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_templates: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string
          id: string
          name: string
          studio_id: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by: string
          id?: string
          name: string
          studio_id: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          studio_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_templates_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
        ]
      }
      contractor_categories: {
        Row: {
          color_key: string
          created_at: string
          id: string
          name: string
          studio_id: string
          updated_at: string
        }
        Insert: {
          color_key: string
          created_at?: string
          id?: string
          name: string
          studio_id: string
          updated_at?: string
        }
        Update: {
          color_key?: string
          created_at?: string
          id?: string
          name?: string
          studio_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contractor_categories_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
        ]
      }
      contractor_subcategories: {
        Row: {
          category_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "contractor_subcategories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "contractor_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      contractors: {
        Row: {
          category_id: string
          created_at: string
          created_by: string
          description: string | null
          id: string
          name: string
          phone: string | null
          subcategory_id: string | null
          updated_at: string
          website_url: string | null
        }
        Insert: {
          category_id: string
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          name: string
          phone?: string | null
          subcategory_id?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          category_id?: string
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          name?: string
          phone?: string | null
          subcategory_id?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contractors_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "contractor_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractors_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractors_subcategory_category_fkey"
            columns: ["subcategory_id", "category_id"]
            isOneToOne: false
            referencedRelation: "contractor_subcategories"
            referencedColumns: ["id", "category_id"]
          },
        ]
      }
      crm_candidates: {
        Row: {
          created_at: string
          email: string | null
          external_profile_url: string | null
          full_name: string
          id: string
          internal_notes: string | null
          phone: string | null
          responsible_admin_id: string | null
          source: string | null
          studio_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          external_profile_url?: string | null
          full_name: string
          id?: string
          internal_notes?: string | null
          phone?: string | null
          responsible_admin_id?: string | null
          source?: string | null
          studio_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          external_profile_url?: string | null
          full_name?: string
          id?: string
          internal_notes?: string | null
          phone?: string | null
          responsible_admin_id?: string | null
          source?: string | null
          studio_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_candidates_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_candidates_studio_id_responsible_admin_id_fkey"
            columns: ["studio_id", "responsible_admin_id"]
            isOneToOne: false
            referencedRelation: "studio_members"
            referencedColumns: ["studio_id", "user_id"]
          },
        ]
      }
      crm_lead_history: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          id: string
          lead_id: string
          new_status: Database["public"]["Enums"]["crm_lead_status"] | null
          previous_status: Database["public"]["Enums"]["crm_lead_status"] | null
          project_id: string | null
          studio_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          lead_id: string
          new_status?: Database["public"]["Enums"]["crm_lead_status"] | null
          previous_status?:
            | Database["public"]["Enums"]["crm_lead_status"]
            | null
          project_id?: string | null
          studio_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          lead_id?: string
          new_status?: Database["public"]["Enums"]["crm_lead_status"] | null
          previous_status?:
            | Database["public"]["Enums"]["crm_lead_status"]
            | null
          project_id?: string | null
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_lead_history_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_lead_history_lead_studio_fkey"
            columns: ["lead_id", "studio_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id", "studio_id"]
          },
          {
            foreignKeyName: "crm_lead_history_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_lead_history_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_leads: {
        Row: {
          approximate_area: number | null
          budget_amount: number | null
          budget_currency: string | null
          budget_note: string | null
          city: string | null
          city_geonames_id: number | null
          client_name: string
          company: string | null
          country: string | null
          country_code: string | null
          created_at: string
          email: string | null
          expected_project_type: string | null
          expected_project_type_custom: string | null
          first_contact_date: string
          id: string
          internal_notes: string | null
          invalid_reason:
            | Database["public"]["Enums"]["crm_invalid_reason"]
            | null
          last_contacted_at: string | null
          next_contact_at: string | null
          phone: string | null
          project_id: string | null
          request_description: string | null
          responsible_admin_id: string | null
          source: string | null
          status: Database["public"]["Enums"]["crm_lead_status"]
          studio_id: string
          updated_at: string
        }
        Insert: {
          approximate_area?: number | null
          budget_amount?: number | null
          budget_currency?: string | null
          budget_note?: string | null
          city?: string | null
          city_geonames_id?: number | null
          client_name: string
          company?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string
          email?: string | null
          expected_project_type?: string | null
          expected_project_type_custom?: string | null
          first_contact_date: string
          id?: string
          internal_notes?: string | null
          invalid_reason?:
            | Database["public"]["Enums"]["crm_invalid_reason"]
            | null
          last_contacted_at?: string | null
          next_contact_at?: string | null
          phone?: string | null
          project_id?: string | null
          request_description?: string | null
          responsible_admin_id?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["crm_lead_status"]
          studio_id: string
          updated_at?: string
        }
        Update: {
          approximate_area?: number | null
          budget_amount?: number | null
          budget_currency?: string | null
          budget_note?: string | null
          city?: string | null
          city_geonames_id?: number | null
          client_name?: string
          company?: string | null
          country?: string | null
          country_code?: string | null
          created_at?: string
          email?: string | null
          expected_project_type?: string | null
          expected_project_type_custom?: string | null
          first_contact_date?: string
          id?: string
          internal_notes?: string | null
          invalid_reason?:
            | Database["public"]["Enums"]["crm_invalid_reason"]
            | null
          last_contacted_at?: string | null
          next_contact_at?: string | null
          phone?: string | null
          project_id?: string | null
          request_description?: string | null
          responsible_admin_id?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["crm_lead_status"]
          studio_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_leads_project_studio_fkey"
            columns: ["project_id", "studio_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "studio_id"]
          },
          {
            foreignKeyName: "crm_leads_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_leads_studio_id_responsible_admin_id_fkey"
            columns: ["studio_id", "responsible_admin_id"]
            isOneToOne: false
            referencedRelation: "studio_members"
            referencedColumns: ["studio_id", "user_id"]
          },
        ]
      }
      crm_recruiting_cycles: {
        Row: {
          candidate_id: string
          completed_at: string | null
          created_at: string
          decision_notes: string | null
          id: string
          interview_at: string | null
          interview_notes: string | null
          next_contact_date: string | null
          outcome: Database["public"]["Enums"]["recruiting_outcome"] | null
          stage: Database["public"]["Enums"]["recruiting_stage"]
          started_at: string
          studio_id: string
          target_position: string
          test_task_result: string | null
          updated_at: string
        }
        Insert: {
          candidate_id: string
          completed_at?: string | null
          created_at?: string
          decision_notes?: string | null
          id?: string
          interview_at?: string | null
          interview_notes?: string | null
          next_contact_date?: string | null
          outcome?: Database["public"]["Enums"]["recruiting_outcome"] | null
          stage?: Database["public"]["Enums"]["recruiting_stage"]
          started_at?: string
          studio_id: string
          target_position: string
          test_task_result?: string | null
          updated_at?: string
        }
        Update: {
          candidate_id?: string
          completed_at?: string | null
          created_at?: string
          decision_notes?: string | null
          id?: string
          interview_at?: string | null
          interview_notes?: string | null
          next_contact_date?: string | null
          outcome?: Database["public"]["Enums"]["recruiting_outcome"] | null
          stage?: Database["public"]["Enums"]["recruiting_stage"]
          started_at?: string
          studio_id?: string
          target_position?: string
          test_task_result?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_recruiting_cycles_candidate_id_studio_id_fkey"
            columns: ["candidate_id", "studio_id"]
            isOneToOne: false
            referencedRelation: "crm_candidates"
            referencedColumns: ["id", "studio_id"]
          },
          {
            foreignKeyName: "crm_recruiting_cycles_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment: {
        Row: {
          asset_tag: string
          cpu: string | null
          created_at: string
          display_name: string | null
          equipment_type: Database["public"]["Enums"]["equipment_type"]
          gpu: string | null
          id: string
          lifecycle_state: Database["public"]["Enums"]["equipment_lifecycle_state"]
          maintenance_interval_months: number | null
          maintenance_overdue_notified_for: string | null
          maintenance_upcoming_notified_for: string | null
          manufacturer: string | null
          model: string | null
          next_maintenance_due_date: string | null
          notes: string | null
          pc_configuration: Json | null
          ram: string | null
          recurring_maintenance_enabled: boolean
          serial_number: string | null
          storage: string | null
          studio_id: string
          updated_at: string
          workstation_id: string | null
        }
        Insert: {
          asset_tag?: string
          cpu?: string | null
          created_at?: string
          display_name?: string | null
          equipment_type: Database["public"]["Enums"]["equipment_type"]
          gpu?: string | null
          id?: string
          lifecycle_state?: Database["public"]["Enums"]["equipment_lifecycle_state"]
          maintenance_interval_months?: number | null
          maintenance_overdue_notified_for?: string | null
          maintenance_upcoming_notified_for?: string | null
          manufacturer?: string | null
          model?: string | null
          next_maintenance_due_date?: string | null
          notes?: string | null
          pc_configuration?: Json | null
          ram?: string | null
          recurring_maintenance_enabled?: boolean
          serial_number?: string | null
          storage?: string | null
          studio_id: string
          updated_at?: string
          workstation_id?: string | null
        }
        Update: {
          asset_tag?: string
          cpu?: string | null
          created_at?: string
          display_name?: string | null
          equipment_type?: Database["public"]["Enums"]["equipment_type"]
          gpu?: string | null
          id?: string
          lifecycle_state?: Database["public"]["Enums"]["equipment_lifecycle_state"]
          maintenance_interval_months?: number | null
          maintenance_overdue_notified_for?: string | null
          maintenance_upcoming_notified_for?: string | null
          manufacturer?: string | null
          model?: string | null
          next_maintenance_due_date?: string | null
          notes?: string | null
          pc_configuration?: Json | null
          ram?: string | null
          recurring_maintenance_enabled?: boolean
          serial_number?: string | null
          storage?: string | null
          studio_id?: string
          updated_at?: string
          workstation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipment_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_studio_id_workstation_id_fkey"
            columns: ["studio_id", "workstation_id"]
            isOneToOne: false
            referencedRelation: "workstations"
            referencedColumns: ["studio_id", "id"]
          },
        ]
      }
      equipment_catalog_manufacturers: {
        Row: {
          catalog_type: string
          name: string
          popularity: number
          product_count: number
          search_name: string | null
        }
        Insert: {
          catalog_type: string
          name: string
          popularity: number
          product_count: number
          search_name?: string | null
        }
        Update: {
          catalog_type?: string
          name?: string
          popularity?: number
          product_count?: number
          search_name?: string | null
        }
        Relationships: []
      }
      equipment_catalog_models: {
        Row: {
          catalog_type: string
          family: string | null
          first_seen_at: string
          id: number
          is_current: boolean
          last_seen_at: string
          manufacturer: string
          model: string
          on_market: boolean | null
          popularity: number
          provider_product_count: number
          search_family: string | null
          search_manufacturer: string | null
          search_model: string | null
          source_updated_at: string
        }
        Insert: {
          catalog_type: string
          family?: string | null
          first_seen_at?: string
          id?: never
          is_current?: boolean
          last_seen_at?: string
          manufacturer: string
          model: string
          on_market?: boolean | null
          popularity?: number
          provider_product_count?: number
          search_family?: string | null
          search_manufacturer?: string | null
          search_model?: string | null
          source_updated_at: string
        }
        Update: {
          catalog_type?: string
          family?: string | null
          first_seen_at?: string
          id?: never
          is_current?: boolean
          last_seen_at?: string
          manufacturer?: string
          model?: string
          on_market?: boolean | null
          popularity?: number
          provider_product_count?: number
          search_family?: string | null
          search_manufacturer?: string | null
          search_model?: string | null
          source_updated_at?: string
        }
        Relationships: []
      }
      equipment_catalog_provider_products: {
        Row: {
          catalog_model_id: number
          first_seen_at: string
          is_current: boolean
          last_seen_at: string
          on_market: boolean | null
          popularity: number
          source: string
          source_product_id: string
          source_seen_at: string
          source_updated_at: string
        }
        Insert: {
          catalog_model_id: number
          first_seen_at?: string
          is_current?: boolean
          last_seen_at?: string
          on_market?: boolean | null
          popularity?: number
          source: string
          source_product_id: string
          source_seen_at: string
          source_updated_at: string
        }
        Update: {
          catalog_model_id?: number
          first_seen_at?: string
          is_current?: boolean
          last_seen_at?: string
          on_market?: boolean | null
          popularity?: number
          source?: string
          source_product_id?: string
          source_seen_at?: string
          source_updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_catalog_provider_products_catalog_model_id_fkey"
            columns: ["catalog_model_id"]
            isOneToOne: false
            referencedRelation: "equipment_catalog_models"
            referencedColumns: ["id"]
          },
        ]
      }
      equipment_catalog_sync_state: {
        Row: {
          completed_generation: string | null
          last_completed_at: string | null
          last_error: string | null
          last_started_at: string | null
          lease_until: string | null
          run_id: string | null
          source: string
        }
        Insert: {
          completed_generation?: string | null
          last_completed_at?: string | null
          last_error?: string | null
          last_started_at?: string | null
          lease_until?: string | null
          run_id?: string | null
          source: string
        }
        Update: {
          completed_generation?: string | null
          last_completed_at?: string | null
          last_error?: string | null
          last_started_at?: string | null
          lease_until?: string | null
          run_id?: string | null
          source?: string
        }
        Relationships: []
      }
      equipment_service_events: {
        Row: {
          completed_on: string | null
          completion_notes: string | null
          cost_amount: number | null
          cost_currency: string | null
          created_at: string
          equipment_id: string
          event_type: Database["public"]["Enums"]["equipment_service_event_type"]
          id: string
          service_provider: string | null
          started_notes: string | null
          started_on: string
          studio_id: string
          updated_at: string
        }
        Insert: {
          completed_on?: string | null
          completion_notes?: string | null
          cost_amount?: number | null
          cost_currency?: string | null
          created_at?: string
          equipment_id: string
          event_type: Database["public"]["Enums"]["equipment_service_event_type"]
          id?: string
          service_provider?: string | null
          started_notes?: string | null
          started_on: string
          studio_id: string
          updated_at?: string
        }
        Update: {
          completed_on?: string | null
          completion_notes?: string | null
          cost_amount?: number | null
          cost_currency?: string | null
          created_at?: string
          equipment_id?: string
          event_type?: Database["public"]["Enums"]["equipment_service_event_type"]
          id?: string
          service_provider?: string | null
          started_notes?: string | null
          started_on?: string
          studio_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_service_events_equipment_studio_fkey"
            columns: ["studio_id", "equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "equipment_service_events_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_accounts: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string
          currency: string
          id: string
          name: string
          opening_balance: number
          opening_fx_effective_date: string | null
          opening_fx_rate: number | null
          opening_fx_source: string | null
          opening_reporting_amount: number | null
          opening_valued_at: string | null
          opening_valued_by: string | null
          studio_id: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by: string
          currency: string
          id?: string
          name: string
          opening_balance?: number
          opening_fx_effective_date?: string | null
          opening_fx_rate?: number | null
          opening_fx_source?: string | null
          opening_reporting_amount?: number | null
          opening_valued_at?: string | null
          opening_valued_by?: string | null
          studio_id: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string
          currency?: string
          id?: string
          name?: string
          opening_balance?: number
          opening_fx_effective_date?: string | null
          opening_fx_rate?: number | null
          opening_fx_source?: string | null
          opening_reporting_amount?: number | null
          opening_valued_at?: string | null
          opening_valued_by?: string | null
          studio_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_accounts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_accounts_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "finance_currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "finance_accounts_opening_valued_by_fkey"
            columns: ["opening_valued_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_accounts_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "finance_settings"
            referencedColumns: ["studio_id"]
          },
        ]
      }
      finance_allocations: {
        Row: {
          amount: number
          cause_movement_id: string | null
          created_at: string
          created_by: string
          expected_item_id: string
          id: string
          movement_id: string
          reason: string
          released_allocation_id: string | null
          studio_id: string
        }
        Insert: {
          amount: number
          cause_movement_id?: string | null
          created_at?: string
          created_by: string
          expected_item_id: string
          id?: string
          movement_id: string
          reason?: string
          released_allocation_id?: string | null
          studio_id: string
        }
        Update: {
          amount?: number
          cause_movement_id?: string | null
          created_at?: string
          created_by?: string
          expected_item_id?: string
          id?: string
          movement_id?: string
          reason?: string
          released_allocation_id?: string | null
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_allocations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_allocations_studio_id_cause_movement_id_fkey"
            columns: ["studio_id", "cause_movement_id"]
            isOneToOne: false
            referencedRelation: "finance_actionable_unapplied"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_allocations_studio_id_cause_movement_id_fkey"
            columns: ["studio_id", "cause_movement_id"]
            isOneToOne: false
            referencedRelation: "finance_movements"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_allocations_studio_id_cause_movement_id_fkey"
            columns: ["studio_id", "cause_movement_id"]
            isOneToOne: false
            referencedRelation: "finance_payment_availability"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_allocations_studio_id_expected_item_id_fkey"
            columns: ["studio_id", "expected_item_id"]
            isOneToOne: false
            referencedRelation: "finance_expected_balances"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_allocations_studio_id_expected_item_id_fkey"
            columns: ["studio_id", "expected_item_id"]
            isOneToOne: false
            referencedRelation: "finance_expected_items"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_allocations_studio_id_expected_item_id_fkey"
            columns: ["studio_id", "expected_item_id"]
            isOneToOne: false
            referencedRelation: "finance_payroll_calendar"
            referencedColumns: ["studio_id", "expected_item_id"]
          },
          {
            foreignKeyName: "finance_allocations_studio_id_expected_item_id_fkey"
            columns: ["studio_id", "expected_item_id"]
            isOneToOne: false
            referencedRelation: "finance_project_expected_balances"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_allocations_studio_id_expected_item_id_fkey"
            columns: ["studio_id", "expected_item_id"]
            isOneToOne: false
            referencedRelation: "finance_project_plan_items"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_allocations_studio_id_movement_id_fkey"
            columns: ["studio_id", "movement_id"]
            isOneToOne: false
            referencedRelation: "finance_actionable_unapplied"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_allocations_studio_id_movement_id_fkey"
            columns: ["studio_id", "movement_id"]
            isOneToOne: false
            referencedRelation: "finance_movements"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_allocations_studio_id_movement_id_fkey"
            columns: ["studio_id", "movement_id"]
            isOneToOne: false
            referencedRelation: "finance_payment_availability"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_allocations_studio_id_released_allocation_id_expec_fkey"
            columns: [
              "studio_id",
              "released_allocation_id",
              "expected_item_id",
              "movement_id",
            ]
            isOneToOne: false
            referencedRelation: "finance_allocations"
            referencedColumns: [
              "studio_id",
              "id",
              "expected_item_id",
              "movement_id",
            ]
          },
        ]
      }
      finance_budget_revisions: {
        Row: {
          category_id: string
          created_at: string
          created_by: string
          currency: string
          id: string
          months: number[]
          reason: string
          revision: number
          studio_id: string
          year: number
        }
        Insert: {
          category_id: string
          created_at?: string
          created_by: string
          currency: string
          id?: string
          months: number[]
          reason: string
          revision: number
          studio_id: string
          year: number
        }
        Update: {
          category_id?: string
          created_at?: string
          created_by?: string
          currency?: string
          id?: string
          months?: number[]
          reason?: string
          revision?: number
          studio_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "finance_budget_revisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_budget_revisions_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "finance_currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "finance_budget_revisions_studio_id_category_id_fkey"
            columns: ["studio_id", "category_id"]
            isOneToOne: false
            referencedRelation: "finance_categories"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_budget_revisions_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "finance_settings"
            referencedColumns: ["studio_id"]
          },
        ]
      }
      finance_categories: {
        Row: {
          archived_at: string | null
          created_at: string
          custom_name: boolean
          default_key: string | null
          direction: string
          id: string
          name: string
          nature: string
          studio_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          custom_name?: boolean
          default_key?: string | null
          direction: string
          id?: string
          name: string
          nature: string
          studio_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          custom_name?: boolean
          default_key?: string | null
          direction?: string
          id?: string
          name?: string
          nature?: string
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_categories_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "finance_settings"
            referencedColumns: ["studio_id"]
          },
        ]
      }
      finance_currencies: {
        Row: {
          code: string
          minor_units: number
        }
        Insert: {
          code: string
          minor_units: number
        }
        Update: {
          code?: string
          minor_units?: number
        }
        Relationships: []
      }
      finance_expected_items: {
        Row: {
          amount: number
          category_id: string
          certainty: string
          commitment: string
          created_at: string
          created_by: string
          currency: string
          description: string
          direction: string
          due_date: string | null
          expected_payment_date: string | null
          id: string
          is_established: boolean
          studio_id: string
          updated_at: string
          version: number
        }
        Insert: {
          amount: number
          category_id: string
          certainty: string
          commitment: string
          created_at?: string
          created_by: string
          currency: string
          description?: string
          direction: string
          due_date?: string | null
          expected_payment_date?: string | null
          id?: string
          is_established?: boolean
          studio_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          amount?: number
          category_id?: string
          certainty?: string
          commitment?: string
          created_at?: string
          created_by?: string
          currency?: string
          description?: string
          direction?: string
          due_date?: string | null
          expected_payment_date?: string | null
          id?: string
          is_established?: boolean
          studio_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "finance_expected_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_expected_items_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "finance_currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "finance_expected_items_studio_id_category_id_fkey"
            columns: ["studio_id", "category_id"]
            isOneToOne: false
            referencedRelation: "finance_categories"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_expected_items_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "finance_settings"
            referencedColumns: ["studio_id"]
          },
        ]
      }
      finance_forecast_snapshots: {
        Row: {
          capture_order: number | null
          created_at: string
          created_by: string
          forecast: Json
          id: string
          name: string
          studio_id: string
        }
        Insert: {
          capture_order?: number | null
          created_at?: string
          created_by: string
          forecast: Json
          id?: string
          name: string
          studio_id: string
        }
        Update: {
          capture_order?: number | null
          created_at?: string
          created_by?: string
          forecast?: Json
          id?: string
          name?: string
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_forecast_snapshots_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_forecast_snapshots_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "finance_settings"
            referencedColumns: ["studio_id"]
          },
        ]
      }
      finance_movement_entries: {
        Row: {
          account_id: string
          amount: number
          currency: string
          entry_role: string
          fx_effective_date: string
          fx_rate: number
          fx_source: string
          id: string
          movement_id: string
          reporting_amount: number
          reporting_currency: string
          studio_id: string
        }
        Insert: {
          account_id: string
          amount: number
          currency: string
          entry_role: string
          fx_effective_date: string
          fx_rate: number
          fx_source: string
          id?: string
          movement_id: string
          reporting_amount: number
          reporting_currency: string
          studio_id: string
        }
        Update: {
          account_id?: string
          amount?: number
          currency?: string
          entry_role?: string
          fx_effective_date?: string
          fx_rate?: number
          fx_source?: string
          id?: string
          movement_id?: string
          reporting_amount?: number
          reporting_currency?: string
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_movement_entries_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "finance_currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "finance_movement_entries_reporting_currency_fkey"
            columns: ["reporting_currency"]
            isOneToOne: false
            referencedRelation: "finance_currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "finance_movement_entries_studio_id_account_id_currency_fkey"
            columns: ["studio_id", "account_id", "currency"]
            isOneToOne: false
            referencedRelation: "finance_account_balances"
            referencedColumns: ["studio_id", "id", "currency"]
          },
          {
            foreignKeyName: "finance_movement_entries_studio_id_account_id_currency_fkey"
            columns: ["studio_id", "account_id", "currency"]
            isOneToOne: false
            referencedRelation: "finance_accounts"
            referencedColumns: ["studio_id", "id", "currency"]
          },
          {
            foreignKeyName: "finance_movement_entries_studio_id_account_id_fkey"
            columns: ["studio_id", "account_id"]
            isOneToOne: false
            referencedRelation: "finance_account_balances"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_movement_entries_studio_id_account_id_fkey"
            columns: ["studio_id", "account_id"]
            isOneToOne: false
            referencedRelation: "finance_accounts"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_movement_entries_studio_id_movement_id_fkey"
            columns: ["studio_id", "movement_id"]
            isOneToOne: false
            referencedRelation: "finance_actionable_unapplied"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_movement_entries_studio_id_movement_id_fkey"
            columns: ["studio_id", "movement_id"]
            isOneToOne: false
            referencedRelation: "finance_movements"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_movement_entries_studio_id_movement_id_fkey"
            columns: ["studio_id", "movement_id"]
            isOneToOne: false
            referencedRelation: "finance_payment_availability"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_movement_entries_studio_id_reporting_currency_fkey"
            columns: ["studio_id", "reporting_currency"]
            isOneToOne: false
            referencedRelation: "finance_settings"
            referencedColumns: ["studio_id", "base_currency"]
          },
        ]
      }
      finance_movements: {
        Row: {
          category: string
          category_id: string | null
          created_at: string
          created_by: string
          description: string
          financial_date: string
          id: string
          kind: string
          nature: string
          posting_order: number
          related_movement_id: string | null
          request_id: string
          request_payload: Json
          studio_id: string
        }
        Insert: {
          category: string
          category_id?: string | null
          created_at?: string
          created_by: string
          description?: string
          financial_date: string
          id?: string
          kind: string
          nature: string
          posting_order?: number
          related_movement_id?: string | null
          request_id: string
          request_payload: Json
          studio_id: string
        }
        Update: {
          category?: string
          category_id?: string | null
          created_at?: string
          created_by?: string
          description?: string
          financial_date?: string
          id?: string
          kind?: string
          nature?: string
          posting_order?: number
          related_movement_id?: string | null
          request_id?: string
          request_payload?: Json
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_movements_studio_id_category_id_fkey"
            columns: ["studio_id", "category_id"]
            isOneToOne: false
            referencedRelation: "finance_categories"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_movements_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "finance_settings"
            referencedColumns: ["studio_id"]
          },
          {
            foreignKeyName: "finance_movements_studio_id_related_movement_id_fkey"
            columns: ["studio_id", "related_movement_id"]
            isOneToOne: false
            referencedRelation: "finance_actionable_unapplied"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_movements_studio_id_related_movement_id_fkey"
            columns: ["studio_id", "related_movement_id"]
            isOneToOne: false
            referencedRelation: "finance_movements"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_movements_studio_id_related_movement_id_fkey"
            columns: ["studio_id", "related_movement_id"]
            isOneToOne: false
            referencedRelation: "finance_payment_availability"
            referencedColumns: ["studio_id", "id"]
          },
        ]
      }
      finance_obligation_items: {
        Row: {
          component: string
          expected_item_id: string
          managed_active: boolean
          obligation_id: string
          studio_id: string
        }
        Insert: {
          component: string
          expected_item_id: string
          managed_active?: boolean
          obligation_id: string
          studio_id: string
        }
        Update: {
          component?: string
          expected_item_id?: string
          managed_active?: boolean
          obligation_id?: string
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_obligation_items_studio_id_expected_item_id_fkey"
            columns: ["studio_id", "expected_item_id"]
            isOneToOne: true
            referencedRelation: "finance_expected_balances"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_obligation_items_studio_id_expected_item_id_fkey"
            columns: ["studio_id", "expected_item_id"]
            isOneToOne: true
            referencedRelation: "finance_expected_items"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_obligation_items_studio_id_expected_item_id_fkey"
            columns: ["studio_id", "expected_item_id"]
            isOneToOne: true
            referencedRelation: "finance_payroll_calendar"
            referencedColumns: ["studio_id", "expected_item_id"]
          },
          {
            foreignKeyName: "finance_obligation_items_studio_id_expected_item_id_fkey"
            columns: ["studio_id", "expected_item_id"]
            isOneToOne: true
            referencedRelation: "finance_project_expected_balances"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_obligation_items_studio_id_expected_item_id_fkey"
            columns: ["studio_id", "expected_item_id"]
            isOneToOne: true
            referencedRelation: "finance_project_plan_items"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_obligation_items_studio_id_obligation_id_fkey"
            columns: ["studio_id", "obligation_id"]
            isOneToOne: false
            referencedRelation: "finance_obligations"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_obligation_items_studio_id_obligation_id_fkey"
            columns: ["studio_id", "obligation_id"]
            isOneToOne: false
            referencedRelation: "finance_payroll_unknown_costs"
            referencedColumns: ["studio_id", "obligation_id"]
          },
        ]
      }
      finance_obligations: {
        Row: {
          created_at: string
          created_by: string
          employee_id: string | null
          employee_name: string | null
          id: string
          kind: string
          period_end: string
          period_start: string
          schedule_id: string | null
          studio_id: string
          terms_id: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          employee_id?: string | null
          employee_name?: string | null
          id?: string
          kind: string
          period_end: string
          period_start: string
          schedule_id?: string | null
          studio_id: string
          terms_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          employee_id?: string | null
          employee_name?: string | null
          id?: string
          kind?: string
          period_end?: string
          period_start?: string
          schedule_id?: string | null
          studio_id?: string
          terms_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_obligations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_obligations_studio_id_employee_id_fkey"
            columns: ["studio_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "studio_members"
            referencedColumns: ["studio_id", "user_id"]
          },
          {
            foreignKeyName: "finance_obligations_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "finance_settings"
            referencedColumns: ["studio_id"]
          },
          {
            foreignKeyName: "finance_obligations_studio_id_terms_id_schedule_id_fkey"
            columns: ["studio_id", "terms_id", "schedule_id"]
            isOneToOne: false
            referencedRelation: "finance_schedule_history"
            referencedColumns: ["studio_id", "id", "schedule_id"]
          },
          {
            foreignKeyName: "finance_obligations_studio_id_terms_id_schedule_id_fkey"
            columns: ["studio_id", "terms_id", "schedule_id"]
            isOneToOne: false
            referencedRelation: "finance_schedule_terms"
            referencedColumns: ["studio_id", "id", "schedule_id"]
          },
        ]
      }
      finance_payroll_cost_revisions: {
        Row: {
          amount: number | null
          component: string
          created_at: string
          created_by: string
          id: string
          obligation_id: string
          reason: string
          revision: number
          status: string
          studio_id: string
        }
        Insert: {
          amount?: number | null
          component: string
          created_at?: string
          created_by: string
          id?: string
          obligation_id: string
          reason: string
          revision: number
          status: string
          studio_id: string
        }
        Update: {
          amount?: number | null
          component?: string
          created_at?: string
          created_by?: string
          id?: string
          obligation_id?: string
          reason?: string
          revision?: number
          status?: string
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_payroll_cost_revisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_payroll_cost_revisions_studio_id_obligation_id_fkey"
            columns: ["studio_id", "obligation_id"]
            isOneToOne: false
            referencedRelation: "finance_obligations"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_payroll_cost_revisions_studio_id_obligation_id_fkey"
            columns: ["studio_id", "obligation_id"]
            isOneToOne: false
            referencedRelation: "finance_payroll_unknown_costs"
            referencedColumns: ["studio_id", "obligation_id"]
          },
        ]
      }
      finance_planning_requests: {
        Row: {
          created_at: string
          created_by: string
          payload: Json
          request_id: string
          result_id: string
          studio_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          payload: Json
          request_id: string
          result_id: string
          studio_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          payload?: Json
          request_id?: string
          result_id?: string
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_planning_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_planning_requests_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "finance_settings"
            referencedColumns: ["studio_id"]
          },
        ]
      }
      finance_project_items: {
        Row: {
          context_label: string
          contractor_id: string | null
          expected_item_id: string
          extra_visit: boolean
          period_start: string | null
          project_id: string
          source: string
          stream: string
          studio_id: string
          terms_id: string | null
          visit_id: string | null
        }
        Insert: {
          context_label?: string
          contractor_id?: string | null
          expected_item_id: string
          extra_visit?: boolean
          period_start?: string | null
          project_id: string
          source?: string
          stream: string
          studio_id: string
          terms_id?: string | null
          visit_id?: string | null
        }
        Update: {
          context_label?: string
          contractor_id?: string | null
          expected_item_id?: string
          extra_visit?: boolean
          period_start?: string | null
          project_id?: string
          source?: string
          stream?: string
          studio_id?: string
          terms_id?: string | null
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_project_items_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_project_items_project_id_studio_id_fkey"
            columns: ["project_id", "studio_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "studio_id"]
          },
          {
            foreignKeyName: "finance_project_items_studio_id_expected_item_id_fkey"
            columns: ["studio_id", "expected_item_id"]
            isOneToOne: true
            referencedRelation: "finance_expected_balances"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_project_items_studio_id_expected_item_id_fkey"
            columns: ["studio_id", "expected_item_id"]
            isOneToOne: true
            referencedRelation: "finance_expected_items"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_project_items_studio_id_expected_item_id_fkey"
            columns: ["studio_id", "expected_item_id"]
            isOneToOne: true
            referencedRelation: "finance_payroll_calendar"
            referencedColumns: ["studio_id", "expected_item_id"]
          },
          {
            foreignKeyName: "finance_project_items_studio_id_expected_item_id_fkey"
            columns: ["studio_id", "expected_item_id"]
            isOneToOne: true
            referencedRelation: "finance_project_expected_balances"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_project_items_studio_id_expected_item_id_fkey"
            columns: ["studio_id", "expected_item_id"]
            isOneToOne: true
            referencedRelation: "finance_project_plan_items"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_project_items_studio_id_terms_id_project_id_fkey"
            columns: ["studio_id", "terms_id", "project_id"]
            isOneToOne: false
            referencedRelation: "finance_project_current_terms"
            referencedColumns: ["studio_id", "id", "project_id"]
          },
          {
            foreignKeyName: "finance_project_items_studio_id_terms_id_project_id_fkey"
            columns: ["studio_id", "terms_id", "project_id"]
            isOneToOne: false
            referencedRelation: "finance_project_terms"
            referencedColumns: ["studio_id", "id", "project_id"]
          },
          {
            foreignKeyName: "finance_project_items_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_project_plan_revisions: {
        Row: {
          area_snapshot: number | null
          item_order: string[]
          pricing_method: string
          project_id: string
          rate_per_m2: number | null
          studio_id: string
          terms_id: string
        }
        Insert: {
          area_snapshot?: number | null
          item_order?: string[]
          pricing_method: string
          project_id: string
          rate_per_m2?: number | null
          studio_id: string
          terms_id: string
        }
        Update: {
          area_snapshot?: number | null
          item_order?: string[]
          pricing_method?: string
          project_id?: string
          rate_per_m2?: number | null
          studio_id?: string
          terms_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_project_plan_revision_studio_id_terms_id_project_i_fkey"
            columns: ["studio_id", "terms_id", "project_id"]
            isOneToOne: false
            referencedRelation: "finance_project_current_terms"
            referencedColumns: ["studio_id", "id", "project_id"]
          },
          {
            foreignKeyName: "finance_project_plan_revision_studio_id_terms_id_project_i_fkey"
            columns: ["studio_id", "terms_id", "project_id"]
            isOneToOne: false
            referencedRelation: "finance_project_terms"
            referencedColumns: ["studio_id", "id", "project_id"]
          },
        ]
      }
      finance_project_terms: {
        Row: {
          amount: number | null
          created_at: string
          created_by: string
          currency: string
          effective_from: string | null
          effective_through: string | null
          id: string
          mode: string
          project_id: string
          reason: string
          revision: number
          stream: string
          studio_id: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          created_by: string
          currency: string
          effective_from?: string | null
          effective_through?: string | null
          id?: string
          mode: string
          project_id: string
          reason: string
          revision: number
          stream: string
          studio_id: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          created_by?: string
          currency?: string
          effective_from?: string | null
          effective_through?: string | null
          id?: string
          mode?: string
          project_id?: string
          reason?: string
          revision?: number
          stream?: string
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_project_terms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_project_terms_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "finance_currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "finance_project_terms_project_id_studio_id_fkey"
            columns: ["project_id", "studio_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "studio_id"]
          },
          {
            foreignKeyName: "finance_project_terms_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "finance_settings"
            referencedColumns: ["studio_id"]
          },
        ]
      }
      finance_recurring_groups: {
        Row: {
          id: string
          name: string
          position: number
          studio_id: string
        }
        Insert: {
          id?: string
          name: string
          position: number
          studio_id: string
        }
        Update: {
          id?: string
          name?: string
          position?: number
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_recurring_groups_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "finance_settings"
            referencedColumns: ["studio_id"]
          },
        ]
      }
      finance_schedule_terms: {
        Row: {
          amount: number
          basis: string | null
          category_id: string
          certainty: string
          commitment: string
          created_at: string
          created_by: string
          currency: string
          effective_from: string
          effective_through: string | null
          employee_deductions: number | null
          employee_payout: number | null
          employer_cost: number | null
          employer_cost_status: string
          id: string
          interval_months: number
          name: string
          payment_month_offset: number
          payout_day: number
          reason: string
          revision: number
          schedule_id: string
          studio_id: string
        }
        Insert: {
          amount: number
          basis?: string | null
          category_id: string
          certainty: string
          commitment: string
          created_at?: string
          created_by: string
          currency: string
          effective_from: string
          effective_through?: string | null
          employee_deductions?: number | null
          employee_payout?: number | null
          employer_cost?: number | null
          employer_cost_status?: string
          id?: string
          interval_months: number
          name: string
          payment_month_offset?: number
          payout_day: number
          reason: string
          revision: number
          schedule_id: string
          studio_id: string
        }
        Update: {
          amount?: number
          basis?: string | null
          category_id?: string
          certainty?: string
          commitment?: string
          created_at?: string
          created_by?: string
          currency?: string
          effective_from?: string
          effective_through?: string | null
          employee_deductions?: number | null
          employee_payout?: number | null
          employer_cost?: number | null
          employer_cost_status?: string
          id?: string
          interval_months?: number
          name?: string
          payment_month_offset?: number
          payout_day?: number
          reason?: string
          revision?: number
          schedule_id?: string
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_schedule_terms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_schedule_terms_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "finance_currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "finance_schedule_terms_studio_id_category_id_fkey"
            columns: ["studio_id", "category_id"]
            isOneToOne: false
            referencedRelation: "finance_categories"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_schedule_terms_studio_id_schedule_id_fkey"
            columns: ["studio_id", "schedule_id"]
            isOneToOne: false
            referencedRelation: "finance_schedules"
            referencedColumns: ["studio_id", "id"]
          },
        ]
      }
      finance_schedules: {
        Row: {
          created_at: string
          created_by: string
          employee_id: string | null
          group_id: string | null
          id: string
          kind: string
          stopped_from: string | null
          studio_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          employee_id?: string | null
          group_id?: string | null
          id?: string
          kind: string
          stopped_from?: string | null
          studio_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          employee_id?: string | null
          group_id?: string | null
          id?: string
          kind?: string
          stopped_from?: string | null
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_schedule_group_studio_fkey"
            columns: ["studio_id", "group_id"]
            isOneToOne: false
            referencedRelation: "finance_recurring_groups"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_schedules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_schedules_studio_id_employee_id_fkey"
            columns: ["studio_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "studio_members"
            referencedColumns: ["studio_id", "user_id"]
          },
          {
            foreignKeyName: "finance_schedules_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "finance_settings"
            referencedColumns: ["studio_id"]
          },
        ]
      }
      finance_settings: {
        Row: {
          base_currency: string
          created_at: string
          created_by: string
          cutover_date: string
          finalized_at: string | null
          finalized_by: string | null
          studio_id: string
          updated_at: string
        }
        Insert: {
          base_currency: string
          created_at?: string
          created_by: string
          cutover_date: string
          finalized_at?: string | null
          finalized_by?: string | null
          studio_id: string
          updated_at?: string
        }
        Update: {
          base_currency?: string
          created_at?: string
          created_by?: string
          cutover_date?: string
          finalized_at?: string | null
          finalized_by?: string | null
          studio_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_settings_base_currency_fkey"
            columns: ["base_currency"]
            isOneToOne: false
            referencedRelation: "finance_currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "finance_settings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_settings_finalized_by_fkey"
            columns: ["finalized_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_settings_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: true
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_trip_balances: {
        Row: {
          currency: string
          direction: string
          employee_id: string
          expected_item_id: string
          studio_id: string
          trip_id: string
        }
        Insert: {
          currency: string
          direction: string
          employee_id: string
          expected_item_id: string
          studio_id: string
          trip_id: string
        }
        Update: {
          currency?: string
          direction?: string
          employee_id?: string
          expected_item_id?: string
          studio_id?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_trip_balances_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "finance_currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "finance_trip_balances_studio_id_expected_item_id_fkey"
            columns: ["studio_id", "expected_item_id"]
            isOneToOne: true
            referencedRelation: "finance_expected_balances"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_trip_balances_studio_id_expected_item_id_fkey"
            columns: ["studio_id", "expected_item_id"]
            isOneToOne: true
            referencedRelation: "finance_expected_items"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_trip_balances_studio_id_expected_item_id_fkey"
            columns: ["studio_id", "expected_item_id"]
            isOneToOne: true
            referencedRelation: "finance_payroll_calendar"
            referencedColumns: ["studio_id", "expected_item_id"]
          },
          {
            foreignKeyName: "finance_trip_balances_studio_id_expected_item_id_fkey"
            columns: ["studio_id", "expected_item_id"]
            isOneToOne: true
            referencedRelation: "finance_project_expected_balances"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_trip_balances_studio_id_expected_item_id_fkey"
            columns: ["studio_id", "expected_item_id"]
            isOneToOne: true
            referencedRelation: "finance_project_plan_items"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_trip_balances_studio_id_trip_id_employee_id_fkey"
            columns: ["studio_id", "trip_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "finance_trip_travelers"
            referencedColumns: ["studio_id", "trip_id", "employee_id"]
          },
        ]
      }
      finance_trip_entries: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          currency: string
          daily_rate: number | null
          day_count: number | null
          employee_id: string | null
          expected_item_id: string | null
          expense_type: string
          financial_date: string
          fx_effective_date: string | null
          fx_rate: number | null
          fx_source: string | null
          id: string
          kind: string
          label: string
          movement_id: string | null
          note: string
          plan_id: string | null
          reporting_amount: number | null
          reporting_currency: string
          reverses_id: string | null
          studio_id: string
          traveler_count: number
          trip_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by: string
          currency: string
          daily_rate?: number | null
          day_count?: number | null
          employee_id?: string | null
          expected_item_id?: string | null
          expense_type: string
          financial_date: string
          fx_effective_date?: string | null
          fx_rate?: number | null
          fx_source?: string | null
          id?: string
          kind: string
          label?: string
          movement_id?: string | null
          note?: string
          plan_id?: string | null
          reporting_amount?: number | null
          reporting_currency: string
          reverses_id?: string | null
          studio_id: string
          traveler_count?: number
          trip_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          currency?: string
          daily_rate?: number | null
          day_count?: number | null
          employee_id?: string | null
          expected_item_id?: string | null
          expense_type?: string
          financial_date?: string
          fx_effective_date?: string | null
          fx_rate?: number | null
          fx_source?: string | null
          id?: string
          kind?: string
          label?: string
          movement_id?: string | null
          note?: string
          plan_id?: string | null
          reporting_amount?: number | null
          reporting_currency?: string
          reverses_id?: string | null
          studio_id?: string
          traveler_count?: number
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_trip_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_trip_entries_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "finance_currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "finance_trip_entries_studio_id_expected_item_id_fkey"
            columns: ["studio_id", "expected_item_id"]
            isOneToOne: false
            referencedRelation: "finance_expected_balances"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_trip_entries_studio_id_expected_item_id_fkey"
            columns: ["studio_id", "expected_item_id"]
            isOneToOne: false
            referencedRelation: "finance_expected_items"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_trip_entries_studio_id_expected_item_id_fkey"
            columns: ["studio_id", "expected_item_id"]
            isOneToOne: false
            referencedRelation: "finance_payroll_calendar"
            referencedColumns: ["studio_id", "expected_item_id"]
          },
          {
            foreignKeyName: "finance_trip_entries_studio_id_expected_item_id_fkey"
            columns: ["studio_id", "expected_item_id"]
            isOneToOne: false
            referencedRelation: "finance_project_expected_balances"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_trip_entries_studio_id_expected_item_id_fkey"
            columns: ["studio_id", "expected_item_id"]
            isOneToOne: false
            referencedRelation: "finance_project_plan_items"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_trip_entries_studio_id_movement_id_fkey"
            columns: ["studio_id", "movement_id"]
            isOneToOne: true
            referencedRelation: "finance_actionable_unapplied"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_trip_entries_studio_id_movement_id_fkey"
            columns: ["studio_id", "movement_id"]
            isOneToOne: true
            referencedRelation: "finance_movements"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_trip_entries_studio_id_movement_id_fkey"
            columns: ["studio_id", "movement_id"]
            isOneToOne: true
            referencedRelation: "finance_payment_availability"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_trip_entries_studio_id_plan_id_trip_id_fkey"
            columns: ["studio_id", "plan_id", "trip_id"]
            isOneToOne: false
            referencedRelation: "finance_trip_entries"
            referencedColumns: ["studio_id", "id", "trip_id"]
          },
          {
            foreignKeyName: "finance_trip_entries_studio_id_plan_id_trip_id_fkey"
            columns: ["studio_id", "plan_id", "trip_id"]
            isOneToOne: false
            referencedRelation: "finance_trip_entry_values"
            referencedColumns: ["studio_id", "id", "trip_id"]
          },
          {
            foreignKeyName: "finance_trip_entries_studio_id_reporting_currency_fkey"
            columns: ["studio_id", "reporting_currency"]
            isOneToOne: false
            referencedRelation: "finance_settings"
            referencedColumns: ["studio_id", "base_currency"]
          },
          {
            foreignKeyName: "finance_trip_entries_studio_id_reverses_id_trip_id_fkey"
            columns: ["studio_id", "reverses_id", "trip_id"]
            isOneToOne: false
            referencedRelation: "finance_trip_entries"
            referencedColumns: ["studio_id", "id", "trip_id"]
          },
          {
            foreignKeyName: "finance_trip_entries_studio_id_reverses_id_trip_id_fkey"
            columns: ["studio_id", "reverses_id", "trip_id"]
            isOneToOne: false
            referencedRelation: "finance_trip_entry_values"
            referencedColumns: ["studio_id", "id", "trip_id"]
          },
          {
            foreignKeyName: "finance_trip_entries_studio_id_trip_id_employee_id_fkey"
            columns: ["studio_id", "trip_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "finance_trip_travelers"
            referencedColumns: ["studio_id", "trip_id", "employee_id"]
          },
          {
            foreignKeyName: "finance_trip_entries_studio_id_trip_id_fkey"
            columns: ["studio_id", "trip_id"]
            isOneToOne: false
            referencedRelation: "finance_trip_totals"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_trip_entries_studio_id_trip_id_fkey"
            columns: ["studio_id", "trip_id"]
            isOneToOne: false
            referencedRelation: "finance_trips"
            referencedColumns: ["studio_id", "id"]
          },
        ]
      }
      finance_trip_entry_travelers: {
        Row: {
          employee_id: string
          entry_id: string
          studio_id: string
          trip_id: string
        }
        Insert: {
          employee_id: string
          entry_id: string
          studio_id: string
          trip_id: string
        }
        Update: {
          employee_id?: string
          entry_id?: string
          studio_id?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_trip_entry_travelers_studio_id_entry_id_trip_id_fkey"
            columns: ["studio_id", "entry_id", "trip_id"]
            isOneToOne: false
            referencedRelation: "finance_trip_entries"
            referencedColumns: ["studio_id", "id", "trip_id"]
          },
          {
            foreignKeyName: "finance_trip_entry_travelers_studio_id_entry_id_trip_id_fkey"
            columns: ["studio_id", "entry_id", "trip_id"]
            isOneToOne: false
            referencedRelation: "finance_trip_entry_values"
            referencedColumns: ["studio_id", "id", "trip_id"]
          },
          {
            foreignKeyName: "finance_trip_entry_travelers_studio_id_trip_id_employee_id_fkey"
            columns: ["studio_id", "trip_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "finance_trip_travelers"
            referencedColumns: ["studio_id", "trip_id", "employee_id"]
          },
        ]
      }
      finance_trip_travelers: {
        Row: {
          active: boolean
          employee_id: string
          employee_name: string
          studio_id: string
          trip_id: string
        }
        Insert: {
          active?: boolean
          employee_id: string
          employee_name: string
          studio_id: string
          trip_id: string
        }
        Update: {
          active?: boolean
          employee_id?: string
          employee_name?: string
          studio_id?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_trip_travelers_studio_id_employee_id_fkey"
            columns: ["studio_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "studio_members"
            referencedColumns: ["studio_id", "user_id"]
          },
          {
            foreignKeyName: "finance_trip_travelers_studio_id_trip_id_fkey"
            columns: ["studio_id", "trip_id"]
            isOneToOne: false
            referencedRelation: "finance_trip_totals"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_trip_travelers_studio_id_trip_id_fkey"
            columns: ["studio_id", "trip_id"]
            isOneToOne: false
            referencedRelation: "finance_trips"
            referencedColumns: ["studio_id", "id"]
          },
        ]
      }
      finance_trips: {
        Row: {
          calendar_event_id: string | null
          calendar_source_id: string | null
          calendar_state: string | null
          created_at: string
          created_by: string
          destination: string
          ends_on: string
          id: string
          note: string
          project_id: string | null
          starts_on: string
          status: string
          studio_id: string
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          calendar_event_id?: string | null
          calendar_source_id?: string | null
          calendar_state?: string | null
          created_at?: string
          created_by: string
          destination: string
          ends_on: string
          id?: string
          note?: string
          project_id?: string | null
          starts_on: string
          status?: string
          studio_id: string
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          calendar_event_id?: string | null
          calendar_source_id?: string | null
          calendar_state?: string | null
          created_at?: string
          created_by?: string
          destination?: string
          ends_on?: string
          id?: string
          note?: string
          project_id?: string | null
          starts_on?: string
          status?: string
          studio_id?: string
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "finance_trips_calendar_event_fk"
            columns: ["studio_id", "calendar_event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_trips_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_trips_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "finance_settings"
            referencedColumns: ["studio_id"]
          },
          {
            foreignKeyName: "finance_trips_studio_id_project_id_fkey"
            columns: ["studio_id", "project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["studio_id", "id"]
          },
        ]
      }
      google_calendar_connections: {
        Row: {
          created_at: string
          google_account_email: string
          google_calendar_id: string
          google_calendar_name: string
          google_calendar_timezone: string
          granted_scopes: string[]
          id: string
          last_sync_at: string | null
          last_sync_error: string | null
          status: string
          studio_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          google_account_email: string
          google_calendar_id: string
          google_calendar_name: string
          google_calendar_timezone?: string
          granted_scopes?: string[]
          id?: string
          last_sync_at?: string | null
          last_sync_error?: string | null
          status?: string
          studio_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          google_account_email?: string
          google_calendar_id?: string
          google_calendar_name?: string
          google_calendar_timezone?: string
          granted_scopes?: string[]
          id?: string
          last_sync_at?: string | null
          last_sync_error?: string | null
          status?: string
          studio_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_calendar_connections_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_calendar_connections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      google_calendar_event_mappings: {
        Row: {
          connection_id: string
          created_at: string
          google_event_id: string
          id: string
          last_synced_at: string
          payload_hash: string
          root_source_event_id: string | null
          source_event_id: string | null
          source_key: string
          updated_at: string
        }
        Insert: {
          connection_id: string
          created_at?: string
          google_event_id: string
          id?: string
          last_synced_at?: string
          payload_hash: string
          root_source_event_id?: string | null
          source_event_id?: string | null
          source_key: string
          updated_at?: string
        }
        Update: {
          connection_id?: string
          created_at?: string
          google_event_id?: string
          id?: string
          last_synced_at?: string
          payload_hash?: string
          root_source_event_id?: string | null
          source_event_id?: string | null
          source_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_calendar_event_mappings_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "google_calendar_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_calendar_event_mappings_source_event_id_fkey"
            columns: ["source_event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
        ]
      }
      google_calendar_reconciliation_jobs: {
        Row: {
          attempts: number
          available_at: string
          created_at: string
          last_error: string | null
          locked_at: string | null
          revision: number
          source_event_id: string
          status: string
          studio_id: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          available_at?: string
          created_at?: string
          last_error?: string | null
          locked_at?: string | null
          revision?: number
          source_event_id: string
          status?: string
          studio_id: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          available_at?: string
          created_at?: string
          last_error?: string | null
          locked_at?: string | null
          revision?: number
          source_event_id?: string
          status?: string
          studio_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_calendar_reconciliation_jobs_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
        ]
      }
      google_calendar_server_credentials: {
        Row: {
          connection_id: string
          created_at: string
          encrypted_refresh_token: string
          updated_at: string
        }
        Insert: {
          connection_id: string
          created_at?: string
          encrypted_refresh_token: string
          updated_at?: string
        }
        Update: {
          connection_id?: string
          created_at?: string
          encrypted_refresh_token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_calendar_server_credentials_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: true
            referencedRelation: "google_calendar_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      leaderboard_bonus_rules: {
        Row: {
          bonus_percent: number
          created_at: string
          place: number
          studio_id: string
          updated_at: string
        }
        Insert: {
          bonus_percent: number
          created_at?: string
          place: number
          studio_id: string
          updated_at?: string
        }
        Update: {
          bonus_percent?: number
          created_at?: string
          place?: number
          studio_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leaderboard_bonus_rules_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
          body: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          href: string
          id: string
          metadata: Json
          notification_type: Database["public"]["Enums"]["notification_type"]
          read_at: string | null
          recipient_id: string
          studio_id: string
          title: string
        }
        Insert: {
          actor_id?: string | null
          body: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          href: string
          id?: string
          metadata?: Json
          notification_type: Database["public"]["Enums"]["notification_type"]
          read_at?: string | null
          recipient_id: string
          studio_id: string
          title: string
        }
        Update: {
          actor_id?: string | null
          body?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          href?: string
          id?: string
          metadata?: Json
          notification_type?: Database["public"]["Enums"]["notification_type"]
          read_at?: string | null
          recipient_id?: string
          studio_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
        ]
      }
      office_assignments: {
        Row: {
          created_at: string
          creator_id: string
          deadline: string | null
          description: string | null
          id: string
          priority: string
          responsible_id: string
          status: Database["public"]["Enums"]["office_assignment_status"]
          studio_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          creator_id: string
          deadline?: string | null
          description?: string | null
          id?: string
          priority?: string
          responsible_id: string
          status?: Database["public"]["Enums"]["office_assignment_status"]
          studio_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          creator_id?: string
          deadline?: string | null
          description?: string | null
          id?: string
          priority?: string
          responsible_id?: string
          status?: Database["public"]["Enums"]["office_assignment_status"]
          studio_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "office_assignments_studio_id_creator_id_fkey"
            columns: ["studio_id", "creator_id"]
            isOneToOne: false
            referencedRelation: "studio_members"
            referencedColumns: ["studio_id", "user_id"]
          },
          {
            foreignKeyName: "office_assignments_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "office_assignments_studio_id_responsible_id_fkey"
            columns: ["studio_id", "responsible_id"]
            isOneToOne: false
            referencedRelation: "studio_members"
            referencedColumns: ["studio_id", "user_id"]
          },
        ]
      }
      office_floor_plan_placements: {
        Row: {
          created_at: string
          display_metadata: Json
          equipment_id: string | null
          floor: number
          id: string
          studio_id: string
          updated_at: string
          workstation_id: string | null
          x: number
          y: number
        }
        Insert: {
          created_at?: string
          display_metadata?: Json
          equipment_id?: string | null
          floor: number
          id?: string
          studio_id: string
          updated_at?: string
          workstation_id?: string | null
          x: number
          y: number
        }
        Update: {
          created_at?: string
          display_metadata?: Json
          equipment_id?: string | null
          floor?: number
          id?: string
          studio_id?: string
          updated_at?: string
          workstation_id?: string | null
          x?: number
          y?: number
        }
        Relationships: [
          {
            foreignKeyName: "office_floor_plan_placements_studio_id_equipment_id_fkey"
            columns: ["studio_id", "equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "office_floor_plan_placements_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "office_floor_plan_placements_studio_id_workstation_id_fkey"
            columns: ["studio_id", "workstation_id"]
            isOneToOne: false
            referencedRelation: "workstations"
            referencedColumns: ["studio_id", "id"]
          },
        ]
      }
      productivity_attributions: {
        Row: {
          completed_at: string
          contributor_id: string
          contributor_job_title: string
          contributor_name: string
          created_at: string
          credited_area_m2: number
          id: string
          project_id: string
          source_type: string
          studio_id: string
          task_id: string | null
          task_stage: string | null
          voided_at: string | null
        }
        Insert: {
          completed_at?: string
          contributor_id: string
          contributor_job_title: string
          contributor_name: string
          created_at?: string
          credited_area_m2: number
          id?: string
          project_id: string
          source_type: string
          studio_id: string
          task_id?: string | null
          task_stage?: string | null
          voided_at?: string | null
        }
        Update: {
          completed_at?: string
          contributor_id?: string
          contributor_job_title?: string
          contributor_name?: string
          created_at?: string
          credited_area_m2?: number
          id?: string
          project_id?: string
          source_type?: string
          studio_id?: string
          task_id?: string | null
          task_stage?: string | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "productivity_attributions_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          birth_date: string | null
          city: string | null
          city_geonames_id: number | null
          country_code: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          job_title: string
          notification_popups_enabled: boolean
          notification_sound_enabled: boolean
          system_role: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          birth_date?: string | null
          city?: string | null
          city_geonames_id?: number | null
          country_code?: string | null
          created_at?: string
          email: string
          full_name: string
          id: string
          is_active?: boolean
          job_title?: string
          notification_popups_enabled?: boolean
          notification_sound_enabled?: boolean
          system_role?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          birth_date?: string | null
          city?: string | null
          city_geonames_id?: number | null
          country_code?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          job_title?: string
          notification_popups_enabled?: boolean
          notification_sound_enabled?: boolean
          system_role?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_activity: {
        Row: {
          action_type: string
          actor_id: string | null
          changes: Json
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          project_id: string
          studio_id: string
        }
        Insert: {
          action_type: string
          actor_id?: string | null
          changes?: Json
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          project_id: string
          studio_id: string
        }
        Update: {
          action_type?: string
          actor_id?: string | null
          changes?: Json
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          project_id?: string
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_activity_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_activity_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_activity_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
        ]
      }
      project_area_progress: {
        Row: {
          area_m2: number
          created_at: string
          id: string
          note: string | null
          progress_date: string
          project_id: string
          recorded_by: string
          updated_at: string
          user_id: string
        }
        Insert: {
          area_m2: number
          created_at?: string
          id?: string
          note?: string | null
          progress_date: string
          project_id: string
          recorded_by: string
          updated_at?: string
          user_id: string
        }
        Update: {
          area_m2?: number
          created_at?: string
          id?: string
          note?: string | null
          progress_date?: string
          project_id?: string
          recorded_by?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_area_progress_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_area_progress_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_area_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          assigned_area_m2: number
          assigned_at: string
          created_at: string
          id: string
          is_active: boolean
          project_id: string
          project_role: string
          removed_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_area_m2: number
          assigned_at: string
          created_at?: string
          id?: string
          is_active?: boolean
          project_id: string
          project_role: string
          removed_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_area_m2?: number
          assigned_at?: string
          created_at?: string
          id?: string
          is_active?: boolean
          project_id?: string
          project_role?: string
          removed_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      project_stage_productivity_budgets: {
        Row: {
          allocated_productivity_m2: number
          created_at: string
          productivity_budget_m2: number
          project_area_m2: number
          project_id: string
          stage: string
        }
        Insert: {
          allocated_productivity_m2?: number
          created_at?: string
          productivity_budget_m2: number
          project_area_m2: number
          project_id: string
          stage: string
        }
        Update: {
          allocated_productivity_m2?: number
          created_at?: string
          productivity_budget_m2?: number
          project_area_m2?: number
          project_id?: string
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_stage_productivity_budgets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_task_stage_columns: {
        Row: {
          display_name: string | null
          display_order: number
          enabled_statuses: string[]
          is_enabled: boolean
          progress_method: string
          project_id: string
          stage: string
          updated_at: string
        }
        Insert: {
          display_name?: string | null
          display_order: number
          enabled_statuses?: string[]
          is_enabled?: boolean
          progress_method?: string
          project_id: string
          stage: string
          updated_at?: string
        }
        Update: {
          display_name?: string | null
          display_order?: number
          enabled_statuses?: string[]
          is_enabled?: boolean
          progress_method?: string
          project_id?: string
          stage?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_task_stage_columns_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_template_tasks: {
        Row: {
          created_at: string
          id: string
          position: number
          priority: string
          stage: string
          template_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          position: number
          priority?: string
          stage: string
          template_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          position?: number
          priority?: string
          stage?: string
          template_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_template_tasks_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "project_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      project_templates: {
        Row: {
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          project_type: string
          studio_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          project_type: string
          studio_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          project_type?: string
          studio_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_templates_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          archived_at: string | null
          city: string | null
          city_geonames_id: number | null
          client_name: string | null
          completed_at: string | null
          country_code: string
          created_at: string
          created_by: string
          description: string | null
          due_date: string | null
          id: string
          include_in_productivity: boolean
          name: string
          priority: string
          project_code: string | null
          project_type: string | null
          project_type_custom: string | null
          start_date: string
          status: string
          studio_id: string
          total_area_m2: number
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          city?: string | null
          city_geonames_id?: number | null
          client_name?: string | null
          completed_at?: string | null
          country_code?: string
          created_at?: string
          created_by: string
          description?: string | null
          due_date?: string | null
          id?: string
          include_in_productivity?: boolean
          name: string
          priority?: string
          project_code?: string | null
          project_type?: string | null
          project_type_custom?: string | null
          start_date: string
          status?: string
          studio_id: string
          total_area_m2: number
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          city?: string | null
          city_geonames_id?: number | null
          client_name?: string | null
          completed_at?: string | null
          country_code?: string
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string | null
          id?: string
          include_in_productivity?: boolean
          name?: string
          priority?: string
          project_code?: string | null
          project_type?: string | null
          project_type_custom?: string | null
          start_date?: string
          status?: string
          studio_id?: string
          total_area_m2?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_days_off: {
        Row: {
          created_at: string
          created_by: string
          date: string
          id: string
          name: string
          note: string | null
          studio_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          date: string
          id?: string
          name: string
          note?: string | null
          studio_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          date?: string
          id?: string
          name?: string
          note?: string | null
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_days_off_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_days_off_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_members: {
        Row: {
          id: string
          is_active: boolean
          joined_at: string | null
          removed_at: string | null
          removed_by: string | null
          studio_id: string
          system_role: string
          user_id: string
        }
        Insert: {
          id?: string
          is_active?: boolean
          joined_at?: string | null
          removed_at?: string | null
          removed_by?: string | null
          studio_id: string
          system_role?: string
          user_id: string
        }
        Update: {
          id?: string
          is_active?: boolean
          joined_at?: string | null
          removed_at?: string | null
          removed_by?: string | null
          studio_id?: string
          system_role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_members_removed_by_fkey"
            columns: ["removed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_members_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      studios: {
        Row: {
          created_at: string
          id: string
          leaderboard_bonuses_enabled: boolean
          leaderboard_visible_to_employees: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          leaderboard_bonuses_enabled?: boolean
          leaderboard_visible_to_employees?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          leaderboard_bonuses_enabled?: boolean
          leaderboard_visible_to_employees?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      submission_admin_details: {
        Row: {
          internal_note: string | null
          studio_id: string
          submission_id: string
          updated_at: string
        }
        Insert: {
          internal_note?: string | null
          studio_id: string
          submission_id: string
          updated_at?: string
        }
        Update: {
          internal_note?: string | null
          studio_id?: string
          submission_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "submission_admin_details_submission_id_studio_id_fkey"
            columns: ["submission_id", "studio_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id", "studio_id"]
          },
        ]
      }
      submission_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          studio_id: string
          submission_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          studio_id: string
          submission_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          studio_id?: string
          submission_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "submission_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submission_comments_submission_id_studio_id_fkey"
            columns: ["submission_id", "studio_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id", "studio_id"]
          },
        ]
      }
      submission_reactions: {
        Row: {
          created_at: string
          studio_id: string
          submission_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          studio_id: string
          submission_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          studio_id?: string
          submission_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "submission_reactions_submission_id_studio_id_fkey"
            columns: ["submission_id", "studio_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id", "studio_id"]
          },
          {
            foreignKeyName: "submission_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      submissions: {
        Row: {
          author_id: string | null
          created_at: string
          deadline: string | null
          description: string
          id: string
          is_anonymous: boolean
          priority: string
          request_category: string | null
          responsible_id: string | null
          status: Database["public"]["Enums"]["submission_status"]
          studio_id: string
          title: string
          type: Database["public"]["Enums"]["submission_type"]
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          created_at?: string
          deadline?: string | null
          description: string
          id?: string
          is_anonymous?: boolean
          priority?: string
          request_category?: string | null
          responsible_id?: string | null
          status?: Database["public"]["Enums"]["submission_status"]
          studio_id: string
          title: string
          type: Database["public"]["Enums"]["submission_type"]
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          created_at?: string
          deadline?: string | null
          description?: string
          id?: string
          is_anonymous?: boolean
          priority?: string
          request_category?: string | null
          responsible_id?: string | null
          status?: Database["public"]["Enums"]["submission_status"]
          studio_id?: string
          title?: string
          type?: Database["public"]["Enums"]["submission_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "submissions_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_studio_id_responsible_id_fkey"
            columns: ["studio_id", "responsible_id"]
            isOneToOne: false
            referencedRelation: "studio_members"
            referencedColumns: ["studio_id", "user_id"]
          },
        ]
      }
      task_checklist_items: {
        Row: {
          created_at: string
          id: string
          is_completed: boolean
          position: number
          task_id: string
          title: string
          updated_at: string
          weight: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_completed?: boolean
          position: number
          task_id: string
          title: string
          updated_at?: string
          weight?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_completed?: boolean
          position?: number
          task_id?: string
          title?: string
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "task_checklist_items_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_collaborators: {
        Row: {
          created_at: string
          task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          task_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_collaborators_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_collaborators_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      task_deadline_completions: {
        Row: {
          assignee_id: string | null
          completed_at: string
          completed_on: string
          created_at: string
          due_date: string
          id: string
          project_id: string
          studio_id: string
          target_status: string
          task_id: string
          voided_at: string | null
        }
        Insert: {
          assignee_id?: string | null
          completed_at?: string
          completed_on?: string
          created_at?: string
          due_date: string
          id?: string
          project_id: string
          studio_id: string
          target_status: string
          task_id: string
          voided_at?: string | null
        }
        Update: {
          assignee_id?: string | null
          completed_at?: string
          completed_on?: string
          created_at?: string
          due_date?: string
          id?: string
          project_id?: string
          studio_id?: string
          target_status?: string
          task_id?: string
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_deadline_completions_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
        ]
      }
      task_deadlines: {
        Row: {
          created_at: string
          due_date: string
          id: string
          target_status: string
          task_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          due_date: string
          id?: string
          target_status: string
          task_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          due_date?: string
          id?: string
          target_status?: string
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_deadlines_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee_id: string | null
          completed_area_m2: number | null
          completed_at: string | null
          created_at: string
          created_by: string
          description: string | null
          due_date: string | null
          id: string
          manual_progress_override: boolean
          priority: string
          production_completion: number
          productivity_area_m2: number | null
          progress_weight: number
          project_id: string
          stage: string
          start_date: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          completed_area_m2?: number | null
          completed_at?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          due_date?: string | null
          id?: string
          manual_progress_override?: boolean
          priority?: string
          production_completion?: number
          productivity_area_m2?: number | null
          progress_weight?: number
          project_id: string
          stage?: string
          start_date?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          completed_area_m2?: number | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string | null
          id?: string
          manual_progress_override?: boolean
          priority?: string
          production_completion?: number
          productivity_area_m2?: number | null
          progress_weight?: number
          project_id?: string
          stage?: string
          start_date?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      time_off_request_approvals: {
        Row: {
          admin_user_id: string
          approved_at: string
          request_id: string
        }
        Insert: {
          admin_user_id: string
          approved_at?: string
          request_id: string
        }
        Update: {
          admin_user_id?: string
          approved_at?: string
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_off_request_approvals_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_off_request_approvals_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "time_off_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      time_off_request_reviews: {
        Row: {
          created_at: string
          created_by: string
          note: string
          request_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          note: string
          request_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          note?: string
          request_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_off_request_reviews_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_off_request_reviews_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "time_off_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      time_off_requests: {
        Row: {
          all_day: boolean
          cancelled_at: string | null
          created_at: string
          end_date: string
          end_time: string | null
          id: string
          private_note: string | null
          request_type: Database["public"]["Enums"]["time_off_request_type"]
          reviewed_at: string | null
          reviewed_by: string | null
          start_date: string
          start_time: string | null
          status: Database["public"]["Enums"]["time_off_request_status"]
          studio_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          all_day?: boolean
          cancelled_at?: string | null
          created_at?: string
          end_date: string
          end_time?: string | null
          id?: string
          private_note?: string | null
          request_type: Database["public"]["Enums"]["time_off_request_type"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date: string
          start_time?: string | null
          status?: Database["public"]["Enums"]["time_off_request_status"]
          studio_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          all_day?: boolean
          cancelled_at?: string | null
          created_at?: string
          end_date?: string
          end_time?: string | null
          id?: string
          private_note?: string | null
          request_type?: Database["public"]["Enums"]["time_off_request_type"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date?: string
          start_time?: string | null
          status?: Database["public"]["Enums"]["time_off_request_status"]
          studio_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_off_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_off_requests_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_off_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      workstations: {
        Row: {
          assigned_employee_id: string | null
          created_at: string
          id: string
          name: string | null
          number: number
          studio_id: string
          updated_at: string
          workstation_type: Database["public"]["Enums"]["workstation_type"]
        }
        Insert: {
          assigned_employee_id?: string | null
          created_at?: string
          id?: string
          name?: string | null
          number: number
          studio_id: string
          updated_at?: string
          workstation_type?: Database["public"]["Enums"]["workstation_type"]
        }
        Update: {
          assigned_employee_id?: string | null
          created_at?: string
          id?: string
          name?: string | null
          number?: number
          studio_id?: string
          updated_at?: string
          workstation_type?: Database["public"]["Enums"]["workstation_type"]
        }
        Relationships: [
          {
            foreignKeyName: "workstations_studio_id_assigned_employee_id_fkey"
            columns: ["studio_id", "assigned_employee_id"]
            isOneToOne: false
            referencedRelation: "studio_members"
            referencedColumns: ["studio_id", "user_id"]
          },
          {
            foreignKeyName: "workstations_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      finance_account_balances: {
        Row: {
          archived_at: string | null
          currency: string | null
          id: string | null
          name: string | null
          opening_balance: number | null
          recorded_balance: number | null
          studio_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_accounts_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "finance_currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "finance_accounts_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "finance_settings"
            referencedColumns: ["studio_id"]
          },
        ]
      }
      finance_actionable_unapplied: {
        Row: {
          account_id: string | null
          allocated_amount: number | null
          category: string | null
          category_id: string | null
          currency: string | null
          description: string | null
          direction: string | null
          financial_date: string | null
          id: string | null
          nature: string | null
          net_amount: number | null
          original_amount: number | null
          studio_id: string | null
          unapplied_amount: number | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_movement_entries_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "finance_currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "finance_movements_studio_id_category_id_fkey"
            columns: ["studio_id", "category_id"]
            isOneToOne: false
            referencedRelation: "finance_categories"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_movements_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "finance_settings"
            referencedColumns: ["studio_id"]
          },
        ]
      }
      finance_cash_effects: {
        Row: {
          account_id: string | null
          amount: number | null
          category: string | null
          currency: string | null
          entry_role: string | null
          financial_date: string | null
          fx_effective_date: string | null
          fx_rate: number | null
          fx_source: string | null
          id: string | null
          kind: string | null
          movement_id: string | null
          nature: string | null
          related_movement_id: string | null
          reporting_amount: number | null
          reporting_currency: string | null
          studio_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_movement_entries_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "finance_currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "finance_movement_entries_reporting_currency_fkey"
            columns: ["reporting_currency"]
            isOneToOne: false
            referencedRelation: "finance_currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "finance_movement_entries_studio_id_account_id_currency_fkey"
            columns: ["studio_id", "account_id", "currency"]
            isOneToOne: false
            referencedRelation: "finance_account_balances"
            referencedColumns: ["studio_id", "id", "currency"]
          },
          {
            foreignKeyName: "finance_movement_entries_studio_id_account_id_currency_fkey"
            columns: ["studio_id", "account_id", "currency"]
            isOneToOne: false
            referencedRelation: "finance_accounts"
            referencedColumns: ["studio_id", "id", "currency"]
          },
          {
            foreignKeyName: "finance_movement_entries_studio_id_account_id_fkey"
            columns: ["studio_id", "account_id"]
            isOneToOne: false
            referencedRelation: "finance_account_balances"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_movement_entries_studio_id_account_id_fkey"
            columns: ["studio_id", "account_id"]
            isOneToOne: false
            referencedRelation: "finance_accounts"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_movement_entries_studio_id_movement_id_fkey"
            columns: ["studio_id", "movement_id"]
            isOneToOne: false
            referencedRelation: "finance_actionable_unapplied"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_movement_entries_studio_id_movement_id_fkey"
            columns: ["studio_id", "movement_id"]
            isOneToOne: false
            referencedRelation: "finance_movements"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_movement_entries_studio_id_movement_id_fkey"
            columns: ["studio_id", "movement_id"]
            isOneToOne: false
            referencedRelation: "finance_payment_availability"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_movement_entries_studio_id_reporting_currency_fkey"
            columns: ["studio_id", "reporting_currency"]
            isOneToOne: false
            referencedRelation: "finance_settings"
            referencedColumns: ["studio_id", "base_currency"]
          },
        ]
      }
      finance_current_budget: {
        Row: {
          category_id: string | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          id: string | null
          months: number[] | null
          reason: string | null
          revision: number | null
          studio_id: string | null
          year: number | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_budget_revisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_budget_revisions_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "finance_currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "finance_budget_revisions_studio_id_category_id_fkey"
            columns: ["studio_id", "category_id"]
            isOneToOne: false
            referencedRelation: "finance_categories"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_budget_revisions_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "finance_settings"
            referencedColumns: ["studio_id"]
          },
        ]
      }
      finance_expected_balances: {
        Row: {
          amount: number | null
          category_id: string | null
          certainty: string | null
          commitment: string | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          description: string | null
          direction: string | null
          due_date: string | null
          due_state: string | null
          expected_payment_date: string | null
          id: string | null
          is_established: boolean | null
          outstanding_amount: number | null
          payment_state: string | null
          remaining_amount: number | null
          settled_amount: number | null
          studio_id: string | null
          updated_at: string | null
          version: number | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_expected_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_expected_items_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "finance_currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "finance_expected_items_studio_id_category_id_fkey"
            columns: ["studio_id", "category_id"]
            isOneToOne: false
            referencedRelation: "finance_categories"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_expected_items_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "finance_settings"
            referencedColumns: ["studio_id"]
          },
        ]
      }
      finance_payment_availability: {
        Row: {
          account_id: string | null
          allocated_amount: number | null
          category: string | null
          category_id: string | null
          currency: string | null
          description: string | null
          direction: string | null
          financial_date: string | null
          id: string | null
          nature: string | null
          net_amount: number | null
          original_amount: number | null
          studio_id: string | null
          unapplied_amount: number | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_movement_entries_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "finance_currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "finance_movements_studio_id_category_id_fkey"
            columns: ["studio_id", "category_id"]
            isOneToOne: false
            referencedRelation: "finance_categories"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_movements_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "finance_settings"
            referencedColumns: ["studio_id"]
          },
        ]
      }
      finance_payroll_calendar: {
        Row: {
          employee_id: string | null
          employee_name: string | null
          expected_item_id: string | null
          payment_date: string | null
          studio_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_expected_items_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "finance_settings"
            referencedColumns: ["studio_id"]
          },
        ]
      }
      finance_payroll_unknown_costs: {
        Row: {
          amount: number | null
          can_complete: boolean | null
          component: string | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          obligation_id: string | null
          reason: string | null
          revision: number | null
          status: string | null
          studio_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_obligations_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "finance_settings"
            referencedColumns: ["studio_id"]
          },
          {
            foreignKeyName: "finance_payroll_cost_revisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_schedule_terms_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "finance_currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      finance_planning_actuals: {
        Row: {
          amount: number | null
          category_id: string | null
          direction: string | null
          financial_date: string | null
          nature: string | null
          posting_order: number | null
          recorded_at: string | null
          studio_id: string | null
        }
        Relationships: []
      }
      finance_project_current_terms: {
        Row: {
          amount: number | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          effective_from: string | null
          effective_through: string | null
          id: string | null
          mode: string | null
          project_id: string | null
          reason: string | null
          revision: number | null
          stream: string | null
          studio_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_project_terms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_project_terms_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "finance_currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "finance_project_terms_project_id_studio_id_fkey"
            columns: ["project_id", "studio_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "studio_id"]
          },
          {
            foreignKeyName: "finance_project_terms_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "finance_settings"
            referencedColumns: ["studio_id"]
          },
        ]
      }
      finance_project_expected_balances: {
        Row: {
          amount: number | null
          category_id: string | null
          certainty: string | null
          commitment: string | null
          context_label: string | null
          contractor_id: string | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          description: string | null
          direction: string | null
          due_date: string | null
          due_state: string | null
          expected_payment_date: string | null
          id: string | null
          is_established: boolean | null
          outstanding_amount: number | null
          payment_state: string | null
          period_start: string | null
          project_id: string | null
          remaining_amount: number | null
          settled_amount: number | null
          source: string | null
          stream: string | null
          studio_id: string | null
          updated_at: string | null
          version: number | null
          visit_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_expected_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_expected_items_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "finance_currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "finance_expected_items_studio_id_category_id_fkey"
            columns: ["studio_id", "category_id"]
            isOneToOne: false
            referencedRelation: "finance_categories"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_expected_items_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "finance_settings"
            referencedColumns: ["studio_id"]
          },
          {
            foreignKeyName: "finance_project_items_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_project_items_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_project_plan_items: {
        Row: {
          amount: number | null
          category_id: string | null
          certainty: string | null
          commitment: string | null
          context_label: string | null
          contractor_id: string | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          description: string | null
          direction: string | null
          due_date: string | null
          due_state: string | null
          expected_payment_date: string | null
          has_settlement_history: boolean | null
          id: string | null
          is_established: boolean | null
          outstanding_amount: number | null
          payment_state: string | null
          period_start: string | null
          project_id: string | null
          remaining_amount: number | null
          settled_amount: number | null
          source: string | null
          stream: string | null
          studio_id: string | null
          updated_at: string | null
          version: number | null
          visit_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_expected_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_expected_items_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "finance_currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "finance_expected_items_studio_id_category_id_fkey"
            columns: ["studio_id", "category_id"]
            isOneToOne: false
            referencedRelation: "finance_categories"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_expected_items_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "finance_settings"
            referencedColumns: ["studio_id"]
          },
          {
            foreignKeyName: "finance_project_items_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_project_items_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_project_totals: {
        Row: {
          collected_amount: number | null
          contract_amount: number | null
          currency: string | null
          outstanding_amount: number | null
          planned_amount: number | null
          project_id: string | null
          scheduled_amount: number | null
          stream: string | null
          studio_id: string | null
          unscheduled_amount: number | null
        }
        Relationships: []
      }
      finance_schedule_history: {
        Row: {
          amount: number | null
          basis: string | null
          category_id: string | null
          certainty: string | null
          commitment: string | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          effective_from: string | null
          effective_through: string | null
          employee_deductions: number | null
          employee_payout: number | null
          employer_cost: number | null
          employer_cost_status: string | null
          id: string | null
          interval_months: number | null
          name: string | null
          payment_month_offset: number | null
          payout_day: number | null
          reason: string | null
          revision: number | null
          schedule_id: string | null
          studio_id: string | null
          valid_through: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_schedule_terms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_schedule_terms_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "finance_currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "finance_schedule_terms_studio_id_category_id_fkey"
            columns: ["studio_id", "category_id"]
            isOneToOne: false
            referencedRelation: "finance_categories"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_schedule_terms_studio_id_schedule_id_fkey"
            columns: ["studio_id", "schedule_id"]
            isOneToOne: false
            referencedRelation: "finance_schedules"
            referencedColumns: ["studio_id", "id"]
          },
        ]
      }
      finance_trip_entry_values: {
        Row: {
          amount: number | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          daily_rate: number | null
          day_count: number | null
          employee_id: string | null
          expected_item_id: string | null
          expense_type: string | null
          financial_date: string | null
          fx_effective_date: string | null
          fx_rate: number | null
          fx_source: string | null
          id: string | null
          kind: string | null
          label: string | null
          movement_id: string | null
          net_amount: number | null
          net_reporting_amount: number | null
          note: string | null
          plan_id: string | null
          reporting_amount: number | null
          reporting_currency: string | null
          reverses_id: string | null
          studio_id: string | null
          traveler_count: number | null
          trip_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_trip_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_trip_entries_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "finance_currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "finance_trip_entries_studio_id_expected_item_id_fkey"
            columns: ["studio_id", "expected_item_id"]
            isOneToOne: false
            referencedRelation: "finance_expected_balances"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_trip_entries_studio_id_expected_item_id_fkey"
            columns: ["studio_id", "expected_item_id"]
            isOneToOne: false
            referencedRelation: "finance_expected_items"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_trip_entries_studio_id_expected_item_id_fkey"
            columns: ["studio_id", "expected_item_id"]
            isOneToOne: false
            referencedRelation: "finance_payroll_calendar"
            referencedColumns: ["studio_id", "expected_item_id"]
          },
          {
            foreignKeyName: "finance_trip_entries_studio_id_expected_item_id_fkey"
            columns: ["studio_id", "expected_item_id"]
            isOneToOne: false
            referencedRelation: "finance_project_expected_balances"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_trip_entries_studio_id_expected_item_id_fkey"
            columns: ["studio_id", "expected_item_id"]
            isOneToOne: false
            referencedRelation: "finance_project_plan_items"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_trip_entries_studio_id_movement_id_fkey"
            columns: ["studio_id", "movement_id"]
            isOneToOne: true
            referencedRelation: "finance_actionable_unapplied"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_trip_entries_studio_id_movement_id_fkey"
            columns: ["studio_id", "movement_id"]
            isOneToOne: true
            referencedRelation: "finance_movements"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_trip_entries_studio_id_movement_id_fkey"
            columns: ["studio_id", "movement_id"]
            isOneToOne: true
            referencedRelation: "finance_payment_availability"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_trip_entries_studio_id_plan_id_trip_id_fkey"
            columns: ["studio_id", "plan_id", "trip_id"]
            isOneToOne: false
            referencedRelation: "finance_trip_entries"
            referencedColumns: ["studio_id", "id", "trip_id"]
          },
          {
            foreignKeyName: "finance_trip_entries_studio_id_plan_id_trip_id_fkey"
            columns: ["studio_id", "plan_id", "trip_id"]
            isOneToOne: false
            referencedRelation: "finance_trip_entry_values"
            referencedColumns: ["studio_id", "id", "trip_id"]
          },
          {
            foreignKeyName: "finance_trip_entries_studio_id_reporting_currency_fkey"
            columns: ["studio_id", "reporting_currency"]
            isOneToOne: false
            referencedRelation: "finance_settings"
            referencedColumns: ["studio_id", "base_currency"]
          },
          {
            foreignKeyName: "finance_trip_entries_studio_id_reverses_id_trip_id_fkey"
            columns: ["studio_id", "reverses_id", "trip_id"]
            isOneToOne: false
            referencedRelation: "finance_trip_entries"
            referencedColumns: ["studio_id", "id", "trip_id"]
          },
          {
            foreignKeyName: "finance_trip_entries_studio_id_reverses_id_trip_id_fkey"
            columns: ["studio_id", "reverses_id", "trip_id"]
            isOneToOne: false
            referencedRelation: "finance_trip_entry_values"
            referencedColumns: ["studio_id", "id", "trip_id"]
          },
          {
            foreignKeyName: "finance_trip_entries_studio_id_trip_id_employee_id_fkey"
            columns: ["studio_id", "trip_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "finance_trip_travelers"
            referencedColumns: ["studio_id", "trip_id", "employee_id"]
          },
          {
            foreignKeyName: "finance_trip_entries_studio_id_trip_id_fkey"
            columns: ["studio_id", "trip_id"]
            isOneToOne: false
            referencedRelation: "finance_trip_totals"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_trip_entries_studio_id_trip_id_fkey"
            columns: ["studio_id", "trip_id"]
            isOneToOne: false
            referencedRelation: "finance_trips"
            referencedColumns: ["studio_id", "id"]
          },
        ]
      }
      finance_trip_totals: {
        Row: {
          actual_amount: string | null
          calendar_event_id: string | null
          calendar_source_id: string | null
          calendar_state: string | null
          created_at: string | null
          created_by: string | null
          destination: string | null
          employee_paid: string | null
          ends_on: string | null
          id: string | null
          note: string | null
          planned_amount: string | null
          project_id: string | null
          reporting_currency: string | null
          starts_on: string | null
          status: string | null
          studio_id: string | null
          studio_paid: string | null
          title: string | null
          updated_at: string | null
          variance: string | null
          version: number | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_settings_base_currency_fkey"
            columns: ["reporting_currency"]
            isOneToOne: false
            referencedRelation: "finance_currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "finance_trips_calendar_event_fk"
            columns: ["studio_id", "calendar_event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_trips_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_trips_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "finance_settings"
            referencedColumns: ["studio_id"]
          },
          {
            foreignKeyName: "finance_trips_studio_id_project_id_fkey"
            columns: ["studio_id", "project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["studio_id", "id"]
          },
        ]
      }
    }
    Functions: {
      allocate_finance_payment: {
        Args: {
          p_amount: number
          p_item_id: string
          p_movement_id: string
          p_request_id: string
          p_studio_id: string
        }
        Returns: string
      }
      apply_project_template_stage: {
        Args: {
          p_destination_stage: string
          p_project_id: string
          p_source_stage: string
          p_template_id: string
        }
        Returns: number
      }
      approve_time_off_request: {
        Args: { p_request_id: string; p_review_note?: string }
        Returns: {
          approval_count: number
          required_approval_count: number
          status: Database["public"]["Enums"]["time_off_request_status"]
        }[]
      }
      bulk_assign_project_stage_tasks: {
        Args: {
          p_assignee_id: string
          p_project_id: string
          p_scope: string
          p_stage: string
        }
        Returns: {
          id: string
        }[]
      }
      bulk_assign_selected_project_tasks: {
        Args: {
          p_assignee_id: string
          p_project_id: string
          p_stage: string
          p_task_ids: string[]
        }
        Returns: {
          id: string
        }[]
      }
      bulk_move_project_tasks: {
        Args: {
          p_project_id: string
          p_source_statuses: string[]
          p_stage: string
          p_target_status: string
          p_task_ids: string[]
        }
        Returns: {
          id: string
        }[]
      }
      bulk_set_project_task_deadline: {
        Args: {
          p_due_date: string
          p_project_id: string
          p_stage: string
          p_target_status: string
          p_task_ids: string[]
        }
        Returns: {
          id: string
        }[]
      }
      calculate_finance_forecast: {
        Args: {
          p_fx?: Json
          p_horizon?: string
          p_scenario?: string
          p_studio_id: string
        }
        Returns: Json
      }
      cancel_finance_project_expectation: {
        Args: { p_input: Json; p_request_id: string; p_studio_id: string }
        Returns: string
      }
      claim_equipment_catalog_sync: {
        Args: { p_run_id: string; p_source: string }
        Returns: {
          completed_generation: string | null
          last_completed_at: string | null
          last_error: string | null
          last_started_at: string | null
          lease_until: string | null
          run_id: string | null
          source: string
        }[]
        SetofOptions: {
          from: "*"
          to: "equipment_catalog_sync_state"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_google_calendar_reconciliation_jobs: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          available_at: string
          created_at: string
          last_error: string | null
          locked_at: string | null
          revision: number
          source_event_id: string
          status: string
          studio_id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "google_calendar_reconciliation_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      compare_finance_forecast_snapshot: {
        Args: { p_snapshot_id: string; p_studio_id: string }
        Returns: Json
      }
      complete_equipment_service: {
        Args: {
          p_completed_on: string
          p_cost_amount?: number
          p_cost_currency?: string
          p_notes?: string
          p_return_state: Database["public"]["Enums"]["equipment_lifecycle_state"]
          p_service_event_id: string
        }
        Returns: string
      }
      complete_finance_payroll_cost: {
        Args: { p_input: Json; p_request_id: string; p_studio_id: string }
        Returns: string
      }
      create_calendar_event_with_invites: {
        Args: {
          p_all_day: boolean
          p_assignee_id?: string
          p_attendee_ids?: string[]
          p_compensates_time_off_request_id?: string
          p_description?: string
          p_ends_at: string
          p_event_type: Database["public"]["Enums"]["calendar_event_type"]
          p_location?: string
          p_meeting_mode?: string
          p_meeting_url?: string
          p_participant_ids?: string[]
          p_project_id?: string
          p_recurrence_rule?: Json
          p_starts_at: string
          p_studio_id: string
          p_title: string
        }
        Returns: string
      }
      create_crm_candidate: {
        Args: {
          p_email: string
          p_external_profile_url: string
          p_full_name: string
          p_internal_notes: string
          p_phone: string
          p_responsible_admin_id: string
          p_source: string
          p_target_position: string
        }
        Returns: string
      }
      create_crm_candidate_with_cycle: {
        Args: {
          p_email: string
          p_external_profile_url: string
          p_full_name: string
          p_interview_at: string
          p_interview_notes: string
          p_next_contact_date: string
          p_outcome: string
          p_phone: string
          p_responsible_admin_id: string
          p_source: string
          p_stage: Database["public"]["Enums"]["recruiting_stage"]
          p_target_position: string
          p_test_task_result: string
        }
        Returns: string
      }
      create_finance_employee_bonus: {
        Args: { p_input: Json; p_request_id: string; p_studio_id: string }
        Returns: string
      }
      create_office_assignment: {
        Args: {
          p_deadline?: string
          p_description: string
          p_priority: string
          p_responsible_id: string
          p_title: string
        }
        Returns: string
      }
      create_project_from_template: {
        Args: {
          p_project: Json
          p_stage_assignees?: Json
          p_template_id?: string
        }
        Returns: string
      }
      create_submission: {
        Args: {
          p_anonymous?: boolean
          p_description: string
          p_request_category?: string
          p_title: string
          p_type: Database["public"]["Enums"]["submission_type"]
        }
        Returns: string
      }
      create_task_with_checklist: {
        Args: { p_checklist_items?: Json; p_task: Json }
        Returns: string
      }
      create_workstations: {
        Args: { p_studio_id: string; p_workstations: Json }
        Returns: string[]
      }
      delete_contractor_category: {
        Args: { p_category_id: string }
        Returns: undefined
      }
      delete_project_template: {
        Args: { p_template_id: string }
        Returns: undefined
      }
      edit_finance_trip_entry: {
        Args: {
          p_entry_id: string
          p_input: Json
          p_request_id: string
          p_studio_id: string
          p_trip_id: string
        }
        Returns: string
      }
      ensure_finance_schedule_occurrences: {
        Args: { p_horizon?: string; p_studio_id: string }
        Returns: number
      }
      finalize_finance_setup: {
        Args: { p_studio_id: string }
        Returns: undefined
      }
      finish_equipment_catalog_sync: {
        Args: {
          p_error?: string
          p_generation: string
          p_run_id: string
          p_source: string
        }
        Returns: undefined
      }
      generate_equipment_maintenance_notifications: {
        Args: { p_today?: string }
        Returns: number
      }
      generate_finance_obligations: {
        Args: {
          p_from: string
          p_request_id: string
          p_schedule_id: string
          p_studio_id: string
          p_through: string
        }
        Returns: string
      }
      generate_finance_supervision_months: {
        Args: {
          p_from: string
          p_project_id: string
          p_request_id: string
          p_studio_id: string
          p_through: string
        }
        Returns: string
      }
      get_calendar_coworker_availability: {
        Args: {
          range_end: string
          range_start: string
          target_studio_id: string
        }
        Returns: {
          all_day: boolean
          employee_name: string
          end_date: string
          end_time: string
          id: string
          label: string
          start_date: string
          start_time: string
          user_id: string
        }[]
      }
      get_finance_category_management: {
        Args: { p_studio_id: string }
        Returns: {
          archived_at: string
          can_delete: boolean
          created_at: string
          custom_name: boolean
          default_key: string
          direction: string
          id: string
          name: string
          nature: string
          studio_id: string
        }[]
      }
      get_finance_overview: {
        Args: {
          p_fx?: Json
          p_horizon?: string
          p_period?: string
          p_scenario?: string
          p_studio_id: string
        }
        Returns: Json
      }
      get_personal_task_ids: {
        Args: never
        Returns: {
          task_id: string
        }[]
      }
      get_project_member_removal_impact: {
        Args: { p_assignment_id: string }
        Returns: Json
      }
      get_studio_member_removal_impact: {
        Args: { p_user_id: string }
        Returns: Json
      }
      import_equipment_catalog_batch: {
        Args: {
          p_generation: string
          p_rows: Json
          p_run_id: string
          p_source: string
        }
        Returns: undefined
      }
      manage_finance_recurring_group: {
        Args: {
          p_id?: string
          p_name?: string
          p_operation: string
          p_schedule_id?: string
          p_studio_id: string
        }
        Returns: string
      }
      manage_office_assignment: {
        Args: {
          p_assignment_id: string
          p_deadline?: string
          p_priority: string
          p_responsible_id: string
          p_status: Database["public"]["Enums"]["office_assignment_status"]
        }
        Returns: undefined
      }
      manage_submission: {
        Args: {
          p_deadline?: string
          p_internal_note?: string
          p_priority?: string
          p_responsible_id?: string
          p_status: Database["public"]["Enums"]["submission_status"]
          p_submission_id: string
        }
        Returns: undefined
      }
      record_equipment_history_event: {
        Args: {
          p_completed_on: string
          p_cost_amount?: number
          p_cost_currency?: string
          p_equipment_id: string
          p_event_type: Database["public"]["Enums"]["equipment_service_event_type"]
          p_notes?: string
          p_service_provider?: string
          p_started_on?: string
        }
        Returns: string
      }
      record_finance_expected_payment: {
        Args: {
          p_allocation_amount: number
          p_input: Json
          p_item_id: string
          p_request_id: string
          p_studio_id: string
        }
        Returns: string
      }
      record_finance_movement: {
        Args: { p_input: Json; p_request_id: string; p_studio_id: string }
        Returns: string
      }
      record_finance_trip_entry: {
        Args: {
          p_input: Json
          p_request_id: string
          p_studio_id: string
          p_trip_id: string
        }
        Returns: string
      }
      reject_time_off_request: {
        Args: { p_request_id: string; p_review_note?: string }
        Returns: undefined
      }
      release_finance_allocation: {
        Args: {
          p_allocation_id: string
          p_reason: string
          p_request_id: string
          p_studio_id: string
        }
        Returns: string
      }
      remove_finance_category: {
        Args: { p_category_id: string; p_studio_id: string }
        Returns: string
      }
      remove_project_member: {
        Args: {
          p_allow_unassigned: boolean
          p_assignment_id: string
          p_reassignments: Json
        }
        Returns: undefined
      }
      remove_studio_member:
        | {
            Args: { p_reassignment_user_id?: string; p_user_id: string }
            Returns: undefined
          }
        | {
            Args: {
              p_allow_unassigned: boolean
              p_reassignments: Json
              p_user_id: string
            }
            Returns: undefined
          }
      rename_contractor_category: {
        Args: { p_category_id: string; p_name: string }
        Returns: undefined
      }
      replace_business_trip_participants: {
        Args: { p_event_id: string; p_user_ids: string[] }
        Returns: undefined
      }
      resolve_contractor_category: { Args: { p_name: string }; Returns: string }
      resolve_contractor_subcategory: {
        Args: { p_category_id: string; p_name: string }
        Returns: string
      }
      restore_studio_member: { Args: { p_user_id: string }; Returns: undefined }
      reverse_finance_movement: {
        Args: {
          p_date: string
          p_movement_id: string
          p_reason: string
          p_request_id: string
          p_studio_id: string
        }
        Returns: string
      }
      save_checklist_template: {
        Args: {
          p_name: string
          p_stages: Json
          p_studio_id: string
          p_template_id?: string
        }
        Returns: string
      }
      save_finance_account: {
        Args: {
          p_account_id?: string
          p_currency: string
          p_name: string
          p_opening_balance: number
          p_request_id?: string
          p_studio_id: string
        }
        Returns: string
      }
      save_finance_budget: {
        Args: { p_input: Json; p_request_id: string; p_studio_id: string }
        Returns: string
      }
      save_finance_category: {
        Args: { p_input: Json; p_request_id: string; p_studio_id: string }
        Returns: string
      }
      save_finance_expected_item: {
        Args: { p_input: Json; p_request_id: string; p_studio_id: string }
        Returns: string
      }
      save_finance_forecast_snapshot: {
        Args: {
          p_fx: Json
          p_horizon: string
          p_name: string
          p_request_id: string
          p_scenario: string
          p_studio_id: string
        }
        Returns: string
      }
      save_finance_project_item: {
        Args: {
          p_input: Json
          p_project_id: string
          p_request_id: string
          p_studio_id: string
        }
        Returns: string
      }
      save_finance_project_plan: {
        Args: {
          p_input: Json
          p_project_id: string
          p_request_id: string
          p_studio_id: string
        }
        Returns: string
      }
      save_finance_project_terms: {
        Args: {
          p_input: Json
          p_project_id: string
          p_request_id: string
          p_studio_id: string
        }
        Returns: string
      }
      save_finance_recurring_schedule: {
        Args: { p_input: Json; p_request_id: string; p_studio_id: string }
        Returns: string
      }
      save_finance_schedule: {
        Args: { p_input: Json; p_request_id: string; p_studio_id: string }
        Returns: string
      }
      save_finance_settings: {
        Args: {
          p_base_currency: string
          p_cutover_date: string
          p_studio_id: string
        }
        Returns: undefined
      }
      save_finance_trip: {
        Args: { p_input: Json; p_request_id: string; p_studio_id: string }
        Returns: string
      }
      save_leaderboard_bonus_rules: {
        Args: { p_enabled: boolean; p_rules: Json; p_studio_id: string }
        Returns: undefined
      }
      save_office_floor_plan_layout: {
        Args: { p_placements: Json; p_studio_id: string }
        Returns: number
      }
      save_project_template: {
        Args: {
          p_is_active: boolean
          p_is_default: boolean
          p_name: string
          p_project_type: string
          p_studio_id: string
          p_tasks: Json
          p_template_id?: string
        }
        Returns: string
      }
      search_equipment_catalog: {
        Args: {
          p_family?: string
          p_field?: string
          p_manufacturer?: string
          p_query: string
          p_type: string
        }
        Returns: {
          value: string
        }[]
      }
      set_checklist_template_archived: {
        Args: { p_archived: boolean; p_template_id: string }
        Returns: string
      }
      set_finance_account_archived: {
        Args: { p_account_id: string; p_archived: boolean; p_studio_id: string }
        Returns: undefined
      }
      set_leaderboard_employee_visibility: {
        Args: { p_studio_id: string; p_visible: boolean }
        Returns: undefined
      }
      start_crm_recruiting_cycle: {
        Args: { p_candidate_id: string; p_target_position: string }
        Returns: string
      }
      start_equipment_service: {
        Args: {
          p_equipment_id: string
          p_event_type: Database["public"]["Enums"]["equipment_service_event_type"]
          p_notes?: string
          p_service_provider?: string
          p_started_on: string
        }
        Returns: string
      }
      stop_finance_schedule: {
        Args: {
          p_from: string
          p_request_id: string
          p_schedule_id: string
          p_studio_id: string
        }
        Returns: string
      }
      transition_office_assignment: {
        Args: {
          p_assignment_id: string
          p_status: Database["public"]["Enums"]["office_assignment_status"]
        }
        Returns: undefined
      }
      update_contractor_category_color: {
        Args: { p_category_id: string; p_color_key: string }
        Returns: undefined
      }
      update_crm_candidate_with_cycle: {
        Args: {
          p_candidate_id: string
          p_cycle_id: string
          p_email: string
          p_external_profile_url: string
          p_full_name: string
          p_interview_at: string
          p_interview_notes: string
          p_next_contact_date: string
          p_outcome: string
          p_phone: string
          p_responsible_admin_id: string
          p_source: string
          p_stage: Database["public"]["Enums"]["recruiting_stage"]
          p_target_position: string
          p_test_task_result: string
        }
        Returns: string
      }
      update_my_avatar: { Args: { p_avatar_path?: string }; Returns: string }
      update_my_profile_birthday: {
        Args: { p_birth_date: string }
        Returns: undefined
      }
      update_my_profile_details: {
        Args: {
          p_birth_date?: string
          p_city?: string
          p_city_geonames_id?: number
          p_country_code?: string
          p_joined_at?: string
          p_notification_popups_enabled?: boolean
          p_notification_sound_enabled?: boolean
        }
        Returns: undefined
      }
      update_my_profile_location: {
        Args: {
          p_city: string
          p_city_geonames_id: number
          p_country_code: string
        }
        Returns: undefined
      }
      update_project_stage_configuration: {
        Args: {
          p_include_in_productivity: boolean
          p_project_id: string
          p_stages: Json
        }
        Returns: undefined
      }
      update_studio_member_profile: {
        Args: {
          p_birth_date?: string
          p_city?: string
          p_city_geonames_id?: number
          p_country_code?: string
          p_full_name: string
          p_job_title: string
          p_joined_at?: string
          p_system_role: string
          p_user_id: string
        }
        Returns: undefined
      }
      update_task_details_with_collaborators: {
        Args: {
          p_collaborator_ids?: string[]
          p_deadlines?: Json
          p_task: Json
          p_task_id: string
        }
        Returns: undefined
      }
      validate_business_trip_participants: {
        Args: {
          p_project_id: string
          p_studio_id: string
          p_user_ids: string[]
        }
        Returns: undefined
      }
      value_finance_opening: {
        Args: { p_account_id: string; p_input: Json; p_studio_id: string }
        Returns: undefined
      }
    }
    Enums: {
      calendar_event_invitation_status: "pending" | "accepted" | "declined"
      calendar_event_type:
        | "meeting"
        | "presentation"
        | "site_visit"
        | "internal_review"
        | "general"
        | "business_trip"
        | "work_makeup"
        | "interview"
      crm_invalid_reason:
        | "not_submitted"
        | "wrong_number"
        | "spam"
        | "duplicate"
        | "other"
      crm_lead_status:
        | "new"
        | "contacted"
        | "discussion"
        | "proposal"
        | "won"
        | "lost"
        | "invalid"
      equipment_lifecycle_state: "active" | "spare" | "in_service" | "retired"
      equipment_service_event_type: "regular_maintenance" | "repair" | "upgrade"
      equipment_type:
        | "pc"
        | "laptop"
        | "monitor"
        | "mouse"
        | "keyboard"
        | "headphones"
        | "webcam"
        | "air_conditioner"
        | "printer"
        | "coffee_machine"
        | "other"
      notification_type:
        | "time_off_request_submitted"
        | "time_off_request_approved"
        | "time_off_request_rejected"
        | "time_off_request_cancelled"
        | "task_assigned"
        | "task_details_changed"
        | "calendar_event_invitation"
        | "calendar_event_updated"
        | "calendar_event_cancelled"
        | "calendar_event_assigned"
        | "submission_created"
        | "submission_assigned"
        | "submission_status_changed"
        | "office_assignment_assigned"
        | "office_assignment_status_changed"
        | "crm_lead_follow_up"
        | "equipment_maintenance_upcoming"
        | "equipment_maintenance_overdue"
      office_assignment_status:
        | "assigned"
        | "in_progress"
        | "done"
        | "cancelled"
      recruiting_outcome: "hired" | "reserve" | "rejected"
      recruiting_stage:
        | "new"
        | "interview_scheduled"
        | "interview_completed"
        | "test_task"
        | "decision"
      submission_status:
        | "new"
        | "accepted"
        | "in_progress"
        | "done"
        | "rejected"
        | "discussion"
        | "planned"
        | "implemented"
        | "reviewing"
        | "action_taken"
        | "closed"
      submission_type: "request" | "suggestion" | "complaint"
      time_off_request_status: "pending" | "approved" | "rejected" | "cancelled"
      time_off_request_type:
        | "vacation"
        | "day_off"
        | "medical_appointment"
        | "sick_leave"
        | "other"
      workstation_type: "office" | "remote"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      calendar_event_invitation_status: ["pending", "accepted", "declined"],
      calendar_event_type: [
        "meeting",
        "presentation",
        "site_visit",
        "internal_review",
        "general",
        "business_trip",
        "work_makeup",
        "interview",
      ],
      crm_invalid_reason: [
        "not_submitted",
        "wrong_number",
        "spam",
        "duplicate",
        "other",
      ],
      crm_lead_status: [
        "new",
        "contacted",
        "discussion",
        "proposal",
        "won",
        "lost",
        "invalid",
      ],
      equipment_lifecycle_state: ["active", "spare", "in_service", "retired"],
      equipment_service_event_type: [
        "regular_maintenance",
        "repair",
        "upgrade",
      ],
      equipment_type: [
        "pc",
        "laptop",
        "monitor",
        "mouse",
        "keyboard",
        "headphones",
        "webcam",
        "air_conditioner",
        "printer",
        "coffee_machine",
        "other",
      ],
      notification_type: [
        "time_off_request_submitted",
        "time_off_request_approved",
        "time_off_request_rejected",
        "time_off_request_cancelled",
        "task_assigned",
        "task_details_changed",
        "calendar_event_invitation",
        "calendar_event_updated",
        "calendar_event_cancelled",
        "calendar_event_assigned",
        "submission_created",
        "submission_assigned",
        "submission_status_changed",
        "office_assignment_assigned",
        "office_assignment_status_changed",
        "crm_lead_follow_up",
        "equipment_maintenance_upcoming",
        "equipment_maintenance_overdue",
      ],
      office_assignment_status: [
        "assigned",
        "in_progress",
        "done",
        "cancelled",
      ],
      recruiting_outcome: ["hired", "reserve", "rejected"],
      recruiting_stage: [
        "new",
        "interview_scheduled",
        "interview_completed",
        "test_task",
        "decision",
      ],
      submission_status: [
        "new",
        "accepted",
        "in_progress",
        "done",
        "rejected",
        "discussion",
        "planned",
        "implemented",
        "reviewing",
        "action_taken",
        "closed",
      ],
      submission_type: ["request", "suggestion", "complaint"],
      time_off_request_status: ["pending", "approved", "rejected", "cancelled"],
      time_off_request_type: [
        "vacation",
        "day_off",
        "medical_appointment",
        "sick_leave",
        "other",
      ],
      workstation_type: ["office", "remote"],
    },
  },
} as const
