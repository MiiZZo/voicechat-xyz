import { z } from 'zod';

const ConfigSchema = z.object({
  PORT: z.coerce.number().default(3000),
  LIVEKIT_URL: z.string().url(),
  LIVEKIT_API_KEY: z.string().min(1),
  LIVEKIT_API_SECRET: z.string().min(1),
  ROOMS_FILE: z.string().default('./rooms.yaml'),
  LOG_LEVEL: z.string().default('info'),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
  const parsed = ConfigSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment config:', parsed.error.format());
    process.exit(1);
  }
  return parsed.data;
}
