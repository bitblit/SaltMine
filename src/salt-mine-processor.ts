import {SaltMineEntry} from './salt-mine-entry';
import {SaltMineConfig} from './salt-mine-config';

// Not making this generic because you can't really do anything with the result anyway
export interface SaltMineProcessor {
    (event: SaltMineEntry, cfg: SaltMineConfig): Promise<boolean>
}
