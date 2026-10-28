export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
          site_address: string | null
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
          site_address?: string | null
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
          site_address?: string | null
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
      employee_profile_notes: {
        Row: {
          author_id: string
          created_at: string
          employee_id: string
          id: string
          note: string
          review_month: string
          studio_id: string
        }
        Insert: {
          author_id?: string
          created_at?: string
          employee_id: string
          id?: string
          note: string
          review_month: string
          studio_id: string
        }
        Update: {
          author_id?: string
          created_at?: string
          employee_id?: string
          id?: string
          note?: string
          review_month?: string
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_profile_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_profile_notes_studio_id_author_id_fkey"
            columns: ["studio_id", "author_id"]
            isOneToOne: false
            referencedRelation: "studio_members"
            referencedColumns: ["studio_id", "user_id"]
          },
          {
            foreignKeyName: "employee_profile_notes_studio_id_employee_id_fkey"
            columns: ["studio_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "studio_members"
            referencedColumns: ["studio_id", "user_id"]
          },
          {
            foreignKeyName: "employee_profile_notes_studio_id_fkey"
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
          maintenance_responsible_id: string | null
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
          maintenance_responsible_id?: string | null
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
          maintenance_responsible_id?: string | null
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
            foreignKeyName: "equipment_maintenance_responsible_studio_fkey"
            columns: ["studio_id", "maintenance_responsible_id"]
            isOneToOne: false
            referencedRelation: "studio_members"
            referencedColumns: ["studio_id", "user_id"]
          },
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
          account_type: string
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
          account_type?: string
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
          account_type?: string
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
          net_amount: number
          obligation_currency: string
          payment_amount: number
          payment_currency: string
          reason: string
          released_allocation_id: string | null
          settlement_effective_date: string
          settlement_rate: number
          settlement_source: string
          studio_id: string
          vat_amount: number
        }
        Insert: {
          amount: number
          cause_movement_id?: string | null
          created_at?: string
          created_by: string
          expected_item_id: string
          id?: string
          movement_id: string
          net_amount: number
          obligation_currency: string
          payment_amount: number
          payment_currency: string
          reason?: string
          released_allocation_id?: string | null
          settlement_effective_date: string
          settlement_rate: number
          settlement_source: string
          studio_id: string
          vat_amount: number
        }
        Update: {
          amount?: number
          cause_movement_id?: string | null
          created_at?: string
          created_by?: string
          expected_item_id?: string
          id?: string
          movement_id?: string
          net_amount?: number
          obligation_currency?: string
          payment_amount?: number
          payment_currency?: string
          reason?: string
          released_allocation_id?: string | null
          settlement_effective_date?: string
          settlement_rate?: number
          settlement_source?: string
          studio_id?: string
          vat_amount?: number
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
            foreignKeyName: "finance_allocations_obligation_currency_fkey"
            columns: ["obligation_currency"]
            isOneToOne: false
            referencedRelation: "finance_currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "finance_allocations_payment_currency_fkey"
            columns: ["payment_currency"]
            isOneToOne: false
            referencedRelation: "finance_currencies"
            referencedColumns: ["code"]
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
            referencedRelation: "finance_current_movements"
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
            referencedRelation: "finance_current_movements"
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
          project_expense_enabled: boolean
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
          project_expense_enabled?: boolean
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
          project_expense_enabled?: boolean
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
          client_note: string | null
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
          net_amount: number
          price_basis: string | null
          schedule_percentage: number | null
          studio_id: string
          updated_at: string
          vat_amount: number
          vat_rate: number | null
          version: number
        }
        Insert: {
          amount: number
          category_id: string
          certainty: string
          client_note?: string | null
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
          net_amount: number
          price_basis?: string | null
          schedule_percentage?: number | null
          studio_id: string
          updated_at?: string
          vat_amount: number
          vat_rate?: number | null
          version?: number
        }
        Update: {
          amount?: number
          category_id?: string
          certainty?: string
          client_note?: string | null
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
          net_amount?: number
          price_basis?: string | null
          schedule_percentage?: number | null
          studio_id?: string
          updated_at?: string
          vat_amount?: number
          vat_rate?: number | null
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
      finance_expense_receipts: {
        Row: {
          created_at: string
          created_by: string
          expected_item_id: string | null
          id: string
          movement_id: string | null
          occurred_on: string
          project_id: string | null
          snapshot: Json
          source_version: string
          studio_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          expected_item_id?: string | null
          id?: string
          movement_id?: string | null
          occurred_on: string
          project_id?: string | null
          snapshot: Json
          source_version: string
          studio_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          expected_item_id?: string | null
          id?: string
          movement_id?: string | null
          occurred_on?: string
          project_id?: string | null
          snapshot?: Json
          source_version?: string
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_expense_receipts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_expense_receipts_project_id_studio_id_fkey"
            columns: ["project_id", "studio_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "studio_id"]
          },
          {
            foreignKeyName: "finance_expense_receipts_studio_id_expected_item_id_fkey"
            columns: ["studio_id", "expected_item_id"]
            isOneToOne: false
            referencedRelation: "finance_expected_balances"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_expense_receipts_studio_id_expected_item_id_fkey"
            columns: ["studio_id", "expected_item_id"]
            isOneToOne: false
            referencedRelation: "finance_expected_items"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_expense_receipts_studio_id_expected_item_id_fkey"
            columns: ["studio_id", "expected_item_id"]
            isOneToOne: false
            referencedRelation: "finance_payroll_calendar"
            referencedColumns: ["studio_id", "expected_item_id"]
          },
          {
            foreignKeyName: "finance_expense_receipts_studio_id_expected_item_id_fkey"
            columns: ["studio_id", "expected_item_id"]
            isOneToOne: false
            referencedRelation: "finance_project_expected_balances"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_expense_receipts_studio_id_expected_item_id_fkey"
            columns: ["studio_id", "expected_item_id"]
            isOneToOne: false
            referencedRelation: "finance_project_plan_items"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_expense_receipts_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "finance_settings"
            referencedColumns: ["studio_id"]
          },
          {
            foreignKeyName: "finance_expense_receipts_studio_id_movement_id_fkey"
            columns: ["studio_id", "movement_id"]
            isOneToOne: false
            referencedRelation: "finance_actionable_unapplied"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_expense_receipts_studio_id_movement_id_fkey"
            columns: ["studio_id", "movement_id"]
            isOneToOne: false
            referencedRelation: "finance_current_movements"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_expense_receipts_studio_id_movement_id_fkey"
            columns: ["studio_id", "movement_id"]
            isOneToOne: false
            referencedRelation: "finance_movements"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_expense_receipts_studio_id_movement_id_fkey"
            columns: ["studio_id", "movement_id"]
            isOneToOne: false
            referencedRelation: "finance_payment_availability"
            referencedColumns: ["studio_id", "id"]
          },
        ]
      }
      finance_expense_service_policies: {
        Row: {
          coverage_from: string | null
          created_at: string
          created_by: string
          effective_from: string
          first_period: string
          id: string
          policy: string
          project_id: string | null
          revision: number
          schedule_id: string
          service_months: number
          service_start: string
          source_default: boolean
          studio_id: string
        }
        Insert: {
          coverage_from?: string | null
          created_at?: string
          created_by: string
          effective_from: string
          first_period: string
          id?: string
          policy: string
          project_id?: string | null
          revision: number
          schedule_id: string
          service_months: number
          service_start: string
          source_default?: boolean
          studio_id: string
        }
        Update: {
          coverage_from?: string | null
          created_at?: string
          created_by?: string
          effective_from?: string
          first_period?: string
          id?: string
          policy?: string
          project_id?: string | null
          revision?: number
          schedule_id?: string
          service_months?: number
          service_start?: string
          source_default?: boolean
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_expense_service_policies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_expense_service_policies_project_id_studio_id_fkey"
            columns: ["project_id", "studio_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "studio_id"]
          },
          {
            foreignKeyName: "finance_expense_service_policies_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "finance_settings"
            referencedColumns: ["studio_id"]
          },
          {
            foreignKeyName: "finance_expense_service_policies_studio_id_schedule_id_fkey"
            columns: ["studio_id", "schedule_id"]
            isOneToOne: false
            referencedRelation: "finance_schedules"
            referencedColumns: ["studio_id", "id"]
          },
        ]
      }
      finance_forecast_scenario_revisions: {
        Row: {
          assumptions: Json
          base_snapshot_id: string
          created_at: string
          created_by: string
          id: string
          name: string
          reason: string
          revision: number
          scenario_id: string
          studio_id: string
        }
        Insert: {
          assumptions: Json
          base_snapshot_id: string
          created_at?: string
          created_by: string
          id?: string
          name: string
          reason: string
          revision: number
          scenario_id: string
          studio_id: string
        }
        Update: {
          assumptions?: Json
          base_snapshot_id?: string
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          reason?: string
          revision?: number
          scenario_id?: string
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_forecast_scenario_revis_studio_id_base_snapshot_id_fkey"
            columns: ["studio_id", "base_snapshot_id"]
            isOneToOne: false
            referencedRelation: "finance_forecast_snapshots"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_forecast_scenario_revisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_forecast_scenario_revisions_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "finance_settings"
            referencedColumns: ["studio_id"]
          },
          {
            foreignKeyName: "finance_forecast_scenario_revisions_studio_id_scenario_id_fkey"
            columns: ["studio_id", "scenario_id"]
            isOneToOne: false
            referencedRelation: "finance_forecast_scenarios"
            referencedColumns: ["studio_id", "id"]
          },
        ]
      }
      finance_forecast_scenarios: {
        Row: {
          created_at: string
          created_by: string
          id: string
          studio_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          studio_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_forecast_scenarios_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_forecast_scenarios_studio_id_fkey"
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
          native_inputs: Json | null
          studio_id: string
        }
        Insert: {
          capture_order?: number | null
          created_at?: string
          created_by: string
          forecast: Json
          id?: string
          name: string
          native_inputs?: Json | null
          studio_id: string
        }
        Update: {
          capture_order?: number | null
          created_at?: string
          created_by?: string
          forecast?: Json
          id?: string
          name?: string
          native_inputs?: Json | null
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
      finance_labor_activation_revisions: {
        Row: {
          created_at: string
          created_by: string
          id: string
          preview_digest: string | null
          previous_starts_on: string
          starts_on: string
          studio_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          preview_digest?: string | null
          previous_starts_on: string
          starts_on: string
          studio_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          preview_digest?: string | null
          previous_starts_on?: string
          starts_on?: string
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_labor_activation_revisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_labor_activation_revisions_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "finance_labor_automation"
            referencedColumns: ["studio_id"]
          },
        ]
      }
      finance_labor_allocation_items: {
        Row: {
          amount: number
          id: string
          project_id: string
          revision_id: string
          studio_id: string
        }
        Insert: {
          amount: number
          id?: string
          project_id: string
          revision_id: string
          studio_id: string
        }
        Update: {
          amount?: number
          id?: string
          project_id?: string
          revision_id?: string
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_labor_allocation_items_project_id_studio_id_fkey"
            columns: ["project_id", "studio_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "studio_id"]
          },
          {
            foreignKeyName: "finance_labor_allocation_items_studio_id_revision_id_fkey"
            columns: ["studio_id", "revision_id"]
            isOneToOne: false
            referencedRelation: "finance_labor_allocation_revisions"
            referencedColumns: ["studio_id", "id"]
          },
        ]
      }
      finance_labor_allocation_revisions: {
        Row: {
          created_at: string
          created_by: string
          entry_id: string
          id: string
          method: string
          reason: string
          revision: number
          studio_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          entry_id: string
          id?: string
          method?: string
          reason: string
          revision: number
          studio_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          entry_id?: string
          id?: string
          method?: string
          reason?: string
          revision?: number
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_labor_allocation_revisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_labor_allocation_revisions_studio_id_entry_id_fkey"
            columns: ["studio_id", "entry_id"]
            isOneToOne: false
            referencedRelation: "finance_labor_cost_pools"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_labor_allocation_revisions_studio_id_entry_id_fkey"
            columns: ["studio_id", "entry_id"]
            isOneToOne: false
            referencedRelation: "finance_recognition_entries"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_labor_allocation_revisions_studio_id_entry_id_fkey"
            columns: ["studio_id", "entry_id"]
            isOneToOne: false
            referencedRelation: "finance_recognized_actuals"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_labor_allocation_revisions_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "finance_settings"
            referencedColumns: ["studio_id"]
          },
        ]
      }
      finance_labor_automation: {
        Row: {
          created_at: string
          created_by: string
          internal_project_id: string | null
          starts_on: string
          studio_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          internal_project_id?: string | null
          starts_on: string
          studio_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          internal_project_id?: string | null
          starts_on?: string
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_labor_automation_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_labor_automation_internal_project_id_studio_id_fkey"
            columns: ["internal_project_id", "studio_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "studio_id"]
          },
          {
            foreignKeyName: "finance_labor_automation_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: true
            referencedRelation: "finance_settings"
            referencedColumns: ["studio_id"]
          },
        ]
      }
      finance_labor_calculations: {
        Row: {
          created_at: string
          created_by: string
          digest: string
          id: string
          initiated_by: string
          obligation_id: string
          snapshot: Json
          status: string
          studio_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          digest: string
          id?: string
          initiated_by: string
          obligation_id: string
          snapshot: Json
          status: string
          studio_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          digest?: string
          id?: string
          initiated_by?: string
          obligation_id?: string
          snapshot?: Json
          status?: string
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_labor_calculations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_labor_calculations_studio_id_obligation_id_fkey"
            columns: ["studio_id", "obligation_id"]
            isOneToOne: false
            referencedRelation: "finance_obligations"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_labor_calculations_studio_id_obligation_id_fkey"
            columns: ["studio_id", "obligation_id"]
            isOneToOne: false
            referencedRelation: "finance_payroll_unknown_costs"
            referencedColumns: ["studio_id", "obligation_id"]
          },
        ]
      }
      finance_labor_capacity_revisions: {
        Row: {
          created_at: string
          created_by: string
          daily_minutes: number
          effective_from: string
          employee_id: string | null
          id: string
          studio_id: string
          weekdays: number[]
        }
        Insert: {
          created_at?: string
          created_by: string
          daily_minutes: number
          effective_from: string
          employee_id?: string | null
          id?: string
          studio_id: string
          weekdays: number[]
        }
        Update: {
          created_at?: string
          created_by?: string
          daily_minutes?: number
          effective_from?: string
          employee_id?: string | null
          id?: string
          studio_id?: string
          weekdays?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "finance_labor_capacity_revisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_labor_capacity_revisions_studio_id_employee_id_fkey"
            columns: ["studio_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "studio_members"
            referencedColumns: ["studio_id", "user_id"]
          },
          {
            foreignKeyName: "finance_labor_capacity_revisions_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "finance_settings"
            referencedColumns: ["studio_id"]
          },
        ]
      }
      finance_month_confirmations: {
        Row: {
          coverage_id: string
          created_at: string
          created_by: string
          id: string
          month: string
          revision: number
          snapshot: Json
          source_digest: string
          studio_id: string
        }
        Insert: {
          coverage_id: string
          created_at?: string
          created_by: string
          id?: string
          month: string
          revision: number
          snapshot: Json
          source_digest: string
          studio_id: string
        }
        Update: {
          coverage_id?: string
          created_at?: string
          created_by?: string
          id?: string
          month?: string
          revision?: number
          snapshot?: Json
          source_digest?: string
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_month_confirmations_coverage_id_fkey"
            columns: ["coverage_id"]
            isOneToOne: false
            referencedRelation: "finance_current_report_coverage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_month_confirmations_coverage_id_fkey"
            columns: ["coverage_id"]
            isOneToOne: false
            referencedRelation: "finance_report_coverage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_month_confirmations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_month_confirmations_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "finance_settings"
            referencedColumns: ["studio_id"]
          },
        ]
      }
      finance_movement_corrections: {
        Row: {
          original_movement_id: string
          replacement_movement_id: string
          reversal_movement_id: string
          studio_id: string
        }
        Insert: {
          original_movement_id: string
          replacement_movement_id: string
          reversal_movement_id: string
          studio_id: string
        }
        Update: {
          original_movement_id?: string
          replacement_movement_id?: string
          reversal_movement_id?: string
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_movement_corrections_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "finance_settings"
            referencedColumns: ["studio_id"]
          },
          {
            foreignKeyName: "finance_movement_corrections_studio_id_original_movement_i_fkey"
            columns: ["studio_id", "original_movement_id"]
            isOneToOne: true
            referencedRelation: "finance_actionable_unapplied"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_movement_corrections_studio_id_original_movement_i_fkey"
            columns: ["studio_id", "original_movement_id"]
            isOneToOne: true
            referencedRelation: "finance_current_movements"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_movement_corrections_studio_id_original_movement_i_fkey"
            columns: ["studio_id", "original_movement_id"]
            isOneToOne: true
            referencedRelation: "finance_movements"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_movement_corrections_studio_id_original_movement_i_fkey"
            columns: ["studio_id", "original_movement_id"]
            isOneToOne: true
            referencedRelation: "finance_payment_availability"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_movement_corrections_studio_id_replacement_movemen_fkey"
            columns: ["studio_id", "replacement_movement_id"]
            isOneToOne: true
            referencedRelation: "finance_actionable_unapplied"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_movement_corrections_studio_id_replacement_movemen_fkey"
            columns: ["studio_id", "replacement_movement_id"]
            isOneToOne: true
            referencedRelation: "finance_current_movements"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_movement_corrections_studio_id_replacement_movemen_fkey"
            columns: ["studio_id", "replacement_movement_id"]
            isOneToOne: true
            referencedRelation: "finance_movements"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_movement_corrections_studio_id_replacement_movemen_fkey"
            columns: ["studio_id", "replacement_movement_id"]
            isOneToOne: true
            referencedRelation: "finance_payment_availability"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_movement_corrections_studio_id_reversal_movement_i_fkey"
            columns: ["studio_id", "reversal_movement_id"]
            isOneToOne: true
            referencedRelation: "finance_actionable_unapplied"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_movement_corrections_studio_id_reversal_movement_i_fkey"
            columns: ["studio_id", "reversal_movement_id"]
            isOneToOne: true
            referencedRelation: "finance_current_movements"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_movement_corrections_studio_id_reversal_movement_i_fkey"
            columns: ["studio_id", "reversal_movement_id"]
            isOneToOne: true
            referencedRelation: "finance_movements"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_movement_corrections_studio_id_reversal_movement_i_fkey"
            columns: ["studio_id", "reversal_movement_id"]
            isOneToOne: true
            referencedRelation: "finance_payment_availability"
            referencedColumns: ["studio_id", "id"]
          },
        ]
      }
      finance_movement_entries: {
        Row: {
          account_id: string
          amount: number
          currency: string
          entry_role: string
          fx_effective_date: string | null
          fx_rate: number | null
          fx_source: string | null
          id: string
          movement_id: string
          reporting_amount: number | null
          reporting_currency: string
          studio_id: string
        }
        Insert: {
          account_id: string
          amount: number
          currency: string
          entry_role: string
          fx_effective_date?: string | null
          fx_rate?: number | null
          fx_source?: string | null
          id?: string
          movement_id: string
          reporting_amount?: number | null
          reporting_currency: string
          studio_id: string
        }
        Update: {
          account_id?: string
          amount?: number
          currency?: string
          entry_role?: string
          fx_effective_date?: string | null
          fx_rate?: number | null
          fx_source?: string | null
          id?: string
          movement_id?: string
          reporting_amount?: number | null
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
            referencedRelation: "finance_current_movements"
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
            referencedRelation: "finance_current_movements"
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
      finance_payroll_cash: {
        Row: {
          created_at: string
          created_by: string
          credit_amount: number
          credit_currency: string
          credit_rate: number
          credit_source: string
          employee_id: string
          movement_id: string
          obligation_id: string | null
          studio_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          credit_amount: number
          credit_currency: string
          credit_rate: number
          credit_source: string
          employee_id: string
          movement_id: string
          obligation_id?: string | null
          studio_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          credit_amount?: number
          credit_currency?: string
          credit_rate?: number
          credit_source?: string
          employee_id?: string
          movement_id?: string
          obligation_id?: string | null
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_payroll_cash_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_payroll_cash_credit_currency_fkey"
            columns: ["credit_currency"]
            isOneToOne: false
            referencedRelation: "finance_currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "finance_payroll_cash_studio_id_employee_id_fkey"
            columns: ["studio_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "studio_members"
            referencedColumns: ["studio_id", "user_id"]
          },
          {
            foreignKeyName: "finance_payroll_cash_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "finance_settings"
            referencedColumns: ["studio_id"]
          },
          {
            foreignKeyName: "finance_payroll_cash_studio_id_movement_id_fkey"
            columns: ["studio_id", "movement_id"]
            isOneToOne: true
            referencedRelation: "finance_actionable_unapplied"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_payroll_cash_studio_id_movement_id_fkey"
            columns: ["studio_id", "movement_id"]
            isOneToOne: true
            referencedRelation: "finance_current_movements"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_payroll_cash_studio_id_movement_id_fkey"
            columns: ["studio_id", "movement_id"]
            isOneToOne: true
            referencedRelation: "finance_movements"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_payroll_cash_studio_id_movement_id_fkey"
            columns: ["studio_id", "movement_id"]
            isOneToOne: true
            referencedRelation: "finance_payment_availability"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_payroll_cash_studio_id_obligation_id_fkey"
            columns: ["studio_id", "obligation_id"]
            isOneToOne: false
            referencedRelation: "finance_obligations"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_payroll_cash_studio_id_obligation_id_fkey"
            columns: ["studio_id", "obligation_id"]
            isOneToOne: false
            referencedRelation: "finance_payroll_unknown_costs"
            referencedColumns: ["studio_id", "obligation_id"]
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
      finance_payroll_earning_revisions: {
        Row: {
          adjustment_amount: number
          calculated_amount: number
          created_at: string
          created_by: string
          employee_payout: number
          final_amount: number
          id: string
          obligation_id: string
          reason: string
          revision: number
          schedule_id: string
          source_digest: string
          source_snapshot: Json
          studio_id: string
          terms_id: string
        }
        Insert: {
          adjustment_amount: number
          calculated_amount: number
          created_at?: string
          created_by: string
          employee_payout: number
          final_amount: number
          id?: string
          obligation_id: string
          reason: string
          revision: number
          schedule_id: string
          source_digest: string
          source_snapshot: Json
          studio_id: string
          terms_id: string
        }
        Update: {
          adjustment_amount?: number
          calculated_amount?: number
          created_at?: string
          created_by?: string
          employee_payout?: number
          final_amount?: number
          id?: string
          obligation_id?: string
          reason?: string
          revision?: number
          schedule_id?: string
          source_digest?: string
          source_snapshot?: Json
          studio_id?: string
          terms_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_payroll_earning_revis_studio_id_terms_id_schedule__fkey"
            columns: ["studio_id", "terms_id", "schedule_id"]
            isOneToOne: false
            referencedRelation: "finance_schedule_history"
            referencedColumns: ["studio_id", "id", "schedule_id"]
          },
          {
            foreignKeyName: "finance_payroll_earning_revis_studio_id_terms_id_schedule__fkey"
            columns: ["studio_id", "terms_id", "schedule_id"]
            isOneToOne: false
            referencedRelation: "finance_schedule_terms"
            referencedColumns: ["studio_id", "id", "schedule_id"]
          },
          {
            foreignKeyName: "finance_payroll_earning_revisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_payroll_earning_revisions_studio_id_obligation_id_fkey"
            columns: ["studio_id", "obligation_id"]
            isOneToOne: false
            referencedRelation: "finance_obligations"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_payroll_earning_revisions_studio_id_obligation_id_fkey"
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
      finance_project_cash_items: {
        Row: {
          amount: number
          project_id: string
          revision_id: string
          studio_id: string
        }
        Insert: {
          amount: number
          project_id: string
          revision_id: string
          studio_id: string
        }
        Update: {
          amount?: number
          project_id?: string
          revision_id?: string
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_project_cash_items_project_id_studio_id_fkey"
            columns: ["project_id", "studio_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "studio_id"]
          },
          {
            foreignKeyName: "finance_project_cash_items_studio_id_revision_id_fkey"
            columns: ["studio_id", "revision_id"]
            isOneToOne: false
            referencedRelation: "finance_project_cash_revisions"
            referencedColumns: ["studio_id", "id"]
          },
        ]
      }
      finance_project_cash_revisions: {
        Row: {
          created_at: string
          created_by: string
          id: string
          movement_id: string
          reason: string
          revision: number
          studio_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          movement_id: string
          reason: string
          revision: number
          studio_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          movement_id?: string
          reason?: string
          revision?: number
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_project_cash_revisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_project_cash_revisions_studio_id_movement_id_fkey"
            columns: ["studio_id", "movement_id"]
            isOneToOne: false
            referencedRelation: "finance_actionable_unapplied"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_project_cash_revisions_studio_id_movement_id_fkey"
            columns: ["studio_id", "movement_id"]
            isOneToOne: false
            referencedRelation: "finance_current_movements"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_project_cash_revisions_studio_id_movement_id_fkey"
            columns: ["studio_id", "movement_id"]
            isOneToOne: false
            referencedRelation: "finance_movements"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_project_cash_revisions_studio_id_movement_id_fkey"
            columns: ["studio_id", "movement_id"]
            isOneToOne: false
            referencedRelation: "finance_payment_availability"
            referencedColumns: ["studio_id", "id"]
          },
        ]
      }
      finance_project_cost_estimates: {
        Row: {
          as_of: string
          created_at: string
          created_by: string
          currency: string
          direct_budget: number | null
          fx_effective_date: string | null
          fx_rate: number | null
          fx_source: string | null
          id: string
          labor_budget: number | null
          project_id: string
          reason: string
          remaining_direct: number | null
          remaining_labor: number | null
          reporting_currency: string
          revision: number
          source_digest: string | null
          studio_id: string
        }
        Insert: {
          as_of: string
          created_at?: string
          created_by: string
          currency: string
          direct_budget?: number | null
          fx_effective_date?: string | null
          fx_rate?: number | null
          fx_source?: string | null
          id?: string
          labor_budget?: number | null
          project_id: string
          reason: string
          remaining_direct?: number | null
          remaining_labor?: number | null
          reporting_currency: string
          revision: number
          source_digest?: string | null
          studio_id: string
        }
        Update: {
          as_of?: string
          created_at?: string
          created_by?: string
          currency?: string
          direct_budget?: number | null
          fx_effective_date?: string | null
          fx_rate?: number | null
          fx_source?: string | null
          id?: string
          labor_budget?: number | null
          project_id?: string
          reason?: string
          remaining_direct?: number | null
          remaining_labor?: number | null
          reporting_currency?: string
          revision?: number
          source_digest?: string | null
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_project_cost_estimate_studio_id_reporting_currency_fkey"
            columns: ["studio_id", "reporting_currency"]
            isOneToOne: false
            referencedRelation: "finance_settings"
            referencedColumns: ["studio_id", "base_currency"]
          },
          {
            foreignKeyName: "finance_project_cost_estimates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_project_cost_estimates_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "finance_currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "finance_project_cost_estimates_project_id_studio_id_fkey"
            columns: ["project_id", "studio_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "studio_id"]
          },
        ]
      }
      finance_project_earning_attempts: {
        Row: {
          attempted_by: string
          created_at: string
          entry_id: string | null
          event_id: string
          exception: string | null
          id: string
          studio_id: string
        }
        Insert: {
          attempted_by: string
          created_at?: string
          entry_id?: string | null
          event_id: string
          exception?: string | null
          id?: string
          studio_id: string
        }
        Update: {
          attempted_by?: string
          created_at?: string
          entry_id?: string | null
          event_id?: string
          exception?: string | null
          id?: string
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_project_earning_attempts_attempted_by_fkey"
            columns: ["attempted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_project_earning_attempts_studio_id_entry_id_fkey"
            columns: ["studio_id", "entry_id"]
            isOneToOne: false
            referencedRelation: "finance_labor_cost_pools"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_project_earning_attempts_studio_id_entry_id_fkey"
            columns: ["studio_id", "entry_id"]
            isOneToOne: false
            referencedRelation: "finance_recognition_entries"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_project_earning_attempts_studio_id_entry_id_fkey"
            columns: ["studio_id", "entry_id"]
            isOneToOne: false
            referencedRelation: "finance_recognized_actuals"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_project_earning_attempts_studio_id_event_id_fkey"
            columns: ["studio_id", "event_id"]
            isOneToOne: false
            referencedRelation: "finance_project_earning_events"
            referencedColumns: ["studio_id", "id"]
          },
        ]
      }
      finance_project_earning_events: {
        Row: {
          confirmed_by: string
          created_at: string
          id: string
          kind: string
          milestone_id: string
          occurred_on: string
          reason: string | null
          studio_id: string
        }
        Insert: {
          confirmed_by: string
          created_at?: string
          id?: string
          kind: string
          milestone_id: string
          occurred_on: string
          reason?: string | null
          studio_id: string
        }
        Update: {
          confirmed_by?: string
          created_at?: string
          id?: string
          kind?: string
          milestone_id?: string
          occurred_on?: string
          reason?: string | null
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_project_earning_events_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_project_earning_events_studio_id_milestone_id_fkey"
            columns: ["studio_id", "milestone_id"]
            isOneToOne: false
            referencedRelation: "finance_project_earning_milestones"
            referencedColumns: ["studio_id", "id"]
          },
        ]
      }
      finance_project_earning_milestones: {
        Row: {
          active: boolean
          condition: string
          created_at: string
          created_by: string
          id: string
          net_amount: number
          order_id: string
          percentage: number | null
          project_id: string
          revision: number
          stage: string | null
          studio_id: string
          terms_id: string
          title: string
        }
        Insert: {
          active?: boolean
          condition?: string
          created_at?: string
          created_by: string
          id?: string
          net_amount: number
          order_id: string
          percentage?: number | null
          project_id: string
          revision?: number
          stage?: string | null
          studio_id: string
          terms_id: string
          title: string
        }
        Update: {
          active?: boolean
          condition?: string
          created_at?: string
          created_by?: string
          id?: string
          net_amount?: number
          order_id?: string
          percentage?: number | null
          project_id?: string
          revision?: number
          stage?: string | null
          studio_id?: string
          terms_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_project_earning_miles_studio_id_order_id_project_i_fkey"
            columns: ["studio_id", "order_id", "project_id"]
            isOneToOne: false
            referencedRelation: "finance_project_orders"
            referencedColumns: ["studio_id", "id", "project_id"]
          },
          {
            foreignKeyName: "finance_project_earning_miles_studio_id_terms_id_project_i_fkey"
            columns: ["studio_id", "terms_id", "project_id"]
            isOneToOne: false
            referencedRelation: "finance_project_current_terms"
            referencedColumns: ["studio_id", "id", "project_id"]
          },
          {
            foreignKeyName: "finance_project_earning_miles_studio_id_terms_id_project_i_fkey"
            columns: ["studio_id", "terms_id", "project_id"]
            isOneToOne: false
            referencedRelation: "finance_project_terms"
            referencedColumns: ["studio_id", "id", "project_id"]
          },
          {
            foreignKeyName: "finance_project_earning_milestones_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_project_items: {
        Row: {
          context_label: string
          contractor_id: string | null
          expected_item_id: string
          extra_visit: boolean
          order_id: string | null
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
          order_id?: string | null
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
          order_id?: string | null
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
            foreignKeyName: "finance_project_items_order_fk"
            columns: ["studio_id", "order_id", "project_id"]
            isOneToOne: false
            referencedRelation: "finance_project_orders"
            referencedColumns: ["studio_id", "id", "project_id"]
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
            foreignKeyName: "finance_project_items_terms_order_fk"
            columns: ["studio_id", "terms_id", "project_id", "order_id"]
            isOneToOne: false
            referencedRelation: "finance_project_current_terms"
            referencedColumns: ["studio_id", "id", "project_id", "order_id"]
          },
          {
            foreignKeyName: "finance_project_items_terms_order_fk"
            columns: ["studio_id", "terms_id", "project_id", "order_id"]
            isOneToOne: false
            referencedRelation: "finance_project_terms"
            referencedColumns: ["studio_id", "id", "project_id", "order_id"]
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
      finance_project_orders: {
        Row: {
          confirmed_at: string | null
          created_at: string
          created_by: string
          discarded_at: string | null
          draft_plan: Json | null
          id: string
          is_default: boolean
          name: string
          project_id: string
          status: string
          studio_id: string
          updated_at: string
          updated_by: string
          version: number
        }
        Insert: {
          confirmed_at?: string | null
          created_at?: string
          created_by: string
          discarded_at?: string | null
          draft_plan?: Json | null
          id?: string
          is_default?: boolean
          name: string
          project_id: string
          status?: string
          studio_id: string
          updated_at?: string
          updated_by: string
          version?: number
        }
        Update: {
          confirmed_at?: string | null
          created_at?: string
          created_by?: string
          discarded_at?: string | null
          draft_plan?: Json | null
          id?: string
          is_default?: boolean
          name?: string
          project_id?: string
          status?: string
          studio_id?: string
          updated_at?: string
          updated_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "finance_project_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_project_orders_project_id_studio_id_fkey"
            columns: ["project_id", "studio_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "studio_id"]
          },
          {
            foreignKeyName: "finance_project_orders_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "finance_settings"
            referencedColumns: ["studio_id"]
          },
          {
            foreignKeyName: "finance_project_orders_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      finance_project_proposals: {
        Row: {
          created_at: string
          created_by: string
          id: string
          order_id: string
          pdf: string
          project_id: string
          request_id: string
          revision: number
          snapshot: Json
          studio_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          order_id: string
          pdf: string
          project_id: string
          request_id: string
          revision: number
          snapshot: Json
          studio_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          order_id?: string
          pdf?: string
          project_id?: string
          request_id?: string
          revision?: number
          snapshot?: Json
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_project_proposals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_project_proposals_order_fk"
            columns: ["studio_id", "order_id", "project_id"]
            isOneToOne: false
            referencedRelation: "finance_project_orders"
            referencedColumns: ["studio_id", "id", "project_id"]
          },
          {
            foreignKeyName: "finance_project_proposals_project_id_studio_id_fkey"
            columns: ["project_id", "studio_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "studio_id"]
          },
          {
            foreignKeyName: "finance_project_proposals_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "finance_settings"
            referencedColumns: ["studio_id"]
          },
        ]
      }
      finance_project_refund_items: {
        Row: {
          amount: number
          movement_id: string
          project_id: string
          studio_id: string
        }
        Insert: {
          amount: number
          movement_id: string
          project_id: string
          studio_id: string
        }
        Update: {
          amount?: number
          movement_id?: string
          project_id?: string
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_project_refund_items_project_id_studio_id_fkey"
            columns: ["project_id", "studio_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "studio_id"]
          },
          {
            foreignKeyName: "finance_project_refund_items_studio_id_movement_id_fkey"
            columns: ["studio_id", "movement_id"]
            isOneToOne: false
            referencedRelation: "finance_actionable_unapplied"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_project_refund_items_studio_id_movement_id_fkey"
            columns: ["studio_id", "movement_id"]
            isOneToOne: false
            referencedRelation: "finance_current_movements"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_project_refund_items_studio_id_movement_id_fkey"
            columns: ["studio_id", "movement_id"]
            isOneToOne: false
            referencedRelation: "finance_movements"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_project_refund_items_studio_id_movement_id_fkey"
            columns: ["studio_id", "movement_id"]
            isOneToOne: false
            referencedRelation: "finance_payment_availability"
            referencedColumns: ["studio_id", "id"]
          },
        ]
      }
      finance_project_terms: {
        Row: {
          amount: number | null
          created_at: string
          created_by: string
          currency: string
          discount_amount: number
          discount_type: string
          discount_value: number
          effective_from: string | null
          effective_through: string | null
          gross_amount: number | null
          id: string
          mode: string
          net_amount: number | null
          order_id: string | null
          price_basis: string | null
          project_id: string
          reason: string
          revenue_tax_rate: number | null
          revision: number
          stream: string
          studio_id: string
          vat_amount: number | null
          vat_rate: number | null
        }
        Insert: {
          amount?: number | null
          created_at?: string
          created_by: string
          currency: string
          discount_amount?: number
          discount_type?: string
          discount_value?: number
          effective_from?: string | null
          effective_through?: string | null
          gross_amount?: number | null
          id?: string
          mode: string
          net_amount?: number | null
          order_id?: string | null
          price_basis?: string | null
          project_id: string
          reason: string
          revenue_tax_rate?: number | null
          revision: number
          stream: string
          studio_id: string
          vat_amount?: number | null
          vat_rate?: number | null
        }
        Update: {
          amount?: number | null
          created_at?: string
          created_by?: string
          currency?: string
          discount_amount?: number
          discount_type?: string
          discount_value?: number
          effective_from?: string | null
          effective_through?: string | null
          gross_amount?: number | null
          id?: string
          mode?: string
          net_amount?: number | null
          order_id?: string | null
          price_basis?: string | null
          project_id?: string
          reason?: string
          revenue_tax_rate?: number | null
          revision?: number
          stream?: string
          studio_id?: string
          vat_amount?: number | null
          vat_rate?: number | null
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
            foreignKeyName: "finance_project_terms_order_fk"
            columns: ["studio_id", "order_id", "project_id"]
            isOneToOne: false
            referencedRelation: "finance_project_orders"
            referencedColumns: ["studio_id", "id", "project_id"]
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
      finance_recognition_entries: {
        Row: {
          amount: number
          category_id: string
          classification: string
          created_at: string
          created_by: string
          currency: string
          description: string
          earning_correction_of: string | null
          earning_event_id: string | null
          employee_id: string | null
          expected_item_id: string | null
          expense_policy_id: string | null
          expense_receipt_id: string | null
          fx_effective_date: string | null
          fx_rate: number | null
          fx_source: string | null
          gross_amount: number
          id: string
          kind: string
          movement_id: string | null
          obligation_id: string | null
          period_end: string
          period_start: string
          project_id: string | null
          reason: string
          recognized_on: string
          related_entry_id: string | null
          reporting_amount: number | null
          reporting_currency: string
          source_kind: string
          source_snapshot: Json
          studio_id: string
          terms_id: string | null
          trip_effect_movement_id: string | null
          trip_entry_id: string | null
          vat_amount: number
        }
        Insert: {
          amount: number
          category_id: string
          classification: string
          created_at?: string
          created_by: string
          currency: string
          description: string
          earning_correction_of?: string | null
          earning_event_id?: string | null
          employee_id?: string | null
          expected_item_id?: string | null
          expense_policy_id?: string | null
          expense_receipt_id?: string | null
          fx_effective_date?: string | null
          fx_rate?: number | null
          fx_source?: string | null
          gross_amount: number
          id?: string
          kind?: string
          movement_id?: string | null
          obligation_id?: string | null
          period_end: string
          period_start: string
          project_id?: string | null
          reason: string
          recognized_on: string
          related_entry_id?: string | null
          reporting_amount?: number | null
          reporting_currency: string
          source_kind: string
          source_snapshot: Json
          studio_id: string
          terms_id?: string | null
          trip_effect_movement_id?: string | null
          trip_entry_id?: string | null
          vat_amount: number
        }
        Update: {
          amount?: number
          category_id?: string
          classification?: string
          created_at?: string
          created_by?: string
          currency?: string
          description?: string
          earning_correction_of?: string | null
          earning_event_id?: string | null
          employee_id?: string | null
          expected_item_id?: string | null
          expense_policy_id?: string | null
          expense_receipt_id?: string | null
          fx_effective_date?: string | null
          fx_rate?: number | null
          fx_source?: string | null
          gross_amount?: number
          id?: string
          kind?: string
          movement_id?: string | null
          obligation_id?: string | null
          period_end?: string
          period_start?: string
          project_id?: string | null
          reason?: string
          recognized_on?: string
          related_entry_id?: string | null
          reporting_amount?: number | null
          reporting_currency?: string
          source_kind?: string
          source_snapshot?: Json
          studio_id?: string
          terms_id?: string | null
          trip_effect_movement_id?: string | null
          trip_entry_id?: string | null
          vat_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "finance_recognition_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "finance_currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "finance_recognition_entries_project_id_studio_id_fkey"
            columns: ["project_id", "studio_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "studio_id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_reporting_currency_fkey"
            columns: ["reporting_currency"]
            isOneToOne: false
            referencedRelation: "finance_currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_category_id_fkey"
            columns: ["studio_id", "category_id"]
            isOneToOne: false
            referencedRelation: "finance_categories"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_earning_correction_o_fkey"
            columns: ["studio_id", "earning_correction_of"]
            isOneToOne: false
            referencedRelation: "finance_labor_cost_pools"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_earning_correction_o_fkey"
            columns: ["studio_id", "earning_correction_of"]
            isOneToOne: false
            referencedRelation: "finance_recognition_entries"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_earning_correction_o_fkey"
            columns: ["studio_id", "earning_correction_of"]
            isOneToOne: false
            referencedRelation: "finance_recognized_actuals"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_earning_event_id_fkey"
            columns: ["studio_id", "earning_event_id"]
            isOneToOne: false
            referencedRelation: "finance_project_earning_events"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_employee_id_fkey"
            columns: ["studio_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "studio_members"
            referencedColumns: ["studio_id", "user_id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_expected_item_id_fkey"
            columns: ["studio_id", "expected_item_id"]
            isOneToOne: false
            referencedRelation: "finance_expected_balances"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_expected_item_id_fkey"
            columns: ["studio_id", "expected_item_id"]
            isOneToOne: false
            referencedRelation: "finance_expected_items"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_expected_item_id_fkey"
            columns: ["studio_id", "expected_item_id"]
            isOneToOne: false
            referencedRelation: "finance_payroll_calendar"
            referencedColumns: ["studio_id", "expected_item_id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_expected_item_id_fkey"
            columns: ["studio_id", "expected_item_id"]
            isOneToOne: false
            referencedRelation: "finance_project_expected_balances"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_expected_item_id_fkey"
            columns: ["studio_id", "expected_item_id"]
            isOneToOne: false
            referencedRelation: "finance_project_plan_items"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_expense_policy_id_fkey"
            columns: ["studio_id", "expense_policy_id"]
            isOneToOne: false
            referencedRelation: "finance_expense_service_policies"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_expense_receipt_id_fkey"
            columns: ["studio_id", "expense_receipt_id"]
            isOneToOne: false
            referencedRelation: "finance_expense_receipts"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "finance_settings"
            referencedColumns: ["studio_id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_movement_id_fkey"
            columns: ["studio_id", "movement_id"]
            isOneToOne: false
            referencedRelation: "finance_actionable_unapplied"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_movement_id_fkey"
            columns: ["studio_id", "movement_id"]
            isOneToOne: false
            referencedRelation: "finance_current_movements"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_movement_id_fkey"
            columns: ["studio_id", "movement_id"]
            isOneToOne: false
            referencedRelation: "finance_movements"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_movement_id_fkey"
            columns: ["studio_id", "movement_id"]
            isOneToOne: false
            referencedRelation: "finance_payment_availability"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_obligation_id_fkey"
            columns: ["studio_id", "obligation_id"]
            isOneToOne: false
            referencedRelation: "finance_obligations"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_obligation_id_fkey"
            columns: ["studio_id", "obligation_id"]
            isOneToOne: false
            referencedRelation: "finance_payroll_unknown_costs"
            referencedColumns: ["studio_id", "obligation_id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_related_entry_id_fkey"
            columns: ["studio_id", "related_entry_id"]
            isOneToOne: false
            referencedRelation: "finance_labor_cost_pools"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_related_entry_id_fkey"
            columns: ["studio_id", "related_entry_id"]
            isOneToOne: false
            referencedRelation: "finance_recognition_entries"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_related_entry_id_fkey"
            columns: ["studio_id", "related_entry_id"]
            isOneToOne: false
            referencedRelation: "finance_recognized_actuals"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_terms_id_project_id_fkey"
            columns: ["studio_id", "terms_id", "project_id"]
            isOneToOne: false
            referencedRelation: "finance_project_current_terms"
            referencedColumns: ["studio_id", "id", "project_id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_terms_id_project_id_fkey"
            columns: ["studio_id", "terms_id", "project_id"]
            isOneToOne: false
            referencedRelation: "finance_project_terms"
            referencedColumns: ["studio_id", "id", "project_id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_trip_effect_movement_fkey"
            columns: ["studio_id", "trip_effect_movement_id"]
            isOneToOne: false
            referencedRelation: "finance_actionable_unapplied"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_trip_effect_movement_fkey"
            columns: ["studio_id", "trip_effect_movement_id"]
            isOneToOne: false
            referencedRelation: "finance_current_movements"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_trip_effect_movement_fkey"
            columns: ["studio_id", "trip_effect_movement_id"]
            isOneToOne: false
            referencedRelation: "finance_movements"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_trip_effect_movement_fkey"
            columns: ["studio_id", "trip_effect_movement_id"]
            isOneToOne: false
            referencedRelation: "finance_payment_availability"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_trip_entry_id_fkey"
            columns: ["studio_id", "trip_entry_id"]
            isOneToOne: false
            referencedRelation: "finance_trip_entries"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_trip_entry_id_fkey"
            columns: ["studio_id", "trip_entry_id"]
            isOneToOne: false
            referencedRelation: "finance_trip_entry_values"
            referencedColumns: ["studio_id", "id"]
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
      finance_report_coverage: {
        Row: {
          created_at: string
          created_by: string
          direct_costs_reviewed: boolean
          id: string
          labor_reviewed: boolean
          month: string
          overhead_reviewed: boolean
          project_id: string | null
          reason: string
          revenue_reviewed: boolean
          reviewed_through: string
          revision: number
          studio_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          direct_costs_reviewed: boolean
          id?: string
          labor_reviewed: boolean
          month: string
          overhead_reviewed: boolean
          project_id?: string | null
          reason: string
          revenue_reviewed: boolean
          reviewed_through: string
          revision: number
          studio_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          direct_costs_reviewed?: boolean
          id?: string
          labor_reviewed?: boolean
          month?: string
          overhead_reviewed?: boolean
          project_id?: string | null
          reason?: string
          revenue_reviewed?: boolean
          reviewed_through?: string
          revision?: number
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_report_coverage_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_report_coverage_project_id_studio_id_fkey"
            columns: ["project_id", "studio_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "studio_id"]
          },
          {
            foreignKeyName: "finance_report_coverage_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "finance_settings"
            referencedColumns: ["studio_id"]
          },
        ]
      }
      finance_schedule_terms: {
        Row: {
          amount: number | null
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
          pay_method: string
          payment_month_offset: number
          payout_day: number
          rate_per_m2: number | null
          reason: string
          revision: number
          schedule_id: string
          studio_id: string
        }
        Insert: {
          amount?: number | null
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
          pay_method?: string
          payment_month_offset?: number
          payout_day: number
          rate_per_m2?: number | null
          reason: string
          revision: number
          schedule_id: string
          studio_id: string
        }
        Update: {
          amount?: number | null
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
          pay_method?: string
          payment_month_offset?: number
          payout_day?: number
          rate_per_m2?: number | null
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
          recognition_enabled_at: string | null
          recognition_start_month: string | null
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
          recognition_enabled_at?: string | null
          recognition_start_month?: string | null
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
          recognition_enabled_at?: string | null
          recognition_start_month?: string | null
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
      finance_settlement_adjustments: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          currency: string
          expected_item_id: string
          explanation: string
          financial_date: string
          id: string
          reason: string
          reversed_adjustment_id: string | null
          studio_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by: string
          currency: string
          expected_item_id: string
          explanation?: string
          financial_date: string
          id?: string
          reason: string
          reversed_adjustment_id?: string | null
          studio_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          currency?: string
          expected_item_id?: string
          explanation?: string
          financial_date?: string
          id?: string
          reason?: string
          reversed_adjustment_id?: string | null
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_settlement_adjustment_studio_id_reversed_adjustmen_fkey"
            columns: [
              "studio_id",
              "reversed_adjustment_id",
              "expected_item_id",
              "currency",
            ]
            isOneToOne: false
            referencedRelation: "finance_settlement_adjustments"
            referencedColumns: [
              "studio_id",
              "id",
              "expected_item_id",
              "currency",
            ]
          },
          {
            foreignKeyName: "finance_settlement_adjustments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_settlement_adjustments_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "finance_currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "finance_settlement_adjustments_studio_id_expected_item_id_fkey"
            columns: ["studio_id", "expected_item_id"]
            isOneToOne: false
            referencedRelation: "finance_expected_balances"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_settlement_adjustments_studio_id_expected_item_id_fkey"
            columns: ["studio_id", "expected_item_id"]
            isOneToOne: false
            referencedRelation: "finance_expected_items"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_settlement_adjustments_studio_id_expected_item_id_fkey"
            columns: ["studio_id", "expected_item_id"]
            isOneToOne: false
            referencedRelation: "finance_payroll_calendar"
            referencedColumns: ["studio_id", "expected_item_id"]
          },
          {
            foreignKeyName: "finance_settlement_adjustments_studio_id_expected_item_id_fkey"
            columns: ["studio_id", "expected_item_id"]
            isOneToOne: false
            referencedRelation: "finance_project_expected_balances"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_settlement_adjustments_studio_id_expected_item_id_fkey"
            columns: ["studio_id", "expected_item_id"]
            isOneToOne: false
            referencedRelation: "finance_project_plan_items"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_settlement_adjustments_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "finance_settings"
            referencedColumns: ["studio_id"]
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
            referencedRelation: "finance_current_movements"
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
          deleted_at: string | null
          display_name: string | null
          display_order: number
          enabled_statuses: string[]
          is_enabled: boolean
          kind: string
          progress_method: string
          progress_weight: number
          project_id: string
          schedule_anchor_date: string | null
          schedule_pause_reason: string | null
          schedule_paused_on: string | null
          stage: string
          updated_at: string
        }
        Insert: {
          deleted_at?: string | null
          display_name?: string | null
          display_order: number
          enabled_statuses?: string[]
          is_enabled?: boolean
          kind?: string
          progress_method?: string
          progress_weight?: number
          project_id: string
          schedule_anchor_date?: string | null
          schedule_pause_reason?: string | null
          schedule_paused_on?: string | null
          stage: string
          updated_at?: string
        }
        Update: {
          deleted_at?: string | null
          display_name?: string | null
          display_order?: number
          enabled_statuses?: string[]
          is_enabled?: boolean
          kind?: string
          progress_method?: string
          progress_weight?: number
          project_id?: string
          schedule_anchor_date?: string | null
          schedule_pause_reason?: string | null
          schedule_paused_on?: string | null
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
          checklist_template_id: string | null
          created_at: string
          dependency_mode: string
          depends_on_positions: number[]
          expected_workdays: number | null
          id: string
          position: number
          priority: string
          stage: string
          template_id: string
          title: string
          updated_at: string
        }
        Insert: {
          checklist_template_id?: string | null
          created_at?: string
          dependency_mode?: string
          depends_on_positions?: number[]
          expected_workdays?: number | null
          id?: string
          position: number
          priority?: string
          stage: string
          template_id: string
          title: string
          updated_at?: string
        }
        Update: {
          checklist_template_id?: string | null
          created_at?: string
          dependency_mode?: string
          depends_on_positions?: number[]
          expected_workdays?: number | null
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
            foreignKeyName: "project_template_tasks_checklist_template_id_fkey"
            columns: ["checklist_template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
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
          show_progress: boolean
          site_address: string | null
          stage_configuration_version: number
          start_date: string | null
          started_at: string | null
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
          show_progress?: boolean
          site_address?: string | null
          stage_configuration_version?: number
          start_date?: string | null
          started_at?: string | null
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
          show_progress?: boolean
          site_address?: string | null
          stage_configuration_version?: number
          start_date?: string | null
          started_at?: string | null
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
      review_timer_buckets: {
        Row: {
          allocation: Json
          elapsed_us: number
          membership_key: string
          minutes: number
          round_ids: string[]
          studio_id: string
          user_id: string
          work_date: string
        }
        Insert: {
          allocation?: Json
          elapsed_us?: number
          membership_key: string
          minutes?: number
          round_ids: string[]
          studio_id: string
          user_id: string
          work_date: string
        }
        Update: {
          allocation?: Json
          elapsed_us?: number
          membership_key?: string
          minutes?: number
          round_ids?: string[]
          studio_id?: string
          user_id?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_timer_buckets_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_timer_buckets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      review_timer_daily: {
        Row: {
          carry_minutes: number
          elapsed_us: number
          minutes: number
          round_id: string
          studio_id: string
          user_id: string
          work_date: string
        }
        Insert: {
          carry_minutes?: number
          elapsed_us?: number
          minutes?: number
          round_id: string
          studio_id: string
          user_id: string
          work_date: string
        }
        Update: {
          carry_minutes?: number
          elapsed_us?: number
          minutes?: number
          round_id?: string
          studio_id?: string
          user_id?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_timer_daily_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "task_review_rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_timer_daily_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_timer_daily_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      review_timer_intervals: {
        Row: {
          ended_at: string | null
          session_id: string
          started_at: string
        }
        Insert: {
          ended_at?: string | null
          session_id: string
          started_at: string
        }
        Update: {
          ended_at?: string | null
          session_id?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_timer_intervals_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "review_timer_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      review_timer_members: {
        Row: {
          finished_at: string | null
          round_id: string
          session_id: string
        }
        Insert: {
          finished_at?: string | null
          round_id: string
          session_id: string
        }
        Update: {
          finished_at?: string | null
          round_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_timer_members_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "task_review_rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_timer_members_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "review_timer_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      review_timer_sessions: {
        Row: {
          accounted_at: string | null
          elapsed_us: number
          id: string
          paused_at: string | null
          running_since: string | null
          started_at: string
          state: string
          studio_id: string
          user_id: string
          work_session_id: string
        }
        Insert: {
          accounted_at?: string | null
          elapsed_us?: number
          id: string
          paused_at?: string | null
          running_since?: string | null
          started_at?: string
          state: string
          studio_id: string
          user_id: string
          work_session_id?: string
        }
        Update: {
          accounted_at?: string | null
          elapsed_us?: number
          id?: string
          paused_at?: string | null
          running_since?: string | null
          started_at?: string
          state?: string
          studio_id?: string
          user_id?: string
          work_session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_timer_sessions_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_timer_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          vacation_opening_date: string | null
          vacation_opening_days: number | null
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
          vacation_opening_date?: string | null
          vacation_opening_days?: number | null
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
          vacation_opening_date?: string | null
          vacation_opening_days?: number | null
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
          business_address: string | null
          contact_person: string | null
          created_at: string
          email: string | null
          id: string
          leaderboard_bonuses_enabled: boolean
          leaderboard_visible_to_employees: boolean
          name: string
          phone: string | null
          productivity_stage_1_percent: number
          standard_workday_minutes: number
          updated_at: string
          vacation_visible_to_employees: boolean
          website: string | null
        }
        Insert: {
          business_address?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          leaderboard_bonuses_enabled?: boolean
          leaderboard_visible_to_employees?: boolean
          name: string
          phone?: string | null
          productivity_stage_1_percent?: number
          standard_workday_minutes?: number
          updated_at?: string
          vacation_visible_to_employees?: boolean
          website?: string | null
        }
        Update: {
          business_address?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          leaderboard_bonuses_enabled?: boolean
          leaderboard_visible_to_employees?: boolean
          name?: string
          phone?: string | null
          productivity_stage_1_percent?: number
          standard_workday_minutes?: number
          updated_at?: string
          vacation_visible_to_employees?: boolean
          website?: string | null
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
          is_not_needed: boolean
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
          is_not_needed?: boolean
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
          is_not_needed?: boolean
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
      task_review_round_reviewers: {
        Row: {
          approved_at: string | null
          position: number
          reviewer_id: string
          round_id: string
        }
        Insert: {
          approved_at?: string | null
          position: number
          reviewer_id: string
          round_id: string
        }
        Update: {
          approved_at?: string | null
          position?: number
          reviewer_id?: string
          round_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_review_round_reviewers_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_review_round_reviewers_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "task_review_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      task_review_rounds: {
        Row: {
          completed_at: string | null
          id: string
          project_id: string
          result: string | null
          reviewer_id: string
          rework_comment: string | null
          round_number: number
          submitted_at: string
          task_id: string
        }
        Insert: {
          completed_at?: string | null
          id?: string
          project_id: string
          result?: string | null
          reviewer_id: string
          rework_comment?: string | null
          round_number: number
          submitted_at?: string
          task_id: string
        }
        Update: {
          completed_at?: string | null
          id?: string
          project_id?: string
          result?: string | null
          reviewer_id?: string
          rework_comment?: string | null
          round_number?: number
          submitted_at?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_review_rounds_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_review_rounds_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_review_rounds_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_reviewers: {
        Row: {
          position: number
          reviewer_id: string
          task_id: string
        }
        Insert: {
          position: number
          reviewer_id: string
          task_id: string
        }
        Update: {
          position?: number
          reviewer_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_reviewers_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_reviewers_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_schedule_dependencies: {
        Row: {
          predecessor_task_id: string
          task_id: string
        }
        Insert: {
          predecessor_task_id: string
          task_id: string
        }
        Update: {
          predecessor_task_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_schedule_dependencies_predecessor_task_id_fkey"
            columns: ["predecessor_task_id"]
            isOneToOne: false
            referencedRelation: "task_schedules"
            referencedColumns: ["task_id"]
          },
          {
            foreignKeyName: "task_schedule_dependencies_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "task_schedules"
            referencedColumns: ["task_id"]
          },
        ]
      }
      task_schedules: {
        Row: {
          baseline_due: string
          baseline_start: string
          current_due: string
          current_start: string
          expected_workdays: number
          is_blocked: boolean
          is_paused: boolean
          project_id: string
          sort_order: number
          stage: string
          task_id: string
        }
        Insert: {
          baseline_due: string
          baseline_start: string
          current_due: string
          current_start: string
          expected_workdays: number
          is_blocked?: boolean
          is_paused?: boolean
          project_id: string
          sort_order: number
          stage: string
          task_id: string
        }
        Update: {
          baseline_due?: string
          baseline_start?: string
          current_due?: string
          current_start?: string
          expected_workdays?: number
          is_blocked?: boolean
          is_paused?: boolean
          project_id?: string
          sort_order?: number
          stage?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_schedules_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_schedules_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: true
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_status_periods: {
        Row: {
          entered_at: string
          exited_at: string | null
          id: number
          project_id: string
          status: string
          studio_id: string
          task_id: string
        }
        Insert: {
          entered_at: string
          exited_at?: string | null
          id?: never
          project_id: string
          status: string
          studio_id: string
          task_id: string
        }
        Update: {
          entered_at?: string
          exited_at?: string | null
          id?: never
          project_id?: string
          status?: string
          studio_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_status_periods_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_status_periods_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_status_periods_task_id_fkey"
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
          checklist_template_id: string | null
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
          requires_review: boolean
          reviewer_id: string | null
          stage: string
          stage_position: number
          start_date: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          checklist_template_id?: string | null
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
          requires_review?: boolean
          reviewer_id?: string | null
          stage?: string
          stage_position?: number
          start_date?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          checklist_template_id?: string | null
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
          requires_review?: boolean
          reviewer_id?: string | null
          stage?: string
          stage_position?: number
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
            foreignKeyName: "tasks_checklist_template_id_fkey"
            columns: ["checklist_template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
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
          {
            foreignKeyName: "tasks_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      web_push_deliveries: {
        Row: {
          attempts: number
          completed_at: string | null
          id: string
          last_status: number | null
          lease_token: string | null
          next_attempt_at: string
          notification_id: string
          subscription_id: string
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          id?: string
          last_status?: number | null
          lease_token?: string | null
          next_attempt_at?: string
          notification_id: string
          subscription_id: string
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          id?: string
          last_status?: number | null
          lease_token?: string | null
          next_attempt_at?: string
          notification_id?: string
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "web_push_deliveries_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "web_push_deliveries_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "web_push_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      web_push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          locale: string
          p256dh: string
          session_id: string
          user_id: string
          vapid_public_key: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          locale?: string
          p256dh: string
          session_id: string
          user_id: string
          vapid_public_key: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          locale?: string
          p256dh?: string
          session_id?: string
          user_id?: string
          vapid_public_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "web_push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      work_log_day_revisions: {
        Row: {
          created_at: string
          entries: Json
          id: number
          studio_id: string
          user_id: string
          work_date: string
        }
        Insert: {
          created_at?: string
          entries: Json
          id?: never
          studio_id: string
          user_id: string
          work_date: string
        }
        Update: {
          created_at?: string
          entries?: Json
          id?: never
          studio_id?: string
          user_id?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_log_day_revisions_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_log_day_revisions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      work_log_days: {
        Row: {
          studio_id: string
          submitted_at: string
          user_id: string
          work_date: string
        }
        Insert: {
          studio_id: string
          submitted_at?: string
          user_id: string
          work_date: string
        }
        Update: {
          studio_id?: string
          submitted_at?: string
          user_id?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_log_days_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_log_days_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      work_log_entries: {
        Row: {
          activity_kind: string
          created_at: string
          id: string
          internal_activity_type: string | null
          minutes: number
          review_round_id: string | null
          studio_id: string
          task_id: string | null
          updated_at: string
          user_id: string
          work_date: string
        }
        Insert: {
          activity_kind: string
          created_at?: string
          id?: string
          internal_activity_type?: string | null
          minutes: number
          review_round_id?: string | null
          studio_id: string
          task_id?: string | null
          updated_at?: string
          user_id: string
          work_date: string
        }
        Update: {
          activity_kind?: string
          created_at?: string
          id?: string
          internal_activity_type?: string | null
          minutes?: number
          review_round_id?: string | null
          studio_id?: string
          task_id?: string | null
          updated_at?: string
          user_id?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_log_entries_review_round_id_task_id_fkey"
            columns: ["review_round_id", "task_id"]
            isOneToOne: false
            referencedRelation: "task_review_rounds"
            referencedColumns: ["id", "task_id"]
          },
          {
            foreignKeyName: "work_log_entries_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_log_entries_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_log_entries_user_id_fkey"
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
          ledger_entry_count: number | null
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
            referencedRelation: "finance_current_movements"
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
      finance_current_labor_allocations: {
        Row: {
          amount: number | null
          created_at: string | null
          created_by: string | null
          entry_id: string | null
          id: string | null
          method: string | null
          project_id: string | null
          reason: string | null
          revision: number | null
          revision_id: string | null
          studio_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_labor_allocation_items_project_id_studio_id_fkey"
            columns: ["project_id", "studio_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "studio_id"]
          },
          {
            foreignKeyName: "finance_labor_allocation_items_studio_id_revision_id_fkey"
            columns: ["studio_id", "revision_id"]
            isOneToOne: false
            referencedRelation: "finance_labor_allocation_revisions"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_labor_allocation_revisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_current_movements: {
        Row: {
          category: string | null
          category_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          financial_date: string | null
          id: string | null
          kind: string | null
          nature: string | null
          posting_order: number | null
          related_movement_id: string | null
          request_id: string | null
          request_payload: Json | null
          studio_id: string | null
        }
        Insert: {
          category?: string | null
          category_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          financial_date?: string | null
          id?: string | null
          kind?: string | null
          nature?: string | null
          posting_order?: number | null
          related_movement_id?: string | null
          request_id?: string | null
          request_payload?: Json | null
          studio_id?: string | null
        }
        Update: {
          category?: string | null
          category_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          financial_date?: string | null
          id?: string | null
          kind?: string | null
          nature?: string | null
          posting_order?: number | null
          related_movement_id?: string | null
          request_id?: string | null
          request_payload?: Json | null
          studio_id?: string | null
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
            referencedRelation: "finance_current_movements"
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
      finance_current_report_coverage: {
        Row: {
          changed_since_review: boolean | null
          created_at: string | null
          created_by: string | null
          direct_costs_reviewed: boolean | null
          id: string | null
          labor_reviewed: boolean | null
          month: string | null
          overhead_reviewed: boolean | null
          project_id: string | null
          reason: string | null
          revenue_reviewed: boolean | null
          reviewed_through: string | null
          revision: number | null
          studio_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_report_coverage_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_report_coverage_project_id_studio_id_fkey"
            columns: ["project_id", "studio_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "studio_id"]
          },
          {
            foreignKeyName: "finance_report_coverage_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "finance_settings"
            referencedColumns: ["studio_id"]
          },
        ]
      }
      finance_current_scenarios: {
        Row: {
          assumptions: Json | null
          base_snapshot_id: string | null
          created_at: string | null
          created_by: string | null
          id: string | null
          name: string | null
          reason: string | null
          revision: number | null
          scenario_id: string | null
          studio_id: string | null
        }
        Insert: {
          assumptions?: Json | null
          base_snapshot_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string | null
          name?: string | null
          reason?: string | null
          revision?: number | null
          scenario_id?: string | null
          studio_id?: string | null
        }
        Update: {
          assumptions?: Json | null
          base_snapshot_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string | null
          name?: string | null
          reason?: string | null
          revision?: number | null
          scenario_id?: string | null
          studio_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_forecast_scenario_revis_studio_id_base_snapshot_id_fkey"
            columns: ["studio_id", "base_snapshot_id"]
            isOneToOne: false
            referencedRelation: "finance_forecast_snapshots"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_forecast_scenario_revisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_forecast_scenario_revisions_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "finance_settings"
            referencedColumns: ["studio_id"]
          },
          {
            foreignKeyName: "finance_forecast_scenario_revisions_studio_id_scenario_id_fkey"
            columns: ["studio_id", "scenario_id"]
            isOneToOne: false
            referencedRelation: "finance_forecast_scenarios"
            referencedColumns: ["studio_id", "id"]
          },
        ]
      }
      finance_expected_balances: {
        Row: {
          adjustment_amount: number | null
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
          net_amount: number | null
          outstanding_amount: number | null
          overpaid_amount: number | null
          payment_state: string | null
          price_basis: string | null
          remaining_amount: number | null
          settled_amount: number | null
          studio_id: string | null
          updated_at: string | null
          vat_amount: number | null
          vat_rate: number | null
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
      finance_labor_cost_pools: {
        Row: {
          allocated_amount: number | null
          allocation_revision: number | null
          amount: number | null
          available_native_amount: number | null
          available_reporting_amount: number | null
          category_id: string | null
          classification: string | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          description: string | null
          employee_id: string | null
          expected_item_id: string | null
          fx_effective_date: string | null
          fx_rate: number | null
          fx_source: string | null
          gross_amount: number | null
          id: string | null
          kind: string | null
          movement_id: string | null
          obligation_id: string | null
          period_end: string | null
          period_start: string | null
          project_id: string | null
          reason: string | null
          recognized_on: string | null
          related_entry_id: string | null
          reporting_amount: number | null
          reporting_currency: string | null
          source_kind: string | null
          source_snapshot: Json | null
          studio_id: string | null
          terms_id: string | null
          vat_amount: number | null
        }
        Insert: {
          allocated_amount?: never
          allocation_revision?: never
          amount?: number | null
          available_native_amount?: never
          available_reporting_amount?: never
          category_id?: string | null
          classification?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          description?: string | null
          employee_id?: string | null
          expected_item_id?: string | null
          fx_effective_date?: string | null
          fx_rate?: number | null
          fx_source?: string | null
          gross_amount?: number | null
          id?: string | null
          kind?: string | null
          movement_id?: string | null
          obligation_id?: string | null
          period_end?: string | null
          period_start?: string | null
          project_id?: string | null
          reason?: string | null
          recognized_on?: string | null
          related_entry_id?: string | null
          reporting_amount?: number | null
          reporting_currency?: string | null
          source_kind?: string | null
          source_snapshot?: Json | null
          studio_id?: string | null
          terms_id?: string | null
          vat_amount?: number | null
        }
        Update: {
          allocated_amount?: never
          allocation_revision?: never
          amount?: number | null
          available_native_amount?: never
          available_reporting_amount?: never
          category_id?: string | null
          classification?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          description?: string | null
          employee_id?: string | null
          expected_item_id?: string | null
          fx_effective_date?: string | null
          fx_rate?: number | null
          fx_source?: string | null
          gross_amount?: number | null
          id?: string | null
          kind?: string | null
          movement_id?: string | null
          obligation_id?: string | null
          period_end?: string | null
          period_start?: string | null
          project_id?: string | null
          reason?: string | null
          recognized_on?: string | null
          related_entry_id?: string | null
          reporting_amount?: number | null
          reporting_currency?: string | null
          source_kind?: string | null
          source_snapshot?: Json | null
          studio_id?: string | null
          terms_id?: string | null
          vat_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_recognition_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "finance_currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "finance_recognition_entries_project_id_studio_id_fkey"
            columns: ["project_id", "studio_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "studio_id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_reporting_currency_fkey"
            columns: ["reporting_currency"]
            isOneToOne: false
            referencedRelation: "finance_currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_category_id_fkey"
            columns: ["studio_id", "category_id"]
            isOneToOne: false
            referencedRelation: "finance_categories"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_employee_id_fkey"
            columns: ["studio_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "studio_members"
            referencedColumns: ["studio_id", "user_id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_expected_item_id_fkey"
            columns: ["studio_id", "expected_item_id"]
            isOneToOne: false
            referencedRelation: "finance_expected_balances"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_expected_item_id_fkey"
            columns: ["studio_id", "expected_item_id"]
            isOneToOne: false
            referencedRelation: "finance_expected_items"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_expected_item_id_fkey"
            columns: ["studio_id", "expected_item_id"]
            isOneToOne: false
            referencedRelation: "finance_payroll_calendar"
            referencedColumns: ["studio_id", "expected_item_id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_expected_item_id_fkey"
            columns: ["studio_id", "expected_item_id"]
            isOneToOne: false
            referencedRelation: "finance_project_expected_balances"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_expected_item_id_fkey"
            columns: ["studio_id", "expected_item_id"]
            isOneToOne: false
            referencedRelation: "finance_project_plan_items"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "finance_settings"
            referencedColumns: ["studio_id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_movement_id_fkey"
            columns: ["studio_id", "movement_id"]
            isOneToOne: false
            referencedRelation: "finance_actionable_unapplied"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_movement_id_fkey"
            columns: ["studio_id", "movement_id"]
            isOneToOne: false
            referencedRelation: "finance_current_movements"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_movement_id_fkey"
            columns: ["studio_id", "movement_id"]
            isOneToOne: false
            referencedRelation: "finance_movements"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_movement_id_fkey"
            columns: ["studio_id", "movement_id"]
            isOneToOne: false
            referencedRelation: "finance_payment_availability"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_obligation_id_fkey"
            columns: ["studio_id", "obligation_id"]
            isOneToOne: false
            referencedRelation: "finance_obligations"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_obligation_id_fkey"
            columns: ["studio_id", "obligation_id"]
            isOneToOne: false
            referencedRelation: "finance_payroll_unknown_costs"
            referencedColumns: ["studio_id", "obligation_id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_related_entry_id_fkey"
            columns: ["studio_id", "related_entry_id"]
            isOneToOne: false
            referencedRelation: "finance_labor_cost_pools"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_related_entry_id_fkey"
            columns: ["studio_id", "related_entry_id"]
            isOneToOne: false
            referencedRelation: "finance_recognition_entries"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_related_entry_id_fkey"
            columns: ["studio_id", "related_entry_id"]
            isOneToOne: false
            referencedRelation: "finance_recognized_actuals"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_terms_id_project_id_fkey"
            columns: ["studio_id", "terms_id", "project_id"]
            isOneToOne: false
            referencedRelation: "finance_project_current_terms"
            referencedColumns: ["studio_id", "id", "project_id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_terms_id_project_id_fkey"
            columns: ["studio_id", "terms_id", "project_id"]
            isOneToOne: false
            referencedRelation: "finance_project_terms"
            referencedColumns: ["studio_id", "id", "project_id"]
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
      finance_payroll_credit_availability: {
        Row: {
          created_at: string | null
          created_by: string | null
          credit_amount: number | null
          credit_available: number | null
          credit_currency: string | null
          credit_rate: number | null
          credit_source: string | null
          employee_id: string | null
          financial_date: string | null
          movement_id: string | null
          obligation_id: string | null
          studio_id: string | null
          unapplied_amount: number | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_payroll_cash_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_payroll_cash_credit_currency_fkey"
            columns: ["credit_currency"]
            isOneToOne: false
            referencedRelation: "finance_currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "finance_payroll_cash_studio_id_employee_id_fkey"
            columns: ["studio_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "studio_members"
            referencedColumns: ["studio_id", "user_id"]
          },
          {
            foreignKeyName: "finance_payroll_cash_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "finance_settings"
            referencedColumns: ["studio_id"]
          },
          {
            foreignKeyName: "finance_payroll_cash_studio_id_movement_id_fkey"
            columns: ["studio_id", "movement_id"]
            isOneToOne: true
            referencedRelation: "finance_actionable_unapplied"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_payroll_cash_studio_id_movement_id_fkey"
            columns: ["studio_id", "movement_id"]
            isOneToOne: true
            referencedRelation: "finance_current_movements"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_payroll_cash_studio_id_movement_id_fkey"
            columns: ["studio_id", "movement_id"]
            isOneToOne: true
            referencedRelation: "finance_movements"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_payroll_cash_studio_id_movement_id_fkey"
            columns: ["studio_id", "movement_id"]
            isOneToOne: true
            referencedRelation: "finance_payment_availability"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_payroll_cash_studio_id_obligation_id_fkey"
            columns: ["studio_id", "obligation_id"]
            isOneToOne: false
            referencedRelation: "finance_obligations"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_payroll_cash_studio_id_obligation_id_fkey"
            columns: ["studio_id", "obligation_id"]
            isOneToOne: false
            referencedRelation: "finance_payroll_unknown_costs"
            referencedColumns: ["studio_id", "obligation_id"]
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
      finance_project_cash_events: {
        Row: {
          amount: number | null
          currency: string | null
          financial_date: string | null
          fx_effective_date: string | null
          fx_rate: number | null
          fx_source: string | null
          movement_id: string | null
          project_id: string | null
          reason: string | null
          reporting_currency: string | null
          revision: number | null
          source_amount: number | null
          source_reporting_amount: number | null
          studio_id: string | null
        }
        Relationships: []
      }
      finance_project_cash_net: {
        Row: {
          amount: number | null
          created_at: string | null
          movement_id: string | null
          net_amount: number | null
          project_id: string | null
          reason: string | null
          revision: number | null
          revision_id: string | null
          studio_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_project_cash_items_project_id_studio_id_fkey"
            columns: ["project_id", "studio_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "studio_id"]
          },
          {
            foreignKeyName: "finance_project_cash_items_studio_id_revision_id_fkey"
            columns: ["studio_id", "revision_id"]
            isOneToOne: false
            referencedRelation: "finance_project_cash_revisions"
            referencedColumns: ["studio_id", "id"]
          },
        ]
      }
      finance_project_cash_raw: {
        Row: {
          amount: number | null
          created_at: string | null
          movement_id: string | null
          project_id: string | null
          reason: string | null
          revision: number | null
          revision_id: string | null
          studio_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_project_cash_items_project_id_studio_id_fkey"
            columns: ["project_id", "studio_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "studio_id"]
          },
          {
            foreignKeyName: "finance_project_cash_items_studio_id_revision_id_fkey"
            columns: ["studio_id", "revision_id"]
            isOneToOne: false
            referencedRelation: "finance_project_cash_revisions"
            referencedColumns: ["studio_id", "id"]
          },
        ]
      }
      finance_project_current_cost_estimates: {
        Row: {
          as_of: string | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          direct_budget: number | null
          fx_effective_date: string | null
          fx_rate: number | null
          fx_source: string | null
          id: string | null
          labor_budget: number | null
          project_id: string | null
          reason: string | null
          remaining_direct: number | null
          remaining_labor: number | null
          reporting_currency: string | null
          revision: number | null
          source_digest: string | null
          studio_id: string | null
        }
        Insert: {
          as_of?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          direct_budget?: number | null
          fx_effective_date?: string | null
          fx_rate?: number | null
          fx_source?: string | null
          id?: string | null
          labor_budget?: number | null
          project_id?: string | null
          reason?: string | null
          remaining_direct?: number | null
          remaining_labor?: number | null
          reporting_currency?: string | null
          revision?: number | null
          source_digest?: string | null
          studio_id?: string | null
        }
        Update: {
          as_of?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          direct_budget?: number | null
          fx_effective_date?: string | null
          fx_rate?: number | null
          fx_source?: string | null
          id?: string | null
          labor_budget?: number | null
          project_id?: string | null
          reason?: string | null
          remaining_direct?: number | null
          remaining_labor?: number | null
          reporting_currency?: string | null
          revision?: number | null
          source_digest?: string | null
          studio_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_project_cost_estimate_studio_id_reporting_currency_fkey"
            columns: ["studio_id", "reporting_currency"]
            isOneToOne: false
            referencedRelation: "finance_settings"
            referencedColumns: ["studio_id", "base_currency"]
          },
          {
            foreignKeyName: "finance_project_cost_estimates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_project_cost_estimates_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "finance_currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "finance_project_cost_estimates_project_id_studio_id_fkey"
            columns: ["project_id", "studio_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "studio_id"]
          },
        ]
      }
      finance_project_current_terms: {
        Row: {
          amount: number | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          discount_amount: number | null
          discount_type: string | null
          discount_value: number | null
          effective_from: string | null
          effective_through: string | null
          gross_amount: number | null
          id: string | null
          mode: string | null
          net_amount: number | null
          order_id: string | null
          price_basis: string | null
          project_id: string | null
          reason: string | null
          revenue_tax_rate: number | null
          revision: number | null
          stream: string | null
          studio_id: string | null
          vat_amount: number | null
          vat_rate: number | null
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
            foreignKeyName: "finance_project_terms_order_fk"
            columns: ["studio_id", "order_id", "project_id"]
            isOneToOne: false
            referencedRelation: "finance_project_orders"
            referencedColumns: ["studio_id", "id", "project_id"]
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
          adjustment_amount: number | null
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
          net_amount: number | null
          order_created_at: string | null
          order_id: string | null
          order_is_default: boolean | null
          order_name: string | null
          outstanding_amount: number | null
          payment_state: string | null
          period_start: string | null
          price_basis: string | null
          project_id: string | null
          remaining_amount: number | null
          schedule_position: number | null
          settled_amount: number | null
          source: string | null
          stream: string | null
          studio_id: string | null
          updated_at: string | null
          vat_amount: number | null
          vat_rate: number | null
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
      finance_project_order_totals: {
        Row: {
          closed_amount: number | null
          collected_amount: number | null
          collected_net_amount: number | null
          collected_vat_amount: number | null
          contract_amount: number | null
          contract_gross_amount: number | null
          contract_net_amount: number | null
          contract_vat_amount: number | null
          currency: string | null
          has_payment_history: boolean | null
          order_id: string | null
          outstanding_amount: number | null
          payment_count: number | null
          planned_amount: number | null
          project_id: string | null
          scheduled_amount: number | null
          scheduled_net_amount: number | null
          scheduled_vat_amount: number | null
          stream: string | null
          studio_id: string | null
          unscheduled_amount: number | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_project_terms_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "finance_currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "finance_project_terms_order_fk"
            columns: ["studio_id", "order_id", "project_id"]
            isOneToOne: false
            referencedRelation: "finance_project_orders"
            referencedColumns: ["studio_id", "id", "project_id"]
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
      finance_project_payment_context: {
        Row: {
          movement_id: string | null
          order_id: string | null
          project_id: string | null
          studio_id: string | null
        }
        Relationships: []
      }
      finance_project_plan_items: {
        Row: {
          adjustment_amount: number | null
          amount: number | null
          category_id: string | null
          certainty: string | null
          client_note: string | null
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
          net_amount: number | null
          order_id: string | null
          outstanding_amount: number | null
          payment_state: string | null
          period_start: string | null
          price_basis: string | null
          project_id: string | null
          remaining_amount: number | null
          schedule_percentage: number | null
          settled_amount: number | null
          source: string | null
          stream: string | null
          studio_id: string | null
          updated_at: string | null
          vat_amount: number | null
          vat_rate: number | null
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
          closed_amount: number | null
          collected_amount: number | null
          collected_net_amount: number | null
          collected_vat_amount: number | null
          contract_amount: number | null
          contract_gross_amount: number | null
          contract_net_amount: number | null
          contract_vat_amount: number | null
          currency: string | null
          outstanding_amount: number | null
          planned_amount: number | null
          project_id: string | null
          scheduled_amount: number | null
          scheduled_net_amount: number | null
          scheduled_vat_amount: number | null
          stream: string | null
          studio_id: string | null
          unscheduled_amount: number | null
        }
        Relationships: []
      }
      finance_project_vat_actuals: {
        Row: {
          financial_date: string | null
          studio_id: string | null
          vat_reporting_amount: number | null
        }
        Relationships: []
      }
      finance_recognized_actuals: {
        Row: {
          amount: number | null
          category_id: string | null
          classification: string | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          description: string | null
          employee_id: string | null
          expected_item_id: string | null
          fx_effective_date: string | null
          fx_rate: number | null
          fx_source: string | null
          gross_amount: number | null
          id: string | null
          kind: string | null
          movement_id: string | null
          obligation_id: string | null
          period_end: string | null
          period_start: string | null
          project_id: string | null
          reason: string | null
          recognized_on: string | null
          related_entry_id: string | null
          reporting_amount: number | null
          reporting_currency: string | null
          source_kind: string | null
          source_snapshot: Json | null
          studio_id: string | null
          terms_id: string | null
          trip_effect_movement_id: string | null
          trip_entry_id: string | null
          vat_amount: number | null
        }
        Insert: {
          amount?: number | null
          category_id?: string | null
          classification?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          description?: string | null
          employee_id?: string | null
          expected_item_id?: string | null
          fx_effective_date?: string | null
          fx_rate?: number | null
          fx_source?: string | null
          gross_amount?: number | null
          id?: string | null
          kind?: string | null
          movement_id?: string | null
          obligation_id?: string | null
          period_end?: string | null
          period_start?: string | null
          project_id?: string | null
          reason?: string | null
          recognized_on?: string | null
          related_entry_id?: string | null
          reporting_amount?: number | null
          reporting_currency?: string | null
          source_kind?: string | null
          source_snapshot?: Json | null
          studio_id?: string | null
          terms_id?: string | null
          trip_effect_movement_id?: string | null
          trip_entry_id?: string | null
          vat_amount?: number | null
        }
        Update: {
          amount?: number | null
          category_id?: string | null
          classification?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          description?: string | null
          employee_id?: string | null
          expected_item_id?: string | null
          fx_effective_date?: string | null
          fx_rate?: number | null
          fx_source?: string | null
          gross_amount?: number | null
          id?: string | null
          kind?: string | null
          movement_id?: string | null
          obligation_id?: string | null
          period_end?: string | null
          period_start?: string | null
          project_id?: string | null
          reason?: string | null
          recognized_on?: string | null
          related_entry_id?: string | null
          reporting_amount?: number | null
          reporting_currency?: string | null
          source_kind?: string | null
          source_snapshot?: Json | null
          studio_id?: string | null
          terms_id?: string | null
          trip_effect_movement_id?: string | null
          trip_entry_id?: string | null
          vat_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_recognition_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "finance_currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "finance_recognition_entries_project_id_studio_id_fkey"
            columns: ["project_id", "studio_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "studio_id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_reporting_currency_fkey"
            columns: ["reporting_currency"]
            isOneToOne: false
            referencedRelation: "finance_currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_category_id_fkey"
            columns: ["studio_id", "category_id"]
            isOneToOne: false
            referencedRelation: "finance_categories"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_employee_id_fkey"
            columns: ["studio_id", "employee_id"]
            isOneToOne: false
            referencedRelation: "studio_members"
            referencedColumns: ["studio_id", "user_id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_expected_item_id_fkey"
            columns: ["studio_id", "expected_item_id"]
            isOneToOne: false
            referencedRelation: "finance_expected_balances"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_expected_item_id_fkey"
            columns: ["studio_id", "expected_item_id"]
            isOneToOne: false
            referencedRelation: "finance_expected_items"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_expected_item_id_fkey"
            columns: ["studio_id", "expected_item_id"]
            isOneToOne: false
            referencedRelation: "finance_payroll_calendar"
            referencedColumns: ["studio_id", "expected_item_id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_expected_item_id_fkey"
            columns: ["studio_id", "expected_item_id"]
            isOneToOne: false
            referencedRelation: "finance_project_expected_balances"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_expected_item_id_fkey"
            columns: ["studio_id", "expected_item_id"]
            isOneToOne: false
            referencedRelation: "finance_project_plan_items"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "finance_settings"
            referencedColumns: ["studio_id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_movement_id_fkey"
            columns: ["studio_id", "movement_id"]
            isOneToOne: false
            referencedRelation: "finance_actionable_unapplied"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_movement_id_fkey"
            columns: ["studio_id", "movement_id"]
            isOneToOne: false
            referencedRelation: "finance_current_movements"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_movement_id_fkey"
            columns: ["studio_id", "movement_id"]
            isOneToOne: false
            referencedRelation: "finance_movements"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_movement_id_fkey"
            columns: ["studio_id", "movement_id"]
            isOneToOne: false
            referencedRelation: "finance_payment_availability"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_obligation_id_fkey"
            columns: ["studio_id", "obligation_id"]
            isOneToOne: false
            referencedRelation: "finance_obligations"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_obligation_id_fkey"
            columns: ["studio_id", "obligation_id"]
            isOneToOne: false
            referencedRelation: "finance_payroll_unknown_costs"
            referencedColumns: ["studio_id", "obligation_id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_related_entry_id_fkey"
            columns: ["studio_id", "related_entry_id"]
            isOneToOne: false
            referencedRelation: "finance_labor_cost_pools"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_related_entry_id_fkey"
            columns: ["studio_id", "related_entry_id"]
            isOneToOne: false
            referencedRelation: "finance_recognition_entries"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_related_entry_id_fkey"
            columns: ["studio_id", "related_entry_id"]
            isOneToOne: false
            referencedRelation: "finance_recognized_actuals"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_terms_id_project_id_fkey"
            columns: ["studio_id", "terms_id", "project_id"]
            isOneToOne: false
            referencedRelation: "finance_project_current_terms"
            referencedColumns: ["studio_id", "id", "project_id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_terms_id_project_id_fkey"
            columns: ["studio_id", "terms_id", "project_id"]
            isOneToOne: false
            referencedRelation: "finance_project_terms"
            referencedColumns: ["studio_id", "id", "project_id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_trip_effect_movement_fkey"
            columns: ["studio_id", "trip_effect_movement_id"]
            isOneToOne: false
            referencedRelation: "finance_actionable_unapplied"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_trip_effect_movement_fkey"
            columns: ["studio_id", "trip_effect_movement_id"]
            isOneToOne: false
            referencedRelation: "finance_current_movements"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_trip_effect_movement_fkey"
            columns: ["studio_id", "trip_effect_movement_id"]
            isOneToOne: false
            referencedRelation: "finance_movements"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_trip_effect_movement_fkey"
            columns: ["studio_id", "trip_effect_movement_id"]
            isOneToOne: false
            referencedRelation: "finance_payment_availability"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_trip_entry_id_fkey"
            columns: ["studio_id", "trip_entry_id"]
            isOneToOne: false
            referencedRelation: "finance_trip_entries"
            referencedColumns: ["studio_id", "id"]
          },
          {
            foreignKeyName: "finance_recognition_entries_studio_id_trip_entry_id_fkey"
            columns: ["studio_id", "trip_entry_id"]
            isOneToOne: false
            referencedRelation: "finance_trip_entry_values"
            referencedColumns: ["studio_id", "id"]
          },
        ]
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
          pay_method: string | null
          payment_month_offset: number | null
          payout_day: number | null
          rate_per_m2: number | null
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
            referencedRelation: "finance_current_movements"
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
      activate_finance_recognition: {
        Args: { p_month: string; p_request_id: string; p_studio_id: string }
        Returns: string
      }
      adjust_finance_recognition: {
        Args: {
          p_entry_id: string
          p_input: Json
          p_request_id: string
          p_studio_id: string
        }
        Returns: string
      }
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
          p_anchor_date?: string
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
      bulk_configure_task_review: {
        Args: {
          p_project_id: string
          p_reviewer_ids: string[]
          p_stage: string
          p_task_ids: string[]
        }
        Returns: undefined
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
      can_reopen_finance_setup: {
        Args: { p_studio_id: string }
        Returns: boolean
      }
      cancel_finance_project_expectation: {
        Args: { p_input: Json; p_request_id: string; p_studio_id: string }
        Returns: string
      }
      change_finance_cutover: {
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
      claim_web_push_deliveries: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          auth: string
          endpoint: string
          id: string
          lease_token: string
          locale: string
          notification_id: string
          p256dh: string
          subscription_id: string
          user_id: string
          vapid_public_key: string
        }[]
      }
      claim_web_push_test: { Args: { p_endpoint: string }; Returns: string }
      close_finance_expected_remainder: {
        Args: {
          p_date: string
          p_explanation: string
          p_item_id: string
          p_reason: string
          p_remaining: number
          p_request_id: string
          p_studio_id: string
        }
        Returns: string
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
      complete_web_push_dispatch: {
        Args: { p_dispatch_id: string; p_success: boolean }
        Returns: undefined
      }
      configure_finance_labor_automation: {
        Args: { p_input: Json; p_request_id: string; p_studio_id: string }
        Returns: string
      }
      confirm_finance_expense_receipt: {
        Args: {
          p_input: Json
          p_kind: string
          p_request_id: string
          p_source_id: string
          p_studio_id: string
        }
        Returns: string
      }
      confirm_finance_month: {
        Args: { p_input: Json; p_request_id: string; p_studio_id: string }
        Returns: string
      }
      confirm_finance_payroll_earning: {
        Args: { p_input: Json; p_request_id: string; p_studio_id: string }
        Returns: string
      }
      confirm_finance_trip_recognition: {
        Args: {
          p_entry_id: string
          p_reason: string
          p_request_id: string
          p_studio_id: string
        }
        Returns: string
      }
      control_review_timer: {
        Args: {
          p_action: string
          p_round_ids?: string[]
          p_session_id?: string
        }
        Returns: string
      }
      correct_finance_movement: {
        Args: {
          p_input: Json
          p_movement_id: string
          p_request_id: string
          p_studio_id: string
        }
        Returns: string
      }
      correct_finance_project_order_currency: {
        Args: {
          p_input: Json
          p_project_id: string
          p_request_id: string
          p_studio_id: string
        }
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
      create_finance_account_with_opening: {
        Args: { p_input: Json; p_request_id: string; p_studio_id: string }
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
      delete_unconsumed_finance_payroll_revision: {
        Args: {
          p_request_id: string
          p_revision: number
          p_schedule_id: string
          p_studio_id: string
        }
        Returns: string
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
      enable_finance_recognition: {
        Args: { p_request_id: string; p_studio_id: string }
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
      finish_web_push_delivery: {
        Args: { p_id: string; p_lease_token: string; p_status: number }
        Returns: undefined
      }
      fulfill_finance_earning_milestone: {
        Args: {
          p_input: Json
          p_milestone_id: string
          p_request_id: string
          p_studio_id: string
        }
        Returns: string
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
      get_finance_calculated_labor_reporting: {
        Args: { p_fx?: Json; p_studio_id: string }
        Returns: Json
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
      get_finance_expense_automation_reporting: {
        Args: { p_studio_id: string }
        Returns: Json
      }
      get_finance_expense_source: {
        Args: { p_kind: string; p_source_id: string; p_studio_id: string }
        Returns: Json
      }
      get_finance_forecast_capture_preview: {
        Args: { p_fx?: Json; p_scenario?: string; p_studio_id: string }
        Returns: Json
      }
      get_finance_historical_labor_reporting: {
        Args: { p_fx?: Json; p_studio_id: string }
        Returns: Json
      }
      get_finance_labor_reporting: {
        Args: { p_studio_id: string }
        Returns: Json
      }
      get_finance_labor_sources: {
        Args: { p_studio_id: string }
        Returns: Json
      }
      get_finance_management_reporting: {
        Args: { p_historical_fx?: Json; p_studio_id: string }
        Returns: Json
      }
      get_finance_movement_history_ids: {
        Args: { p_movement_id: string; p_studio_id: string }
        Returns: string[]
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
      get_finance_overview_after_refresh: {
        Args: {
          p_fx?: Json
          p_horizon?: string
          p_period?: string
          p_scenario?: string
          p_studio_id: string
        }
        Returns: Json
      }
      get_finance_overview_fx_context: {
        Args: {
          p_horizon?: string
          p_period?: string
          p_scenario?: string
          p_studio_id: string
        }
        Returns: Json
      }
      get_finance_payroll_cash: {
        Args: { p_date?: string; p_schedule_id: string; p_studio_id: string }
        Returns: Json
      }
      get_finance_payroll_editability: {
        Args: { p_studio_id: string }
        Returns: {
          editable: boolean
          removable: boolean
          schedule_id: string
        }[]
      }
      get_finance_payroll_historical_terms: {
        Args: { p_studio_id: string }
        Returns: {
          term_id: string
        }[]
      }
      get_finance_payroll_payment: {
        Args: {
          p_date: string
          p_fx?: Json
          p_item_id: string
          p_studio_id: string
        }
        Returns: Json
      }
      get_finance_payroll_period: {
        Args: { p_obligation_id: string; p_studio_id: string }
        Returns: Json
      }
      get_finance_project_earnings: {
        Args: { p_project_id?: string; p_studio_id: string }
        Returns: Json
      }
      get_finance_project_reporting: {
        Args: { p_studio_id: string }
        Returns: Json
      }
      get_finance_proposal_source:
        | { Args: { p_project_id: string; p_studio_id: string }; Returns: Json }
        | {
            Args: {
              p_order_id: string
              p_project_id: string
              p_studio_id: string
            }
            Returns: Json
          }
      get_finance_recognition_sources: {
        Args: { p_studio_id: string }
        Returns: Json
      }
      get_finance_scenario_workspace: {
        Args: { p_base_id?: string; p_horizon?: string; p_studio_id: string }
        Returns: Json
      }
      get_finance_source_calculations: {
        Args: { p_studio_id: string }
        Returns: Json
      }
      get_finance_trip_recognition_sources: {
        Args: { p_studio_id: string }
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
      get_project_stage_configuration: {
        Args: { p_project_id: string }
        Returns: Json
      }
      get_project_stage_deletion_info: {
        Args: { p_project_id: string }
        Returns: Json
      }
      get_studio_member_removal_impact: {
        Args: { p_user_id: string }
        Returns: Json
      }
      get_studio_vacation_policy: {
        Args: { p_studio_id: string }
        Returns: {
          annual_days: number
          carry_cap_days: number
          carry_rule: string
          year_boundary: string
        }[]
      }
      get_vacation_balance: {
        Args: { p_as_of: string; p_studio_id: string; p_user_id: string }
        Returns: number
      }
      get_work_log_timer_snapshot: {
        Args: { p_work_date: string }
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
      is_notification_deliverable: {
        Args: { p_notification_id: string }
        Returns: boolean
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
      prepare_finance_automatic_expenses: {
        Args: { p_studio_id?: string }
        Returns: Json
      }
      prepare_finance_automatic_labor: {
        Args: { p_studio_id?: string }
        Returns: Json
      }
      prepare_finance_overview_fx_context: {
        Args: {
          p_horizon?: string
          p_period?: string
          p_scenario?: string
          p_studio_id: string
        }
        Returns: Json
      }
      preview_finance_labor_activation: {
        Args: { p_input: Json; p_studio_id: string }
        Returns: Json
      }
      preview_studio_vacation_policy_recalculation: {
        Args: {
          p_annual_days: number
          p_carry_cap_days?: number
          p_carry_rule: string
          p_studio_id: string
          p_year_boundary?: string
        }
        Returns: Json
      }
      process_finance_automatic_expense: {
        Args: {
          p_approve?: boolean
          p_digest: string
          p_fx?: Json
          p_month: string
          p_source_id: string
          p_studio_id: string
        }
        Returns: string
      }
      process_finance_automatic_labor: {
        Args: {
          p_approve?: boolean
          p_digest: string
          p_fx?: Json
          p_obligation_id: string
          p_request_id?: string
          p_studio_id: string
        }
        Returns: string
      }
      process_finance_pending_source: {
        Args: {
          p_fx?: Json
          p_kind: string
          p_source_id: string
          p_studio_id: string
        }
        Returns: string
      }
      project_vacation_request: {
        Args: {
          p_end: string
          p_start: string
          p_studio_id: string
          p_user_id: string
        }
        Returns: {
          available: number
          exceeds: boolean
          remaining: number
        }[]
      }
      recalculate_studio_vacation_policy: {
        Args: {
          p_annual_days: number
          p_carry_cap_days?: number
          p_carry_rule: string
          p_confirm_negative?: boolean
          p_preview_digest?: string
          p_studio_id: string
          p_year_boundary?: string
        }
        Returns: undefined
      }
      reconcile_finance_labor_cost: {
        Args: { p_input: Json; p_request_id: string; p_studio_id: string }
        Returns: string
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
      record_finance_account_balance: {
        Args: { p_input: Json; p_request_id: string; p_studio_id: string }
        Returns: string
      }
      record_finance_expected_payment: {
        Args: {
          p_allocation_amount?: number
          p_input: Json
          p_item_id: string
          p_request_id: string
          p_studio_id: string
        }
        Returns: string
      }
      record_finance_labor_cost: {
        Args: { p_input: Json; p_request_id: string; p_studio_id: string }
        Returns: string
      }
      record_finance_movement: {
        Args: { p_input: Json; p_request_id: string; p_studio_id: string }
        Returns: string
      }
      record_finance_payroll_advance: {
        Args: { p_input: Json; p_request_id: string; p_studio_id: string }
        Returns: string
      }
      record_finance_payroll_payment: {
        Args: {
          p_input: Json
          p_item_id: string
          p_request_id: string
          p_studio_id: string
        }
        Returns: string
      }
      record_finance_project_payment: {
        Args: {
          p_allocations: Json
          p_input: Json
          p_item_id: string
          p_project_id: string
          p_request_id: string
          p_snapshot: Json
          p_studio_id: string
        }
        Returns: string
      }
      record_finance_recognition: {
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
      refresh_project_task_schedules: {
        Args: { p_project_ids: string[] }
        Returns: undefined
      }
      register_web_push_subscription: {
        Args: {
          p_auth: string
          p_endpoint: string
          p_locale?: string
          p_p256dh: string
          p_vapid_public_key: string
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
      remove_unconsumed_finance_payroll: {
        Args: {
          p_request_id: string
          p_revision: number
          p_schedule_id: string
          p_studio_id: string
        }
        Returns: string
      }
      rename_contractor_category: {
        Args: { p_category_id: string; p_name: string }
        Returns: undefined
      }
      reopen_finance_setup: {
        Args: { p_studio_id: string }
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
      reverse_finance_settlement_adjustment: {
        Args: {
          p_adjustment_id: string
          p_date: string
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
      save_daily_work_log: {
        Args: { p_entries: Json; p_timer_snapshot?: Json; p_work_date: string }
        Returns: undefined
      }
      save_finance_account: {
        Args: {
          p_account_id?: string
          p_account_type?: string
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
      save_finance_earning_milestone: {
        Args: {
          p_input: Json
          p_order_id: string
          p_project_id: string
          p_request_id: string
          p_studio_id: string
        }
        Returns: string
      }
      save_finance_expected_item: {
        Args: { p_input: Json; p_request_id: string; p_studio_id: string }
        Returns: string
      }
      save_finance_expense_service_policy: {
        Args: { p_input: Json; p_request_id: string; p_studio_id: string }
        Returns: string
      }
      save_finance_forecast_scenario: {
        Args: {
          p_input?: Json
          p_request_id: string
          p_scenario_id?: string
          p_studio_id: string
        }
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
      save_finance_labor_allocation: {
        Args: {
          p_entry_id: string
          p_input: Json
          p_request_id: string
          p_studio_id: string
        }
        Returns: string
      }
      save_finance_project_cash_split: {
        Args: {
          p_input: Json
          p_movement_id: string
          p_request_id: string
          p_studio_id: string
        }
        Returns: string
      }
      save_finance_project_cost_estimate: {
        Args: {
          p_input: Json
          p_project_id: string
          p_request_id: string
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
      save_finance_project_order: {
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
      save_finance_project_proposal:
        | {
            Args: {
              p_actor_id: string
              p_pdf: string
              p_presentation: Json
              p_project_id: string
              p_request_id: string
              p_source: Json
              p_studio_id: string
            }
            Returns: string
          }
        | {
            Args: {
              p_actor_id: string
              p_order_id: string
              p_pdf: string
              p_presentation: Json
              p_project_id: string
              p_request_id: string
              p_source: Json
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
      save_finance_report_coverage: {
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
      save_productivity_stage_shares: {
        Args: { p_stage_1_percent: number; p_studio_id: string }
        Returns: undefined
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
      save_stage_task_structure: {
        Args: {
          p_creates: Json
          p_delete_ids: string[]
          p_order?: string[]
          p_project_id: string
          p_stage: string
          p_updates: Json
        }
        Returns: undefined
      }
      save_studio_contact_details: {
        Args: {
          p_business_address: string
          p_contact_person?: string
          p_email: string
          p_phone: string
          p_studio_id: string
          p_website: string
        }
        Returns: undefined
      }
      save_studio_vacation_policy: {
        Args: {
          p_annual_days: number
          p_carry_cap_days?: number
          p_carry_rule: string
          p_studio_id: string
          p_year_boundary?: string
        }
        Returns: undefined
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
      set_project_stage_schedule_paused: {
        Args: {
          p_paused: boolean
          p_project_id: string
          p_reason?: string
          p_stage: string
        }
        Returns: undefined
      }
      set_standard_workday_minutes: {
        Args: { p_minutes: number; p_studio_id: string }
        Returns: undefined
      }
      set_task_checklist_template: {
        Args: { p_task_id: string; p_template_id?: string }
        Returns: undefined
      }
      set_vacation_employee_visibility: {
        Args: { p_studio_id: string; p_visible: boolean }
        Returns: undefined
      }
      set_vacation_opening_balance: {
        Args: { p_days: number; p_effective_date: string; p_user_id: string }
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
      sync_review_timer: { Args: never; Returns: Json }
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
          p_deleted_task_ids: string[]
          p_expected_version: number
          p_include_in_productivity: boolean
          p_project_id: string
          p_show_progress: boolean
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
      update_task_review: {
        Args: {
          p_action: string
          p_comment?: string
          p_expected_reviewer_id?: string
          p_requires_review?: boolean
          p_reviewer_id?: string
          p_reviewer_ids?: string[]
          p_round_id?: string
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
      value_finance_automatic_expense: {
        Args: { p_entry_id: string; p_fx: Json; p_studio_id: string }
        Returns: undefined
      }
      value_finance_movement: {
        Args: {
          p_currency: string
          p_fx: Json
          p_movement_id: string
          p_studio_id: string
        }
        Returns: undefined
      }
      value_finance_opening: {
        Args: { p_account_id: string; p_input: Json; p_studio_id: string }
        Returns: undefined
      }
      value_finance_recognition: {
        Args: { p_entry_id: string; p_fx: Json; p_studio_id: string }
        Returns: undefined
      }
      void_unrecognized_earning_milestone: {
        Args: {
          p_milestone_id: string
          p_reason: string
          p_request_id: string
          p_studio_id: string
        }
        Returns: string
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
        | "task_review_requested"
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
        "task_review_requested",
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

