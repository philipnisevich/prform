# Graph Report - .  (2026-07-28)

## Corpus Check
- Corpus is ~11,835 words - fits in a single context window. You may not need a graph.

## Summary
- 176 nodes · 256 edges · 15 communities (10 shown, 5 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 18 edges (avg confidence: 0.92)
- Token cost: 110,000 input · 27,036 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Core Schema & Attribution Engine|Core Schema & Attribution Engine]]
- [[_COMMUNITY_Landing Page Components|Landing Page Components]]
- [[_COMMUNITY_Web Package Dependencies|Web Package Dependencies]]
- [[_COMMUNITY_TypeScript Config|TypeScript Config]]
- [[_COMMUNITY_RLS, Auth & the Pivot Thesis|RLS, Auth & the Pivot Thesis]]
- [[_COMMUNITY_InsForge Backend & Agent Skills|InsForge Backend & Agent Skills]]
- [[_COMMUNITY_Degradation Views & P2 Scope|Degradation Views & P2 Scope]]
- [[_COMMUNITY_Report Endpoint & Demo Script|Report Endpoint & Demo Script]]
- [[_COMMUNITY_App Layout & Scroll|App Layout & Scroll]]
- [[_COMMUNITY_Ranking Formula & Evidence Floor|Ranking Formula & Evidence Floor]]
- [[_COMMUNITY_Local Credential Files|Local Credential Files]]
- [[_COMMUNITY_ESLint Config|ESLint Config]]
- [[_COMMUNITY_Next.js Config|Next.js Config]]
- [[_COMMUNITY_PostCSS Config|PostCSS Config]]
- [[_COMMUNITY_App Icon|App Icon]]

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 16 edges
2. `InsForge` - 12 edges
3. `The pivot: make the database the detector` - 7 edges
4. `confirm_attributions(run_id)` - 7 edges
5. `Source-scoped views (degradation guarantee)` - 7 edges
6. `person table` - 7 edges
7. `source_event table` - 7 edges
8. `ticket_state table` - 7 edges
9. `run table` - 7 edges
10. `Access control (PRD §8)` - 7 edges

## Surprising Connections (you probably didn't know these)
- `Degradation mechanism (PRD §8, SQL example)` --semantically_similar_to--> `Source-scoped views (degradation guarantee)`  [INFERRED] [semantically similar]
  PRD.md → PIVOT.md
- `How it works (README)` --semantically_similar_to--> `Access control (PRD §8)`  [INFERRED] [semantically similar]
  README.md → PRD.md
- `How it works (README)` --semantically_similar_to--> `confirm_attributions(run_id)`  [INFERRED] [semantically similar]
  README.md → PIVOT.md
- `How it works (README)` --semantically_similar_to--> `Source-scoped views (degradation guarantee)`  [INFERRED] [semantically similar]
  README.md → PIVOT.md
- `Stage 6 contradicts the pitch` --semantically_similar_to--> `Never render the divergence number`  [INFERRED] [semantically similar]
  PIVOT.md → PRD.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **InsForge coding-agent skill suite** — agents_insforge_skill, agents_insforge_cli_skill, agents_insforge_debug_skill, agents_insforge_integrations_skill, agents_find_skills_skill [EXTRACTED 1.00]
- **Witness pipeline sponsor division of labor** — prd_hydradb, prd_pipeshift, prd_rocketride, prd_insforge_sponsor_role [EXTRACTED 1.00]
- **Load-bearing InsForge features (pivot)** — pivot_confirm_attributions_function, pivot_source_scoped_views, pivot_classification_cache, pivot_rls_auth, pivot_storage_snapshots [EXTRACTED 1.00]

## Communities (15 total, 5 thin omitted)

### Community 0 - "Core Schema & Attribution Engine"
Cohesion: 0.13
Nodes (30): migrations/20260728182006_core-schema.sql, attribution table, Build order (PIVOT), confirm_attributions(run_id), confirm_window_hours run parameter, Fallback: drop Pipeshift entirely, Ghost Work, identity_claim table (+22 more)

### Community 1 - "Landing Page Components"
Cohesion: 0.12
Nodes (19): Logo(), LINKS, Nav(), TerminalWindow(), ruleAAvailable(), ruleBAvailable(), SourceId, SOURCES (+11 more)

### Community 2 - "Web Package Dependencies"
Cohesion: 0.08
Nodes (23): dependencies, gsap, lenis, next, react, react-dom, devDependencies, eslint (+15 more)

### Community 3 - "TypeScript Config"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 4 - "RLS, Auth & the Pivot Thesis"
Cohesion: 0.12
Nodes (18): Reference users via auth.users(id) / auth.uid(), migrations/20260728182010_rls-access-control.sql, Branch workflow, Classification cache, classification table, RLS + Auth, Storage — run snapshots, The pivot: make the database the detector (+10 more)

### Community 5 - "InsForge Backend & Agent Skills"
Cohesion: 0.14
Nodes (14): agents-love-you (InsForge project), find-skills skill, InsForge, insforge-cli skill, insforge-debug skill, insforge-integrations skill, @insforge/sdk client, insforge skill (+6 more)

### Community 6 - "Degradation Views & P2 Scope"
Cohesion: 0.20
Nodes (11): migrations/20260728182007_source-scoped-views.sql, migrations/20260728182009_attribution-engine.sql, migrations/20260728182011_realtime-run-stream.sql, migrations/20260728182013_vector-references.sql, Gmail source (contributes nothing), pgvector fuzzy reference resolution, Realtime — live run stream, Schedules (nightly run) (+3 more)

### Community 7 - "Report Endpoint & Demo Script"
Cohesion: 0.22
Nodes (7): corsHeaders, The demo (PIVOT), Edge function (report endpoint), Maria unblocked Chen on ENG-412 (example finding), POST /run response contract, degraded response block, Demo script (PRD §12)

### Community 8 - "App Layout & Scroll"
Cohesion: 0.40
Nodes (3): SmoothScroll(), instrumentSerif, metadata

### Community 9 - "Ranking Formula & Evidence Floor"
Cohesion: 0.40
Nodes (5): Divergence formula bug (low-visible people), Stage 6 contradicts the pitch, Evidence floor, Never render the divergence number, Ranking formula (PRD §9)

## Knowledge Gaps
- **65 isolated node(s):** `corsHeaders`, `LINKS`, `SourceId`, `SOURCES`, `instrumentSerif` (+60 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `InsForge` connect `InsForge Backend & Agent Skills` to `RLS, Auth & the Pivot Thesis`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **Why does `Access control (PRD §8)` connect `RLS, Auth & the Pivot Thesis` to `Core Schema & Attribution Engine`, `Report Endpoint & Demo Script`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **Why does `The pivot: make the database the detector` connect `RLS, Auth & the Pivot Thesis` to `Core Schema & Attribution Engine`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **What connects `corsHeaders`, `LINKS`, `SourceId` to the rest of the system?**
  _71 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Core Schema & Attribution Engine` be split into smaller, more focused modules?**
  _Cohesion score 0.12903225806451613 - nodes in this community are weakly interconnected._
- **Should `Landing Page Components` be split into smaller, more focused modules?**
  _Cohesion score 0.12 - nodes in this community are weakly interconnected._
- **Should `Web Package Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.08333333333333333 - nodes in this community are weakly interconnected._