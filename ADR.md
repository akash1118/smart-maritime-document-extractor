# Architecture Decision Record — Smart Maritime Document Extractor

---

## Q1 — Sync vs Async: Which should be the default in production?

**Default: `async`.**

The sync mode holds an HTTP connection open while waiting on two sequential LLM calls (extract + optional repair/retry) behind a 30-second timeout. That works fine during development and for low-traffic demo environments, but it is the wrong default for production for three concrete reasons: (1) LLM latency is unpredictable — a cold model or a large PDF can easily spike past 15 seconds, which breaks mobile clients and most reverse-proxy idle timeouts; (2) a single slow sync request occupies a Node.js request slot that could serve dozens of fast health-checks or polling calls; (3) async is already implemented and costs the client nothing more than one follow-up poll.

**Force-async thresholds (ignore the `?mode` param entirely):**

- **File size ≥ 2 MB.** At that point the base64-encoded payload sent to the LLM is ~2.7 MB, and multipage PDFs at this size routinely trigger the full repair-and-retry path. Sync latency at 2 MB+ is consistently above 20 s in testing.
- **Concurrency ≥ 5 in-flight sync requests.** When 5+ callers are all blocking on LLM responses simultaneously, P99 latency compounds. At that point a new sync request should be 429'd or silently promoted to async to avoid cascading queue-backs on the Node.js event loop.

In practice: add middleware that reads `Content-Length` and a shared in-flight counter, and redirect to async when either threshold is breached, regardless of the `?mode` query param.

---

## Q2 — Queue Choice: What was used and why?

**Mechanism: an in-process `Map<jobId, payload>` drained sequentially via `setImmediate`.**

This was a deliberate scope-limiting choice, not a naive oversight. The brief required a working async job model. A real queue (BullMQ, SQS, RabbitMQ) adds operational dependencies — a separate broker, deployment config, dead-letter setup — that would have dominated the implementation time without improving the signal-to-noise of the design. The in-process queue demonstrates the job lifecycle (QUEUED → PROCESSING → COMPLETE / FAILED), the polling contract, and error recording, which are the architecturally interesting parts.

**Failure modes of the current approach:**

1. **Process crash loses all queued jobs.** There is no persistence; anything in the `Map` at crash time is silently dropped. The DB rows stay in `QUEUED` forever with no signal.
2. **No parallelism.** Jobs drain one at a time (`processNext` recurses via `setImmediate`). A single slow LLM call blocks everything behind it.
3. **No retry.** The `isRetryable` flag is stored but never acted on; timed-out jobs simply fail permanently.
4. **Horizontal scaling is impossible.** Two instances each hold their own map; there is no shared queue, so load-balancing a second replica fragments job state.

**Migration path for 500 concurrent extractions/minute:**

Switch to **BullMQ** (backed by Redis, which is already in the stack). At 500/min, the dominant concern is LLM API throughput, not queue throughput. BullMQ gives: durable persistence across restarts, configurable worker concurrency (`new Worker(..., { concurrency: N })`), built-in exponential-backoff retries, a dead-letter queue for permanently failed jobs, and the same Redis instance already used for rate-limiting. Beyond ~2,000/min, migrate to a managed broker (AWS SQS + Lambda consumers, or Temporal) to decouple the queue from the API process entirely.

---

## Q3 — LLM Provider Abstraction

**Yes, a provider interface was built. The abstraction is non-trivial and the right call for this domain.**

