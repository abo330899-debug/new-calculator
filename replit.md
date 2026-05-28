# Overview

This project is an **Iraqi Customs Duty Difference Calculator** (حاسبة فرق الرسم الكمركي), a full-stack web application designed to calculate customs duties and fees at Iraqi checkpoints. Its primary purpose is to allow users to search a comprehensive product database using HS codes or descriptions, view product valuation data, and accurately calculate duty differences. The application features an Arabic RTL interface with a default dark mode, catering specifically to the Iraqi customs environment. The product database contains 12,601 products with 1,915 unique HS codes (seeded from ALL_PRODUCTS_WITH_DECISION_CLEAN.json). The AI manifest extraction uses the `gpt-5.1` model via Replit AI Integrations with `max_completion_tokens` parameter.

# User Preferences

Preferred communication style: Simple, everyday language (Arabic).

# System Architecture

## Frontend
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter
- **State Management/Data Fetching**: TanStack React Query v5
- **UI Components**: shadcn/ui (new-york style) built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS variables for theming, dark mode enabled by default with a premium dark theme featuring golden/amber accent colors, glass-morphism cards, gradient backgrounds, and backdrop blur effects. A light mode with a warm cream/amber palette is also available via a theme toggle.
- **Build Tool**: Vite
- **Language/Direction**: Arabic (RTL)
- **Pages**:
    - Dashboard home page (`/`)
    - Login/Register page (`/login`)
    - Product search page (`/search`)
    - Customs duty calculator (`/calculator`)
    - About page (`/about`)
    - Manifest upload page (`/manifest`) with AI-powered image extraction
    - Customs Tariff data table page (`/tariff`) with advanced server-side sorting, column filtering, HS code search, description search, and pagination
- **UI/UX Decisions**:
    - Consistent premium dark theme with golden/amber accents (hsl 38).
    - Glass-morphism cards, gradient backgrounds, and backdrop blur effects.
    - Redesigned login, home, and about pages with enhanced visual elements (e.g., glowing cards, hero banners, animated nav cards, refined tables).
    - Sidebar and header feature gold gradient branding and backdrop blur.
    - Custom utility classes for consistent styling: `glass-card`, `gradient-gold`, `gradient-dark`, `glow-gold`, `text-gradient-gold`.
    - Refined scrollbar styling and improved border/card contrast in dark mode.
    - Theme toggle with localStorage persistence and dynamic `meta theme-color` updates.

## Backend
- **Framework**: Express 5 (TypeScript, ESM)
- **Runtime**: Node.js
- **Authentication**: session-based using `express-session` with `connect-pg-simple` and `bcryptjs` for password hashing.
- **API Pattern**: RESTful API under `/api/` prefix.
- **Key Features**:
    - Product search by HS code or description.
    - Calculation of customs duties, including additional taxes (sales tax, municipal tax).
    - AI-powered manifest image extraction (using OpenAI GPT-4o Vision) to extract HS codes, descriptions, quantities, values, and other metadata from customs documents.
    - Auto-classification of goods into Iraqi tariff categories.
    - Comprehensive duty calculation logic incorporating Iraqi Customs Tariff Law No. 22/2010 and Council of Ministers duty reduction tables.
    - CIF valuation rule implementation (min/max checks).
    - Simplified duty calculation formula based on weight, value, and duty rate.
- **Request Validation**: Zod schemas.

## Database
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM with `drizzle-zod`.
- **Schema**: Includes tables for `users`, `checkpoints`, `checkpoint_fees`, and an expanded `products` table.
    - `products` table contains HS code, CST code, description, unit, weight, unit_price, min/avg/max values, `duty_rate`, `is_protected`, `protection_level` (low/medium/high/none), `protection_percentage`, `decision_action` (استيراد/استيراد بحذر/لا تستورد), `decision_risk` (منخفض/متوسط/عالي), and `decision_reason`.
- **Seeding**: Populated with 12,601 products from `products_with_decision.json` (all USD, with protection + decision data). Duty rates are looked up from `tariff_law22_2010.json`. Checkpoint data also re-seeds on startup.

# External Dependencies

## NPM Packages
- **drizzle-orm**, **drizzle-kit**: Database ORM and migration.
- **express** v5: HTTP server framework.
- **express-session**, **connect-pg-simple**: Session management.
- **bcryptjs**: Password hashing.
- **zod**: Runtime validation.
- **@tanstack/react-query** v5: Client-side data fetching.
- **wouter**: Client-side routing.
- **shadcn/ui**: UI components.
- **lucide-react**: Icons.
- **multer**: For handling `multipart/form-data`.
- **openai**: For AI-powered manifest image extraction.

## Reference Data
- `attached_assets/products_with_decision.json`: **Authoritative product reference** — 12,601 products with protection + decision data. This is the single source of truth for product data.
- `attached_assets/tariff_law22_2010.json`: Iraqi Customs Tariff Law duty rates for HS code lookups.
- Seed process (`server/seed.ts`) loads exclusively from the reference products file.