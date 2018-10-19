import {SaltMineEntry} from './salt-mine-entry';

// Not making this generic because you can't really do anything with the result anyway
export interface SaltMineProcessor {
    (event: SaltMineEntry): Promise<boolean>
}
