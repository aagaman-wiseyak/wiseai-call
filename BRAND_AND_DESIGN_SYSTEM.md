# WISE.ai Frontend — Complete Brand Identity & Design System Specification

> **Document Version:** 2.0.0  
> **Target Audience:** Frontend Engineers, UI/UX Designers, QA Engineers, Product Managers  
> **Repository:** `wiseyak-core/wiseai-frontend`  
> **Framework Stack:** Next.js 16 (App Router, Turbopack) · React 19 · Tailwind CSS v4 · Radix UI / Shadcn UI (New York style) · TanStack Table v8 · Recharts  
> **Brand Owner:** WiseYak Inc.  
> **Official Tagline:** *"Industry leading AI solutions for your business"*

---

## 1. Executive Brand Essence & Visual Philosophy

WISE.ai is a mission-critical, enterprise-grade multimodal artificial intelligence platform engineered by WiseYak. The platform delivers localized voice AI, language models, automated telephony, and data crowdsourcing/annotation tools specifically tailored for South Asian and low-resource languages (**Nepali, Maithili, and English**).

### 1.1 Brand Attributes
* **Clinical & Enterprise Rigor:** Designed to feel like a high-precision medical and linguistic workstation. Visuals favor crisp boundaries, structured grids, and subtle neutral backgrounds over playful or whimsical gradients.
* **Light-First Operational Productivity:** The entire visual architecture is intentionally optimized for sustained daytime data entry, transcription auditing, audio review, and dashboard telemetry. Dark mode is explicitly suppressed in code (`@custom-variant dark (&:not(*));`) to ensure absolute fidelity and color consistency across all client displays.
* **Multimodal Voice-First Identity:** Audio waveforms, microphone recording states, inline audio scrubbers, and soundwave thinking indicators are first-class visual citizens throughout the application.
* **Devanagari Native Localization:** Typography, input vertical alignments, badges, and layout line-heights are built from the ground up to render native Devanagari script (नेपाली, मैथिली) alongside Latin script without clipping diacritics or irregular baseline jumps.
* **Data Density & Low Cognitive Overhead:** High-density virtualization tables, sticky action columns, and instant breadcrumb navigation allow professional annotators and administrators to process hundreds of audio-text pairs daily without fatigue.

---

## 2. Complete Color Architecture & Token Catalog

