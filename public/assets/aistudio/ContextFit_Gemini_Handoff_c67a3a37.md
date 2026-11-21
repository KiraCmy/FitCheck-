# ContextFit — Gemini Project Handoff

> **Positioning:** A constraint-aware shopping decision agent embedded in Shopify storefronts.  
> **Tagline:** Find what fits. Understand what doesn't.  
> **Core question:** “Why Not This Product?” → “What Would Make It Work?”

## 1. Project context

We are building a hackathon MVP using Gemini and Shopify, with approximately **3.5 hours** of development time, built by **one solo developer using AI-assisted / vibe coding**. Scope, sequencing, and fallbacks must be realistic for one person; do not assume teammates or parallel implementation. The product is **merchant-side**: an AI assistant embedded in a Shopify furniture store, **not** an independent cross-merchant shopping platform.

The original idea was to place one product into different user-uploaded environments, then evolved into recommending multiple similar products for one user-uploaded space. However, room visualization, environment-based recommendation, and product comparison already exist in competing tools. Our differentiation should therefore be **constraint identification, evidence-based explanation, and adaptive conflict resolution**—not image generation alone.

## 2. Product definition

**ContextFit** helps shoppers understand whether a product they already like works in their actual environment, what might go wrong, and what smallest change could resolve the conflict.

**Product thesis:** Turn product mismatch into product discovery, while preserving the shopper's original preferences whenever possible.

**Merchant value hypothesis:** When the initially viewed item is unsuitable, help customers find a viable alternative within the **same Shopify store** instead of leaving. Potential business outcomes—higher conversion, lower fit-related returns—must be validated rather than claimed as proven.

### Target users
- **Shopper:** Someone buying furniture for a small apartment, uncertain about dimensions, circulation, window obstruction, and aesthetic compatibility.
- **Merchant:** A Shopify furniture seller seeking to help shoppers make confident purchase decisions and discover other products in its own catalog.

### Jobs to be done
“When I like a piece of furniture but am unsure whether it will work in my room, help me identify the real risks, compare possible solutions, and buy confidently without starting my search over.”

## 3. Core scenario: Small apartment × accent chair × window

1. A shopper browses a **high-back accent chair** on a Shopify product page.
2. They click **Find My Fit / Why Not This Product?**
3. They upload a photo of their room and say: “I want a reading chair here, but I don't want to block the window.”
4. Gemini identifies visible room elements (window, nearby furniture, possible placement area), parses the shopper's stated preferences, and reads the selected product's **actual Shopify attributes**.
5. The assistant explains a **potential** conflict: the high back could obstruct the window visually, while clearly flagging unknown room measurements and exact placement.
6. It recommends two alternatives from the **same merchant catalog** (e.g., a low-back chair or a narrower high-back chair), with explicit trade-offs.
7. The shopper says: “But I really love the high-back design.”
8. The agent **revises its plan** rather than repeating recommendations: retain the chair and suggest a different placement, or find a narrower high-back alternative.
9. The shopper compares options and can **Add to Cart** using Shopify.

**Hero demo moment:** A preference change leads to a different, justified recommendation and/or placement strategy.

## 4. Core interaction model

```text
Shopify Product Page
    ↓
Upload Room Photo + State Goal
    ↓
Extract Environment, Preferences & Constraints
    ↓
Evaluate Current Product Against Constraints
    ↓
WHY NOT THIS PRODUCT?
  • Observed evidence
  • Product facts
  • Potential conflict
  • Unknowns / confidence
    ↓
WHAT WOULD MAKE IT WORK?
  ├─ Change product (similar alternative)
  ├─ Change placement (keep original product)
  ├─ Adjust trade-off priorities
  └─ Ask for one critical missing measurement
    ↓
Compare Options → Shopify Add to Cart
```

## 5. Constraint taxonomy

| Category | Examples | Evidence source | Handling |
|---|---|---|---|
| Hard constraints | Price ceiling, product width/height, inventory | Shopify product data, user input | Validate deterministically where possible |
| Spatial constraints | Window obstruction, circulation, placement | Room image + user measurements | Treat image-only judgments as hypotheses |
| Soft preferences | Style, color, silhouette, material | User language + image context | Explain trade-offs; allow user override |

**Critical trust rule:** Never invent dimensions, clearance, product features, price, or stock. A single room photo cannot establish reliable real-world measurements without reference data. Distinguish **confirmed fact**, **visual inference**, and **unknown**. Do not claim that a product definitively fits unless necessary measurements are available and checked.

## 6. Decision explanation format

For every product or proposed placement, show:

