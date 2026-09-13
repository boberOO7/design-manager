# Equipment reference catalog

Equipment suggestions query shared local reference tables through
`searchEquipmentCatalog()` and `/api/equipment/catalog`. The caller uses verified
membership resolution and its normal Supabase client; RLS permits only an active
studio administrator with one active membership and an active profile. There are
no catalog foreign keys on inventory and no inventory mutations in the importer.
Selection persists ordinary manufacturer/model strings. Manual values, legacy
PC data, and structured vendor/family controls retain their existing validation.
Catalog failures produce an empty suggestion list, never an invalid form value.

## Source contract

Verified against Icecat's current official manuals on 2026-09-12:

- [Index batch processing](https://iceclog.com/manual-icecat-product-xmls-batch-processing/)
  (v2, updated June 2026): full and daily XML indexes share a structure; daily
  includes yesterday's changes and `Quality=REMOVED`. The helper also offers CSV.
  StudioFlow implements streaming XML, including gzip, without fetching sheets.
- [Reference files](https://iceclog.com/manual-for-reference-files/): `Supplier_id`
  joins Supplier ID/Name; `Catid` joins Category ID and English Name (`langid=1`).
  Only approved leaf names below are mapped, without recursively importing their
  parents, descendants, accessories, or consumables.
- [Export authentication](https://iceclog.com/manual-how-to-retrieve-export-files/):
  HTTP Basic credentials or an `Api-token` header. A registered Open Icecat account
  is required. Open scope uses `export/freexml`, not the paid `level4` repository.
  The unauthenticated category-feed probe returned HTTP 401; actual account
  coverage and feed downloads require operator credentials.
- [Product XML manual](https://iceclog.com/open-catalog-interface-oci-open-icecat-xml-and-full-icecat-xml-repositories/)
  (v2.7, updated August 2026): product IDs are stable provider identifiers, distinct
  from manufacturer product codes; index timestamps can differ from HTTP header
  timestamps. We preserve `Generated`/`Updated` as provider wall-clock timestamps,
  not guessed UTC instants. Icecat's current fair-use terms govern imported data;
  review the linked terms before enabling an account. This integration stores
  reference identity, not product datasheets, media, or specifications.

Fixed worker URLs below `https://data.icecat.biz/export/freexml/`:
`EN/daily.index.xml.gz`, `refs/SuppliersList.xml.gz`,
`refs/CategoriesList.xml.gz`. The initial index is `EN/files.index.xml.gz`.
The operator can supply plain XML or gzip downloads; HTTP content encoding is
handled independently of gzip file encoding. Redirects are rejected and credentials
never appear in URLs, browser requests, or committed files.

## Category mapping

IDs resolve from the downloaded reference file. This avoids maintaining assumed
numeric IDs or importing every category. Dry-run output lists resolved IDs/types;
review that mapping before the initial write. An empty mapping fails the import.

| StudioFlow context | Allowed English Icecat category names |
| --- | --- |
| Whole manufactured PC | PCs/Workstations |
| Laptop | Notebooks, Laptops |
| Monitor | Computer Monitors |
| Mouse / keyboard | Mice / Keyboards |
| Headphones / webcam | Headphones & Headsets / Webcams |
| Printer | Laser Printers, Inkjet Printers, Multifunction Printers |
| AC | Air Conditioners, Split-System Air Conditioners, Mobile Air Conditioners |
| Coffee machine | Coffee Makers |
| Structured CPU / GPU | Processors / Graphics Cards |
| Other, RAM and storage controls | No product import; existing free text or semantic controls |

Limited/reseller-only and undescribed records are skipped. Unsupported categories
are skipped before normalization. Relevant malformed records fail the run rather
than silently advancing its checkpoint. Empty or overlong model names fall back
to the exact manufacturer product code, which must fit the existing 160-character
equipment limit; names are never truncated. Component vendor/family extraction
uses explicit family names in product text independently of the supplier. A
recognized CPU row therefore uses AMD/Intel plus its structured family and model
even when the supplier is an OEM. Recognized consumer GPU rows reduce reliably
parsed board SKU text to the chip model while retaining semantic variants such
as Ti, SUPER, XT and XTX. Ambiguous component names remain unchanged under the
supplier/Other context.
This is an initial mapping, not a claim of exhaustive model/family coverage.

## History, search and synchronization

`equipment_catalog_models` contains one searchable row per equipment type plus
case-insensitive, whitespace-normalized manufacturer/model identity. CPU/GPU rows
use their parsed component vendor and model. Meaningful suffixes remain distinct.
The row retains display/family text, first/last-seen time, maximum surviving source
popularity, provider-product count and aggregate current/on-market state. It is
never deleted.

`equipment_catalog_provider_products` is keyed by `(source, source_product_id)`
and stores only its canonical-model foreign key, current/on-market flags,
popularity and source/seen timestamps. It has a normal foreign-key index but no
autocomplete text or fuzzy indexes. A stale generation or source timestamp cannot
replace newer mapping state. If a provider product changes identity, the mapping
moves and both canonical aggregates are recomputed in the same fenced batch.
`REMOVED` resolves the existing mapping by provider ID and marks it historical;
the canonical model stays current while another mapped provider product survives,
then becomes historical when none do. Absence from a full index alone changes
nothing. `On_Market` describes distributor visibility, not proof of discontinuation.

Search has a two-character model threshold, bounded results, escaped literal
queries, canonical-only context indexes, prefix indexes and trigram support. Two-character queries
use prefix only; three or more also permit substring and fuzzy matches. Rank is
exact, prefix, substring, fuzzy, then current/market state, similarity, aggregate
source popularity and a stable name tie-break. One canonical row yields one model
result, so provider SKUs never appear in the UI. Manufacturer ranking is precomputed
at successful sync completion from canonical popularity and model counts. Completion
upserts normalized manufacturer aggregates; it does not clear the table because
append-only historical canonical models keep every legitimate manufacturer useful.
Ranking remains independent of studio inventory. Manufacturer results merge with
a small repo-owned common-brand list for each equipment type, so initial and typed
brand suggestions do not depend entirely on provider coverage. Empty input returns
up to ten; typing searches additional names. The UI debounces 250ms, aborts stale
requests, retains server ranking, and always permits “use entered value”.

When improved normalization moves a stable provider product to a corrected
canonical identity, the existing batch RPC recomputes both canonical aggregates.
Zero-mapping superseded identities remain stored but are excluded from search;
removed products retain their mappings and remain searchable as history. Apply a
newer controlled full feed after a normalization change so all existing mappings
are revisited without duplicating provider identities.

Worker RPCs and sync-state writes are service-role-only. A renewable 10-minute
lease and run-ID checks fence concurrent/stale workers. XML is streamed with
backpressure; writes are at most 500 rows per batch. Success advances the provider
checkpoint only after the entire document and all writes validate. An interruption
can leave already imported batches visible; replay is safe and older source data
cannot overwrite newer data. Failed runs retain their previous completed checkpoint
and record a bounded error. Process death is recoverable after lease expiry. If all
batches were written but completion failed, the failure callback clears the run/lease
while leaving the checkpoint unchanged. Replay the same full feed: idempotent mappings
and canonical identities are reused, and only successful completion advances the checkpoint.

The scheduled route follows the existing Vercel `CRON_SECRET` Bearer convention,
with a separate `ICECAT_SYNC_ENABLED=true` opt-in. It runs daily at 04:30 UTC and
only fetches the daily index. It has a 240-second download deadline, 300-second
route budget, and 512 MiB decompressed index cap. Full imports run in the operator
process with an 8 GiB decompressed cap, not in startup or a request handler.
Supplier and category references have separate decompressed caps of 64 MiB and
256 MiB respectively; all feeds remain streamed.

Daily feeds are not an archived change log. If no full import completed, or a daily
feed is more than one calendar day beyond the completed generation, sync fails
with a coverage-gap message. Recover with an explicit full index import; no automatic
large fallback download occurs. Repeated/older generations are no-ops. This cannot
recover never-imported products that disappeared before StudioFlow first saw them.

## Controlled operator workflow

1. For write runs, apply pending migrations **locally** with `pnpm exec supabase migration up --local`
   (never reset). Regenerate with `pnpm exec supabase gen types typescript --local` and run the
   focused tests. Remote migration deployment requires separate explicit approval.
2. Download the full index and two reference files from the URLs above using the
   operator's account. Keep files outside the repository, e.g. `/tmp/icecat/`.
   Use the [official download instructions](https://iceclog.com/manual-how-to-retrieve-export-files/)
   and credentials in environment/configuration, not checked-in command files.
3. Validate without any database access:

   ```sh
   pnpm catalog:import --index /tmp/icecat/files.index.xml.gz \
     --suppliers /tmp/icecat/SuppliersList.xml.gz \
     --categories /tmp/icecat/CategoriesList.xml.gz
   ```

4. Export `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY` for the intended
   **local** stack (use `supabase status` locally; do not print/commit secrets).
   Repeat with `--write`. The command defaults to dry-run and refuses non-loopback
   targets unless the operator explicitly adds `--allow-remote`. It does not load
   `.env.local` implicitly, avoiding accidental selection of its remote target.
   Remote imports require explicit authorization and the additional flag.
5. After a successful full import, configure server-only `ICECAT_API_TOKEN` (or
   `ICECAT_USERNAME` plus `ICECAT_PASSWORD`), existing `SUPABASE_SECRET_KEY`, and
   `CRON_SECRET`; opt in with `ICECAT_SYNC_ENABLED=true`. Enable only on a deployment
   whose function duration supports the worker budget. A downloaded daily index
   can also be applied through the same command with `--mode daily --write`.

Dry runs require only the downloaded files, with no Supabase credentials or
migration prerequisite. CLI failures print the phase, record/category/attribute
context where available, parser position, and original cause/stack before a short
final failure line. Diagnostics are bounded and redact configured credentials,
authentication values, URLs and XML tags; expected skipped records stay quiet.
For a byte-limit failure, compare the reported **decompressed** size and limit.
For normalization failures, use the reported product ID and attribute to inspect
that record locally. Scheduled/public error responses remain generic.
Successful dry runs also report bounded catalog statistics: normalized counts by
StudioFlow type and source state, distinct and top-20 manufacturers, and counts
for the importer's existing unsupported-category, no-editor-content and limited
product skip branches. Statistics do not change which records normalize.
The dry-run-only canonical suggestion analysis groups by type, manufacturer and
autocomplete model (component vendor/model for CPU and GPU). Its identity folds
case and surrounding/repeated whitespace only. It reports distinct/current/off-market
counts, reduction ratio `(provider products - pairs) / provider products`,
duplicate-count distribution, top-20 duplicate pairs and
the same breakdown for Lenovo laptops and PCs. Market-state sets can overlap when
different provider SKUs for one model have different flags. No canonical analysis
is allocated or returned during write-mode imports.
The summary also labels the normalized total as provider products and lightweight
mappings, and reports the canonical-model count and reduction ratio. These counts
describe the intended write shape without accessing the database.

Monitor HTTP failures and service-only `equipment_catalog_sync_state`:
`last_started_at`, `last_completed_at`, `completed_generation`, `lease_until`,
`last_error`. A growing gap or repeated timeout requires operator recovery. Use a
long-running scheduled operator process if daily feeds exceed the route budget;
reuse the importer rather than adding another provider or a browser data path.

Validation: `supabase/tests/equipment_catalog_rls.test.sql`, importer unit tests,
the safeupdate-protected `scripts/test-equipment-catalog-completion-safeupdate.sql`,
query/route tests, and the Equipment Playwright suite exercise permissions,
idempotence, history, search, stale results and manual entry in both locales.
