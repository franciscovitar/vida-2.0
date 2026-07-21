import type { NextConfig } from 'next';

/**
 * googleapis/gaxios arrastran ArrayBuffer no clonables en el bundle RSC/Turbopack.
 * Se externalizan por si quedan imports (p. ej. utilidades legacy); la lectura
 * de Calendar usa fetch Node-only y no depende del SDK.
 */
const nextConfig: NextConfig = {
  serverExternalPackages: ['googleapis', 'google-auth-library', 'gaxios'],
};

export default nextConfig;