The color architecture is built using a two-tier model:
1. **OKLCH Core Primitives (`:root`):** Standard Shadcn/Radix variables defining neutral base, card, input, and popover surfaces.
2. **Tailwind v4 Inline Theme Extensions (`@theme inline`):** Curated brand hex tokens defining WISE cyan, semantic states, language flags, and chart lines.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           WISE.ai COLOR HIERARCHY                           │
├──────────────────────┬──────────────────────────────────────────────────────┤
│ Brand Primary        │ #4AADDE (WISE Cyan / Primary Action)                 │
│ Brand Navy           │ #000842CC (Midnight Showcase Canvas)                 │
│ High-Emphasis Text   │ #202224 (Primary Charcoal for Headings & Titles)    │
│ Medium-Emphasis Text │ #3C3C43 (Secondary Labels & Captions)               │
│ Low-Emphasis Text    │ #999999 (Light Slate / Subtitles & Skeletons)       │
│ Base Surface         │ #FFFFFF (Pure White Content Cards)                  │
│ Subdued Surface      │ #F1F4F9 (White2 / AI Bubbles & Table Row Hover)     │
│ Universal Border     │ #99999966 (40% Opacity Card Border)                 │
└──────────────────────┴──────────────────────────────────────────────────────┘
```

---

### 2.1 Brand & Neutral Color Tokens

| Token Name | Hex Code | OKLCH / CSS Variable | Usage Context & Component Blueprints |
| :--- | :--- | :--- | :--- |
| **WISE Cyan** | `#4AADDE` | `--color-primary` | Main brand color. Active sidebar items, primary buttons, seek scrubbers, user chat bubbles, active tab indicators, progress indicators. |
| **Translucent Cyan** | `#4AADDE33` | Raw Hex (20% Opacity) | Background fill for secondary bar chart items (`AvailableTimeSlotsChart.tsx`). |
| **Primary Alpha 10%**| `rgba(74,173,222,0.10)` | `bg-primary/10`, `border-primary/10` | Quick action card backgrounds, icon container chips, table hover highlights. |
| **Primary Alpha 15%**| `rgba(74,173,222,0.15)` | `bg-primary/15` | `variant="light"` button background. |
| **Primary Alpha 30%**| `rgba(74,173,222,0.30)` | `bg-primary/30` | Hover state for `variant="light"` button. |
| **Midnight Navy** | `#000842CC` | Raw Hex (80% Opacity) | Deep navy showcase container on the authentication page (`AuthLayout.tsx`). |
| **Heading Charcoal** | `#202224` | Raw Hex | High-emphasis dashboard card titles, milestone headlines, search bar text, service analytics headers. |
| **Secondary Charcoal**| `#3C3C43` | `--color-labels-secondary` | Secondary headings, form labels, metadata keys. |
| **Pure White** | `#FFFFFF` | `oklch(1 0 0)` / `--background` | Main page canvas, card backgrounds, modal content dialogs. |
| **Cool Off-White (White2)** | `#F1F4F9` | `--color-white2` | AI assistant message bubbles, table row hover (`group-hover:bg-white2`), drawer headers, search input container. |
| **Card Border Gray** | `#99999966` | Raw Hex (40% Opacity) | Standard 1px border around stat cards, service cards, and quick action panels. |
| **Light Slate Gray** | `#999999` / `#999`| `--color-light` / `text-light` | Subtitle descriptions, input limit counters, inactive breadcrumb text. |
| **Audio Track Gray** | `#D9D9D9` | Inline Hex | Audio player timeline background track before seek fill. |
| **Divider Gray** | `#E5E5E5` | Inline Hex | Sidebar footer and section divider border. |
| **Toggle Hover Gray** | `#E2E8F0` | Inline Hex | Hover background on `PageToggler.tsx` inactive items. |

---

### 2.2 Semantic Status & State Colors

| Status / Meaning | Hex Code | Token | Applied Components & Visual Manifest |
| :--- | :--- | :--- | :--- |
| **Success / Approved** | `#34C759` | `--color-success` | Positive metric trends (`+X% than average`), success toast notifications, `variant="success"` buttons. |
| **Accepted Annotations** | `#00B69B` | Text / Icon Hex | Accepted annotation counters, verified badge chips, accepted dataset statistics. |
| **Warning / Golden** | `#FEC53D` | `--color-golden` | Pending annotation counters, milestone trophy glyphs, reviewer badges. |
| **Attention / Config Alert** | `#F59E0B` / `#EAB308` | Tailwind Yellow/Amber | Service readiness "Configuration Required" warning badges and flashing card borders. |
| **Destructive / Error** | `#FF383C` | `--color-accent-red`, `--color-danger` | Reject buttons, delete modals, audio playback errors, negative metric trends (`-X% than average`). |
| **Live Recording Timer** | `#FF3B3B` | Inline Hex | Active recording elapsed time text in `AudioRecorder.tsx`. |
| **Review / Violet Blue** | `#8280FF` | `--color-vblue` | Total reviewed annotation counters, review stage badges. |
| **Accent Orange** | `#FF8D28` | `--color-accent-orange` | Warning callout boxes, attention pill indicators. |

---

### 2.3 Milestone Progress Gradients & Legend Dots (`ReviewerMileStoneCard.tsx`)

