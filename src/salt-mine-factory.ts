import * as AWS from "aws-sdk";
import {Logger} from "@bitblit/ratchet/dist/common/logger";
import {SaltMineConfig} from './salt-mine-config';
import {SaltMineStarter} from './salt-mine-starter';
import {SaltMineHandler} from './salt-mine-handler';
import {SaltMineQueueManager} from './salt-mine-queue-manager';
import {SaltMine} from './salt-mine';

export class SaltMineFactory
{
    private constructor() {}

    public static createSaltMine(config: SaltMineConfig) {
        Logger.info('Starting Salt Mine factory');

        if (!config) {
            throw new Error('Cannot create salt mine with null config');
        }
        if (!config.processors || config.processors.size === 0) {
            throw new Error('Cannot create salt mine with no processors');
        }
        if (!config.queueUrl || !config.notificationArn) {
            throw new Error('Cannot create salt mine without queueUrl or notificationArn');
        }
        if (!config.sqs) {
            Logger.debug('Creating default sqs instance');
            config.sqs = new AWS.SQS({apiVersion: '2012-11-05', region: 'us-east-1'});
        }
        if (!config.sns) {
            Logger.debug('Creating default sns instance');
            config.sns = new AWS.SNS({apiVersion: '2012-11-05',region: 'us-east-1'});
        }

        const starter: SaltMineStarter = new SaltMineStarter(config);
        const queueManager: SaltMineQueueManager = new SaltMineQueueManager(starter);

        const rval: SaltMine = {
            starter: starter,
            queueManager: queueManager,
            handler: new SaltMineHandler(starter,queueManager)
        } as SaltMine;

        return rval;
    }

}
