-- PostgreSQL initialization script for Second Sight RF Tools
-- This script runs automatically when the database is first created

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Create custom types (if needed)
-- CREATE TYPE modulation_type AS ENUM ('AM', 'FM', 'PSK', 'QAM', 'FSK');

-- Set default permissions
GRANT ALL PRIVILEGES ON DATABASE forensic_signal_processor TO forensic;

-- Create indexes for common queries (will be created by Drizzle migrations)
-- These are examples and should match your schema

-- Performance tuning
ALTER DATABASE forensic_signal_processor SET timezone TO 'UTC';
ALTER DATABASE forensic_signal_processor SET log_statement TO 'mod';

-- Vacuum settings
ALTER DATABASE forensic_signal_processor SET autovacuum_vacuum_scale_factor TO 0.1;
ALTER DATABASE forensic_signal_processor SET autovacuum_analyze_scale_factor TO 0.05;

\echo 'PostgreSQL initialization complete for Second Sight RF Tools'