| Metric / Stage | Color / Gradient Code | Visual Role |
| :--- | :--- | :--- |
| **Accepted Milestone Fill** | `linear-gradient(143.13deg, #FFBF1A 5.36%, #FF4080 94.64%)` | Vibrant Gold-to-Pink gradient on reviewer milestone progress bars. |
| **Accepted Indicator Dot** | `#FF4080` | Legend circle for accepted review volume. |
| **Picked Milestone Fill** | `linear-gradient(143.13deg, #FFF7ED 1.36%, #FED7AA 94.64%)` | Warm Cream-to-Amber gradient on reviewer milestone progress bars. |
| **Picked Indicator Dot** | `#FED7AA` | Legend circle for picked review volume. |
| **Baseline Indicator Dot** | `#D1D5DB` | Legend circle for total annotated baseline. |

---

### 2.4 Language Representation Palette (`MyLanguageChart.tsx`)

Used consistently across all charts to represent the primary language tracks:

| Language Track | Name | Color Code | Representation |
| :--- | :--- | :--- | :--- |
| **English** | Royal Blue | `#4379EE` | English speech corpus, annotation throughput, translation target. |
| **Nepali** | Emerald Green | `#10B981` | Nepali speech corpus, annotation throughput, translation target. |
| **Maithili** | Coral Red | `#EF4444` | Maithili speech corpus, annotation throughput, translation target. |

---

### 2.5 Time Availability & Scheduling Palette (`AvailableTimeSlotsChart.tsx`)

| Time Slot Status | Hex Code | Visual Style |
| :--- | :--- | :--- |
| **Available Slots** | `#16A34A` | Forest Green bar fill |
| **Busy / Booked Slots** | `#F59E0B` | Amber Orange bar fill |
| **Past Slots** | `#94A3B8` | Muted Slate Gray bar fill |
| **Active / Current Slot** | `#4AADDE` / `#4AADDE33` | WISE Cyan solid and 20% alpha fill |

---

### 2.6 Telephony (WISE Call) Outcome Palette

Defined across `src/constants/call-constant.ts` and `src/lib/status-resolver.ts`:

| Call Outcome Status | Background | Text Color | Border Color | Meaning |
| :--- | :--- | :--- | :--- | :--- |
| **Completed / In Call** | `bg-green-100` | `text-green-700` | `border-green-500` | Call connected, finished successfully. |
| **In Progress / Queued** | `bg-yellow-100` / `bg-sky-50` | `text-yellow-700` / `text-sky-600` | `border-yellow-500` | Line ringing or waiting in outbound dialer queue. |
| **Hungup** | `bg-blue-100` | `text-blue-700` | `border-blue-500` | User or agent disconnected normally. |
| **Idle / Pending** | `bg-gray-100` | `text-gray-700` | `border-gray-500` | Campaign queued, waiting for channel allocation. |
| **Failed / Busy / Unanswered** | `bg-red-100` | `text-red-700` | `border-red-700` | Network failure, line busy, or unreached contact. |

---

### 2.7 Conversational Voice Agent State Palette (`VoiceToggle.tsx`)

The circular voice agent interaction button shifts between 5 distinct visual states:

```
[ IDLE ] ──────> [ CONNECTING ] ──────> [ ACTIVE: LISTENING ] ──────> [ ACTIVE: SPEAKING ]
#4AADDE           #F59E0B                #10B981                       #A855F7
(WISE Cyan)       (Amber Spinner)        (Emerald Pulsing Ring)        (Purple Soundwave)
                                                       │
                                                       ▼
                                                 [ ERROR STATE ]
                                                 #EF4444 (Red Danger)
```

* **Idle:** `bg-primary` (`#4AADDE`), `hover:bg-primary/80`.
* **Connecting / Token Request:** `bg-amber-400` with spinning loader.
* **Active (Listening):** `bg-emerald-500` with subtle pulsing aura; hover becomes `hover:bg-red-600` (click to hang up).
* **Active (Speaking Back):** `bg-purple-400` with soundwave animation; hover becomes `hover:bg-red-600`.
* **Error:** `bg-red-500` with warning indicator.

---

### 2.8 Code & JSON Editor Syntax Theme (`JsonEditor.tsx`)

