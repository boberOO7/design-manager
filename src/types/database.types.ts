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
      calendar_events: {
        Row: {
          all_day: boolean; cancelled_at: string | null; created_at: string; created_by: string;
          description: string | null; ends_at: string; event_type: Database["public"]["Enums"]["calendar_event_type"];
          id: string; location: string | null; meeting_url: string | null; project_id: string | null;
          starts_at: string; studio_id: string; title: string; updated_at: string
        }
        Insert: {
          all_day?: boolean; cancelled_at?: string | null; created_at?: string; created_by: string;
          description?: string | null; ends_at: string; event_type: Database["public"]["Enums"]["calendar_event_type"];
          id?: string; location?: string | null; meeting_url?: string | null; project_id?: string | null;
          starts_at: string; studio_id: string; title: string; updated_at?: string
        }
        Update: {
          all_day?: boolean; cancelled_at?: string | null; created_at?: string; created_by?: string;
          description?: string | null; ends_at?: string; event_type?: Database["public"]["Enums"]["calendar_event_type"];
          id?: string; location?: string | null; meeting_url?: string | null; project_id?: string | null;
          starts_at?: string; studio_id?: string; title?: string; updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "calendar_events_created_by_fkey"; columns: ["created_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "calendar_events_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "projects"; referencedColumns: ["id"] },
          { foreignKeyName: "calendar_events_studio_id_fkey"; columns: ["studio_id"]; isOneToOne: false; referencedRelation: "studios"; referencedColumns: ["id"] },
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
          name: string
          priority: string
          progress_method: string
          project_code: string | null
          project_type: string | null
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
          name: string
          priority?: string
          progress_method?: string
          project_code?: string | null
          project_type?: string | null
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
          name?: string
          priority?: string
          progress_method?: string
          project_code?: string | null
          project_type?: string | null
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
          joined_at: string
          removed_at: string | null
          removed_by: string | null
          studio_id: string
          system_role: string
          user_id: string
        }
        Insert: {
          id?: string
          is_active?: boolean
          joined_at?: string
          removed_at?: string | null
          removed_by?: string | null
          studio_id: string
          system_role?: string
          user_id: string
        }
        Update: {
          id?: string
          is_active?: boolean
          joined_at?: string
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
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
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
          priority: string
          production_completion: number
          progress_weight: number
          project_id: string
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
          priority?: string
          production_completion?: number
          progress_weight?: number
          project_id: string
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
          priority?: string
          production_completion?: number
          progress_weight?: number
          project_id?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_task_with_checklist: {
        Args: { p_checklist_items?: Json; p_task: Json }
        Returns: string
      }
      save_checklist_template: {
        Args: { p_name: string; p_stages: Json; p_studio_id: string; p_template_id: string | null }
        Returns: string
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
      remove_studio_member: {
        Args: { p_allow_unassigned?: boolean; p_reassignments?: Json; p_user_id: string }
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
    }
    Enums: {
      calendar_event_type: "meeting" | "client_presentation" | "site_visit" | "internal_review" | "other"
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
      calendar_event_type: ["meeting", "client_presentation", "site_visit", "internal_review", "other"],
      notification_type: ["time_off_request_submitted", "time_off_request_approved", "time_off_request_rejected", "time_off_request_cancelled", "task_assigned", "task_details_changed", "calendar_event_invitation", "calendar_event_updated", "calendar_event_cancelled"],
      time_off_request_status: ["pending", "approved", "rejected", "cancelled"],
      time_off_request_type: ["vacation", "day_off", "medical_appointment", "sick_leave", "other"],
    },
  },
} as const
