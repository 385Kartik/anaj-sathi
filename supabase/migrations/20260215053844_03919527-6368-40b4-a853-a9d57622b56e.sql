
-- Areas table
CREATE TABLE public.areas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  area_name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Customers table
CREATE TABLE public.customers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  area_id UUID REFERENCES public.areas(id),
  phone TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_customers_phone ON public.customers(phone);

-- Drivers table
CREATE TABLE public.drivers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  vehicle_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Products/Stock table
CREATE TABLE public.stock (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_type TEXT NOT NULL CHECK (product_type IN ('Tukdi', 'Sasiya', 'Tukdi D', 'Sasiya D')),
  quantity_kg NUMERIC NOT NULL DEFAULT 0,
  low_stock_threshold NUMERIC NOT NULL DEFAULT 100,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insert default stock entries
INSERT INTO public.stock (product_type, quantity_kg) VALUES
  ('Tukdi', 0),
  ('Sasiya', 0),
  ('Tukdi D', 0),
  ('Sasiya D', 0);

-- Product rates table
CREATE TABLE public.product_rates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_type TEXT NOT NULL CHECK (product_type IN ('Tukdi', 'Sasiya', 'Tukdi D', 'Sasiya D')),
  rate_per_kg NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.product_rates (product_type, rate_per_kg) VALUES
  ('Tukdi', 0),
  ('Sasiya', 0),
  ('Tukdi D', 0),
  ('Sasiya D', 0);

-- Orders table
CREATE TABLE public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number SERIAL,
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  delivery_date DATE,
  product_type TEXT NOT NULL CHECK (product_type IN ('Tukdi', 'Sasiya', 'Tukdi D', 'Sasiya D')),
  quantity_kg NUMERIC NOT NULL,
  guni_count INTEGER NOT NULL DEFAULT 0,
  rate_per_kg NUMERIC NOT NULL,
  total_amount NUMERIC NOT NULL,
  amount_paid NUMERIC NOT NULL DEFAULT 0,
  pending_amount NUMERIC GENERATED ALWAYS AS (total_amount - amount_paid) STORED,
  driver_id UUID REFERENCES public.drivers(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Settings table for password and app config
CREATE TABLE public.settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables but allow all access (password-based security, not user-based)
ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Public access policies (app uses password-based access, not user auth)
CREATE POLICY "Allow all access to areas" ON public.areas FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to customers" ON public.customers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to drivers" ON public.drivers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to stock" ON public.stock FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to product_rates" ON public.product_rates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to orders" ON public.orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to settings" ON public.settings FOR ALL USING (true) WITH CHECK (true);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_stock_updated_at BEFORE UPDATE ON public.stock FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_product_rates_updated_at BEFORE UPDATE ON public.product_rates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON public.settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for orders
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.stock;


-- 1. Add is_printed column to orders to track if it's been printed
ALTER TABLE public.orders ADD COLUMN is_printed BOOLEAN DEFAULT FALSE;

-- 2. Update Foreign Keys to allow Deletion (CASCADE DELETE)
-- This ensures if you delete a Customer, their orders are also deleted (cleaning up data).
ALTER TABLE public.orders DROP CONSTRAINT orders_customer_id_fkey;
ALTER TABLE public.orders ADD CONSTRAINT orders_customer_id_fkey 
    FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;

ALTER TABLE public.orders DROP CONSTRAINT orders_driver_id_fkey;
ALTER TABLE public.orders ADD CONSTRAINT orders_driver_id_fkey 
    FOREIGN KEY (driver_id) REFERENCES public.drivers(id) ON DELETE SET NULL;

ALTER TABLE public.customers DROP CONSTRAINT customers_area_id_fkey;
ALTER TABLE public.customers ADD CONSTRAINT customers_area_id_fkey 
    FOREIGN KEY (area_id) REFERENCES public.areas(id) ON DELETE SET NULL;