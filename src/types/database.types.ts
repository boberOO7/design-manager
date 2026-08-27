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
      calendar_event_attendees: {
        Row: { created_at: string; event_id: string; user_id: string }
        Insert: { created_at?: string; event_id: string; user_id: string }
        Update: { created_at?: string; event_id?: string; user_id?: string }
        Relationships: [
          { foreignKeyName: "calendar_event_attendees_event_id_fkey"; columns: ["event_id"]; isOneToOne: false; referencedRelation: "calendar_events"; referencedColumns: ["id"] },
          { foreignKeyName: "calendar_event_attendees_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ]
      }
      calendar_event_invites: {
        Row: { created_at: string; event_id: string; id: string; invited_by: string; responded_at: string | null; status: Database["public"]["Enums"]["calendar_event_invitation_status"]; updated_at: string; user_id: string }
        Insert: { created_at?: string; event_id: string; id?: string; invited_by: string; responded_at?: string | null; status?: Database["public"]["Enums"]["calendar_event_invitation_status"]; updated_at?: string; user_id: string }
        Update: { created_at?: string; event_id?: string; id?: string; invited_by?: string; responded_at?: string | null; status?: Database["public"]["Enums"]["calendar_event_invitation_status"]; updated_at?: string; user_id?: string }
        Relationships: [
          { foreignKeyName: "calendar_event_invites_event_id_fkey"; columns: ["event_id"]; isOneToOne: false; referencedRelation: "calendar_events"; referencedColumns: ["id"] },
          { foreignKeyName: "calendar_event_invites_invited_by_fkey"; columns: ["invited_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "calendar_event_invites_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ]
      }
      calendar_events: {
        Row: {
          all_day: boolean; cancelled_at: string | null; created_at: string; created_by: string;
          description: string | null; ends_at: string; event_type: Database["public"]["Enums"]["calendar_event_type"];
          id: string; location: string | null; meeting_url: string | null; organizer_id: string; project_id: string | null; recurrence_rule: Json | null; series_id: string | null; occurrence_start: string | null;
          starts_at: string; studio_id: string; title: string; updated_at: string
        }
        Insert: {
          all_day?: boolean; cancelled_at?: string | null; created_at?: string; created_by: string;
          description?: string | null; ends_at: string; event_type: Database["public"]["Enums"]["calendar_event_type"];
          id?: string; location?: string | null; meeting_url?: string | null; organizer_id: string; project_id?: string | null; recurrence_rule?: Json | null; series_id?: string | null; occurrence_start?: string | null;
          starts_at: string; studio_id: string; title: string; updated_at?: string
        }
        Update: {
          all_day?: boolean; cancelled_at?: string | null; created_at?: string; created_by?: string;
          description?: string | null; ends_at?: string; event_type?: Database["public"]["Enums"]["calendar_event_type"];
          id?: string; location?: string | null; meeting_url?: string | null; organizer_id?: string; project_id?: string | null; recurrence_rule?: Json | null; series_id?: string | null; occurrence_start?: string | null;
          starts_at?: string; studio_id?: string; title?: string; updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "calendar_events_created_by_fkey"; columns: ["created_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "calendar_events_organizer_id_fkey"; columns: ["organizer_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "calendar_events_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "projects"; referencedColumns: ["id"] },
          { foreignKeyName: "calendar_events_series_id_fkey"; columns: ["series_id"]; isOneToOne: false; referencedRelation: "calendar_events"; referencedColumns: ["id"] },
          { foreignKeyName: "calendar_events_studio_id_fkey"; columns: ["studio_id"]; isOneToOne: false; referencedRelation: "studios"; referencedColumns: ["id"] },
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
      contractor_categories: {
        Row: { color_key: string; created_at: string; id: string; name: string; studio_id: string; updated_at: string }
        Insert: { color_key: string; created_at?: string; id?: string; name: string; studio_id: string; updated_at?: string }
        Update: { color_key?: string; created_at?: string; id?: string; name?: string; studio_id?: string; updated_at?: string }
        Relationships: [
          { foreignKeyName: "contractor_categories_studio_id_fkey"; columns: ["studio_id"]; isOneToOne: false; referencedRelation: "studios"; referencedColumns: ["id"] },
        ]
      }
      contractor_subcategories: {
        Row: { category_id: string; created_at: string; id: string; name: string }
        Insert: { category_id: string; created_at?: string; id?: string; name: string }
        Update: { category_id?: string; created_at?: string; id?: string; name?: string }
        Relationships: [
          { foreignKeyName: "contractor_subcategories_category_id_fkey"; columns: ["category_id"]; isOneToOne: false; referencedRelation: "contractor_categories"; referencedColumns: ["id"] },
        ]
      }
      checklist_template_items: {
        Row: { created_at: string; id: string; position: number; template_id: string; title: string; updated_at: string; weight: number }
        Insert: { created_at?: string; id?: string; position: number; template_id: string; title: string; updated_at?: string; weight: number }
        Update: { position?: number; template_id?: string; title?: string; updated_at?: string; weight?: number }
        Relationships: [
          { foreignKeyName: "checklist_template_items_template_id_fkey"; columns: ["template_id"]; isOneToOne: false; referencedRelation: "checklist_templates"; referencedColumns: ["id"] },
        ]
      }
      checklist_templates: {
        Row: { archived_at: string | null; created_at: string; created_by: string; id: string; name: string; studio_id: string; updated_at: string }
        Insert: { archived_at?: string | null; created_at?: string; created_by: string; id?: string; name: string; studio_id: string; updated_at?: string }
        Update: { archived_at?: string | null; created_by?: string; name?: string; studio_id?: string; updated_at?: string }
        Relationships: [
          { foreignKeyName: "checklist_templates_created_by_fkey"; columns: ["created_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "checklist_templates_studio_id_fkey"; columns: ["studio_id"]; isOneToOne: false; referencedRelation: "studios"; referencedColumns: ["id"] },
        ]
      }
      project_template_tasks: {
        Row: { created_at: string; id: string; position: number; priority: string; stage: string; template_id: string; title: string; updated_at: string }
        Insert: { created_at?: string; id?: string; position: number; priority?: string; stage: string; template_id: string; title: string; updated_at?: string }
        Update: { position?: number; priority?: string; stage?: string; template_id?: string; title?: string; updated_at?: string }
        Relationships: [
          { foreignKeyName: "project_template_tasks_template_id_fkey"; columns: ["template_id"]; isOneToOne: false; referencedRelation: "project_templates"; referencedColumns: ["id"] },
        ]
      }
      project_templates: {
        Row: { created_at: string; created_by: string; id: string; is_active: boolean; is_default: boolean; name: string; project_type: string; studio_id: string; updated_at: string }
        Insert: { created_at?: string; created_by: string; id?: string; is_active?: boolean; is_default?: boolean; name: string; project_type: string; studio_id: string; updated_at?: string }
        Update: { created_by?: string; is_active?: boolean; is_default?: boolean; name?: string; project_type?: string; studio_id?: string; updated_at?: string }
        Relationships: [
          { foreignKeyName: "project_templates_created_by_fkey"; columns: ["created_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "project_templates_studio_id_fkey"; columns: ["studio_id"]; isOneToOne: false; referencedRelation: "studios"; referencedColumns: ["id"] },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null; body: string; created_at: string; entity_id: string | null;
          entity_type: string | null; href: string; id: string; metadata: Json;
          notification_type: Database["public"]["Enums"]["notification_type"]; read_at: string | null;
          recipient_id: string; studio_id: string; title: string
        }
        Insert: {
          actor_id?: string | null; body: string; created_at?: string; entity_id?: string | null;
          entity_type?: string | null; href: string; id?: string; metadata?: Json;
          notification_type: Database["public"]["Enums"]["notification_type"]; read_at?: string | null;
          recipient_id: string; studio_id: string; title: string
        }
        Update: { read_at?: string | null }
        Relationships: [
          { foreignKeyName: "notifications_actor_id_fkey"; columns: ["actor_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "notifications_recipient_id_fkey"; columns: ["recipient_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "notifications_studio_id_fkey"; columns: ["studio_id"]; isOneToOne: false; referencedRelation: "studios"; referencedColumns: ["id"] },
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
          never?: never
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
      productivity_attributions: {
        Row: {
          completed_at: string
          contributor_id: string
          contributor_job_title: string
          contributor_name: string
          credited_area_m2: number
          created_at: string
          id: string
          project_id: string
          source_type: string
          studio_id: string
          task_id: string | null
          voided_at: string | null
        }
        Insert: {
          completed_at?: string
          contributor_id: string
          contributor_job_title: string
          contributor_name: string
          credited_area_m2: number
          created_at?: string
          id?: string
          project_id: string
          source_type: string
          studio_id: string
          task_id?: string | null
          voided_at?: string | null
        }
        Update: {
          completed_at?: string
          contributor_id?: string
          contributor_job_title?: string
          contributor_name?: string
          credited_area_m2?: number
          created_at?: string
          id?: string
          project_id?: string
          source_type?: string
          studio_id?: string
          task_id?: string | null
          voided_at?: string | null
        }
        Relationships: [
          { foreignKeyName: "productivity_attributions_studio_id_fkey", columns: ["studio_id"], isOneToOne: false, referencedRelation: "studios", referencedColumns: ["id"] },
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
          { foreignKeyName: "project_stage_productivity_budgets_project_id_fkey", columns: ["project_id"], isOneToOne: false, referencedRelation: "projects", referencedColumns: ["id"] },
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
          { foreignKeyName: "leaderboard_bonus_rules_studio_id_fkey"; columns: ["studio_id"]; isOneToOne: false; referencedRelation: "studios"; referencedColumns: ["id"] },
        ]
      }
      projects: {
        Row: {
          archived_at: string | null
          client_name: string | null
          city: string | null
          city_geonames_id: number | null
          country_code: string
          completed_at: string | null
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
          client_name?: string | null
          city?: string | null
          city_geonames_id?: number | null
          country_code?: string
          completed_at?: string | null
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
          client_name?: string | null
          city?: string | null
          city_geonames_id?: number | null
          country_code?: string
          completed_at?: string | null
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
      tasks: {
        Row: {
          assignee_id: string | null
          completed_at: string | null
          completed_area_m2: number | null
          created_at: string
          created_by: string
          description: string | null
          due_date: string | null
          id: string
          manual_progress_override: boolean
          priority: string
          productivity_area_m2: number | null
          production_completion: number
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
          completed_at?: string | null
          completed_area_m2?: number | null
          created_at?: string
          created_by: string
          description?: string | null
          due_date?: string | null
          id?: string
          manual_progress_override?: boolean
          priority?: string
          productivity_area_m2?: number | null
          production_completion?: number
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
          completed_at?: string | null
          completed_area_m2?: number | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string | null
          id?: string
          manual_progress_override?: boolean
          priority?: string
          productivity_area_m2?: number | null
          production_completion?: number
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
      task_collaborators: {
        Row: { task_id: string; user_id: string; created_at: string }
        Insert: { task_id: string; user_id: string; created_at?: string }
        Update: { task_id?: string; user_id?: string; created_at?: string }
        Relationships: [
          { foreignKeyName: "task_collaborators_task_id_fkey"; columns: ["task_id"]; isOneToOne: false; referencedRelation: "tasks"; referencedColumns: ["id"] },
          { foreignKeyName: "task_collaborators_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ]
      }
      project_task_stage_columns: {
        Row: { project_id: string; stage: string; enabled_statuses: string[]; progress_method: string; display_name: string | null; is_enabled: boolean; display_order: number; updated_at: string }
        Insert: { project_id: string; stage: string; enabled_statuses?: string[]; progress_method?: string; display_name?: string | null; is_enabled?: boolean; display_order?: number; updated_at?: string }
        Update: { enabled_statuses?: string[]; progress_method?: string; display_name?: string | null; is_enabled?: boolean; display_order?: number; updated_at?: string }
        Relationships: [{ foreignKeyName: "project_task_stage_columns_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "projects"; referencedColumns: ["id"] }]
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
      time_off_requests: {
        Row: {
          all_day: boolean; cancelled_at: string | null; created_at: string; end_date: string; end_time: string | null;
          id: string; private_note: string | null; request_type: Database["public"]["Enums"]["time_off_request_type"];
          review_note: string | null; reviewed_at: string | null; reviewed_by: string | null; start_date: string;
          start_time: string | null; status: Database["public"]["Enums"]["time_off_request_status"];
          studio_id: string; updated_at: string; user_id: string
        }
        Insert: {
          all_day?: boolean; cancelled_at?: string | null; created_at?: string; end_date: string; end_time?: string | null;
          id?: string; private_note?: string | null; request_type: Database["public"]["Enums"]["time_off_request_type"];
          review_note?: string | null; reviewed_at?: string | null; reviewed_by?: string | null; start_date: string;
          start_time?: string | null; status?: Database["public"]["Enums"]["time_off_request_status"];
          studio_id: string; updated_at?: string; user_id: string
        }
        Update: {
          all_day?: boolean; cancelled_at?: string | null; created_at?: string; end_date?: string; end_time?: string | null;
          id?: string; private_note?: string | null; request_type?: Database["public"]["Enums"]["time_off_request_type"];
          review_note?: string | null; reviewed_at?: string | null; reviewed_by?: string | null; start_date?: string;
          start_time?: string | null; status?: Database["public"]["Enums"]["time_off_request_status"];
          studio_id?: string; updated_at?: string; user_id?: string
        }
        Relationships: [
          { foreignKeyName: "time_off_requests_reviewed_by_fkey"; columns: ["reviewed_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "time_off_requests_studio_id_fkey"; columns: ["studio_id"]; isOneToOne: false; referencedRelation: "studios"; referencedColumns: ["id"] },
          { foreignKeyName: "time_off_requests_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
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
          { foreignKeyName: "time_off_request_approvals_admin_user_id_fkey"; columns: ["admin_user_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "time_off_request_approvals_request_id_fkey"; columns: ["request_id"]; isOneToOne: false; referencedRelation: "time_off_requests"; referencedColumns: ["id"] },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bulk_assign_project_stage_tasks: {
        Args: { p_assignee_id: string; p_project_id: string; p_scope: string; p_stage: string }
        Returns: { id: string }[]
      }
      bulk_move_project_tasks: {
        Args: { p_project_id: string; p_source_statuses: string[]; p_stage: string; p_target_status: string; p_task_ids: string[] }
        Returns: { id: string }[]
      }
      create_calendar_event_with_invites: {
        Args: {
          p_all_day: boolean
          p_attendee_ids?: string[]
          p_description: string | null
          p_ends_at: string
          p_event_type: Database["public"]["Enums"]["calendar_event_type"]
          p_location: string | null
          p_meeting_url: string | null
          p_project_id: string | null
          p_starts_at: string
          p_studio_id: string
          p_title: string
        }
        Returns: string
      }
      resolve_contractor_category: {
        Args: { p_name: string }
        Returns: string
      }
      resolve_contractor_subcategory: {
        Args: { p_category_id: string; p_name: string }
        Returns: string
      }
      update_contractor_category_color: {
        Args: { p_category_id: string; p_color_key: string }
        Returns: undefined
      }
      update_project_stage_configuration: {
        Args: { p_include_in_productivity: boolean; p_project_id: string; p_stages: Json }
        Returns: undefined
      }
      approve_time_off_request: {
        Args: { p_request_id: string; p_review_note?: string | null }
        Returns: {
          approval_count: number
          required_approval_count: number
          status: Database["public"]["Enums"]["time_off_request_status"]
        }[]
      }
      create_task_with_checklist: {
        Args: { p_checklist_items?: Json; p_task: Json }
        Returns: string
      }
      update_task_details_with_collaborators: {
        Args: { p_collaborator_ids?: string[]; p_task: Json; p_task_id: string }
        Returns: undefined
      }
      get_personal_task_ids: {
        Args: Record<PropertyKey, never>
        Returns: { task_id: string }[]
      }
      save_checklist_template: {
        Args: { p_name: string; p_stages: Json; p_studio_id: string; p_template_id: string | null }
        Returns: string
      }
      save_project_template: {
        Args: { p_is_active: boolean; p_is_default: boolean; p_name: string; p_project_type: string; p_studio_id: string; p_tasks: Json; p_template_id: string | null }
        Returns: string
      }
      delete_project_template: {
        Args: { p_template_id: string }
        Returns: undefined
      }
      create_project_from_template: {
        Args: { p_project: Json; p_stage_assignees?: Json; p_template_id?: string | null }
        Returns: string
      }
      save_leaderboard_bonus_rules: {
        Args: { p_enabled: boolean; p_rules: Json; p_studio_id: string }
        Returns: undefined
      }
      set_leaderboard_employee_visibility: {
        Args: { p_studio_id: string; p_visible: boolean }
        Returns: undefined
      }
      set_checklist_template_archived: {
        Args: { p_archived: boolean; p_template_id: string }
        Returns: string | null
      }
      get_calendar_coworker_availability: {
        Args: { range_end: string; range_start: string; target_studio_id: string }
        Returns: {
          all_day: boolean; employee_name: string; end_date: string; end_time: string | null; id: string;
          label: string; start_date: string; start_time: string | null; user_id: string
        }[]
      }
      get_studio_member_removal_impact: {
        Args: { p_user_id: string }
        Returns: Json
      }
      get_project_member_removal_impact: {
        Args: { p_assignment_id: string }
        Returns: Json
      }
      remove_studio_member: {
        Args: { p_allow_unassigned?: boolean; p_reassignments?: Json; p_user_id: string }
        Returns: undefined
      }
      remove_project_member: {
        Args: { p_allow_unassigned: boolean; p_assignment_id: string; p_reassignments: Json }
        Returns: undefined
      }
      restore_studio_member: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      update_my_avatar: {
        Args: { p_avatar_path: string | null }
        Returns: string | null
      }
      update_my_profile_location: {
        Args: {
          p_city: string | null
          p_city_geonames_id: number | null
          p_country_code: string | null
        }
        Returns: undefined
      }
      update_my_profile_birthday: {
        Args: { p_birth_date: string | null }
        Returns: undefined
      }
      update_studio_member_profile: {
        Args: { p_birth_date: string | null; p_full_name: string; p_job_title: string; p_joined_at: string | null; p_system_role: string; p_user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      calendar_event_invitation_status: "pending" | "accepted" | "declined"
      calendar_event_type: "meeting" | "client_presentation" | "site_visit" | "internal_review" | "business_trip" | "other"
      notification_type: "time_off_request_submitted" | "time_off_request_approved" | "time_off_request_rejected" | "time_off_request_cancelled" | "task_assigned" | "task_details_changed" | "calendar_event_invitation" | "calendar_event_updated" | "calendar_event_cancelled"
      time_off_request_status: "pending" | "approved" | "rejected" | "cancelled"
      time_off_request_type: "vacation" | "day_off" | "medical_appointment" | "sick_leave" | "other"
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
      calendar_event_type: ["meeting", "client_presentation", "site_visit", "internal_review", "business_trip", "other"],
      notification_type: ["time_off_request_submitted", "time_off_request_approved", "time_off_request_rejected", "time_off_request_cancelled", "task_assigned", "task_details_changed", "calendar_event_invitation", "calendar_event_updated", "calendar_event_cancelled"],
      time_off_request_status: ["pending", "approved", "rejected", "cancelled"],
      time_off_request_type: ["vacation", "day_off", "medical_appointment", "sick_leave", "other"],
    },
  },
} as const
