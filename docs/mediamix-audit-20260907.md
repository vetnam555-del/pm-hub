# Media Mix Release Audit

Review date: 2026-09-07. Baseline: 92f68e3.

The follow-up v28 review found and fixed additional validation/import/output issues. See [the final review](mediamix-final-review-20260907.md) for the newer 33-test coverage and remaining boundaries. Counts below describe the initial v27 release.

## Findings and Disposition

| Priority | Finding | Disposition |
| --- | --- | --- |
| High | Legacy forecast divides fee-inclusive budget by media-only unit prices, overstating volume when markup is nonzero. | New pure engine removes markup before forecasting; invoice CPA/ROAS use fee-inclusive supply cost. |
| High | Platform toggle substitutes one platform's rows; domestic products are free text without campaign-level reference selection. | Unified product catalog, mixed-platform rows, brand/source/device filters. |
| High | Independent benchmark averages can produce inconsistent CPC/CTR/CPM in one forecast. | One declared driver per row: CPC, CPM, CPV, CPI, SEND, FIXED; other metrics derived from the same funnel. |
| High | Missing values and mixed goals can imply complete totals. | Missing metrics remain null; complete-only totals; purchase/lead/install conversion counts not pooled. |
| High | Spreadsheet templates include forecasts, prepaid contracts and messages, not interchangeable actual click benchmarks. | Private curated pack retains source row/date/type; prepaid volume independent; messages separate; unclear rows not auto-priced. |
| High | A public static repository is not private client data storage. | No client files or curated records committed. Imports local-only; explicit backup, preview and restore. |
| Medium | No actual XLSX export; TSV/print only. | Real XLSX with proposal summary, media plan, formula details, provenance, and media totals. |
| Medium | Some parsers accept trailing junk; A/B sample counts silently truncated. | Number parsing fixed; fractional sample counts rejected. |
| Medium | Claimed current normal ranges lack cited samples. | Downgraded to unverified educational reference ranges. Historical reference values are not performance guarantees. |
| Medium | Cache activation deletes all caches on shared GitHub Pages origin. | Deletes only pm-hub-prefixed caches. |
| Medium | Wide table minimum content expands main flex child on mobile. | min-width:0 and internal table scrolling; rendered mobile review. |

## Scope and Verification

- 17 pure-engine tests: markup, tax-inclusive and zero-tax, integer allocations, fixed over-allocation, zero versus missing CVR, all 6 models, dates, invalid rates, scenario, duplicate pack IDs.
- Browser regression: all 30 existing routes render nonempty; no uncaught JavaScript errors during the tested workflows.
- Browser flows: private pack import preview/commit, edit, approval invalidation, scenario, save/reload, campaign filter/add, benchmark navigation, desktop/mobile, real XLSX download.
- Export inspection: re-open cached values and independently recalculate with LibreOffice. Rendering is checked in browser; Microsoft Excel and every printer configuration are not exhaustively tested.
- Existing KPI/report/UTM/budget tools received source inspection and route smoke coverage, not every possible input combination.

## Important Boundaries

- This is a planning tool, not a media buying API, optimizer or guaranteed delivery estimate.
- No ad platform API sync. No automatic Google Sheet sync. XLSX import accepts the supplied normalized `벤치마크` sheet; arbitrary merged agency workbooks require mapping (the supplied references were curated separately).
- Browser storage does not sync between teammates, devices or browsers. Use explicit JSON backup/import. Public hosting does not publish browser data.
- Unit costs are media-only, tax-exclusive. Invoice VAT is a user-entered billing assumption, not inferred from platform names. Validate actual contract and billing treatment.
- Imported rows start unapproved. Source date, cost basis and conversion definition require review. Blank CVR/AOV intentionally leaves outputs unknown.
- Uploaded backups have a 15 MB limit; browser quota can be smaller. Storage failures surface to the user.
- Historical templates are not automatically averaged across advertisers. No artificial cross-brand CVR, revenue or ROAS is invented.
- Native Excel editing should happen in `계산 상세`; the file is a forecast snapshot, not a replacement for the browser's validation workflow. After major changes regenerate from the browser.

## Further Improvements (Not Claimed Complete)

1. Authenticated team workspace with access control, revision ownership and retention policy before shared private storage.
2. Platform connectors and GA event definitions with consent, credential security and source reconciliation.
3. Source sample size and attribution-window metadata; benchmark versioning with reviewed, comparable data.
4. Automated recurring freshness review for external media specs and policy links; no claim that every external reference is current.
5. XLSX/PDF golden-file regression for multi-page client print templates and accessibility review across all educational content.
6. Extract legacy lookup from old planner code to reduce maintenance surface; current public entrypoint uses the new studio and engine.

## Reproduce

`node --test tests/mix-engine.test.cjs`

Install Playwright from npm in a development-only location; set `PLAYWRIGHT_PATH` to its package path and `QA_DIR` outside the public repository, then run `node tests/browser.cjs`. Chrome must be installed. Optional `PRIVATE_PACK` points to the local curated pack, never a committed file.

Runtime dependency: vendored ExcelJS 4.4.0 (MIT), loaded only for Excel operations. Existing static/file-open architecture and GitHub Pages deployment retained.
