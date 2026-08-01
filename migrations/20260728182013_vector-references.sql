-- Witness — fuzzy reference resolution
--
-- Regex catches "ENG-412". It misses "the auth timeout thing". Embedding
-- messages and ticket titles lets a paraphrased reference still resolve to a
-- ticket, which is what most real Slack unblocks look like. reference.method
-- records 'vector' for these so a citation can say how it was found.

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE public.source_event ADD COLUMN embedding vector(1536);
ALTER TABLE public.ticket_state ADD COLUMN title TEXT;
ALTER TABLE public.ticket_state ADD COLUMN embedding vector(1536);

CREATE INDEX source_event_embedding_hnsw_idx
ON public.source_event
USING hnsw (embedding vector_cosine_ops);

CREATE INDEX ticket_state_embedding_hnsw_idx
ON public.ticket_state
USING hnsw (embedding vector_cosine_ops);

-- Runs through visible_ticket_state, so a fuzzy match still respects the
-- run's enabled_sources — a disabled source can't be matched into existence.
CREATE OR REPLACE FUNCTION public.match_ticket_by_embedding(
  p_run_id UUID,
  query_embedding vector(1536),
  match_count INTEGER DEFAULT 3,
  match_threshold DOUBLE PRECISION DEFAULT 0.75
)
RETURNS TABLE (ticket_key TEXT, source TEXT, title TEXT, similarity DOUBLE PRECISION)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT t.ticket_key, t.source, t.title, 1 - (t.embedding <=> query_embedding) AS similarity
  FROM public.visible_ticket_state(p_run_id) t
  WHERE t.embedding IS NOT NULL
    AND 1 - (t.embedding <=> query_embedding) >= match_threshold
  ORDER BY t.embedding <=> query_embedding
  LIMIT match_count;
$$;

REVOKE ALL ON FUNCTION public.match_ticket_by_embedding(UUID, vector, INTEGER, DOUBLE PRECISION) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_ticket_by_embedding(UUID, vector, INTEGER, DOUBLE PRECISION) TO authenticated;
