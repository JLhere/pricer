# Pricer — Project Memory

Project-level memory for the **Pricer** hotel price-comparison H5. Consumed by Mavis when the user
mentions "Pricer" / "继续 Pricer" / "那个比价工具".

> ⚠️ Popz 和 Pricer 是 **两个独立项目**，互不相关。本文件仅描述 Pricer。

---

## 1. Project at a glance

- **Type**: H5 single-page tool — input a hotel name, get price comparison results across multiple
  OTAs and the hotel's own website, highlight the lowest rate.
- **Purpose (current)**: Personal-use MVP, primarily to (a) demonstrate a working tool for Booking
  Affiliate API application, (b) help the user find the cheapest room rate for personal travel.
- **Stack**: Plain HTML + CSS + Vanilla JS. **No build tool, no framework, no npm.**
  - Decision: kept minimal so the user can open `index.html` directly in a browser to see changes,
    and so the front-end structure is visible (good for learning front-end jargon in context).
  - Later when the user is comfortable, can graduate to Vite + a framework if needed.
- **Repo path**: `/Users/jl/.minimax/workspace/Pricer`
- **Local serve**: `python3 -m http.server 8080` from repo root, then open
  `http://localhost:8080/`.
- **Project name**: Pricer.

## 2. Module map

| File                | Purpose                                                                |
|---------------------|------------------------------------------------------------------------|
| `index.html`        | Single-page entry, structure + layout                                  |
| `css/style.css`     | All styles. Mobile-first.                                              |
| `js/app.js`         | DOM bindings, event handlers, orchestration (主入口 / controller) |
| `js/api.js`         | Data fetching. **Mock now, Booking Affiliate API later.**             |
| `js/utils.js`       | Price formatting, lowest-price highlight logic, helpers               |
| `AGENTS.md`         | This file                                                              |

**术语速讲**：
- **入口 / 路由（entry / router）**：用户进来第一个看到的文件（这里是 `index.html`）。"路由"是说
  不同 URL 映射到不同页面；我们只有一个页面，所以路由很简单。
- **主入口 / controller（app.js）**：所有逻辑的协调中心，类似大脑，告诉别的模块该干嘛。
- **数据层（api.js）**：负责拿数据，不管 UI。UI 不直接问 OTA 拿数据，只问 api.js 要。
- **工具层（utils.js）**：纯函数，没有副作用，谁都能用。比如"格式化 ¥888"。

## 3. Data sources — phasing

| Phase | Source                              | Status        |
|-------|-------------------------------------|---------------|
| 1     | Mock data (in `api.js`)             | ✅ Current    |
| 2     | Booking Affiliate API               | ⏳ Next       |
| 3     | Agoda Partners API                  | Backlog       |
| 4     | Expedia Affiliate Network (EAN)     | Optional      |
| ?     | Domestic (携程/美团/飞猪)         | Likely out — no public API, see §5 |

> ⚠️ Do not propose scraping domestic OTAs as a "simple" addition. They have strong anti-bot
> measures, prices often render client-side, and the legal/ToS exposure is real. If the user
> insists, surface the trade-offs in writing first.

## 4. Functional scope (current MVP)

**In scope**:
- Single input: hotel name (free text, e.g. "Hilton Tokyo" / "上海外滩茂悦大酒店").
- Search triggers fetch + render.
- Result list: per room type, per source (OTA + hotel官网), with price.
- Highlight the **lowest** total price across all (room type × source) combinations.
- Click a result → open that OTA / 官网 in a new tab.
- **Search criteria**: checkin / checkout / adults / children (with each child's age required).
- **Room count is NOT a user input** — users don't know how many people a room holds. The system
  must match the optimal room count from the user's party size against each room type's capacity
  (a future enhancement; for now we hardcode 1 room and assume "all fits in one room").

### Future: optimal room-count matching

When we go past MVP, each room type needs a `capacity` field (e.g. `{ adults: 2, children: 2 }`).
The algorithm:

1. Given party `(adults, childrenAges)` and a room type capacity `cap`:
   - `roomsNeeded = ceil(adults / cap.adults)` (each room holds the max adults)
   - If `childrenAges.length > cap.children` after that, bump to `roomsNeeded + 1`.
2. Multiply per-room per-night by `roomsNeeded` to get total.
3. Compare `totalPrice` across room types — the "lowest" tag should pick the cheapest
   *combination* of room type × OTA, not just the cheapest per-room rate.

Until that's in place, assume **1 room works for all cases** (which is true for solo / couple use,
the primary MVP scenario).

**Upper bound rationale for `adults` and `children` selects**:
- We currently cap at **1–4 for adults** and **0–4 for children**. This matches "standard double
  room + rollaway bed" capacity (2 adults + 2 children). Larger groups should consider multi-room
  bookings — see §9 below.

