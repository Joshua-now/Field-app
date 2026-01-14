# FieldTech - Contractor Field Tech Management System

## Overview

FieldTech is a contractor field technician management system designed for HVAC and service contractors. It provides a desktop web dashboard for office/dispatch staff to manage jobs, technicians, customers, and inventory. The system enables job scheduling, technician tracking, customer management, and parts inventory control.

The application follows a full-stack TypeScript architecture with a React frontend and Express backend, using PostgreSQL for data persistence.

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

### Key Design Patterns
- **Shared Types**: The `shared/` directory contains schema definitions and route contracts used by both frontend and backend
- **API Contract**: Routes are defined with Zod schemas for input validation and response typing in `shared/routes.ts`
- **Storage Layer**: `server/storage.ts` provides a database abstraction layer implementing the `IStorage` interface
- **Replit Integrations**: Modular integration system in `server/replit_integrations/` for auth, chat, image generation, audio, and object storage

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
shared/           # Shared types, schemas, and route definitions
  models/         # Database model definitions
  schema.ts       # Drizzle table definitions
  routes.ts       # API route contracts with Zod validation
```

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

### Payments
- **Stripe**: Payment processing for job invoices
- Integration via Replit's Stripe connector with automatic webhook management
- Uses Stripe Invoices for job billing (not product catalog to avoid catalog pollution)
- Key files: `server/stripeClient.ts`, `server/stripeService.ts`, `server/webhookHandlers.ts`
- Invoice endpoints: `POST /api/jobs/:id/invoice`, `POST /api/jobs/:id/payment-link`

### File Storage
- **Google Cloud Storage**: Object storage for file uploads (photos, documents)
- Accessed via Replit's sidecar endpoint at `http://127.0.0.1:1106`

### Frontend Libraries
- **@tanstack/react-query**: Server state management
- **@uppy/core + @uppy/aws-s3**: File upload handling with presigned URLs
- **recharts**: Dashboard charts and analytics
- **date-fns**: Date formatting and manipulation
- **Radix UI**: Accessible UI primitives for shadcn/ui components

## Guardrails & Self-Repair

### Job Status State Machine
- Valid statuses: `scheduled`, `assigned`, `en_route`, `arrived`, `in_progress`, `completed`, `cancelled`
- Transitions are validated at API level - invalid transitions return 409 Conflict
- State machine defined in `shared/jobStateMachine.ts`

### Input Sanitization
- `shared/sanitize.ts` provides sanitization utilities
- Applied to customer create/update operations
- Features: trim strings, lowercase emails, normalize phone/zip, strip script tags

### Rate Limiting
- Global API rate limit: 100 requests/minute per IP
- Strict limit for admin endpoints: 10 requests/minute
- Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- Middleware: `server/middleware/rateLimiter.ts`

### Error Handling
- Centralized error handler in `server/middleware/errorHandler.ts`
- Custom error classes: `AppError`, `ValidationError`, `NotFoundError`, `ConflictError`
- Automatic Zod validation error formatting
- Graceful handling of duplicate key and foreign key errors

### Database Resilience
- Connection pool with 20 max connections
- 30-second idle timeout, 10-second connection timeout
- Pool error and connect event logging
- Health check endpoint: `GET /api/health` (returns DB status)

### Self-Repair: Orphan Cleanup
- Endpoint: `POST /api/admin/cleanup` (strict rate limited)
- Removes orphaned photos and notes not linked to existing jobs
- Returns count of cleaned records

## Progressive Web App (PWA)

The application is configured as a PWA for mobile installation:
- **Manifest**: `client/public/manifest.json` defines app name, icons, and shortcuts
- **Service Worker**: `client/public/sw.js` provides offline caching and mutation queuing
- **Install**: Users can add to home screen on iOS/Android for app-like experience
- **Offline Support**: 
  - Cached API responses available when offline
  - JSON mutations (status updates, notes) queued in IndexedDB for sync when online
  - Photo uploads require connectivity (users are notified)
  - Automatic sync when connection restored
- **Offline Indicator**: `OfflineIndicator.tsx` shows connection status and pending updates

## Route Optimization

- **Endpoint**: `POST /api/optimize-route` - Optimizes job order using nearest-neighbor algorithm
- **Input**: Array of job IDs and optional start coordinates
- **Output**: Optimized job order with total distance and Google Maps link
- **Component**: `RouteOptimizer.tsx` provides UI for selecting and optimizing routes
- **Features**: Reports jobs missing coordinates, handles edge cases gracefully

## AI Voice Calling (Bland AI)

When a technician arrives and the customer isn't home, they can tap "Customer Not Home - AI Call" to trigger an automated AI phone call to the customer.

### Environment Variables
| Variable | Required | Description |
|----------|----------|-------------|
| `BLAND_AI_API_KEY` | Yes | API key from [Bland AI](https://app.bland.ai) |
| `N8N_WEBHOOK_URL` | No | Optional n8n webhook URL for GHL sync |
| `BLAND_WEBHOOK_URL` | No | Optional webhook for call completion events |
| `SUPPORT_PHONE` | No | Callback number provided to customers |

### Endpoints
- `POST /api/jobs/:id/customer-not-home` - Triggers AI call to customer
- `GET /api/calls/:callId` - Get call details from Bland AI

### Integration Flow
1. Technician marks "arrived" status
2. Customer not answering door → tap "Customer Not Home - AI Call"
3. Bland AI calls customer with personalized message
4. If `N8N_WEBHOOK_URL` configured, event sent to n8n for GHL sync
5. Call details logged for follow-up

## Mobile vs Desktop Experience

### Mobile (Field Technicians)
- Routes under `/tech/*` with bottom navigation
- Optimized for touch: large buttons, simple workflows
- Key features: Job list, status updates, photo capture, navigation/call customer
- Auto-redirect: Mobile devices accessing `/` go to `/tech`
- Components: `MobileLayout.tsx`, `TechJobs.tsx`, `TechJobDetail.tsx`

### Desktop (Office/Dispatch Staff)
- Routes at root level with sidebar navigation
- Full dashboard with analytics, schedule board, customer management
- Key features: Job creation, technician assignment, inventory, reporting
- Components: `Layout.tsx`, `Dashboard.tsx`, `Schedule.tsx`, `Jobs.tsx`

## Multi-Client Deployment

The application supports easy deployment to multiple clients (HVAC companies) via environment variables:

### Client Configuration Variables
| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_COMPANY_NAME` | Company name shown in header | FieldTech |
| `VITE_COMPANY_TAGLINE` | Tagline/subtitle | Field Service Management |
| `VITE_SUPPORT_EMAIL` | Support contact email | support@example.com |
| `VITE_SUPPORT_PHONE` | Support phone number | (empty) |
| `COMPANY_NAME` | Backend company name | FieldTech |
| `TIMEZONE` | Default timezone | America/New_York |
| `SERVICE_TYPES` | Comma-separated service types | hvac_repair,plumbing_repair,... |

### Deployment Steps for New Client
1. Fork or clone the Replit project
2. Set environment variables for client branding
3. Create a new PostgreSQL database (automatic on Replit)
4. Run database migrations: `npm run db:push`
5. Publish via Replit's autoscale deployment
6. Each client gets their own isolated instance with separate data