-- followers table
CREATE TABLE IF NOT EXISTS public.followers (
    id BIGSERIAL PRIMARY KEY,
    address VARCHAR(66) NOT NULL,
    follower_address VARCHAR(66) NOT NULL,
    is_mutual BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(address, follower_address)
);

-- Create indexes for relevant fields
CREATE INDEX IF NOT EXISTS followers_address_idx ON public.followers(address);
CREATE INDEX IF NOT EXISTS followers_follower_address_idx ON public.followers(follower_address);

-- RLS (Row Level Security) rules
ALTER TABLE public.followers ENABLE ROW LEVEL SECURITY;

-- Everyone can read and write, authentication not required
CREATE POLICY "Everyone can read and write" ON public.followers
    FOR ALL
    USING (true);

-- follow_stats table
CREATE TABLE IF NOT EXISTS public.follow_stats (
    id BIGSERIAL PRIMARY KEY,
    address VARCHAR(66) NOT NULL,
    date DATE NOT NULL,
    follower_count INTEGER DEFAULT 0,
    following_count INTEGER DEFAULT 0,
    mutual_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(address, date)
);

-- Create indexes for relevant fields
CREATE INDEX IF NOT EXISTS follow_stats_address_idx ON public.follow_stats(address);
CREATE INDEX IF NOT EXISTS follow_stats_date_idx ON public.follow_stats(date);

-- RLS (Row Level Security) rules
ALTER TABLE public.follow_stats ENABLE ROW LEVEL SECURITY;

-- Everyone can read and write statistics, authentication not required
CREATE POLICY "Everyone can read and write statistics" ON public.follow_stats
    FOR ALL
    USING (true);

-- Manual cleaning function for 60-day limit
CREATE OR REPLACE FUNCTION clean_old_stats() RETURNS void AS $$
BEGIN
    DELETE FROM public.follow_stats
    WHERE date < CURRENT_DATE - INTERVAL '60 days';
END;
$$ LANGUAGE plpgsql;

-- Note: Automatic scheduler (cron) is not used.
-- You can run this function manually or with an HTTP trigger:
-- SELECT clean_old_stats();

COMMENT ON TABLE public.followers IS 'Stores user follow and follower relationships';
COMMENT ON TABLE public.follow_stats IS 'Stores daily follower statistics (kept for 60 days)';
COMMENT ON FUNCTION clean_old_stats() IS 'Function that cleans statistics older than 60 days. Must be run manually.'; 