- **Observation:** What is visibly present in the room?
- **Product fact:** Which attributes come from the Shopify catalog?
- **Potential conflict:** Which user goal or constraint might be violated?
- **Evidence status:** Confirmed / inferred / needs measurement.
- **Suggested action:** Change product, change placement, or ask one focused question.
- **Trade-off:** What is gained and what is sacrificed?

Do **not** collapse all of these into an opaque “fit score.” A budget violation, possible window obstruction, and style preference have different evidentiary status.

## 7. MVP scope (3.5 hours)

### Must-have
1. Shopify-like product detail view (real Shopify data if accessible; otherwise clearly labeled sample catalog).
2. Upload a room photo and enter a short natural-language goal.
3. Gemini multimodal analysis of the room and structured constraint extraction.
4. Evaluate the selected chair using actual catalog fields.
5. **Why Not This Product?** evidence-based explanation card.
6. Recommend **two** alternative products from the same catalog, with reasons and trade-offs.
7. A follow-up prompt that changes user priorities and triggers a revised recommendation.
8. Product detail / add-to-cart action, using real Shopify integration when available.

### Nice-to-have
- A generated visualization of two alternatives in the **same room and camera perspective**.
- A “change placement” suggestion with an image annotation.
- Side-by-side visual comparison.

### Out of scope
- Full 3D reconstruction, accurate measurement from one photo, physics simulation.
- Cross-merchant search.
- Multi-product room optimization.
- Merchant analytics dashboard.
- Claims of proven conversion lift or return reduction.

**Fallback:** If image editing is slow or inconsistent, demonstrate the reasoning loop with product photos, room annotations, and structured comparison. The core innovation is the decision agent, not image synthesis.

## 8. Suggested technical architecture

```text
Shopify Storefront / Demo Web App
  ├── Product page + ContextFit panel
  ├── Room image upload + user goals
  ├── Comparison / explanation cards
  └── Add-to-cart action
             ↓
       Backend API
  ├── Product catalog adapter (Shopify Storefront API or seeded data)
  ├── Gemini multimodal room interpretation
  ├── Constraint evaluator (deterministic rules + Gemini reasoning)
  ├── Alternative retrieval & ranking (same merchant catalog)
  └── Session state for follow-up preference updates
```

Gemini should analyze visual evidence, extract intent, articulate trade-offs, and revise recommendations. **Code should enforce numeric comparisons** when trustworthy measurements exist. Product retrieval should be restricted to the merchant's catalog, and the model should not hallucinate products.

### Example structured output (illustrative, not a required API schema)

```json
{
  "user_goal": "A reading chair that does not block the window",
  "room_observations": [
    {"claim": "Large window near proposed chair area", "status": "visual_inference"}
  ],
  "constraints": [
    {"type": "soft", "name": "preserve_window_view", "priority": "high"}
  ],
  "current_product": {
    "product_id": "shopify-product-id",
    "potential_conflicts": [
      {
        "claim": "High back may overlap the window sightline",
        "status": "unverified_spatial_inference",
        "missing_data": ["placement position", "window sill height"]
      }
    ]
  },
  "alternatives": [
    {"product_id": "another-shopify-product-id", "reason": "Lower back profile", "tradeoff": "Different silhouette"}
  ],
  "resolution_options": [
    {"type": "change_product", "description": "Compare a low-back chair"},
    {"type": "change_placement", "description": "Try the opposite wall"}
  ],
  "clarifying_question": "Where exactly would you place the chair?"
}
```

All IDs, dimensions, prices, and availability in production must be grounded in actual merchant data. Do not invent them.

## 9. UX: proposed five screens / states

1. **Product page:** Selected chair + “Find My Fit” CTA.
2. **Understand my space:** Upload photo + optional user goal; concise progress feedback.
3. **Why Not This Product?:** Current product, potential conflicts, source/evidence labels, unknowns.
4. **Resolve the conflict:** Two alternative products plus “Keep this product, change placement”; show trade-offs.
5. **Decision & checkout:** Revised recommendations after user feedback, comparison, and add to cart.

Visual direction: refined, minimal, editorial; neutral white/soft-gray base, restrained accent color, clear typography, no alarmist red warning aesthetic. Avoid heavy text walls. Prioritize one strong, understandable AI moment.

## 10. Solo-developer execution plan (3.5 hours)

**Builder:** One person, using Gemini/Cursor or similar AI coding assistance. There is **no team split and no parallel development**. Prioritize a single runnable vertical slice over multiple partially implemented features.

**Recommended build order:** Start with a local, clearly labeled sample catalog of 4–6 accent chairs (with explicit dimensions and prices). Use a Shopify-like storefront UI; connect a real Shopify catalog/cart only if access and setup are immediately available. Keep Gemini server-side behind one API route. Avoid full 3D, complicated infrastructure, merchant admin dashboards, and image generation unless the core loop is already stable.

