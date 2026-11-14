// The LAN reader is served over plain HTTP, so APIs limited to secure contexts
// are missing there; fill in the ones the upstream reader relies on.
import { ensureClipboard } from './clipboard.ts';
import { ensureRandomUUID } from './random-uuid.ts';

ensureRandomUUID(crypto);
ensureClipboard(navigator, document);
