import { expect } from 'chai';
import {SaltMineEntry} from "../src/salt-mine-entry";
import {Logger} from '@bitblit/ratchet/dist/common/logger';
import {SaltMineConfig} from '../src/salt-mine-config';
import {SaltMineFactory} from '../src/salt-mine-factory';
import {SaltMineProcessor} from '../src/salt-mine-processor';
import {SaltMine} from '../src/salt-mine';

describe('#createEntry', function() {
    it('should make sure a processor exists', function() {
        const processors: Map<string, SaltMineProcessor> = new Map<string, SaltMineProcessor>();
        processors.set('a', (entry: SaltMineEntry) : Promise<boolean> => { Logger.info('Called a'); return Promise.resolve(true);});
        processors.set('b', (entry: SaltMineEntry) : Promise<boolean> => {  Logger.info('Called b'); return Promise.resolve(true);});


        const cfg : SaltMineConfig = {
            processors: processors,
            queueUrl: 'q',
            notificationArn: 'n'

        } as SaltMineConfig;

        const mine: SaltMine = SaltMineFactory.createSaltMine(cfg);

        let resultA = mine.queueManager.createEntry('a',{},{});
        let resultC = mine.queueManager.createEntry('c',{},{});
        expect(resultA.type).to.equal('a');
        expect(resultC).to.equal(null);
    });

});