Custom CodeMirror syntax highlighting tokens:
* **Object Keys / Property Names:** `#E06C75` (Soft Coral Red)
* **String Literals:** `#4EC9B0` (Mint Teal)
* **Numeric Values:** `#D19A66` (Warm Ochre / Orange Tan)
* **Boolean Literals:** `#E5C07B` (Soft Gold / Amber)
* **Null Literals:** `#888888` (Mid Gray)

---

### 2.9 Dynamic Avatar Color Algorithm (`AppAvatar.tsx`)

For users without an avatar image, deterministic colors are computed from their full name using an HSL hash algorithm:

```typescript
function stringToHsl(str: string, saturation = 60, lightness = 55) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}
```

**Properties:**
* Fixed saturation at `60%` and lightness at `55%` guarantees legible white text (`text-white`) with AA contrast.
* Names always resolve to the exact same color across all sessions, tables, and audit logs.

---

## 3. Typography System & Font Mechanics

### 3.1 Primary Font Family
* **Family:** **Nunito Sans** (`next/font/google`)
* **Variable:** `--font-nunito-sans`
* **Declaration:**
  ```css
  * {
    font-family: var(--font-nunito-sans), sans-serif, system-ui, -apple-system;
  }
  ```
* **Characteristics:** Soft, rounded geometric grotesque. Friendly, approachable, highly legible at small sizes (`10px`–`14px`), and maintains neutral vertical baselines when intermixed with Devanagari script.

### 3.2 Companion & Localization Fonts
* **Noto Sans Devanagari:** Active fallback for Devanagari script rendering (नेपाली, मैथिली). Ensures conjunct consonants, matras, and vowel signs render without clipping.
* **Poppins / Inter:** Available in `src/app/font.ts` for specialized typographic extensions.

### 3.3 Type Hierarchy & Typography Scale

| Level / Role | Tailwind Class | Computed Size | Weight | Line Height | Application |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Hero Metric** | `text-4xl` | 36px (2.25rem) | 700 (Bold) | `1` (None) | Dashboard stat card hero numbers |
| **Card Metric** | `text-3xl` | 30px (1.875rem) | 700 (Bold) | `1.1` (Tight) | Gauge card numbers, login page title |
| **Page Title (H1)** | `text-2xl` | 24px (1.5rem) | 700 (Bold) | `1.25` (Tight) | `AppTitleSection`, page headers |
| **Section Title (H2)** | `text-xl` | 20px (1.25rem) | 700 (Bold) | `1.35` (Snug) | Inner card titles, modal dialog headers |
| **Subsection (H3)** | `text-lg` | 18px (1.125rem) | 600 (Semibold) | `1.4` (Normal) | Table titles, panel titles |
| **Group Header (H4)** | `text-base` | 16px (1.0rem) | 600 (Semibold) | `1.5` (Normal) | Drawer headers, filter section titles |
| **Chat Message Text** | `text-[15px]` | 15px (0.9375rem) | 400 (Regular) | `1.625` (Relaxed)| `MessageBubble` conversation text |
| **Standard Body Text** | `text-sm` | 14px (0.875rem) | 500 (Medium) | `1.5` (Normal) | Data tables, form inputs, buttons, sidebar items |
| **Secondary Caption** | `text-xs` | 12px (0.75rem) | 500 (Medium) | `1.4` (Normal) | Descriptions, timestamps, badges, table footers |
| **Sidebar Group Label**| `text-xs uppercase` | 12px (0.75rem) | 600 (Semibold) | `1` (None) | Uppercase category divider (`tracking-wider`) |
| **Breadcrumb Link** | `text-[10px]` – `text-xs`| 10px–12px | 500 (Medium) | `1` (None) | Uppercase navigation breadcrumbs |

---

## 4. Geometry, Radii, Shadows & Elevation

### 4.1 Border Radius Scale

Tailwind v4 theme inline radius tokens configured from base `--radius: 0.625rem` (10px):

