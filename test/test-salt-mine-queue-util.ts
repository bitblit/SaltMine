import {expect} from 'chai';
import {SaltMineEntry} from '../src/salt-mine-entry';
import {Logger} from '@bitblit/ratchet/dist/common/logger';
import {SaltMineProcessor} from '../src/salt-mine-processor';
import {SaltMineConfig} from '../src/salt-mine-config';
import {SaltMineQueueUtil} from '../src/salt-mine-queue-util';
import * as AWS from 'aws-sdk';
import {GetQueueAttributesResult} from 'aws-sdk/clients/sqs';

describe('#createEntry', function () {
    this.timeout(30000);

    xit('Should return queue attributes', async () => {

        const cfg: SaltMineConfig = {
            sqs: new AWS.SQS({ apiVersion: '2012-11-05', region: 'us-east-1' }),
            sns: new AWS.SNS({ apiVersion: '2012-11-05', region: 'us-east-1' }),
            queueUrl: 'https://sqs.us-east-1.amazonaws.com/ACCOUNT_NUMBER/QUEUE_NAME.fifo',
            notificationArn:'arn:aws:sns:us-east-1:ACCOUNT_NUMBER:TOPIC_NAME',
            validTypes: ['a','b']
        } as SaltMineConfig;

        const queueAttr: GetQueueAttributesResult = await SaltMineQueueUtil.fetchCurrentQueueAttributes(cfg);
        const msgCount: number = await SaltMineQueueUtil.fetchQueueApproximateNumberOfMessages(cfg);
        Logger.info('Got : %j', queueAttr);
        Logger.info('Msg: %d', msgCount);
        expect(queueAttr).to.not.be.null;
    });

    it('should make sure a processor exists', async () => {
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
