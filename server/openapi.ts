// Hand-authored OpenAPI 3.0 document describing every route in server/routes/*. Served via
// swagger-ui-express at GET /docs (see index.ts). Kept as a single static object rather than
// generated from JSDoc comments so the spec stays predictable and easy to review in one place.

const errorResponse = {
  description: "Error",
  content: {
    "application/json": {
      schema: { type: "object", properties: { error: { type: "string" } } },
    },
  },
};

const bearerAuth = [{ bearerAuth: [] as string[] }];

export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Viadia API",
    version: "1.0.0",
    description:
      "Backend for the Viadia trip planner: trips, users, subscriptions, transactions, Razorpay payments, and geo/Gemini proxies. " +
      "Endpoints marked with a lock require `Authorization: Bearer <Firebase ID token>`.",
  },
  servers: [{ url: "/", description: "Current host" }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "Firebase ID token",
        description: "Obtain via `auth.currentUser.getIdToken()` on the client (Firebase Auth).",
      },
    },
    schemas: {
      Error: { type: "object", properties: { error: { type: "string" } } },
      Trip: {
        type: "object",
        properties: {
          id: { type: "string" },
          code: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          status: { type: "string", enum: ["planned", "completed", "active", "cancelled"] },
          startDate: { type: "string", format: "date" },
          endDate: { type: "string", format: "date" },
          countries: { type: "array", items: { type: "string" } },
          ownerUid: { type: "string" },
        },
      },
      TripMaster: {
        type: "object",
        properties: {
          tripCode: { type: "string" },
          ownerUid: { type: "string" },
          allowOthersToModify: { type: "boolean" },
        },
      },
      UserDetails: {
        type: "object",
        properties: {
          uid: { type: "string" },
          email: { type: "string", nullable: true },
          name: { type: "string" },
          userCode: { type: "string", nullable: true },
          subscription_tier: { type: "string" },
          sub_start_date: { type: "string" },
          sub_end_date: { type: "string" },
          adTier: { type: "boolean" },
        },
      },
      SubscriptionPlan: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          type: { type: "string" },
          durationYears: { type: "number" },
          originalPrice: { type: "number" },
          discountedPrice: { type: "number" },
          currency: { type: "string" },
        },
      },
      SubscriptionTransaction: {
        type: "object",
        properties: {
          transactionId: { type: "string" },
          uid: { type: "string" },
          planId: { type: "string" },
          amountPaid: { type: "number" },
          currency: { type: "string" },
          paymentMethod: { type: "string" },
          orderId: { type: "string" },
          status: { type: "string", enum: ["completed", "pending", "refunded", "failed"] },
          createdAt: { type: "string" },
        },
      },
    },
  },
  tags: [
    { name: "Trips" },
    { name: "Users" },
    { name: "Subscriptions" },
    { name: "Transactions" },
    { name: "Messages" },
    { name: "Payments" },
    { name: "Geo" },
    { name: "Gemini" },
  ],
  paths: {
    "/api/trips/owned": {
      get: {
        tags: ["Trips"],
        summary: "List trips owned by the signed-in user",
        security: bearerAuth,
        responses: { 200: { description: "OK", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Trip" } } } } }, 401: errorResponse },
      },
    },
    "/api/trips/owned/masters": {
      get: {
        tags: ["Trips"],
        summary: "List trip_master records owned by the signed-in user",
        security: bearerAuth,
        responses: { 200: { description: "OK", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/TripMaster" } } } } }, 401: errorResponse },
      },
    },
    "/api/trips/{code}": {
      parameters: [{ name: "code", in: "path", required: true, schema: { type: "string" }, description: "6-character trip share code" }],
      get: {
        tags: ["Trips"],
        summary: "Get a trip by its share code (public)",
        responses: { 200: { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/Trip" } } } }, 404: errorResponse },
      },
      put: {
        tags: ["Trips"],
        summary: "Create/update a trip (owner, allowOthersToModify, or a guest-owned trip)",
        security: bearerAuth,
        requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/Trip" } } } },
        responses: { 200: { description: "OK" }, 403: errorResponse },
      },
      delete: {
        tags: ["Trips"],
        summary: "Delete a trip (and its gclist/styling)",
        security: bearerAuth,
        responses: { 200: { description: "OK" }, 403: errorResponse },
      },
    },
    "/api/trips/{code}/master": {
      parameters: [{ name: "code", in: "path", required: true, schema: { type: "string" } }],
      get: {
        tags: ["Trips"],
        summary: "Get a trip's ownership record (public)",
        responses: { 200: { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/TripMaster" } } } }, 404: errorResponse },
      },
      put: {
        tags: ["Trips"],
        summary: "Create/update a trip's ownership record. ownerUid is always server-decided.",
        security: bearerAuth,
        requestBody: { content: { "application/json": { schema: { type: "object", properties: { allowOthersToModify: { type: "boolean" } } } } } },
        responses: { 200: { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/TripMaster" } } } }, 403: errorResponse },
      },
      delete: {
        tags: ["Trips"],
        summary: "Delete a trip's ownership record",
        security: bearerAuth,
        responses: { 200: { description: "OK" }, 403: errorResponse },
      },
    },
    "/api/trips/{code}/gclist-styling": {
      parameters: [{ name: "code", in: "path", required: true, schema: { type: "string" } }],
      get: {
        tags: ["Trips"],
        summary: "Get a trip's checklist + day-styling data (public)",
        responses: { 200: { description: "OK" }, 404: errorResponse },
      },
      put: {
        tags: ["Trips"],
        summary: "Save a trip's checklist + day-styling data",
        security: bearerAuth,
        requestBody: { content: { "application/json": { schema: { type: "object", properties: { gclist: { type: "array", items: {} }, styling: { type: "object" } } } } } },
        responses: { 200: { description: "OK" }, 403: errorResponse },
      },
      delete: {
        tags: ["Trips"],
        summary: "Delete a trip's checklist + day-styling data",
        security: bearerAuth,
        responses: { 200: { description: "OK" }, 403: errorResponse },
      },
    },
    "/api/users/{uid}": {
      get: {
        tags: ["Users"],
        summary: "Get a user profile — full for yourself, a public-safe subset (name/email/userCode) for anyone else",
        security: bearerAuth,
        parameters: [{ name: "uid", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/UserDetails" } } } }, 401: errorResponse, 404: errorResponse },
      },
    },
    "/api/users/me": {
      put: {
        tags: ["Users"],
        summary: "Save your own profile. Subscription/tier fields are ignored — those only change via a verified payment.",
        security: bearerAuth,
        requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/UserDetails" } } } },
        responses: { 200: { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/UserDetails" } } } }, 401: errorResponse },
      },
      delete: {
        tags: ["Users"],
        summary: "Delete your own account and owned data (preserves userCode/license in deleted_users for reactivation)",
        security: bearerAuth,
        responses: { 200: { description: "OK" }, 401: errorResponse },
      },
    },
    "/api/users/lookup/by-email": {
      get: {
        tags: ["Users"],
        summary: "Look up your own user record by your token's verified email",
        security: bearerAuth,
        responses: { 200: { description: "OK, or null if not found" }, 401: errorResponse },
      },
    },
    "/api/users/lookup/by-code/{userCode}": {
      get: {
        tags: ["Users"],
        summary: "Look up a user record by app user code",
        security: bearerAuth,
        parameters: [{ name: "userCode", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "OK, or null if not found" }, 401: errorResponse },
      },
    },
    "/api/users/next-code": {
      post: {
        tags: ["Users"],
        summary: "Allocate the next sequential app user code (e.g. UA000001)",
        security: bearerAuth,
        responses: { 200: { description: "OK", content: { "application/json": { schema: { type: "object", properties: { userCode: { type: "string" } } } } } }, 401: errorResponse },
      },
    },
    "/api/users/reactivate": {
      post: {
        tags: ["Users"],
        summary: "Reactivate a previously deleted account matching your verified email/uid",
        security: bearerAuth,
        responses: { 200: { description: "OK, or null if no deleted account found" }, 401: errorResponse },
      },
    },
    "/api/users/config/{userCode}": {
      parameters: [{ name: "userCode", in: "path", required: true, schema: { type: "string" } }],
      get: { tags: ["Users"], summary: "Get user config (checklist defaults, unit preferences)", security: bearerAuth, responses: { 200: { description: "OK" }, 404: errorResponse } },
      put: { tags: ["Users"], summary: "Save user config", security: bearerAuth, responses: { 200: { description: "OK" } } },
    },
    "/api/users/tripcodes/{userCode}": {
      parameters: [{ name: "userCode", in: "path", required: true, schema: { type: "string" } }],
      get: { tags: ["Users"], summary: "Get the trip codes registered under a user code", security: bearerAuth, responses: { 200: { description: "OK" } } },
      put: { tags: ["Users"], summary: "Save the trip codes registered under a user code", security: bearerAuth, responses: { 200: { description: "OK" } } },
    },
    "/api/subscriptions": {
      get: {
        tags: ["Subscriptions"],
        summary: "List subscription plans (public; seeds defaults into Firestore on first call)",
        responses: { 200: { description: "OK", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/SubscriptionPlan" } } } } } },
      },
    },
    "/api/subscriptions/{planId}": {
      put: {
        tags: ["Subscriptions"],
        summary: "Admin-only: create/update a plan. Requires the X-Admin-Secret header (ADMIN_API_SECRET).",
        parameters: [
          { name: "planId", in: "path", required: true, schema: { type: "string" } },
          { name: "X-Admin-Secret", in: "header", required: true, schema: { type: "string" } },
        ],
        responses: { 200: { description: "OK" }, 403: errorResponse },
      },
    },
    "/api/transactions/by-user-code/{userCode}": {
      get: {
        tags: ["Transactions"],
        summary: "List transactions for a user code",
        security: bearerAuth,
        parameters: [{ name: "userCode", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "OK", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/SubscriptionTransaction" } } } } }, 401: errorResponse },
      },
    },
    "/api/transactions/mine": {
      get: {
        tags: ["Transactions"],
        summary: "List the signed-in user's own transactions",
        security: bearerAuth,
        responses: { 200: { description: "OK", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/SubscriptionTransaction" } } } } }, 401: errorResponse },
      },
    },
    "/api/transactions": {
      post: {
        tags: ["Transactions"],
        summary: "Record a non-payment transaction receipt. Status can never be set to 'completed' here — only the Razorpay verify/webhook flow can do that.",
        security: bearerAuth,
        responses: { 200: { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/SubscriptionTransaction" } } } }, 401: errorResponse },
      },
    },
    "/api/messages": {
      post: {
        tags: ["Messages"],
        summary: "Submit a contact-us message (guests allowed)",
        requestBody: { content: { "application/json": { schema: { type: "object", properties: { name: { type: "string" }, email: { type: "string" }, subject: { type: "string" }, message: { type: "string" } }, required: ["message"] } } } },
        responses: { 200: { description: "OK" } },
      },
    },
    "/api/payments/razorpay/create-order": {
      post: {
        tags: ["Payments"],
        summary: "Create a Razorpay order for a subscription plan. Price is looked up server-side from Firestore — never trusted from the client.",
        security: bearerAuth,
        requestBody: { content: { "application/json": { schema: { type: "object", properties: { planId: { type: "string" } }, required: ["planId"] } } } },
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    orderId: { type: "string" },
                    amount: { type: "number" },
                    currency: { type: "string" },
                    keyId: { type: "string" },
                    transactionId: { type: "string" },
                  },
                },
              },
            },
          },
          400: errorResponse,
          401: errorResponse,
          404: errorResponse,
        },
      },
    },
    "/api/payments/razorpay/verify": {
      post: {
        tags: ["Payments"],
        summary: "Verify a completed Razorpay checkout and apply the subscription (signature-checked)",
        security: bearerAuth,
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  razorpay_order_id: { type: "string" },
                  razorpay_payment_id: { type: "string" },
                  razorpay_signature: { type: "string" },
                  transactionId: { type: "string" },
                },
                required: ["razorpay_order_id", "razorpay_payment_id", "razorpay_signature", "transactionId"],
              },
            },
          },
        },
        responses: { 200: { description: "OK" }, 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse },
      },
    },
    "/api/payments/razorpay/webhook": {
      post: {
        tags: ["Payments"],
        summary: "Razorpay server-to-server webhook (payment.captured / order.paid). Verified via X-Razorpay-Signature, not a bearer token.",
        parameters: [{ name: "X-Razorpay-Signature", in: "header", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "Received" }, 400: errorResponse },
      },
    },
    "/api/nominatim/search": {
      get: {
        tags: ["Geo"],
        summary: "Geocode a search query (Nominatim, with Photon fallback + caching)",
        parameters: [
          { name: "q", in: "query", required: true, schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "string", default: "5" } },
        ],
        responses: { 200: { description: "OK" }, 400: errorResponse },
      },
    },
    "/api/nominatim/reverse": {
      get: {
        tags: ["Geo"],
        summary: "Reverse-geocode coordinates (Nominatim, with Photon fallback + caching)",
        parameters: [
          { name: "lat", in: "query", required: true, schema: { type: "string" } },
          { name: "lon", in: "query", required: true, schema: { type: "string" } },
        ],
        responses: { 200: { description: "OK" }, 400: errorResponse },
      },
    },
    "/api/weather": {
      get: {
        tags: ["Geo"],
        summary: "Current weather for a coordinate (Open-Meteo, with static fallback)",
        parameters: [
          { name: "lat", in: "query", required: true, schema: { type: "string" } },
          { name: "lng", in: "query", required: true, schema: { type: "string" } },
        ],
        responses: { 200: { description: "OK" }, 400: errorResponse },
      },
    },
    "/api/forex/{base}": {
      get: {
        tags: ["Geo"],
        summary: "Exchange rates for a base currency (with static fallback)",
        parameters: [{ name: "base", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "OK" } },
      },
    },
    "/api/gemini/suggest-destinations": {
      post: {
        tags: ["Gemini"],
        summary: "Suggest destinations for a list of countries (Gemini, with curated fallback)",
        requestBody: { content: { "application/json": { schema: { type: "object", properties: { countries: { type: "array", items: { type: "string" } } }, required: ["countries"] } } } },
        responses: { 200: { description: "OK" }, 400: errorResponse },
      },
    },
    "/api/gemini/generate-itinerary": {
      post: {
        tags: ["Gemini"],
        summary: "Generate a full day-by-day itinerary (Gemini, with curated fallback)",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  tripTitle: { type: "string" },
                  countries: { type: "array", items: { type: "string" } },
                  startDate: { type: "string", format: "date" },
                  endDate: { type: "string", format: "date" },
                  cities: { type: "array", items: { type: "string" } },
                  pace: { type: "string", enum: ["relaxed", "moderate", "packed"] },
                  interests: { type: "array", items: { type: "string" } },
                  customNotes: { type: "string" },
                },
                required: ["countries", "startDate", "endDate"],
              },
            },
          },
        },
        responses: { 200: { description: "OK" }, 400: errorResponse },
      },
    },
  },
};
