import {expect} from 'chai';
import {SaltMineEntry} from '../src/salt-mine-entry';
import {Logger} from '@bitblit/ratchet/dist/common/logger';
import {SaltMineProcessor} from '../src/salt-mine-processor';
import {SaltMineConfig} from '../src/salt-mine-config';
import {SaltMineQueueUtil} from '../src/salt-mine-queue-util';

describe('#createEntry', function () {
    it('should make sure a processor exists', function () {
        const processors: Map<string, SaltMineProcessor> = new Map<string, SaltMineProcessor>();
        processors.set('a', async (entry: SaltMineEntry): Promise<void> => {
            Logger.info('Called a');
        });
        processors.set('b', async (entry: SaltMineEntry): Promise<void> => {
            Logger.info('Called b');
        });


        const cfg: SaltMineConfig = {
            queueUrl: 'q',
            notificationArn: 'n',
            validTypes: ['a', 'b']
        } as SaltMineConfig;

        //const mine: SaltMineHandler = new SaltMineHandler(cfg, processors);

        let resultA = SaltMineQueueUtil.createEntry(cfg, 'a', {}, {});
        let resultC = SaltMineQueueUtil.createEntry(cfg, 'c', {}, {});
        expect(resultA.type).to.equal('a');
        expect(resultC).to.equal(null);
    });

});