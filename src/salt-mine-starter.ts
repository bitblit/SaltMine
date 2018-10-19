import * as AWS from "aws-sdk";
import {Logger} from "@bitblit/ratchet/dist/common/logger";
import {SaltMineConfig} from './salt-mine-config';
import {SaltMineConstants} from './salt-mine-constants';

/**
 * We use a FIFO queue so that 2 different Lambdas don't both work on the same
 * thing at the same time.
 */
export class SaltMineStarter
{
    constructor(private config: SaltMineConfig) {
        Logger.info('Salt Mine starter with config %j', config);

        if (!config.sns) {
            Logger.debug('Creating default sns instance');
            this.config.sns = new AWS.SNS({apiVersion: '2012-11-05',region: 'us-east-1'});
        }
    }

    public async fireStartProcessingRequest() : Promise<string>
    {
        let params = {
            Message: SaltMineConstants.SALT_MINE_SNS_START_MARKER,
            TopicArn: this.config.notificationArn
        };

        const result: AWS.SNS.Types.PublishResponse = await this.config.sns.publish(params).promise();
        return result.MessageId;
    }

    public getConfig(): SaltMineConfig {
        return this.config;
    }

}