```
Base Radius: 0.625rem (10px)
├── --radius-sm:  calc(var(--radius) - 4px)  -> 6px   (Action buttons, tags, section cards)
├── --radius-md:  calc(var(--radius) - 2px)  -> 8px   (Inputs, selects, textareas, cards)
├── --radius-lg:  var(--radius)              -> 10px  (Standard cards, dialog modals)
├── --radius-xl:  calc(var(--radius) + 4px)  -> 14px  (Chat bubbles, login container)
├── --radius-2xl: calc(var(--radius) + 8px)  -> 18px  (Icon container chips, stat card badges)
├── --radius-3xl: calc(var(--radius) + 12px) -> 22px  (Outer wrapper cards)
├── --radius-4xl: calc(var(--radius) + 16px) -> 26px  (Large feature cards)
└── rounded-full: 9999px                              -> Status badges, avatars, audio player knobs
```

### 4.2 Elevation & Shadow Philosophy
WISE.ai intentionally avoids heavy floating drop shadows. Elevation is defined primarily through **1px border delimitation**:
* **Standard Cards:** `border border-[#99999966] bg-white` (shadow is either none or `shadow-xs`).
* **Hovering Cards:** `hover:border-primary hover:bg-primary/10 transition-all` or `hover:scale-102`.
* **Dropdown Menus & Popovers:** `shadow-lg border rounded-lg bg-popover`.
* **Modal Dialogs:** `shadow-lg border rounded-2xl p-6 bg-white`.

### 4.3 Layout Grid & Sizing Architecture
* **Sidebar Width (Desktop Expanded):** `18rem` (288px).
* **Sidebar Width (Desktop Collapsed):** `5rem` (80px).
* **Sidebar Width (Mobile Drawer):** `18rem` (288px via Sheet component).
* **Header Height:** `4rem` (64px / `h-16`) on desktop; shrinks to `3rem` (48px / `h-12`) when sidebar collapses to icons.
* **Workspace Content Padding:** `p-4` with minimum height `min-h-[calc(100dvh-4rem)]`.

---

## 5. Iconography System & Media Assets

### 5.1 Dual-Engine Icon Strategy
The codebase uses a strict dual-library iconography system:

#### Engine 1: Lucide React (`lucide-react`)
Used for all standard UI controls, navigation, and functional actions:
* **Navigation & Carets:** `ChevronRight`, `ChevronDown`, `ChevronLeft`, `ArrowLeft`, `ArrowDown`, `Ellipsis`.
* **Actions:** `Eye` (View), `Edit2` (Edit), `Trash2` (Delete), `PlusIcon` / `CirclePlus` (Create), `RotateCcw` (Restart), `Download`.
* **Media & Audio:** `Play`, `Pause`, `Mic`, `Volume1`, `Volume2`, `FileAudio`, `Loader2`.
* **Forms & Security:** `Lock`, `Mail`, `Phone`, `ShieldUser`, `Check`, `X`.

#### Engine 2: Iconify (`@iconify/react` via `MyIcon.tsx`)
Used for rich, multi-colored domain glyphs, international flags, and complex vector sets:
* **Country Flags:** `twemoji:flag-united-kingdom`, `twemoji:flag-nepal`.
* **Workplace Badges:** `material-symbols:trophy` (milestone reward), `flowbite:annotation-solid` (STT annotation), `fluent:text-change-accept-24-filled` (review accepted).
* **File Types:** Integrated VSCode official icon set mapped by file extension:
  * PDF: `material-icon-theme:pdf`
  * Word: `vscode-icons:file-type-word`
  * Excel / CSV: `vscode-icons:file-type-excel` / `excel2`
  * Audio: `vscode-icons:file-type-audio`
  * Images: `vscode-icons:file-type-image`
  * Video: `vscode-icons:file-type-video`
  * JSON / Code: `vscode-icons:file-type-json` / `typescript-official`

### 5.2 Official Media Assets (`/public`)
* **`wiseai.webp` / `wiseai.png`:** Full horizontal logo with wordmark. Displayed in expanded sidebar header (`h-8.5`) and auth header.
* **`wiseailogo.webp` / `wiseailogo.png`:** Square icon-only emblem. Displayed in collapsed sidebar header, AI assistant message avatar, and browser favicon.
* **`PageStack.svg`:** Multi-layered isometric vector graphic rendered on the midnight navy showcase container on the login screen.

