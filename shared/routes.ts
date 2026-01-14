import { z } from 'zod';
import { 
  insertTechnicianSchema, 
  insertCustomerSchema, 
  insertJobSchema, 
  insertJobPhotoSchema, 
  insertJobNoteSchema, 
  insertScheduleSchema,
  insertPartSchema,
  technicians,
  customers,
  jobs,
  jobPhotos,
  jobNotes,
  technicianSchedule,
  partsInventory
} from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  technicians: {
    list: {
      method: 'GET' as const,
      path: '/api/technicians',
      responses: {
        200: z.array(z.custom<typeof technicians.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/technicians/:id',
      responses: {
        200: z.custom<typeof technicians.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/technicians',
      input: insertTechnicianSchema,
      responses: {
        201: z.custom<typeof technicians.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/technicians/:id',
      input: insertTechnicianSchema.partial(),
      responses: {
        200: z.custom<typeof technicians.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
  },
  customers: {
    list: {
      method: 'GET' as const,
      path: '/api/customers',
      input: z.object({
        search: z.string().optional(),
      }).optional(),
      responses: {
        200: z.array(z.custom<typeof customers.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/customers/:id',
      responses: {
        200: z.custom<typeof customers.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/customers',
      input: insertCustomerSchema,
      responses: {
        201: z.custom<typeof customers.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/customers/:id',
      input: insertCustomerSchema.partial(),
      responses: {
        200: z.custom<typeof customers.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
  },
  jobs: {
    list: {
      method: 'GET' as const,
      path: '/api/jobs',
      input: z.object({
        date: z.string().optional(),
        technicianId: z.coerce.number().optional(),
        status: z.string().optional(),
        customerId: z.coerce.number().optional(),
      }).optional(),
      responses: {
        200: z.array(z.custom<typeof jobs.$inferSelect & { customer: typeof customers.$inferSelect, technician: typeof technicians.$inferSelect | null }>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/jobs/:id',
      responses: {
        200: z.custom<typeof jobs.$inferSelect & { customer: typeof customers.$inferSelect, technician: typeof technicians.$inferSelect | null }>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/jobs',
      input: insertJobSchema,
      responses: {
        201: z.custom<typeof jobs.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/jobs/:id',
      input: insertJobSchema.partial(),
      responses: {
        200: z.custom<typeof jobs.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    status: {
      method: 'POST' as const,
      path: '/api/jobs/:id/status',
      input: z.object({
        status: z.string(),
        location: z.object({
          latitude: z.number().optional(),
          longitude: z.number().optional(),
        }).optional(),
      }),
      responses: {
        200: z.custom<typeof jobs.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    }
  },
  parts: {
    list: {
      method: 'GET' as const,
      path: '/api/parts',
      responses: {
        200: z.array(z.custom<typeof partsInventory.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/parts',
      input: insertPartSchema,
      responses: {
        201: z.custom<typeof partsInventory.$inferSelect>(),
        400: errorSchemas.validation,
      },
    }
  },
  jobPhotos: {
    list: {
      method: 'GET' as const,
      path: '/api/jobs/:jobId/photos',
      responses: {
        200: z.array(z.custom<typeof jobPhotos.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/jobs/:jobId/photos',
      input: insertJobPhotoSchema.omit({ jobId: true }),
      responses: {
        201: z.custom<typeof jobPhotos.$inferSelect>(),
        400: errorSchemas.validation,
      },
    }
  }
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
