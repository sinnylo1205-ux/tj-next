-- Add 'returned' to order_status_enum
ALTER TYPE order_status_enum ADD VALUE IF NOT EXISTS 'returned';