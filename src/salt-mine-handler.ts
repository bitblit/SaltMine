import * as AWS from "aws-sdk";
import {Logger} from "@bitblit/ratchet/dist/common/logger";
import {SaltMineEntry} from "./salt-mine-entry";
import {Context, SNSEvent} from 'aws-lambda';
import {LambdaEventDetector} from '@bitblit/ratchet/dist/aws/lambda-event-detector';
import {DurationRatchet} from '@bitblit/ratchet/dist/common/duration-ratchet';
import {SaltMineConstants} from './salt-mine-constants';
import {SaltMineStarter} from './salt-mine-starter';
import {SaltMineProcessor} from './salt-mine-processor';

/**
 * We use a FIFO queue so that 2 different Lambdas don't both work on the same
 * thing at the same time.
 */
export class SaltMineHandler
{

    constructor(private starter: SaltMineStarter) {
        Logger.info('Starting Salt Mine processor');
    }

    public isSaltMineStartSnsEvent(event: any): boolean {
        let rval: boolean = false;
        if (event) {
            if (LambdaEventDetector.isSingleSnsEvent(event)) {
                const cast: SNSEvent = event as SNSEvent;
                rval = cast.Records[0].Sns.Message === SaltMineConstants.SALT_MINE_SNS_START_MARKER;
            }
        }
        return rval;
    }


    public isSaltMineSqsMessage(message: AWS.SQS.Types.ReceiveMessageResult): boolean {
        let rval: boolean = false;
        if (message && message.Messages && message.Messages.length > 0) {
            const missingFlagField: any = message.Messages.find( se => {
               try {
                   const parsed: any = JSON.parse(se.Body);
                   return !parsed[SaltMineConstants.SALT_MINE_SQS_TYPE_FIELD];
               } catch (err) {
                   Logger.warn('Failed to parse message : %j %s', se, err);
                   return true;
               }
            });
            if (missingFlagField) {
                Logger.silly('Found at least one message missing a type field');
            } else {
                rval = true;
            }
        }
        return rval;
    }

    // All it does is trigger a pull of the SQS queue
    public async processSaltMineSNSEvent(event: any, context: Context): Promise<boolean> {
        let rval: boolean = false;
        if (!this.isSaltMineStartSnsEvent(event)) {
            Logger.warn('Tried to process non-salt mine start event : %j returning false', event);
            rval = false;
        } else {
            const results:boolean[] = await this.takeAndProcessSingleSaltMineSQSMessage();
            rval = true;
            results.forEach( b => rval = rval && b); // True if all succeed or empty

            if (this.starter.getConfig().chainRun && this.starter.getConfig().chainRunMinRemainTimeInSeconds > 0) {
                if (results.length == 0) {
                    Logger.info('Salt mine queue now empty - stopping');
                } else if (context.getRemainingTimeInMillis()>(this.starter.getConfig().chainRunMinRemainTimeInSeconds*1000)) {
                    Logger.info("Still have more than 90 seconds remaining (%d ms) - running again", context.getRemainingTimeInMillis());
                    rval = rval && await this.processSaltMineSNSEvent(event, context);
                } else {
                    Logger.info("Less than 90 seconds remaining but still have work to do - refiring");
                    const refireResult: string = await this.starter.fireStartProcessingRequest();
                }
            }

        }
        return rval;
    }

    private async takeEntryFromSaltMineQueue(): Promise<SaltMineEntry[]> {
        let params = {
            MaxNumberOfMessages: 1,
            QueueUrl: this.starter.getConfig().queueUrl,
            VisibilityTimeout: 300,
            WaitTimeSeconds: 0
        };

        const message: AWS.SQS.ReceiveMessageResult = await this.starter.getConfig().sqs.receiveMessage(params).promise();
        const rval: SaltMineEntry[] = [];
        if (message && message.Messages) {
            for (let i=0; i < message.Messages.length; i++) {
                const m: AWS.SQS.Message = message.Messages[i];
                try {
                    const parsedBody: SaltMineEntry = JSON.parse(m.Body) as SaltMineEntry;
                    if (!parsedBody.type) {
                        Logger.warn('Dropping invalid salt mine entry : %j', parsedBody);
                    } else {
                        rval.push(parsedBody);
                    }

                    Logger.debug('Removing message from queue');
                    let delParams = {
                        QueueUrl: this.starter.getConfig().queueUrl,
                        ReceiptHandle: m.ReceiptHandle
                    };
                    const delResult: any = await this.starter.getConfig().sqs.deleteMessage(delParams).promise();
                } catch (err) {
                    Logger.warn('Error parsing message, dropping : %j', m);
                }
            }
        } else {
            Logger.warn('Weird - received no message or empty message');
        }

        return rval;
    }

    private async takeAndProcessSingleSaltMineSQSMessage(): Promise<boolean[]> {
        const rval: boolean [] = [];
        const entries: SaltMineEntry[] = await this.takeEntryFromSaltMineQueue();

        // Do them one at a time since SaltMine is meant to throttle.  Also, it should really
        // only be one per pull anyway
        for (let i=0 ; i < entries.length ; i++) {
            const e: SaltMineEntry = entries[i];
            try {
                const processor: SaltMineProcessor = this.starter.getConfig().processors.get(e.type);
                if (!processor) {
                    Logger.warn('Found no processor for salt mine entry : %j (returning false)', e);
                    rval.push(false);
                } else {
                    const start: number = new Date().getTime();
                    rval.push(await processor(e));
                    const end: number = new Date().getTime();
                    Logger.info('Processed %j in %s', e, DurationRatchet.formatMsDuration(end-start, true));
                }
            } catch (err) {
                Logger.error('Failed while processing salt mine entry (returning false): %j : %s', e, err, err);
                rval.push(false);
            }
        }

        // If we processed, immediately refire
        if (entries.length > 0) {
            const refireResult: string = await this.starter.fireStartProcessingRequest();
        }

        return rval;
    }




}
