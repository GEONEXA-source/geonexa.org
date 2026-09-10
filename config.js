// GeoNEXA AI — Supabase config
// Replace these with your actual project values.
// Find them in Supabase Dashboard → Project Settings → API

const SUPABASE_URL = "https://ogwckglzluhjwmucrodb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nd2NrZ2x6bHVoandtdWNyb2RiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0NDgyNjQsImV4cCI6MjEwMjAyNDI2NH0.kbRoGMj9qjbFKkIzoO3iaz4baRCJX1w04lexpV7-DIc";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
