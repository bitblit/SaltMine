import * as AWS from 'aws-sdk';
import {Logger} from '@bitblit/ratchet/dist/common/logger';
import {SaltMineEntry} from './salt-mine-entry';
import {SaltMineConstants} from './salt-mine-constants';
import {SaltMineConfig} from './salt-mine-config';
import {GetQueueAttributesRequest, GetQueueAttributesResult} from 'aws-sdk/clients/sqs';
import {NumberRatchet} from '@bitblit/ratchet/dist/common/number-ratchet';

/**
 * This class just validates and puts items into the salt mine queue - it does not do
 * any processing.  It also does NOT start queue processing.  This is to prevent circular
 * dependencies - the SaltMineConfig holds references to all the processor functions, but
 * none of the processor functions hold references back, so they can make calls to the
 * adder or starter if necessary.
 */
export class SaltMineQueueUtil {
    private constructor() {
    }

    public static validType(cfg: SaltMineConfig, type: string): boolean {
        return cfg.validTypes.indexOf(type) > -1;
    }

    public static createEntry(cfg: SaltMineConfig, type: string, data: any = {}, metadata: any = {}): SaltMineEntry {
        if (!SaltMineQueueUtil.validType(cfg, type)) {
            Logger.warn('Tried to create invalid type : ' + type);
            return null;
        }

        return {
            created: new Date().getTime(),
            type: type,
            data: data,
            metadata: metadata

        } as SaltMineEntry;
    }

    public static validEntry(cfg: SaltMineConfig, entry: SaltMineEntry): boolean {
        return (entry != null && entry.type != null && SaltMineQueueUtil.validType(cfg, entry.type));
    }

    public static async addEntryToQueue(cfg: SaltMineConfig, entry: SaltMineEntry, fireStartMessage: boolean = true): Promise<string> {
        if (SaltMineQueueUtil.validEntry(cfg, entry)) {
            let params = {
                DelaySeconds: 0,
                MessageBody: JSON.stringify(entry),
                MessageGroupId: entry.type,
                QueueUrl: cfg.queueUrl
            };

            Logger.debug('Adding %j to queue', entry);
            const result: AWS.SQS.SendMessageResult = await cfg.sqs.sendMessage(params).promise();

            if (fireStartMessage) {
                const fireResult: string = await SaltMineQueueUtil.fireStartProcessingRequest(cfg);
            }

            return result.MessageId;
        }
        else {
            Logger.warn('Not adding invalid entry to queue : %j', entry);
            return null;
        }
    }

    public static async addEntriesToQueue(cfg: SaltMineConfig, entries: SaltMineEntry[], fireStartMessage: boolean): Promise<string[]> {
        // Only fire one start message at the end
        const promises: Promise<string>[] = entries.map(e => this.addEntryToQueue(cfg, e, false));
        const results: string[] = await Promise.all(promises);
        if (fireStartMessage) {
            const fireResult: string = await SaltMineQueueUtil.fireStartProcessingRequest(cfg);
        }
        return results;
    }


    public static async fireStartProcessingRequest(cfg: SaltMineConfig): Promise<string> {
        let params = {
            Message: SaltMineConstants.SALT_MINE_SNS_START_MARKER,
            TopicArn: cfg.notificationArn
        };

        const result: AWS.SNS.Types.PublishResponse = await cfg.sns.publish(params).promise();
        return result.MessageId;
    }

    public static async fetchCurrentQueueAttributes(cfg: SaltMineConfig): Promise<GetQueueAttributesResult> {
        const req: GetQueueAttributesRequest = {
            AttributeNames: ['All'],
            QueueUrl: cfg.queueUrl
        };

        const res: GetQueueAttributesResult = await cfg.sqs.getQueueAttributes(req).promise();
        return res;
    }


    public static async fetchQueueApproximateNumberOfMessages(cfg: SaltMineConfig): Promise<number> {
        const all: GetQueueAttributesResult = await this.fetchCurrentQueueAttributes(cfg);
        const rval: number = NumberRatchet.safeNumber(all.Attributes['ApproximateNumberOfMessages']);
        return rval;
    }

}
