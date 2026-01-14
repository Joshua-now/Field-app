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

### File Storage
- **Google Cloud Storage**: Object storage for file uploads (photos, documents)
- Accessed via Replit's sidecar endpoint at `http://127.0.0.1:1106`

### Frontend Libraries
- **@tanstack/react-query**: Server state management
- **@uppy/core + @uppy/aws-s3**: File upload handling with presigned URLs
- **recharts**: Dashboard charts and analytics
- **date-fns**: Date formatting and manipulation
- **Radix UI**: Accessible UI primitives for shadcn/ui components