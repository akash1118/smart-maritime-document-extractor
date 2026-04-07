import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Smart Maritime Document Extractor API',
      version: '1.0.0',
      description:
        'Extracts structured data from maritime documents (SIRB, COC, PEME, passports, etc.) using LLM-powered processing. Supports sync and async extraction, cross-document compliance validation, and session-based compliance reports.',
    },
    servers: [{ url: '/api', description: 'Default server' }],
    tags: [
      { name: 'Health', description: 'Service health and dependency status' },
      { name: 'Extraction', description: 'Document upload and data extraction' },
      { name: 'Jobs', description: 'Async job status polling' },
      { name: 'Sessions', description: 'Session management, validation, and reports' },
    ],
    components: {
      schemas: {
        ErrorResponse: {
          type: 'object',
          properties: {
            error: { type: 'string', example: 'LLM_JSON_PARSE_FAIL' },
            message: { type: 'string', example: 'Document extraction failed after retry.' },
            extractionId: { type: 'string', format: 'uuid', nullable: true },
            retryAfterMs: { type: 'number', nullable: true, example: null },
          },
        },
        ExtractionResult: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            sessionId: { type: 'string', format: 'uuid' },
            fileName: { type: 'string', example: 'PEME_Samoya.pdf' },
            documentType: { type: 'string', example: 'PEME', nullable: true },
            documentName: { type: 'string', example: 'Pre-Employment Medical Examination', nullable: true },
            applicableRole: { type: 'string', enum: ['DECK', 'ENGINE', 'BOTH', 'N/A'], nullable: true },
            category: { type: 'string', example: 'MEDICAL', nullable: true },
            confidence: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'], nullable: true },
            holderName: { type: 'string', nullable: true },
            dateOfBirth: { type: 'string', example: '12/03/1988', nullable: true },
            sirbNumber: { type: 'string', nullable: true },
            passportNumber: { type: 'string', nullable: true },
            fields: { type: 'array', items: { type: 'object' } },
            validity: { type: 'object', nullable: true },
            compliance: { type: 'object', nullable: true },
            medicalData: { type: 'object', nullable: true },
            flags: { type: 'array', items: { type: 'object' } },
            isExpired: { type: 'boolean' },
            processingTimeMs: { type: 'integer', nullable: true },
            summary: { type: 'string', nullable: true },
            status: { type: 'string', enum: ['COMPLETE', 'FAILED'] },
            deduplicated: { type: 'boolean', description: 'Present and true when a cached result was returned' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        AsyncJobResponse: {
          type: 'object',
          properties: {
            jobId: { type: 'string', format: 'uuid' },
            sessionId: { type: 'string', format: 'uuid' },
            status: { type: 'string', enum: ['QUEUED'] },
            pollUrl: { type: 'string', example: '/api/jobs/uuid' },
            estimatedWaitMs: { type: 'integer', example: 6000 },
          },
        },
        JobStatus: {
          type: 'object',
          properties: {
            jobId: { type: 'string', format: 'uuid' },
            sessionId: { type: 'string', format: 'uuid' },
            status: { type: 'string', enum: ['QUEUED', 'PROCESSING', 'COMPLETE', 'FAILED'] },
            queuePosition: { type: 'integer', nullable: true },
            extractionId: { type: 'string', format: 'uuid', nullable: true },
            result: { $ref: '#/components/schemas/ExtractionResult', nullable: true },
            error: { type: 'string', nullable: true },
            message: { type: 'string', nullable: true },
            retryable: { type: 'boolean', nullable: true },
            startedAt: { type: 'string', format: 'date-time', nullable: true },
            completedAt: { type: 'string', format: 'date-time', nullable: true },
            failedAt: { type: 'string', format: 'date-time', nullable: true },
            estimatedCompleteMs: { type: 'integer', nullable: true },
          },
        },
        SessionSummary: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', format: 'uuid' },
            documentCount: { type: 'integer' },
            detectedRole: { type: 'string', enum: ['DECK', 'ENGINE', 'BOTH', 'UNKNOWN'] },
            overallHealth: { type: 'string', enum: ['OK', 'WARN', 'CRITICAL'] },
            documents: { type: 'array', items: { type: 'object' } },
            pendingJobs: { type: 'array', items: { type: 'object' } },
          },
        },
        ValidationResult: {
          type: 'object',
          properties: {
            holderProfile: { type: 'object' },
            consistencyChecks: { type: 'array', items: { type: 'object' } },
            missingDocuments: { type: 'array', items: { type: 'object' } },
            expiringDocuments: { type: 'array', items: { type: 'object' } },
            medicalFlags: { type: 'array', items: { type: 'object' } },
            overallStatus: { type: 'string', enum: ['APPROVED', 'CONDITIONAL', 'REJECTED'] },
            overallScore: { type: 'integer', minimum: 0, maximum: 100 },
            summary: { type: 'string' },
            recommendations: { type: 'array', items: { type: 'string' } },
            validatedAt: { type: 'string', format: 'date-time' },
          },
        },
        HealthResponse: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['OK', 'DEGRADED'] },
            version: { type: 'string', example: '1.0.0' },
            uptime: { type: 'integer', example: 3612 },
            dependencies: {
              type: 'object',
              properties: {
                database: { type: 'string', example: 'OK' },
                llmProvider: { type: 'string', example: 'OK' },
                queue: { type: 'string', example: 'OK' },
              },
            },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    paths: {
      '/health': {
        get: {
          tags: ['Health'],
          summary: 'Health check',
          description: 'Returns service status and dependency health (database, LLM provider, queue).',
          operationId: 'getHealth',
          responses: {
            '200': { description: 'All dependencies healthy', content: { 'application/json': { schema: { $ref: '#/components/schemas/HealthResponse' } } } },
            '503': { description: 'One or more dependencies degraded', content: { 'application/json': { schema: { $ref: '#/components/schemas/HealthResponse' } } } },
          },
        },
      },
      '/extract': {
        post: {
          tags: ['Extraction'],
          summary: 'Extract data from a maritime document',
          description: `Upload a maritime document and receive structured extracted data.\n\n**Modes:**\n- \`?mode=sync\` (default) — blocks until extraction is complete\n- \`?mode=async\` — returns 202 immediately with a \`jobId\` to poll\n\n**Deduplication:** If the same file (SHA-256) has already been processed in this session, returns the cached result with header \`X-Deduplicated: true\`.\n\n**Rate limit:** 10 requests/minute per IP.`,
          operationId: 'extractDocument',
          parameters: [
            {
              name: 'mode',
              in: 'query',
              schema: { type: 'string', enum: ['sync', 'async'], default: 'sync' },
              description: 'Processing mode',
            },
          ],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  required: ['document'],
                  properties: {
                    document: { type: 'string', format: 'binary', description: 'Maritime document file. Max 10 MB. Accepted: jpeg, png, pdf.' },
                    sessionId: { type: 'string', format: 'uuid', description: 'Group extractions into a session. A new session is created if omitted.' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'Extraction complete (sync mode or dedup hit)', content: { 'application/json': { schema: { $ref: '#/components/schemas/ExtractionResult' } } } },
            '202': { description: 'Job queued (async mode)', content: { 'application/json': { schema: { $ref: '#/components/schemas/AsyncJobResponse' } } } },
            '400': { description: 'UNSUPPORTED_FORMAT / SESSION_NOT_FOUND', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            '413': { description: 'FILE_TOO_LARGE — file exceeds 10 MB', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            '422': { description: 'LLM_JSON_PARSE_FAIL — unparseable response after repair attempt', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            '429': { description: 'RATE_LIMITED', headers: { 'Retry-After': { schema: { type: 'integer' } } }, content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            '500': { description: 'INTERNAL_ERROR / LLM_TIMEOUT', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
      },
      '/jobs/{jobId}': {
        get: {
          tags: ['Jobs'],
          summary: 'Poll async job status',
          operationId: 'getJob',
          parameters: [{ name: 'jobId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: {
            '200': { description: 'Job status (QUEUED / PROCESSING / COMPLETE / FAILED)', content: { 'application/json': { schema: { $ref: '#/components/schemas/JobStatus' } } } },
            '404': { description: 'JOB_NOT_FOUND', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
      },
      '/sessions/{sessionId}': {
        get: {
          tags: ['Sessions'],
          summary: 'Get session summary',
          operationId: 'getSession',
          parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: {
            '200': { description: 'Session summary with all documents and health status', content: { 'application/json': { schema: { $ref: '#/components/schemas/SessionSummary' } } } },
            '404': { description: 'SESSION_NOT_FOUND', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
      },
      '/sessions/{sessionId}/validate': {
        post: {
          tags: ['Sessions'],
          summary: 'Cross-document compliance validation',
          description: 'Sends all complete extraction records from the session to the LLM for cross-document compliance assessment. Requires at least 2 successfully extracted documents.',
          operationId: 'validateSession',
          parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: {
            '200': { description: 'Validation result', content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationResult' } } } },
            '400': { description: 'INSUFFICIENT_DOCUMENTS — fewer than 2 extracted documents', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            '404': { description: 'SESSION_NOT_FOUND', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            '422': { description: 'LLM_JSON_PARSE_FAIL', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
      },
      '/sessions/{sessionId}/report': {
        get: {
          tags: ['Sessions'],
          summary: 'Get compliance report',
          description: 'Returns a structured compliance report derived entirely from database records (no LLM call). Includes holder profile, document summary, flags, medical status, and latest validation result.',
          operationId: 'getReport',
          parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: {
            '200': { description: 'Compliance report', content: { 'application/json': { schema: { type: 'object' } } } },
            '404': { description: 'SESSION_NOT_FOUND', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          },
        },
      },
    },
  },
  apis: [],
};

export const swaggerSpec = swaggerJsdoc(options);
