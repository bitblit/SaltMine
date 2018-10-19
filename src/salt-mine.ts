import {SaltMineStarter} from './salt-mine-starter';
import {SaltMineHandler} from './salt-mine-handler';
import {SaltMineQueueManager} from './salt-mine-queue-manager';

export interface SaltMine
{
    starter: SaltMineStarter;
    handler: SaltMineHandler;
    queueManager: SaltMineQueueManager;
}
