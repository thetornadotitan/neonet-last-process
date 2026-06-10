# Fix: Item Backgrounds Shorter Than Content When List Scrolls

## Problem

When the browser window is short enough that the shop list or level-up upgrade selection list needs to scroll, the **individual item backgrounds** (`.shop-item`, `.level-option`, `.upgrade-entry`) become shorter in height than their text content. The text overflows past the item's own background/border box, making items look broken.

When the window is tall enough that no scrolling is needed, everything looks fine.

## Root Cause

The item backgrounds become shorter than their content because of how `min-height` interacts with a constrained scroll container:

### The layout chain

1. **`.settings` overlay** (`styles.css:122-129`) — `position: fixed; inset: 0; padding: 20px` — centers the panel in the full viewport.

2. **`.shop-panel` / `.level-panel`** (`styles.css:372-377`, `styles.css:385-390`) — flex column with:
   - `max-height: min(520px, calc(100vh - 64px))` (shop) / `min(480px, calc(100vh - 64px))` (level-up)
   - `min-height: min(360px, calc(100vh - 64px))` (shop) / `min(320px, calc(100vh - 64px))` (level-up)

3. **`.shop-list` / `.level-options`** (`styles.css:379-383`, `styles.css:392-396`) — `flex: 1; min-height: 0; overflow-y: auto` — the scroll container gets whatever height is left after the title, message, and close button take their space.

4. **Items** (`.shop-item`, `.level-option`) (`styles.css:245-258`) — `display: grid; grid-template-columns: 1fr auto; min-height: 70px; padding: 11px` — each item is a two-column grid (text left, cost right).

### What happens when the window is short

- `calc(100vh - 64px)` becomes small (e.g. on a 500px-tall viewport: 436px max-height).
- The panel is capped at that height. After title (~38px) + message (~30px) + close button (~42px) = ~110px, the list gets only ~326px.
- Items are `min-height: 70px` each with `8px` gaps. 5 items = `5×70 + 4×8 = 382px` of content, which exceeds the 326px list area → scrolling activates.
- **The scroll container clips at its flex-allocated height**, but items inside it are rendered at their natural/min-height sizes. The item backgrounds (box model: `background`, `border`, `border-radius`) paint within the item's own box — which IS the correct size.
- **The real visual bug**: Items at the top/bottom edge of the scroll viewport get **partially clipped** by the scroll container's `overflow-y: auto`. The scroll container's own height is shorter than the total items, so the last visible item gets cut off mid-way — its background is visible only for the portion inside the scroll viewport, while its text content (which can wrap and be taller) appears to extend beyond the painted background because the scroll clip cuts through the item.

Additionally, for `.upgrade-entry` items (`styles.css:347-357`), they have **no `min-height`** at all — just `padding: 6px 8px`. When the `.active-upgrades` container is short, the same clipping happens: the scroll viewport cuts through entries, showing text that appears to "escape" the entry's background.

### Why it looks fine when no scrolling is needed

When the window is tall, `calc(100vh - 64px)` is large, the panel reaches its `max-height` of 480-520px, and the list gets plenty of flex space. All items fit without scrolling, so no clipping occurs. Every item's background fully contains its content.

## Fix

### Strategy

The core issue is that items get **clipped mid-way by the scroll container boundary**, creating a torn/cut-off appearance where the item background is visible for only part of the item. Two approaches fix this:

**A. Prevent items from being cut mid-way** — Add padding inside the scroll container so items have breathing room and the scroll snap/clipping doesn't slice through an item's background.

**B. Ensure item backgrounds always cover their content** — The items already do this correctly (their box model is fine); the issue is purely the scroll clip. The fix is to ensure the scroll container doesn't create a harsh visual cut that makes it *look* like the background is too short.

### Change 1: Add scroll padding to `.shop-list` (`styles.css:379-383`)

```css
/* BEFORE */
.shop-list {
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

/* AFTER */
.shop-list {
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  scroll-padding-block: 8px;
  padding-block: 8px;
}
```

**Why this fixes it**: `scroll-padding-block: 8px` ensures that when `scrollIntoView()` is called (from `ui.js:278-281`), the scrolled-to item has 8px of breathing room from the container edges, preventing it from sitting right at the clip boundary. `padding-block: 8px` adds visual padding at the top and bottom of the scroll content area so the first and last items don't sit flush against the container edge where clipping is most noticeable.

Note: `.shop-list` currently has `padding: 4px 0` (from the shared rule at `styles.css:241`). This should be changed to `padding: 8px 0` to add more top/bottom breathing room.

