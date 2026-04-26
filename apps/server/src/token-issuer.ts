import { AccessToken } from 'livekit-server-sdk';
import { randomBytes } from 'node:crypto';
import type { Config } from './config.js';

export class TokenIssuer {
  constructor(
    private readonly apiKey: string,
    private readonly apiSecret: string,
  ) {}

  static fromConfig(config: Config): TokenIssuer {
    return new TokenIssuer(config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET);
  }

  /** identity = `{displayName}#{4hex}` so collisions during race resolve. */
  buildIdentity(displayName: string): string {
    return `${displayName}#${randomBytes(2).toString('hex')}`;
  }

  async issue(args: { roomId: string; displayName: string; identity: string }): Promise<string> {
    const token = new AccessToken(this.apiKey, this.apiSecret, {
      identity: args.identity,
      name: args.displayName,
      ttl: 60 * 60 * 24, // 24h
    });
    token.addGrant({
      roomJoin: true,
      room: args.roomId,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
    return token.toJwt();
  }
}
