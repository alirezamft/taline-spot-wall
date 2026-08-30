import type { NextConfig } from "next";

// Deliberately keep server credentials out of next.config's `env` object.
// Route handlers read TLYN_SESSION_COOKIE directly at request time, so it is
// never compiled into the client bundle.
const nextConfig: NextConfig = {};

export default nextConfig;