---

## 6. Core Component Blueprints & Patterns

### 6.1 Button Hierarchy (`Button.tsx` & `ui/button.tsx`)

Buttons support 9 variants and 6 sizing tiers with unified loading spinners:

```typescript
// Button Variants Specification:
- default:           "text-white bg-primary hover:bg-primary/90"
- light:             "text-primary bg-primary/15 hover:bg-primary/30"
- success:           "text-white bg-success hover:bg-success/90"
- destructive:       "bg-accent-red text-white hover:bg-accent-red/90"
- destructive-light: "text-accent-red bg-accent-red/10 hover:bg-accent-red/30"
- outline-primary:   "border-primary border text-primary bg-white hover:bg-primary/10"
- outline:           "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground"
- secondary:         "bg-secondary text-secondary-foreground hover:bg-secondary/80"
- ghost:             "hover:bg-accent hover:text-accent-foreground"
- link:              "text-primary underline-offset-4 hover:underline"
```

* **Border Radius:** Default buttons use `rounded-sm` (6px); pill buttons use `rounded-full`.
* **Integrated Spinner:** When `isLoading={true}`, buttons automatically swap or prefix an animated SVG spinner and disable click events.

---

### 6.2 Status Badge System (`StatusBadge.tsx`)

Status badges convey workflow progress across annotators, reviewers, and call outcomes:

```typescript
// Status Badge Variants:
- success:  Filled: "bg-success text-white"      | Outlined: "border-success text-success bg-success/10"
- warning:  Filled: "bg-yellow-400 text-white"   | Outlined: "border-yellow-400 text-yellow-700 bg-yellow-100"
- error:    Filled: "bg-accent-red text-white"   | Outlined: "border-accent-red text-accent-red bg-accent-red/10"
- info:     Filled: "bg-primary text-white"      | Outlined: "border-primary text-primary bg-primary/10"
- neutral:  Filled: "bg-primary text-white"      | Outlined: "border-border text-muted-foreground bg-muted"
```

* **Shape:** Always `rounded-full px-3 py-1 text-xs font-medium flex items-center gap-2`.
* **Pulse Dot:** Optional `hasDot={true}` renders an inline 6px circle (`Dot.tsx`) inheriting `bg-current`.

---

### 6.3 Audio Scrubber & Player (`AudioPlayer.tsx`)

The standard audio player embedded into data tables, review cards, and recordings:
* **Play Button:** Circular `size-8 rounded-full border bg-primary text-white flex items-center justify-center`.
* **Seek Track:** Height `h-1 rounded bg-[#D9D9D9] overflow-hidden` with progress fill `bg-primary transition-[width] duration-100 ease-linear`.
* **Timer:** Micro typography `text-xs text-muted-foreground` displaying `mm:ss / mm:ss` with `--:--` fallback.
* **On-Demand Player (`OnDemandAudioPlayer.tsx`):** Defers fetching presigned S3/storage audio URLs until the user clicks the play icon to preserve bandwidth.

---

### 6.4 Chat & Conversational Message Bubbles (`MessageBubble.tsx`)

Asymmetrical speech bubbles tailored for human vs. AI dialogue:

```
USER MESSAGE BUBBLE (Right-Aligned)
┌──────────────────────────────────────────────────────────────────┐
│ Can you transcribe the first 30 seconds of this audio file?      │
└──────────────────────────────────────────────────────────────────┘
• Background: bg-primary (#4AADDE)
• Text: text-white
• Shape: rounded-xl with rounded-tr-none (Square top-right corner)

AI ASSISTANT BUBBLE (Left-Aligned)
┌──┐ ┌─────────────────────────────────────────────────────────────┐
│🤖│ │ Here is the verified transcription in Nepali:               │
└──┘ │ "नमस्कार, मलाई Wise AI को बारेमा जानकारी चाहियो।"           │
     └─────────────────────────────────────────────────────────────┘
• Avatar: size-10 rounded-full with /wiseailogo.webp
• Background: bg-white2 (#F1F4F9) border
• Text: text-foreground
• Shape: rounded-xl with rounded-tl-none (Square top-left corner)
```

