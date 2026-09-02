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
          ownerUid: { type: "string", description: "Holds the owner's userCode, synced from trip_owner_user_master.owner." },
        },
      },
      TripOwnerUserMaster: {
        type: "object",
        description: "Ownership + role record for a trip. Path: trip_owner_user_master/{tripCode}.",
        properties: {
          tripCode: { type: "string" },
          owner: { type: "string", description: "userCode of the trip's creator." },
          allowModification: { type: "boolean" },
          users: {
            type: "object",
            description:
              "Keyed by each traveler's canonical travelerId (a stable generated ID, never a display name -- names can collide or change when a placeholder is later matched to a real account). Includes the owner's own travelerId too, since expenses/splits reference the owner the same way as any other traveler.",
            additionalProperties: {
              type: "object",
              properties: {
                role: { type: "string", enum: ["owner", "moderator", "companion"] },
                userCode: { type: "string", description: "Empty string for a traveler who hasn't linked a real account (or never will -- a permanent placeholder guest is a supported state)." },
                email: { type: "string" },
                displayName: { type: "string" },
              },
              required: ["role", "userCode", "email", "displayName"],
            },
          },
        },
      },
      UserSpecificTripList: {
        type: "object",
        description: "Per-user checklist/outfit snapshot for a trip. Path: user_specific_trip_list/{userCode}_{tripCode}.",
        properties: {
          userCode: { type: "string" },
          tripCode: { type: "string" },
          globalChecklist: { type: "array", items: {} },
          outfitDetails: { type: "object" },
        },
      },
      UserDetails: {
        type: "object",
        properties: {
          uid: { type: "string" },
          email: { type: "string", nullable: true },
          name: { type: "string" },
          userCode: { type: "string", nullable: true },
          isActive: { type: "boolean", description: "Soft-delete flag. false means the account was deleted; can be reversed via /api/users/reactivate." },
        },
      },
      SubscriptionPlan: {
        type: "object",
        description: "Path: subscription_types/{planId}.",
        properties: {
          planId: { type: "string" },
          planName: { type: "string" },
          durationYears: { type: "number" },
          originalPrice: { type: "number" },
          discountedPrice: { type: "number" },
          currency: { type: "string" },
          description: { type: "string" },
          badge: { type: "string" },
          popular: { type: "boolean" },
        },
      },
      UserSubscription: {
        type: "object",
        description: "A user's current subscription state (one doc per user). Path: user_subscriptions/{userCode}.",
        properties: {
          userCode: { type: "string" },
          subscriptionCode: { type: "string", description: "Points at the most recent SubscriptionTransaction ledger entry." },
          planId: { type: "string" },
          effectiveStartDate: { type: "string", format: "date" },
          effectiveEndDate: { type: "string", format: "date" },
          isActive: { type: "boolean" },
        },
      },
      SubscriptionTransaction: {
        type: "object",
        description: "Append-only purchase ledger, one entry per purchase event. Path: subscription_transaction_master/{subscriptionCode}.",
        properties: {
          subscriptionCode: { type: "string" },
          userCode: { type: "string" },
          amountPaid: { type: "number" },
          currency: { type: "string" },
          planId: { type: "string" },
          transactionId: { type: "string", description: "The payment processor's own transaction/payment id." },
          orderId: { type: "string" },
          paymentMethod: { type: "string" },
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
    { name: "Uploads" },
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
        summary: "List trip_owner_user_master records owned by the signed-in user",
        security: bearerAuth,
        responses: { 200: { description: "OK", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/TripOwnerUserMaster" } } } } }, 401: errorResponse },
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
        summary: "Create/update a trip. Owner may always write; a joined companion/moderator may write only if the trip's allowModification is true AND their role permits it.",
        security: bearerAuth,
        requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/Trip" } } } },
        responses: { 200: { description: "OK" }, 403: errorResponse },
      },
      delete: {
        tags: ["Trips"],
        summary: "Delete a trip (owner only). Also removes the trip's ownership record, every associated user's checklist/outfit data, and their trip association entry.",
        security: bearerAuth,
        responses: { 200: { description: "OK" }, 403: errorResponse },
      },
    },
    "/api/trips/{code}/master": {
      parameters: [{ name: "code", in: "path", required: true, schema: { type: "string" } }],
      get: {
        tags: ["Trips"],
        summary: "Get a trip's ownership/role record (public)",
        responses: { 200: { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/TripOwnerUserMaster" } } } }, 404: errorResponse },
      },
      put: {
        tags: ["Trips"],
        summary: "Create a new ownership record (anyone, becomes owner) or update an existing one (owner only). owner is always server-decided.",
        security: bearerAuth,
        requestBody: { content: { "application/json": { schema: { type: "object", properties: { allowModification: { type: "boolean" }, users: { type: "object" } } } } } },
        responses: { 200: { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/TripOwnerUserMaster" } } } }, 403: errorResponse },
      },
      delete: {
        tags: ["Trips"],
        summary: "Delete a trip's ownership record (owner only)",
        security: bearerAuth,
        responses: { 200: { description: "OK" }, 403: errorResponse },
      },
    },
    "/api/trips/{code}/user-trip-list/{userCode}": {
      parameters: [
        { name: "code", in: "path", required: true, schema: { type: "string" } },
        { name: "userCode", in: "path", required: true, schema: { type: "string" } },
      ],
      get: {
        tags: ["Trips"],
        summary: "Get one user's checklist + outfit data for a trip. Callers may only read their own entry.",
        security: bearerAuth,
        responses: { 200: { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/UserSpecificTripList" } } } }, 403: errorResponse, 404: errorResponse },
      },
      put: {
        tags: ["Trips"],
        summary: "Save one user's checklist + outfit data for a trip. Callers may only write their own entry.",
        security: bearerAuth,
        requestBody: { content: { "application/json": { schema: { type: "object", properties: { globalChecklist: { type: "array", items: {} }, outfitDetails: { type: "object" } } } } } },
        responses: { 200: { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/UserSpecificTripList" } } } }, 403: errorResponse },
      },
      delete: {
        tags: ["Trips"],
        summary: "Delete one user's checklist + outfit data for a trip. Callers may only remove their own entry.",
        security: bearerAuth,
        responses: { 200: { description: "OK" }, 403: errorResponse },
      },
    },
    "/api/trips/{code}/user-role/{userCode}": {
      post: {
        tags: ["Trips"],
        summary: "Syncs a userCode's role into user_trip_association_master -- a derived convenience index, not a source of truth. The role written is always re-derived server-side from trip_owner_user_master (the actual source of truth) and never trusted from the client -- no role field exists in the request body at all. Setting your own role is always allowed (it can only ever write what trip_owner_user_master already says about you); setting someone else's requires approveChanges permission on this trip.",
        security: bearerAuth,
        parameters: [
          { name: "code", in: "path", required: true, schema: { type: "string" } },
          { name: "userCode", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { 200: { description: "OK" }, 400: errorResponse, 401: errorResponse, 403: errorResponse, 404: errorResponse },
      },
      delete: {
        tags: ["Trips"],
        summary: "Removes a userCode's entry from user_trip_association_master. Removing your own entry is always allowed (leaving a trip is always your own choice). Removing someone else's requires approveChanges permission, verified against trip_owner_user_master -- if that record no longer exists, this fails closed (403) rather than assuming it's fine.",
        security: bearerAuth,
        parameters: [
          { name: "code", in: "path", required: true, schema: { type: "string" } },
          { name: "userCode", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { 200: { description: "OK" }, 400: errorResponse, 401: errorResponse, 403: errorResponse },
      },
    },
    "/api/trips/{code}/changes": {
      post: {
        tags: ["Trips"],
        summary: "Log a trip change entry (trip_transaction_master/{code}/changes/{changeId}), changeId allocated via a sequential per-trip counter. Matches lib/db.ts's logTripChange -- a changeId looks the same regardless of which side wrote it. Non-critical: logging failures never fail the response.",
        security: bearerAuth,
        parameters: [{ name: "code", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  operation: { type: "string", enum: ["created", "updated", "deleted"] },
                  fieldPath: { type: "string" },
                  newValue: {},
                },
                required: ["operation"],
              },
            },
          },
        },
        responses: { 200: { description: "OK" }, 400: errorResponse, 401: errorResponse },
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
        summary: "Save your own profile. isActive and other system-managed fields are ignored.",
        security: bearerAuth,
        requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/UserDetails" } } } },
        responses: { 200: { description: "OK", content: { "application/json": { schema: { $ref: "#/components/schemas/UserDetails" } } } }, 401: errorResponse },
      },
      delete: {
        tags: ["Users"],
        summary: "Soft-delete your account: deletes owned trips and your own checklist/outfit/config data, then flips isActive to false on your user record (never removed, so /reactivate can restore it later). Does NOT delete the underlying Firebase Auth account.",
        security: bearerAuth,
        responses: { 200: { description: "OK" }, 401: errorResponse },
      },
    },
    "/api/users/lookup/by-email": {
      get: {
        tags: ["Users"],
        summary: "With no email query param: your own full profile (by your token's verified email). With ?email=X: looks up that email and returns only the public-safe subset (name/email/userCode) -- used by the owner-invite flow to check whether an invited email already has an account.",
        security: bearerAuth,
        parameters: [{ name: "email", in: "query", required: false, schema: { type: "string" } }],
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
        summary: "Reactivate your own account if it was previously soft-deleted (isActive was false). Matched by your current Firebase session's uid, falling back to its verified email.",
        security: bearerAuth,
        responses: { 200: { description: "OK, or null if the account wasn't soft-deleted" }, 401: errorResponse },
      },
    },
    "/api/users/config/{userCode}": {
      parameters: [{ name: "userCode", in: "path", required: true, schema: { type: "string" } }],
      get: { tags: ["Users"], summary: "Get user config (checklist defaults, unit preferences). Self only -- 403 if userCode isn't the caller's own.", security: bearerAuth, responses: { 200: { description: "OK" }, 403: errorResponse, 404: errorResponse } },
      put: { tags: ["Users"], summary: "Save user config. Self only -- 403 if userCode isn't the caller's own.", security: bearerAuth, responses: { 200: { description: "OK" }, 403: errorResponse } },
    },
    "/api/users/tripcodes/{userCode}": {
      get: {
        tags: ["Users"],
        summary: "List the trip codes a user has an entry for (derived from user_specific_trip_list, not a separate stored list). Self only -- 403 if userCode isn't the caller's own.",
        security: bearerAuth,
        parameters: [{ name: "userCode", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "OK" }, 403: errorResponse },
      },
    },
    "/api/users/associations/{userCode}": {
      get: {
        tags: ["Users"],
        summary: "Get a user's role on every trip they're associated with (owned or joined). Path: user_trip_association_master/{userCode}. Self only -- 403 if userCode isn't the caller's own.",
        security: bearerAuth,
        parameters: [{ name: "userCode", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "OK", content: { "application/json": { schema: { type: "object", additionalProperties: { type: "string", enum: ["owner", "moderator", "companion"] } } } } }, 403: errorResponse },
      },
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
    "/api/subscriptions/me": {
      get: {
        tags: ["Subscriptions"],
        summary: "The caller's own current subscription state (user_subscriptions/{userCode}), or null if they've never had one. Read-only -- real subscription grants only ever happen through a verified purchase (see services/subscriptionService.ts's recordPurchaseAttempt + applySuccessfulTransaction).",
        security: bearerAuth,
        responses: { 200: { description: "OK" }, 400: errorResponse, 401: errorResponse },
      },
    },
    "/api/subscriptions/me/normalize-lifetime": {
      post: {
        tags: ["Subscriptions"],
        summary: "Fixes an old data-format inconsistency where some lifetime subscriptions had an arbitrary end date instead of the canonical '2099-12-31' sentinel. Takes no body -- the qualifying condition (is this user's EXISTING subscription already active and lifetime-equivalent?) is re-derived server-side from Firestore, never trusted from the client. Cannot grant, activate, or upgrade a subscription; only normalizes an end date on one that already qualifies.",
        security: bearerAuth,
        responses: { 200: { description: "OK" }, 400: errorResponse, 401: errorResponse },
      },
    },
    "/api/transactions/by-user-code/{userCode}": {
      get: {
        tags: ["Transactions"],
        summary: "List a user's subscription purchase history",
        security: bearerAuth,
        parameters: [{ name: "userCode", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "OK", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/SubscriptionTransaction" } } } } }, 401: errorResponse },
      },
    },
    "/api/transactions/mine": {
      get: {
        tags: ["Transactions"],
        summary: "List the signed-in user's own subscription purchase history",
        security: bearerAuth,
        responses: { 200: { description: "OK", content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/SubscriptionTransaction" } } } } }, 401: errorResponse },
      },
    },
    "/api/messages": {
      post: {
        tags: ["Messages"],
        summary: "Submit a contact-us message (guests allowed)",
        requestBody: { content: { "application/json": { schema: { type: "object", properties: { name: { type: "string" }, email: { type: "string" }, topic: { type: "string" }, message: { type: "string" }, userCode: { type: "string" } }, required: ["message"] } } } },
        responses: { 200: { description: "OK", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, ticketId: { type: "string" } } } } } } },
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
                    planName: { type: "string" },
                    userName: { type: "string" },
                    userEmail: { type: "string" },
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
        summary: "Verify a completed Razorpay checkout and apply the subscription (signature-checked). subscriptionCode is generated server-side at this point, not passed in. Every attempt -- including a signature mismatch -- is recorded in subscription_transaction_master (status 'completed' or 'failed'), not just successes.",
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
                },
                required: ["razorpay_order_id", "razorpay_payment_id", "razorpay_signature"],
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
        summary: "Razorpay server-to-server webhook (payment.captured / order.paid / payment.failed, the latter recorded as a failed transaction too). Verified via X-Razorpay-Signature, not a bearer token.",
        parameters: [{ name: "X-Razorpay-Signature", in: "header", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "Received" }, 400: errorResponse },
      },
    },
    "/api/payments/googleplay/verify": {
      post: {
        tags: ["Payments"],
        summary:
          "Verify a Google Play one-time product purchase (via @capgo/native-purchases on Android) against the Play Developer API, then apply the subscription. All 5 plans (1/2/3/5-year + lifetime) are modeled as Play one-time products, not subscriptions -- this app's own applySuccessfulTransaction()/calculateEndDate() compute the multi-year expiry, same as for Razorpay. Failed verifications (bad token, purchase not in a completed state) are also recorded in subscription_transaction_master with status 'failed', not silently dropped.",
        security: bearerAuth,
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  productId: { type: "string", description: "Must match a Play Console product ID, which in turn matches a planId (e.g. '3_year')." },
                  purchaseToken: { type: "string" },
                },
                required: ["productId", "purchaseToken"],
              },
            },
          },
        },
        responses: { 200: { description: "OK" }, 400: errorResponse, 401: errorResponse },
      },
    },
    "/api/joinrequests/submit": {
      post: {
        tags: ["JoinRequests"],
        summary:
          "A traveler requests to join a trip. Written to trip_join_requests/{tripCode}.traveler_request.{requestId} inside a transaction alongside the approval-list fan-out (owner + every moderator get approval_to_grant; the requester gets approval_requested). Not yet called by the frontend, which still talks to Firestore directly for this feature (see src/lib/db.ts) -- built independently, ready for the eventual migration.",
        security: bearerAuth,
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  tripCode: { type: "string" },
                  tripTitle: { type: "string" },
                  requesterEmail: { type: "string" },
                  requesterName: { type: "string" },
                  matchedTravelerId: { type: "string", description: "The existing placeholder's canonical travelerId. Required unless isNewTraveler is true, in which case a new one is minted server-side." },
                  matchedTravelerName: { type: "string" },
                  isNewTraveler: { type: "boolean" },
                },
                required: ["tripCode", "matchedTravelerName"],
              },
            },
          },
        },
        responses: { 200: { description: "OK" }, 400: errorResponse, 401: errorResponse },
      },
    },
    "/api/joinrequests/invite": {
      post: {
        tags: ["JoinRequests"],
        summary:
          "Trip owner invites a specific known user by email. Written to trip_join_requests/{tripCode}.owner_invite.{requestId} -- recipient gets approval_to_grant, the inviting owner gets approval_requested. Also sends an existing-account invite email (fire-and-forget, never blocks the response). Only the trip's owner may call this.",
        security: bearerAuth,
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  tripCode: { type: "string" },
                  tripTitle: { type: "string" },
                  travelerId: { type: "string", description: "The placeholder traveler's canonical travelerId (already minted when the owner added them)." },
                  travelerName: { type: "string" },
                  recipientUserCode: { type: "string" },
                  recipientEmail: { type: "string" },
                },
                required: ["tripCode", "travelerId", "travelerName", "recipientUserCode"],
              },
            },
          },
        },
        responses: { 200: { description: "OK" }, 400: errorResponse, 401: errorResponse, 403: errorResponse },
      },
    },
    "/api/joinrequests/invite-unregistered": {
      post: {
        tags: ["JoinRequests"],
        summary:
          "Trip owner invites an email with no matching Viadia account. Records the tripCode under unmapped_email_trip_association/{email} and sends a sign-up invite email. Once that email eventually signs up, /process-unmapped-signup automatically creates the real owner_invite. Only the trip's owner may call this.",
        security: bearerAuth,
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  tripCode: { type: "string" },
                  tripTitle: { type: "string" },
                  recipientEmail: { type: "string" },
                },
                required: ["tripCode", "recipientEmail"],
              },
            },
          },
        },
        responses: { 200: { description: "OK" }, 400: errorResponse, 401: errorResponse, 403: errorResponse },
      },
    },
    "/api/joinrequests/process-unmapped-signup": {
      post: {
        tags: ["JoinRequests"],
        summary:
          "Called once, right after a brand-new account finishes signing up. Creates a real owner_invite for every trip this email was previously invited to (via invite-unregistered) that's still 'planned' or 'active', then clears the pending list for this email regardless of how many trips qualified.",
        security: bearerAuth,
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { email: { type: "string" } },
                required: ["email"],
              },
            },
          },
        },
        responses: { 200: { description: "OK" }, 400: errorResponse, 401: errorResponse },
      },
    },
    "/api/joinrequests/{tripCode}/{requestId}/approve": {
      post: {
        tags: ["JoinRequests"],
        summary:
          "Owner/moderator approves a pending traveler_request -- performs the userCode/email mapping, seeds the requester's per-trip checklist, and triggers the multi-approver cleanup scan (fire-and-forget) afterward. Entry is kept with status='approved', not deleted -- removed only by the trip-completion/cancellation sweep. Requires approveChanges permission on this trip.",
        security: bearerAuth,
        parameters: [
          { name: "tripCode", in: "path", required: true, schema: { type: "string" } },
          { name: "requestId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { 200: { description: "OK" }, 400: errorResponse, 401: errorResponse, 403: errorResponse },
      },
    },
    "/api/joinrequests/{tripCode}/{requestId}/reject": {
      post: {
        tags: ["JoinRequests"],
        summary: "Owner/moderator rejects a pending traveler_request. Entry is kept with status='rejected'. Requires approveChanges permission on this trip.",
        security: bearerAuth,
        parameters: [
          { name: "tripCode", in: "path", required: true, schema: { type: "string" } },
          { name: "requestId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { 200: { description: "OK" }, 400: errorResponse, 401: errorResponse, 403: errorResponse },
      },
    },
    "/api/joinrequests/{tripCode}/{requestId}/accept-invite": {
      post: {
        tags: ["JoinRequests"],
        summary:
          "The invited user accepts an owner_invite -- grants actual access (user_trip_association_master + seeded checklist). Only the addressed recipient may call this.",
        security: bearerAuth,
        parameters: [
          { name: "tripCode", in: "path", required: true, schema: { type: "string" } },
          { name: "requestId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { 200: { description: "OK" }, 400: errorResponse, 401: errorResponse },
      },
    },
    "/api/joinrequests/{tripCode}/{requestId}/decline-invite": {
      post: {
        tags: ["JoinRequests"],
        summary:
          "The invited user declines an owner_invite -- the placeholder traveler slot is removed immediately (unchanged, separate from request-record persistence). Entry is kept with status='rejected'. Only the addressed recipient may call this.",
        security: bearerAuth,
        parameters: [
          { name: "tripCode", in: "path", required: true, schema: { type: "string" } },
          { name: "requestId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { 200: { description: "OK" }, 400: errorResponse, 401: errorResponse },
      },
    },
    "/api/joinrequests/approval-to-grant": {
      get: {
        tags: ["JoinRequests"],
        summary:
          "Everything the caller currently needs to act on: pending traveler_request entries (only for trips where they have approveChanges permission) and any pending owner_invite addressed to them.",
        security: bearerAuth,
        responses: { 200: { description: "OK" }, 401: errorResponse },
      },
    },
    "/api/joinrequests/approval-requested": {
      get: {
        tags: ["JoinRequests"],
        summary: "Everything the caller is currently waiting on someone else's decision for -- their own pending join requests, or invites they've sent as an owner.",
        security: bearerAuth,
        responses: { 200: { description: "OK" }, 401: errorResponse },
      },
    },
    "/api/joinrequests/{tripCode}/doc": {
      get: {
        tags: ["JoinRequests"],
        summary: "Raw trip_join_requests/{tripCode} doc (both owner_invite and traveler_request maps). Contains requester/recipient emails, so requires auth -- not scoped to a specific role on the trip beyond that.",
        security: bearerAuth,
        parameters: [{ name: "tripCode", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "OK" }, 401: errorResponse },
      },
    },
    "/api/joinrequests/{tripCode}/sweep": {
      post: {
        tags: ["JoinRequests"],
        summary: "Sweeps stale/resolved join-request approval-list entries for a trip that just transitioned to completed/cancelled. Idempotent -- safe to call redundantly.",
        security: bearerAuth,
        parameters: [{ name: "tripCode", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "OK" }, 401: errorResponse },
      },
    },
    "/api/joinrequests/{tripCode}/{requestId}/cancel-invite": {
      post: {
        tags: ["JoinRequests"],
        summary: "Inviter withdraws an invite they sent -- distinct from decline, which is the recipient's own action. Only the original inviter may cancel, and only while it's still pending.",
        security: bearerAuth,
        parameters: [
          { name: "tripCode", in: "path", required: true, schema: { type: "string" } },
          { name: "requestId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { 200: { description: "OK" }, 400: errorResponse, 401: errorResponse },
      },
    },
    "/api/uploads/presign": {
      post: {
        tags: ["Uploads"],
        summary: "Get a short-lived presigned URL to upload a file directly to R2. Object key is server-decided and scoped under the caller's own userCode.",
        security: bearerAuth,
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  purpose: { type: "string", enum: ["outfit-photo", "attachment"] },
                  tripCode: { type: "string" },
                  contentType: { type: "string", example: "image/jpeg" },
                  declaredSizeBytes: { type: "number", description: "Optional soft check; real enforcement happens in /confirm." },
                },
                required: ["purpose", "contentType"],
              },
            },
          },
        },
        responses: {
          200: {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    key: { type: "string" },
                    uploadUrl: { type: "string", description: "PUT the file bytes here directly (not through this API)." },
                    publicUrl: { type: "string" },
                    expiresInSeconds: { type: "number" },
                  },
                },
              },
            },
          },
          400: errorResponse,
          401: errorResponse,
        },
      },
    },
    "/api/uploads/confirm": {
      post: {
        tags: ["Uploads"],
        summary: "Confirm a direct-to-R2 upload finished. Verifies the object exists and is within the purpose's size limit, deleting it (and erroring) if not.",
        security: bearerAuth,
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { key: { type: "string" }, purpose: { type: "string", enum: ["outfit-photo", "attachment"] } },
                required: ["key", "purpose"],
              },
            },
          },
        },
        responses: {
          200: { description: "OK", content: { "application/json": { schema: { type: "object", properties: { success: { type: "boolean" }, publicUrl: { type: "string" }, sizeBytes: { type: "number" } } } } } },
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
        },
      },
    },
    "/api/uploads/object": {
      delete: {
        tags: ["Uploads"],
        summary: "Delete a previously uploaded object. Caller must own it (key's userCode segment must match their own).",
        security: bearerAuth,
        parameters: [{ name: "key", in: "query", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "OK" }, 400: errorResponse, 401: errorResponse, 403: errorResponse },
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