Maritime document extraction is a long-lived workflow. Operator contracts change, model pricing shifts, and different document types may warrant different models (e.g., Gemini's multimodal strengths for image-heavy CoCs vs. GPT-4o for dense text tables). Hard-coding against one provider would make that evolution expensive.

**The interface (`BaseLlmClient`):**

```typescript
abstract class BaseLlmClient {
  abstract extract(base64File: string, mimeType: string): Promise<string>;
  abstract extractWithHints(
    base64File: string,
    mimeType: string,
    fileName: string,
  ): Promise<string>;
  abstract repairJSON(malformedJson: string): Promise<string>;
  abstract validate(documents: object[]): Promise<string>;
}
```

- `extract` — primary document parsing call; returns raw LLM text (JSON expected).
- `extractWithHints` — retry path when confidence is `LOW`; passes the filename as a contextual hint to steer the model.
- `repairJSON` — fallback when `extract` returns malformed JSON; asks the model to fix its own output.
- `validate` — cross-document consistency check across an entire session.

`LlmFactory.createLlmClient()` reads `LLM_PROVIDER` from the environment and returns a `GeminiClient` or `OpenAIClient`. Both subclasses implement all four methods against their respective SDKs; all timeout logic, base64 encoding, and prompt injection live in the concrete classes. Swapping providers is a one-line env-var change.

---

## Q4 — Schema Design: JSONB/TEXT for Dynamic Fields

The schema uses a hybrid approach: stable, high-value fields (holder name, document type, expiry flag, file hash) are promoted to typed columns, while variable document fields (`fieldsJson`, `validityJson`, `medicalDataJson`, `flagsJson`, `complianceJson`) live in `Json` (JSONB) columns.

**Risks at scale:**

1. **No cross-document querying without `jsonb_path_query` or application-side filtering.** A query like "all sessions where any document's COC is expired" requires either a PostgreSQL JSONB path expression or a full table scan + deserialisation in application code. Neither is cheap at millions of rows.
2. **Schema drift is invisible.** If the LLM starts returning a new field shape, the old JSONB rows retain the old shape silently. There is no migration, no type check, and no alerting. Queries that assume a certain JSONB key structure break at runtime, not at deploy time.
3. **Index limitations.** GIN indexes on JSONB support containment queries (`@>`) efficiently, but not arbitrary path expressions. Deep, nested key lookups remain full-scan operations unless you know the query pattern in advance and create a dedicated expression index.
4. **Full-text search is effectively unsupported.** PostgreSQL's `tsvector` can be applied to JSONB values with extra gymnastics, but it requires materialised computed columns or triggers, and the approach doesn't compose naturally with Prisma.

**What I would change for full-text search or cross-session COC expiry queries:**

- **Promote `isExpired` per-document-type.** The current schema already has a flat `isExpired` boolean; extend it to an `expiredDocumentTypes String[]` array column so a simple array-contains index (`@>`) covers the COC-expiry query without touching JSONB.
- **Extract a `DocumentField` table** (`extraction_id`, `field_key`, `field_value TEXT`, `field_value_date DATE NULL`). This normalises the dynamic fields into rows, enables B-tree indexes on `(field_key, field_value)`, and makes FTS straightforward via a standard `tsvector` column on `field_value`. The cost is a larger row count and more complex writes; the benefit is arbitrary structured queries.
- **Add a dedicated search index** (Elasticsearch / Typesense / pg `tsvector` with `GIN`) if the product needs free-text search across extracted field values. Trying to do this in raw JSONB will work at small scale and degrade badly beyond a few hundred thousand records.

---

## Q5 — What Was Deliberately Skipped

**1. Authentication and multi-tenancy.**
Every endpoint is public. In production this service would need JWT/API-key authentication, and every query (sessions, extractions, jobs) would be scoped to a `tenantId`. Skipped because it is pure plumbing that adds no design signal — the interesting architecture is the extraction pipeline, not an auth middleware that every Node.js service looks the same.

**2. Durable job retry with backoff.**
The `isRetryable` flag is stored but never actioned. A production system needs a retry loop with exponential backoff, a max-attempt cap, and a dead-letter state. Skipped because implementing it correctly requires the durable queue (see Q2); doing it on top of the in-process map would have produced misleading code — a retry loop with no crash-safety is worse than no retry loop because it gives false confidence.

**3. File storage / streaming.**
Files are held entirely in memory (`multer` memory storage, then a `Buffer` passed through the call chain). For a production service, files should be uploaded to object storage (S3, GCS) immediately on receipt, and workers should stream bytes rather than hold multi-megabyte buffers in the Node.js heap. At 10 MB max file size and moderate concurrency, in-memory buffers will cause OOM events. Skipped because adding an S3 client and presigned-URL flow would have doubled the infrastructure surface without clarifying the extraction architecture.
