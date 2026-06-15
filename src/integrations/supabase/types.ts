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
      area_rates: {
        Row: {
          area_id: string
          created_at: string
          id: string
          product_type: string
          rate_per_kg: number
        }
        Insert: {
          area_id: string
          created_at?: string
          id?: string
          product_type: string
          rate_per_kg?: number
        }
        Update: {
          area_id?: string
          created_at?: string
          id?: string
          product_type?: string
          rate_per_kg?: number
        }
        Relationships: [
          {
            foreignKeyName: "area_rates_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          }
        ]
      }
      areas: {
        Row: {
          area_name: string
          created_at: string
          id: string
        }
        Insert: {
          area_name: string
          created_at?: string
          id?: string
        }
        Update: {
          area_name?: string
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          area_id: string | null
          created_at: string
          id: string
          name: string
          phone: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          area_id?: string | null
          created_at?: string
          id?: string
          name: string
          phone: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          area_id?: string | null
          created_at?: string
          id?: string
          name?: string
          phone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          }
        ]
      }
      drivers: {
        Row: {
          address: string | null
          area_id: string | null
          created_at: string
          id: string
          name: string
          phone: string
          sub_area: string | null
          vehicle_number: string | null
        }
        Insert: {
          address?: string | null
          area_id?: string | null
          created_at?: string
          id?: string
          name: string
          phone: string
          sub_area?: string | null
          vehicle_number?: string | null
        }
        Update: {
          address?: string | null
          area_id?: string | null
          created_at?: string
          id?: string
          name?: string
          phone?: string
          sub_area?: string | null
          vehicle_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drivers_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          }
        ]
      }
      expenses: {
        Row: {
          amount: number
          created_at: string
          id: string
          reason: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          reason: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          reason?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          amount_paid: number
          created_at: string
          customer_id: string
          delivery_date: string | null
          driver_id: string | null
          guni_count: number
          id: string
          is_printed: boolean | null
          notes: string | null
          order_date: string
          order_number: number
          pending_amount: number | null
          product_type: string
          quantity_kg: number
          rate_per_kg: number
          status: string
          sub_area: string | null
          total_amount: number
          updated_at: string
        }
        Insert: {
          amount_paid?: number
          created_at?: string
          customer_id: string
          delivery_date?: string | null
          driver_id?: string | null
          guni_count?: number
          id?: string
          is_printed?: boolean | null
          notes?: string | null
          order_date?: string
          order_number?: number
          pending_amount?: number | null
          product_type: string
          quantity_kg: number
          rate_per_kg: number
          status?: string
          sub_area?: string | null
          total_amount: number
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          created_at?: string
          customer_id?: string
          delivery_date?: string | null
          driver_id?: string | null
          guni_count?: number
          id?: string
          is_printed?: boolean | null
          notes?: string | null
          order_date?: string
          order_number?: number
          pending_amount?: number | null
          product_type?: string
          quantity_kg?: number
          rate_per_kg?: number
          status?: string
          sub_area?: string | null
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          }
        ]
      }
      product_rates: {
        Row: {
          id: string
          product_type: string
          rate_per_kg: number
          updated_at: string
        }
        Insert: {
          id?: string
          product_type: string
          rate_per_kg?: number
          updated_at?: string
        }
        Update: {
          id?: string
          product_type?: string
          rate_per_kg?: number
          updated_at?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          value: string | null
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: []
      }
      stock: {
        Row: {
          id: string
          last_updated: string
          low_stock_threshold: number
          product_type: string
          quantity_kg: number
        }
        Insert: {
          id?: string
          last_updated?: string
          low_stock_threshold?: number
          product_type: string
          quantity_kg?: number
        }
        Update: {
          id?: string
          last_updated?: string
          low_stock_threshold?: number
          product_type?: string
          quantity_kg?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
