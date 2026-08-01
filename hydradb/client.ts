// Thin REST wrapper over HydraDB's current v2 API. Every method here was
// exercised live against a real database on 2026-07-28 (create, status,
// ingest, poll, list, inspect, query all round-tripped correctly) — this is
// not doc-summary guesswork, it's verified.
//
// Two dead ends on the way here, worth recording so nobody re-walks them:
// 1. There is no connector/OAuth-sync system (no Slack/GitHub/Linear
//    "connectors" you point HydraDB at). An earlier version of this file was
//    built off WebFetch-summarized doc pages describing exactly that, which
//    turned out to be fabricated — the real API has no such endpoints.
//    Slack/GitHub/Linear data has to be pulled by us (see identity.ts,
//    sync.ts) and pushed in via ingestKnowledge.
// 2. https://docs.hydradb.com/api-reference/openapi.json describes a
//    DEPRECATED legacy API (`/tenants`, `/list/data`, `/fetch/content`,
//    `/recall/*`) that HydraDB silently serves when the `API-Version: 2`
//    header is omitted. It looks plausible and mostly works, which makes it
//    a worse trap than an outright 404 — it round-tripped a test upload but
//    lost the body text and nagged "please migrate to v2" in every error.
//    The current API (`/databases`, `/context/*`, `/query`) requires that
//    header explicitly; https://agents.hydradb.com/AGENTS.md is the
//    authoritative reference and is where this file's shapes come from.

const BASE_URL = "https://api.hydradb.com";
const HEADERS = { "API-Version": "2" };

interface Envelope<T> {
  success: boolean;
  data: T;
  error: { code: string; message: string } | null;
}

export interface AppKnowledgeSource {
  id: string;
  title?: string;
  type?: string;
  // Live-tested: free text placed here is what /query full-text-matches
  // against (confirmed with a real "ENG-412" query returning this chunk at
  // 0.68 relevancy). content.text round-trips but wasn't confirmed searchable
  // the same way — prefer description for anything that needs to be findable.
  description?: string;
  url?: string;
  timestamp?: string;
  metadata?: Record<string, unknown>; // schema-backed fields declared at database creation
  additional_metadata?: Record<string, unknown>; // free-form, confirmed round-trips as-is
}

export interface HydraSource {
  id: string;
  title: string;
  type: string;
  description: string;
  timestamp: string;
  metadata: Record<string, unknown>;
  additional_metadata: Record<string, unknown>;
}

export class HydraDBClient {
  constructor(private apiKey: string, private database: string) {
    if (!apiKey) throw new Error("HYDRA_DB_API_KEY is not set");
    if (!database) throw new Error("HYDRA_DB_DATABASE is not set");
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        ...HEADERS,
        ...(init.body && typeof init.body === "string" ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
    const body = (await res.json().catch(() => null)) as Envelope<T> | null;
    if (!res.ok || !body?.success) {
      throw new Error(`HydraDB ${init.method ?? "GET"} ${path} -> ${res.status}: ${JSON.stringify(body ?? {})}`);
    }
    return body.data;
  }

  /** POST /databases — idempotent (409 on an existing database is fine). */
  async ensureDatabase(): Promise<void> {
    try {
      await this.request(`/databases`, { method: "POST", body: JSON.stringify({ database: this.database }) });
    } catch (err) {
      if (!String(err).includes("409") && !String(err).toLowerCase().includes("already_exists")) throw err;
    }
  }

  /** GET /databases/status — polls until infra.ready_for_ingestion. */
  async waitForDatabaseReady(timeoutMs = 120_000, pollIntervalMs = 3_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const status = await this.request<{ infra: { ready_for_ingestion: boolean } }>(
        `/databases/status?database=${encodeURIComponent(this.database)}`,
      );
      if (status.infra.ready_for_ingestion) return;
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
    console.warn(`Database ${this.database} not confirmed ready after ${timeoutMs}ms — proceeding anyway`);
  }

  /** POST /context/ingest (app_knowledge only — no files). Returns 202-style queued results. */
  async ingestKnowledge(sources: AppKnowledgeSource[]): Promise<{ success_count: number; failed_count: number; results: { id: string; status: string; error: string | null }[] }> {
    const form = new FormData();
    form.set("type", "knowledge");
    form.set("database", this.database);
    form.set("app_knowledge", JSON.stringify(sources.length === 1 ? sources[0] : sources));
    const res = await fetch(`${BASE_URL}/context/ingest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, ...HEADERS },
      body: form,
    });
    const body = (await res.json().catch(() => null)) as Envelope<any> | null;
    if (!res.ok || !body?.success) throw new Error(`HydraDB ingestKnowledge -> ${res.status}: ${JSON.stringify(body ?? {})}`);
    return body.data;
  }

  /** GET /context/status — polls until every id reaches a terminal indexing_status. */
  async waitForIndexed(ids: string[], timeoutMs = 60_000, pollIntervalMs = 2_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const status = await this.request<{ statuses: { id: string; indexing_status: string }[] }>(
        `/context/status?database=${encodeURIComponent(this.database)}&ids=${ids.map(encodeURIComponent).join(",")}`,
      );
      const terminal = ["completed", "graph_creation", "errored", "failed"];
      if (status.statuses.every((s) => terminal.includes(s.indexing_status))) return;
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
    console.warn(`Indexing for ${ids.length} source(s) not confirmed complete after ${timeoutMs}ms`);
  }

  /** POST /context/list */
  async listContext(opts: {
    type?: "knowledge" | "memory";
    filters?: Record<string, unknown>;
    page?: number;
    page_size?: number;
  } = {}): Promise<{ sources: HydraSource[]; total: number; total_pages: number }> {
    const data = await this.request<{ sources: HydraSource[]; total: number; pagination: { total_pages: number } }>(
      `/context/list`,
      {
        method: "POST",
        body: JSON.stringify({
          database: this.database,
          type: opts.type ?? "knowledge",
          filters: opts.filters,
          page: opts.page ?? 1,
          page_size: opts.page_size ?? 100,
        }),
      },
    );
    return { sources: data.sources, total: data.total, total_pages: data.pagination.total_pages };
  }

  async *iterateContext(filters: Record<string, unknown> = {}): AsyncGenerator<HydraSource> {
    let page = 1;
    while (true) {
      const { sources, total_pages } = await this.listContext({ filters, page, page_size: 100 });
      for (const doc of sources) yield doc;
      if (page >= total_pages) return;
      page += 1;
    }
  }

  /** GET /context/inspect */
  async inspectContext(id: string): Promise<{ content: string | null; presigned_url: string | null }> {
    const params = new URLSearchParams({ id, database: this.database, mode: "both" });
    return this.request(`/context/inspect?${params}`);
  }

  /** POST /query — semantic + full-text hybrid search. Confirmed live: a query
   *  for "ENG-412" correctly matched a source whose `description` contained it. */
  async query(query: string, opts: { type?: "knowledge" | "memory" | "all"; max_results?: number } = {}): Promise<{ chunks: unknown[] }> {
    return this.request(`/query`, {
      method: "POST",
      body: JSON.stringify({ database: this.database, type: opts.type ?? "knowledge", query, max_results: opts.max_results }),
    });
  }
}
