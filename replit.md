# FieldTech - Contractor Field Tech Management System

## Overview

FieldTech is a contractor field technician management system designed for HVAC and service contractors. It provides a **desktop web dashboard** for office/dispatch staff to manage jobs, technicians, customers, and inventory. The system enables job scheduling, technician assignment, customer management, and parts inventory control.

The application follows a full-stack TypeScript architecture with a React frontend and Express backend, using PostgreSQL for data persistence. Designed for **Railway deployment** via GitHub.

## Recent Changes (January 2026)

- Removed Stripe payment integration (payments handled externally)
- Removed GPS/location tracking features
- Removed mobile-specific pages and PWA features (desktop-only web app)
- Fixed database connection logic for Railway vs Replit environments
- Enhanced OIDC authentication to handle multiple session formats

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom theme configuration
- **Forms**: React Hook Form with Zod validation
- **Charts**: Recharts for dashboard analytics
- **Build Tool**: Vite

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript (using tsx for development)
- **API Design**: RESTful API with typed route contracts in `shared/routes.ts`
- **Authentication**: Replit Auth (OpenID Connect) with session-based auth stored in PostgreSQL
- **File Uploads**: Presigned URL flow with Google Cloud Storage via Uppy

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM
- **Schema Location**: `shared/schema.ts` defines all database tables
- **Migrations**: Drizzle Kit for schema management (`drizzle-kit push`)
- **Session Storage**: PostgreSQL-backed sessions via `connect-pg-simple`

### Database Connection Logic
The app intelligently selects the database based on environment:
- **Replit**: Uses `DATABASE_URL` (Neon-backed Replit PostgreSQL)
- **Railway**: Uses `RAILWAY_DATABASE_URL` when `RAILWAY_ENVIRONMENT` is set

### Project Structure
```
client/           # React frontend application
  src/
    components/   # UI components including shadcn/ui
    hooks/        # Custom React hooks for data fetching
    pages/        # Page components (Dashboard, Jobs, Technicians, etc.)
    lib/          # Utilities and query client setup
server/           # Express backend
  replit_integrations/  # Modular integrations (auth, chat, image, audio, storage)
  middleware/     # Express middleware (tenantContext, rateLimiter, errorHandler, security, auditLog)
  tenantStorage.ts # Tenant-scoped storage factory
shared/           # Shared types, schemas, and route definitions
  models/         # Database model definitions (including tenants)
  schema.ts       # Drizzle table definitions
  routes.ts       # API route contracts with Zod validation
```

## Multi-Tenancy Architecture

The application uses a **single-database multi-tenancy** model where each contractor company is a tenant with completely isolated data.

### Key Components

1. **Tenants Table** (`shared/models/auth.ts`): Stores company info, settings, and plan tier
2. **Tenant ID Column**: Every data table has a `tenant_id` column with indexes for performance
3. **Tenant Context Middleware** (`server/middleware/tenantContext.ts`): Extracts tenant from authenticated user's session. Handles multiple OIDC session formats (user.id, user.sub, user.claims.sub)
4. **Tenant-Scoped Storage** (`server/tenantStorage.ts`): Factory that creates storage instances auto-filtering by tenant

### Data Isolation

- All queries are automatically filtered by tenant ID via the `TenantScopedStorage` class
- Users can only access data belonging to their tenant
- New records automatically receive the user's tenant ID on creation

### Tenant API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/tenants/current` | GET | Get current user's tenant info |
| `/api/tenants` | POST | Create new company (signup) |
| `/api/tenants/current` | PATCH | Update tenant settings |

## External Dependencies

### Database
- **PostgreSQL**: Primary database accessed via `DATABASE_URL` environment variable
- **Drizzle ORM**: Type-safe database queries and schema management

### Authentication
- **Replit Auth**: OpenID Connect authentication via Replit's identity provider
- Required environment variables: `ISSUER_URL`, `REPL_ID`, `SESSION_SECRET`

### AI Integrations (Optional)
- **OpenAI API**: Used for chat, image generation, and audio features
- Required environment variables: `AI_INTEGRATIONS_OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL`

### AI Voice Calling (Bland AI) - Optional
- **Bland AI**: Automated customer calling when technician arrives and customer isn't home
- Environment variables: `BLAND_AI_API_KEY`, `SUPPORT_PHONE`
- Endpoint: `POST /api/jobs/:id/customer-not-home`

### File Storage
- **Google Cloud Storage**: Object storage for file uploads (photos, documents)
- Accessed via Replit's sidecar endpoint at `http://127.0.0.1:1106`

### Frontend Libraries
- **@tanstack/react-query**: Server state management
- **@uppy/core + @uppy/aws-s3**: File upload handling with presigned URLs
- **recharts**: Dashboard charts and analytics
- **date-fns**: Date formatting and manipulation
- **Radix UI**: Accessible UI primitives for shadcn/ui components

## Security Features

### Security Headers (Helmet)
- XSS protection, clickjacking prevention, MIME sniffing protection
- Configured in `server/middleware/security.ts`

### Rate Limiting
- Global API rate limit: 100 requests/minute per IP
- Strict limit for admin endpoints: 10 requests/minute
- Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

### Audit Logging
- All API requests logged with user, IP, method, path, and status
- Middleware: `server/middleware/auditLog.ts`

### Session Security
- httpOnly, secure, sameSite cookies
- Rolling sessions for extended activity
- PostgreSQL-backed session storage

## Guardrails & Self-Repair

### Job Status State Machine
- Valid statuses: `scheduled`, `assigned`, `en_route`, `arrived`, `in_progress`, `completed`, `cancelled`
- Transitions are validated at API level - invalid transitions return 409 Conflict
- State machine defined in `shared/jobStateMachine.ts`

### Input Sanitization
- `shared/sanitize.ts` provides sanitization utilities
- Applied to customer create/update operations
- Features: trim strings, lowercase emails, normalize phone/zip, strip script tags

### Error Handling
- Centralized error handler in `server/middleware/errorHandler.ts`
- Custom error classes: `AppError`, `ValidationError`, `NotFoundError`, `ConflictError`
- Automatic Zod validation error formatting
- Graceful handling of duplicate key and foreign key errors

### Database Resilience
- Connection pool with 20 max connections
- 30-second idle timeout, 10-second connection timeout
- Self-healing reconnection on connection failures
- Health check endpoint: `GET /api/health` (returns DB status)

### Self-Repair: Orphan Cleanup
- Endpoint: `POST /api/admin/cleanup` (strict rate limited)
- Removes orphaned photos and notes not linked to existing jobs
- Returns count of cleaned records

## Desktop Web Application

This is a **desktop-only web application** designed for office/dispatch staff:
- Sidebar navigation with Dashboard, Schedule, Jobs, Technicians, Customers, Inventory
- Full analytics dashboard with job statistics and charts
- Job creation, assignment, and status management
- Customer management with contact information
- Technician management with specialties

## Deployment

### Railway Deployment
The application is designed for Railway deployment via GitHub:
1. Push code to GitHub repository
2. Connect Railway to the GitHub repo
3. Set environment variables in Railway dashboard
4. Railway auto-detects and deploys the Node.js application

### Required Environment Variables
| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Session encryption key |
| `ISSUER_URL` | OIDC issuer URL (Replit Auth) |
| `REPL_ID` | Replit application ID |

### Optional Environment Variables
| Variable | Description |
|----------|-------------|
| `BLAND_AI_API_KEY` | API key for AI voice calling |
| `VITE_COMPANY_NAME` | Custom company name branding |
| `TIMEZONE` | Default timezone (America/New_York) |
