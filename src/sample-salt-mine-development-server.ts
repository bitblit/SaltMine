/**
 * This is an example of how to setup a local server for testing.  Replace the createRouterConfig function
 * with your own.
 */
import { Logger } from '@bitblit/ratchet/dist/common/logger';
import { SaltMineProcessor } from './salt-mine-processor';
import { SaltMineEntry } from './salt-mine-entry';
import { SaltMineConfig } from './salt-mine-config';
import { PromiseRatchet } from '@bitblit/ratchet/dist/common/promise-ratchet';
import { SaltMineDevelopmentServer } from './salt-mine-development-server';

Logger.setLevelByName('debug');

const sampleProcessor: SaltMineProcessor = async (event: SaltMineEntry, cfg: SaltMineConfig) => {
  const delayMS: number = Math.floor(Math.random() * 1500);
  Logger.info('Running sample processor for %d', delayMS);
  await PromiseRatchet.wait(delayMS);
  Logger.info('Sample processor complete');
};

const processorMap: Map<string, SaltMineProcessor> = new Map<string, SaltMineProcessor>();
processorMap.set('SAMPLE', (evt, cfg) => sampleProcessor(evt, cfg));

const testServer: SaltMineDevelopmentServer = new SaltMineDevelopmentServer(processorMap);

testServer
  .runServer()
  .then((res) => {
    Logger.info('Got res server');
    process.exit(0);
  })
  .catch((err) => {
    Logger.error('Error: %s', err, err);
    process.exit(1);
  });
