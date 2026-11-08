// Convex trusts JWTs issued by this Clerk instance (Clerk dashboard → Integrations → Convex).
const authConfig = {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
};

export default authConfig;
