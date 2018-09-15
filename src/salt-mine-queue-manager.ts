import * as AWS from "aws-sdk";
import {Logger} from "@bitblit/ratchet/dist/common/logger";
import {SaltMineEntry} from "./salt-mine-entry";
import {SaltMineEntryBatch} from './salt-mine-entry-batch';

/**
 * Processor that ONLY puts items into the queue, does not perform any processing - this is
 * separate from the main SaltMine object because there are cases where a salt mine processor
 * depends on a class that then depends on saltmine to submit tasks, and the circular dependency
 * breaks IOC.  So in those cases one can just use this class which uses the type names of
 * the processors but not the processors themselves.
 */
export class SaltMineQueueManager
{
    public static SALT_MINE_START_MARKER ="__START_SALT_MINE";

    public constructor(private functionNames: string[],
                        private queueUrl : string,
                        private notificationArn : string,
                        private sqs: AWS.SQS = new AWS.SQS({apiVersion: '2012-11-05',region: 'us-east-1'}),
                        private sns : AWS.SNS = new AWS.SNS({apiVersion: '2012-11-05',region: 'us-east-1'})) {
        Logger.info("Creating SaltMineService with names %j", functionNames);
        if (!functionNames || functionNames.length==0) {
            throw "Cannot create with no functions";
        }
        if (!queueUrl) {
            throw "Queue url is required";
        }
        if (!notificationArn) {
            throw "Notification ARN is required";
        }
    }

    private validType(type:string) : boolean
    {
        return this.functionNames.indexOf(type)>-1;
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

    public takeQueueEntry(): Promise<SaltMineEntry> {
        let params = {
            MaxNumberOfMessages: 1,
            QueueUrl: this.queueUrl,
            VisibilityTimeout: 300,
            WaitTimeSeconds: 0
        };

        return this.sqs.receiveMessage(params).promise().then(
            res=>
            {
                let entry : SaltMineEntry = null;
                let handle : string | undefined = undefined;

                if (res.Messages && res.Messages.length==1)
                {
                    let body = res.Messages[0].Body;
                    if (body)
                    {
                        entry = JSON.parse(body) as SaltMineEntry;
                        handle = res.Messages[0].ReceiptHandle;
                    }
                }

                Logger.info("Entry was : %s", JSON.stringify(entry));

                if (handle)
                {
                    Logger.debug("Removing entry from work queue");
                    let delParams = {
                        QueueUrl: this.queueUrl,
                        ReceiptHandle: handle
                    };
                    return this.sqs.deleteMessage(delParams).promise().then(delResult=>{
                        Logger.debug("Delete succeeded");
                        return entry;
                    })
                        .catch(delErr=>{
                            Logger.warn("Delete failed - task will likely re-run.  Err was : %s",delErr);
                            return entry;
                        })
                }
                else
                {
                    return entry;
                }

            }
        ).catch(err=>{
            Logger.warn("Error reading queue : "+err);
            return null;
        })
    }

    public addEntryToQueue(entry: SaltMineEntry): Promise<any> {
        if (this.validEntry(entry))
        {
            let params = {
                DelaySeconds:0,
                MessageBody: JSON.stringify(entry),
                MessageGroupId: entry.type,
                QueueUrl: this.queueUrl
            };

            Logger.debug("Adding %s to queue", JSON.stringify(entry));
            return this.sqs.sendMessage(params).promise();
        }
        else
        {
            Logger.warn("Not adding invalid entry to queue : %s",JSON.stringify(entry));
            return Promise.resolve(null);
        }
    }

    public addEntriesToQueue(entries: SaltMineEntry[]): Promise<any[]> {
        const promises: Promise<any>[] = entries.map( e=> this.addEntryToQueue(e));
        return Promise.all(promises);
    }

    public processEntryBatch(batch: SaltMineEntryBatch) : Promise<boolean> {
        if (batch) {
            const submitPromises: Promise<any>[] = (batch.entries) ? batch.entries.map( e => this.addEntryToQueue(e)):[];
            return Promise.all(submitPromises).then(results => {
                Logger.info('Submitted %d items to queue', submitPromises.length);
                if (batch.startProcessingAfterSubmission) {
                    return this.fireStartProcessingRequest().then( startRes => {
                        Logger.info('Started processing');
                        return true;
                    });
                } else {
                    Logger.info('Did not start processing');
                    return true;
                }
            });
        } else {
            return Promise.resolve(false);
        }
    }

    public fireStartProcessingRequest() : Promise<any>
    {
        let request = {'saltMine':SaltMineQueueManager.SALT_MINE_START_MARKER, created: new Date().getTime()};

        let params = {
            Message: JSON.stringify(request),
            TopicArn: this.notificationArn
        };

        return this.sns.publish(params).promise();
    }


}