### Timeboxes (sequential, one developer)
- **0:00–0:20 — Scaffold:** Start a simple React/Vite or Next.js app; prepare 4–6 sample chairs and one demo room image. Verify Gemini API key and a single image-analysis call.
- **0:20–1:05 — Core Gemini route:** Accept room image + selected product + user goal + catalog; return structured observations, possible conflicts, unknowns, alternatives, and suggested resolutions. Validate response against allowed product IDs.
- **1:05–1:55 — Single-page UX:** Build product detail, room upload, user goal, “Why Not This Product?” explanation, and two alternative cards. Keep the interface minimal and coherent.
- **1:55–2:35 — Interactive revision:** Add one follow-up input (“But I love the high-back design”), preserve context, and show a revised recommendation or placement strategy. This is the key demo moment.
- **2:35–3:00 — Commerce action:** Wire product links and a demo add-to-cart; use real Shopify cart integration only if already configured. Do not fake a real Shopify purchase.
- **3:00–3:30 — Reliability & demo:** Test the complete flow, add loading/error states, prepare a deterministic fallback for API failure, rehearse a 60–90 second demo. Only add visualization if time remains.

### Cut list if behind schedule
1. Cut generated room images first.
2. Cut real Shopify API integration if credentials/setup are blocking; label the seeded catalog as demo data.
3. Cut advanced placement suggestions and detailed scoring.
4. **Do not cut** the evidence-backed “Why Not?” explanation and the preference-driven second turn.

**Definition of done:** One browser page where a shopper selects a chair, uploads a room, receives a qualified conflict explanation and catalog-grounded alternative, changes a preference, sees the recommendation adapt, and can take a clearly labeled shopping action.

## 11. Demo script (approximately 60–90 seconds)

**Opening:** “Most shopping tools show you how furniture might look. ContextFit helps you understand why a product might not work—and how to make it work.”

**Action 1:** Open a high-back chair in a Shopify store and upload a small-apartment photo.

**Action 2:** Enter: “I want a reading chair, but I don't want to block my window.”

**AI moment:** The agent identifies a possible window-view conflict, separates observation from unknown measurements, and suggests a low-back alternative.

**Action 3:** Say: “But I love the high-back design.”

**AI moment 2:** The agent adapts: keep the original chair and try a new placement, or choose a slimmer high-back product.

**Close:** Compare and add the chosen product to cart. “We turn product mismatch into a better shopping decision—without losing the customer.”

## 12. Risks & validation

- **Visual hallucinations:** Gemini may infer geometry incorrectly; mark as hypotheses and ask for measurement.
- **Catalog hallucinations:** Restrict recommendations to actual product IDs and verified attributes.
- **Image generation inconsistency:** Do not rely on generated images for exact dimensions or geometry.
- **Merchant incentive:** A “why not” assistant could discourage purchases; test whether alternative discovery offsets abandonment.
- **Differentiation:** AI room visualization and recommendation are established categories. Our testable novelty is the *evidence-backed conflict diagnosis → minimum-change resolution → interactive preference revision* loop.

### MVP success criteria
- Correctly retrieve and display actual catalog candidates.
- Surface at least one defensible, clearly qualified potential conflict.
- Provide an alternative with an explicit trade-off.
- Revise recommendation after a user preference change.
- Complete an add-to-cart flow or credible Shopify demo equivalent.

### Future metrics (hypotheses)
- Conflict-to-alternative click-through rate.
- Add-to-cart rate after conflict resolution.
- Conversion of users who initially considered an unsuitable product.
- Fit-related return rate (requires longer-term merchant data).

## 13. Instructions for Gemini collaboration

Please act as a **senior AI product engineer and solo hackathon coding copilot**. Based on this handoff:

1. Critique the concept for differentiation, feasibility, and user value—be specific, not generic.
2. Propose the **smallest implementable end-to-end MVP for ONE developer in 3.5 hours**, prioritizing the agent's reasoning loop over visual polish. Explicitly identify what to cut.
3. Define the exact Gemini prompts, JSON schemas, evaluation logic, and multi-turn session state.
4. Recommend a practical Shopify integration path and a fallback if credentials or product API access are unavailable.
5. Give a minimal component architecture and a **sequential, solo-developer implementation plan** with copy-pasteable build prompts and exact file-level priorities. Do not assign tasks to multiple developers.
6. Identify any claims that cannot be reliably inferred from one image, and design safe fallbacks.
7. Propose one high-impact demo interaction that clearly distinguishes ContextFit from standard room visualizers.

**Important:** Do not broaden the MVP into a generic furniture design assistant. Preserve the merchant-embedded positioning and the **“Why Not This Product?” → “What Would Make It Work?”** decision loop.