---

## 9. Future features backlog

### Group / large-party support

These features are deferred — MVP serves the 1–4 person solo/couple/small-family use case, which
is the dominant share of OTA traffic. Anything beyond that moves to "future":

- **Auto-suggest "add another room"** (OTA-style). When `adults + children` exceeds a room type's
  capacity, show inline next to that room type: "这间房最多住 X 人，建议再加 Y 间", with a
  dropdown letting the user pick room count (1–4). Some OTAs (Booking, Agoda) do this on the
  results page when capacity is exceeded. Pricer should mimic this UX once we have real capacity
  data from Booking Affiliate API.
- **Group booking prompt (≥8 people)**. When party size ≥ 8, surface a banner:
  > "8+ 人团体出行建议走专业渠道（Cvent / HotelEngine / 旅行社），个人 OTA 通常不擅长。"
  Reasoning: personal OTA flow assumes "1 representative + a few rooms". A real 20-person group
  is almost always booked via agency / wholesale, not on Booking / 携程 directly.
- **Multi-room-type combo booking**. Let the user select multiple room types in one order
  (e.g. 5 × Twin + 1 × Suite). Trip.com and Airbnb support this pattern. Out of MVP scope.
- **Airbnb integration**. Villas / entire homes often host 10+ people — a different search
  paradigm. Worth considering only if the user explicitly wants "large party" coverage.

### Booking API integration

- Apply for Booking Affiliate Partner Program (see §6 for checklist).
- After API key is granted: replace `api.js` mock data with real `searchHotelsByCity + hotels +
  hotelAvailability` calls. CORS will block direct browser→Booking calls — see §1 → either a
  small proxy server or use Booking's allowed CORS configuration.
- Add second source: Agoda Partners API (lower priority — same workflow as Booking).
- Skip Expedia EAN initially ($500 entry fee is not worth it for personal MVP).

### UX polish

- Loading skeleton instead of spinner.
- Price-trend chart per room type (last 7 days) — show as a sparkline next to each price.
- "Save this search" — localStorage-based history. No user accounts needed for MVP.
- Currency selector (CNY / USD / EUR) when international hotels are added.

**Out of scope (for MVP)**:
- Multi-city, multi-hotel comparison.
- User accounts / favorites / search history.
- Map view, photos, reviews.
- Caching beyond browser-level.
- Auto room-count matching based on room capacity (see §4 — design question).

## 5. Spec / 口径 for "lowest price"

- **Currency**: assume CNY by default; show original currency if foreign (待讨论 with user).
- **Total price** = nightly rate × nights + taxes + fees. **NOT** the bare room rate.
- For MVP we don't have date/guest inputs, so we'll display per-night total inclusive of fees as
  reported by each source. When dates land, this will become "stay total".
- If a source shows "from ¥X" without exact price → mark as `估算` and exclude from "lowest"
  highlighting.

## 6. Booking Affiliate API — application checklist

When the user is ready to apply, the H5 needs at minimum:

- A real, working landing page (this skeleton already meets that once it has a heading + content).
- About / Contact page or section.
- Visible "hotel" theme — the search box + results UI counts.
- A stable domain (or at least a stable URL while hosted somewhere — GitHub Pages works for the
  application step, but a custom domain is preferred before going live for traffic).

**Don't** include in the application page:
- Auto-refresh / auto-click / bot-like behavior (Affiliate ToS forbids).
- Anything that looks like scraping.

## 7. Working agreements

- **No silent framework upgrade.** Plain HTML/CSS/JS until the user asks otherwise. Don't "improve"
  to React/Vue just because it's modern.
- **Black-words (黑话) glossary**: see `references/jargon.md` (TBD) — build it incrementally as we
  encounter each term in real work. The user wants to learn front-end jargon *in context*, not from
  a dump.
- **Mock data must be obviously fake** (e.g. ¥888, ¥666) so the user can tell at a glance which
  results are not real. Add a "示例数据" watermark when on mock data.
- **Don't introduce npm / node tooling** without the user asking.
- The H5 is currently **front-end only**. There's no backend yet. When the user asks "how do we
  actually call Booking without exposing the API key", raise CORS + a small backend / proxy as the
  next-step discussion (do not silently add one).

## 8. Open questions to resolve before scaling

- [ ] Currency display (CNY only? Show original too? Auto-convert by fx?)
- [ ] Date range input — when to add, single-night default or range required?
- [ ] Number of guests / rooms
- [ ] Hotel official site: detect / add via search? Or hard-coded per hotel?
- [ ] Hosting target — GitHub Pages for application? Custom domain when live?
- [ ] Commission disclosure — Affiliate ToS usually requires disclosing partnership with each OTA.