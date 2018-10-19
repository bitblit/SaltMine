import {SaltMineEntry} from './salt-mine-entry';
import {SaltMineQueueManager} from './salt-mine-queue-manager';

// Not making this generic because you can't really do anything with the result anyway
export interface SaltMineProcessor {
    (event: SaltMineEntry, queueManager: SaltMineQueueManager): Promise<boolean>
}
