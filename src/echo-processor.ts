import {SaltMineEntry} from './salt-mine-entry';
import {Logger} from '@bitblit/ratchet/dist/common/logger';

export class EchoProcessor {

    public async handler(entry: SaltMineEntry): Promise<boolean> {
        Logger.info('Echo processing : %j', entry);
        return true;
    }
}