* **Thinking Wave Indicator (`ThinkingIndicator.tsx`):** Three staggered bouncing dots (`size-1.5 rounded-full bg-gray-400 animate-thinking-wave`) with 150ms animation delays.

---

### 6.5 Enterprise Data Tables (`AppTable.tsx`)

* **Virtualization & Model:** TanStack React Table v8.
* **Header Style:** Sticky header with `text-foreground font-medium text-sm border-b`.
* **Row Hover:** `group-hover:bg-white2 ease-in-out` gives instant visual feedback without visual clutter.
* **Sticky Columns:** Left or right pinned action columns (`relative md:sticky left-0 / right-0 z-10 bg-white`).
* **Empty State:** Centered container with `Inbox` icon (`text-muted-foreground/40`) and clear action instructions.
* **Error State:** Centered red warning pod (`size-16 rounded-full bg-destructive/10`) with `AlertOctagon` icon.

---

### 6.6 Drag-and-Drop File Upload (`UploadSection.tsx`)

* **Drop Zone:** `border-2 border-dashed rounded-lg px-6 py-24 text-center`.
* **Active Drag State:** Border shifts to `border-primary` with `bg-primary/5` wash.
* **Icon Pod:** Circular `size-20 rounded-full bg-muted grid place-items-center` featuring `UploadCloud` in `text-primary`.
* **File Cards (`FileItem.tsx`):** Displays file extension icon from `FILE_TYPE_MAP`, formatted file size (KB/MB), and delete action.

---

## 7. Motion, Transitions & Micro-Animations

Animations are purposeful and designed for responsiveness:
1. **`animate-thinking-wave`:**
   ```css
   @keyframes thinking-wave {
     0%, 60%, 100% { transform: translateY(0); }
     30% { transform: translateY(-4px); }
   }
   ```
2. **`animate-indeterminate`:** Smooth 1.5s linear slide used in `IndeterminateBarLoader.tsx` for indeterminate background processing.
3. **`animate-accordion-down` / `animate-accordion-up`:** 0.2s ease-out Radix collapsible transitions.
4. **Action Card Scaling:** Actionable service warning cards feature `hover:scale-102` transition.

---

## 8. Screen Breakpoints & Responsive Behaviors

Tailwind CSS v4 standard screen thresholds:
* **Mobile (`< 640px`):** Top navigation collapses breadcrumbs to ellipsis menu. Sidebar converts into a touch slide-over Sheet drawer. Full logo swaps to compact emblem.
* **Tablet (`640px – 1024px`):** Breadcrumbs show first and last segments with middle collapsed. Tables enable horizontal scrolling.
* **Desktop (`≥ 1024px`):** Full expanded sidebar (`18rem`), full breadcrumb paths, sticky table columns, and multi-column grid layouts (1 to 4 columns for stat cards).

---

## 9. Engineering Checklist for New Features

When developing new pages or components for WISE.ai:
1. **Typography:** Never specify ad-hoc font families; all text inherits `Nunito Sans` from root.
2. **Colors:** Use `--color-primary` (`#4AADDE`) for all brand elements. Never use generic Tailwind blue (`bg-blue-500`) for primary actions.
3. **Card Borders:** Apply `border border-[#99999966]` to all standalone dashboard cards.
4. **Surfaces:** Use `#F1F4F9` (`bg-white2`) for secondary contrast areas (hover states, AI responses, drawer headers).
5. **Headings:** Use `#202224` for prominent section headers and metric titles.
6. **Icons:** Use `lucide-react` for operational actions and `MyIcon` (`@iconify/react`) for flags, trophies, and file formats.
7. **Bilingual Awareness:** Ensure containers accommodate longer Nepali/Maithili translations and Devanagari vertical line heights without vertical overflow.