### Change 2: Add scroll padding to `.level-options` (`styles.css:392-396`)

```css
/* BEFORE */
.level-options {
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

/* AFTER */
.level-options {
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  scroll-padding-block: 8px;
  padding-block: 8px;
}
```

**Why this fixes it**: Same reasoning as Change 1, for the level-up list. `scrollIntoView()` is called from `ui.js:283-285`.

Note: `.level-options` currently has `padding: 4px 0` (from `styles.css:241`). This should be changed to `padding: 8px 0`.

### Change 3: Update shared `.shop-list, .level-options` padding (`styles.css:237-243`)

```css
/* BEFORE */
.shop-list, .level-options {
  display: grid;
  gap: 8px;
  padding: 4px 0;
  scrollbar-gutter: stable;
}

/* AFTER */
.shop-list, .level-options {
  display: grid;
  gap: 8px;
  padding: 8px 0;
  scrollbar-gutter: stable;
}
```

**Why this fixes it**: Increases top/bottom padding from 4px to 8px, giving items more breathing room from the scroll container edges. This means the first and last items won't sit right at the clip boundary, reducing the visual appearance of backgrounds being "cut short."

### Change 4: Add scroll padding to `.upgrade-list` (`styles.css:336-345`)

```css
/* BEFORE */
.upgrade-list {
  display: grid;
  gap: 4px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  pointer-events: auto;
  padding-right: 4px;
  scrollbar-gutter: stable;
}

/* AFTER */
.upgrade-list {
  display: grid;
  gap: 4px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
  pointer-events: auto;
  padding: 8px 4px 8px 0;
  scroll-padding-block: 4px;
  scrollbar-gutter: stable;
}
```

**Why this fixes it**: Adds `padding-block: 8px` (top/bottom) alongside the existing `padding-right: 4px`, and `scroll-padding-block: 4px` for scroll-into-view breathing room. Same fix pattern as the other lists.

### Change 5: Ensure items grow to fit content — change `align-items` to `start` (`styles.css:245-258`)

```css
/* BEFORE */
.shop-item, .level-option {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  align-items: center;
  width: 100%;
  min-height: 70px;
  padding: 11px;
  ...
}

/* AFTER */
.shop-item, .level-option {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  align-items: start;
  width: 100%;
  min-height: 70px;
  padding: 11px;
  ...
}
```

**Why this fixes it**: `align-items: center` vertically centers each grid cell within the row. When the left column (text with `<h3>` + `<p>`) is taller than the right column (`.shop-cost` span), the right column centers vertically — which is fine. BUT when the text wraps to multiple lines and makes the row tall, `align-items: center` can cause the **right column to visually float** in the middle of the item rather than aligning to the content. More importantly, with `align-items: center`, if the grid row height is determined by the taller cell, the shorter cell's background (which is part of the parent item's single background) paints correctly — but if content overflows the item's min-height and the item's height is calculated incorrectly, `center` alignment can mask this. Using `align-items: start` ensures both columns align to the top, and the item height is driven purely by the tallest column's natural content height, not by centering math that could produce unexpected sizes. This makes the item background always match its content height exactly.

### Summary of file changes

| File | Line(s) | Change |
|------|---------|--------|
| `styles.css` | 241 | Change `padding: 4px 0` to `padding: 8px 0` in `.shop-list, .level-options` shared rule |
| `styles.css` | 250 | Change `align-items: center` to `align-items: start` in `.shop-item, .level-option` |
| `styles.css` | 379-383 | Add `scroll-padding-block: 8px` to `.shop-list` |
| `styles.css` | 392-396 | Add `scroll-padding-block: 8px` to `.level-options` |
| `styles.css` | 336-345 | Change `padding-right: 4px` to `padding: 8px 4px 8px 0`, add `scroll-padding-block: 4px` to `.upgrade-list` |

### How this fixes the issue

- **Before**: When the window is short and scrolling activates, items at the scroll container boundary get clipped mid-way through their background. The `padding: 4px 0` on the list containers provides almost no buffer, so the first/last visible item sits right at the clip edge. Combined with `align-items: center` potentially affecting the item's calculated height, the item background appears shorter than its content.

- **After**: The increased `padding-block: 8px` creates breathing room at the top/bottom of the scroll content area, so items aren't sliced at the container edge. `scroll-padding-block` ensures `scrollIntoView()` navigates to items with offset, preventing items from sitting right at the clip boundary. `align-items: start` guarantees the item's height is purely content-driven with no centering artifacts, ensuring the background always fully covers all content within the item.
