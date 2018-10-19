import * as AWS from "aws-sdk";
import {Logger} from "@bitblit/ratchet/dist/common/logger";
import {SaltMineEntry} from "./salt-mine-entry";
import {SaltMineStarter} from './salt-mine-starter';

/**
 * This class just validates and puts items into the salt mine queue - it does not do
 * any processing.  It also does NOT start queue processing.  This is to prevent circular
 * dependencies - the SaltMineConfig holds references to all the processor functions, but
 * none of the processor functions hold references back, so they can make calls to the
 * adder or starter if necessary.
 */
export class SaltMineQueueManager
{

    constructor(private starter: SaltMineStarter) {
        Logger.info('Starting Salt Mine queue manager');
    }

    private validType(type:string) : boolean
    {
        return !!this.starter.getConfig().processors.get(type);
    }

    public createEntry(type: string, data: any = {}, metadata: any = {}) : SaltMineEntry
    {
        if (!this.validType(type))
        {
            Logger.warn("Tried to create invalid type : "+type);
            return null;
        }

        return {
            created: new Date().getTime(),
            type: type,
            data: data,
            metadata: metadata

        } as SaltMineEntry;
    }

    public validEntry(entry:SaltMineEntry) : boolean {
        return (entry!=null && entry.type!=null && this.validType(entry.type));
    }

    public async addEntryToQueue(entry: SaltMineEntry, fireStartMessage: boolean = true): Promise<string> {
        if (this.validEntry(entry))
        {
            let params = {
                DelaySeconds:0,
                MessageBody: JSON.stringify(entry),
                MessageGroupId: entry.type,
                QueueUrl: this.starter.getConfig().queueUrl
            };

            Logger.debug("Adding %j to queue", entry);
            const result: AWS.SQS.SendMessageResult = await this.starter.getConfig().sqs.sendMessage(params).promise();

            if (fireStartMessage) {
                const fireResult: string = await this.starter.fireStartProcessingRequest();
            }

            return result.MessageId;
        }
        else
        {
            Logger.warn("Not adding invalid entry to queue : %j", entry);
            return null;
        }
    }

    public async addEntriesToQueue(entries: SaltMineEntry[], fireStartMessage: boolean): Promise<string[]> {
        // Only fire one start message at the end
        const promises: Promise<string>[] = entries.map( e=> this.addEntryToQueue(e, false));
        const results: string[] = await Promise.all(promises);
        if (fireStartMessage) {
            const fireResult: string = await this.starter.fireStartProcessingRequest();
        }
        return results;
    }


}
